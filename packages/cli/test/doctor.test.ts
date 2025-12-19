/**
 * Doctor Command Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { execSync } from 'node:child_process';

// Mock the execSync function
vi.mock('node:child_process', () => ({
    execSync: vi.fn(),
}));

// Test helper: import after mocking
const importDoctor = async () => {
    // Dynamic import to get fresh module
    const mod = await import('../src/commands/doctor.js');
    return mod;
};

describe('Doctor Command', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('doctorCommand', () => {
        it('should run without errors', async () => {
            const { doctorCommand } = await importDoctor();

            // Mock npm view command
            vi.mocked(execSync).mockImplementation((cmd) => {
                if (typeof cmd === 'string' && cmd.includes('npm view')) {
                    return '0.1.1-rc.8';
                }
                if (typeof cmd === 'string' && cmd.includes('git rev-parse')) {
                    return 'abc1234';
                }
                return '';
            });

            // Capture console output
            const logs: string[] = [];
            const originalLog = console.log;
            console.log = (...args) => logs.push(args.join(' '));

            await doctorCommand({ verbose: false });

            console.log = originalLog;

            // Should have printed something
            expect(logs.length).toBeGreaterThan(0);
            expect(logs.some(l => l.includes('Docsmyth Doctor'))).toBe(true);
        });

        it('should show verbose info when verbose flag is set', async () => {
            const { doctorCommand } = await importDoctor();

            vi.mocked(execSync).mockImplementation((cmd) => {
                if (typeof cmd === 'string' && cmd.includes('npm view')) {
                    return '0.1.1-rc.8';
                }
                if (typeof cmd === 'string' && cmd.includes('git rev-parse')) {
                    return 'abc1234';
                }
                return '';
            });

            const logs: string[] = [];
            const originalLog = console.log;
            console.log = (...args) => logs.push(args.join(' '));

            await doctorCommand({ verbose: true });

            console.log = originalLog;

            // Should include verbose info
            expect(logs.some(l => l.includes('Verbose Info') || l.includes('Process args'))).toBe(true);
        });
    });

    describe('printVerboseVersion', () => {
        it('should print version info', async () => {
            const { printVerboseVersion } = await importDoctor();

            vi.mocked(execSync).mockImplementation((cmd) => {
                if (typeof cmd === 'string' && cmd.includes('git rev-parse')) {
                    return 'abc1234';
                }
                return '';
            });

            const logs: string[] = [];
            const originalLog = console.log;
            console.log = (...args) => logs.push(args.join(' '));

            printVerboseVersion();

            console.log = originalLog;

            // Should print version
            expect(logs.some(l => l.includes('@docsmyth/cli'))).toBe(true);
            expect(logs.some(l => l.includes('Node.js'))).toBe(true);
            expect(logs.some(l => l.includes('Platform'))).toBe(true);
        });
    });
});

describe('Package Manager Detection', () => {
    it('should detect npm from environment', async () => {
        const originalEnv = { ...process.env };
        process.env.npm_config_user_agent = 'npm/10.0.0 node/v20.0.0';

        // Force re-import
        vi.resetModules();
        const { doctorCommand } = await importDoctor();

        const logs: string[] = [];
        const originalLog = console.log;
        console.log = (...args) => logs.push(args.join(' '));

        vi.mocked(execSync).mockReturnValue('0.1.1-rc.8');

        await doctorCommand({ verbose: false });

        console.log = originalLog;
        process.env = originalEnv;

        // Should detect npm
        expect(logs.some(l => l.toLowerCase().includes('npm'))).toBe(true);
    });

    it('should detect pnpm from environment', async () => {
        const originalEnv = { ...process.env };
        process.env.npm_config_user_agent = 'pnpm/8.0.0 node/v20.0.0';

        vi.resetModules();
        const { doctorCommand } = await importDoctor();

        const logs: string[] = [];
        const originalLog = console.log;
        console.log = (...args) => logs.push(args.join(' '));

        vi.mocked(execSync).mockReturnValue('0.1.1-rc.8');

        await doctorCommand({ verbose: false });

        console.log = originalLog;
        process.env = originalEnv;

        // Should detect pnpm
        expect(logs.some(l => l.toLowerCase().includes('pnpm'))).toBe(true);
    });
});
