import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const AGENT_URL = process.env['AGENT_URL'] ?? 'http://127.0.0.1:7842';
const AGENT_SECRET = process.env['AGENT_SECRET'] ?? '';

/**
 * Credentials payload schema.
 *
 * SECURITY DESIGN:
 * - naukriEmail is non-sensitive and is also written to Supabase agent_config.
 * - naukriPassword is sensitive. It flows:
 *     Browser → HTTPS → Next.js API (server) → HTTP localhost → Agent
 *   The password is NEVER stored in Supabase and NEVER logged here.
 *   The agent stores it in .credentials.enc (AES-256-GCM, machine-bound key).
 *
 * TODO (Phase 2): evaluate end-to-end encryption for the password in transit.
 */
const CredentialsSchema = z.object({
  naukriEmail: z.string().email({ message: 'Valid email is required.' }),
  naukriPassword: z.string().min(1, { message: 'Password is required.' }),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = await req.json().catch(() => null);
  const parsed = CredentialsSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid credentials payload.',
          details: parsed.error.flatten(),
        },
      },
      { status: 400 }
    );
  }

  try {
    // Forward the full body (including password) to the agent.
    // Password is NOT extracted, logged, or stored here.
    const res = await fetch(`${AGENT_URL}/api/agent/credentials`, {
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
        error: { code: 'AGENT_UNREACHABLE', message: 'Agent is not running.' },
      },
      { status: 503 }
    );
  }
}
