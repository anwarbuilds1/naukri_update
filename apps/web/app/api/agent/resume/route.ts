import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

const AGENT_URL = process.env['AGENT_URL'] ?? 'http://127.0.0.1:7842';
const AGENT_SECRET = process.env['AGENT_SECRET'] ?? '';

/**
 * POST /api/agent/resume/upload
 *
 * Accepts a PDF resume upload and streams it to the local agent.
 *
 * RATIONALE: The resume must be stored on the same machine running Chrome.
 * Playwright's fileInput.setInputFiles() requires a local filesystem path.
 * Therefore, resume files are NOT stored in Supabase Storage.
 *
 * The agent stores the file in its local <configDir>/resume/ directory.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const contentType = req.headers.get('content-type') ?? '';
  const isMultipart = contentType.startsWith('multipart/form-data');
  const isOctetStream = contentType.startsWith('application/octet-stream');

  if (!isMultipart && !isOctetStream) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INVALID_CONTENT_TYPE',
          message: 'Expected multipart/form-data or application/octet-stream.',
        },
      },
      { status: 400 }
    );
  }

  try {
    const res = await fetch(`${AGENT_URL}/api/agent/resume`, {
      method: 'POST',
      headers: {
        'Content-Type': contentType,
        'X-Agent-Secret': AGENT_SECRET,
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      body: req.body as any,
      signal: AbortSignal.timeout(30_000),
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
