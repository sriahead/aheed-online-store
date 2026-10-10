import type { ParseResult } from "@/lib/catalogue-form";

/**
 * Approved-answer field rules (P10, #1012) — pure, DB-free, unit-testable.
 *
 * Same posture as `lib/review-link-form.ts` (#818) and `lib/delivery-rules-form.ts` (#634): every
 * decision about what a submitted field MEANS lives where a test can reach it without a database,
 * a session or a request. `features/admin/faqs.ts` does the reading and the repository call;
 * nothing here knows either exists.
 *
 * NO QUESTION OR ANSWER TEXT APPEARS IN THIS FILE, including as a placeholder or an example. An
 * example question is a claim about what this vendor sells — the #239/#905 defect in miniature,
 * where a grocery example shipped to an electronics retailer. The staff form's placeholders are
 * therefore phrased as instructions, never as sample content.
 *
 * PLAIN TEXT, DELIBERATELY. Answers are rendered as text by React, which escapes them, so no
 * Markdown or HTML is parsed. `#1012`'s spec excludes rich text; a vendor who needs emphasis gets
 * it when that is proposed, not by an unreviewed `dangerouslySetInnerHTML`.
 */

export const QUESTION_FIELD = "question";
export const ANSWER_FIELD = "answer";
export const SORT_ORDER_FIELD = "sortOrder";

/** Long enough for a real question, short enough to render as a heading. */
export const MAX_QUESTION_LENGTH = 200;

/**
 * Long enough for a complete answer, short enough that one row cannot become an article.
 *
 * Also the bound `#1015`'s handoff context will be built from — `wa.me`'s `?text=` truncates
 * silently and its ceiling varies by platform, so an unbounded answer would be a bug there rather
 * than here. Capping it at the source is cheaper than capping it at every consumer.
 */
export const MAX_ANSWER_LENGTH = 1200;

/** A parsed, validated submission. Structurally what the repository's `VendorFaqInput` accepts. */
export interface VendorFaqFormValue {
  question: string;
  answer: string;
  sortOrder: number;
  isActive: boolean;
}

/**
 * `useActionState` shape. Lives here rather than in the action module because a `"use server"` file
 * may export ONLY async functions — a same-file value export makes every action in it 500 at
 * runtime while `build`, `typecheck` and `test` all stay green (#159).
 */
export interface VendorFaqFormState {
  error: string | null;
  field: string | null;
  saved: boolean;
}

export const initialVendorFaqState: VendorFaqFormState = {
  error: null,
  field: null,
  saved: false,
};

/** A non-blank question within the length cap. Internal whitespace is collapsed, not rejected. */
export function parseQuestion(raw: string): ParseResult<string> {
  const trimmed = raw.replace(/\s+/g, " ").trim();

  if (trimmed === "") {
    return { ok: false, error: { field: QUESTION_FIELD, message: "Enter the question." } };
  }

  if (trimmed.length > MAX_QUESTION_LENGTH) {
    return {
      ok: false,
      error: {
        field: QUESTION_FIELD,
        message: `Keep the question to ${MAX_QUESTION_LENGTH} characters or fewer.`,
      },
    };
  }

  return { ok: true, value: trimmed };
}

/**
 * A non-blank answer within the length cap.
 *
 * Line breaks are preserved — unlike the question, an answer may legitimately have paragraphs —
 * so only the ends are trimmed and runs of blank lines are collapsed to one.
 */
export function parseAnswer(raw: string): ParseResult<string> {
  const normalised = raw
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (normalised === "") {
    return { ok: false, error: { field: ANSWER_FIELD, message: "Enter the answer." } };
  }

  if (normalised.length > MAX_ANSWER_LENGTH) {
    return {
      ok: false,
      error: {
        field: ANSWER_FIELD,
        message: `Keep the answer to ${MAX_ANSWER_LENGTH} characters or fewer.`,
      },
    };
  }

  return { ok: true, value: normalised };
}

/** A sort position: a non-negative integer, defaulting to 0 when blank. */
export function parseFaqSortOrder(raw: string): ParseResult<number> {
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: true, value: 0 };

  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return {
      ok: false,
      error: { field: SORT_ORDER_FIELD, message: "Order must be a whole number, 0 or more." },
    };
  }

  return { ok: true, value: parsed };
}

/** A whole answer row, or the first error found. */
export function parseVendorFaq(raw: {
  question: string;
  answer: string;
  sortOrder: string;
  isActive: boolean;
}): ParseResult<VendorFaqFormValue> {
  const question = parseQuestion(raw.question);
  if (!question.ok) return question;

  const answer = parseAnswer(raw.answer);
  if (!answer.ok) return answer;

  const sortOrder = parseFaqSortOrder(raw.sortOrder);
  if (!sortOrder.ok) return sortOrder;

  return {
    ok: true,
    value: {
      question: question.value,
      answer: answer.value,
      sortOrder: sortOrder.value,
      isActive: raw.isActive,
    },
  };
}
