import { mkdirSync, readFileSync, readdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { FrontMatter, trackFor, TRACK_SITE, type Track, DocType } from "../schema/frontmatter";
import { ROOT, walk, normalize, readFrontMatter } from "../schema/repo";

/**
 * Copies single-source docs (specs/, docs/, CLAUDE.md, kms/prompts/, ...) into a
 * site's content directory by visibility, so doc bodies are never duplicated by
 * hand. Destination filename is the doc's `id` (already URL-safe) + .mdx; the
 * front-matter block is passed through unchanged (Nextra reads `title` from it).
 *
 * content/<track-dir>/ is a MIXED directory: hand-authored nav (_meta.json) and
 * stub pages (index.mdx) live alongside generated docs. Only files this script
 * itself would produce (id.mdx, id != "index") are cleaned between runs — nothing
 * named index.mdx or _meta.json is ever touched.
 *
 * Usage: tsx kms/scripts/assemble.ts --visibility internal|public
 */

// The content FOLDER each track assembles into. Which SITE a track belongs to is
// TRACK_SITE in the schema, because kms:validate needs that same fact (#861).
const TRACK_SUBDIR: Record<Track, string> = {
  "internal-eng": "dev",
  "staff-ops": "staff",
  "customer-help": "customer",
};

const RESERVED = new Set(["index.mdx", "_meta.json"]);

/**
 * The whole routing rule, as a pure function, so it can be proven from a plain test with no
 * filesystem and no assembled directory to inspect (#861 R14). Returns the content subdirectory
 * this document belongs in for the site being assembled, or null when it belongs to neither.
 *
 * BOTH conditions matter, and the second one is the fix. This used to test only the track's site
 * against the CLI flag and never read the document's own `visibility` field at all — the one
 * field the schema comment says must never default was not consulted at the only point where it
 * selects a deploy target. An `internal` document whose audience list happened to include
 * `shopper` was therefore routed to the PUBLIC site. Nothing leaked only because
 * kms/site-public/ has no app, no build and no deploy workflow.
 *
 * kms:validate now fails when a document's track and visibility disagree, so "belongs to
 * neither" is a validation error rather than a file silently written nowhere.
 */
export function destinationFor(
  fm: FrontMatter,
  site: "internal" | "public",
): { subdir: string } | null {
  const track = trackFor(fm);
  if (TRACK_SITE[track] !== site) return null;
  if (fm.visibility !== site) return null;
  return { subdir: TRACK_SUBDIR[track] };
}

/**
 * Raw HTML comments (`<!-- -->`) are valid Markdown but not valid MDX — Nextra's
 * compiler tries to parse the `<` as a JSX tag and fails on the `!`. Source docs
 * can't just avoid them (CLAUDE.md's nextjs-agent-rules block is regenerated
 * verbatim by `next dev` in that exact syntax), so convert at assembly time.
 */
function toMdxSafeComments(content: string): string {
  return content.replace(/<!--([\s\S]*?)-->/g, (_, inner: string) => `{/*${inner}*/}`);
}

function parseArgs(): "internal" | "public" {
  const flag = process.argv.find((a) => a.startsWith("--visibility"));
  const value = flag?.includes("=")
    ? flag.split("=")[1]
    : process.argv[process.argv.indexOf(flag ?? "") + 1];
  if (value !== "internal" && value !== "public") {
    console.error("assemble — usage: tsx kms/scripts/assemble.ts --visibility internal|public");
    process.exit(1);
  }
  return value;
}

function cleanGenerated(dir: string) {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return; // doesn't exist yet — nothing to clean
  }
  for (const entry of entries) {
    if (DocType.options.includes(entry as any)) {
      rmSync(join(dir, entry), { recursive: true, force: true });
      continue;
    }
    if (RESERVED.has(entry) || !entry.endsWith(".mdx")) continue;
    rmSync(join(dir, entry), { force: true });
  }
}

function main() {
  const visibility = parseArgs();
  const contentRoot = join(ROOT, "kms", `site-${visibility}`, "content");

  for (const [track, subdir] of Object.entries(TRACK_SUBDIR) as [Track, string][]) {
    if (TRACK_SITE[track] === visibility) cleanGenerated(join(contentRoot, subdir));
  }

  const files = walk(ROOT);
  let copied = 0;

  for (const file of files) {
    const raw = readFileSync(file, "utf8");
    const data = readFrontMatter(file);
    if (Object.keys(data).length === 0) continue;

    const result = FrontMatter.safeParse(normalize(data));
    if (!result.success) continue; // kms:validate reports these; assembly just skips them

    const fm = result.data;
    const dest = destinationFor(fm, visibility);
    if (!dest) continue;

    const targetDir = join(contentRoot, dest.subdir, fm.type);
    mkdirSync(targetDir, { recursive: true });
    writeFileSync(join(targetDir, `${fm.id}.mdx`), toMdxSafeComments(raw));
    copied++;
  }

  console.log(`assemble --visibility ${visibility} — copied ${copied} doc(s) into ${contentRoot}`);
}

// Only run when invoked directly. tests/ imports `destinationFor` to prove the routing rule
// without touching the filesystem (#861 R14); without this guard that import would execute the
// whole assembly — and parseArgs() would process.exit(1) on the test runner's argv.
if (require.main === module) main();
