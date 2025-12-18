/**
 * @docsmyth/evidence-sdk
 *
 * SDK for capturing, sanitizing, and validating evidence events
 * from API runtime. Evidence events capture request/response pairs
 * that can be verified against Contract IR schemas.
 */

// Types
export type {
  EvidenceVersion,
  EvidenceProtocol,
  EvidenceRequest,
  EvidenceResponse,
  EvidenceEvent,
  EvidenceBundle,
  OperationVerificationSummary,
  VerificationError,
  VerificationResult,
} from './types.js';

// Sanitization
export { sanitize, createSanitizer, type SanitizeConfig } from './sanitize.js';

// Sanitizer Profiles
export {
  SANITIZER_PROFILES,
  STRICT_PROFILE,
  BALANCED_PROFILE,
  DEBUG_PROFILE,
  NEVER_CAPTURE_HEADERS,
  DEFAULT_SENSITIVE_FIELDS,
  getProfile,
  getProfileOrDefault,
  getProfileFromEnv,
  validateNeverCaptureRules,
  enforceNeverCaptureRules,
} from './profiles.js';
export type {
  SanitizerProfileName,
  SanitizerProfile,
} from './profiles.js';

// Streaming Writer
export {
  StreamingEvidenceWriter,
  computeEventHash,
  DEFAULT_LIMITS,
} from './streaming-writer.js';
export type {
  StreamingWriterOptions,
  LimitType,
  LimitDetails,
  WriteResult,
  WriterStats,
} from './streaming-writer.js';

// Streaming Reader
export {
  streamVerifyEvidence,
  parseNdjsonLine,
  createNdjsonReader,
  countNdjsonLines,
  iterateEvidence,
} from './streaming-reader.js';
export type {
  StreamingVerifyOptions,
  EventValidator,
} from './streaming-reader.js';
