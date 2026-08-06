import { FrontMatter } from "./frontmatter";
import { ROOT, walk, relPath, normalize, readFrontMatter } from "./repo";

/**
 * Walks the repo for markdown files (.md / .mdx), validates any front-matter block
 * against the FrontMatter schema. Files with no front-matter are reported as
 * warnings, not failures — most existing docs haven't been backfilled yet (see
 * requirements.md). Files WITH a front-matter block that fails schema validation
 * are hard failures.
 */

function main() {
  const files = walk(ROOT);
  const noFrontMatter: string[] = [];
  const invalid: { file: string; errors: string[] }[] = [];
  let valid = 0;

  for (const file of files) {
    const data = readFrontMatter(file);
    const rel = relPath(file);

    if (Object.keys(data).length === 0) {
      noFrontMatter.push(rel);
      continue;
    }

    const result = FrontMatter.safeParse(normalize(data));
    if (result.success) {
      valid++;
    } else {
      invalid.push({
        file: rel,
        errors: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      });
    }
  }

  console.log(`kms:validate — scanned ${files.length} markdown file(s)`);
  console.log(`  valid front-matter: ${valid}`);
  console.log(`  no front-matter (warning, not blocking): ${noFrontMatter.length}`);
  if (noFrontMatter.length > 0) {
    for (const f of noFrontMatter) console.log(`    - ${f}`);
  }
  console.log(`  invalid front-matter (failing): ${invalid.length}`);
  if (invalid.length > 0) {
    for (const { file, errors } of invalid) {
      console.log(`    ✘ ${file}`);
      for (const e of errors) console.log(`        ${e}`);
    }
    process.exitCode = 1;
  }
}

main();
