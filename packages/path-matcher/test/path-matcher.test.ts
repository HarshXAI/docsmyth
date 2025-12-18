import { describe, it, expect } from 'vitest';
import {
    expressPathToIrPath,
    irPathToExpressPath,
    normalizePath,
    matchPath,
    createPathMatcher,
} from '../src/path-matcher.js';

describe('path-matcher', () => {
    describe('expressPathToIrPath', () => {
        it('converts simple path parameter', () => {
            expect(expressPathToIrPath('/users/:id')).toBe('/users/{id}');
        });

        it('converts multiple path parameters', () => {
            expect(expressPathToIrPath('/users/:userId/posts/:postId')).toBe(
                '/users/{userId}/posts/{postId}'
            );
        });

        it('handles path with no parameters', () => {
            expect(expressPathToIrPath('/health')).toBe('/health');
        });

        it('handles underscore in param name', () => {
            expect(expressPathToIrPath('/users/:user_id')).toBe('/users/{user_id}');
        });
    });

    describe('irPathToExpressPath', () => {
        it('converts simple path parameter', () => {
            expect(irPathToExpressPath('/users/{id}')).toBe('/users/:id');
        });

        it('converts multiple path parameters', () => {
            expect(irPathToExpressPath('/users/{userId}/posts/{postId}')).toBe(
                '/users/:userId/posts/:postId'
            );
        });

        it('handles path with no parameters', () => {
            expect(irPathToExpressPath('/health')).toBe('/health');
        });
    });

    describe('normalizePath', () => {
        it('removes trailing slash', () => {
            expect(normalizePath('/users/')).toBe('/users');
        });

        it('preserves root path', () => {
            expect(normalizePath('/')).toBe('/');
        });

        it('adds leading slash', () => {
            expect(normalizePath('users')).toBe('/users');
        });

        it('handles empty string', () => {
            expect(normalizePath('')).toBe('/');
        });

        it('removes multiple trailing slashes', () => {
            expect(normalizePath('/users///')).toBe('/users');
        });
    });

    describe('createPathMatcher', () => {
        it('creates matcher for static path', () => {
            const matcher = createPathMatcher('/health');
            expect(matcher.paramNames).toEqual([]);
            expect('/health'.match(matcher.regex)).toBeTruthy();
            expect('/healthz'.match(matcher.regex)).toBeFalsy();
        });

        it('creates matcher for parameterized path', () => {
            const matcher = createPathMatcher('/users/{id}');
            expect(matcher.paramNames).toEqual(['id']);
            expect('/users/123'.match(matcher.regex)).toBeTruthy();
            expect('/users'.match(matcher.regex)).toBeFalsy();
        });

        it('creates matcher for multiple parameters', () => {
            const matcher = createPathMatcher('/users/{userId}/posts/{postId}');
            expect(matcher.paramNames).toEqual(['userId', 'postId']);
            const match = '/users/abc/posts/xyz'.match(matcher.regex);
            expect(match).toBeTruthy();
            expect(match![1]).toBe('abc');
            expect(match![2]).toBe('xyz');
        });

        it('stores normalized pattern', () => {
            const matcher = createPathMatcher('/users/{id}/');
            expect(matcher.pattern).toBe('/users/{id}');
        });
    });

    describe('matchPath', () => {
        it('matches static path', () => {
            const result = matchPath('/health', '/health');
            expect(result).toEqual({});
        });

        it('extracts single path parameter', () => {
            const result = matchPath('/users/123', '/users/{id}');
            expect(result).toEqual({ id: '123' });
        });

        it('extracts multiple path parameters', () => {
            const result = matchPath('/users/abc/posts/xyz', '/users/{userId}/posts/{postId}');
            expect(result).toEqual({ userId: 'abc', postId: 'xyz' });
        });

        it('returns null for non-matching path', () => {
            const result = matchPath('/orders/123', '/users/{id}');
            expect(result).toBeNull();
        });

        it('returns null for partial match', () => {
            const result = matchPath('/users/123/extra', '/users/{id}');
            expect(result).toBeNull();
        });

        it('handles trailing slash in request', () => {
            const result = matchPath('/users/123/', '/users/{id}');
            expect(result).toEqual({ id: '123' });
        });

        it('handles trailing slash in pattern', () => {
            const result = matchPath('/users/123', '/users/{id}/');
            expect(result).toEqual({ id: '123' });
        });

        it('handles URL encoded path segments', () => {
            const result = matchPath('/users/john%20doe', '/users/{id}');
            expect(result).toEqual({ id: 'john%20doe' });
        });

        it('matches root path', () => {
            const result = matchPath('/', '/');
            expect(result).toEqual({});
        });

        it('does not match different paths', () => {
            expect(matchPath('/users', '/orders')).toBeNull();
        });

        it('handles special regex characters in static segments', () => {
            const result = matchPath('/api.v1/users', '/api.v1/users');
            expect(result).toEqual({});
        });
    });
});
