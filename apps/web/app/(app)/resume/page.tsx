'use client';

import { useState } from 'react';

export default function ResumePage() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

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
