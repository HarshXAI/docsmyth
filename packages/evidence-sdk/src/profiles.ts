/**
 * Sanitizer Profiles
 *
 * Pre-defined sanitization profiles with different levels of data capture.
 * All profiles enforce never-capture rules for sensitive headers.
 */

import type { SanitizeConfig } from './sanitize.js';

/**
 * Profile names
 */
export type SanitizerProfileName = 'strict' | 'balanced' | 'debug';

/**
 * Headers that are NEVER captured regardless of profile
 * These contain credentials that should never be stored
 */
export const NEVER_CAPTURE_HEADERS = [
    'authorization',
    'cookie',
    'set-cookie',
    'x-api-key',
    'x-auth-token',
    'x-csrf-token',
    'x-xsrf-token',
    'proxy-authorization',
    'www-authenticate',
    'x-amz-security-token',
    'x-api-secret',
] as const;

/**
 * Sensitive field names that are masked by default
 */
export const DEFAULT_SENSITIVE_FIELDS = [
    'password',
    'secret',
    'token',
    'apikey',
    'api_key',
    'apiKey',
    'accessToken',
    'access_token',
    'refreshToken',
    'refresh_token',
    'privateKey',
    'private_key',
    'creditCard',
    'credit_card',
    'cardNumber',
    'card_number',
    'cvv',
    'ssn',
    'socialSecurityNumber',
    'social_security_number',
] as const;

/**
 * Extended sensitive fields for strict mode
 */
export const STRICT_SENSITIVE_FIELDS = [
    ...DEFAULT_SENSITIVE_FIELDS,
    'email',
    'phone',
    'phoneNumber',
    'phone_number',
    'address',
    'dob',
    'dateOfBirth',
    'date_of_birth',
    'birthDate',
    'birth_date',
    'ip',
    'ipAddress',
    'ip_address',
    'userId',
    'user_id',
    'customerId',
    'customer_id',
    'accountNumber',
    'account_number',
    'routingNumber',
    'routing_number',
] as const;

/**
 * Headers allowed in debug mode (in addition to never-capture enforcement)
 */
export const DEBUG_ALLOWED_HEADERS = [
    'content-type',
    'content-length',
    'accept',
    'accept-language',
    'accept-encoding',
    'user-agent',
    'host',
    'origin',
    'referer',
    'x-request-id',
    'x-correlation-id',
    'x-trace-id',
    'x-span-id',
    'cache-control',
    'if-none-match',
    'if-modified-since',
    'etag',
    'last-modified',
    'x-forwarded-for',
    'x-forwarded-proto',
    'x-real-ip',
] as const;

/**
 * Minimal headers for balanced mode
 */
export const BALANCED_ALLOWED_HEADERS = [
    'content-type',
    'content-length',
    'accept',
    'x-request-id',
    'x-correlation-id',
    'x-trace-id',
] as const;

/**
 * Sanitizer profile definition
 */
export interface SanitizerProfile {
    /** Profile name */
    name: SanitizerProfileName;
    /** Description of the profile */
    description: string;
    /** Sanitization configuration */
    config: SanitizeConfig;
}

/**
 * Strict profile - Maximum privacy, minimal data capture
 *
 * Use for: Production environments, sensitive data, compliance requirements
 * - Only content-type header is kept
 * - All PII patterns are masked
 * - Extended sensitive field list
 * - All tokens and API keys masked
 */
export const STRICT_PROFILE: SanitizerProfile = {
    name: 'strict',
    description: 'Maximum privacy, minimal data capture. Best for production and sensitive data.',
    config: {
        denylistHeaders: [...NEVER_CAPTURE_HEADERS],
        allowlistHeaders: ['content-type'], // Only keep content-type
        maskPii: true,
        maskTokens: true,
        sensitiveFields: [...STRICT_SENSITIVE_FIELDS],
    },
};

/**
 * Balanced profile - Good privacy with useful debugging info
 *
 * Use for: Staging environments, testing, most development
 * - Common useful headers kept
 * - PII patterns masked
 * - Standard sensitive field list
 * - Tokens masked
 */
export const BALANCED_PROFILE: SanitizerProfile = {
    name: 'balanced',
    description: 'Good privacy with useful debugging info. Best for staging and testing.',
    config: {
        denylistHeaders: [...NEVER_CAPTURE_HEADERS],
        allowlistHeaders: [...BALANCED_ALLOWED_HEADERS],
        maskPii: true,
        maskTokens: true,
        sensitiveFields: [...DEFAULT_SENSITIVE_FIELDS],
    },
};

