import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * Proves #350 — every role-gated page under app/(admin)/ refuses with
 * <PanelRefusal>, not with a bare `return null` and not with hand-rolled markup.
 *
 * WHY THIS TEST EXISTS
 *
 * app/(admin)/layout.tsx renders the portal shell — header, tier badge, "View
 * store" link — around whatever a page returns. A page that returns `null` on
 * refusal still serves 200 with that shell and an empty content area: no
 * message, and easy to mistake for a loading state rather than a real refusal.
 *
 * That defect has now been found and fixed FOUR times: runbook/page.tsx (#231,
 * a live instance caught only because that slice fired the signed-in-non-staff
 * case its own validation.md had flagged as never exercised), loyalty/page.tsx
 * (#136), storefront/page.tsx (#350), and discounts/page.tsx (found while
 * scoping #350 itself, 2026-09-08).
 *
 * Until now the rule was enforced by a hand-maintained list in CLAUDE.md's prose.
 * By the time anyone checked it against the filesystem, that list was wrong about
 * two pages in two different directions simultaneously: it never mentioned
 * `storefront` or `discounts` at all, while components/staff/PanelRefusal.tsx's
 * own docstring still claimed `loyalty` kept a private copy three phases after
 * #136 converted it. #350's write-up names the general principle this repo has
 * now recorded three times — a rule that names its own enforcement must be
 * checked against that enforcement, or it documents a guarantee nobody provides.
 *
 * WHY AST AND NOT A GREP
 *
 * Several of these pages carry a comment reading, near-verbatim, "The refusal
 * branch renders <PanelRefusal>, never `return null`" — written by the slices
 * that fixed the earlier instances. A substring check for the opening tag is
 * satisfied by that comment alone, so a page whose comment is right and whose
 * code is wrong would pass. Matching JSX element names on the parsed tree is
 * immune to that by construction. This is the same comment-unaware-parser defect
 * the previous slice hit and fixed in 82dbb1d (tests/radius-scale.test.ts, #662).
 *
 * SCOPE — WHOLE DIRECTORY, NO ALLOWLIST
 *
 * Pages are discovered by walking app/(admin)/ on the filesystem, the same shape
 * as tests/staff-nav-parity.test.ts and tests/operator-doc-coverage.test.ts, so a
 * newly added page is covered the moment it exists. There is no exclusion list,
 * deliberately, matching tests/repository-purity.test.ts (#252) — which is the
 * precedent #350 itself named. A page that genuinely should not refuse this way
 * does not exist: the shell is rendered one segment up for all of them.
 *
 * The check is CONDITIONAL on the page gating at all — a page that never calls
 * requireVendorRole() has no refusal branch to get wrong, so it is not required
 * to import a refusal component it would never render. All 25 pages present today
 * are gated; the condition exists so a future ungated page under this segment
 * fails nothing rather than forcing a meaningless import.
 */

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const ADMIN_DIR = join(REPO_ROOT, "app", "(admin)");

const REFUSAL_COMPONENT = "PanelRefusal";
const ROLE_GATE = "requireVendorRole";

/** Every `page.tsx` under app/(admin)/, at any depth. */
function findPageFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...findPageFiles(full));
    else if (entry.name === "page.tsx") found.push(full);
  }
  return found;
}

function parse(file: string): ts.SourceFile {
  // ScriptKind.TSX is required: without it the parser reads `<PanelRefusal ... />`
  // as a type assertion and finds no JSX elements at all, which would make this
  // test pass vacuously on every file.
  return ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
}

function tagNameOf(node: ts.JsxOpeningElement | ts.JsxSelfClosingElement): string {
  return node.tagName.getText(node.getSourceFile());
}

interface PageFacts {
  /** Repo-relative path, for failure messages. */
  path: string;
  /** Does this page gate on a vendor role at all? */
  isGated: boolean;
  /** Does it render a <PanelRefusal> JSX element? */
  rendersRefusal: boolean;
  /** Lines where it returns `null` from a branch conditioned on the auth result. */
  authConditionedNullReturns: number[];
}

function readPage(file: string): PageFacts {
  const sourceFile = parse(file);
  const facts: PageFacts = {
    path: relative(REPO_ROOT, file).split("\\").join("/"),
    isGated: false,
    rendersRefusal: false,
    authConditionedNullReturns: [],
  };

  const lineOf = (node: ts.Node) =>
    sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;

  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === ROLE_GATE
    ) {
      facts.isGated = true;
    }

    if (
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      tagNameOf(node) === REFUSAL_COMPONENT
    ) {
      facts.rendersRefusal = true;
    }

    // `if (!auth.ok) return null` in any of its shapes — the defect itself.
    // Scoped to auth-conditioned branches rather than every `return null`,
    // because a page returning null for an unrelated reason is not this bug.
    if (ts.isIfStatement(node)) {
      const condition = node.expression.getText(sourceFile);
      if (/\bauth\s*\.\s*(ok|status|via)\b/.test(condition)) {
        const scan = (branch: ts.Node) => {
          if (
            ts.isReturnStatement(branch) &&
            branch.expression &&
            branch.expression.kind === ts.SyntaxKind.NullKeyword
          ) {
            facts.authConditionedNullReturns.push(lineOf(branch));
          }
          ts.forEachChild(branch, scan);
        };
        scan(node.thenStatement);
        if (node.elseStatement) scan(node.elseStatement);
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return facts;
}

describe("app/(admin) refusal branches (#350)", () => {
  const pages = findPageFiles(ADMIN_DIR).map(readPage);
  const gated = pages.filter((p) => p.isGated);

  it("finds admin pages to check", () => {
    // A walk that silently matches nothing is a test that always passes.
    expect(pages.length).toBeGreaterThan(0);
    expect(gated.length).toBeGreaterThan(0);
  });

  it("every role-gated page renders <PanelRefusal>", () => {
    const offenders = gated.filter((p) => !p.rendersRefusal).map((p) => p.path);

    const detail = offenders
      .map(
        (path) =>
          `  ${path} calls ${ROLE_GATE}() but renders no <${REFUSAL_COMPONENT}>\n` +
          `    → app/(admin)/layout.tsx wraps whatever this page returns in the portal ` +
          `shell, so a bare \`return null\` serves 200 with an empty panel and ` +
          `hand-rolled markup drifts from every other page. Import ` +
          `{ ${REFUSAL_COMPONENT} } from "@/components/staff/${REFUSAL_COMPONENT}" and ` +
          `render it in the !auth.ok branch — copy an existing page, e.g. ` +
          `app/(admin)/staff/products/page.tsx. Do not add this file to an ` +
          `exclusion list; there isn't one, deliberately.`,
      )
      .join("\n");

    expect(offenders, offenders.length === 0 ? "" : `\n${detail}\n`).toEqual([]);
  });

  it("no page returns null from a branch conditioned on the auth result", () => {
    const offenders = gated
      .filter((p) => p.authConditionedNullReturns.length > 0)
      .map((p) => `${p.path}:${p.authConditionedNullReturns.join(",")}`);

    const detail = offenders
      .map(
        (where) =>
          `  ${where} returns null from an auth-conditioned branch\n` +
          `    → this is the exact defect #350, #231 and #136 each fixed once. The ` +
          `viewer sees the portal shell with a blank body and no explanation. ` +
          `Return <${REFUSAL_COMPONENT}> instead.`,
      )
      .join("\n");

    expect(offenders, offenders.length === 0 ? "" : `\n${detail}\n`).toEqual([]);
  });
});
