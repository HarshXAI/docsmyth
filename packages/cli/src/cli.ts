#!/usr/bin/env node
/**
 * ACP CLI - API Contract Platform Command Line Interface
 *
 * Main entry point for the CLI.
 */

import { program } from 'commander';
import { validateCommand } from './commands/validate.js';
import { compileCommand } from './commands/compile.js';
import { evidenceVerifyCommand } from './commands/evidence-verify.js';
import { diffCommand } from './commands/diff.js';
import { publishCommand } from './commands/publish.js';
import { pullCommand } from './commands/pull.js';
import { proxyCommand } from './commands/proxy.js';
import { studioCommand } from './commands/studio.js';
import { overlayApplyCommand, overlayValidateCommand } from './commands/overlay.js';
import { recordCommand } from './commands/record.js';
import { inferCommand } from './commands/infer.js';
import { quickstartCommand } from './commands/quickstart.js';
import { doctorCommand, printVerboseVersion } from './commands/doctor.js';
import { version } from './version.js';

// Handle --version --verbose
if (process.argv.includes('--version') && process.argv.includes('--verbose')) {
  printVerboseVersion();
  process.exit(0);
}

program
  .name('docsmyth')
  .description('API Contract Platform CLI - Manage and compile API contracts')
  .version(version);

// ============================================================================
// BEGINNER-FRIENDLY COMMANDS
// ============================================================================

// Quickstart command - one command to rule them all
program
  .command('quickstart')
  .description('🚀 One-command beginner flow: record → infer → studio')
  .requiredOption('--target <url>', 'Upstream target URL (e.g., http://localhost:3000)')
  .option('--proxy-port <port>', 'Proxy server port', '8080')
  .option('--studio-port <port>', 'Studio server port', '8787')
  .option('--host <host>', 'Host to bind to', '127.0.0.1')
  .option('--out <path>', 'Evidence output file', './docsmyth/evidence.ndjson')
  .option('--contract-out <path>', 'Contract output file', './docsmyth/contract.json')
  .option('--no-open', 'Do not open browser automatically')
  .option('--verbose', 'Show detailed output', false)
  .action((opts) => {
    quickstartCommand({
      target: opts.target,
      proxyPort: parseInt(opts.proxyPort, 10),
      studioPort: parseInt(opts.studioPort, 10),
      host: opts.host,
      evidenceOut: opts.out,
      contractOut: opts.contractOut,
      open: opts.open,
      verbose: opts.verbose,
    });
  });

// Record command - capture traffic without a contract
program
  .command('record')
  .description('📹 Record HTTP traffic as evidence (no contract required)')
  .requiredOption('--target <url>', 'Upstream target URL (e.g., http://localhost:3000)')
  .option('--listen <address>', 'Proxy listen address', '127.0.0.1:8080')
  .option('--out <path>', 'Evidence output file', '/tmp/evidence.ndjson')
  .option('--max-body-bytes <bytes>', 'Maximum body size before truncation', '65536')
  .option('--event-rate-limit <n>', 'Max events per second (0=unlimited)', '100')
  .option('--verbose', 'Show detailed output', false)
  .action((opts) => {
    recordCommand({
      target: opts.target,
      listen: opts.listen,
      out: opts.out,
      maxBodyBytes: parseInt(opts.maxBodyBytes, 10),
      eventRateLimit: parseInt(opts.eventRateLimit, 10),
      verbose: opts.verbose,
    });
  });

// Infer command - generate contract from evidence
program
  .command('infer')
  .description('📝 Infer a Contract IR from evidence NDJSON')
  .requiredOption('--evidence <path>', 'Path to evidence NDJSON file')
  .requiredOption('--out <path>', 'Output path for generated contract')
  .option('--service <name>', 'Service name for the contract', 'my-service')
  .option('--version <version>', 'Service version', '0.0.1')
  .option('--verbose', 'Show detailed output', false)
  .action((opts) => {
    inferCommand({
      evidence: opts.evidence,
      out: opts.out,
      service: opts.service,
      version: opts.version,
      verbose: opts.verbose,
    });
  });

