import { slugify } from "@/lib/catalogue-form";
import {
  classifyImportRow,
  newImportedProductState,
  normaliseDepartment,
  type DepartmentRestrictionPolicy,
} from "@/lib/catalogue-import-policy";
import type { ProductRestriction, StockMode } from "@/lib/cart-rules";
import { parsePricePence } from "./price";
import type { ImportProfile } from "./profile";
import type { SourceRow } from "./rows";

/**
 * #1216 — turns validated source rows into a WRITE PLAN, and nothing else. Pure: no Prisma, no I/O,
 * no clock. Everything the importer will later write is decided here and can therefore be
 * inspected, reported and refused BEFORE a database is touched (the dry-run is this function plus a
 * report).
 *
 * THE WRITE SET IS DELIBERATELY NARROW. A planned product carries exactly the columns a `Product`
 * needs plus the three the import policy decides (`isActive`, `restriction`, and — on its
 * inventory row — `stockMode`). There is no field for barcode, supplier, cost, case size, reorder
 * level or stock quantity, so no code path can fabricate or forward one (R15). `isActive`,
 * `restriction` and `stockMode` come from `newImportedProductState` and nowhere else.
 *
 * CATEGORIES ARE THE CLIENT'S OWN (owner decision, 2026-10-22). Names are the source values with
 * only leading/trailing whitespace removed (already done by `readRows`); nothing is mapped,
 * matched, title-cased or corrected. Standardising the structure is a later phase.
 */

export type RejectCode =
  | "BLANK_PLU"
  | "BLANK_DEPARTMENT"
  | "BLANK_NAME"
  | "BAD_PRICE"
  | "NEGATIVE_PRICE"
  | "BAD_SLUG"
  | "DUPLICATE_ROW"
  | "CATEGORY_CONFLICT";

export interface RejectedRow {
  sourceRow: number;
  code: RejectCode;
  reason: string;
}

export interface PlannedCategory {
  slug: string;
  name: string;
  /** Slug of the parent, or null for a department (top-level) category. */
  parentSlug: string | null;
  /** Always false: imported categories are created inactive (R14). */
  isActive: false;
}

export interface PlannedProduct {
  sourceRow: number;
  slug: string;
  name: string;
  description: string;
  basePrice: number;
  unitLabel: string;
  /** The category the product is filed under: its sub-category when it has one, else its department. */
  categorySlug: string;
  /** Slug of the top-level department category — the unit of one write transaction. */
  departmentSlug: string;
  /** From `newImportedProductState`. */
  isActive: false;
  restriction: ProductRestriction | null;
  stockMode: StockMode;
  /** The client's PLU and department, kept for the trace and for drift checks. */
  plu: string;
  sourceDepartment: string;
}

export interface CategoryVariant {
  slug: string;
  /** The name the category was created with: the first occurrence in source row order. */
  chosen: string;
  /** Every other spelling that produced the same slug, with the first source row it appeared on. */
  variants: { name: string; sourceRow: number }[];
}

export interface FlattenedSubDepartment {
  department: string;
  subDepartment: string;
  rows: number;
}

export interface UnreviewedDepartment {
  department: string;
  rows: number;
}

export interface VatSummary {
  /** Rows per normalised VAT rate ("20.00" and "20" are one rate). Reported, never rewritten. */
  byRate: Record<string, number>;
  /** Rows whose normalised rate is 0 and whose restriction is non-null. */
  zeroRatedRestricted: { sourceRow: number; department: string; restriction: ProductRestriction }[];
}

export interface ImportPlan {
  categories: PlannedCategory[];
  products: PlannedProduct[];
  rejected: RejectedRow[];
  unreviewedDepartments: UnreviewedDepartment[];
  flattenedSubDepartments: FlattenedSubDepartment[];
  categoryNameVariants: CategoryVariant[];
  restrictionCounts: Record<ProductRestriction, number>;
  vat: VatSummary;
}

/** Spelling of the unit pattern's match, verbatim, else the profile's documented default (R16). */
export function unitLabelFor(name: string, unit: ImportProfile["unit"]): string {
  const match = new RegExp(unit.pattern, "i").exec(name);
  return match !== null && match[0].trim() !== "" ? match[0].trim() : unit.defaultLabel;
}

/** R13 — depends only on this row's own name, PLU and department, never on another row. */
export function productSlug(name: string, plu: string, department: string): string {
  return `${slugify(name).slice(0, 80)}-${slugify(plu)}-${slugify(department)}`;
}

/**
 * The profile's policy with every department that appears in the file but in none of the three
 * reviewed lists added to the uncertain list (R17). Uncertainty means NEEDS_REVIEW, never "fine".
 */
