/**
 * #1578 R4 — how the review screen groups and labels an import's lines. Pure, shared by the page
 * (server) and the review component (client).
 */

export type ReviewGroup =
  "decide" | "create" | "update" | "unchanged" | "skip" | "applied" | "failed";

export const REVIEW_GROUPS: { id: ReviewGroup; label: string }[] = [
  { id: "decide", label: "Needs a decision" },
  { id: "create", label: "New products" },
  { id: "update", label: "Updates" },
  { id: "unchanged", label: "Unchanged" },
  { id: "skip", label: "Skipped" },
  { id: "applied", label: "Applied" },
  { id: "failed", label: "Failed" },
];

export interface GroupableLine {
  decision: string;
  status: string;
  changeSummary: string;
  decidedAt: string | null;
}

export function reviewGroup(line: GroupableLine): ReviewGroup {
  if (line.status === "APPLIED" || line.status === "UNDONE" || line.status === "APPLYING")
    return "applied";
  if (line.status === "FAILED") return "failed";
  switch (line.decision) {
    case "REVIEW":
    case "HOLD":
      return "decide";
    case "CREATE":
      return "create";
    case "UPDATE":
      return line.changeSummary === "" && !line.decidedAt ? "unchanged" : "update";
    default:
      return "skip";
  }
}

export const DECISION_LABELS: Record<string, string> = {
  UPDATE: "Update existing product",
  CREATE: "Create new product (hidden)",
  REVIEW: "Needs a decision",
  HOLD: "Held: question for you",
  SKIP: "Skip",
  DUPLICATE: "Duplicate row in the file",
};

/** Lines an Apply would write now. */
export function readyToApply(lines: readonly { decision: string; status: string }[]): number {
  return lines.filter(
    (l) =>
      (l.decision === "UPDATE" || l.decision === "CREATE") &&
      (l.status === "OPEN" || l.status === "FAILED"),
  ).length;
}
