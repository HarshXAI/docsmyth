/**
 * Tests for logger utility
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createLogger } from '../src/logger.js';

describe('createLogger', () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stderrSpy.mockRestore();
    stdoutSpy.mockRestore();
  });

  describe('log levels', () => {
    it('should log errors when level is "error"', () => {
      const logger = createLogger({ level: 'error' });
      logger.error('test error');
      logger.warn('test warn');
      logger.info('test info');
      logger.debug('test debug');

      expect(stderrSpy).toHaveBeenCalledTimes(1);
      expect(stdoutSpy).toHaveBeenCalledTimes(0);
    });

    it('should log errors and warns when level is "warn"', () => {
      const logger = createLogger({ level: 'warn' });
      logger.error('test error');
      logger.warn('test warn');
      logger.info('test info');
      logger.debug('test debug');

      expect(stderrSpy).toHaveBeenCalledTimes(2);
      expect(stdoutSpy).toHaveBeenCalledTimes(0);
    });

    it('should log errors, warns, and info when level is "info"', () => {
      const logger = createLogger({ level: 'info' });
      logger.error('test error');
      logger.warn('test warn');
      logger.info('test info');
      logger.debug('test debug');

      expect(stderrSpy).toHaveBeenCalledTimes(2);
      expect(stdoutSpy).toHaveBeenCalledTimes(1);
    });

    it('should log all when level is "debug"', () => {
      const logger = createLogger({ level: 'debug' });
      logger.error('test error');
      logger.warn('test warn');
      logger.info('test info');
      logger.debug('test debug');

      expect(stderrSpy).toHaveBeenCalledTimes(2);
      expect(stdoutSpy).toHaveBeenCalledTimes(2);
    });

    it('should log nothing when level is "silent"', () => {
      const logger = createLogger({ level: 'silent' });
      logger.error('test error');
      logger.warn('test warn');
      logger.info('test info');
      logger.debug('test debug');

      expect(stderrSpy).toHaveBeenCalledTimes(0);
      expect(stdoutSpy).toHaveBeenCalledTimes(0);
    });
  });

  describe('prefix', () => {
    it('should use default prefix [acp]', () => {
      const logger = createLogger({ level: 'error' });
      logger.error('test message');

      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('[acp]'));
    });

    it('should use custom prefix', () => {
      const logger = createLogger({ level: 'error', prefix: '[custom]' });
      logger.error('test message');

      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('[custom]'));
    });
  });

  describe('formatting', () => {
    it('should include log level in output', () => {
      const logger = createLogger({ level: 'error' });
      logger.error('test message');

      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('[error]'));
    });

    it('should format Error objects', () => {
      const logger = createLogger({ level: 'error' });
      logger.error('failed:', new Error('Something went wrong'));

      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('Something went wrong'));
    });

    it('should format objects as JSON', () => {
      const logger = createLogger({ level: 'info' });
      logger.info('data:', { key: 'value' });

      expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('"key"'));
      expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('"value"'));
    });
  });

  describe('default level', () => {
    it('should default to "warn" level', () => {
      const logger = createLogger();
      logger.error('test error');
      logger.warn('test warn');
      logger.info('test info');

      expect(stderrSpy).toHaveBeenCalledTimes(2); // error + warn
      expect(stdoutSpy).toHaveBeenCalledTimes(0); // no info
    });
  });
});
