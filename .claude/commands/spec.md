---
description: "Gate 2 — write requirements.md + validation.md, adversarially reviewed, before code"
---

Write the spec for the approved proposal: $ARGUMENTS

Follow the **Spec** stage of `specs/sdd-workflow.md` (read it if not already in context):

1. Create `specs/<YYYY-MM-DD-feature>/requirements.md` — numbered `R1..Rn`, each one objectively
   checkable sentence (a tool exits 0, a file exists with property X, a route returns Y). No
   "should" language. Match the exact format of the most recent prior slice under `specs/` rather
   than inventing a new shape (check `specs/2026-08-06-p0-foundation/` or the newest dated folder
   as the current template).
2. Create the paired `validation.md` — a `| Req | How to verify |` table, one concrete
   command/step per row, one row per requirement.
3. If this slice also changes a **standing decision** (architecture, tech choice, tokens), also
   write or update the relevant **persistent doc** (`specs/architecture.md`, `tech-stack.md`,
   `design-system.md`, ...) — the dated folder is the one-time slice, the persistent doc is what
   future sessions read as current truth.
4. **Adversarial pass before presenting**: re-read the draft asking what's missing, ambiguous, or
   quietly out of scope. Explicitly list deliberately deferred items so they don't vanish silently.
   Check it doesn't contradict an existing ADR or persistent doc.
5. Present the spec and wait for approval. Once approved, commit the spec files as their own
   commit — before any implementation commit — then proceed to `/build`.
