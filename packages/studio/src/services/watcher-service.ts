/**
 * File Watcher Service
 *
 * Watches evidence files for changes and triggers re-inference.
 * Uses native fs.watch with fallback behavior for cross-platform compatibility.
 */

import { watch, existsSync, statSync, type FSWatcher, type WatchEventType } from 'node:fs';
import { EventEmitter } from 'node:events';
import type { ContractIR } from '@docsmyth/ir-spec';
import { inferContractFromEvidence, clearInferenceCache } from './infer-service.js';
import { clearEvidenceCache, getEvidenceSummary } from './evidence-service.js';
import { getIssues } from './issues-service.js';
import { getCoverage } from './coverage-service.js';
import type { EvidenceSummary, IssuesResponse, CoverageResponse } from '../types.js';

/**
 * State update pushed to clients
 */
export interface StudioStateUpdate {
    type: 'state-update';
    timestamp: string;
    data: {
        contract: ContractIR;
        evidenceSummary: EvidenceSummary;
        issues: IssuesResponse;
        coverage: CoverageResponse;
        eventCount: number;
        isWaiting: boolean;
    };
}

/**
 * Status update for waiting state
 */
export interface StatusUpdate {
    type: 'status';
    timestamp: string;
    status: 'waiting' | 'ready' | 'error';
    message: string;
    eventCount: number;
}

export type WatcherEvent = StudioStateUpdate | StatusUpdate;

/**
 * Watcher service options
 */
export interface WatcherOptions {
    evidencePath: string;
    serviceName?: string;
    serviceVersion?: string;
    debounceMs?: number;
}

/**
 * Evidence file watcher with debounced re-inference
 */
export class EvidenceWatcher extends EventEmitter {
    private evidencePath: string;
    private serviceName: string;
    private serviceVersion: string;
    private debounceMs: number;
    private watcher: FSWatcher | null = null;
    private debounceTimer: ReturnType<typeof setTimeout> | null = null;
    private lastMtime: number = 0;
    private lastSize: number = 0;
    private currentContract: ContractIR | null = null;
    private isProcessing: boolean = false;
    private pollInterval: ReturnType<typeof setInterval> | null = null;

    constructor(options: WatcherOptions) {
        super();
        this.evidencePath = options.evidencePath;
        this.serviceName = options.serviceName || 'inferred-service';
        this.serviceVersion = options.serviceVersion || '0.0.1';
        this.debounceMs = options.debounceMs ?? 300;
    }

    /**
     * Start watching the evidence file
     */
    async start(): Promise<void> {
        // Emit initial waiting state if file doesn't exist or is empty
        if (!existsSync(this.evidencePath)) {
            this.emitStatus('waiting', 'Waiting for traffic...', 0);
            // Start polling for file creation
            this.startCreationPolling();
            return;
        }

        const stats = statSync(this.evidencePath);
        this.lastMtime = stats.mtimeMs;
        this.lastSize = stats.size;

        // If file is empty, emit waiting state
        if (stats.size === 0) {
            this.emitStatus('waiting', 'Waiting for traffic...', 0);
            this.startWatching();
            return;
        }

        // Initial inference
        await this.processChanges();
        this.startWatching();
    }

    /**
     * Stop watching
     */
    stop(): void {
        if (this.watcher) {
            this.watcher.close();
            this.watcher = null;
        }
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
    }

    /**
     * Get current inferred contract
     */
    getCurrentContract(): ContractIR | null {
        return this.currentContract;
    }

    /**
     * Force refresh (clear caches and re-process)
     */
    async forceRefresh(): Promise<void> {
        clearInferenceCache(this.evidencePath);
        clearEvidenceCache();
        await this.processChanges();
    }

    /**
     * Poll for file creation when evidence file doesn't exist yet
     */
    private startCreationPolling(): void {
        this.pollInterval = setInterval(() => {
            if (existsSync(this.evidencePath)) {
                if (this.pollInterval) {
                    clearInterval(this.pollInterval);
                    this.pollInterval = null;
                }
                const stats = statSync(this.evidencePath);
                this.lastMtime = stats.mtimeMs;
                this.lastSize = stats.size;

                if (stats.size > 0) {
                    this.processChanges().catch(console.error);
                }
                this.startWatching();
            }
        }, 500);
    }

