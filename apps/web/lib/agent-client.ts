import type {
  AgentCommand,
  AgentStatus,
  ApiResponse,
  DiagnosticsResult,
  ResumeInfo,
  RunResult,
} from '@naukri-update/shared';

export interface AgentAuthProvider {
  getHeaders(): Record<string, string>;
}

export class SharedSecretAuthProvider implements AgentAuthProvider {
  constructor(private secret: string) {}

  getHeaders(): Record<string, string> {
    if (!this.secret) return {};
    return {
      'X-Agent-Secret': this.secret,
    };
  }
}

export class AgentClient {
  private baseUrl: string;
  private authProvider: AgentAuthProvider;

  constructor(
    baseUrl: string = process.env['AGENT_URL'] ?? 'http://127.0.0.1:7842',
    authProvider: AgentAuthProvider = new SharedSecretAuthProvider(
      process.env['AGENT_SECRET'] ?? ''
    )
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.authProvider = authProvider;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      ...this.authProvider.getHeaders(),
      ...(options.headers || {}),
    };

    try {
      const res = await fetch(url, {
        ...options,
        headers,
        signal: AbortSignal.timeout(10000),
      });

      const data = (await res.json()) as ApiResponse<T>;
      return data;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        error: {
          code: 'AGENT_UNREACHABLE',
          message: `Local agent at ${this.baseUrl} is unreachable: ${msg}`,
        },
      };
    }
  }

  async getStatus(): Promise<ApiResponse<AgentStatus>> {
    return this.request<AgentStatus>('/api/agent/status', {
      method: 'GET',
    });
  }

  async sendCommand(
    command: AgentCommand
  ): Promise<ApiResponse<{ queued: boolean; requestId: string }>> {
    return this.request<{ queued: boolean; requestId: string }>('/api/agent/command', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(command),
    });
  }

  async sendCredentials(payload: {
    naukriEmail: string;
    naukriPassword: string;
  }): Promise<ApiResponse<{ updated: boolean }>> {
    return this.request<{ updated: boolean }>('/api/agent/credentials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }

  async sendResume(
    buffer: Buffer,
    filename: string
  ): Promise<ApiResponse<{ filename: string; path: string }>> {
    return this.request<{ filename: string; path: string }>('/api/agent/resume', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/pdf',
        'X-Filename': encodeURIComponent(filename),
      },
      body: buffer as unknown as BodyInit,
    });
  }

  async getLogs(
    limit: number = 50,
    task?: string
  ): Promise<ApiResponse<{ lines: RunResult[] }>> {
    const params = new URLSearchParams({ limit: String(limit) });
    if (task) params.set('task', task);
    return this.request<{ lines: RunResult[] }>(`/api/agent/logs?${params.toString()}`, {
      method: 'GET',
    });
  }

  async getResumeInfo(): Promise<ApiResponse<ResumeInfo>> {
    return this.request<ResumeInfo>('/api/agent/resume', {
      method: 'GET',
    });
  }

  async deleteResume(): Promise<ApiResponse<{ deleted: boolean }>> {
    return this.request<{ deleted: boolean }>('/api/agent/resume', {
      method: 'DELETE',
    });
  }

  async clearCredentials(): Promise<ApiResponse<{ cleared: boolean }>> {
    return this.request<{ cleared: boolean }>('/api/agent/credentials', {
      method: 'DELETE',
    });
  }

  async getDiagnostics(): Promise<ApiResponse<DiagnosticsResult>> {
    return this.request<DiagnosticsResult>('/api/agent/diagnostics', {
      method: 'GET',
    });
  }
}

export const agentClient = new AgentClient();