// Doctor command - diagnose installation
program
  .command('doctor')
  .description('🩺 Diagnose your Docsmyth installation and environment')
  .option('--verbose', 'Show detailed diagnostic info', false)
  .action((opts) => {
    doctorCommand({
      verbose: opts.verbose,
    });
  });

// ============================================================================
// CORE COMMANDS
// ============================================================================

program
  .command('validate <path>')
  .description('Validate a Contract IR document')
  .option('-v, --verbose', 'Show detailed output')
  .action(validateCommand);

program
  .command('compile <path>')
  .description('Compile a Contract IR document to OpenAPI')
  .requiredOption('-o, --out <dir>', 'Output directory')
  .option('-f, --format <format>', 'Output format (json|yaml)', 'json')
  .option('--pretty', 'Pretty print output', true)
  .option('-e, --evidence <path>', 'Path to NDJSON evidence file for example injection')
  .option('--verify-evidence', 'Fail compilation if evidence is invalid', false)
  .option('--max-examples <n>', 'Maximum examples per operation/status', '3')
  .option('--coverage', 'Print coverage report to stdout', false)
  .option('--coverage-json <path>', 'Write JSON coverage report to file')
  .option('--overlay <path>', 'Path to overlay file to apply before compilation')
  .action((path, opts) => {
    // Parse maxExamples as number
    compileCommand(path, {
      ...opts,
      maxExamples: parseInt(opts.maxExamples, 10),
    });
  });

// Evidence commands
const evidence = program
  .command('evidence')
  .description('Evidence capture and verification commands');

evidence
  .command('verify <evidenceFile>')
  .description('Verify evidence events against a Contract IR document')
  .requiredOption('-c, --contract <path>', 'Path to Contract IR file')
  .option('-v, --verbose', 'Show detailed output')
  .action(evidenceVerifyCommand);

// Overlay commands
const overlay = program
  .command('overlay')
  .description('Overlay management commands for producing different API views');

overlay
  .command('apply <contract> <overlay>')
  .description('Apply an overlay to a Contract IR to produce a modified view')
  .requiredOption('-o, --out <file>', 'Output file path')
  .option('--pretty', 'Pretty print output', true)
  .option('--summary', 'Show overlay summary before applying')
  .option('-v, --verbose', 'Show detailed output')
  .action((contract, overlayFile, opts) => {
    overlayApplyCommand(contract, overlayFile, {
      out: opts.out,
      pretty: opts.pretty,
      summary: opts.summary,
      verbose: opts.verbose,
    });
  });

overlay
  .command('validate <overlay>')
  .description('Validate an overlay document')
  .option('-v, --verbose', 'Show detailed output')
  .action((overlayFile, opts) => {
    overlayValidateCommand(overlayFile, {
      verbose: opts.verbose,
    });
  });

// Diff command for breaking change detection
program
  .command('diff <base> <head>')
  .description('Compare two Contract IR documents and report breaking changes')
  .option('-f, --format <format>', 'Output format (text|json)', 'text')
  .option('--fail-on <level>', 'Fail on breaking changes (breaking|none)', 'breaking')
  .option('-v, --verbose', 'Show detailed output')
  .action((base, head, opts) => {
    diffCommand(base, head, {
      format: opts.format,
      failOn: opts.failOn,
      verbose: opts.verbose,
    });
  });

