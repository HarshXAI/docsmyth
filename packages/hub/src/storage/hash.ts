/**
 * Hashing utilities for contract integrity
 *
 * Uses SHA-256 for deterministic, collision-resistant hashing.
 */

import { createHash } from 'node:crypto';

/**
 * Compute a deterministic SHA-256 hash of a JSON-serializable value.
 *
 * The value is first stringified with sorted keys to ensure determinism
 * across different serialization orders.
 *
 * @param value - The value to hash
 * @returns Hex-encoded SHA-256 hash
 */
export function computeHash(value: unknown): string {
    const canonical = stableStringify(value);
    return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/**
 * Stable JSON stringify with sorted keys.
 *
 * This ensures that objects with the same keys in different orders
 * produce identical strings. Properly handles undefined values.
 *
 * @param value - The value to stringify
 * @returns Deterministic JSON string
 */
export function stableStringify(value: unknown): string {
    if (value === undefined) {
        return 'null'; // undefined becomes null in JSON
    }

    if (value === null) {
        return 'null';
    }

    if (Array.isArray(value)) {
        return '[' + value.map(stableStringify).join(',') + ']';
    }

    if (typeof value === 'object') {
        const keys = Object.keys(value as Record<string, unknown>).sort();
        const pairs: string[] = [];
        for (const key of keys) {
            const v = (value as Record<string, unknown>)[key];
            // Skip undefined values (they are not included in JSON)
            if (v !== undefined) {
                pairs.push(JSON.stringify(key) + ':' + stableStringify(v));
            }
        }
        return '{' + pairs.join(',') + '}';
    }

    return JSON.stringify(value);
}

/**
 * Verify that a value matches an expected hash.
 *
 * @param value - The value to verify
 * @param expectedHash - The expected SHA-256 hash (hex-encoded)
 * @returns True if the hash matches
 */
export function verifyHash(value: unknown, expectedHash: string): boolean {
    return computeHash(value) === expectedHash;
}
