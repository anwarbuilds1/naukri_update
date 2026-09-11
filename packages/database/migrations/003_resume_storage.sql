-- Migration: 003_resume_storage
-- Description: Adds authoritative resume metadata fields to agent_config and provisions the resumes storage bucket with RLS policies

-- 1. Extend agent_config table with resume metadata
ALTER TABLE public.agent_config
  ADD COLUMN IF NOT EXISTS resume_filename     TEXT,
  ADD COLUMN IF NOT EXISTS resume_storage_path TEXT,
  ADD COLUMN IF NOT EXISTS resume_size_bytes   INTEGER CHECK (resume_size_bytes IS NULL OR (resume_size_bytes > 0 AND resume_size_bytes <= 5242880)),
  ADD COLUMN IF NOT EXISTS resume_updated_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resume_sha256       TEXT;

-- 2. Create private storage bucket for user resumes (5 MB max size, PDF only)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('resumes', 'resumes', false, 5242880, ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['application/pdf'];

-- 3. Row Level Security policies for storage.objects in bucket 'resumes'
CREATE POLICY "Users can view their own resume objects"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'resumes' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can upload their own resume objects"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'resumes' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update their own resume objects"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'resumes' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own resume objects"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'resumes' AND auth.uid()::text = (storage.foldername(name))[1]);