export function effectivePolicy(
  policy: ImportProfile["policy"],
  departmentsInFile: readonly string[],
): { policy: DepartmentRestrictionPolicy; unreviewed: string[] } {
  const known = new Set(
    [
      ...Object.keys(policy.byDepartment),
      ...policy.uncertainDepartments,
      ...policy.unrestrictedDepartments,
    ].map(normaliseDepartment),
  );
  const unreviewed: string[] = [];
  const seen = new Set<string>();
  for (const department of departmentsInFile) {
    const normal = normaliseDepartment(department);
    if (normal === "" || known.has(normal) || seen.has(normal)) continue;
    seen.add(normal);
    unreviewed.push(department);
  }
  return {
    policy: {
      byDepartment: policy.byDepartment,
      uncertainDepartments: [...policy.uncertainDepartments, ...unreviewed],
    },
    unreviewed,
  };
}

/** VAT cell → a rate key: "20.00" and "20" are one rate, "0" and "0.0" are one rate. */
export function normaliseVat(raw: string): string {
  const text = raw.trim();
  if (text === "") return "(blank)";
  if (/^\d+(\.\d+)?$/.test(text)) {
    return text.includes(".") ? text.replace(/0+$/, "").replace(/\.$/, "") : text;
  }
  return text;
}

export function buildPlan(rows: readonly SourceRow[], profile: ImportProfile): ImportPlan {
  const rejected: RejectedRow[] = [];
  const reject = (row: SourceRow, code: RejectCode, reason: string) =>
    rejected.push({ sourceRow: row.sourceRow, code, reason });

  const departmentCounts = new Map<string, { name: string; rows: number }>();
  for (const row of rows) {
    const normal = normaliseDepartment(row.department);
    if (normal === "") continue;
    const entry = departmentCounts.get(normal) ?? { name: row.department, rows: 0 };
    entry.rows += 1;
    departmentCounts.set(normal, entry);
  }
  const { policy, unreviewed } = effectivePolicy(
    profile.policy,
    [...departmentCounts.values()].map((d) => d.name),
  );
  const unreviewedDepartments = unreviewed.map((department) => ({
    department,
    rows: departmentCounts.get(normaliseDepartment(department))?.rows ?? 0,
  }));

  const categories = new Map<string, PlannedCategory>();
  const variants = new Map<string, CategoryVariant>();
  const flattened = new Map<string, FlattenedSubDepartment>();
  const products: PlannedProduct[] = [];
  const productSlugs = new Map<string, number>();
  const restrictionCounts: Record<ProductRestriction, number> = {
    PROHIBITED: 0,
    AGE_RESTRICTED: 0,
    NOT_DELIVERABLE: 0,
    NEEDS_REVIEW: 0,
  };
  const vat: VatSummary = { byRate: {}, zeroRatedRestricted: [] };

  /** A slug already used for a different level of the tree is a conflict, not a merge. */
  const conflictFor = (candidate: PlannedCategory): string | null => {
    const existing = categories.get(candidate.slug);
    if (existing && existing.parentSlug !== candidate.parentSlug) {
      return `category slug "${candidate.slug}" is already used for "${existing.name}" at a different level`;
    }
    return null;
  };

  /** Records one use of a category slug. Spelling variants are REPORTED, never merged silently. */
  const recordCategory = (candidate: PlannedCategory, sourceRow: number): void => {
    const existing = categories.get(candidate.slug);
    if (!existing) {
      categories.set(candidate.slug, candidate);
      return;
    }
    if (existing.name !== candidate.name) {
      const entry = variants.get(candidate.slug) ?? {
        slug: candidate.slug,
        chosen: existing.name,
        variants: [],
      };
      if (!entry.variants.some((v) => v.name === candidate.name)) {
        entry.variants.push({ name: candidate.name, sourceRow });
      }
      variants.set(candidate.slug, entry);
    }
  };

  for (const row of rows) {
    if (row.plu === "") {
      reject(row, "BLANK_PLU", "the row has a department but no PLU");
      continue;
    }
    if (row.department === "") {
      reject(row, "BLANK_DEPARTMENT", "the row has a PLU but no department");
      continue;
    }
    if (row.name === "") {
      reject(row, "BLANK_NAME", "the row has no product name");
      continue;
    }
    const price = parsePricePence(row.priceRaw);
    if (!price.ok) {
      reject(row, price.code, price.reason);
      continue;
    }

    const slug = productSlug(row.name, row.plu, row.department);
    const departmentSlug = slugify(row.department);
    const hasSub =
      row.subDepartment !== "" &&
      normaliseDepartment(row.subDepartment) !== normaliseDepartment(row.department);
    const subSlug = hasSub ? slugify(row.subDepartment) : "";
    if (
      slugify(row.name) === "" ||
      slugify(row.plu) === "" ||
      departmentSlug === "" ||
      (hasSub && subSlug === "")
    ) {
      reject(
        row,
        "BAD_SLUG",
        "the name, PLU, department or sub-department has no letters or digits",
      );
      continue;
    }

    const first = productSlugs.get(slug);
    if (first !== undefined) {
      reject(row, "DUPLICATE_ROW", `same name, PLU and department as source row ${first}`);
      continue;
    }

    const departmentCategory: PlannedCategory = {
      slug: departmentSlug,
      name: row.department,
      parentSlug: null,
      isActive: false,
    };
    const subCategory: PlannedCategory | null = hasSub
      ? {
          slug: `${departmentSlug}-${subSlug}`,
          name: row.subDepartment,
          parentSlug: departmentSlug,
          isActive: false,
        }
      : null;
    // Both checks BEFORE either record, so a rejected row never leaves a category behind.
    const conflict =
      conflictFor(departmentCategory) ?? (subCategory ? conflictFor(subCategory) : null);
    if (conflict !== null) {
      reject(row, "CATEGORY_CONFLICT", conflict);
      continue;
    }
    recordCategory(departmentCategory, row.sourceRow);
    if (subCategory) recordCategory(subCategory, row.sourceRow);
    const categorySlug = subCategory ? subCategory.slug : departmentSlug;
    if (!subCategory && row.subDepartment !== "") {
      const key = `${normaliseDepartment(row.department)}\u0000${normaliseDepartment(row.subDepartment)}`;
      const entry = flattened.get(key) ?? {
        department: row.department,
        subDepartment: row.subDepartment,
        rows: 0,
      };
      entry.rows += 1;
      flattened.set(key, entry);
    }

    const restriction = classifyImportRow(
      { department: row.department, pricePence: price.pence },
      policy,
    );
    const state = newImportedProductState(restriction);
    productSlugs.set(slug, row.sourceRow);
    if (state.restriction !== null) restrictionCounts[state.restriction] += 1;

    const rate = normaliseVat(row.vatRaw);
    vat.byRate[rate] = (vat.byRate[rate] ?? 0) + 1;
    if (rate === "0" && state.restriction !== null) {
      vat.zeroRatedRestricted.push({
        sourceRow: row.sourceRow,
        department: row.department,
        restriction: state.restriction,
      });
    }

    products.push({
      sourceRow: row.sourceRow,
      slug,
      name: row.name,
      description: row.description,
      basePrice: price.pence,
      unitLabel: unitLabelFor(row.name, profile.unit),
      categorySlug,
      departmentSlug,
      isActive: state.isActive,
      restriction: state.restriction,
      stockMode: state.stockMode,
      plu: row.plu,
      sourceDepartment: row.department,
    });
  }

  return {
    categories: [...categories.values()],
    products,
    rejected,
    unreviewedDepartments,
    flattenedSubDepartments: [...flattened.values()],
    categoryNameVariants: [...variants.values()],
    restrictionCounts,
    vat,
  };
}

