# SDD git hooks (not React hooks)

Point git here with: `git config core.hooksPath hooks`
- `pre-commit`  → Gate 2 (spec-before-code)
- `pre-push`    → Gate 4 (changelog-before-merge)

Full hook scripts are added in P0. React custom hooks live in `lib/hooks/`.
