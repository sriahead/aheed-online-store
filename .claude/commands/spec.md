---
description: "Gate 2 — write plan.md + requirements.md + validation.md, adversarially reviewed, before code"
---

Write the spec for the approved proposal: $ARGUMENTS

Follow the **Spec** stage of `specs/sdd-workflow.md` (read it if not already in context).

**The spec carries more weight under this loop than it looks like it should**: validation runs from
a fresh context after a Clear, so `requirements.md` is the *only* thing that context has to check
against. An ambiguity a same-context validator would have silently resolved from memory becomes a
real failure mode here. Write for a reader who was not present.

1. Copy the three files from `specs/templates/feature-spec/` into
   `specs/<YYYY-MM-DD-feature>/` — don't write from a blank file or from memory of "the most
   recent slice." All three are required for every slice:
   - `plan.md` — the narrative (goal, scope, deliberately-excluded, rationale). Carries the
     front-matter block and is the file that gets an `ARTIFACT_INDEX.md` entry.
   - `requirements.md` — numbered `R1..Rn`, each one objectively checkable sentence (a tool exits
     0, a file exists with property X, a route returns Y). No "should" language. No front-matter.
   - `validation.md` — a `| Req | How to verify |` table, one concrete command/step per row, one
     row per requirement. No front-matter.
2. If this slice also changes a **standing decision** (architecture, tech choice, tokens), also
   write or update the relevant **persistent doc** (`specs/architecture.md`, `tech-stack.md`,
   `design-system.md`, ...) — the dated folder is the one-time slice, the persistent doc is what
   future sessions read as current truth.
3. **Adversarial pass before presenting**: re-read the draft asking what's missing, ambiguous, or
   quietly out of scope. Explicitly list deliberately deferred items so they don't vanish silently.
   Check it doesn't contradict an existing ADR or persistent doc.
4. Present the spec and wait for approval. Once approved, commit the spec files as their own
   commit — before any implementation commit — then proceed to `/build`.

`validation.md` is what the post-Clear context will actually execute. Every row must be a step that
a reader with no memory of this conversation can run and get an unambiguous pass/fail from.
