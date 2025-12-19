/**
 * Services index
 */

export {
    normalizePath,
    generateOperationId,
    inferSemanticOperationId,
    isLikelyParameter,
    type NormalizedPath,
} from './path-normalizer.js';

export {
    inferContract,
    inferContractFromEvents,
    type InferOptions,
} from './infer.js';
