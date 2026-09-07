-- Migration: 002_agent_commands
-- Description: Table for persistent, atomic command idempotency and state machine tracking

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

-- Index for efficient user command lookups
CREATE INDEX IF NOT EXISTS idx_agent_commands_user_created
  ON public.agent_commands (user_id, created_at DESC);

-- Enable RLS
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

CREATE TRIGGER trg_agent_commands_updated_at
  BEFORE UPDATE ON public.agent_commands
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
