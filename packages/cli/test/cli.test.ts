import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { validateCommand } from '../src/commands/validate.js';
import { diffCommand } from '../src/commands/diff.js';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, '../../../fixtures/contract-ir/v0.1');
const diffFixturesDir = join(__dirname, '../../../fixtures/diff');

describe('@docsmyth/cli', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => { });
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit(${code})`);
    });
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  describe('validateCommand', () => {
    it('should validate a valid IR file', () => {
      const fixturePath = join(fixturesDir, 'minimal-http.json');

      expect(() => validateCommand(fixturePath, {})).toThrow('process.exit(0)');
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('✓ Contract IR is valid'));
    });

    it('should fail for non-existent file', () => {
      expect(() => validateCommand('/nonexistent/file.json', {})).toThrow('process.exit(1)');
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('File not found'));
    });

    it('should support verbose option', () => {
      const fixturePath = join(fixturesDir, 'minimal-http.json');

      expect(() => validateCommand(fixturePath, { verbose: true })).toThrow('process.exit(0)');
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Validation details'));
    });
  });

  describe('diffCommand', () => {
    it('should exit 0 when no breaking changes detected', async () => {
      const basePath = join(diffFixturesDir, 'base.json');
      const headPath = join(diffFixturesDir, 'head-compatible.json');

      try {
        await diffCommand(basePath, headPath, { format: 'text', failOn: 'breaking' });
        throw new Error('Expected process.exit to be called');
      } catch (e) {
        expect((e as Error).message).toBe('process.exit(0)');
      }
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('No changes detected'));
    });

    it('should exit 1 when breaking changes detected with fail-on breaking', async () => {
      const basePath = join(diffFixturesDir, 'base.json');
      const headPath = join(diffFixturesDir, 'head-breaking.json');

      try {
        await diffCommand(basePath, headPath, { format: 'text', failOn: 'breaking' });
        throw new Error('Expected process.exit to be called');
      } catch (e) {
        expect((e as Error).message).toBe('process.exit(1)');
      }
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('BREAKING CHANGES DETECTED'));
    });

    it('should exit 0 when breaking changes detected with fail-on none', async () => {
      const basePath = join(diffFixturesDir, 'base.json');
      const headPath = join(diffFixturesDir, 'head-breaking.json');

      try {
        await diffCommand(basePath, headPath, { format: 'text', failOn: 'none' });
        throw new Error('Expected process.exit to be called');
      } catch (e) {
        expect((e as Error).message).toBe('process.exit(0)');
      }
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('BREAKING CHANGES DETECTED'));
    });

    it('should output JSON format when requested', async () => {
      const basePath = join(diffFixturesDir, 'base.json');
      const headPath = join(diffFixturesDir, 'head-breaking.json');

      try {
        await diffCommand(basePath, headPath, { format: 'json', failOn: 'breaking' });
        throw new Error('Expected process.exit to be called');
      } catch (e) {
        expect((e as Error).message).toBe('process.exit(1)');
      }
      const jsonOutput = consoleLogSpy.mock.calls[0][0];
      const parsed = JSON.parse(jsonOutput);
      expect(parsed.version).toBe('1.0');
      expect(parsed.hasBreakingChanges).toBe(true);
    });

    it('should fail for non-existent file', async () => {
      try {
        await diffCommand('/nonexistent/base.json', '/nonexistent/head.json', { format: 'text' });
        throw new Error('Expected process.exit to be called');
      } catch (e) {
        expect((e as Error).message).toBe('process.exit(2)');
      }
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error'));
    });
  });
});
