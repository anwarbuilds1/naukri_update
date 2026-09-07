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

  // 1. Atomic command registration and idempotency check
  let currentStatus: CommandStatus = 'queued';
  try {
    const { data: existing } = await (supabase.from('agent_commands') as any)
      .select('status')
      .eq('request_id', command.requestId)
      .maybeSingle();

    if (existing) {
      currentStatus = (existing as any).status as CommandStatus;

      // Duplicate detection: if already dispatched, running, or completed
      if (['dispatched', 'running', 'succeeded'].includes(currentStatus)) {
        return NextResponse.json(
          {
            success: true,
            data: {
              queued: false,
              duplicate: true,
              status: currentStatus,
              requestId: command.requestId,
            },
          },
          { status: 200 }
        );
      }

      // If existing command is in 'failed', validate transition back to 'queued' for retry
      if (!isValidCommandTransition(currentStatus, 'queued')) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'INVALID_TRANSITION',
              message: `Cannot transition command from '${currentStatus}' to 'queued'`,
            },
          },
          { status: 409 }
        );
      }

      // Update back to queued for retry
      await (supabase.from('agent_commands') as any)
        .update({ status: 'queued', error_message: null })
        .eq('request_id', command.requestId);
    } else {
      // New command: insert atomic record
      const { error: insertErr } = await (supabase.from('agent_commands') as any).insert({
        request_id: command.requestId,
        user_id: user.id,
        command_type: command.type,
        status: 'queued',
      });

      if (insertErr) {
        // Race condition handled by primary key constraint
        return NextResponse.json(
          {
            success: true,
            data: {
              queued: false,
              duplicate: true,
              requestId: command.requestId,
            },
          },
          { status: 200 }
        );
      }
    }
  } catch (err: unknown) {
    console.warn('[api/agent/command] Could not query/insert agent_commands in DB:', err);
  }

  // 2. Dispatch to local agent
  const agentRes = await agentClient.sendCommand(command);

  // 3. Update command state based on dispatch result
  try {
    if (agentRes.success) {
      if (isValidCommandTransition('queued', 'dispatched')) {
        await (supabase.from('agent_commands') as any)
          .update({ status: 'dispatched' })
          .eq('request_id', command.requestId);
      }
      return NextResponse.json(agentRes, { status: 202 });
    } else {
      if (isValidCommandTransition('queued', 'failed')) {
        await (supabase.from('agent_commands') as any)
          .update({
            status: 'failed',
            error_message: agentRes.error?.message ?? 'Dispatch failed',
          })
          .eq('request_id', command.requestId);
      }
      return NextResponse.json(agentRes, { status: 503 });
    }
  } catch {
    return NextResponse.json(agentRes, { status: agentRes.success ? 202 : 503 });
  }
}
