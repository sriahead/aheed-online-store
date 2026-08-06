# REPLACE ME — Feature Name (validation)

| Req | How to verify |
|-----|---------------|
| R1  | The exact command/step, not a description of intent — e.g. `npm run kms:validate` exits 0 with `invalid front-matter (failing): 0`, not "validation passes". |
| R2  | ... |

<!--
  One row per requirement, same order as requirements.md. Delete this comment block once real
  rows exist. If a requirement genuinely needs a DB-touching or Workers-runtime check, say
  `npm run preview` explicitly — `npm run dev` cannot load @prisma/client/wasm and will silently
  show a wrong result (see CLAUDE.md's Database section).
-->
