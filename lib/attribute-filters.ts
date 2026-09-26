import {
  ATTRIBUTE_PARAM_PREFIX,
  isAttributeParamKey,
  type FilterParams,
} from "@/components/product/filter-params";

/**
 * #912 — resolves a browse page's `attr_<attributeSlug>=<optionSlug>` params against the vendor's
 * own filters.
 *
 * The predicate and the chip are conditioned on the SAME resolution, the rule #568's R15 fix set
 * for `category` and #569 for `brand`: a param resolves only when its attribute slug AND its option
 * slug both exist for this vendor and its value is a single string. Anything else — an unknown
 * slug, an empty value, a repeated parameter arriving as an array (#689) — applies no predicate
 * and gets no label, so no chip claims a filter that is not running.
 *
 * Pure. The page passes the vendor's definitions in (one query); nothing here reads a request.
 */

export interface AttributeFilterDefinition {
  slug: string;
  name: string;
  options: { id: string; slug: string; name: string }[];
}

export interface ResolvedAttributeFilters {
  /** One option id per resolved param — `ProductFilters.attributeOptionIds`. */
  optionIds: string[];
  /** Resolved param key → chip label, `"<Filter>: <Value>"`. */
  labels: Record<string, string>;
}

export function resolveAttributeFilters(
  params: FilterParams,
  attributes: readonly AttributeFilterDefinition[],
): ResolvedAttributeFilters {
  const optionIds: string[] = [];
  const labels: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (!isAttributeParamKey(key) || typeof value !== "string" || value === "") continue;
    const attribute = attributes.find(
      (candidate) => candidate.slug === key.slice(ATTRIBUTE_PARAM_PREFIX.length),
    );
    const option = attribute?.options.find((candidate) => candidate.slug === value);
    if (!attribute || !option) continue;
    optionIds.push(option.id);
    labels[key] = `${attribute.name}: ${option.name}`;
  }
  return { optionIds, labels };
}
