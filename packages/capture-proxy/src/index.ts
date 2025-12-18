/**
 * @acp/capture-proxy
 *
 * Language-agnostic HTTP sidecar proxy for evidence capture.
 * Works with any HTTP service behind it and emits evidence events
 * mapped to Contract IR operationIds.
 */

export { createProxy, startProxy, type ProxyConfig, type ProxyServer } from './proxy.js';
export { loadContract, type ContractLoader, type ContractSource } from './contract-loader.js';
export {
    createEvidenceWriter,
    type EvidenceWriter,
    type EvidenceWriterOptions,
} from './evidence-writer.js';
export { createLogger, type Logger, type LogLevel } from './logger.js';
export { type ProxyHealthStatus } from './health.js';
