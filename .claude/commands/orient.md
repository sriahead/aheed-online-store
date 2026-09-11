---
description: Ground in the actual repo state before proposing or building anything
---

Before doing anything else this session on: $ARGUMENTS

Follow the **Orient** stage of `specs/sdd-workflow.md` (read it if not already in context):

1. Read `CLAUDE.md` first, then `docs/model-handoff.md`. The handoff is a dated recovery snapshot,
   not authority for volatile GitHub, Project, deployment or environment state. Use its
   fresh-session checks as leads to reverify; the live result wins.
2. Read the actual code/config for the area involved — not just the doc that describes it.
   Locate that area with `graft map`/`graft ask` before broad Glob/Grep; open source when
   implementation truth matters — graft is navigation, not proof.
   Planning docs like `docs/repo-structure.md` have gone stale before (phase-tags contradicted by
   what's actually in the repo); `specs/roadmap.md` and the filesystem are authoritative. Use the
   handoff to avoid repository-wide rediscovery; read deeper authoritative docs/code only for the
   current task or a discrepancy the live checks surfaced.
3. If this touches a roadmap item, confirm it's *actually* buildable now — check for the
   prerequisite code/data it depends on, don't assume "next on the roadmap" means "ready."
4. `git fetch` and check how far `origin/staging`/`origin/main` have actually diverged
   (`git log origin/main..origin/staging --oneline`) before assuming either is in a known state.
5. Coming out of a Clear, this is also the **re-entry point** — the previous loop's spec, build
   notes and final documentation are on disk. Read them rather than assuming continuity with a
   conversation that no longer exists.
6. **Run `npm run sdd:audit`.** It reports whether slices shipped under this loop got their roadmap
   change-log entry and reached `ARTIFACT_INDEX.md`. This is the only check that runs *after* Ship,
   so a gap is real work, not a warning — fix it on the current branch (post-merge doc changes ride
   the next slice's branch) rather than noting it and moving on.
7. Check the delivery board for the status **and priority** layers
   (`gh project item-list 2 --owner sriahead --format json --limit 600` — **pass `--limit`**; the
   default page silently truncates this board, giving a confident wrong answer). Scope comes from
   `specs/` and the filesystem, never the board — if they disagree, the board needs reconciling.
   Read the owner-maintained `Priority` field and filter on `priority == "High"`; an open High item
   goes to `/propose` ahead of an assistant-generated ranking. The board also carries Complexity
   (`S`/`M`/`L`) and the current Phase options, but neither replaces scope in `specs/`.
8. Reverify open PRs, relevant GitHub state, current deployments and any environment fact the next
   scope depends on. A value copied from the handoff is not verification.
9. **Read `docs/research/discovery-log.md`** for any open finding touching this area. A finding
   there is evidence, not scope — but starting a slice while an unread finding contradicts its
   premise is exactly the waste the Discover phase exists to prevent.
10. Report a short grounding summary: what you found to be true vs. what the docs/roadmap assumed,
    and any discrepancy worth flagging before moving to `/propose`.
    Lead with the board's open `High` items. Give sequencing, blocker and owner-gated commentary
    within that set rather than replacing it with a competing priority list.

Do not start implementing. This is a read-only grounding pass.
