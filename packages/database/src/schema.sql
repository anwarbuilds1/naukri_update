-- Migration: 001_initial_schema
-- Description: Initial tables for Naukri Update agent management
-- IMPORTANT: NAUKRI_PASSWORD is never stored in this database.

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─────────────────────────────────────────────
-- agent_config: per-user schedule configuration
-- Managed by the web UI. Read by the agent.
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.agent_config (
  user_id         UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  refresh_mode    TEXT        NOT NULL DEFAULT 'interval'
                              CHECK (refresh_mode IN ('interval', 'fixed_time', 'disabled')),
  refresh_interval_hours    INTEGER NOT NULL DEFAULT 1 CHECK (refresh_interval_hours >= 0 AND refresh_interval_hours <= 23),
  refresh_interval_minutes  INTEGER NOT NULL DEFAULT 0 CHECK (refresh_interval_minutes >= 0 AND refresh_interval_minutes <= 59),
  refresh_time    TEXT        NOT NULL DEFAULT '06:11'
                              CHECK (refresh_time ~ '^([0-1][0-9]|2[0-3]):[0-5][0-9]$'),
  refresh_window_enabled    BOOLEAN NOT NULL DEFAULT FALSE,
  refresh_window_start      TEXT    NOT NULL DEFAULT '07:00'
                              CHECK (refresh_window_start ~ '^([0-1][0-9]|2[0-3]):[0-5][0-9]$'),
  refresh_window_end        TEXT    NOT NULL DEFAULT '19:00'
                              CHECK (refresh_window_end ~ '^([0-1][0-9]|2[0-3]):[0-5][0-9]$'),
  resume_update_enabled     BOOLEAN NOT NULL DEFAULT FALSE,
  resume_update_time        TEXT    NOT NULL DEFAULT '07:00'
                              CHECK (resume_update_time ~ '^([0-1][0-9]|2[0-3]):[0-5][0-9]$'),
  naukri_email    TEXT,       -- email only; password NEVER stored here
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────
-- run_log: per-run automation results
-- Written by the agent after each task execution.
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.run_log (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task            TEXT        NOT NULL CHECK (task IN ('headline-refresh', 'resume-upload')),
  success         BOOLEAN     NOT NULL,
  message         TEXT        NOT NULL DEFAULT '',
  duration_ms     INTEGER     NOT NULL DEFAULT 0 CHECK (duration_ms >= 0),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for efficient log queries by user
CREATE INDEX IF NOT EXISTS idx_run_log_user_created
  ON public.run_log (user_id, created_at DESC);

-- ─────────────────────────────────────────────
-- agent_status: live agent heartbeat
-- Written by the agent on each poll cycle.
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.agent_status (
  user_id         UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  last_seen       TIMESTAMPTZ NOT NULL DEFAULT now(),
  version         TEXT        NOT NULL DEFAULT '0.0.0',
  chrome_connected BOOLEAN    NOT NULL DEFAULT FALSE,
  status          TEXT        NOT NULL DEFAULT 'offline'
                              CHECK (status IN ('idle', 'running', 'chrome-disconnected', 'otp-required', 'error', 'offline')),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────
-- Row Level Security
-- Each user can only read/write their own rows.
-- ─────────────────────────────────────────────
ALTER TABLE public.agent_config   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.run_log        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_status   ENABLE ROW LEVEL SECURITY;

-- agent_config policies
CREATE POLICY "Users can view their own config"
  ON public.agent_config FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own config"
  ON public.agent_config FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own config"
  ON public.agent_config FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- run_log policies
CREATE POLICY "Users can view their own run logs"
  ON public.run_log FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own run logs"
  ON public.run_log FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- agent_status policies
CREATE POLICY "Users can view their own agent status"
  ON public.agent_status FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can upsert their own agent status"
  ON public.agent_status FOR ALL
  USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────
-- agent_commands: atomic command idempotency and state machine tracking
-- Managed by the Next.js API.
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.agent_commands (
  request_id    UUID        PRIMARY KEY,
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  command_type  TEXT        NOT NULL,
  status        TEXT        NOT NULL DEFAULT 'queued'
                            CHECK (status IN ('queued', 'dispatched', 'running', 'succeeded', 'failed', 'cancelled')),
  error_message TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_commands_user_created
  ON public.agent_commands (user_id, created_at DESC);

ALTER TABLE public.agent_commands ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own commands"
  ON public.agent_commands FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own commands"
  ON public.agent_commands FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own commands"
  ON public.agent_commands FOR UPDATE
  USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────
-- Trigger: auto-update updated_at timestamps
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_agent_config_updated_at
  BEFORE UPDATE ON public.agent_config
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_agent_status_updated_at
  BEFORE UPDATE ON public.agent_status
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_agent_commands_updated_at
  BEFORE UPDATE ON public.agent_commands
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
