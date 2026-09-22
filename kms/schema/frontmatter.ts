import { z } from "zod";

export const Audience = z.enum([
  "dev",
  "staff",
  "admin",
  "customer",
  "shopper",
  "store-admin",
  "platform-admin",
  "product",
  "operations",
  "marketing",
  "design",
  "architect",
]);
export const Track = z.enum(["internal-eng", "staff-ops", "customer-help"]);
export type Track = z.infer<typeof Track>;
export const DocType = z.enum(["doc", "adr", "spec", "runbook", "prompt", "sop", "faq", "guide"]);
export const Status = z.enum(["draft", "review", "approved", "deprecated"]); // mirrors the SDD gates
export const Visibility = z.enum(["internal", "public"]); // drives WHICH deploy

export const FrontMatter = z.object({
  // required — RAG + index depend on these
  id: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string().min(3),
  audience: z.array(Audience).min(1), // a doc may serve more than one
  type: DocType,
  status: Status,
  version: z.string(), // semver or date
  updated: z.string().date(), // ISO; freshness signal for RAG
  visibility: Visibility, // internal | public — NEVER default to public
  summary: z.string().min(20).max(300), // 1–2 sentences; doubles as the RAG chunk description
  tags: z.array(z.string()).default([]),
  // optional
  owner: z.string().optional(),
  related: z.array(z.string()).optional(), // ids/paths of related specs/ADRs
});
export type FrontMatter = z.infer<typeof FrontMatter>;

/**
 * Which track each audience belongs to. `Record<Audience, Track>` is the point of this
 * shape, not a style preference: it makes the mapping EXHAUSTIVE at compile time, so adding
 * a value to the Audience enum without placing it fails `typecheck` instead of silently
 * falling through to internal-eng. That silent fall-through was real — `platform-admin` was
 * in the enum and in none of the old `if` branches, so docs/platform-admin-guide/ derived
 * internal-eng and rendered in the engineering section (#861).
 */
export const AUDIENCE_TRACK: Record<z.infer<typeof Audience>, Track> = {
  dev: "internal-eng",
  product: "internal-eng",
  design: "internal-eng",
  architect: "internal-eng",
  marketing: "internal-eng",
  staff: "staff-ops",
  admin: "staff-ops",
  "store-admin": "staff-ops",
  "platform-admin": "staff-ops",
  operations: "staff-ops",
  customer: "customer-help",
  shopper: "customer-help",
};

/**
 * Rejects its argument unless the tuple's union covers every Track value, so adding a track
 * without ranking it fails `typecheck` rather than making that track silently unreachable.
 */
function exhaustiveTracks<const T extends readonly Track[]>(
  list: T & (Track extends T[number] ? unknown : never),
): readonly Track[] {
  return list;
}

/**
 * Precedence, most restrictive first. A document whose audiences span tracks resolves to the
 * FIRST track listed here that any of its audiences maps to — so it reaches the public
 * surface only when it touches no internal audience at all.
 *
 * The old derivation returned the first matching `if` with customer-help tested FIRST, which
 * is backwards: docs/operations-research/order-fulfilment-core.md declares
 * `visibility: internal` with an audience list of staff, store-admin, dev, product AND
 * shopper, so it derived customer-help and was routed to the public site. It was therefore
 * absent from the only deployed KMS surface — the canonical orders document produced by the
 * #851 pilot, invisible on the internal site, queued for a public site that does not exist.
 *
 * Ordered explicitly rather than by statement order (KMS strategy §4.2): a reader can see the
 * rule without reconstructing it from control flow.
 */
export const TRACK_PRECEDENCE = exhaustiveTracks(["staff-ops", "internal-eng", "customer-help"]);

/**
 * Which deployed surface each track renders on. Lives here, not in assemble.ts, because
 * kms:validate needs the same fact to check that a document's derived track and its declared
 * `visibility` agree — and two copies of that mapping would be free to drift. assemble.ts owns
 * only the content FOLDER name for each track, which is a build detail rather than a rule.
 */
export const TRACK_SITE: Record<Track, z.infer<typeof Visibility>> = {
  "internal-eng": "internal",
  "staff-ops": "internal",
  "customer-help": "public",
};

// track is DERIVED (audience → track) so it can't disagree with audience.
export function trackFor(fm: FrontMatter): Track {
  for (const track of TRACK_PRECEDENCE) {
    if (fm.audience.some((audience) => AUDIENCE_TRACK[audience] === track)) return track;
  }
  // Unreachable while AUDIENCE_TRACK covers Audience, TRACK_PRECEDENCE covers Track and
  // audience is min(1) — all three compiler-enforced above. Throwing rather than defaulting
  // is the point of #861: a silent fallback to internal-eng is what hid `platform-admin`.
  throw new Error(`trackFor: no track for audience [${fm.audience.join(", ")}] (id: ${fm.id})`);
}
