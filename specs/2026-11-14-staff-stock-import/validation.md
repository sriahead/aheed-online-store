# Staff stock import (validation)

| Req | How to verify |
| --- | --- |
| R1, R2 | `tests/stock-import-settings.test.ts`: settings → profile, text lists round-trip, Aheed's JSON profile → settings → profile gives the same plan. Settings page saves (staging). |
| R3, R4 | Upload Laziza.xlsx on AFC staging: lines and groups match the CLI dry run. |
| R5, R6 | `tests/stock-import-apply.test.ts`: claim, create hidden, update, live price kept, re-run creates nothing. Staging apply then re-upload: 0 created. |
| R7 | Test: apply refused when the settings version differs. |
| R8 | `tests/stock-import-field-change.test.ts`: restore only unchanged fields; staging undo of a test run. |
| R9 | Staff nav/page tests pass; old importer files removed. |
| R10 | CLI dry run of the Laziza list unchanged after the refactor. |
| R11 | The 10 Laziza questions visible on `/staff/products/import/<run>` on AFC staging. |
