import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * Proves R13 (#251 / #220) — the compensating control standing in for row-level
 * security.
 *
 * ADR-004 decision 2 deferred RLS to P7 so a missed `vendorId` filter would fail
 * closed at Postgres instead of silently returning another tenant's rows.
 * `specs/2026-08-19-p7-closeout/rls-experiment.md` establishes that per-request
 * RLS is not reachable on this stack: the read path is `PrismaNeonHttp`, which
 * has no session for a `SET LOCAL` GUC, and the adapter refuses transactions in
 * HTTP mode outright. Adopting RLS would mean routing every read through
 * WebSockets — the configuration that caused #187.
 *
 * So the tenant boundary stays in `lib/repositories/*`, and this is what stops
 * it from being purely a convention.
 *
 * WHAT IT CHECKS, AND WHY THIS SHAPE
 *
 *   1. Every exported function that queries a vendor-scoped model takes a
 *      vendor id parameter.
 *   2. A function that takes one actually uses it in at least one query, rather
 *      than accepting it and ignoring it.
 *
 * An earlier draft asserted the stronger thing — that every individual Prisma
 * call carries `vendorId` in its `where`. That was abandoned deliberately: it
 * flagged 38 of 155 call sites, and the large majority were correct code keyed
 * by an id already fetched under a vendor scope (`cartItem.deleteMany({ where:
 * { cartId: cart.id } })`), or a `where` held in a variable. Turning that into a
 * gate would have required ~38 hand-written justifications, which is exactly the
 * kind of list that gets rubber-stamped rather than read — a control that
 * launders review rather than performing it. The invariant asserted here is one
 * a static check can actually establish soundly.
 *
 * WHAT IT DOES NOT CATCH. A function that takes `vendorId`, uses it on one query
 * and omits it on a second is not detected. This is defence in depth beneath the
 * `no-restricted-imports` rule keeping `app/`, `features/` and `components/` out
 * of Prisma — not a substitute for it, and weaker than a database-enforced
 * boundary would have been. That gap is the real cost of RLS being unavailable,
 * and it is recorded in ADR-004 rather than papered over.
 */

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const REPOSITORIES_DIR = join(REPO_ROOT, "lib", "repositories");
const SCHEMA_PATH = join(REPO_ROOT, "prisma", "schema.prisma");

/** Prisma operations whose argument decides which rows are read or written. */
const SCOPED_OPERATIONS = new Set([
  "findMany",
  "findFirst",
  "findFirstOrThrow",
  "findUnique",
  "findUniqueOrThrow",
  "update",
  "updateMany",
  "delete",
  "deleteMany",
  "upsert",
  "count",
  "aggregate",
  "groupBy",
  "create",
  "createMany",
]);

/**
 * Exported functions that query a vendor-scoped model without taking a vendor id,
 * each with the reason. Every entry is a deliberate exception recorded elsewhere;
 * none is "we'll get to it".
 */
const ALLOWED = new Map<string, string>([
  // The eight request-scoped facades that used to sit here — getCartRepository,
  // getCategoryRepository, getLoyaltyRepository, getOrderRepository,
  // getProductRepository, getReviewRepository, getVendorTeam and setVendorRole —
  // were relocated to sibling lib/<name>-service.ts modules in P8.1b, closing
  // #252. They are gone rather than re-justified, and tests/repository-purity.test.ts
  // now makes their return structurally impossible. What remains below are the
  // genuine, individually-argued exceptions.
  [
    "data-rights.ts:countOtherVendorData",
    "ADR-004's single recorded cross-tenant exception. UK GDPR erasure must answer 'is this the user's last vendor?' before deleting the shared User row, which is unanswerable from inside one vendor. Takes excludingVendorId and returns an integer only — never rows, never field values.",
  ],
  [
    "data-rights.ts:hasVendorMembership",
    "Deliberately cross-vendor: asks whether the user holds a staff/admin role at ANY vendor, to refuse self-erasure of a privileged account. A vendor-scoped answer would be the wrong question.",
  ],
  [
    "orders.ts:findOrderForWebhook",
    "Un-scoped by necessity — a payment-provider webhook arrives with an order number and no host, so there is no vendor to scope by. ADR-004 names this as the codebase's other un-scoped read and records that it became an unauthenticated cross-vendor disclosure when P7a wired it to a public page (PR #204). Callers must not expose it to unauthenticated input.",
  ],
  [
    "orders.ts:confirmPayment",
    "Same webhook path as findOrderForWebhook — keyed by order number arriving from the payment provider, with no vendor in the request.",
  ],
]);

/** A parameter that carries a tenant id, whatever it is called. */
const VENDOR_PARAM = /vendorid/i;

function vendorScopedModels(): Set<string> {
  const schema = readFileSync(SCHEMA_PATH, "utf8");
  const models = new Set<string>();
  for (const [, name, body] of schema.matchAll(/model\s+(\w+)\s*\{([\s\S]*?)\n\}/g)) {
    if (/^\s*vendorId\s/m.test(body)) {
      models.add(name[0].toLowerCase() + name.slice(1));
    }
  }
  return models;
}

interface ExportedFn {
  key: string;
  name: string;
  file: string;
  params: string;
  queriesScopedModel: boolean;
  usesVendorIdInAQuery: boolean;
}

function isExported(node: ts.Node): boolean {
  const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  if (modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) return true;
  // `export const foo = ...` puts the modifier on the statement, not the initializer.
  const statement = node.parent?.parent;
  if (statement && ts.isVariableStatement(statement)) {
    return !!ts.getModifiers(statement)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
  }
  return false;
}

function analyseFile(file: string, scoped: Set<string>): ExportedFn[] {
  const source = readFileSync(join(REPOSITORIES_DIR, file), "utf8");
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const found: ExportedFn[] = [];

  const inspect = (name: string, fn: ts.SignatureDeclaration, node: ts.Node) => {
    let queriesScopedModel = false;

    const walk = (n: ts.Node) => {
      if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)) {
        const operation = n.expression.name.text;
        const target = n.expression.expression;
        if (
          SCOPED_OPERATIONS.has(operation) &&
          ts.isPropertyAccessExpression(target) &&
          scoped.has(target.name.text)
        ) {
          queriesScopedModel = true;
        }
      }
      ts.forEachChild(n, walk);
    };
    walk(node);

    // Look at the whole body, not just the Prisma call's arguments: correctly
    // scoped code often builds the filter above the call
    // (`const whereClause: Prisma.ProductWhereInput = { vendorId }` in
    // listInventoryForStaff), and reading only the call text reports that as a
    // violation. TypeScript would not catch a wholly-unused parameter either —
    // `noUnusedParameters` is not enabled in tsconfig.json — so this assertion
    // is the only thing standing between a decorative vendorId and a leak.
    const body = (fn as ts.FunctionLikeDeclaration).body;
    const usesVendorIdInAQuery = body ? /\bvendorId\b/.test(body.getText(sourceFile)) : false;

    found.push({
      key: `${file}:${name}`,
      name,
      file,
      params: fn.parameters.map((p) => p.name.getText(sourceFile)).join(", "),
      queriesScopedModel,
      usesVendorIdInAQuery,
    });
  };

  const visit = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node) && node.name && isExported(node)) {
      inspect(node.name.text, node, node);
    } else if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer)) &&
      isExported(node)
    ) {
      inspect(node.name.text, node.initializer, node.initializer);
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return found;
}

