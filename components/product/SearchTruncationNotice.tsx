/**
 * P2.6 slice 1 (#564) — tells the shopper their result list is incomplete.
 *
 * Purely presentational and deliberately its own component rather than an
 * inline conditional in the page. The decision it renders is made in the
 * repository (`ProductPage.truncated`), and putting the markup here is what
 * lets a component test force the flag BOTH ways. Inline, the notice could only
 * ever be checked when the dev catalogue happened to contain a query broad
 * enough to exceed the candidate cap — which is a property of the seed data,
 * not of this code, and would leave the UI half unproven on any environment
 * whose catalogue is smaller.
 */
export function SearchTruncationNotice({ truncated }: { truncated: boolean }) {
  if (!truncated) return null;

  return (
    <p role="status" className="mb-4 rounded-xl bg-surface-muted px-4 py-3 text-sm text-primary/80">
      There are more matches than we can show at once. Add another word to your search — a brand, a
      size or a department — to narrow it down.
    </p>
  );
}
