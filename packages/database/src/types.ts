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
        Relationships: [];
      };
      run_log: {
        Row: RunLogRow;
        Insert: RunLogInsert;
        Update: never;
        Relationships: [];
      };
      agent_status: {
        Row: AgentStatusRow;
        Insert: AgentStatusInsert;
        Update: Partial<AgentStatusInsert>;
        Relationships: [];
      };
      agent_commands: {
        Row: AgentCommandRow;
        Insert: AgentCommandInsert;
        Update: Partial<AgentCommandInsert>;
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
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

export type AgentConfigInsert = Partial<Omit<AgentConfigRow, 'user_id'>> & {
  user_id: string;
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

export type RunLogInsert = Partial<Omit<RunLogRow, 'user_id' | 'task' | 'success'>> & {
  user_id: string;
  task: 'headline-refresh' | 'resume-upload';
  success: boolean;
};

export interface AgentStatusRow {
  user_id: string;
  last_seen: string;
  version: string;
  chrome_connected: boolean;
  status: 'idle' | 'running' | 'chrome-disconnected' | 'otp-required' | 'error' | 'offline';
  updated_at: string;
}

export type AgentStatusInsert = Partial<Omit<AgentStatusRow, 'user_id'>> & {
  user_id: string;
};

export interface AgentCommandRow {
  request_id: string;
  user_id: string;
  command_type: string;
  status: 'queued' | 'dispatched' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export type AgentCommandInsert = Partial<Omit<AgentCommandRow, 'request_id' | 'user_id' | 'command_type'>> & {
  request_id: string;
  user_id: string;
  command_type: string;
};
