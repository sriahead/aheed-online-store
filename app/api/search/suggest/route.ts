import { NextResponse } from "next/server";
import { getCurrentVendorIdOrNull } from "@/lib/tenant";
import { parseSearchQuery } from "@/lib/search-query";
import { getProductRepository } from "@/lib/products-service";
import { getCategoryRepository } from "@/lib/categories-service";

export const dynamic = "force-dynamic";

/**
 * How many rows the product query may fetch before ranking (#568).
 *
 * Declared HERE, not in the repository, and passed down. This is a public, unauthenticated
 * endpoint reached once per keystroke, so the bound belongs where the exposure is — anyone reading
 * the route can see what a request costs without following it into the data layer.
 *
 * 30 is small on purpose: only 6 are ever returned, and the extra headroom exists so ranking has
 * something to choose between rather than being handed exactly what it must emit.
 */
const SUGGEST_CANDIDATE_LIMIT = 30;

const MAX_PRODUCTS = 6;
const MAX_CATEGORIES = 3;
const MAX_TERMS = 3;

/** Seconds an edge/browser cache may serve a suggestion response. */
const CACHE_SECONDS = 60;

const EMPTY = { products: [], categories: [], terms: [] };

/**
 * Storefront search autocomplete.
 *
 * HOW THIS IS BOUNDED, and why it is not a throttle table (`specs/architecture.md`, and `#571` for
 * the AI-cost ruling this deliberately does NOT copy): the three existing throttles in this repo
 * each write a row per attempt, which is right for a write path reached once per submission and
 * wrong for a read path reached once per keystroke — the guard would be a heavier write than the
 * read it guards. Instead the bounds are: a minimum term length (`parseSearchQuery` drops
 * sub-two-character tokens since `#572`, so the cheapest abusive query never reaches the database),
 * a hard `take`, a client-side debounce, and a short public `Cache-Control` so repeats are served
 * at Cloudflare's edge.
 *
 * NO AI, and no `SearchQueryLog` write. The log is not omitted for speed: a row per keystroke would
 * flood the exact table `#566`'s synonym proposals read, so logging here would silently corrupt a
 * neighbouring feature's input.
 *
 * Runs on the Node.js runtime like every other route in this app — there is deliberately no
 * `export const runtime` (CLAUDE.md: never `edge`).
 */
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q") ?? "";
  const terms = parseSearchQuery(query);

  // No parseable term: answer honestly and issue no query at all. This is the first and cheapest
  // of the bounds above, and it is what makes a flood of single-character requests free.
  if (terms.length === 0) return json(EMPTY);

  /*
   * An unresolvable vendor is a 200 with empty arrays, never a 5xx. This endpoint is called from a
   * keystroke handler, so a failure here would be invisible noise in the browser console on every
   * request; and an unmapped host is a normal condition in this app (it is what `/coming-soon`
   * exists for), not an error.
   */
  const vendorId = await getCurrentVendorIdOrNull();
  if (!vendorId) return json(EMPTY);

  /*
   * Through the request-scoped service facades, never `getPrisma()` directly — `eslint.config.mjs`
   * restricts `@/lib/db` in the app layer precisely so vendor scoping cannot be bypassed here
   * (ADR-004 slice 2). The facades resolve the vendor themselves; the check above exists only to
   * turn an unmapped host into an empty 200 rather than letting it throw.
   */
  const products = getProductRepository();
  const categories = getCategoryRepository();
  const [productRows, categoryRows, aliases] = await Promise.all([
    products.suggestProducts(query, SUGGEST_CANDIDATE_LIMIT),
    categories.suggest(terms, MAX_CATEGORIES),
    products.synonymAliasMap(),
  ]);

  return json({
    products: productRows.slice(0, MAX_PRODUCTS).map((p) => ({
      slug: p.slug,
      name: p.name,
      inStock: p.inStock,
    })),
    categories: categoryRows.map((c) => ({ slug: c.slug, name: c.name })),
    terms: suggestTerms(terms, aliases),
  });
}

/**
 * Approved synonym terms worth offering as alternative wordings (#566's dictionary, read here).
 *
 * Offers the CANONICAL word for an alias the shopper appears to be typing — "dhania" suggests
 * "coriander" — because the canonical is what the catalogue actually calls the thing. A term the
 * shopper already typed exactly is never offered back to them.
 */
function suggestTerms(terms: readonly string[], aliases: Map<string, string>): string[] {
  const typed = new Set(terms);
  const out: string[] = [];
  for (const [alias, canonical] of aliases) {
    if (out.length >= MAX_TERMS) break;
    if (typed.has(canonical) || out.includes(canonical)) continue;
    if (terms.some((term) => alias.includes(term))) out.push(canonical);
  }
  return out;
}

function json(body: unknown): NextResponse {
  return NextResponse.json(body, {
    headers: {
      // Public rather than private: a suggestion response carries no per-shopper data at all, so
      // it is safe to share. Cloudflare's cache key includes the hostname, which is what keeps one
      // vendor's suggestions out of another's response — verified per environment against a real
      // deployment, never assumed (see specs/architecture.md and #502).
      "Cache-Control": `public, max-age=${CACHE_SECONDS}`,
    },
  });
}