export interface DepartmentListing {
  /** The department exactly as it appears in the source (first occurrence). */
  department: string;
  rows: number;
  /** How the profile treats it: a restriction class, or UNCERTAIN / UNRESTRICTED / UNREVIEWED. */
  treatment: ProductRestriction | "UNCERTAIN" | "UNRESTRICTED" | "UNREVIEWED";
}

/** `--list-departments`: every distinct department with its row count and how the profile treats it. */
export function listDepartments(
  rows: readonly SourceRow[],
  profile: ImportProfile,
): DepartmentListing[] {
  const byNormal = new Map<string, DepartmentListing>();
  const mapped = new Map(
    Object.entries(profile.policy.byDepartment).map(([k, v]) => [normaliseDepartment(k), v]),
  );
  const uncertain = new Set(profile.policy.uncertainDepartments.map(normaliseDepartment));
  const unrestricted = new Set(profile.policy.unrestrictedDepartments.map(normaliseDepartment));
  for (const row of rows) {
    const normal = normaliseDepartment(row.department);
    if (normal === "") continue;
    const entry = byNormal.get(normal);
    if (entry) {
      entry.rows += 1;
      continue;
    }
    byNormal.set(normal, {
      department: row.department,
      rows: 1,
      treatment:
        mapped.get(normal) ??
        (uncertain.has(normal)
          ? "UNCERTAIN"
          : unrestricted.has(normal)
            ? "UNRESTRICTED"
            : "UNREVIEWED"),
    });
  }
  return [...byNormal.values()].sort((a, b) => b.rows - a.rows);
}
