# Dependency pin ratification (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests. Avoid testing the same behaviour multiple times at different levels unless doing so provides additional confidence.
>
> **The Main Principle:**
> - **Build:** Did we build the component correctly?
> - **Validate:** Does the feature work correctly in the real system?
> - **Release:** Is the complete system safe, reliable, and ready for users?

## Scope note for the validator

This slice deliberately produces **no behavioural diff**. The versions being pinned are already the
versions running, so there is nothing to exercise under `npm run preview` and no live row to walk —
`npm run preview` is **not** required for any row below. What is being validated is that the
manifest, the doc and the new test now agree with the installed reality, and that the new test
actually fails when they stop agreeing (R7).

**Before starting, know the expected suite size.** `CLAUDE.md` records a Windows-under-load trap
where `vitest` silently fails to start workers for whole test files, counting them as "unhandled
errors" rather than failures. The pre-slice suite is **76 files / 897 tests** — measured directly
at this slice's `/spec` on 2026-09-03, superseding the `74/874` this repo's own `CLAUDE.md` recorded
until R12a corrected it. This slice adds one file, so the expected post-slice result is
**77 files**. A smaller file count is a non-result to re-run, not a pass.

Two practical notes from hitting this during `/spec`: it fired **immediately after a heavy Next
build** even with the suite run alone, and re-running once it settled gave a clean
`76 passed / 897 passed`. It also exited **1**, not the exit 0 `CLAUDE.md` describes — so a
non-zero exit with `Failed to start forks worker` in the output is this trap, not a real failure.
Check for orphaned processes with
`Get-CimInstance Win32_Process -Filter "Name='node.exe' or Name='workerd.exe'"` before re-running;
an empty result means simply re-running is the right move.

