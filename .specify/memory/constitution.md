<!--
SYNC IMPACT REPORT
==================
Version Change: 0.0.0 → 1.0.0
Change Type: MAJOR - Initial constitution establishment
Date: 2025-11-20

Modified Principles:
- NEW: I. Code Quality Excellence
- NEW: II. User Experience Consistency
- NEW: III. Performance & Reliability

Added Sections:
- Core Principles (3 principles)
- Development Standards
- Quality Gates
- Governance

Templates Requiring Updates:
- ✅ plan-template.md - Aligned with constitution check gates
- ✅ spec-template.md - Aligned with requirements structure
- ✅ tasks-template.md - Aligned with quality gates

Follow-up TODOs: None
-->

# RogueAgent Constitution

## Core Principles

### I. Code Quality Excellence

Every contribution to RogueAgent MUST maintain the highest standards of code quality:

- **Readability First**: Code MUST be self-documenting with clear naming conventions. Complex logic MUST include inline comments explaining the "why", not just the "what".
- **Type Safety**: All functions MUST have explicit type annotations (TypeScript/Python) or equivalent type declarations. No implicit `any` types allowed except when justified and documented.
- **Single Responsibility**: Each function, class, or module MUST have one clear purpose. If a component requires more than 3 sentences to describe, it should be decomposed.
- **DRY Principle**: Code duplication MUST NOT exceed 3 lines. Repeated logic MUST be extracted into reusable functions or shared utilities.
- **Error Handling**: All error paths MUST be explicitly handled. No silent failures. Errors MUST be logged with sufficient context for debugging.
- **Documentation**: All public APIs MUST have JSDoc/docstring comments. All modules MUST have a header comment explaining their purpose and usage.

**Rationale**: RogueAgent is a development toolkit that guides users through complex workflows. The code itself must exemplify best practices and serve as a reference implementation for the standards it promotes.

### II. User Experience Consistency

All user-facing interactions MUST provide a consistent, predictable experience:

- **Command Structure**: All commands MUST follow the `/speckit.[action]` naming convention. Action names MUST be verbs that clearly describe the operation.
- **Input/Output Contract**: All commands MUST accept standardized input formats (templates, user arguments) and produce consistent output (markdown files in specified locations).
- **Error Messages**: Error messages MUST be actionable and include: (1) What went wrong, (2) Why it happened, (3) How to fix it. No technical jargon in user-facing messages.
- **Progressive Disclosure**: Templates MUST use clear hierarchical structure with examples and guidance comments. Users should understand each section's purpose without external documentation.
- **Workflow Continuity**: Each command output MUST explicitly state the next recommended action. Users should never wonder "what do I do next?"
- **Terminology Consistency**: The same concept MUST use the same term across all templates, prompts, and documentation (e.g., "feature specification" not "feature spec" vs "spec document").

**Rationale**: Consistency reduces cognitive load and enables users to build mental models of the system. Predictable patterns increase productivity and reduce errors.

### III. Performance & Reliability

The system MUST be responsive and reliable under realistic usage conditions:

- **Response Time**: AI agent commands MUST provide initial response within 5 seconds. Long operations MUST show progress indicators.
- **Template Generation**: Template processing MUST complete within 10 seconds for templates up to 500 lines. Larger templates MUST be chunked with progress feedback.
- **File Operations**: File reads/writes MUST be atomic. Partial writes are NOT acceptable. All file operations MUST include error recovery.
- **Memory Efficiency**: Commands processing large codebases MUST use streaming or chunking to maintain memory usage below 500MB for workspaces up to 100K lines of code.
- **Graceful Degradation**: If external dependencies fail (AI service timeout), the system MUST provide cached/fallback responses or clear guidance on manual fallback procedures.
- **Idempotency**: Running the same command multiple times with the same inputs MUST produce identical results. No accumulation of duplicate content.

**Rationale**: Developers rely on RogueAgent in time-sensitive workflows. Performance bottlenecks or reliability issues directly impact productivity and trust in the system.

## Development Standards

**Template Integrity**: All templates in `.specify/templates/` MUST be valid, parseable markdown with clearly marked placeholder sections using `<!-- ACTION REQUIRED -->` comments or `[PLACEHOLDER_NAME]` tokens.

**Agent Prompt Consistency**: All agent prompts in `.github/prompts/` MUST reference the constitution for compliance checks. Changes to principles MUST trigger updates to affected agent prompts.

**Version Control**: All changes to constitution, templates, or core agent logic MUST be committed with descriptive messages following conventional commits format: `type(scope): description`.

**Documentation Synchronization**: When templates change, the corresponding command documentation in `.github/prompts/speckit.[command].prompt.md` MUST be updated in the same commit.

## Quality Gates

Before any template or agent prompt is considered complete, it MUST pass these gates:

1. **Constitution Compliance**: Verify all principles are satisfied (use constitution check section in plan-template.md as reference).
2. **Template Validation**: All placeholders are documented, examples provided, and ACTION REQUIRED comments are clear.
3. **Output Verification**: Run the command with sample inputs and verify the output matches the expected template structure.
4. **Error Path Testing**: Test with invalid inputs and verify error messages are actionable.
5. **Cross-Reference Check**: Verify all referenced files, sections, and commands exist and are accurately named.

## Governance

This constitution is the authoritative source for all RogueAgent development standards and practices.

**Amendment Process**:
1. Proposed changes MUST be documented with: (a) Rationale, (b) Impact analysis on existing templates/agents, (c) Migration plan if breaking changes.
2. MAJOR version bump required for: removing principles, changing fundamental workflows, breaking template contracts.
3. MINOR version bump required for: adding principles, expanding guidance, new quality gates.
4. PATCH version bump required for: clarifications, typo fixes, example improvements.

**Compliance Verification**:
- All specification documents generated by `/speckit.plan` MUST include a "Constitution Check" section.
- All pull requests MUST reference which constitutional principles are satisfied.
- Template changes MUST be reviewed for consistency with UX and quality principles.

**Living Document**: This constitution should be consulted during development. Agent prompts MUST reference applicable principles when making decisions. When in doubt, favor the approach that best serves the principles.

**Version**: 1.0.0 | **Ratified**: 2025-11-20 | **Last Amended**: 2025-11-20
