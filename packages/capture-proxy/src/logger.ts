/**
 * Simple logger for the capture proxy
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

export interface Logger {
    debug(message: string, ...args: unknown[]): void;
    info(message: string, ...args: unknown[]): void;
    warn(message: string, ...args: unknown[]): void;
    error(message: string, ...args: unknown[]): void;
}

const LOG_LEVELS: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
    silent: 4,
};

export function createLogger(level: LogLevel = 'info'): Logger {
    const minLevel = LOG_LEVELS[level];

    const log = (msgLevel: Exclude<LogLevel, 'silent'>, message: string, ...args: unknown[]): void => {
        if (LOG_LEVELS[msgLevel] >= minLevel) {
            const prefix = `[acp-proxy:${msgLevel}]`;
            switch (msgLevel) {
                case 'debug':
                    // eslint-disable-next-line no-console
                    console.log(prefix, message, ...args);
                    break;
                case 'info':
                    // eslint-disable-next-line no-console
                    console.info(prefix, message, ...args);
                    break;
                case 'warn':
                    // eslint-disable-next-line no-console
                    console.warn(prefix, message, ...args);
                    break;
                case 'error':
                    // eslint-disable-next-line no-console
                    console.error(prefix, message, ...args);
                    break;
            }
        }
    };

    return {
        debug: (message: string, ...args: unknown[]) => log('debug', message, ...args),
        info: (message: string, ...args: unknown[]) => log('info', message, ...args),
        warn: (message: string, ...args: unknown[]) => log('warn', message, ...args),
        error: (message: string, ...args: unknown[]) => log('error', message, ...args),
    };
}
