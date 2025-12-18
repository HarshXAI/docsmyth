/**
 * Sanitizer Profiles Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { EvidenceEvent } from '../src/types.js';
import { sanitize } from '../src/sanitize.js';
import {
    SANITIZER_PROFILES,
    STRICT_PROFILE,
    BALANCED_PROFILE,
    DEBUG_PROFILE,
    NEVER_CAPTURE_HEADERS,
    getProfile,
    getProfileOrDefault,
    getProfileFromEnv,
    validateNeverCaptureRules,
    enforceNeverCaptureRules,
} from '../src/profiles.js';

function createTestEvent(overrides: Partial<EvidenceEvent> = {}): EvidenceEvent {
    return {
        evidenceVersion: '0.1',
        operationId: 'testOperation',
        protocol: 'http',
        timestamp: new Date().toISOString(),
        traceId: 'test-trace',
        request: {
            method: 'POST',
            path: '/users',
            headers: {
                'content-type': 'application/json',
                'authorization': 'Bearer secret-token',
                'cookie': 'session=abc123',
                'x-api-key': 'my-api-key',
                'x-request-id': 'req-123',
                'user-agent': 'test-agent',
            },
            body: {
                email: 'user@example.com',
                password: 'secret123',
                name: 'John Doe',
            },
        },
        response: {
            status: 200,
            headers: {
                'content-type': 'application/json',
                'set-cookie': 'session=xyz789',
                'x-trace-id': 'trace-456',
            },
            body: {
                userId: 'user-123',
                token: 'access-token-here',
            },
        },
        ...overrides,
    };
}

describe('Sanitizer Profiles', () => {
    describe('NEVER_CAPTURE_HEADERS', () => {
        it('should include critical security headers', () => {
            expect(NEVER_CAPTURE_HEADERS).toContain('authorization');
            expect(NEVER_CAPTURE_HEADERS).toContain('cookie');
            expect(NEVER_CAPTURE_HEADERS).toContain('set-cookie');
            expect(NEVER_CAPTURE_HEADERS).toContain('x-api-key');
            expect(NEVER_CAPTURE_HEADERS).toContain('x-auth-token');
            expect(NEVER_CAPTURE_HEADERS).toContain('proxy-authorization');
        });
    });

    describe('STRICT_PROFILE', () => {
        it('should remove all sensitive headers except content-type', () => {
            const event = createTestEvent();
            const sanitized = sanitize(event, STRICT_PROFILE.config);

            // Should keep content-type
            expect(sanitized.request.headers?.['content-type']).toBe('application/json');

            // Should remove never-capture headers
            expect(sanitized.request.headers?.['authorization']).toBeUndefined();
            expect(sanitized.request.headers?.['cookie']).toBeUndefined();
            expect(sanitized.request.headers?.['x-api-key']).toBeUndefined();

            // Should remove non-allowlisted headers
            expect(sanitized.request.headers?.['x-request-id']).toBeUndefined();
            expect(sanitized.request.headers?.['user-agent']).toBeUndefined();

            // Response headers
            expect(sanitized.response.headers?.['set-cookie']).toBeUndefined();
        });

        it('should mask extended sensitive fields', () => {
            const event = createTestEvent({
                request: {
                    method: 'POST',
                    path: '/users',
                    body: {
                        email: 'user@example.com',
                        phone: '555-1234',
                        password: 'secret',
                    },
                },
            });

            const sanitized = sanitize(event, STRICT_PROFILE.config);
            const body = sanitized.request.body as Record<string, string>;

            expect(body.password).toBe('[REDACTED]');
            // Email is masked by PII pattern, not field name in default config
            // but strict profile includes email in sensitiveFields
            expect(body.email).toBe('[REDACTED]');
        });

        it('should mask PII patterns', () => {
            const event = createTestEvent({
                request: {
                    method: 'POST',
                    path: '/notes',
                    body: {
                        note: 'Contact me at test@example.com or 555-123-4567',
                    },
                },
            });

            const sanitized = sanitize(event, STRICT_PROFILE.config);
            const body = sanitized.request.body as Record<string, string>;

            expect(body.note).not.toContain('test@example.com');
            expect(body.note).toContain('[REDACTED]');
        });
    });

    describe('BALANCED_PROFILE', () => {
        it('should keep common debugging headers', () => {
            const event = createTestEvent();
            const sanitized = sanitize(event, BALANCED_PROFILE.config);

            // Should keep allowed headers
            expect(sanitized.request.headers?.['content-type']).toBe('application/json');
            expect(sanitized.request.headers?.['x-request-id']).toBe('req-123');

            // Should remove never-capture headers
            expect(sanitized.request.headers?.['authorization']).toBeUndefined();
            expect(sanitized.request.headers?.['cookie']).toBeUndefined();

            // Should remove non-allowlisted headers
            expect(sanitized.request.headers?.['user-agent']).toBeUndefined();
        });

        it('should mask sensitive body fields', () => {
            const event = createTestEvent();
            const sanitized = sanitize(event, BALANCED_PROFILE.config);

            const body = sanitized.request.body as Record<string, string>;
            expect(body.password).toBe('[REDACTED]');
            expect(body.name).toBe('John Doe'); // Not a sensitive field
        });
    });

    describe('DEBUG_PROFILE', () => {
        it('should keep more headers than other profiles', () => {
            const event = createTestEvent();
            const sanitized = sanitize(event, DEBUG_PROFILE.config);

            // Should keep more headers
            expect(sanitized.request.headers?.['content-type']).toBe('application/json');
            expect(sanitized.request.headers?.['x-request-id']).toBe('req-123');
            expect(sanitized.request.headers?.['user-agent']).toBe('test-agent');

            // But STILL remove never-capture headers
            expect(sanitized.request.headers?.['authorization']).toBeUndefined();
            expect(sanitized.request.headers?.['cookie']).toBeUndefined();
            expect(sanitized.request.headers?.['x-api-key']).toBeUndefined();
        });

        it('should still enforce token masking', () => {
            const event = createTestEvent({
                request: {
                    method: 'POST',
                    path: '/auth',
                    body: {
                        accessToken: 'my-access-token',
                        refreshToken: 'my-refresh-token',
                    },
                },
            });

            const sanitized = sanitize(event, DEBUG_PROFILE.config);
            const body = sanitized.request.body as Record<string, string>;

            expect(body.accessToken).toBe('[REDACTED]');
            expect(body.refreshToken).toBe('[REDACTED]');
        });

        it('should still enforce PII masking', () => {
            const event = createTestEvent({
                request: {
                    method: 'POST',
                    path: '/notes',
                    body: {
                        text: 'My SSN is 123-45-6789',
                    },
                },
            });

            const sanitized = sanitize(event, DEBUG_PROFILE.config);
            const body = sanitized.request.body as Record<string, string>;

            expect(body.text).not.toContain('123-45-6789');
        });
    });

    describe('All profiles enforce never-capture', () => {
        const profiles = [STRICT_PROFILE, BALANCED_PROFILE, DEBUG_PROFILE];

        for (const profile of profiles) {
            it(`${profile.name} profile should never capture authorization header`, () => {
                const event = createTestEvent();
                const sanitized = sanitize(event, profile.config);
                expect(sanitized.request.headers?.['authorization']).toBeUndefined();
            });

            it(`${profile.name} profile should never capture cookie header`, () => {
                const event = createTestEvent();
                const sanitized = sanitize(event, profile.config);
                expect(sanitized.request.headers?.['cookie']).toBeUndefined();
            });

            it(`${profile.name} profile should never capture set-cookie header`, () => {
                const event = createTestEvent();
                const sanitized = sanitize(event, profile.config);
                expect(sanitized.response.headers?.['set-cookie']).toBeUndefined();
            });

            it(`${profile.name} profile should never capture x-api-key header`, () => {
                const event = createTestEvent();
                const sanitized = sanitize(event, profile.config);
                expect(sanitized.request.headers?.['x-api-key']).toBeUndefined();
            });
        }
    });
});

describe('getProfile', () => {
    it('should return profile by name', () => {
        expect(getProfile('strict')).toBe(STRICT_PROFILE);
        expect(getProfile('balanced')).toBe(BALANCED_PROFILE);
        expect(getProfile('debug')).toBe(DEBUG_PROFILE);
    });

    it('should return undefined for unknown profile', () => {
        expect(getProfile('unknown')).toBeUndefined();
    });
});

describe('getProfileOrDefault', () => {
    it('should return profile by name', () => {
        expect(getProfileOrDefault('strict')).toBe(STRICT_PROFILE);
    });

    it('should return balanced for unknown profile', () => {
        expect(getProfileOrDefault('unknown')).toBe(BALANCED_PROFILE);
    });

    it('should return balanced for undefined', () => {
        expect(getProfileOrDefault()).toBe(BALANCED_PROFILE);
        expect(getProfileOrDefault(undefined)).toBe(BALANCED_PROFILE);
    });
});

describe('getProfileFromEnv', () => {
    const originalEnv = process.env.ACP_SANITIZER_PROFILE;

    afterEach(() => {
        if (originalEnv === undefined) {
            delete process.env.ACP_SANITIZER_PROFILE;
        } else {
            process.env.ACP_SANITIZER_PROFILE = originalEnv;
        }
    });

    it('should read profile from environment', () => {
        process.env.ACP_SANITIZER_PROFILE = 'strict';
        expect(getProfileFromEnv()).toBe(STRICT_PROFILE);
    });

    it('should return balanced when env is not set', () => {
        delete process.env.ACP_SANITIZER_PROFILE;
        expect(getProfileFromEnv()).toBe(BALANCED_PROFILE);
    });

    it('should return balanced for invalid env value', () => {
        process.env.ACP_SANITIZER_PROFILE = 'invalid';
        expect(getProfileFromEnv()).toBe(BALANCED_PROFILE);
    });
});

describe('validateNeverCaptureRules', () => {
    it('should pass for valid config', () => {
        const result = validateNeverCaptureRules({
            allowlistHeaders: ['content-type', 'x-request-id'],
        });
        expect(result.valid).toBe(true);
        expect(result.violations).toHaveLength(0);
    });

    it('should fail if allowlist includes never-capture header', () => {
        const result = validateNeverCaptureRules({
            allowlistHeaders: ['content-type', 'authorization'],
        });
        expect(result.valid).toBe(false);
        expect(result.violations).toContain('Allowlist includes never-capture header: authorization');
    });

    it('should catch multiple violations', () => {
        const result = validateNeverCaptureRules({
            allowlistHeaders: ['authorization', 'cookie', 'content-type'],
        });
        expect(result.valid).toBe(false);
        expect(result.violations).toHaveLength(2);
    });
});

describe('enforceNeverCaptureRules', () => {
    it('should remove never-capture headers from allowlist', () => {
        const result = enforceNeverCaptureRules({
            allowlistHeaders: ['content-type', 'authorization', 'cookie'],
        });
        expect(result.allowlistHeaders).toContain('content-type');
        expect(result.allowlistHeaders).not.toContain('authorization');
        expect(result.allowlistHeaders).not.toContain('cookie');
    });

    it('should add never-capture headers to denylist', () => {
        const result = enforceNeverCaptureRules({
            denylistHeaders: ['custom-header'],
        });
        expect(result.denylistHeaders).toContain('custom-header');
        expect(result.denylistHeaders).toContain('authorization');
        expect(result.denylistHeaders).toContain('cookie');
    });

    it('should force maskTokens to true', () => {
        const result = enforceNeverCaptureRules({
            maskTokens: false,
        });
        expect(result.maskTokens).toBe(true);
    });
});

describe('Profile consistency', () => {
    it('all profiles should have denylist including never-capture headers', () => {
        for (const [name, profile] of Object.entries(SANITIZER_PROFILES)) {
            const denylist = profile.config.denylistHeaders ?? [];
            const denylistLower = denylist.map((h) => h.toLowerCase());

            for (const neverCapture of NEVER_CAPTURE_HEADERS) {
                expect(
                    denylistLower.includes(neverCapture),
                    `${name} profile should have ${neverCapture} in denylist`
                ).toBe(true);
            }
        }
    });

    it('all profiles should have maskTokens enabled', () => {
        for (const [name, profile] of Object.entries(SANITIZER_PROFILES)) {
            expect(profile.config.maskTokens, `${name} profile should have maskTokens=true`).toBe(true);
        }
    });

    it('all profiles should have maskPii enabled', () => {
        for (const [name, profile] of Object.entries(SANITIZER_PROFILES)) {
            expect(profile.config.maskPii, `${name} profile should have maskPii=true`).toBe(true);
        }
    });
});
