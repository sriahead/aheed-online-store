import { z } from "zod";

export const Audience = z.enum(["dev", "staff", "customer"]);
export const Track = z.enum(["internal-eng", "staff-ops", "customer-help"]);
export const DocType = z.enum(["doc", "adr", "spec", "runbook", "prompt", "sop", "faq"]);
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

// track is DERIVED (audience → track) so it can't disagree with audience.
export function trackFor(fm: FrontMatter): z.infer<typeof Track> {
  if (fm.audience.includes("customer")) return "customer-help";
  if (fm.audience.includes("staff")) return "staff-ops";
  return "internal-eng";
}
