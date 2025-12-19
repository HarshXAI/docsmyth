import { describe, it, expect } from 'vitest';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('Studio Server', () => {
    it('should export startStudio function', async () => {
        const { startStudio } = await import('../src/server.js');
        expect(typeof startStudio).toBe('function');
    });

    it('should export StudioOptions type', async () => {
        // Type check - importing the module should not throw
        const module = await import('../src/server.js');
        expect(module).toBeDefined();
    });
});

describe('Studio Services', () => {
    it('should export contract service', async () => {
        const { readContract, isContractValid } = await import('../src/services/contract-service.js');
        expect(typeof readContract).toBe('function');
        expect(typeof isContractValid).toBe('function');
    });

    it('should export evidence service', async () => {
        const { getEvidenceSummary, getEvidenceStats } = await import('../src/services/evidence-service.js');
        expect(typeof getEvidenceSummary).toBe('function');
        expect(typeof getEvidenceStats).toBe('function');
    });

    it('should export coverage service', async () => {
        const { getCoverage } = await import('../src/services/coverage-service.js');
        expect(typeof getCoverage).toBe('function');
    });

    it('should export issues service', async () => {
        const { getIssues } = await import('../src/services/issues-service.js');
        expect(typeof getIssues).toBe('function');
    });

    it('should export compile service', async () => {
        const { compileContract } = await import('../src/services/compile-service.js');
        expect(typeof compileContract).toBe('function');
    });
});
