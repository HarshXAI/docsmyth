/**
 * Tests for Overlay Validation
 */

import { describe, it, expect } from 'vitest';
import {
    validateOverlay,
    isOverlay,
    formatOverlayErrors,
    type Overlay,
} from '../src/index.js';

describe('validateOverlay', () => {
    describe('valid overlays', () => {
        it('should accept a minimal valid overlay', () => {
            const overlay = {
                irOverlayVersion: '0.1',
                name: 'public',
            };

            const result = validateOverlay(overlay);
            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
            // Should warn about empty overlay
            expect(result.warnings.some((w) => w.code === 'EMPTY_OVERLAY')).toBe(true);
        });

        it('should accept a full overlay with all fields', () => {
            const overlay: Overlay = {
                irOverlayVersion: '0.1',
                name: 'public',
                description: 'Public API overlay',
                hideOperations: [
                    { operationId: 'getInternalMetrics', reason: 'Internal only' },
                    { method: 'GET', path: '/admin/*' },
                ],
                serverOverrides: [
                    { pattern: 'http://localhost:3000', replacement: 'https://api.example.com' }, 
                ],
                schemaRedactions: [
                    { schemaId: 'User', fields: ['passwordHash', 'internalId'] },
                ],
                responseRedactions: [
                    { operationId: 'getUser', fields: ['metadata.createdBy'] },
                ],
                requestRedactions: [
                    { operationId: 'createOrder', fields: ['internalPriority'] },
                ],
            };

            const result = validateOverlay(overlay);
            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        it('should accept overlay with regex server override', () => {
            const overlay = {
                irOverlayVersion: '0.1',
                name: 'public',
                serverOverrides: [
                    {
                        pattern: 'http://localhost:\\d+',
                        replacement: 'https://api.example.com',
                        isRegex: true,
                    },
                ],
            };

            const result = validateOverlay(overlay);
            expect(result.valid).toBe(true);
        });
    });

    describe('invalid overlays', () => {
        it('should reject non-object input', () => {
            expect(validateOverlay(null).valid).toBe(false);
            expect(validateOverlay(undefined).valid).toBe(false);
            expect(validateOverlay('string').valid).toBe(false);
            expect(validateOverlay(123).valid).toBe(false);
        });

        it('should reject missing irOverlayVersion', () => {
            const result = validateOverlay({ name: 'test' });
            expect(result.valid).toBe(false);
            expect(result.errors.some((e) => e.code === 'REQUIRED_FIELD')).toBe(true);
        });

        it('should reject invalid irOverlayVersion', () => {
            const result = validateOverlay({ irOverlayVersion: '99.0', name: 'test' });
            expect(result.valid).toBe(false);
            expect(result.errors.some((e) => e.code === 'UNSUPPORTED_VERSION')).toBe(true);
        });

        it('should reject missing name', () => {
            const result = validateOverlay({ irOverlayVersion: '0.1' });
            expect(result.valid).toBe(false);
            expect(result.errors.some((e) => e.path === 'name')).toBe(true);
        });

        it('should reject empty name', () => {
            const result = validateOverlay({ irOverlayVersion: '0.1', name: '' });
            expect(result.valid).toBe(false);
            // Empty string is treated as "name is required" (falsy check)
            expect(result.errors.some((e) => e.path === 'name')).toBe(true);
        });

        it('should reject name that is too long', () => {
            const result = validateOverlay({
                irOverlayVersion: '0.1',
                name: 'x'.repeat(101),
            });
            expect(result.valid).toBe(false);
        });
    });

    describe('hideOperations validation', () => {
        it('should reject hide operation with both operationId and method', () => {
            const result = validateOverlay({
                irOverlayVersion: '0.1',
                name: 'test',
                hideOperations: [{ operationId: 'test', method: 'GET', path: '/test' }],
            });
            expect(result.valid).toBe(false);
            expect(result.errors.some((e) => e.code === 'INVALID_HIDE_OPERATION')).toBe(true);
        });

        it('should reject hide operation with method but no path', () => {
            const result = validateOverlay({
                irOverlayVersion: '0.1',
                name: 'test',
                hideOperations: [{ method: 'GET' }],
            });
            expect(result.valid).toBe(false);
        });

        it('should reject invalid HTTP method', () => {
            const result = validateOverlay({
                irOverlayVersion: '0.1',
                name: 'test',
                hideOperations: [{ method: 'INVALID', path: '/test' }],
            });
            expect(result.valid).toBe(false);
        });

        it('should warn on duplicate operationId', () => {
            const result = validateOverlay({
                irOverlayVersion: '0.1',
                name: 'test',
                hideOperations: [
                    { operationId: 'duplicate' },
                    { operationId: 'duplicate' },
                ],
            });
            expect(result.valid).toBe(true);
            expect(result.warnings.some((w) => w.code === 'DUPLICATE_VALUE')).toBe(true);
        });
    });

    describe('serverOverrides validation', () => {
        it('should reject missing pattern', () => {
            const result = validateOverlay({
                irOverlayVersion: '0.1',
                name: 'test',
                serverOverrides: [{ replacement: 'https://api.example.com' }],
            });
            expect(result.valid).toBe(false);
        });

        it('should reject missing replacement', () => {
            const result = validateOverlay({
                irOverlayVersion: '0.1',
                name: 'test',
                serverOverrides: [{ pattern: 'http://localhost' }],
            });
            expect(result.valid).toBe(false);
        });

        it('should reject invalid regex pattern', () => {
            const result = validateOverlay({
                irOverlayVersion: '0.1',
                name: 'test',
                serverOverrides: [
                    {
                        pattern: '[invalid(regex',
                        replacement: 'https://api.example.com',
                        isRegex: true,
                    },
                ],
            });
            expect(result.valid).toBe(false);
            expect(result.errors.some((e) => e.code === 'INVALID_REGEX')).toBe(true);
        });
    });

    describe('schemaRedactions validation', () => {
        it('should reject missing schemaId', () => {
            const result = validateOverlay({
                irOverlayVersion: '0.1',
                name: 'test',
                schemaRedactions: [{ fields: ['field1'] }],
            });
            expect(result.valid).toBe(false);
        });

        it('should reject empty fields array', () => {
            const result = validateOverlay({
                irOverlayVersion: '0.1',
                name: 'test',
                schemaRedactions: [{ schemaId: 'User', fields: [] }],
            });
            expect(result.valid).toBe(false);
        });

        it('should warn on duplicate field redactions', () => {
            const result = validateOverlay({
                irOverlayVersion: '0.1',
                name: 'test',
                schemaRedactions: [
                    { schemaId: 'User', fields: ['field1'] },
                    { schemaId: 'User', fields: ['field1', 'field2'] },
                ],
            });
            expect(result.valid).toBe(true);
            expect(result.warnings.some((w) => w.code === 'DUPLICATE_VALUE')).toBe(true);
        });
    });

    describe('responseRedactions validation', () => {
        it('should reject missing operationId', () => {
            const result = validateOverlay({
                irOverlayVersion: '0.1',
                name: 'test',
                responseRedactions: [{ fields: ['field1'] }],
            });
            expect(result.valid).toBe(false);
        });

        it('should reject invalid statusCode', () => {
            const result = validateOverlay({
                irOverlayVersion: '0.1',
                name: 'test',
                responseRedactions: [
                    { operationId: 'test', statusCode: 999, fields: ['field1'] },
                ],
            });
            expect(result.valid).toBe(false);
        });

        it('should reject empty fields array', () => {
            const result = validateOverlay({
                irOverlayVersion: '0.1',
                name: 'test',
                responseRedactions: [{ operationId: 'test', fields: [] }],
            });
            expect(result.valid).toBe(false);
        });
    });

    describe('requestRedactions validation', () => {
        it('should reject missing operationId', () => {
            const result = validateOverlay({
                irOverlayVersion: '0.1',
                name: 'test',
                requestRedactions: [{ fields: ['field1'] }],
            });
            expect(result.valid).toBe(false);
        });

        it('should reject empty fields array', () => {
            const result = validateOverlay({
                irOverlayVersion: '0.1',
                name: 'test',
                requestRedactions: [{ operationId: 'test', fields: [] }],
            });
            expect(result.valid).toBe(false);
        });
    });
});

describe('isOverlay', () => {
    it('should return true for valid overlay', () => {
        expect(
            isOverlay({
                irOverlayVersion: '0.1',
                name: 'test',
            })
        ).toBe(true);
    });

    it('should return false for invalid overlay', () => {
        expect(isOverlay({})).toBe(false);
        expect(isOverlay(null)).toBe(false);
    });
});

describe('formatOverlayErrors', () => {
    it('should format errors with paths', () => {
        const errors = [
            { path: 'name', message: 'name is required', code: 'REQUIRED_FIELD' },
            { path: 'hideOperations[0].operationId', message: 'must be a string', code: 'INVALID_TYPE' },
        ];
        const formatted = formatOverlayErrors(errors);
        expect(formatted).toContain('[name]');
        expect(formatted).toContain('[hideOperations[0].operationId]');
    });

    it('should handle empty errors array', () => {
        expect(formatOverlayErrors([])).toBe('');
    });

    it('should handle errors without path', () => {
        const errors = [{ path: '', message: 'Root level error', code: 'ERROR' }];
        const formatted = formatOverlayErrors(errors);
        expect(formatted).toBe('Root level error');
    });
});
