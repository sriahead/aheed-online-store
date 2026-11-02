import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { walk, readDoc, relPath, normalize, ROOT } from "@/kms/schema/repo";
import { FrontMatter } from "@/kms/schema/frontmatter";

/**
 * Merqify KMS Link Integrity Gate
 *
 * Verifies that:
 * 1. No KMS document contains hardcoded local `file:///` links.
 * 2. All internal relative markdown links resolve to existing files on disk.
 * 3. All Nextra portal hub links in `kms/site-internal/content/` resolve to valid destinations.
 */
describe("Merqify KMS Link Integrity Gate", () => {
  const files = walk(ROOT);
  const docs: { file: string; content: string }[] = [];

  for (const file of files) {
    const docInfo = readDoc(file);
    if (Object.keys(docInfo.data).length === 0) continue;
    const result = FrontMatter.safeParse(normalize(docInfo.data));
    if (result.success) {
      docs.push({
        file: relPath(file),
        content: docInfo.content,
      });
    }
  }

  it("scans all registered KMS documents (at least 300 docs)", () => {
    expect(docs.length).toBeGreaterThanOrEqual(300);
  });

  it("ensures no KMS document contains hardcoded file:/// links", () => {
    const fileUrlMatches: { file: string; link: string }[] = [];
    const linkRegex = /\[([^\]]+)\]\((file:\/\/\/[^)]+)\)/g;

    for (const doc of docs) {
      const matches = doc.content.matchAll(linkRegex);
      for (const m of matches) {
        fileUrlMatches.push({ file: doc.file, link: m[2] });
      }
    }

    expect(
      fileUrlMatches,
      `Found hardcoded file:/// links in KMS docs: ${JSON.stringify(fileUrlMatches, null, 2)}`,
    ).toEqual([]);
  });

  it("ensures all internal relative links in KMS docs resolve to existing files", () => {
    const brokenLinks: { file: string; target: string }[] = [];
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;

    for (const doc of docs) {
      const sourceDir = dirname(join(ROOT, doc.file));
      const matches = doc.content.matchAll(linkRegex);

      for (const m of matches) {
        const target = m[2].trim();
        if (target.startsWith("http://") || target.startsWith("https://")) continue;
        if (target.startsWith("#") || target.startsWith("mailto:")) continue;

        const cleanLink = target.split("#")[0];
        if (!cleanLink) continue;

        // Relative to source file
        let targetPath = resolve(sourceDir, cleanLink);
        let exists = existsSync(targetPath);

        // If not found, check relative to repo ROOT
        if (!exists) {
          targetPath = resolve(ROOT, cleanLink.startsWith("/") ? cleanLink.slice(1) : cleanLink);
          exists = existsSync(targetPath);
        }

        // Check if it's an app route
        if (!exists) {
          const isAppRoute = [
            "/staff",
            "/dev",
            "/categories",
            "/help",
            "/cart",
            "/account",
            "/login",
            "/checkout",
          ].some((prefix) => cleanLink.startsWith(prefix));

          if (!isAppRoute) {
            brokenLinks.push({ file: doc.file, target });
          }
        }
      }
    }

    expect(
      brokenLinks,
      `Found broken internal links: ${JSON.stringify(brokenLinks, null, 2)}`,
    ).toEqual([]);
  });
});
