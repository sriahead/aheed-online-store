import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * #1319 — every staff page, admin API route and staff server action checks a role ON THE SERVER.
 *
 * WHY THIS TEST EXISTS
 *
 * Hiding a nav link is courtesy; the gate is the security. `tests/panel-refusal-coverage.test.ts`
 * already proves a gated PAGE refuses with `PanelRefusal`, but nothing failed CI when a new server
 * action or `app/api/admin` route forgot its gate altogether — a request built by hand would simply
 * be served. This test pins every such entry point to a gate, and every platform-only one to the
 * platform-admin refusal.
 *
 * WHY AST AND NOT A GREP
 *
 * Several files carry comments naming their gate ("gated by requireVendorRole"). A substring check
 * is satisfied by the comment alone. Walking call expressions on the parsed tree is immune to that,
 * the same reasoning as `tests/panel-refusal-coverage.test.ts` (#350).
 *
 * NO EXEMPTION LIST
 *
 * Files are discovered from the filesystem, so a new page, route or action is covered the moment it
 * exists. An entry point that genuinely needs no gate does not belong under these directories.
 *
 * ONE HOP OF DELEGATION
 *
 * A function counts as gated when its body calls a gate, or calls a function that does: one declared
 * in the same file, or one named-imported from another module whose own body calls a gate. That covers
 * `app/(admin)/staff/team/actions.ts`, whose action delegates to `lib/roles-service.ts`'s
 * `setVendorRole`, where the gate lives. It is one hop on purpose: deeper chains would let an
 * unrelated import that happens to gate something else satisfy the check.
 */

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const GATES = new Set(["requireVendorRole", "requirePlatformAdmin", "requireRole"]);
const HTTP_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);
const STAFF_ORDER_ACTIONS = [
  "features/orders/advance-status.ts",
  "features/orders/advance-status-bulk.ts",
  "features/orders/cancel-order-staff.ts",
];
const PLATFORM_ONLY_PREFIXES = ["app/(admin)/staff/platform/", "app/(admin)/staff/errors/"];

const rel = (abs: string) => relative(REPO_ROOT, abs).replace(/\\/g, "/");

function walk(dir: string, match: (name: string) => boolean): string[] {
  if (!existsSync(dir)) return [];
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...walk(full, match));
    else if (match(entry.name)) found.push(full);
  }
  return found;
}

const parsed = new Map<string, ts.SourceFile>();
function parse(file: string): ts.SourceFile {
  let sf = parsed.get(file);
  if (!sf) {
    // ScriptKind.TSX for .tsx: otherwise JSX parses as type assertions and the walk sees nonsense.
    sf = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    parsed.set(file, sf);
  }
  return sf;
}

function some(node: ts.Node, test: (n: ts.Node) => boolean): boolean {
  if (test(node)) return true;
  return ts.forEachChild(node, (child) => (some(child, test) ? true : undefined)) ?? false;
}

function calleeName(node: ts.Node): string | null {
  return ts.isCallExpression(node) && ts.isIdentifier(node.expression)
    ? node.expression.text
    : null;
}

const callsGate = (node: ts.Node) => some(node, (n) => GATES.has(calleeName(n) ?? ""));

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  return ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some((m) => m.kind === kind);
}

type FnLike = ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression;

/** Function declarations and `const x = () => …` / `function` initialisers, by name. */
function functionsIn(sf: ts.SourceFile): Map<string, { fn: FnLike; exported: boolean }> {
  const fns = new Map<string, { fn: FnLike; exported: boolean }>();
  for (const stmt of sf.statements) {
    if (ts.isFunctionDeclaration(stmt) && stmt.body) {
      const exported = hasModifier(stmt, ts.SyntaxKind.ExportKeyword);
      const name = hasModifier(stmt, ts.SyntaxKind.DefaultKeyword)
        ? "default"
        : (stmt.name?.text ?? "");
      if (name) fns.set(name, { fn: stmt, exported });
    } else if (ts.isVariableStatement(stmt)) {
      const exported = hasModifier(stmt, ts.SyntaxKind.ExportKeyword);
      for (const decl of stmt.declarationList.declarations) {
        const init = decl.initializer;
        if (
          ts.isIdentifier(decl.name) &&
          init &&
          (ts.isArrowFunction(init) || ts.isFunctionExpression(init))
        ) {
          fns.set(decl.name.text, { fn: init, exported });
        }
      }
    }
  }
  return fns;
}

/**
 * Named imports → the resolved source file and the name the function has THERE (`import { a as b }`
 * maps `b` to `a`), for `@/…` and relative specifiers only.
 */
function importsIn(file: string, sf: ts.SourceFile): Map<string, { source: string; name: string }> {
  const imports = new Map<string, { source: string; name: string }>();
  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt) || !ts.isStringLiteral(stmt.moduleSpecifier)) continue;
    const spec = stmt.moduleSpecifier.text;
    let base: string | null = null;
    if (spec.startsWith("@/")) base = join(REPO_ROOT, spec.slice(2));
    else if (spec.startsWith(".")) base = join(dirname(file), spec);
    if (!base) continue;
    const resolved = [`${base}.ts`, `${base}.tsx`, join(base, "index.ts")].find(existsSync);
    if (!resolved) continue;
    const named = stmt.importClause?.namedBindings;
    if (named && ts.isNamedImports(named)) {
      for (const el of named.elements) {
        imports.set(el.name.text, {
          source: resolved,
          name: (el.propertyName ?? el.name).text,
        });
      }
    }
  }
  return imports;
}

