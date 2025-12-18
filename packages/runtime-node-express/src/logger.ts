/**
 * Lightweight logger utility for @docsmyth/runtime-node-express
 *
 * Provides structured logging with configurable severity levels.
 * Uses process.stderr for error/warn, process.stdout for info/debug.
 */

/**
 * Log severity levels
 */
export type LogLevel = 'silent' | 'error' | 'warn' | 'info' | 'debug';

/**
 * Logger options
 */
export interface LoggerOptions {
  /** Minimum severity level to output. Default: 'warn' */
  level?: LogLevel;
  /** Prefix for all log messages. Default: '[acp]' */
  prefix?: string;
}

/**
 * Logger interface
 */
export interface Logger {
  error: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
}

/**
 * Level priority (lower = more severe)
 */
const LEVEL_PRIORITY: Record<LogLevel, number> = {
  silent: -1,
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

/**
 * Format arguments for output
 */
function formatArgs(prefix: string, level: string, args: unknown[]): string {
  const parts = args.map((arg) => {
    if (arg instanceof Error) {
      return arg.message;
    }
    if (typeof arg === 'object') {
      try {
        return JSON.stringify(arg, null, 2);
      } catch {
        return String(arg);
      }
    }
    return String(arg);
  });
  return `${prefix} [${level}] ${parts.join(' ')}\n`;
}

/**
 * Creates a logger instance with configurable level and prefix
 *
 * @param opts - Logger options
 * @returns Logger instance
 *
 * @example
 * ```ts
 * import { createLogger } from '@docsmyth/runtime-node-express';
 *
 * const logger = createLogger({ level: 'debug', prefix: '[my-app]' });
 * logger.info('Server started');
 * logger.error('Something went wrong', error);
 * ```
 */
export function createLogger(opts?: LoggerOptions): Logger {
  const level = opts?.level ?? 'warn';
  const prefix = opts?.prefix ?? '[acp]';
  const configuredPriority = LEVEL_PRIORITY[level];

  const shouldLog = (methodLevel: LogLevel): boolean => {
    return configuredPriority >= LEVEL_PRIORITY[methodLevel];
  };

  return {
    error: (...args: unknown[]): void => {
      if (shouldLog('error')) {
        process.stderr.write(formatArgs(prefix, 'error', args));
      }
    },
    warn: (...args: unknown[]): void => {
      if (shouldLog('warn')) {
        process.stderr.write(formatArgs(prefix, 'warn', args));
      }
    },
    info: (...args: unknown[]): void => {
      if (shouldLog('info')) {
        process.stdout.write(formatArgs(prefix, 'info', args));
      }
    },
    debug: (...args: unknown[]): void => {
      if (shouldLog('debug')) {
        process.stdout.write(formatArgs(prefix, 'debug', args));
      }
    },
  };
}

/**
 * Default logger instance (level: warn, prefix: [acp])
 */
export const defaultLogger = createLogger();
