# REPLACE ME — Feature Name (build notes)

Written at the end of Build, **before** the Clear. This is the one artifact the Clear bets on:
the validating context is fresh and has only the spec, the artifact, and this file.

No front-matter — like `requirements.md` and `validation.md` this is slice-local, not a KMS
artifact, and it does not get an `ARTIFACT_INDEX.md` entry.

These four headings are required. `npm run sdd:preclear` checks for them by exact text, so keep
them as-is; write "None." under one rather than deleting it. An empty section is information —
a missing one is an unanswered question.

## What changed and why

The files/modules touched and the reasoning behind the shape they took. Not a diff — the diff is
in git. Write what a reader can't reconstruct from the code alone.

## Decisions taken during the build

Anything the spec didn't dictate and you had to settle: a library choice, an error-handling shape,
a naming convention, an ordering constraint. Say what you picked and what you rejected.

## Deviations from the spec

Anything that deliberately differs from `requirements.md`/`plan.md`, with the justification.
Validation checks the artifact against the spec, so an unrecorded deviation surfaces there as a
failure — record it here and it's a reviewed decision instead.

Write "None." if there are none. Do not use this section to quietly widen scope; a gap you noticed
but didn't build is a `/propose` candidate and belongs in a tracked issue, not here.

## Known-shaky areas

Where you'd look first if something is wrong: the part with thin test coverage, the assumption
that hasn't been exercised against real data, the path only reachable with credentials this
environment doesn't have. Point validation at the risk rather than making it search.
