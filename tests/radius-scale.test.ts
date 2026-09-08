import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { GENERATED_ARTIFACTS } from "../kms/scripts/build-index";

/**
 * #653 — Tailwind v4's `@theme` MERGES with its default border-radius scale
 * rather than replacing it. `design-system/tokens/tokens.css` used to override
 * only `--radius-sm` and `--radius-md`, which produced two silent aliases:
 * `rounded-sm`/`rounded-lg` both resolved to 0.5rem, and `rounded-md`/
 * `rounded-2xl` both resolved to 1rem — while `rounded-xl` (94 uses) and
 * `rounded-2xl` (141 uses) named no token at all.
 *
 * Fixed by RETIRING the redundant utility (rewriting every `rounded-sm`/
 * `rounded-md` call site to the identical-rendering `rounded-lg`/
 * `rounded-2xl`), never by changing a token's value — changing a value would
 * restyle real screens. This test is what keeps the collision from coming
 * back: it fails if any two DISTINCT `rounded-*` utilities still in use
 * resolve to the same computed value, however that collision is introduced —
 * a reintroduced `rounded-sm`/`rounded-md`, a new token added to
 * `tokens.css` that happens to collide with an existing one, or a new radius
 * step adopted with no token at all (falling through to a Tailwind default
 * that happens to match another step already in use).
 *
 * Directories are walked from the filesystem rather than listed, and the
 * `rounded-*` utilities checked are discovered from what the codebase
 * actually uses rather than hardcoded — same reasoning as
 * `tests/token-alpha-purity.test.ts` and `tests/motion-reduce-coverage.test.ts`.
 */

const ROOTS = ["app", "components", "features"];

/**
 * Tailwind's own default radius scale (node_modules/tailwindcss/theme.css),
 * for any step this app does NOT override in tokens.css.
 *
 * Bare `rounded` (no suffix) resolves through the theme key `--radius`, NOT
 * through a `--radius-<step>` entry in this map — the whole rounded family is
 * registered with `themeKeys: ["--radius"]` in `node_modules/tailwindcss/
 * dist/lib.js`, and Tailwind's own default theme sets `--radius: 0.25rem`
 * (theme.css:508). So it IS overridable, and `tokens.css` declares it
 * explicitly for exactly that reason. It is resolved separately below because
 * its key has no step suffix, not because it is a literal.
 */
const TAILWIND_DEFAULTS: Record<string, string> = {
  xs: "0.125rem",
  sm: "0.25rem",
  md: "0.375rem",
  lg: "0.5rem",
  xl: "0.75rem",
  "2xl": "1rem",
  "3xl": "1.5rem",
  "4xl": "2rem",
};

/** Tailwind's default for the bare `--radius` key — see the comment on TAILWIND_DEFAULTS. */
const BARE_ROUNDED_DEFAULT = "0.25rem";

/**
 * `rounded-full` has no fixed-length Tailwind default at all — unoverridden
 * it compiles to `calc(infinity * 1px)`. Treated as its own resolved value
 * (never equal to any finite length) rather than folded into
 * TAILWIND_DEFAULTS, so a token override changes what it resolves to but its
 * un-overridden fallback can never collide with a real length step.
 */
const ROUNDED_FULL_FALLBACK = "calc(infinity * 1px)";

const GENERATED = new Set<string>(GENERATED_ARTIFACTS.map((p) => p.replace(/\\/g, "/")));

function walk(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) found.push(...walk(full));
    else if (entry.endsWith(".tsx")) found.push(full);
  }
  return found;
}

function scannedFiles(): string[] {
  return ROOTS.flatMap(walk)
    .map((p) => p.replace(/\\/g, "/"))
    .filter((p) => !GENERATED.has(p));
}

/**
 * Matches a `rounded` utility's STEP (the suffix identifying which radius),
 * ignoring the directional/corner infix (`-t-`, `-l-`, `-tl-`, ...) and any
 * variant prefix (`hover:`, `sm:`, ...) — those select WHICH corners or WHEN,
 * never a different value, so `rounded-l-xl` and `rounded-xl` must resolve
 * identically and are treated as the same step.
 */
