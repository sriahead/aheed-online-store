import { readFileSync } from "node:fs";

/**
 * The one parser for `KEY=value` env files used by `scripts/*` (P9.2, #505).
 *
 * WHY THIS IS NOT `dotenv`, AND WHY THAT IS A DECISION RATHER THAN INERTIA.
 * Six other scripts in this directory import `dotenv` directly and are right to:
 * they load `.env` into their own `process.env` and never look at another file.
 * The scripts importing *this* module do something different — they read a
 * NAMED file chosen at runtime (`--env-file secrets/staging.vars`) to resolve
 * which environment they are about to touch, and compare it against another.
 *
 * Those `secrets/*.vars` files are gitignored, hand-maintained, and will never
 * be seen by a linter, a formatter or a code review. A parser that tolerates
 * their formatting is therefore a real requirement and not a workaround to be
 * removed — which is the conclusion #505 reached after the opposite was assumed.
 * The repo's own `.env` demonstrates the problem: it carries spaces around `=`
 * and trailing same-line `# comment`s on the connection-string lines, the exact
 * format `CLAUDE.md`'s env-format rule records as having silently broken a
 * connection string here before.
 *
 * Quoted values are taken verbatim up to the closing quote, so a `#` inside a
 * URL survives; unquoted values are truncated at the first `#`.
 *
 * OUTSTANDING, AND NOT FIXABLE BY ANY PULL REQUEST: `.env`, `.dev.vars` and
 * `secrets/*.vars` are gitignored and hold live credentials, so normalising them
 * to the documented format has to be done by hand in each working checkout.
 * #505 stays open for exactly that. Until it is done, this parser is what stands
 * between a malformed line and a script silently resolving the wrong database —
 * so do not "simplify" it to `dotenv` without doing that normalisation first,
 * everywhere, including in checkouts you cannot see.
 *
 * Consolidated here from four byte-identical private copies (in
 * `copy-product-images.ts`, `fill-product-images.ts`, `remove-vendor-domains.ts`
 * and `restore-placeholder-images.ts`); the duplication, not the parser, was the
 * defect #505 named.
 */
export function parseEnvFile(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    const [, key, rest] = match;
    const quote = rest[0];
    if (quote === '"' || quote === "'") {
      const end = rest.indexOf(quote, 1);
      if (end > 0) {
        out[key] = rest.slice(1, end);
        continue;
      }
    }
    // Unquoted: a trailing comment is whatever follows the first `#`.
    out[key] = rest.split("#")[0].trim();
  }
  return out;
}