// Hub commands for publishing and pulling contracts
program
  .command('publish <path>')
  .description('Publish a Contract IR to the Hub')
  .requiredOption('--hub <url>', 'Hub URL (e.g., http://localhost:3456)')
  .requiredOption('--service <name>', 'Service name')
  .requiredOption('--contract-version <version>', 'Semantic version (e.g., 1.0.0)')
  .option('--compile', 'Compile OpenAPI before publishing (default: true)', true)
  .option('--no-compile', 'Skip OpenAPI compilation')
  .option('--token <token>', 'Auth token (or use ACP_HUB_TOKEN env var)')
  .option('--overlay <path>', 'Path to overlay file to publish as artifact')
  .option('--overlay-name <name>', 'Custom name for overlay artifact (default: overlay.<name>.json)')
  .option('--verbose', 'Show detailed output')
  .action((path, opts) => {
    publishCommand(path, {
      hub: opts.hub,
      service: opts.service,
      version: opts.contractVersion,
      compile: opts.compile,
      token: opts.token,
      overlay: opts.overlay,
      overlayName: opts.overlayName,
      verbose: opts.verbose,
    });
  });

program
  .command('pull')
  .description('Pull a contract from the Hub')
  .requiredOption('--hub <url>', 'Hub URL (e.g., http://localhost:3456)')
  .requiredOption('--service <name>', 'Service name')
  .option('--contract-version <version>', 'Semantic version (default: latest)', 'latest')
  .requiredOption('--out <dir>', 'Output directory')
  .option('--token <token>', 'Auth token (or use ACP_HUB_TOKEN env var)')
  .option('--verbose', 'Show detailed output')
  .action((opts) => {
    pullCommand({
      hub: opts.hub,
      service: opts.service,
      version: opts.contractVersion,
      out: opts.out,
      token: opts.token,
      verbose: opts.verbose,
    });
  });

// Proxy command for capture sidecar
program
  .command('proxy')
  .description('Start a capture proxy sidecar for any HTTP service')
  .option('--listen <address>', 'Listen address (e.g., 0.0.0.0:8080)', '0.0.0.0:8080')
  .requiredOption('--target <url>', 'Upstream target URL (e.g., http://localhost:3000)')
  .option('--hub-url <url>', 'Hub URL for loading contract (or use ACP_HUB_URL)')
  .option('--hub-token <token>', 'Hub auth token (or use ACP_HUB_TOKEN)')
  .option('--service <name>', 'Service name (required with --hub-url, or use ACP_SERVICE)')
  .option('--version <version>', 'Contract version (default: latest, or use ACP_VERSION)', 'latest')
  .option('--contract <path>', 'Local contract file path (alternative to hub)')
  .option('--capture', 'Enable evidence capture (or set ACP_CAPTURE=1)', false)
  .option('--out <path>', 'Evidence output file path', './evidence.ndjson')
  .option('--max-body-bytes <bytes>', 'Maximum body size before truncation', '65536')
  .option('--event-rate-limit <n>', 'Max events per second (0=unlimited)', '100')
  .option('--capture-unmatched', 'Capture requests not matching any operation', false)
  .option('--verbose', 'Show detailed output', false)
  .action((opts) => {
    proxyCommand({
      listen: opts.listen,
      target: opts.target,
      hubUrl: opts.hubUrl ?? process.env.ACP_HUB_URL,
      hubToken: opts.hubToken,
      service: opts.service ?? process.env.ACP_SERVICE,
      version: opts.version ?? process.env.ACP_VERSION ?? 'latest',
      contract: opts.contract,
      capture: opts.capture,
      out: opts.out,
      maxBodyBytes: parseInt(opts.maxBodyBytes, 10),
      eventRateLimit: parseInt(opts.eventRateLimit, 10),
      captureUnmatched: opts.captureUnmatched,
      verbose: opts.verbose,
    });
  });

// Studio command for web UI
program
  .command('studio')
  .description('Launch the Docsmyth Studio web UI for contract exploration')
  .option('--contract <path>', 'Path to Contract IR JSON file')
  .option('--evidence <path>', 'Path to Evidence NDJSON file (can be used alone for inference mode)')
  .option('--port <number>', 'Server port', '8787')
  .option('--host <address>', 'Server host', '127.0.0.1')
  .option('--no-open', 'Do not open browser automatically')
  .action((opts) => {
    studioCommand({
      contract: opts.contract,
      evidence: opts.evidence,
      port: parseInt(opts.port, 10),
      host: opts.host,
      open: opts.open,
    });
  });

program.parse();
