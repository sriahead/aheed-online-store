/**
 * #900 (R22) — the pilot's measurement, computed from stored NetContentSuggestion rows so it
 * lives in the product rather than in a script's scrollback. Pure and unit-tested.
 */

export type SuggestionStatus = "PENDING" | "ACCEPTED" | "EDITED" | "REJECTED" | "NO_ANSWER";
export type LabelCheck = "AGREES" | "DISAGREES" | "NOT_CHECKABLE";

export interface SummaryRow {
  status: SuggestionStatus;
  unitLabelCheck: LabelCheck | null;
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  model: string;
}

export interface PilotSummary {
  total: number;
  byStatus: Record<SuggestionStatus, number>;
  /** ACCEPTED ÷ (ACCEPTED + EDITED + REJECTED); null when nothing has been reviewed yet. */
  acceptanceRate: number | null;
  /** NO_ANSWER ÷ all rows; null when there are no rows. */
  noAnswerShare: number | null;
  /** Among reviewed rows only (ACCEPTED, EDITED, REJECTED). */
  labelCheckAmongReviewed: Record<LabelCheck, number>;
  meanLatencyMs: number | null;
  totalInputTokens: number;
  totalOutputTokens: number;
  models: string[];
}

const REVIEWED: readonly SuggestionStatus[] = ["ACCEPTED", "EDITED", "REJECTED"];

export function summariseNetContentPilot(rows: readonly SummaryRow[]): PilotSummary {
  const byStatus: Record<SuggestionStatus, number> = {
    PENDING: 0,
    ACCEPTED: 0,
    EDITED: 0,
    REJECTED: 0,
    NO_ANSWER: 0,
  };
  const labelCheckAmongReviewed: Record<LabelCheck, number> = {
    AGREES: 0,
    DISAGREES: 0,
    NOT_CHECKABLE: 0,
  };
  let latencyTotal = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  const models = new Set<string>();

  for (const row of rows) {
    byStatus[row.status] += 1;
    if (REVIEWED.includes(row.status) && row.unitLabelCheck) {
      labelCheckAmongReviewed[row.unitLabelCheck] += 1;
    }
    latencyTotal += row.latencyMs;
    inputTokens += row.inputTokens ?? 0;
    outputTokens += row.outputTokens ?? 0;
    models.add(row.model);
  }

  const reviewed = byStatus.ACCEPTED + byStatus.EDITED + byStatus.REJECTED;
  return {
    total: rows.length,
    byStatus,
    acceptanceRate: reviewed === 0 ? null : byStatus.ACCEPTED / reviewed,
    noAnswerShare: rows.length === 0 ? null : byStatus.NO_ANSWER / rows.length,
    labelCheckAmongReviewed,
    meanLatencyMs: rows.length === 0 ? null : latencyTotal / rows.length,
    totalInputTokens: inputTokens,
    totalOutputTokens: outputTokens,
    models: [...models].sort(),
  };
}
