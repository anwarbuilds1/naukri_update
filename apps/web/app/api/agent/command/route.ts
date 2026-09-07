import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { AgentCommandSchema } from '@naukri-update/shared';

const AGENT_URL = process.env['AGENT_URL'] ?? 'http://127.0.0.1:7842';
const AGENT_SECRET = process.env['AGENT_SECRET'] ?? '';

/**
 * POST /api/agent/command
 *
 * Validates the command payload and forwards it to the local agent.
 * Commands are fire-and-forget — poll /api/agent/status to observe state.
 *
 * See docs/agent-api.md for supported command types.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = await req.json().catch(() => null);
  const parsed = AgentCommandSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid command payload.',
          details: parsed.error.flatten(),
        },
      },
      { status: 400 }
    );
  }

  try {
    const res = await fetch(`${AGENT_URL}/api/agent/command`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Agent-Secret': AGENT_SECRET,
      },
      body: JSON.stringify(parsed.data),
      signal: AbortSignal.timeout(5000),
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'AGENT_UNREACHABLE',
          message: 'Agent is not running or unreachable.',
        },
      },
      { status: 503 }
    );
  }
}
