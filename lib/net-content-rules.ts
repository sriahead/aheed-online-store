import type { NetContentUnit } from "@/components/product/unit-price";
import { extractDetailedNetContent } from "@/lib/catalogue-import/net-content";
import {
  checkSuggestionAgainstUnitLabel,
  type UnitLabelCheck,
} from "@/lib/net-content-label-check";

/**
 * #697 — net content read by fixed rules, with no AI, as the first step of the staff "Suggest" run.
 * Pure: no database, no network.
 *
 * A rule answer is a SUGGESTION like the model's: it goes into the same /staff/net-content queue as
 * PENDING, and reaches a product only when a person accepts or edits it (#900's safety property).
 * The rules exist because they are free and exact where they apply, so the paid model is asked only
 * about products the rules cannot read.
 *
 * Two rules, in order:
 * 1. The product NAME states one fixed pack size ("Squid Block – 2kg"). A range, a minimum or a
 *    "Pack of N" beside a single weight is not fixed (`extractDetailedNetContent` marks those LOW),
 *    so it gets no rule answer.
 * 2. The unit label prices the product per kg ("£6.49 / kg") at exactly its base price, so it is
 *    sold by the kilogram and its pack is 1 kg.
 */

/** Stored in `NetContentSuggestion.model`, so the queue and the summary say where a row came from. */
export const RULES_MODEL = "rules (no AI)";

export interface RuleSuggestion {
  amount: number;
  unit: NetContentUnit;
  confidence: number;
  evidenceSource: "NAME" | "UNIT_LABEL";
  evidenceText: string;
  unitLabelCheck: UnitLabelCheck;
}

const PER_KG = /£\s*(\d+(?:\.\d{1,2})?)\s*\/\s*kg\b/i;

function pence(pounds: string): number {
  return Math.round(Number(pounds) * 100);
}

export function suggestNetContentByRule(product: {
  name: string;
  unitLabel: string;
  basePrice: number;
}): RuleSuggestion | null {
  const fromName = extractDetailedNetContent(product.name);
  if (fromName && fromName.confidence === "HIGH") {
    const value = { amount: fromName.amount, unit: fromName.unit };
    return {
      ...value,
      confidence: 90,
      evidenceSource: "NAME",
      evidenceText: fromName.rawMatch,
      unitLabelCheck: checkSuggestionAgainstUnitLabel(product.basePrice, product.unitLabel, value),
    };
  }

  const perKg = PER_KG.exec(product.unitLabel);
  if (perKg && product.basePrice > 0 && pence(perKg[1]) === product.basePrice) {
    const value = { amount: 1, unit: "KILOGRAM" as const };
    return {
      ...value,
      confidence: 95,
      evidenceSource: "UNIT_LABEL",
      evidenceText: perKg[0],
      unitLabelCheck: checkSuggestionAgainstUnitLabel(product.basePrice, product.unitLabel, value),
    };
  }

  return null;
}
