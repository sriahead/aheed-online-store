import Link from "next/link";
import type { SearchRecoveryInfo } from "@/lib/repositories/products";
import type { CategorySummary } from "@/lib/repositories/categories";

/**
 * P2.6 slice 2 (#565) — tells the shopper what happened when the direct search
 * found nothing. Purely presentational, matching `SearchTruncationNotice`'s
 * split: the decision is made in the repository (`ProductPage.recovery`), this
 * renders it.
 *
 * `recovery === null` means the direct search already found something — no
 * notice at all. `rung === "none"` means the whole zero-result ladder ran and
 * still found nothing, so this renders the fallback: the given categories plus
 * one link per individual search term (each its own one-word search). Every
 * other rung renders a short "results shown are for a corrected/broadened
 * query" notice instead.
 */
export function SearchRecoveryNotice({
  recovery,
  terms,
  categories,
}: {
  recovery: SearchRecoveryInfo | null;
  terms: string[];
  categories: CategorySummary[];
}) {
  if (recovery === null) return null;

  if (recovery.rung === "none") {
    return (
      <div
        role="status"
        className="mb-6 rounded-xl bg-surface-muted px-4 py-4 text-sm text-primary/80"
      >
        <p className="mb-3">No products match. Try one of these instead:</p>
        {terms.length > 1 && (
          <ul className="mb-3 flex flex-wrap gap-2">
            {terms.map((term) => (
              <li key={term}>
                <Link
                  href={`/search?q=${encodeURIComponent(term)}`}
                  className="rounded-full bg-white px-3 py-1 font-medium text-action underline"
                >
                  {term}
                </Link>
              </li>
            ))}
          </ul>
        )}
        {categories.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {categories.map((category) => (
              <li key={category.id}>
                <Link
                  href={`/categories/${category.slug}`}
                  className="rounded-full bg-white px-3 py-1 font-medium text-action underline"
                >
                  {category.name}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  const message =
    recovery.rung === "typo"
      ? `Showing results for “${recovery.correctedTerms?.join(" ")}” instead.`
      : "No exact matches. Showing related products instead.";

  return (
    <p role="status" className="mb-4 rounded-xl bg-surface-muted px-4 py-3 text-sm text-primary/80">
      {message}
    </p>
  );
}
