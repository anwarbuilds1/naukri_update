import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import {
  AgentCommandSchema,
  isValidCommandTransition,
  type AgentCommand,
  type CommandStatus,
} from '@naukri-update/shared';
import { agentClient } from '@/lib/agent-client';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/**
 * POST /api/agent/command
 *
 * Enforces:
 * 1. Supabase session authentication.
 * 2. Zod schema validation.
 * 3. Atomic database idempotency on request_id with state machine transition enforcement.
 * 4. Dispatch to local agent with status updates ('queued' -> 'dispatched' or 'failed').
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      {
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required.' },
      },
      { status: 401 }
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: { code: 'BAD_REQUEST', message: 'Invalid JSON payload.' },
      },
      { status: 400 }
    );
  }

  const parseResult = AgentCommandSchema.safeParse(rawBody);
  if (!parseResult.success) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid command payload.',
          details: parseResult.error.flatten(),
        },
      },
      { status: 400 }
    );
  }

  const command = parseResult.data as AgentCommand;

  // 1. Atomic command registration using unique primary key constraint (request_id)
  let isNew = false;
  try {
    const { error: insertErr } = await (supabase.from('agent_commands') as any).insert({
      request_id: command.requestId,
      user_id: user.id,
      command_type: command.type,
      status: 'queued',
    });

    if (!insertErr) {
      isNew = true;
    } else {
      // Conflict / duplicate request_id detected.
      // Retrieve existing command to inspect its current state.
      const { data: existing } = await (supabase.from('agent_commands') as any)
        .select('status, error_message')
        .eq('request_id', command.requestId)
        .maybeSingle();

      const existingStatus = (existing as any)?.status as CommandStatus | undefined;

      // Never re-dispatch an existing command with the same requestId.
      // Return its current state to the caller.
      return NextResponse.json(
        {
          success: true,
          data: {
            queued: false,
            duplicate: true,
            status: existingStatus ?? 'unknown',
            requestId: command.requestId,
            message: `Command already registered with status '${existingStatus ?? 'unknown'}'. Use a new requestId for a new execution.`,
          },
        },
        { status: 200 }
      );
    }
  } catch (err: unknown) {
    console.warn('[api/agent/command] Error inserting agent_commands record:', err);
  }

  // 2. Dispatch to local agent
  const agentRes = await agentClient.sendCommand(command);

  // 3. Atomic transition: queued -> dispatched (or queued -> failed if dispatch fails)
  // Verify previous state is 'queued' using conditional WHERE clause (.eq('status', 'queued'))
  try {
    if (agentRes.success) {
      if (isNew) {
        await (supabase.from('agent_commands') as any)
          .update({ status: 'dispatched' })
          .eq('request_id', command.requestId)
          .eq('status', 'queued'); // Atomic transition verification
      }
      return NextResponse.json(agentRes, { status: 202 });
    } else {
      if (isNew) {
        await (supabase.from('agent_commands') as any)
          .update({
            status: 'failed',
            error_message: agentRes.error?.message ?? 'Dispatch to local agent failed',
          })
          .eq('request_id', command.requestId)
          .eq('status', 'queued'); // Atomic transition verification
      }

      const status = agentRes.error?.code === 'BUSY' ? 409 : 503;
      return NextResponse.json(agentRes, { status });
    }
  } catch {
    return NextResponse.json(agentRes, { status: agentRes.success ? 202 : 503 });
  }
}