const ROUNDED_UTILITY =
  /\brounded(?:-(?:t|r|b|l|tl|tr|br|bl|s|e|ss|se|ee|es))?(?:-(xs|sm|md|lg|xl|2xl|3xl|4xl|full))?\b/g;

/**
 * Extracts the distinct radius STEPS in use across the scanned files
 * (`"DEFAULT"` = bare `rounded`), each mapped to one example `file:line` —
 * the first place it was found — so a collision failure can name a real
 * offending site rather than only the abstract step name.
 */
function stepsInUse(files: string[]): Map<string, string> {
  const steps = new Map<string, string>();
  for (const file of files) {
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      ROUNDED_UTILITY.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = ROUNDED_UTILITY.exec(line))) {
        const step = m[1] ?? "DEFAULT";
        if (!steps.has(step)) steps.set(step, `${file}:${i + 1}`);
      }
    });
  }
  return steps;
}

/**
 * Parses `design-system/tokens/tokens.css`'s radius declarations into
 * { step: value }. Bare `--radius` is stored under the key `"DEFAULT"`, which
 * is the same key `stepsInUse()` records for an unsuffixed `rounded` class, so
 * both halves of the resolution agree on one name for it.
 */
function declaredTokens(): Record<string, string> {
  const raw = readFileSync("design-system/tokens/tokens.css", "utf8");
  // Strip /* ... */ comments FIRST. Without this, a comment explaining a token in prose (e.g.
  // "Tailwind's own default theme sets `--radius: 0.25rem`") is itself valid input to the regex
  // below: it matches "--radius:" inside the comment, then greedily captures everything up to the
  // next ";" — which is the REAL declaration's own terminator — corrupting that token's parsed
  // value into the comment's trailing prose instead of "0.25rem". Confirmed live at `/validate`
  // (#662, 2026-09-08): this silently defeated the DEFAULT-token collision check specifically,
  // because that is the one step whose own justifying comment happens to quote its value verbatim.
  const css = raw.replace(/\/\*[\s\S]*?\*\//g, "");
  const tokens: Record<string, string> = {};
  const re = /--radius(?:-(xs|sm|md|lg|xl|2xl|3xl|4xl|full))?:\s*([^;]+);/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css))) {
    tokens[m[1] ?? "DEFAULT"] = m[2].trim();
  }
  return tokens;
}

/** Resolves a radius step to its computed value: tokens.css first, Tailwind's default otherwise. */
function resolveStep(step: string, tokens: Record<string, string>): string {
  if (step === "DEFAULT") return tokens.DEFAULT ?? BARE_ROUNDED_DEFAULT;
  if (step === "full") return tokens.full ?? ROUNDED_FULL_FALLBACK;
  return tokens[step] ?? TAILWIND_DEFAULTS[step];
}

describe("radius scale (#653)", () => {
  const files = scannedFiles();
  const tokens = declaredTokens();
  const steps = stepsInUse(files);

  it("scans a plausible number of files, so the suite cannot pass vacuously", () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it("finds more than one distinct radius step in use, so the collision check is meaningful", () => {
    expect(steps.size).toBeGreaterThan(1);
  });

  it("has no two distinct rounded-* utilities resolving to the same computed value", () => {
    const resolved = new Map<string, string>();
    for (const step of steps.keys()) {
      resolved.set(step, resolveStep(step, tokens));
    }

    const byValue = new Map<string, string[]>();
    for (const [step, value] of resolved) {
      const existing = byValue.get(value) ?? [];
      existing.push(step);
      byValue.set(value, existing);
    }

    const collisions: string[] = [];
    for (const [value, stepsForValue] of byValue) {
      if (stepsForValue.length > 1) {
        const named = stepsForValue.map((s) => {
          const name = s === "DEFAULT" ? "rounded" : `rounded-${s}`;
          return `${name} (e.g. ${steps.get(s)})`;
        });
        collisions.push(`${named.join(" and ")} both resolve to ${value}`);
      }
    }

    expect(
      collisions,
      "Two distinct rounded-* utilities compute to the same radius — retire the " +
        "redundant one (rewrite its call sites to the utility it collides with) " +
        "rather than changing a --radius-* token's value, which would restyle " +
        "every existing use of that step.",
    ).toEqual([]);
  });
});
