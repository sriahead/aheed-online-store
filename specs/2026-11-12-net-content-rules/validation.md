# Net content for the live catalogue (validation)

| Req | How to verify |
| --- | --- |
| R1 | `tests/net-content-rules.test.ts`, extractor cases, all real AFC names. |
| R2 | Same file, `suggestNetContentByRule`. |
| R3 | `tests/net-content-staff-run.test.ts`, "#697 rule step": two queued, the range skipped, the rule list (500) before the model list (10). After deploy, an admin presses Suggest on staging: about 40 rule rows appear with model "rules (no AI)". |
| R4 | Same file, message tests. |
| R5 | No product write was added (diff review). Acceptance still goes through `reviewNetContentSuggestion`. |

Lint, typecheck and the full vitest suite (`--maxWorkers=4`) pass.
