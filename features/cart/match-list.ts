"use server";

import { getProductRepository } from "@/lib/products-service";
import { checkListNormalisationAllowed } from "@/lib/list-normalisation-service";
import {
  buildNormalisationPrompt,
  isNormalisationConfigured,
  MAX_AI_INPUT_CHARS,
  mergeNormalisedItems,
  normaliseList,
} from "@/lib/list-normalisation";
import { distinctTerms, parseList, resolveLines, type MatchListState } from "@/lib/shopping-list";

/**
 * "Shop your list" step 1 (P3d, #114): parse the pasted list and resolve every
 * line against this vendor's catalogue.
 *
 * This action deliberately WRITES NOTHING to the cart — no Cart, no CartItem, no
 * guest cookie. A shopper who pastes a list and leaves still has no cart state,
 * preserving P3a's lazy-creation rule. The guest token is issued only by
 * add-list-to-cart. (P2.6 slice 4 does write a ListNormalisationAttempt row when
 * the AI pre-pass runs; that is a throttle counter keyed on a hashed IP, not
 * shopper state, and it is written only on the path that actually calls the model.)
 *
 * MatchListState lives in lib/shopping-list.ts: a "use server" module may only
 * export async functions, so the state's empty value cannot live here (#159).
 *
 * P2.6 slice 4 (#567) — the AI normalisation pre-pass sits between parsing and
 * matching. It only ever rewrites the shopper's WORDS; the catalogue match below
 * is unchanged and still deterministic, so nothing the model returns can become a
 * product. Every failure path leaves `parsed` exactly as the deterministic parser
 * produced it, which is precisely this feature's pre-slice behaviour.
 */

/** Why a submission skipped the AI pre-pass. Logged once, machine-readable (R23). */
type SkipReason = "over-input-cap" | "rate-limited" | "unavailable";

function logSkip(reason: SkipReason, lineCount: number): void {
  console.warn(`list-normalisation skipped reason=${reason} lines=${lineCount}`);
}

export async function matchList(
  _prev: MatchListState,
  formData: FormData,
): Promise<MatchListState> {
  const raw = formData.get("list");
  const parsed = parseList(typeof raw === "string" ? raw : "");

  if (parsed.length === 0) {
    return { lines: null, error: "Add at least one item to your list." };
  }

  // The AI pre-pass, or today's deterministic parse if it is unavailable, throttled or refused.
  // Either way this returns one line per line, so nothing below needs to know which happened.
  const lines = await normaliseParsed(parsed);

  const repo = getProductRepository();
  const terms = distinctTerms(lines);
  // P2.6 slice 3 (#566, #396) — the alias map has to reach resolveLines() too, not just the
  // candidate query: matchListTerms already widens its OR with approved aliases, but the
  // per-line re-check resolveLines does afterwards is a separate, alias-blind step unless this
  // is passed through — see synonymAliasMap()'s docstring in lib/repositories/products.ts.
  const [candidates, aliases] = await Promise.all([
    repo.matchListTerms(terms),
    repo.synonymAliasMap(),
  ]);
  return { lines: resolveLines(lines, candidates, aliases) };
}

/**
 * Run the pre-pass, or don't, and say why. Returns the lines to match either way — never throws,
 * never surfaces an AI failure to the shopper.
 *
 * Split out of matchList so the "use server" module keeps exporting only async functions and the
 * skip paths stay readable as a single sequence.
 */
async function normaliseParsed(parsed: ReturnType<typeof parseList>) {
  // Both free checks run BEFORE the throttle, because the throttle writes a row every time it
  // admits a caller. Consulting it first would spend a shopper's budget on a submission that was
  // never going to reach the model — on an environment with no AI credential, it would spend it
  // on every submission forever (R22).
  if (buildNormalisationPrompt(parsed).length > MAX_AI_INPUT_CHARS) {
    logSkip("over-input-cap", parsed.length);
    return parsed;
  }

  if (!isNormalisationConfigured()) {
    logSkip("unavailable", parsed.length);
    return parsed;
  }

  const { allowed } = await checkListNormalisationAllowed();
  if (!allowed) {
    logSkip("rate-limited", parsed.length);
    return parsed;
  }

  const items = await normaliseList(parsed);
  if (items === null) {
    // No credential, non-OK response, timeout, unparseable body — all one thing to the shopper.
    logSkip("unavailable", parsed.length);
    return parsed;
  }

  return mergeNormalisedItems(parsed, items);
}
