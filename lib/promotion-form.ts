import type { FieldError, ParseResult, RawForm } from "@/lib/catalogue-form";
import { parseLocalInput } from "@/lib/local-datetime";
import type { AudienceSegment } from "@prisma/client";

/**
 * Promotion form parser and validator (R6, R22) — pure, unit-testable.
 */

export type PromotionTargetType = "GENERIC" | "DEPARTMENT" | "BUNDLE" | "DISCOUNT_CODE";

export interface PromotionFormValues {
  headline: string;
  subtitle: string | null;
  badgeText: string | null;
  callToActionText: string | null;
  linkUrl: string | null;
  priority: number;
  isActive: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  audienceSegment: AudienceSegment;
  targetType: PromotionTargetType;
  categoryId: string | null;
  bundleId: string | null;
  discountCodeId: string | null;
  imageKey: string | null;
  altText: string | null;
}

export interface PromotionFormState {
  error: string | null;
  field: string | null;
  saved: boolean;
  promotionId?: string | null;
}

export const initialPromotionFormState: PromotionFormState = {
  error: null,
  field: null,
  saved: false,
  promotionId: null,
};

export const PROMOTION_FIELDS = [
  "id",
  "headline",
  "subtitle",
  "badgeText",
  "callToActionText",
  "linkUrl",
  "priority",
  "isActive",
  "startsAt",
  "endsAt",
  "audienceSegment",
  "targetType",
  "categoryId",
  "bundleId",
  "discountCodeId",
  "imageKey",
  "altText",
] as const;

function text(raw: RawForm, field: string): string {
  return (raw[field] ?? "").trim();
}

function optionalText(raw: RawForm, field: string): string | null {
  const value = text(raw, field);
  return value === "" ? null : value;
}

function relativeLinkUrl(raw: RawForm): ParseResult<string | null> {
  const value = optionalText(raw, "linkUrl");
  if (value === null) return { ok: true, value: null };
  if (!value.startsWith("/") || value.startsWith("//")) {
    return {
      ok: false,
      error: {
        field: "linkUrl",
        message: "The link must be a relative path, e.g. /categories/fresh-produce.",
      },
    };
  }
  return { ok: true, value };
}

function parseDateBoundary(
  raw: RawForm,
  field: "startsAt" | "endsAt",
  timezone: string,
): ParseResult<Date | null> {
  const value = text(raw, field);
  if (value === "") return { ok: true, value: null };
  const parsed = parseLocalInput(value, timezone);
  if (parsed === null) {
    return {
      ok: false,
      error: { field, message: `Please enter a valid date and time for ${field}.` },
    };
  }
  return { ok: true, value: parsed };
}

/**
 * Validates and parses raw promotion form submission.
 */
export function parsePromotionForm(
  raw: RawForm,
  timezone: string,
): ParseResult<PromotionFormValues> {
  const headline = text(raw, "headline");
  if (headline.length < 3 || headline.length > 100) {
    return {
      ok: false,
      error: {
        field: "headline",
        message: "Headline must be between 3 and 100 characters.",
      },
    };
  }

  const subtitle = optionalText(raw, "subtitle");
  if (subtitle && subtitle.length > 200) {
    return {
      ok: false,
      error: {
        field: "subtitle",
        message: "Subtitle cannot exceed 200 characters.",
      },
    };
  }

  const badgeText = optionalText(raw, "badgeText");
  if (badgeText && badgeText.length > 40) {
    return {
      ok: false,
      error: {
        field: "badgeText",
        message: "Badge text cannot exceed 40 characters.",
      },
    };
  }

  const callToActionText = optionalText(raw, "callToActionText");
  if (callToActionText && callToActionText.length > 40) {
    return {
      ok: false,
      error: {
        field: "callToActionText",
        message: "Call to action text cannot exceed 40 characters.",
      },
    };
  }

  const linkResult = relativeLinkUrl(raw);
  if (!linkResult.ok) return linkResult;

  const rawPriority = text(raw, "priority");
  const priority = rawPriority === "" ? 0 : parseInt(rawPriority, 10);
  if (Number.isNaN(priority) || priority < 0 || priority > 1000) {
    return {
      ok: false,
      error: {
        field: "priority",
        message: "Priority must be an integer between 0 and 1000.",
      },
    };
  }

  const startsResult = parseDateBoundary(raw, "startsAt", timezone);
  if (!startsResult.ok) return startsResult;

  const endsResult = parseDateBoundary(raw, "endsAt", timezone);
  if (!endsResult.ok) return endsResult;

  if (startsResult.value && endsResult.value && startsResult.value > endsResult.value) {
    return {
      ok: false,
      error: {
        field: "endsAt",
        message: "End date must be after the start date.",
      },
    };
  }

  const targetTypeRaw = text(raw, "targetType").toUpperCase() as PromotionTargetType;
  const targetType: PromotionTargetType = [
    "GENERIC",
    "DEPARTMENT",
    "BUNDLE",
    "DISCOUNT_CODE",
  ].includes(targetTypeRaw)
    ? targetTypeRaw
    : "GENERIC";

  let categoryId: string | null = null;
  let bundleId: string | null = null;
  let discountCodeId: string | null = null;

  if (targetType === "DEPARTMENT") {
    categoryId = optionalText(raw, "categoryId");
    if (!categoryId) {
      return {
        ok: false,
        error: { field: "categoryId", message: "Please select a department." },
      };
    }
  } else if (targetType === "BUNDLE") {
    bundleId = optionalText(raw, "bundleId");
    if (!bundleId) {
      return {
        ok: false,
        error: { field: "bundleId", message: "Please select a product bundle." },
      };
    }
  } else if (targetType === "DISCOUNT_CODE") {
    discountCodeId = optionalText(raw, "discountCodeId");
    if (!discountCodeId) {
      return {
        ok: false,
        error: { field: "discountCodeId", message: "Please select a discount code." },
      };
    }
  }

  const audienceRaw = text(raw, "audienceSegment") as AudienceSegment;
  const audienceSegment: AudienceSegment = [
    "ALL",
    "NEW_CUSTOMER",
    "RETURNING_CUSTOMER",
    "LOYALTY_MEMBER",
  ].includes(audienceRaw)
    ? audienceRaw
    : "ALL";

  const isActive = raw["isActive"] === "true" || raw["isActive"] === "on";
  const imageKey = optionalText(raw, "imageKey");
  const altText = optionalText(raw, "altText");

  return {
    ok: true,
    value: {
      headline,
      subtitle,
      badgeText,
      callToActionText,
      linkUrl: linkResult.value,
      priority,
      isActive,
      startsAt: startsResult.value,
      endsAt: endsResult.value,
      audienceSegment,
      targetType,
      categoryId,
      bundleId,
      discountCodeId,
      imageKey,
      altText,
    },
  };
}
