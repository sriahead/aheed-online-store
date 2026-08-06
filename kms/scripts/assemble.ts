import { mkdirSync, readFileSync, readdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { FrontMatter, trackFor, type Track } from "../schema/frontmatter";
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

// internal deploy serves tracks 1+2; public deploy serves track 3 only.
const TRACK_TO_DIR: Record<Track, { site: "internal" | "public"; subdir: string } | null> = {
  "internal-eng": { site: "internal", subdir: "dev" },
  "staff-ops": { site: "internal", subdir: "staff" },
  "customer-help": { site: "public", subdir: "customer" },
};

const RESERVED = new Set(["index.mdx", "_meta.json"]);

function parseArgs(): "internal" | "public" {
  const flag = process.argv.find((a) => a.startsWith("--visibility"));
  const value = flag?.includes("=") ? flag.split("=")[1] : process.argv[process.argv.indexOf(flag ?? "") + 1];
  if (value !== "internal" && value !== "public") {
    console.error('assemble — usage: tsx kms/scripts/assemble.ts --visibility internal|public');
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
    if (RESERVED.has(entry) || !entry.endsWith(".mdx")) continue;
    rmSync(join(dir, entry), { force: true });
  }
}

function main() {
  const visibility = parseArgs();
  const contentRoot = join(ROOT, "kms", `site-${visibility}`, "content");

  for (const dest of Object.values(TRACK_TO_DIR)) {
    if (dest && dest.site === visibility) cleanGenerated(join(contentRoot, dest.subdir));
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
    const track = trackFor(fm);
    const dest = TRACK_TO_DIR[track];
    if (!dest || dest.site !== visibility) continue;

    const targetDir = join(contentRoot, dest.subdir);
    mkdirSync(targetDir, { recursive: true });
    writeFileSync(join(targetDir, `${fm.id}.mdx`), raw);
    copied++;
  }

  console.log(`assemble --visibility ${visibility} — copied ${copied} doc(s) into ${contentRoot}`);
}

main();