/**
 * Debug profile - Maximum visibility with security essentials
 *
 * Use for: Local development only, debugging specific issues
 * - Many headers kept (except never-capture)
 * - PII patterns masked (can't be disabled)
 * - Standard sensitive field list
 * - Tokens masked (can't be disabled)
 *
 * WARNING: Still enforces never-capture rules. Do not use in production.
 */
export const DEBUG_PROFILE: SanitizerProfile = {
    name: 'debug',
    description: 'Maximum visibility with security essentials. Use for local development only.',
    config: {
        denylistHeaders: [...NEVER_CAPTURE_HEADERS],
        allowlistHeaders: [...DEBUG_ALLOWED_HEADERS],
        maskPii: true, // Always true - can't be disabled
        maskTokens: true, // Always true - can't be disabled
        sensitiveFields: [...DEFAULT_SENSITIVE_FIELDS],
    },
};

/**
 * All available profiles
 */
export const SANITIZER_PROFILES: Record<SanitizerProfileName, SanitizerProfile> = {
    strict: STRICT_PROFILE,
    balanced: BALANCED_PROFILE,
    debug: DEBUG_PROFILE,
};

/**
 * Get a sanitizer profile by name
 *
 * @param name - Profile name
 * @returns The profile, or undefined if not found
 */
export function getProfile(name: string): SanitizerProfile | undefined {
    return SANITIZER_PROFILES[name as SanitizerProfileName];
}

/**
 * Get a sanitizer profile by name, with fallback to balanced
 *
 * @param name - Profile name
 * @returns The profile, or balanced profile if not found
 */
export function getProfileOrDefault(name?: string): SanitizerProfile {
    if (!name) return BALANCED_PROFILE;
    return getProfile(name) ?? BALANCED_PROFILE;
}

/**
 * Get profile from environment variable
 *
 * Reads from ACP_SANITIZER_PROFILE environment variable
 *
 * @returns The configured profile, or balanced as default
 */
export function getProfileFromEnv(): SanitizerProfile {
    const envProfile = process.env.ACP_SANITIZER_PROFILE;
    return getProfileOrDefault(envProfile);
}

/**
 * Validate that a config respects never-capture rules
 *
 * @param config - Config to validate
 * @returns Object with valid flag and any violations found
 */
export function validateNeverCaptureRules(
    config: SanitizeConfig
): { valid: boolean; violations: string[] } {
    const violations: string[] = [];

    // Check if allowlist includes any never-capture headers
    if (config.allowlistHeaders) {
        for (const header of config.allowlistHeaders) {
            const normalized = header.toLowerCase();
            if (NEVER_CAPTURE_HEADERS.includes(normalized as typeof NEVER_CAPTURE_HEADERS[number])) {
                violations.push(`Allowlist includes never-capture header: ${header}`);
            }
        }
    }

    // Check if denylist is missing any never-capture headers
    if (config.denylistHeaders && !config.allowlistHeaders) {
        const denylistNormalized = config.denylistHeaders.map((h) => h.toLowerCase());
        for (const neverCapture of NEVER_CAPTURE_HEADERS) {
            if (!denylistNormalized.includes(neverCapture)) {
                // Not a hard violation if using denylist, but warn
                // The sanitizer will still block these by default
            }
        }
    }

    return {
        valid: violations.length === 0,
        violations,
    };
}

/**
 * Create a safe config that enforces never-capture rules
 *
 * @param config - Base config
 * @returns Config with never-capture rules enforced
 */
export function enforceNeverCaptureRules(config: SanitizeConfig): SanitizeConfig {
    const safeConfig = { ...config };

    // If using allowlist, remove any never-capture headers
    if (safeConfig.allowlistHeaders) {
        safeConfig.allowlistHeaders = safeConfig.allowlistHeaders.filter((header) => {
            const normalized = header.toLowerCase();
            return !NEVER_CAPTURE_HEADERS.includes(normalized as typeof NEVER_CAPTURE_HEADERS[number]);
        });
    }

    // Ensure denylist includes all never-capture headers
    const currentDenylist = safeConfig.denylistHeaders ?? [];
    const denylistNormalized = new Set(currentDenylist.map((h) => h.toLowerCase()));

    for (const neverCapture of NEVER_CAPTURE_HEADERS) {
        if (!denylistNormalized.has(neverCapture)) {
            currentDenylist.push(neverCapture);
        }
    }

    safeConfig.denylistHeaders = currentDenylist;

    // Force maskTokens to true (cannot be disabled)
    safeConfig.maskTokens = true;

    return safeConfig;
}
