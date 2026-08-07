# REPLACE ME — Feature Name (requirements / acceptance criteria)

One-paragraph context: what this closes out, what it builds on (`related:` docs), and the one-line
version of `plan.md`'s narrative for a reader who won't open that file.

R1. One objectively checkable sentence per requirement — a tool exits 0, a file exists with
    property X, a route returns Y. No "should"/"nice to have" language; if it can't be verified by
    a concrete step, it isn't a requirement yet.
R2. ...
R3. ...

<!--
  Conventions (delete this comment block once the real requirements are written):
  - Number sequentially, R1..Rn. Insert a lettered sub-requirement (R2a) only when it's a genuine
    prerequisite fix discovered mid-slice — don't renumber everything that follows it.
  - The LAST requirement is always the Gate-3 catch-all:
      Rn. `lint`, `typecheck`, `test`, `format:check` all remain green after this slice.
  - The requirement before that is always Gate 4:
      Rn-1. `CHANGELOG.md` updated (Gate 4).
  - `plan.md` carries the front-matter and the ARTIFACT_INDEX.md entry for this slice — this file
    and validation.md deliberately don't get their own front-matter, matching the repo-wide
    precedent of one indexed entry per slice, not one per file.
-->
