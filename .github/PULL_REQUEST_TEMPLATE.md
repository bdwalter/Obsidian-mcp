## What changed

<!-- One paragraph: what does this PR do and why? -->

## Linked issues

<!-- Fixes #123, refs #456 -->

## Tests

- [ ] `npm test` passes locally
- [ ] `npm run build` produces a clean bundle
- [ ] If the change touches MCP request/response shape, `scripts/release-qa.sh` was run against a live plugin

## Checklist

- [ ] User-facing behavior changes are documented in `CHANGELOG.md` under `[Unreleased]`
- [ ] If a new setting was added, it has a default that preserves prior behavior
- [ ] If a new tool was added, it appears in `tools/list` and has a clear description
- [ ] If write tools were touched, the path-safety guard is intact and the audit hook fires
- [ ] No secrets, vault paths, or local-only debug code in the diff
- [ ] Commits follow the existing style (short imperative subject, body explaining "why")

## Manual verification

<!-- What did you actually test by hand? Even one paragraph is fine. "Created a note via Claude Code, confirmed audit log captured it" beats nothing. -->
