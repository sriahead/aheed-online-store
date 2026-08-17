---
description: Enforces correct SDD build notes creation.
always_on: true
---

# SDD Build Notes Rule

When ending the **Build** phase of the SDD workflow in this repository, you **MUST**:
1. Name the build notes file exactly `build-notes.md` (never `build.md`) inside the feature's spec directory.
2. Copy the exact template from `specs/templates/feature-spec/build-notes.md` which includes the four mandatory headings:
   - `## What changed and why`
   - `## Decisions taken during the build`
   - `## Deviations from the spec`
   - `## Known-shaky areas`
3. Update `CHANGELOG.md` with an `[Unreleased]` entry for the new feature BEFORE clearing the context.
4. Run `npm run sdd:preclear` to programmatically verify that all required files and headings exist, and that the tree is clean.
5. Do NOT prompt the user to clear their context until `npm run sdd:preclear` passes successfully.
