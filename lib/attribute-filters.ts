import {
  ATTRIBUTE_PARAM_PREFIX,
  attributeParamValues,
  isAttributeListParamKey,
  parseAttributeRangeParamKey,
  type FilterParams,
} from "@/components/product/filter-params";
import { attributePairKey } from "@/components/product/filter-chips";
import { formatAttributeNumber, parseAttributeNumber } from "@/lib/attribute-number";

/**
 * #912 — resolves a browse page's vendor-filter params against the vendor's own filters.
 *
 * The predicate and the chip are conditioned on the SAME resolution, the rule #568's R15 fix set
 * for `category` and #569 for `brand`: a param resolves only when it names a filter and a value this
 * vendor has. Anything else — an unknown slug, an empty value, a repeated range bound (#689) —
 * applies no predicate and gets no label, so no chip claims a filter that is not running.
 *
 * #918 adds two things:
 * - a LIST filter may carry SEVERAL values (`attr_colour=black&attr_colour=white`), which become one
 *   group of option ids (any of them), one label per value;
 * - a NUMBER filter takes `attr_<slug>_min` / `_max`, each passing lib/attribute-number.ts's rule.
 *
 * A list key naming a NUMBER filter, or a range key naming a LIST filter, resolves to nothing.
 *
 * Pure. The page passes the vendor's definitions in (one query); nothing here reads a request.
 */

export interface AttributeFilterDefinition {
  id: string;
  slug: string;
  name: string;
  kind: "LIST" | "NUMBER";
  unit: string | null;
  options: { id: string; slug: string; name: string }[];
}

export interface AttributeRangeFilter {
  attributeId: string;
  min?: string;
  max?: string;
}

export interface ResolvedAttributeFilters {
  /** One group per LIST filter with a resolved value — `ProductFilters.attributeOptionGroups`. */
  optionGroups: string[][];
  /** One entry per NUMBER filter with a resolved bound — `ProductFilters.attributeRanges`. */
  ranges: AttributeRangeFilter[];
  /** Pair key (`attr_colour=black`) → chip label. See `attributePairKey`. */
  labels: Record<string, string>;
}

export function resolveAttributeFilters(
  params: FilterParams,
  attributes: readonly AttributeFilterDefinition[],
): ResolvedAttributeFilters {
  const optionGroups: string[][] = [];
  const ranges = new Map<string, AttributeRangeFilter>();
  const labels: Record<string, string> = {};

  for (const [key, raw] of Object.entries(params)) {
    if (isAttributeListParamKey(key)) {
      const attribute = attributes.find(
        (candidate) =>
          candidate.kind === "LIST" && candidate.slug === key.slice(ATTRIBUTE_PARAM_PREFIX.length),
      );
      if (!attribute) continue;
      const group: string[] = [];
      for (const value of attributeParamValues(key, raw)) {
        const option = attribute.options.find((candidate) => candidate.slug === value);
        if (!option) continue;
        group.push(option.id);
        labels[attributePairKey(key, value)] = `${attribute.name}: ${option.name}`;
      }
      if (group.length > 0) optionGroups.push(group);
      continue;
    }

    const range = parseAttributeRangeParamKey(key);
    if (!range) continue;
    const attribute = attributes.find(
      (candidate) => candidate.kind === "NUMBER" && candidate.slug === range.slug,
    );
    // A repeated bound arrives as an array, which `parseAttributeNumber` refuses: no filter.
    const bound = parseAttributeNumber(raw);
    if (!attribute || bound === null) continue;
    const entry = ranges.get(attribute.id) ?? { attributeId: attribute.id };
    entry[range.bound] = bound;
    ranges.set(attribute.id, entry);
    const formatted = formatAttributeNumber(bound, attribute.unit);
    labels[attributePairKey(key, typeof raw === "string" ? raw : bound)] =
      range.bound === "min"
        ? `${attribute.name}: from ${formatted}`
        : `${attribute.name}: up to ${formatted}`;
  }

  return { optionGroups, ranges: [...ranges.values()], labels };
}
