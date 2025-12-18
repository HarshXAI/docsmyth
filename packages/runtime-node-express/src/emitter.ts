/**
 * Evidence emitter interface and implementations
 *
 * Provides different strategies for outputting captured evidence events.
 */

import { appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import type { EvidenceEvent } from '@acp/evidence-sdk';
import { createLogger, type Logger } from './logger.js';

/**
 * Evidence emitter function type
 */
export type EvidenceEmitter = (event: EvidenceEvent) => void | Promise<void>;

/**
 * Options for the NDJSON file emitter
 */
export interface NdjsonEmitterOptions {
  /** Path to the evidence file */
  filePath: string;
  /** Whether to create parent directories if they don't exist */
  createDirs?: boolean;
  /** Optional logger instance */
  logger?: Logger;
}

/**
 * Creates an emitter that appends evidence to an NDJSON file
 *
 * @param options - Emitter options
 * @returns An evidence emitter function
 *
 * @example
 * ```ts
 * import { createNdjsonEmitter } from '@acp/runtime-node-express';
 *
 * const emitter = createNdjsonEmitter({
 *   filePath: '.acp/evidence.ndjson',
 *   createDirs: true,
 * });
 * ```
 */
export function createNdjsonEmitter(options: NdjsonEmitterOptions): EvidenceEmitter {
  const { filePath, createDirs = true, logger = createLogger() } = options;

  // Ensure parent directory exists
  if (createDirs) {
    const dir = dirname(filePath);
    if (dir && !existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  return (event: EvidenceEvent): void => {
    try {
      const line = JSON.stringify(event) + '\n';
      appendFileSync(filePath, line, 'utf-8');
    } catch (error) {
      // Log but don't throw - evidence capture should never crash the app
      logger.warn('Failed to write evidence:', error);
    }
  };
}

/**
 * Options for the console emitter
 */
export interface ConsoleEmitterOptions {
  /** Optional logger instance */
  logger?: Logger;
}

/**
 * Creates an emitter that logs evidence to console (useful for debugging)
 */
export function createConsoleEmitter(options?: ConsoleEmitterOptions): EvidenceEmitter {
  const logger = options?.logger ?? createLogger({ level: 'info' });
  return (event: EvidenceEvent): void => {
    logger.info('[evidence]', JSON.stringify(event, null, 2));
  };
}

/**
 * Creates an emitter that stores evidence in memory (useful for testing)
 */
export function createMemoryEmitter(): {
  emitter: EvidenceEmitter;
  events: EvidenceEvent[];
  clear: () => void;
} {
  const events: EvidenceEvent[] = [];

  return {
    emitter: (event: EvidenceEvent): void => {
      events.push(event);
    },
    events,
    clear: () => {
      events.length = 0;
    },
  };
}

/**
 * Options for combine emitters
 */
export interface CombineEmittersOptions {
  /** Optional logger instance */
  logger?: Logger;
}

/**
 * Combines multiple emitters into one
 *
 * @param emitters - Array of emitters to combine
 * @param options - Optional configuration
 * @returns A combined emitter that calls all emitters
 */
export function combineEmitters(
  emitters: EvidenceEmitter[],
  options?: CombineEmittersOptions
): EvidenceEmitter {
  const logger = options?.logger ?? createLogger();
  return async (event: EvidenceEvent): Promise<void> => {
    for (const emitter of emitters) {
      try {
        await emitter(event);
      } catch (error) {
        logger.warn('Emitter failed:', error);
      }
    }
  };
}
