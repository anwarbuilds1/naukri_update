'use client';

import { useEffect, useState } from 'react';
import type { ResumeInfo } from '@naukri-update/shared';

export default function ResumePage() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [resumeInfo, setResumeInfo] = useState<ResumeInfo | null>(null);
  const [loadingInfo, setLoadingInfo] = useState(true);
  const [result, setResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  async function fetchResumeInfo() {
    setLoadingInfo(true);
    try {
      const res = await fetch('/api/agent/resume');
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          setResumeInfo(json.data);
        }
      }
    } catch {
      // ignore
    } finally {
      setLoadingInfo(false);
    }
  }

  useEffect(() => {
    fetchResumeInfo();
  }, []);

  async function handleDeleteResume() {
    if (!confirm('Are you sure you want to delete the active resume from your local agent?')) {
      return;
    }
    setDeleting(true);
    setResult(null);

    try {
      const res = await fetch('/api/agent/resume', { method: 'DELETE' });
      const json = await res.json();
      if (res.ok && json.success) {
        setResult({ type: 'success', message: 'Active resume deleted successfully from local agent.' });
        await fetchResumeInfo();
      } else {
        setResult({ type: 'error', message: json.error?.message || 'Failed to delete resume.' });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setResult({ type: 'error', message: `Delete error: ${msg}` });
    } finally {
      setDeleting(false);
    }
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setResult({ type: 'error', message: 'Only PDF files (.pdf) are allowed.' });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setResult({ type: 'error', message: 'File must be under 5 MB in size.' });
      return;
    }

    setUploading(true);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/agent/resume', {
        method: 'POST',
        body: formData,
      });

      const json = await res.json();
      if (res.ok && json.success) {
        setResult({
          type: 'success',
          message: `Resume uploaded to local agent successfully as "${json.data?.filename || file.name}".`,
        });
        setFile(null);
        await fetchResumeInfo();
      } else {
        setResult({
          type: 'error',
          message: json.error?.message || 'Failed to upload resume to local agent.',
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setResult({ type: 'error', message: `Upload error: ${msg}` });
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Resume Management</h1>
        <p className="text-slate-400 mt-1">
          Upload candidate resume PDF directly to your local agent for daily Naukri uploads.
        </p>
      </div>

      {result && (
        <div
          className={`rounded-lg border p-4 text-sm ${
            result.type === 'success'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
              : 'border-red-500/30 bg-red-500/10 text-red-300'
          }`}
        >
          {result.message}
        </div>
      )}

      {/* Active Resume Status Card */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">Active Resume</h2>
            <p className="text-xs text-slate-400 mt-0.5">Current PDF used for scheduled daily uploads on your agent.</p>
          </div>
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
              resumeInfo?.exists
                ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                : 'text-amber-400 bg-amber-500/10 border-amber-500/20'
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${resumeInfo?.exists ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            {loadingInfo ? 'Checking...' : resumeInfo?.exists ? 'Configured' : 'Not configured'}
          </span>
        </div>

        {resumeInfo?.exists ? (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-lg bg-slate-950/60 border border-slate-800/80 p-4">
            <div className="space-y-1">
              <div className="text-sm font-semibold text-white flex items-center gap-2">
                <span>📄</span> {resumeInfo.filename}
              </div>
              <div className="text-xs text-slate-400">
                Size: {resumeInfo.sizeBytes ? `${Math.round(resumeInfo.sizeBytes / 1024)} KB` : 'Unknown'} ·
                Uploaded: {resumeInfo.lastModified ? new Date(resumeInfo.lastModified).toLocaleString() : 'Unknown'}
              </div>
            </div>
            <button
              type="button"
              onClick={handleDeleteResume}
              disabled={deleting}
              className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/20 transition disabled:opacity-40"
            >
              {deleting ? 'Deleting...' : 'Delete Resume'}
            </button>
          </div>
        ) : (
          <p className="text-xs text-slate-500 italic">
            No resume file currently loaded on your agent. Upload a PDF below to enable automated resume updates.
          </p>
        )}
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-white">Upload Authoritative Resume</h2>
          <p className="text-xs text-slate-400 mt-1">
            Playwright requires a physical file on the local machine where Chrome executes. Your resume stays on your machine and is never stored in cloud databases.
          </p>
        </div>

        <form onSubmit={handleUpload} className="space-y-4">
          <div className="rounded-lg border-2 border-dashed border-slate-700 bg-slate-950/60 p-8 text-center">
            <input
              type="file"
              accept=".pdf,application/pdf"
              id="resume-file-input"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.[0]) {
                  setFile(e.target.files[0]);
                  setResult(null);
                }
              }}
            />
            <label
              htmlFor="resume-file-input"
              className="cursor-pointer block text-sm text-slate-300 hover:text-white"
            >
              {file ? (
                <div>
                  <span className="font-semibold text-indigo-400 block">{file.name}</span>
                  <span className="text-xs text-slate-500 mt-1 block">
                    {(file.size / 1024).toFixed(0)} KB · Click to choose different file
                  </span>
                </div>
              ) : (
                <div>
                  <span className="text-indigo-400 font-medium block">Click to select PDF resume</span>
                  <span className="text-xs text-slate-500 mt-1 block">Maximum size 5 MB</span>
                </div>
              )}
            </label>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={!file || uploading}
              className="rounded-md bg-indigo-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-40"
            >
              {uploading ? 'Sending to Agent...' : 'Upload to Agent'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
