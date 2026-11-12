# One reusable pagination component (validation)

| Req | How to verify |
| --- | --- |
| R1 | `tests/pagination.test.tsx` ("search row sits below Apply filters"). After deploy, `/staff/products` shows the filters first, then the search row. |
| R2 | `tests/pagination.test.tsx` (numbered and sequential render tests). |
| R3 | Same file (`parsePageParam`, jump fields equal the href's filters). After deploy, `/search?q=chicken` shows "Page 1 of N" and page 2 lands on results 13–24. |
| R4 | Same file (sequential tests). After deploy, a category page shows "Page 2" with Previous after one Next. |
| R5 | `git diff` touches no repository pagination guard. `tests/pagination-guard-coverage.test.ts` passes. |
| R6 | Same file ("every paginated page uses the shared component"). |

Lint, typecheck and the full vitest suite (`--maxWorkers=4`) pass.
