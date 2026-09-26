import { getPrisma, getPrismaWs } from "@/lib/db";
import {
  listNetContentSummaryRows,
  listPendingNetContentSuggestions,
  rejectNetContentSuggestion,
  reviewNetContentSuggestion,
  type ReviewDecision,
} from "@/lib/repositories/net-content-suggestions";

/**
 * #900 — request-scoped facade over lib/repositories/net-content-suggestions.ts, per CLAUDE.md's
 * repository rule. Client choice (#382): the reads and the singular-update reject use the HTTP
 * client; accept/edit run an interactive transaction with `updateMany`, so they take WebSocket.
 */

export function listPendingNetContentSuggestionsForVendor(vendorId: string) {
  return listPendingNetContentSuggestions(getPrisma(), vendorId);
}

export function listNetContentSummaryRowsForVendor(vendorId: string) {
  return listNetContentSummaryRows(getPrisma(), vendorId);
}

export function reviewNetContentSuggestionForVendor(
  vendorId: string,
  suggestionId: string,
  reviewerUserId: string,
  decision: ReviewDecision,
) {
  return reviewNetContentSuggestion(
    getPrismaWs(),
    vendorId,
    suggestionId,
    reviewerUserId,
    decision,
  );
}

export function rejectNetContentSuggestionForVendor(
  vendorId: string,
  suggestionId: string,
  reviewerUserId: string,
) {
  return rejectNetContentSuggestion(getPrisma(), vendorId, suggestionId, reviewerUserId);
}
