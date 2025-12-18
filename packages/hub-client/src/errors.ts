/**
 * @docsmyth/hub-client - Custom error types for Hub client
 */

import type { HubErrorResponse } from './types.js';

/**
 * Base class for Hub client errors
 */
export class HubClientError extends Error {
    public readonly statusCode: number;
    public readonly response?: HubErrorResponse;

    constructor(message: string, statusCode: number, response?: HubErrorResponse) {
        super(message);
        this.name = 'HubClientError';
        this.statusCode = statusCode;
        this.response = response;
    }
}

/**
 * Hub is unreachable or timed out
 */
export class HubConnectionError extends HubClientError {
    constructor(message: string, cause?: Error) {
        super(message, 0);
        this.name = 'HubConnectionError';
        if (cause) {
            this.cause = cause;
        }
    }
}

/**
 * Resource not found (404)
 */
export class HubNotFoundError extends HubClientError {
    constructor(message: string, response?: HubErrorResponse) {
        super(message, 404, response);
        this.name = 'HubNotFoundError';
    }
}

/**
 * Version conflict (409)
 */
export class HubConflictError extends HubClientError {
    public readonly existingHash?: string;

    constructor(message: string, response?: HubErrorResponse & { existingHash?: string }) {
        super(message, 409, response);
        this.name = 'HubConflictError';
        this.existingHash = response?.existingHash;
    }
}

/**
 * Validation error (400)
 */
export class HubValidationError extends HubClientError {
    public readonly validationErrors: Array<{ message: string; path?: string }>;

    constructor(message: string, response?: HubErrorResponse) {
        super(message, 400, response);
        this.name = 'HubValidationError';
        this.validationErrors = response?.validationErrors ?? [];
    }
}

/**
 * Authentication error (401)
 */
export class HubAuthError extends HubClientError {
    constructor(message: string, response?: HubErrorResponse) {
        super(message, 401, response);
        this.name = 'HubAuthError';
    }
}

/**
 * Server error (5xx)
 */
export class HubServerError extends HubClientError {
    constructor(message: string, statusCode: number, response?: HubErrorResponse) {
        super(message, statusCode, response);
        this.name = 'HubServerError';
    }
}
