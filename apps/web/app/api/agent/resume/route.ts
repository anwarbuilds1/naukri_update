import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import * as crypto from 'crypto';
import type { ResumeInfo } from '@naukri-update/shared';
import { agentClient } from '@/lib/agent-client';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const MAX_PDF_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * POST /api/agent/resume
 *
 * Uploads authoritative resume PDF to Supabase Storage ('resumes' bucket),
 * updates agent_config metadata & SHA-256 hash, and notifies local Agent to sync cache.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'SUPABASE_UNAVAILABLE',
          message: 'Supabase control plane is unconfigured. Resume upload requires Supabase authentication.',
        },
      },
      { status: 503 }
    );
  }

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

  if (!filename.toLowerCase().endsWith('.pdf')) {
    return NextResponse.json(
      { success: false, error: { code: 'INVALID_FILE_TYPE', message: 'File must be a PDF (.pdf).' } },
      { status: 400 }
    );
  }

  const header = buffer.subarray(0, 4).toString('utf8');
  if (header !== '%PDF') {
    return NextResponse.json(
      { success: false, error: { code: 'INVALID_FILE_CONTENT', message: 'File is not a valid PDF document.' } },
      { status: 400 }
    );
  }

  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  const storagePath = `resumes/${user.id}/resume.pdf`;
  const objectKey = `${user.id}/resume.pdf`;

  // 1. Upload to Supabase Storage
  const { error: uploadError } = await supabase.storage
    .from('resumes')
    .upload(objectKey, buffer, {
      contentType: 'application/pdf',
      upsert: true,
    });

  if (uploadError) {
    console.error('[api/agent/resume] Supabase storage upload error:', uploadError);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'STORAGE_ERROR',
          message: `Failed to store resume in Supabase Storage: ${uploadError.message}`,
        },
      },
      { status: 500 }
    );
  }

  // 2. Update agent_config row with metadata and SHA-256 hash
  const nowIso = new Date().toISOString();
  const { error: dbError } = await (supabase.from('agent_config') as any)
    .update({
      resume_filename: filename,
      resume_storage_path: storagePath,
      resume_size_bytes: buffer.length,
      resume_updated_at: nowIso,
      resume_sha256: sha256,
    })
    .eq('user_id', user.id);

  if (dbError) {
    console.error('[api/agent/resume] Database metadata update error:', dbError);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'DB_ERROR',
          message: `Failed to update resume metadata: ${dbError.message}`,
        },
      },
      { status: 500 }
    );
  }

  // 3. Best-effort push notification to local agent to sync cache
  try {
    await agentClient.sendResume(buffer, filename);
  } catch {
    // Agent sync will occur on next self-reconciliation loop
  }

  const responseData: ResumeInfo = {
    exists: true,
    filename,
    sizeBytes: buffer.length,
    lastModified: nowIso,
    sha256,
    storagePath,
    cloudConfigured: true,
    syncStatus: 'synced',
  };

  return NextResponse.json({ success: true, data: responseData }, { status: 200 });
}

/**
 * GET /api/agent/resume
 *
 * Retrieves current active resume metadata from Supabase Storage / DB and compares with local agent cache.
 */
export async function GET(): Promise<NextResponse> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'SUPABASE_UNAVAILABLE',
          message: 'Supabase control plane is unconfigured. Resume management requires Supabase authentication.',
        },
      },
      { status: 503 }
    );
  }

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

  // Query agent_config for authoritative cloud metadata
  const { data: row } = await (supabase.from('agent_config') as any)
    .select('resume_filename, resume_storage_path, resume_size_bytes, resume_updated_at, resume_sha256')
    .eq('user_id', user.id)
    .maybeSingle();

  const configRow = row as any;
  const hasCloudResume = Boolean(configRow?.resume_storage_path);

  if (!hasCloudResume) {
    const resumeInfo: ResumeInfo = {
      exists: false,
      cloudConfigured: false,
      syncStatus: 'missing',
    };
    return NextResponse.json({ success: true, data: resumeInfo });
  }

  // Fetch local agent cache info if agent is online
  let agentResumeInfo: ResumeInfo | null = null;
  try {
    const agentRes = await agentClient.getResumeInfo();
    if (agentRes.success && agentRes.data) {
      agentResumeInfo = agentRes.data;
    }
  } catch {
    // Agent offline or unreachable
  }

  let syncStatus: ResumeInfo['syncStatus'] = 'cloud_only';
  if (agentResumeInfo?.exists) {
    if (agentResumeInfo.sha256 && configRow.resume_sha256 && agentResumeInfo.sha256 === configRow.resume_sha256) {
      syncStatus = 'synced';
    } else {
      syncStatus = 'stale';
    }
  }

  const resumeInfo: ResumeInfo = {
    exists: true,
    filename: configRow.resume_filename ?? 'resume.pdf',
    sizeBytes: configRow.resume_size_bytes ?? undefined,
    lastModified: configRow.resume_updated_at ?? undefined,
    sha256: configRow.resume_sha256 ?? undefined,
    storagePath: configRow.resume_storage_path ?? undefined,
    cloudConfigured: true,
    syncStatus,
  };

  return NextResponse.json({ success: true, data: resumeInfo });
}

/**
 * DELETE /api/agent/resume
 *
 * Deletes authoritative resume PDF from Supabase Storage, clears DB metadata, and clears local agent cache.
 */
export async function DELETE(): Promise<NextResponse> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'SUPABASE_UNAVAILABLE',
          message: 'Supabase control plane is unconfigured. Resume management requires Supabase authentication.',
        },
      },
      { status: 503 }
    );
  }

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

  // 1. Delete object from Supabase Storage
  const objectKey = `${user.id}/resume.pdf`;
  const { error: storageError } = await supabase.storage.from('resumes').remove([objectKey]);
  if (storageError) {
    console.warn('[api/agent/resume] Storage remove warning:', storageError);
  }

  // 2. Clear agent_config metadata
  await (supabase.from('agent_config') as any)
    .update({
      resume_filename: null,
      resume_storage_path: null,
      resume_size_bytes: null,
      resume_updated_at: null,
      resume_sha256: null,
    })
    .eq('user_id', user.id);

  // 3. Notify local agent to clear cached resume file
  try {
    await agentClient.deleteResume();
  } catch {
    // ignore local agent connection error on delete
  }

  return NextResponse.json({ success: true, data: { deleted: true } });
}
