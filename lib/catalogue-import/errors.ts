/**
 * #1216 R25 — "is this a unique-constraint violation?", for the adapter the importer actually
 * constructs. CLAUDE.md (Database): the two Neon adapters report the same Postgres error under
 * different `.code` values — raw SQLSTATE "23505" from the HTTP adapter, Prisma "P2002" from the
 * WebSocket adapter — so a predicate accepts BOTH. It deliberately does not fall back to matching
 * message text: #1211 measured that a CHECK violation carries no `.code` at all through the
 * WebSocket adapter, and a message match would be a second, unverified guess. A violation the
 * predicate does not recognise is reported as FAILED, never swallowed.
 */
export function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const code = (error as { code?: unknown }).code;
  return code === "23505" || code === "P2002";
}