---

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Unit | `node -e "console.log(JSON.stringify(require('./package.json').dependencies['@neondatabase/serverless']))"` prints exactly `"1.1.0"` — no leading `^` or `~`. |
| R2  | Unit | `node -e "console.log(JSON.stringify(require('./package.json').dependencies['@prisma/adapter-neon']))"` prints exactly `"7.9.1"`. |
| R2a | Unit | `node -e "console.log(JSON.stringify(require('./package.json').dependencies['@prisma/client']))"` prints exactly `"6.19.3"`. |
| R3  | Integration | `node -e "for(const k of ['@neondatabase/serverless','@prisma/adapter-neon','@prisma/client'])console.log(k, require('./node_modules/'+k+'/package.json').version)"` prints `1.1.0`, `7.9.1`, `6.19.3` on the three lines, in that order. |
| R4  | Integration | The lockfile diff must contain **no resolved-version change anywhere**. Run: `git show origin/staging:package-lock.json > "$SCRATCH/lock-before.json"`, then a node script comparing `packages[k].version` for every key in both files (see this slice's build notes for the exact snippet). Expected output: only `ADDED` lines, all six under `node_modules/@tailwindcss/oxide-wasm32-wasi/node_modules/`, and **zero** `CHANGED` or `REMOVED` lines. Note: node on Windows resolves a bash `/tmp/...` path to `E:	mp\...`, so use a real Windows-visible scratch path. |
| R4a | Integration | `npm ci` exits 0. Then `node -e "for(const k of ['@neondatabase/serverless','@prisma/adapter-neon','@prisma/client'])console.log(k, require('./node_modules/'+k+'/package.json').version)"` prints `1.1.0`, `7.9.1`, `6.19.3`. **Then run `npm run db:generate`** — `npm ci` wipes `node_modules` and does not regenerate the Prisma client, and without it `npm run typecheck` reports ~169 errors across `lib/repositories/*`, `prisma/seed.ts` and `scripts/*` that are an artefact of the clean install, not a regression. CI does exactly this (`quality.yml` runs `npm ci` then `npm run db:generate`). |
| R5  | Unit | `npx vitest run tests/dependency-pins.test.ts` exits 0 and reports at least one passing test. Then confirm the file drives its assertions from a literal map by reading it: `grep -n "1.1.0\|7.9.1\|6.19.3" tests/dependency-pins.test.ts` prints all three version literals. |
| R6  | Unit | In the same file, `grep -n "\^\|~\|range\|specifier" tests/dependency-pins.test.ts` shows an assertion over `package.json`'s declared specifier, and `npx vitest run tests/dependency-pins.test.ts` exits 0 with it present. |
| R7  | Regression | **Mutation check — restores the file afterwards.** Run `node -e "const f='package.json';const s=require('fs').readFileSync(f,'utf8');require('fs').writeFileSync(f,s.replace('\"@prisma/adapter-neon\": \"7.9.1\"','\"@prisma/adapter-neon\": \"^7.9.1\"'))"`, then `npx vitest run tests/dependency-pins.test.ts` — it must exit **non-zero**. Then `git checkout -- package.json` and re-run — it must exit **0**. Confirm `git status --porcelain package.json` is empty before moving on. |
| R8  | Unit | `sed -n '/## Dependency & version discipline/,/^## /p' CLAUDE.md > /tmp/dep.txt`, then: `grep -c "must not be used" /tmp/dep.txt` prints `0`; `grep -c "1.1.0"`, `grep -c "7.9.1"` and `grep -c "6.19.3"` each print at least `1`. `0.10.4` **may** appear — read each occurrence and confirm every one describes the pre-`ac3f0d6` history (e.g. "raised from `0.10.4`"), and that none presents it as the current pin. |
| R9  | Unit | `grep -n "ac3f0d6" CLAUDE.md` prints at least one line inside the dependency section, and reading it shows the connection-exhaustion fix named as the reason for the raise. |
| R10 | Unit | `grep -n "560" CLAUDE.md` prints a line in the dependency section, and reading the surrounding sentence confirms it states the adapter is a major ahead of `@prisma/client` and that this is deliberate. |
| R11 | Unit | `grep -n "workers-types" CLAUDE.md` — the matched line must **not** claim the majors match. Reading it confirms it records `@cloudflare/workers-types` 5.x alongside `wrangler` 4.x as the observed pairing. Cross-check the claim is still true: `node -e "for(const k of ['@cloudflare/workers-types','wrangler'])console.log(k, require('./node_modules/'+k+'/package.json').version)"`. |
| R12 | Unit | `grep -n "dependency-pins" CLAUDE.md` prints a line inside the dependency section naming `tests/dependency-pins.test.ts` as the enforcement. |
| R12a | Unit | `grep -nE "7[0-9] (test )?files|74/874|897|874" CLAUDE.md` — the Windows-shell section must state **77** and must no longer contain `74` or `874`. Cross-check that the recorded number matches R17's actual run. |
| R13 | Integration | `git diff --name-only origin/staging` — the output contains no path starting `app/`, `lib/`, `features/`, `components/`, `prisma/` or `scripts/`. Expected paths only: `package.json`, **`package-lock.json`**, `CLAUDE.md`, `CHANGELOG.md`, `tests/dependency-pins.test.ts`, `ARTIFACT_INDEX.md`, `app/(admin)/staff/runbook/docs.ts` and `specs/2026-09-03-dependency-pin-ratification/*`. (The two generated KMS artefacts are the sole permitted exception to the `app/` rule — they are build output, not runtime code.) |
| R14 | Integration | `npm run kms:validate` exits 0. `npm run kms:check-generated` exits 0 and prints `all 2 generated artefact(s) current`. |
| R15 | System | `npm run kms:assemble:internal` exits 0, then `cd kms/site-internal && npx next build --webpack` exits 0. **Read the real exit status** — do not pipe through `tail`/`head`, which reports the pipe's success rather than the build's. This row exists because a bare `<` before a digit or a bare `{...}` in spec prose breaks this build and nothing else catches it. |
| R16 | Regression | `git diff origin/staging -- CHANGELOG.md` shows a new entry naming `#491`. |
| R17 | Regression | `npm run lint`, `npm run typecheck`, `npm run format:check` each exit 0. Then `npx vitest run` **alone, with no other build running** — exits 0 reporting **77 test files**. A smaller file count means workers failed to start; re-run before concluding anything. CI on Linux is the authority. |
