import { parse, type Node } from "acorn";

/**
 * Finds JavaScript syntax that Safari / iOS 15.4 cannot parse (#1445).
 *
 * WHY THIS EXISTS
 *
 * Next.js 16 compiles client code for Safari 16.4+ unless `package.json` sets `browserslist`. It
 * did not, and the App Router chunk shipped a class static block (`static{…}`, Safari 16.4). On an
 * iPhone 6s (iOS 15) that is a SyntaxError, which discards the whole chunk, so React never
 * hydrates. The page looks fine and nothing on it can be clicked. `next build` stayed green.
 *
 * Only syntax is checked: a parse failure kills a chunk outright, and a parser can see it. A
 * runtime API (`structuredClone`) cannot be told apart from a guarded use by parsing, which is why
 * the floor is 15.4 rather than 15.0 (see specs/2026-11-06-ios15-safari-compat/plan.md).
 *
 * The file is PARSED, not grepped, because `(?<=` legitimately occurs inside string literals.
 */

export interface SyntaxFinding {
  line: number;
  column: number;
  construct: string;
}

interface RegexLiteral extends Node {
  regex?: { pattern: string; flags: string };
}

function parseSource(source: string): Node {
  const options = { ecmaVersion: "latest", locations: true } as const;
  try {
    return parse(source, { ...options, sourceType: "script" });
  } catch {
    // An ES module chunk (top-level import/export) is not a valid script.
    return parse(source, { ...options, sourceType: "module" });
  }
}

function inspect(node: Node): string | null {
  if (node.type === "StaticBlock") return "class static block (Safari 16.4)";
  if (node.type === "Literal") {
    const regex = (node as RegexLiteral).regex;
    if (!regex) return null;
    if (regex.pattern.includes("(?<=") || regex.pattern.includes("(?<!")) {
      return "regex lookbehind (Safari 16.4)";
    }
    if (regex.flags.includes("v")) return "regex v flag (Safari 17)";
  }
  return null;
}

/** Throws when `source` does not parse at all; the caller treats that as a failure too. */
export function findUnsupportedSyntax(source: string): SyntaxFinding[] {
  const findings: SyntaxFinding[] = [];
  // Iterative walk over every child object: no visitor table to keep in step with acorn's node types.
  const stack: unknown[] = [parseSource(source)];
  while (stack.length > 0) {
    const value = stack.pop();
    if (Array.isArray(value)) {
      for (const item of value) stack.push(item);
      continue;
    }
    if (value === null || typeof value !== "object") continue;
    const node = value as Node & Record<string, unknown>;
    if (typeof node.type === "string") {
      const construct = inspect(node);
      if (construct && node.loc) {
        findings.push({
          line: node.loc.start.line,
          column: node.loc.start.column + 1,
          construct,
        });
      }
    }
    for (const [key, child] of Object.entries(node)) {
      if (key !== "loc" && typeof child === "object") stack.push(child);
    }
  }
  return findings.sort((a, b) => a.line - b.line || a.column - b.column);
}
