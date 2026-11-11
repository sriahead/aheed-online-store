/**
 * Aheed catalogue S1b (#1330) — map one till line to a store department. Pure: no I/O, so every rule
 * is unit-testable; the rules themselves are data (`prisma/manifests/aheed-department-map.json`).
 *
 * Order of precedence, per line:
 *   1. the till department's rule, or for GROCERIES the sub-department's rule;
 *   2. when that rule says `keywords: true`, the first name keyword that matches overrides its target;
 *   3. `keep` leaves the product where it is; `review` sends it to the review list (also kept).
 * A department or sub-department with no rule is `review`, so nothing moves on a guess.
 */

export type RuleTarget = string; // a category slug, or "keep" / "review"
export type Rule = RuleTarget | { target: RuleTarget; keywords?: boolean };

export interface DepartmentRules {
  newCategories: Record<string, { name: string; parent: string | null }>;
  /** `onlyIn` limits a group to lines from those till departments (e.g. fresh produce words). */
  nameKeywords: { words: string[]; target: string; onlyIn?: string[] }[];
  departments: Record<string, Rule>;
  subDepartments: Record<string, Record<string, Rule>>;
}

export interface MapResult {
  target: RuleTarget;
  rule: string;
}

export function normalise(value: string): string {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}

function escape(word: string): string {
  return word.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}

/** The first keyword group whose word appears as a whole word in the name, or null. */
export function matchKeyword(
  name: string,
  groups: DepartmentRules["nameKeywords"],
  department = "",
): { target: string; word: string } | null {
  const upper = normalise(name);
  const dept = normalise(department);
  for (const g of groups) {
    if (g.onlyIn && !g.onlyIn.some((d) => normalise(d) === dept)) continue;
    for (const w of g.words) {
      if (new RegExp(`(^|[^A-Z0-9])${escape(normalise(w))}($|[^A-Z0-9])`).test(upper)) {
        return { target: g.target, word: w };
      }
    }
  }
  return null;
}

export function mapLine(
  department: string,
  subDepartment: string,
  name: string,
  rules: DepartmentRules,
): MapResult {
  const dept = normalise(department);
  const sub = normalise(subDepartment);
  const subRules = rules.subDepartments[dept];
  let rule: Rule | undefined;
  let label: string;
  if (subRules) {
    rule = Object.entries(subRules).find(([k]) => normalise(k) === sub)?.[1];
    label = `sub-department ${dept} / ${sub}`;
  } else {
    rule = Object.entries(rules.departments).find(([k]) => normalise(k) === dept)?.[1];
    label = `department ${dept}`;
  }
  if (rule === undefined) return { target: "review", rule: `no rule for ${label}` };
  const target = typeof rule === "string" ? rule : rule.target;
  const useKeywords = typeof rule !== "string" && rule.keywords === true;
  if (useKeywords) {
    const hit = matchKeyword(name, rules.nameKeywords, dept);
    if (hit) return { target: hit.target, rule: `${label}, name keyword ${hit.word}` };
  }
  return { target, rule: label };
}

/** RFC 4180 field: quoted when it holds a comma, quote or newline. */
export function csvField(value: string | number | null | undefined): string {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
