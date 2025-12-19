---
'@docsmyth/cli': minor
'@docsmyth/capture-proxy': minor
'@docsmyth/studio': minor
---

feat: Implement Beginner Mode UX with one-command workflow

This release introduces a streamlined "Beginner Mode" experience that allows new users to get started with Docsmyth using a single command:

**New CLI Commands:**
- `quickstart` - One-command workflow that starts proxy, launches Studio, and generates contract
- `record` - Start HTTP capture proxy to record API traffic
- `studio` - Launch Studio web UI for viewing contracts and evidence
- `doctor` - Diagnose configuration and installation issues

**Enhanced Commands:**
- `infer` - Now handles empty evidence gracefully with helpful guidance

**Studio Enhancements:**
- New "Save Contract" button for evidence-only mode
- Visual contract download UI with operation/schema counts
- Improved UX for exporting generated contracts

**Capture Proxy:**
- New `startRecordProxy()` programmatic API for embedding in workflows
- `ContractlessWriter` for recording evidence without contracts
- Better error handling and shutdown management

**Documentation:**
- Added `/docs/beginner.md` - Complete beginner's guide
- Added `/docs/studio.md` - Studio feature documentation
- Updated examples and workflows

This release focuses on reducing friction for first-time users while maintaining powerful capabilities for advanced workflows.
