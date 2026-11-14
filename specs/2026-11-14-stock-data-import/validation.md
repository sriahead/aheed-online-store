# Stock Data Import & Update Manager (validation)

| Req | How to verify |
| --- | --- |
| R2 | `tests/stock-import.test.ts`: both committed profiles validate; an unknown key is refused. |
| R4, R5 | `tests/stock-import.test.ts`: section headings, brand from alias and file default, spelling fixes, `grm` sizes, split of two forms, no split of "Pakora/ Bhajia Mix", issues for missing price, size and duplicates. |
| R6 | `tests/stock-import.test.ts`: PLU first; seeds vs leaves ruled out; size mismatch is not HIGH; near tie is REVIEW; one product claimed twice is REVIEW. |
| R10 | `tests/stock-import.test.ts`: blank keeps, staff-edited field kept, live price guarded, slug and isActive never in the change set. |
| R12 | `tests/stock-import.test.ts`: was price only when higher; "3 for £5" parsed to a tier; bundle and promotion carried. |
| R13 | First run: apply twice; the second report shows 0 created, 0 updated. |
| R14 | Apply without `--confirm-host` refused (run once). |
| R15, R17 | First run report; a read-back of AFC staging (counts, every created product hidden, inventory UNKNOWN). |
| Gate 3 | `npm run lint`, `typecheck`, `npx vitest run --maxWorkers=4`. |
