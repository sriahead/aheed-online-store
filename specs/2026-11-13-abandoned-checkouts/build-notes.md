# Abandoned checkouts (build notes)

Issue #1554. Built 2026-11-13 in the worktree `E:\GitRepositories\aheed-wt-1554` (branch
`feature/1554-abandoned-checkouts`, from `origin/staging` after #1552's merge).

- Migration `20261113120000_abandoned_checkout_reminder` is hand-authored (#895): Prisma's own
  `migrate diff --from-schema-datamodel <staging schema> --to-schema-datamodel` output, unedited.
  Purely additive. `prisma format` was NOT run: it realigns the whole schema (382 lines).
- `discountCode` is a text snapshot, not a foreign key, so the record stays what was sent.
- Not independent: validated in-session.
