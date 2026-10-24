import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildArtefacts,
  buildIconData,
  IconBuildError,
  IconLicenceError,
  ILLUSTRATIONS_DIR,
  loadersFromDirectory,
  type RegistryInput,
} from "./lib/icon-build";

/**
 * Generate the icon artefacts, or check that they are current (#1223, ADR-008).
 *
 * `npx tsx scripts/build-icons.ts`                 write components/icons/generated/icon-data.ts,
 *                                                  public/third-party-icon-licenses.txt and
 *                                                  public/illustrations/departments/<slug>.svg
 * `npx tsx scripts/build-icons.ts --check`         write nothing; exit 1 and name every stale file
 * `npx tsx scripts/build-icons.ts --registry <f>`  validate a JSON registry (a fixture) and exit; writes nothing
 * `... --sets-dir <dir>`                           read icon sets from `<dir>/<set>/icons.json` and `info.json`
 *                                                  instead of node_modules (a test seam: it lets a test give the
 *                                                  real script a poisoned set, which the real sets cannot be)
 *
 * Progress goes to stderr and failures exit non-zero naming the semantic name and id. Nothing here
 * touches a database or the network: it reads the pinned `@iconify-json/*` packages in node_modules and
 * the licence texts under scripts/icon-licences/.
 */

const ROOT = fileURLToPath(new URL("..", import.meta.url));

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function loadRegistry(): Promise<RegistryInput> {
  const fixture = argValue("--registry");
  if (fixture) return JSON.parse(readFileSync(fixture, "utf8")) as RegistryInput;
  const { ICON_REGISTRY } = await import("../components/icons/registry");
  return ICON_REGISTRY as RegistryInput;
}

async function main(): Promise<number> {
  const registry = await loadRegistry();
  const setsDir = argValue("--sets-dir");
  const { DEPARTMENT_ILLUSTRATIONS } = await import("../components/icons/illustrations");
  const options = {
    ...(setsDir ? loadersFromDirectory(setsDir) : {}),
    illustrations: DEPARTMENT_ILLUSTRATIONS as Record<string, string>,
  };

  if (argValue("--registry")) {
    const data = buildIconData(registry, options);
    console.error(`registry ok: ${Object.keys(data).length} icon(s) resolve`);
    return 0;
  }

  const files = buildArtefacts(registry, options);
  const check = process.argv.includes("--check");
  const stale: string[] = [];

  for (const [path, content] of files) {
    const absolute = join(ROOT, path);
    const current = existsSync(absolute) ? readFileSync(absolute, "utf8") : null;
    if (current === content) continue;
    if (check) {
      stale.push(path);
    } else {
      mkdirSync(dirname(absolute), { recursive: true });
      writeFileSync(absolute, content);
      console.error(`wrote ${path}`);
    }
  }

  // A file in the illustrations directory that the map no longer names is stale too (R43: exactly the mapped files).
  const illustrationsDir = join(ROOT, ILLUSTRATIONS_DIR);
  if (existsSync(illustrationsDir)) {
    for (const name of readdirSync(illustrationsDir)) {
      const path = `${ILLUSTRATIONS_DIR}/${name}`;
      if (files.has(path)) continue;
      if (check) stale.push(path);
      else {
        rmSync(join(illustrationsDir, name));
        console.error(`removed ${path}`);
      }
    }
  }

  if (check) {
    for (const path of stale) {
      console.error(`::error::${path} is stale: run 'npm run icons:build' and commit the result.`);
    }
    if (stale.length > 0) {
      console.error(
        `icons:check: ${stale.length} generated file(s) stale or unexpected (of ${files.size} expected)`,
      );
      return 1;
    }
    console.error(`icons:check: all ${files.size} generated file(s) current`);
  }
  return 0;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    // The message names the semantic name and id for an IconBuildError; anything else is printed whole.
    const known = error instanceof IconBuildError || error instanceof IconLicenceError;
    console.error(known ? `icons: ${error.message}` : error);
    process.exit(1);
  },
);
