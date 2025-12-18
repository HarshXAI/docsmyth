#!/usr/bin/env bash
#
# release-guard.sh - Pre-release validation script
#
# This script runs all checks required before a release:
# 1. pnpm -r build - Build all packages
# 2. pnpm -r test - Run all tests
# 3. pnpm smoke:pack - Verify CLI packaging works standalone
#
# Exit codes:
#   0 - All checks passed
#   1 - One or more checks failed
#
# Usage:
#   ./scripts/release-guard.sh
#
# Environment variables:
#   CI=true - Set to suppress interactive prompts (default in CI)
#   SKIP_BUILD=1 - Skip build step (for testing)
#   SKIP_TEST=1 - Skip test step (for testing)
#   SKIP_SMOKE=1 - Skip smoke:pack step (for testing)

set -euo pipefail

# Colors for output (disabled if NO_COLOR set or not a tty)
if [[ -z "${NO_COLOR:-}" && -t 1 ]]; then
  RED='\033[0;31m'
  GREEN='\033[0;32m'
  YELLOW='\033[1;33m'
  BLUE='\033[0;34m'
  NC='\033[0m' # No Color
else
  RED=''
  GREEN=''
  YELLOW=''
  BLUE=''
  NC=''
fi

# Timing
SCRIPT_START=$(date +%s)

log_step() {
  echo -e "${BLUE}==>${NC} $1"
}

log_success() {
  echo -e "${GREEN}✓${NC} $1"
}

log_error() {
  echo -e "${RED}✗${NC} $1"
}

log_warning() {
  echo -e "${YELLOW}!${NC} $1"
}

# Print debug info on failure
print_debug_info() {
  echo ""
  echo "============================================"
  echo "  DEBUG INFORMATION"
  echo "============================================"
  echo ""
  echo "Node version: $(node --version 2>/dev/null || echo 'not found')"
  echo "npm version:  $(npm --version 2>/dev/null || echo 'not found')"
  echo "pnpm version: $(pnpm --version 2>/dev/null || echo 'not found')"
  echo ""
  echo "Environment:"
  echo "  CI=${CI:-unset}"
  echo "  HOME=${HOME:-unset}"
  echo "  NODE_ENV=${NODE_ENV:-unset}"
  echo "  npm_config_registry=${npm_config_registry:-unset}"
  echo ""
  echo "npm config list:"
  npm config list 2>/dev/null || echo "  (failed to get npm config)"
  echo ""
  echo "Disk space:"
  df -h . 2>/dev/null || echo "  (failed to get disk space)"
  echo ""
  echo "Memory:"
  if command -v free &> /dev/null; then
    free -h 2>/dev/null || echo "  (failed to get memory info)"
  elif command -v vm_stat &> /dev/null; then
    vm_stat 2>/dev/null | head -5 || echo "  (failed to get memory info)"
  else
    echo "  (memory info not available)"
  fi
  echo ""
}

# Cleanup handler
cleanup() {
  local exit_code=$?
  if [[ $exit_code -ne 0 ]]; then
    log_error "Release guard failed with exit code $exit_code"
    print_debug_info
  fi
  exit $exit_code
}

trap cleanup EXIT

# Change to repo root
cd "$(dirname "$0")/.."
REPO_ROOT=$(pwd)
log_step "Running release guard from: $REPO_ROOT"

# Track failed steps
FAILED_STEPS=()

# Step 1: Build
if [[ "${SKIP_BUILD:-}" != "1" ]]; then
  log_step "Step 1/3: Building all packages..."
  BUILD_START=$(date +%s)
  
  if pnpm -r build; then
    BUILD_END=$(date +%s)
    BUILD_TIME=$((BUILD_END - BUILD_START))
    log_success "Build completed in ${BUILD_TIME}s"
  else
    log_error "Build failed"
    FAILED_STEPS+=("build")
  fi
else
  log_warning "Skipping build (SKIP_BUILD=1)"
fi

# Step 2: Test
if [[ "${SKIP_TEST:-}" != "1" ]]; then
  log_step "Step 2/3: Running all tests..."
  TEST_START=$(date +%s)
  
  if pnpm -r test; then
    TEST_END=$(date +%s)
    TEST_TIME=$((TEST_END - TEST_START))
    log_success "Tests completed in ${TEST_TIME}s"
  else
    log_error "Tests failed"
    FAILED_STEPS+=("test")
  fi
else
  log_warning "Skipping tests (SKIP_TEST=1)"
fi

# Step 3: Smoke Pack
if [[ "${SKIP_SMOKE:-}" != "1" ]]; then
  log_step "Step 3/3: Running smoke:pack..."
  SMOKE_START=$(date +%s)
  
  if pnpm smoke:pack; then
    SMOKE_END=$(date +%s)
    SMOKE_TIME=$((SMOKE_END - SMOKE_START))
    log_success "Smoke pack completed in ${SMOKE_TIME}s"
  else
    log_error "Smoke pack failed"
    FAILED_STEPS+=("smoke:pack")
  fi
else
  log_warning "Skipping smoke:pack (SKIP_SMOKE=1)"
fi

# Summary
SCRIPT_END=$(date +%s)
TOTAL_TIME=$((SCRIPT_END - SCRIPT_START))

echo ""
echo "============================================"
echo "  RELEASE GUARD SUMMARY"
echo "============================================"
echo ""

if [[ ${#FAILED_STEPS[@]} -eq 0 ]]; then
  log_success "All checks passed in ${TOTAL_TIME}s"
  echo ""
  echo "Ready for release! Next steps:"
  echo "  1. Ensure changeset is added: pnpm changeset"
  echo "  2. Version packages: pnpm version-packages"
  echo "  3. Push to trigger release workflow"
  echo ""
  exit 0
else
  log_error "Failed steps: ${FAILED_STEPS[*]}"
  echo ""
  echo "Please fix the above issues before releasing."
  echo "See the debug information above for troubleshooting."
  echo ""
  exit 1
fi
