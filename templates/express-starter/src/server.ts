/**
 * Express Server with ACP Evidence Capture
 *
 * This server demonstrates ACP integration:
 * - Zod schema validation
 * - Evidence capture middleware (enabled via env var)
 * - Request ID tracking
 * - Error handling
 */

import express, { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { createEvidenceMiddleware } from '@docsmyth/runtime-node-express';
import routes from './routes.js';
import type { ErrorResponse } from './schemas.js';

const app = express();

// ============================================================================
// Middleware Stack
// ============================================================================

// Parse JSON bodies
app.use(express.json({ limit: '1mb' }));

// Request ID middleware
app.use((req: Request, _res: Response, next: NextFunction) => {
  req.headers['x-request-id'] = req.headers['x-request-id'] || randomUUID();
  next();
});

// Request logging (simple)
app.use((req: Request, _res: Response, next: NextFunction) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// ============================================================================
// ACP Evidence Capture Middleware
// ============================================================================

// Enable evidence capture only when ACP_EVIDENCE_ENABLED=1
// This is typically only in dev/test environments
if (process.env.ACP_EVIDENCE_ENABLED === '1') {
  console.log('🔍 ACP Evidence capture ENABLED');
  console.log('   Evidence will be written to: ./evidence.ndjson');

  app.use(
    createEvidenceMiddleware({
      // Path to the contract IR (used for operationId resolution)
      contractPath: './contract/contract.ir.json',

      // Enable capture
      enabled: true,

      // Output path for evidence
      outputPath: './evidence.ndjson',

      // Capture both request and response bodies
      captureRequestBody: true,
      captureResponseBody: true,

      // Maximum body size to capture (100KB)
      maxBodySize: 100_000,

      // Sanitization profile (default is 'balanced')
      // Options: 'strict' | 'balanced' | 'debug'
      // - strict: removes most headers and sensitive fields
      // - balanced: keeps useful headers, removes auth
      // - debug: keeps more data (DO NOT USE IN PRODUCTION)
      sanitizeConfig: {
        profile: 'balanced',
      },

      // Generate trace ID from request header
      traceIdGenerator: (req) => req.headers['x-request-id'] as string,

      // Logging
      logger: {
        debug: (msg) => console.log(`[ACP Debug] ${msg}`),
        info: (msg) => console.log(`[ACP Info] ${msg}`),
        warn: (msg) => console.warn(`[ACP Warn] ${msg}`),
        error: (msg, err) => console.error(`[ACP Error] ${msg}`, err),
      },
    })
  );
} else {
  console.log('ℹ️  ACP Evidence capture disabled (set ACP_EVIDENCE_ENABLED=1 to enable)');
}

// ============================================================================
// API Routes
// ============================================================================

app.use('/api', routes);

// Root redirect
app.get('/', (_req: Request, res: Response) => {
  res.redirect('/api/health');
});

// ============================================================================
// Error Handling
// ============================================================================

// 404 handler
app.use((req: Request, res: Response) => {
  const errorResponse: ErrorResponse = {
    code: 'NOT_FOUND',
    message: `Route ${req.method} ${req.path} not found`,
    requestId: req.headers['x-request-id'] as string,
  };
  res.status(404).json(errorResponse);
});

// Global error handler
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled error:', err);

  const errorResponse: ErrorResponse = {
    code: 'INTERNAL_ERROR',
    message: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
    requestId: req.headers['x-request-id'] as string,
  };
  res.status(500).json(errorResponse);
});

// ============================================================================
// Start Server
// ============================================================================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`\n🚀 Server running at http://localhost:${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/api/health`);
  console.log(`   Products: http://localhost:${PORT}/api/products`);
  console.log(`   Orders: http://localhost:${PORT}/api/orders`);
  console.log('');
});

export default app;
