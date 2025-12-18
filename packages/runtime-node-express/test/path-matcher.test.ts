/**
 * Tests for path matching utilities
 */

import { describe, it, expect } from 'vitest';
import {
  expressPathToIrPath,
  irPathToExpressPath,
  normalizePath,
  matchPath,
} from '../src/path-matcher.js';

describe('expressPathToIrPath', () => {
  it('should convert simple path params', () => {
    expect(expressPathToIrPath('/users/:id')).toBe('/users/{id}');
  });

  it('should convert multiple path params', () => {
    expect(expressPathToIrPath('/users/:userId/posts/:postId')).toBe(
      '/users/{userId}/posts/{postId}'
    );
  });

  it('should leave paths without params unchanged', () => {
    expect(expressPathToIrPath('/users')).toBe('/users');
  });

  it('should handle params with underscores', () => {
    expect(expressPathToIrPath('/items/:item_id')).toBe('/items/{item_id}');
  });
});

describe('irPathToExpressPath', () => {
  it('should convert simple path params', () => {
    expect(irPathToExpressPath('/users/{id}')).toBe('/users/:id');
  });

  it('should convert multiple path params', () => {
    expect(irPathToExpressPath('/users/{userId}/posts/{postId}')).toBe(
      '/users/:userId/posts/:postId'
    );
  });

  it('should leave paths without params unchanged', () => {
    expect(irPathToExpressPath('/users')).toBe('/users');
  });
});

describe('normalizePath', () => {
  it('should remove trailing slashes', () => {
    expect(normalizePath('/users/')).toBe('/users');
  });

  it('should keep root path', () => {
    expect(normalizePath('/')).toBe('/');
  });

  it('should add leading slash', () => {
    expect(normalizePath('users')).toBe('/users');
  });

  it('should handle multiple trailing slashes', () => {
    expect(normalizePath('/users///')).toBe('/users');
  });
});

describe('matchPath', () => {
  it('should match exact paths', () => {
    const result = matchPath('/users', '/users');
    expect(result).toEqual({});
  });

  it('should match and extract single param', () => {
    const result = matchPath('/users/123', '/users/{id}');
    expect(result).toEqual({ id: '123' });
  });

  it('should match and extract multiple params', () => {
    const result = matchPath('/users/123/posts/456', '/users/{userId}/posts/{postId}');
    expect(result).toEqual({ userId: '123', postId: '456' });
  });

  it('should return null for non-matching paths', () => {
    const result = matchPath('/orders/123', '/users/{id}');
    expect(result).toBeNull();
  });

  it('should return null for partial matches', () => {
    const result = matchPath('/users/123/extra', '/users/{id}');
    expect(result).toBeNull();
  });

  it('should handle root path', () => {
    const result = matchPath('/', '/');
    expect(result).toEqual({});
  });

  it('should handle trailing slashes in request path', () => {
    const result = matchPath('/users/123/', '/users/{id}');
    expect(result).toEqual({ id: '123' });
  });

  it('should match UUIDs and complex values', () => {
    const result = matchPath('/users/550e8400-e29b-41d4-a716-446655440000', '/users/{id}');
    expect(result).toEqual({ id: '550e8400-e29b-41d4-a716-446655440000' });
  });
});