/**
 * R18: the body calls a gate, or calls a same-file function or a named import whose OWN body calls
 * one. The imported function is looked up by name in its source module — not the module as a whole,
 * which R21's first mutation showed was too loose: `/staff/team` calls `getVendorTeam`, and
 * `lib/roles-service.ts` gates only its sibling `setVendorRole`.
 */
function isGated(file: string, fn: FnLike): boolean {
  if (!fn.body) return false;
  if (callsGate(fn.body)) return true;
  const sf = parse(file);
  const locals = functionsIn(sf);
  const imports = importsIn(file, sf);
  return some(fn.body, (n) => {
    const name = calleeName(n);
    if (!name) return false;
    const local = locals.get(name);
    if (local?.fn.body && callsGate(local.fn.body)) return true;
    const imported = imports.get(name);
    if (!imported) return false;
    const target = functionsIn(parse(imported.source)).get(imported.name);
    return target?.fn.body !== undefined && callsGate(target.fn.body);
  });
}

function isUseServer(sf: ts.SourceFile): boolean {
  const first = sf.statements[0];
  return (
    first !== undefined &&
    ts.isExpressionStatement(first) &&
    ts.isStringLiteral(first.expression) &&
    first.expression.text === "use server"
  );
}

/** R17(d): `requirePlatformAdmin(…)`, or `<x>.via !== "platform-admin"` (either operand order). */
function refusesNonPlatformAdmin(sf: ts.SourceFile): boolean {
  return some(sf, (n) => {
    if (calleeName(n) === "requirePlatformAdmin") return true;
    if (
      !ts.isBinaryExpression(n) ||
      n.operatorToken.kind !== ts.SyntaxKind.ExclamationEqualsEqualsToken
    ) {
      return false;
    }
    const isVia = (e: ts.Expression) => ts.isPropertyAccessExpression(e) && e.name.text === "via";
    const isLiteral = (e: ts.Expression) => ts.isStringLiteral(e) && e.text === "platform-admin";
    return (isVia(n.left) && isLiteral(n.right)) || (isLiteral(n.left) && isVia(n.right));
  });
}

// --- discovery --------------------------------------------------------------------------------

const pages = walk(join(REPO_ROOT, "app/(admin)/staff"), (name) => name === "page.tsx");
const routes = [
  ...walk(join(REPO_ROOT, "app/(admin)"), (name) => name === "route.ts"),
  ...walk(join(REPO_ROOT, "app/api/admin"), (name) => name === "route.ts"),
];
const actionModules = [
  ...walk(join(REPO_ROOT, "app/(admin)"), (name) => /\.tsx?$/.test(name)),
  ...walk(join(REPO_ROOT, "features/admin"), (name) => /\.tsx?$/.test(name)),
]
  .filter((file) => isUseServer(parse(file)))
  .concat(STAFF_ORDER_ACTIONS.map((p) => join(REPO_ROOT, p)));
const platformOnly = [...pages, ...routes, ...actionModules].filter((file) =>
  PLATFORM_ONLY_PREFIXES.some((prefix) => rel(file).startsWith(prefix)),
);

describe("the gate matrix discovers enough to mean something (R19)", () => {
  it("finds the staff pages, admin routes, server actions and platform-only files", () => {
    expect(pages.length).toBeGreaterThanOrEqual(30);
    expect(routes.length).toBeGreaterThanOrEqual(9);
    expect(actionModules.length).toBeGreaterThanOrEqual(25);
    expect(platformOnly.length).toBeGreaterThanOrEqual(8);
    for (const p of STAFF_ORDER_ACTIONS) {
      expect(existsSync(join(REPO_ROOT, p)), `${p} moved — update this test`).toBe(true);
    }
  });
});

describe("every staff page gates its default export (R17a)", () => {
  it.each(pages.map((file) => [rel(file), file]))("%s", (_name, file) => {
    const page = functionsIn(parse(file)).get("default");
    expect(page, "no default-exported function").toBeDefined();
    expect(isGated(file, page!.fn), "default export never calls a role gate").toBe(true);
  });
});

describe("every admin route handler is gated (R17b)", () => {
  it.each(routes.map((file) => [rel(file), file]))("%s", (_name, file) => {
    const handlers = [...functionsIn(parse(file))].filter(
      ([name, { exported }]) => exported && HTTP_METHODS.has(name),
    );
    expect(handlers.length, "no exported HTTP handler").toBeGreaterThan(0);
    const ungated = handlers.filter(([, { fn }]) => !isGated(file, fn)).map(([name]) => name);
    expect(ungated, "handlers with no role gate").toEqual([]);
  });
});

describe("every staff server action is gated (R17c)", () => {
  it.each(actionModules.map((file) => [rel(file), file]))("%s", (_name, file) => {
    const actions = [...functionsIn(parse(file))].filter(([, { exported }]) => exported);
    expect(actions.length, "no exported action").toBeGreaterThan(0);
    const ungated = actions.filter(([, { fn }]) => !isGated(file, fn)).map(([name]) => name);
    expect(ungated, "actions with no role gate").toEqual([]);
  });
});

describe("every platform-only file refuses a store admin (R17d)", () => {
  it.each(platformOnly.map((file) => [rel(file), file]))("%s", (_name, file) => {
    expect(
      refusesNonPlatformAdmin(parse(file)),
      'needs requirePlatformAdmin() or a `.via !== "platform-admin"` refusal',
    ).toBe(true);
  });
});
