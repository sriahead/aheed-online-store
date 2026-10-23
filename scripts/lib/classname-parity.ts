import ts from "typescript";

/**
 * The pairing rule behind `scripts/verify-classname-parity.ts` (#1223, R58).
 *
 * A mechanical `lucide-react` to `Icon` migration is decidable from source: every Lucide element at BASE
 * becomes one `<Icon name="...">` at HEAD, in the same order, carrying the same `className` and every other
 * prop verbatim, minus `aria-hidden` (which `Icon` supplies itself). This reads both files with the
 * TypeScript compiler and says where that stops being true. It proves nothing about rendered markup; that
 * is R34 and R35.
 */

export interface IconElement {
  line: number;
  /** Prop name -> printed initialiser (`null` for a bare attribute). */
  props: Map<string, string | null>;
  spread: boolean;
}

export interface ParsedFile {
  importsLucide: boolean;
  elements: IconElement[];
}

const ICON_MODULES = new Set(["@/components/icons/Icon", "@/components/icons"]);
const printer = ts.createPrinter({ removeComments: true });

/** Printed through the compiler so a layout-only reflow (Prettier) is not a difference. */
function printed(node: ts.Node, source: ts.SourceFile): string {
  return printer.printNode(ts.EmitHint.Unspecified, node, source).replace(/\s+/g, " ").trim();
}

export function parseIconElements(
  fileName: string,
  text: string,
  kind: "lucide" | "icon",
): ParsedFile {
  const source = ts.createSourceFile(
    fileName,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const tags = new Set<string>();
  let importsLucide = false;

  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier))
      continue;
    const specifier = statement.moduleSpecifier.text;
    const bindings = statement.importClause?.namedBindings;
    if (specifier === "lucide-react") {
      importsLucide = true;
      if (kind === "lucide" && bindings && ts.isNamedImports(bindings))
        for (const element of bindings.elements)
          if (!element.isTypeOnly) tags.add(element.name.text);
    } else if (
      kind === "icon" &&
      ICON_MODULES.has(specifier) &&
      bindings &&
      ts.isNamedImports(bindings)
    ) {
      for (const element of bindings.elements)
        if (!element.isTypeOnly && (element.propertyName ?? element.name).text === "Icon")
          tags.add(element.name.text);
    }
  }

  const elements: IconElement[] = [];
  const visit = (node: ts.Node) => {
    if (
      (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) &&
      ts.isIdentifier(node.tagName) &&
      tags.has(node.tagName.text)
    ) {
      const props = new Map<string, string | null>();
      let spread = false;
      for (const attribute of node.attributes.properties) {
        if (!ts.isJsxAttribute(attribute)) {
          spread = true;
          continue;
        }
        props.set(
          attribute.name.getText(source),
          attribute.initializer ? printed(attribute.initializer, source) : null,
        );
      }
      elements.push({
        line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1,
        props,
        spread,
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return { importsLucide, elements };
}

export type FileVerdict =
  { status: "ok" } | { status: "not-migrated" } | { status: "failed"; failures: string[] };

/** Props `Icon` takes that this migration must never add (it is behaviour-preserving). */
const FORBIDDEN_ON_HEAD = ["size", "tone", "label"];

export function compareFile(fileName: string, baseText: string, headText: string): FileVerdict {
  const head = parseIconElements(fileName, headText, "icon");
  if (head.importsLucide) return { status: "not-migrated" };
  const base = parseIconElements(fileName, baseText, "lucide");

  const failures: string[] = [];
  const fail = (line: number, reason: string) => failures.push(`${fileName}:${line}: ${reason}`);

  if (base.elements.length !== head.elements.length) {
    fail(
      (head.elements[base.elements.length] ?? head.elements[head.elements.length - 1])?.line ?? 1,
      `${base.elements.length} Lucide element(s) at BASE but ${head.elements.length} Icon element(s) at HEAD`,
    );
    return { status: "failed", failures };
  }

  base.elements.forEach((before, index) => {
    const after = head.elements[index];
    if (after.spread) fail(after.line, "an Icon element spreads props");
    for (const name of FORBIDDEN_ON_HEAD)
      if (after.props.has(name)) fail(after.line, `an Icon element carries the prop ${name}`);

    const expected = new Map(before.props);
    expected.delete("aria-hidden");
    const actual = new Map(after.props);
    actual.delete("name");
    if (!after.props.has("name")) fail(after.line, "an Icon element has no name prop");

    for (const [name, value] of expected) {
      if (!actual.has(name))
        fail(after.line, `the prop ${name} was dropped (BASE line ${before.line})`);
      else if (actual.get(name) !== value)
        fail(
          after.line,
          `${name} changed: BASE line ${before.line} has ${value ?? "(bare)"}, HEAD has ${actual.get(name) ?? "(bare)"}`,
        );
    }
    for (const name of actual.keys())
      if (!expected.has(name) && !FORBIDDEN_ON_HEAD.includes(name))
        fail(after.line, `the prop ${name} was added`);
  });

  return failures.length ? { status: "failed", failures } : { status: "ok" };
}
