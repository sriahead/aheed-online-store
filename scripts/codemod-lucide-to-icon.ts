import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

/**
 * Mechanical migration from `lucide-react` to `components/icons/Icon` (#1223, Phases 1 to 2b):
 *
 * `npx tsx scripts/codemod-lucide-to-icon.ts [--dry] <file>...`
 *
 * For each file, every JSX use of an imported Lucide icon, `<Search className="h-4 w-4" aria-hidden />`,
 * becomes `<Icon name="search" className="h-4 w-4" />`. The rest of each element's props are carried over
 * VERBATIM: the migration keeps every `className`, sets no `size`, and so changes no rendered attribute
 * (R34 and R35 prove that against BASE). `aria-hidden` is dropped because `Icon` is `aria-hidden` unless
 * it is given a `label`, and `lucide-react` already rendered `aria-hidden="true"` by default.
 *
 * It edits source text by AST position (never reprints the file), so formatting and comments survive.
 *
 * WHAT IT REFUSES, SO A HUMAN LOOKS. It leaves a name's import in place and says so when that icon is used
 * as a VALUE (`icon={User}`, a lookup table, a ternary) rather than as a JSX tag; when the file already has
 * a binding called `Icon`; when an icon element has a prop `Icon` cannot take; and for `type LucideIcon`.
 * Those are the places where the migration is a design edit, not a rename, and R36 is what finishes them.
 *
 * The registry key for each Lucide export comes from `tests/fixtures/lucide-icons-in-use.json`.
 */

interface Manifest {
  icons: Array<{ export: string; key: string }>;
}

const manifest = JSON.parse(
  readFileSync(
    resolve(
      fileURLToPath(new URL(".", import.meta.url)),
      "../tests/fixtures/lucide-icons-in-use.json",
    ),
    "utf8",
  ),
) as Manifest;
const KEY_FOR = new Map(manifest.icons.map((i) => [i.export, i.key]));

/** Props `Icon` accepts besides `name`. Anything else on an icon element needs a human. */
const SUPPORTED_PROPS = new Set(["className", "strokeWidth", "style", "key"]);

interface Edit {
  start: number;
  end: number;
  text: string;
}

export interface CodemodResult {
  text: string;
  changed: boolean;
  notes: string[];
}

/** `aria-hidden`, `aria-hidden={true}` and `aria-hidden="true"` are the plain forms; anything computed needs a human. */
function isPlainAriaHidden(attribute: ts.JsxAttribute): boolean {
  const initializer = attribute.initializer;
  if (!initializer) return true;
  if (ts.isStringLiteral(initializer)) return initializer.text === "true";
  return (
    ts.isJsxExpression(initializer) && initializer.expression?.kind === ts.SyntaxKind.TrueKeyword
  );
}

function tagNameOf(node: ts.JsxOpeningLikeElement | ts.JsxClosingElement): ts.Identifier | null {
  return ts.isIdentifier(node.tagName) ? node.tagName : null;
}

