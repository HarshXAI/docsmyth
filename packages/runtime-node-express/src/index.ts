/**
 * @docsmyth/runtime-node-express
 *
 * Express middleware for capturing evidence events during development and testing.
 * Evidence can be verified against Contract IR schemas and injected into OpenAPI specs.
 */

// Middleware
export { evidenceCapture, type EvidenceCaptureOptions } from './middleware.js';

// Path utilities
export {
  expressPathToIrPath,
  irPathToExpressPath,
  normalizePath,
  matchPath,
} from './path-matcher.js';

// Emitters
export {
  createNdjsonEmitter,
  createConsoleEmitter,
  createMemoryEmitter,
  combineEmitters,
  type EvidenceEmitter,
  type NdjsonEmitterOptions,
  type ConsoleEmitterOptions,
  type CombineEmittersOptions,
} from './emitter.js';

// Logger
export {
  createLogger,
  defaultLogger,
  type Logger,
  type LoggerOptions,
  type LogLevel,
} from './logger.js';
