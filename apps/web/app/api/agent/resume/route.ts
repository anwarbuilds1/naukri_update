import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { agentClient } from '@/lib/agent-client';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const MAX_PDF_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * POST /api/agent/resume
 *
 * Validates and streams resume PDF directly to local agent.
 * NEVER writes to Supabase Storage (Playwright requires local filesystem access).
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

  let arrayBuffer: ArrayBuffer;
  let filename = 'resume.pdf';

  try {
    const contentType = req.headers.get('content-type') ?? '';

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file');

      if (!file || typeof file === 'string') {
        return NextResponse.json(
          {
            success: false,
            error: { code: 'VALIDATION_ERROR', message: 'No file provided in form-data field "file".' },
          },
          { status: 400 }
        );
      }

      filename = (file as File).name || 'resume.pdf';
      arrayBuffer = await (file as File).arrayBuffer();
    } else {
      // Raw octet-stream / application/pdf
      arrayBuffer = await req.arrayBuffer();
      const headerFilename = req.headers.get('x-filename');
      if (headerFilename) {
        filename = decodeURIComponent(headerFilename);
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { success: false, error: { code: 'BAD_REQUEST', message: msg } },
      { status: 400 }
    );
  }

  const buffer = Buffer.from(arrayBuffer);

  // Validate size
  if (buffer.length === 0) {
    return NextResponse.json(
      { success: false, error: { code: 'VALIDATION_ERROR', message: 'Uploaded file is empty.' } },
      { status: 400 }
    );
  }

  if (buffer.length > MAX_PDF_SIZE_BYTES) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'FILE_TOO_LARGE',
          message: `File exceeds maximum allowed size of 5 MB (size: ${Math.round(buffer.length / 1024)} KB).`,
        },
      },
      { status: 413 }
    );
  }

  // Validate PDF extension
  if (!filename.toLowerCase().endsWith('.pdf')) {
    return NextResponse.json(
      { success: false, error: { code: 'INVALID_FILE_TYPE', message: 'File must be a PDF (.pdf).' } },
      { status: 400 }
    );
  }

  // Validate %PDF magic bytes
  const header = buffer.subarray(0, 4).toString('utf8');
  if (header !== '%PDF') {
    return NextResponse.json(
      { success: false, error: { code: 'INVALID_FILE_CONTENT', message: 'File is not a valid PDF document.' } },
      { status: 400 }
    );
  }

  // Forward to local agent
  const agentRes = await agentClient.sendResume(buffer, filename);
  return NextResponse.json(agentRes, {
    status: agentRes.success ? 200 : 503,
  });
}