export function migrate(fileName: string, original: string): CodemodResult {
  const notes: string[] = [];
  if (!original.includes("lucide-react")) return { text: original, changed: false, notes };

  const source = ts.createSourceFile(
    fileName,
    original,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );

  // 1. The Lucide import: local name -> exported name.
  const local = new Map<string, string>();
  let lucideImport: ts.ImportDeclaration | null = null;
  let lastImport: ts.ImportDeclaration | null = null;
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    lastImport = statement;
    if (
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== "lucide-react"
    )
      continue;
    lucideImport = statement;
    const bindings = statement.importClause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) {
        if (element.isTypeOnly) {
          notes.push(`type import ${element.name.text} left for a human`);
          continue;
        }
        local.set(element.name.text, (element.propertyName ?? element.name).text);
      }
    }
  }
  if (!lucideImport || local.size === 0) return { text: original, changed: false, notes };

  // 2. A pre-existing binding called Icon would shadow or collide with the component.
  let hasIconBinding = false;
  const visitBindings = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === "Icon")
      hasIconBinding = true;
    if (ts.isParameter(node) && ts.isIdentifier(node.name) && node.name.text === "Icon")
      hasIconBinding = true;
    if (ts.isFunctionDeclaration(node) && node.name?.text === "Icon") hasIconBinding = true;
    if (ts.isBindingElement(node) && ts.isIdentifier(node.name) && node.name.text === "Icon")
      hasIconBinding = true;
    ts.forEachChild(node, visitBindings);
  };
  visitBindings(source);
  if (hasIconBinding) {
    notes.push("file already has a binding named Icon: migrate by hand");
    return { text: original, changed: false, notes };
  }

  // 3. Analyse. A local name is migrated only if EVERY use is a JSX tag with props Icon can take, and it is
  //    never used as a value; otherwise its import stays and its tags are left alone (a half-migrated name
  //    would be worse than an unmigrated one).
  const refusals = new Map<string, string>();
  const tagged = new Set<string>();
  const referenced = new Set<string>();

  const analyse = (node: ts.Node) => {
    if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
      const tag = tagNameOf(node);
      const exportName = tag ? local.get(tag.text) : undefined;
      if (tag && exportName) {
        tagged.add(tag.text);
        const line = source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
        if (!KEY_FOR.has(exportName))
          refusals.set(tag.text, `${exportName} has no registry key in the manifest`);
        for (const attribute of node.attributes.properties) {
          if (!ts.isJsxAttribute(attribute)) {
            refusals.set(tag.text, `<${tag.text}> at line ${line} spreads props`);
            continue;
          }
          const name = attribute.name.getText(source);
          if (name === "aria-hidden") {
            if (!isPlainAriaHidden(attribute))
              refusals.set(tag.text, `<${tag.text}> at line ${line} has a computed aria-hidden`);
          } else if (!SUPPORTED_PROPS.has(name)) {
            refusals.set(
              tag.text,
              `<${tag.text}> at line ${line} has the prop ${name}, which Icon cannot take`,
            );
          }
        }
      }
    }
    if (ts.isIdentifier(node) && local.has(node.text)) {
      const parent = node.parent;
      const isImportName = ts.isImportSpecifier(parent);
      const isTag =
        (ts.isJsxSelfClosingElement(parent) ||
          ts.isJsxOpeningElement(parent) ||
          ts.isJsxClosingElement(parent)) &&
        parent.tagName === node;
      if (!isImportName) referenced.add(node.text);
      if (!isImportName && !isTag)
        refusals.set(node.text, `${node.text} is used as a value, not only as a tag`);
    }
    ts.forEachChild(node, analyse);
  };
  analyse(source);

  for (const [name, reason] of refusals)
    notes.push(`${reason}: ${name}'s import is kept, migrate by hand`);
  const migrated = new Set([...tagged].filter((name) => !refusals.has(name)));
  // Imported but never referenced: dead weight that would otherwise keep a lucide-react import alive.
  const dead = new Set([...local.keys()].filter((name) => !referenced.has(name)));
  if (migrated.size === 0 && dead.size === 0) return { text: original, changed: false, notes };
  for (const name of dead) notes.push(`${name} was imported but never used: removed`);

  // 4. Edit the migrated tags.
  const edits: Edit[] = [];
  const edit = (node: ts.Node) => {
    if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
      const tag = tagNameOf(node);
      if (tag && migrated.has(tag.text)) {
        edits.push({
          start: tag.getStart(),
          end: tag.getEnd(),
          text: `Icon name="${KEY_FOR.get(local.get(tag.text)!)}"`,
        });
        for (const attribute of node.attributes.properties) {
          if (ts.isJsxAttribute(attribute) && attribute.name.getText(source) === "aria-hidden") {
            // Remove the attribute together with the whitespace in front of it.
            edits.push({ start: attribute.getFullStart(), end: attribute.getEnd(), text: "" });
          }
        }
      }
    }
    if (ts.isJsxClosingElement(node)) {
      const tag = tagNameOf(node);
      if (tag && migrated.has(tag.text))
        edits.push({ start: tag.getStart(), end: tag.getEnd(), text: "Icon" });
    }
    ts.forEachChild(node, edit);
  };
  edit(source);

  // 5. Rewrite the import: drop migrated specifiers, add the Icon import after the last import.
  const bindings = lucideImport.importClause!.namedBindings as ts.NamedImports;
  const remaining = bindings.elements.filter(
    (element) => !migrated.has(element.name.text) && !dead.has(element.name.text),
  );
  const importText = original.slice(lucideImport.getStart(), lucideImport.getEnd());
  edits.push({
    start: lucideImport.getStart(),
    end: lucideImport.getEnd(),
    text:
      remaining.length === 0
        ? ""
        : importText.replace(
            /\{[^}]*\}/,
            `{ ${remaining.map((e) => e.getText(source)).join(", ")} }`,
          ),
  });
  if (migrated.size > 0) {
    const insertAt = lastImport!.getEnd();
    edits.push({
      start: insertAt,
      end: insertAt,
      text: `\nimport { Icon } from "@/components/icons/Icon";`,
    });
  }

  let text = original;
  for (const e of edits.sort((x, y) => y.start - x.start || y.end - x.end)) {
    text = text.slice(0, e.start) + e.text + text.slice(e.end);
  }
  return { text, changed: true, notes };
}

if (process.argv[1] && /codemod-lucide-to-icon/.test(process.argv[1])) {
  const args = process.argv.slice(2);
  const dry = args.includes("--dry");
  for (const file of args.filter((a) => !a.startsWith("--"))) {
    const original = readFileSync(file, "utf8");
    const { text, changed, notes } = migrate(file, original);
    console.error(`${changed ? (dry ? "would change" : "changed") : "unchanged"}: ${file}`);
    for (const note of notes) console.error(`  note: ${note}`);
    if (changed && !dry) writeFileSync(file, text);
  }
}
