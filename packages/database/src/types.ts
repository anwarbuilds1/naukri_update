// TODO: Replace with generated types from `supabase gen types typescript`
// after connecting to a Supabase project.
// For Phase 1 this is a manual approximation matching the schema.

export type Database = {
  public: {
    Tables: {
      agent_config: {
        Row: AgentConfigRow;
        Insert: AgentConfigInsert;
        Update: Partial<AgentConfigInsert>;
      };
      run_log: {
        Row: RunLogRow;
        Insert: RunLogInsert;
        Update: never;
      };
      agent_status: {
        Row: AgentStatusRow;
        Insert: AgentStatusInsert;
        Update: Partial<AgentStatusInsert>;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
};

export interface AgentConfigRow {
  user_id: string;
  refresh_mode: 'interval' | 'fixed_time' | 'disabled';
  refresh_interval_hours: number;
  refresh_interval_minutes: number;
  refresh_time: string;
  refresh_window_enabled: boolean;
  refresh_window_start: string;
  refresh_window_end: string;
  resume_update_enabled: boolean;
  resume_update_time: string;
  naukri_email: string | null;
  updated_at: string;
}

export type AgentConfigInsert = Omit<AgentConfigRow, 'updated_at'> & {
  updated_at?: string;
};

export interface RunLogRow {
  id: string;
  user_id: string;
  task: 'headline-refresh' | 'resume-upload';
  success: boolean;
  message: string;
  duration_ms: number;
  created_at: string;
}

export type RunLogInsert = Omit<RunLogRow, 'id' | 'created_at'> & {
  id?: string;
  created_at?: string;
};

export interface AgentStatusRow {
  user_id: string;
  last_seen: string;
  version: string;
  chrome_connected: boolean;
  status: 'idle' | 'running' | 'chrome-disconnected' | 'otp-required' | 'error' | 'offline';
  updated_at: string;
}

export type AgentStatusInsert = Omit<AgentStatusRow, 'updated_at'> & {
  updated_at?: string;
};
