/**
 * The admin panel's 403 body (P6a, #158) — signed in, but without the vendor
 * role this page needs.
 *
 * A message, never a redirect: the viewer IS authenticated, so bouncing them to
 * /login would be both wrong and a loop.
 *
 * EVERY page under app/(admin)/ that gates on requireVendorRole() now renders
 * this — no exceptions and no allowlist. P6a shipped it to the pages it was
 * already rewriting and deliberately left /staff/loyalty and /staff/discounts
 * holding their own copies; loyalty was converted in #136 and discounts in
 * #350 (2026-09-08), which is when this sentence stopped being true and started
 * being a stale record of a deferral nobody was tracking.
 *
 * That is the whole reason `tests/panel-refusal-coverage.test.ts` exists. The
 * rule was enforced by a prose list in CLAUDE.md for three phases, and by the
 * time anyone checked, the list was wrong about two pages in two different
 * directions at once. Do not re-introduce a hand-maintained list.
 */
export function PanelRefusal({ title, message }: { title: string; message: string }) {
  return (
    <main className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold text-primary">{title}</h1>
      <p className="mt-3 text-primary-muted">{message}</p>
    </main>
  );
}
