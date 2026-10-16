/**
 * How long each record holding a hashed (SHA-256) network address is kept (#1041, #1107).
 *
 * One source for two readers: the repositories that sweep these tables, and `/privacy`, which
 * states the same figures to shoppers. A change here changes both, so the policy cannot drift
 * from the code — the pattern `lib/storage-keys.ts` set for storage names (#1080).
 *
 * Retention is when a row becomes DUE for deletion, not when it is deleted: every sweep runs on a
 * small random fraction of writes (`SWEEP_PROBABILITY`), so on a quiet shop a row can outlive its
 * figure. `/privacy` says exactly that ("removed by routine clean-up after that").
 *
 * Client-safe and import-free on purpose: the privacy page and the repositories both import it.
 */

/** `SearchQueryLog` — what was searched and how many results it found (#565, #570). */
export const SEARCH_QUERY_LOG_RETENTION_DAYS = 90;

/** `AssistantConversation` — the help assistant's topic and outcome (#1014). */
export const ASSISTANT_CONVERSATION_RETENTION_DAYS = 90;

/**
 * The five rate-limit attempt tables: `AuthenticationAttempt`, `OrderLookupAttempt`,
 * `DiscountCodeAttempt`, `CustomerFeedbackAttempt` and `ListNormalisationAttempt`. Only has to
 * exceed each table's window, the longest of which is ten minutes (feedback);
 * `tests/data-retention.test.ts` holds that invariant.
 */
export const ATTEMPT_RECORD_RETENTION_HOURS = 1;
