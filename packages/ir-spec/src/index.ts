/**
 * @docsmyth/ir-spec
 *
 * Contract IR (Intermediate Representation) Specification
 *
 * This package provides:
 * - TypeScript type definitions for Contract IR v0.1
 * - Overlay types for view modifications v0.1
 * - Validation utilities for IR and Overlay documents
 * - JSON Schema definitions
 */

// Type definitions
export type {
  ContractIR,
  HttpMethod,
  HttpOperation,
  HttpParameter,
  HttpRequestBody,
  HttpResponse,
  HttpStatusCode,
  IRVersion,
  JsonSchemaObject,
  ParameterLocation,
  Ref,
  SchemaRef,
  SecurityRequirement,
  SecurityScheme,
  ServiceInfo,
} from './types.js';

// Overlay types
export type {
  Overlay,
  OverlayVersion,
  HideOperation,
  HideByOperationId,
  HideByMethodPath,
  ServerOverride,
  SchemaRedaction,
  ResponseRedaction,
  RequestRedaction,
  OverlaySummary,
} from './overlay-types.js';

export { isHideByOperationId, isHideByMethodPath } from './overlay-types.js';

// Validation
export { isContractIR, validate } from './validate.js';
export type { ValidationError, ValidationResult } from './validate.js';

// Overlay validation
export { validateOverlay, isOverlay, formatOverlayErrors } from './overlay-validate.js';
export type { OverlayValidationError, OverlayValidationResult } from './overlay-validate.js';

// Schema traversal utilities
export {
  createSchemaWalker,
  resolveSchemaRef,
  checkSchemaCycles,
  extractSchemaRefs,
  SchemaCycleError,
  SchemaDepthError,
  DEFAULT_MAX_DEPTH,
} from './schema-walker.js';
export type {
  SchemaWalkerOptions,
  WalkerContext,
  SchemaVisitor,
  ResolvedSchema,
} from './schema-walker.js';
