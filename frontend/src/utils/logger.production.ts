const isDevelopment = process.env.NODE_ENV === 'development';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  data?: any;
  stack?: string;
}

class ProductionLogger {
  private logs: LogEntry[] = [];
  private maxLogs = 100;
  private enableConsole = isDevelopment;

  private formatTimestamp(): string {
    return new Date().toISOString();
  }

  private createEntry(level: LogLevel, message: string, data?: any): LogEntry {
    return {
      timestamp: this.formatTimestamp(),
      level,
      message,
      ...(data && { data }),
      ...(level === 'error' && data instanceof Error && { stack: data.stack })
    };
  }

  private addLog(entry: LogEntry): void {
    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    if (this.enableConsole) {
      const consoleMethod = console[entry.level] || console.log;
      consoleMethod(`[${entry.level.toUpperCase()}]`, entry.message, entry.data || '');
    }
  }

  debug(message: string, data?: any): void {
    if (isDevelopment) {
      this.addLog(this.createEntry('debug', message, data));
    }
  }

  info(message: string, data?: any): void {
    this.addLog(this.createEntry('info', message, data));
  }

  warn(message: string, data?: any): void {
    this.addLog(this.createEntry('warn', message, data));
  }

  error(message: string, error?: any): void {
    this.addLog(this.createEntry('error', message, error));

    if (!isDevelopment && typeof window !== 'undefined') {
      // In production, send to error tracking service
      // Example: Sentry.captureException(error);
    }
  }

  getLogs(): LogEntry[] {
    return [...this.logs];
  }

  clearLogs(): void {
    this.logs = [];
  }

  exportLogs(): string {
    return JSON.stringify(this.logs, null, 2);
  }
}

export const logger = new ProductionLogger();

export default logger;
