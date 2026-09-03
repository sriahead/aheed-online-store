import Link from "next/link";
import type { SearchSuggestions } from "@/lib/repositories/products";
import type { CategorySummary } from "@/lib/repositories/categories";

/**
 * P2.6 slice 3 (#580) — ways out of a THIN result, rendered ALONGSIDE the products the search
 * actually found, never instead of them.
 *
 * The case this exists for: a one-word query such as `haldi` that happens to appear in a single
 * unrelated product's description returns exactly one result, so `#565`'s zero-result ladder never
 * runs. The shopper sees one tangential product and reads it as "they do not stock this" — just as
 * firmly as an empty page would say it, while consuming the one mechanism built to prevent that
 * conclusion.
 *
 * RENDERS EVEN WHEN THERE IS NOTHING BETTER TO OFFER. Before the dictionary is populated, the
 * commonest thin result has no approved alias and no in-budget typo correction, so both suggestion
 * fields are null — and that is exactly the shopper who most needs telling that what they are
 * looking at is a loose match. The departments give them somewhere to go regardless.
 *
 * Purely presentational, matching `SearchTruncationNotice` and `SearchRecoveryNotice`: the
 * repository decides whether a result was thin (`ProductPage.suggestions`), this renders it.
 */
export function SearchSuggestionsNotice({
  suggestions,
  categories,
}: {
  suggestions: SearchSuggestions | null;
  categories: CategorySummary[];
}) {
  if (suggestions === null) return null;

  const options = [
    // The catalogue's own word first: an approved synonym is a curated fact about this shop's
    // vocabulary, where a typo correction is only ever an inference about what was meant.
    suggestions.canonicalQuery,
    suggestions.correctedQuery,
  ].filter((option): option is string => option !== null && option.length > 0);

  return (
    <div
      role="status"
      className="mb-6 rounded-xl bg-surface-muted px-4 py-4 text-sm text-primary/80"
    >
      <p className="mb-3">
        These are loosely related — nothing matched that name exactly.
        {options.length > 0 ? " Did you mean:" : " Try a department instead:"}
      </p>

      {options.length > 0 && (
        <ul className="mb-3 flex flex-wrap gap-2">
          {options.map((option) => (
            <li key={option}>
              <Link
                href={`/search?q=${encodeURIComponent(option)}`}
                className="inline-block rounded-full bg-white px-3 py-1 font-medium text-action underline focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2"
              >
                {option}
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
                className="inline-block rounded-full bg-white px-3 py-1 font-medium text-action underline focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2"
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
