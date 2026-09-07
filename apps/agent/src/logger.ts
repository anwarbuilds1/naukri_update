/**
 * Production-grade structured logger for the Naukri Agent.
 *
 * Features:
 * - Structured JSON file logging with timestamp, level, component, event, message.
 * - Automatic sensitive data redaction (passwords, tokens, cookies, secrets).
 * - Size-bounded log rotation (max 5MB per file, up to 3 backups).
 * - Human-readable formatted console output.
 */

import * as fs from 'fs';
import * as path from 'path';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  component: string;
  event?: string;
  message: string;
  details?: Record<string, unknown>;
  requestId?: string;
  pid: number;
}

const SENSITIVE_KEY_REGEX = /(password|passwd|secret|token|auth|cookie|session|apikey|api_key|credential)/i;
const MAX_LOG_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_ROTATED_FILES = 3;

export function redactSensitiveData(data: unknown, sensitiveStrings: string[] = []): unknown {
  if (data === null || data === undefined) return data;

  if (typeof data === 'string') {
    let result = data;
    for (const secret of sensitiveStrings) {
      if (secret && secret.length > 2) {
        result = result.split(secret).join('[REDACTED]');
      }
    }
    // Also redact key=value patterns in text
    result = result.replace(/(password|secret|token|key)=([^\s&]+)/gi, '$1=[REDACTED]');
    return result;
  }

  if (Array.isArray(data)) {
    return data.map((item) => redactSensitiveData(item, sensitiveStrings));
  }

  if (typeof data === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      if (SENSITIVE_KEY_REGEX.test(key)) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = redactSensitiveData(value, sensitiveStrings);
      }
    }
    return sanitized;
  }

  return data;
}

export class AgentLogger {
  private logDir: string;
  private logFilePath: string;
  private registeredSecrets: Set<string> = new Set();

  constructor(configDir: string) {
    this.logDir = path.join(configDir, 'logs');
    this.logFilePath = path.join(this.logDir, 'agent.log');
    this.ensureDirectory();
  }

  private ensureDirectory(): void {
    try {
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
      }
    } catch {
      // ignore
    }
  }

  registerSecret(secret?: string): void {
    if (secret && secret.trim().length > 3) {
      this.registeredSecrets.add(secret.trim());
    }
  }

  private rotateLogsIfNeeded(): void {
    try {
      if (!fs.existsSync(this.logFilePath)) return;

      const stat = fs.statSync(this.logFilePath);
      if (stat.size < MAX_LOG_SIZE_BYTES) return;

      // Rotate existing backups: .2 -> .3, .1 -> .2
      for (let i = MAX_ROTATED_FILES - 1; i >= 1; i--) {
        const currentBackup = `${this.logFilePath}.${i}`;
        const nextBackup = `${this.logFilePath}.${i + 1}`;
        if (fs.existsSync(currentBackup)) {
          if (i === MAX_ROTATED_FILES - 1) {
            fs.rmSync(nextBackup, { force: true });
          }
          fs.renameSync(currentBackup, nextBackup);
        }
      }

      // Rotate primary log file to .1
      fs.renameSync(this.logFilePath, `${this.logFilePath}.1`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[logger] Failed to rotate log files: ${msg}`);
    }
  }

  log(
    level: LogLevel,
    component: string,
    message: string,
    details?: Record<string, unknown>,
    event?: string,
    requestId?: string
  ): void {
    const secretsList = Array.from(this.registeredSecrets);
    const sanitizedMsg = String(redactSensitiveData(message, secretsList));
    const sanitizedDetails = details
      ? (redactSensitiveData(details, secretsList) as Record<string, unknown>)
      : undefined;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      component,
      event,
      message: sanitizedMsg,
      details: sanitizedDetails,
      requestId,
      pid: process.pid,
    };

    // 1. Console Output
    const prefix = `[${entry.timestamp}] [${level.toUpperCase().padEnd(5)}] [${component}]`;
    const consoleMsg = `${prefix} ${sanitizedMsg}`;
    switch (level) {
      case 'error':
        console.error(consoleMsg, sanitizedDetails ? sanitizedDetails : '');
        break;
      case 'warn':
        console.warn(consoleMsg, sanitizedDetails ? sanitizedDetails : '');
        break;
      case 'debug':
        if (process.env['DEBUG']) {
          console.debug(consoleMsg, sanitizedDetails ? sanitizedDetails : '');
        }
        break;
      default:
        console.log(consoleMsg, sanitizedDetails ? sanitizedDetails : '');
        break;
    }

    // 2. File Output with Rotation
    try {
      this.ensureDirectory();
      this.rotateLogsIfNeeded();
      fs.appendFileSync(this.logFilePath, JSON.stringify(entry) + '\n', 'utf8');
    } catch {
      // Never crash on logging write errors
    }
  }

  debug(component: string, message: string, details?: Record<string, unknown>, event?: string): void {
    this.log('debug', component, message, details, event);
  }

  info(component: string, message: string, details?: Record<string, unknown>, event?: string): void {
    this.log('info', component, message, details, event);
  }

  warn(component: string, message: string, details?: Record<string, unknown>, event?: string): void {
    this.log('warn', component, message, details, event);
  }

  error(component: string, message: string, details?: Record<string, unknown>, event?: string): void {
    this.log('error', component, message, details, event);
  }
}