    /**
     * Start watching the evidence file
     */
    private startWatching(): void {
        try {
            this.watcher = watch(this.evidencePath, (eventType: WatchEventType) => {
                if (eventType === 'change' || eventType === 'rename') {
                    this.scheduleProcessing();
                }
            });

            this.watcher.on('error', (err) => {
                console.error('Watcher error:', err);
                this.startFallbackPolling();
            });
        } catch {
            // fs.watch may not work on all platforms/filesystems
            console.warn('fs.watch not available, using polling fallback');
            this.startFallbackPolling();
        }
    }

    /**
     * Fallback polling for systems where fs.watch doesn't work well
     */
    private startFallbackPolling(): void {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
        }

        this.pollInterval = setInterval(() => {
            if (!existsSync(this.evidencePath)) return;

            const stats = statSync(this.evidencePath);
            if (stats.mtimeMs !== this.lastMtime || stats.size !== this.lastSize) {
                this.scheduleProcessing();
            }
        }, 500);
    }

    /**
     * Schedule processing with debounce
     */
    private scheduleProcessing(): void {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }

        this.debounceTimer = setTimeout(() => {
            this.processChanges().catch((err) => {
                console.error('Error processing evidence changes:', err);
                this.emitStatus('error', err.message, 0);
            });
        }, this.debounceMs);
    }

    /**
     * Process evidence changes - re-infer and compute derived data
     */
    private async processChanges(): Promise<void> {
        if (this.isProcessing) return;
        this.isProcessing = true;

        try {
            if (!existsSync(this.evidencePath)) {
                this.emitStatus('waiting', 'Evidence file not found', 0);
                return;
            }

            const stats = statSync(this.evidencePath);
            this.lastMtime = stats.mtimeMs;
            this.lastSize = stats.size;

            if (stats.size === 0) {
                this.emitStatus('waiting', 'Waiting for traffic...', 0);
                return;
            }

            // Clear caches to force re-read
            clearInferenceCache(this.evidencePath);
            clearEvidenceCache();

            // Re-infer contract
            const contract = await inferContractFromEvidence(
                this.evidencePath,
                this.serviceName,
                this.serviceVersion,
                false // Don't use cache
            );
            this.currentContract = contract;

            // Compute derived data
            const [evidenceSummary, issues, coverage] = await Promise.all([
                getEvidenceSummary(this.evidencePath, contract, false),
                getIssues(this.evidencePath, contract, false),
                getCoverage(this.evidencePath, contract, false, false),
            ]);

            const update: StudioStateUpdate = {
                type: 'state-update',
                timestamp: new Date().toISOString(),
                data: {
                    contract,
                    evidenceSummary,
                    issues,
                    coverage,
                    eventCount: evidenceSummary.totalEvents,
                    isWaiting: false,
                },
            };

            this.emit('update', update);
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Emit status update
     */
    private emitStatus(status: 'waiting' | 'ready' | 'error', message: string, eventCount: number): void {
        const update: StatusUpdate = {
            type: 'status',
            timestamp: new Date().toISOString(),
            status,
            message,
            eventCount,
        };
        this.emit('update', update);
    }
}

/**
 * Global watcher instance (singleton per evidence path)
 */
const watchers = new Map<string, EvidenceWatcher>();

/**
 * Get or create a watcher for an evidence path
 */
export function getWatcher(options: WatcherOptions): EvidenceWatcher {
    const existing = watchers.get(options.evidencePath);
    if (existing) {
        return existing;
    }

    const watcher = new EvidenceWatcher(options);
    watchers.set(options.evidencePath, watcher);
    return watcher;
}

/**
 * Stop and remove a watcher
 */
export function stopWatcher(evidencePath: string): void {
    const watcher = watchers.get(evidencePath);
    if (watcher) {
        watcher.stop();
        watchers.delete(evidencePath);
    }
}

/**
 * Stop all watchers
 */
export function stopAllWatchers(): void {
    for (const watcher of watchers.values()) {
        watcher.stop();
    }
    watchers.clear();
}