describe("repository layer enforces vendorId scoping (R13 — RLS compensating control)", () => {
  const scoped = vendorScopedModels();
  const files = readdirSync(REPOSITORIES_DIR).filter((f) => f.endsWith(".ts"));
  const functions = files.flatMap((f) => analyseFile(f, scoped));
  const querying = functions.filter((f) => f.queriesScopedModel);

  it("parsed the vendor-scoped models out of the Prisma schema", () => {
    // Without this, a schema-parsing regression would empty the model set and
    // every assertion below would pass having checked nothing.
    expect(scoped.size).toBeGreaterThanOrEqual(20);
    expect(scoped.has("order")).toBe(true);
    expect(scoped.has("address")).toBe(true);
    expect(scoped.has("cartItem")).toBe(true);
    expect(scoped.has("user")).toBe(false); // the shared identity is not tenant-scoped
  });

  it("found a meaningful number of exported functions querying scoped models", () => {
    // Same guard, one level up: if the AST walk stopped matching Prisma's call
    // shape, `querying` would be empty and the suite would look green.
    expect(querying.length).toBeGreaterThan(30);
  });

  it("every exported repository function querying a scoped model takes a vendor id", () => {
    const offenders = querying
      .filter((f) => !VENDOR_PARAM.test(f.params))
      .filter((f) => !ALLOWED.has(f.key));

    const report = offenders.map((f) => `  ${f.file}  ${f.name}(${f.params})`).join("\n");
    expect(
      offenders.map((f) => f.key),
      offenders.length
        ? `Exported functions querying a vendor-scoped model without a vendor id parameter:\n${report}\n\n` +
            "Take vendorId explicitly, or — if this is a deliberate cross-tenant exception — add it to " +
            "ALLOWED in this file with the reason, and record it in ADR-004."
        : "",
    ).toEqual([]);
  });

  it("a function given a vendor id actually uses it to constrain a query", () => {
    const ignoring = querying
      .filter((f) => VENDOR_PARAM.test(f.params) && !f.usesVendorIdInAQuery)
      .filter((f) => !ALLOWED.has(f.key));

    const report = ignoring.map((f) => `  ${f.file}  ${f.name}(${f.params})`).join("\n");
    expect(
      ignoring.map((f) => f.key),
      ignoring.length
        ? `These take a vendor id and never use it in a query — the parameter is decorative:\n${report}`
        : "",
    ).toEqual([]);
  });

  it("keeps every allowlist entry justified and live", () => {
    // An allowlist entry that no longer matches a real function is stale, and a
    // stale exception is how a real one gets hidden later.
    for (const [key, why] of ALLOWED) {
      expect(why.length, `${key} needs a real reason, not a placeholder`).toBeGreaterThan(40);
      expect(
        functions.some((f) => f.key === key),
        `ALLOWED lists ${key}, but no such exported function exists any more — remove the entry`,
      ).toBe(true);
    }
  });
});
