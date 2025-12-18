/**
 * Authentication Middleware
 *
 * Token-based authentication for the Contract Hub.
 * Uses Bearer token authentication with env-configurable token.
 */

import type { Request, Response, NextFunction } from 'express';

/**
 * Auth configuration options
 */
export interface AuthConfig {
    /** Token required for publish operations (from ACP_HUB_TOKEN env var) */
    publishToken: string | null;

    /** Whether reads require authentication */
    requireAuthForReads: boolean;
}

/**
 * Extended Request with auth info
 */
export interface AuthenticatedRequest extends Request {
    /** Whether the request is authenticated */
    isAuthenticated: boolean;
}

/**
 * Extract Bearer token from Authorization header
 */
export function extractBearerToken(authHeader: string | undefined): string | null {
    if (!authHeader) {
        return null;
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
        return null;
    }

    return parts[1];
}

/**
 * Create auth middleware factory
 */
export function createAuthMiddleware(config: AuthConfig) {
    /**
     * Middleware that requires authentication for publish operations
     */
    function requirePublishAuth(req: Request, res: Response, next: NextFunction): void {
        // If no token is configured, authentication is disabled
        if (!config.publishToken) {
            (req as AuthenticatedRequest).isAuthenticated = true;
            next();
            return;
        }

        const token = extractBearerToken(req.headers.authorization);

        if (!token) {
            res.status(401).json({
                error: 'Unauthorized',
                message: 'Missing or invalid Authorization header. Use Bearer token.',
            });
            return;
        }

        // Constant-time comparison to prevent timing attacks
        if (!constantTimeCompare(token, config.publishToken)) {
            res.status(401).json({
                error: 'Unauthorized',
                message: 'Invalid token',
            });
            return;
        }

        (req as AuthenticatedRequest).isAuthenticated = true;
        next();
    }

    /**
     * Middleware that optionally requires authentication for reads
     */
    function optionalReadAuth(req: Request, res: Response, next: NextFunction): void {
        // If reads don't require auth, allow through
        if (!config.requireAuthForReads) {
            (req as AuthenticatedRequest).isAuthenticated = false;
            next();
            return;
        }

        // If no token is configured, allow through
        if (!config.publishToken) {
            (req as AuthenticatedRequest).isAuthenticated = true;
            next();
            return;
        }

        const token = extractBearerToken(req.headers.authorization);

        if (!token) {
            res.status(401).json({
                error: 'Unauthorized',
                message: 'Missing or invalid Authorization header. Use Bearer token.',
            });
            return;
        }

        if (!constantTimeCompare(token, config.publishToken)) {
            res.status(401).json({
                error: 'Unauthorized',
                message: 'Invalid token',
            });
            return;
        }

        (req as AuthenticatedRequest).isAuthenticated = true;
        next();
    }

    return {
        requirePublishAuth,
        optionalReadAuth,
    };
}

/**
 * Constant-time string comparison to prevent timing attacks.
 *
 * Uses XOR comparison and accumulates differences to ensure
 * the comparison takes the same time regardless of where
 * differences occur.
 */
function constantTimeCompare(a: string, b: string): boolean {
    if (a.length !== b.length) {
        return false;
    }

    let result = 0;
    for (let i = 0; i < a.length; i++) {
        result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }

    return result === 0;
}
