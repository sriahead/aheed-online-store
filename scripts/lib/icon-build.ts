import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { getIconData } from "@iconify/utils";
import type { IconData, RegistryEntry } from "../../components/icons/types";

/**
 * The icon generator's logic (#1223, ADR-008), kept pure so `tests/icon-generator.test.ts` can drive it
 * with fixture registries and `scripts/build-icons.ts` stays a thin CLI over it.
 *
 * Everything here is build-time only: the app never imports this file and never reads an Iconify
 * package at runtime, which is what keeps the CSP unchanged and the Worker free of icon-set JSON.
 */

/** The shape of an Iconify `icons.json`, as much of it as this file reads. Local on purpose: `@iconify/types` is a transitive dependency of the one package we pin. */
interface IconSetJson {
  icons: Record<string, unknown>;
  aliases?: Record<string, unknown>;
  [key: string]: unknown;
}

interface SetInfo {
  name: string;
  author?: { name?: string; url?: string };
  license?: { title?: string; spdx?: string; url?: string };
}

/** Which installed `@iconify-json/<set>` serves each provider. */
export const PROVIDER_SET: Record<string, string> = { lucide: "lucide", ph: "ph" };

/** The set the department illustrations come from. It is not an inline-icon provider, so it is not in `PROVIDER_SET`. */
export const ILLUSTRATION_SET = "noto";

/** Where the generator writes, relative to the repository root. */
export const ICON_DATA_PATH = "components/icons/generated/icon-data.ts";
export const LICENCES_PATH = "public/third-party-icon-licenses.txt";
export const ILLUSTRATIONS_DIR = "public/illustrations/departments";

/** R43: each illustration at most 16 KiB and the 16 together at most 96 KiB. */
export const MAX_ILLUSTRATION_BYTES = 16_384;
export const MAX_ILLUSTRATIONS_TOTAL_BYTES = 98_304;

/** Attributes `lucide-react` puts on the root `<svg>`; Iconify's Lucide data repeats them on every child. */
const LUCIDE_ROOT: Record<string, string> = {
  fill: "none",
  stroke: "currentColor",
  "stroke-linecap": "round",
  "stroke-linejoin": "round",
  "stroke-width": "2",
};
const PH_ROOT: Record<string, string> = { fill: "currentColor" };

const UNSAFE_MARKUP = /<script|<foreignObject|javascript:|\son[a-z]+\s*=/i;
const TAG_RE = /<([A-Za-z][\w-]*)((?:\s+[\w:-]+="[^"]*")*)(\s*\/?)>/g;
const ATTR_RE = /([\w:-]+)="([^"]*)"/g;
const DUOTONE_LAYER = 'opacity=".2"';
const DUOTONE_REPLACEMENT =
  'style="fill:var(--icon-secondary,currentColor);opacity:var(--icon-secondary-opacity,.2)"';

/** An error that always names the semantic name and the id, so a CI log points at the registry line. */
export class IconBuildError extends Error {
  constructor(
    readonly semanticName: string,
    readonly iconId: string,
    reason: string,
  ) {
    super(`icon "${semanticName}" (${iconId}): ${reason}`);
    this.name = "IconBuildError";
  }
}

/** A problem with the notice file's inputs (a missing licence text), as opposed to a bad icon. */
export class IconLicenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IconLicenceError";
  }
}

/**
 * Loaders that read icon sets from `<dir>/<set>/icons.json` and `<dir>/<set>/info.json` instead of
 * `node_modules/@iconify-json`. This is what `scripts/build-icons.ts --sets-dir <dir>` uses, and it exists
 * so a test can run the REAL script against a set with a poisoned body (R10): the unsafe-markup rule
 * cannot be exercised through the process with the real, safe sets.
 */
export function loadersFromDirectory(dir: string): Pick<BuildOptions, "loadSet" | "loadInfo"> {
  const read = (set: string, file: string): unknown =>
    JSON.parse(readFileSync(join(dir, set, file), "utf8"));
  return {
    loadSet: (set) => read(set, "icons.json") as IconSetJson,
    loadInfo: (set) => read(set, "info.json") as SetInfo,
  };
}

export type RegistryInput = Record<
  string,
  RegistryEntry | { tier: string; provider: string; id: string }
>;

export interface BuildOptions {
  /** Test seam: supply a set's `icons.json` without touching node_modules. */
  loadSet?: (set: string) => IconSetJson;
  loadInfo?: (set: string) => SetInfo;
  /** Directory holding one `<SPDX>.txt` per licence (verbatim upstream LICENSE). */
  licenceDir?: string;
  /** Department slug -> Noto Emoji id (`components/icons/illustrations.ts`). Omitted or empty means none are generated. */
  illustrations?: Record<string, string>;
}

const require_ = createRequire(import.meta.url);

function readInstalledJson(set: string, file: string): unknown {
  return JSON.parse(readFileSync(require_.resolve(`@iconify-json/${set}/${file}`), "utf8"));
}

function defaultLoadSet(set: string): IconSetJson {
  return readInstalledJson(set, "icons.json") as IconSetJson;
}
function defaultLoadInfo(set: string): SetInfo {
  return readInstalledJson(set, "info.json") as SetInfo;
}

/** Drop root-level attributes from every tag; keep any element's own DIFFERENT value. */
function hoistRootAttributes(
  body: string,
  root: Record<string, string>,
  name: string,
  id: string,
): string {
  let tags = 0;
  const out = body.replace(TAG_RE, (_m, tag: string, attrs: string, end: string) => {
    tags += 1;
    const kept: string[] = [];
    for (const match of attrs.matchAll(ATTR_RE)) {
      const [, attr, value] = match;
      if (root[attr] === value) continue;
      kept.push(` ${attr}="${value}"`);
    }
    return `<${tag}${kept.join("")}${end}>`;
  });
  // Any `<` that is not the start of a closing tag and was not consumed above means markup this regex
  // could not read (single-quoted attributes, say). Failing here beats silently shipping an un-hoisted icon.
  const opening = (body.match(/<[A-Za-z]/g) ?? []).length;
  if (opening !== tags) {
    throw new IconBuildError(
      name,
      id,
      "unparseable markup: could not read every element's attributes",
    );
  }
  return out;
}

/** Resolve one registry entry to render-ready data, or throw an `IconBuildError`. */
export function resolveIcon(
  name: string,
  entry: { tier: string; provider: string; id: string },
  loadSet: (set: string) => IconSetJson,
): IconData {
  const { provider, id, tier } = entry;
  const set = PROVIDER_SET[provider];
  if (!set) throw new IconBuildError(name, id, `unknown provider "${provider}"`);
  if (tier === "functional" && provider !== "lucide") {
    throw new IconBuildError(
      name,
      id,
      `a functional icon must come from Lucide, not "${provider}"`,
    );
  }
  const resolved = getIconData(loadSet(set) as never, id) as {
    body: string;
    width?: number;
    height?: number;
    left?: number;
    top?: number;
    rotate?: number;
    hFlip?: boolean;
    vFlip?: boolean;
  } | null;
  if (!resolved)
    throw new IconBuildError(name, id, `no such icon in the "${set}" set (aliases included)`);
  if (resolved.rotate || resolved.hFlip || resolved.vFlip) {
    throw new IconBuildError(
      name,
      id,
      "the id resolves through an alias that rotates or flips; not supported",
    );
  }

  const root = provider === "lucide" ? LUCIDE_ROOT : PH_ROOT;
  let body = hoistRootAttributes(resolved.body, root, name, id);

  if (provider === "ph" && id.endsWith("-duotone")) {
    if (!body.includes(DUOTONE_LAYER)) {
      throw new IconBuildError(
        name,
        id,
        `a duotone icon must carry its ${DUOTONE_LAYER} secondary layer`,
      );
    }
    body = body.split(DUOTONE_LAYER).join(DUOTONE_REPLACEMENT);
  }

  if (UNSAFE_MARKUP.test(body)) {
    throw new IconBuildError(
      name,
      id,
      "the body contains markup that must never be injected (script, foreignObject, javascript:, or an on* handler)",
    );
  }

  const width = resolved.width ?? 24;
  const height = resolved.height ?? 24;
  return { viewBox: `${resolved.left ?? 0} ${resolved.top ?? 0} ${width} ${height}`, root, body };
}

/** Every registry entry, resolved. Throws on the first failure (CI wants one clear line, not a list). */
export function buildIconData(
  registry: RegistryInput,
  options: BuildOptions = {},
): Record<string, IconData> {
  const loadSet = options.loadSet ?? defaultLoadSet;
  const cache = new Map<string, IconSetJson>();
  const cached = (set: string) => {
    let value = cache.get(set);
    if (!value) {
      value = loadSet(set);
      cache.set(set, value);
    }
    return value;
  };
  const out: Record<string, IconData> = {};
  for (const name of Object.keys(registry).sort()) {
    out[name] = resolveIcon(name, registry[name], cached);
  }
  return out;
}

/** The generated module's text. Deterministic: sorted keys, JSON string escaping, one icon per line. */
export function renderIconDataModule(data: Record<string, IconData>): string {
  const lines = Object.keys(data)
    .sort()
    .map((name) => {
      const { viewBox, root, body } = data[name];
      const rootText = Object.keys(root)
        .sort()
        .map((k) => `${JSON.stringify(k)}: ${JSON.stringify(root[k])}`)
        .join(", ");
      return `  ${JSON.stringify(name)}: { viewBox: ${JSON.stringify(viewBox)}, root: { ${rootText} }, body: ${JSON.stringify(body)} },`;
    });
  return [
    "// GENERATED by scripts/build-icons.ts (npm run icons:build). Do not edit by hand: `npm run icons:check`",
    "// fails CI when this file is stale. Inputs: components/icons/registry.ts and the pinned @iconify-json sets.",
    "// Excluded from Prettier and ESLint on purpose (see .prettierignore and eslint.config.mjs).",
    'import type { IconName } from "../registry";',
    'import type { IconData } from "../types";',
    "",
    "export const ICON_DATA: Record<IconName, IconData> = {",
    ...lines,
    "};",
    "",
  ].join("\n");
}

/**
 * One standalone SVG per department slug, from the Noto Emoji set. Same safety rule as an inline icon
 * (R10) and the size limits of R43; an id that does not resolve names the slug and the id.
 */
export function buildIllustrations(
  illustrations: Record<string, string>,
  options: BuildOptions = {},
): Map<string, string> {
  const loadSet = options.loadSet ?? defaultLoadSet;
  const files = new Map<string, string>();
  if (Object.keys(illustrations).length === 0) return files;
  const set = loadSet(ILLUSTRATION_SET);
  let total = 0;
  for (const slug of Object.keys(illustrations).sort()) {
    const id = illustrations[slug];
    const resolved = getIconData(set as never, id) as {
      body: string;
      width?: number;
      height?: number;
      left?: number;
      top?: number;
    } | null;
    if (!resolved)
      throw new IconBuildError(
        slug,
        id,
        `no such illustration in the "${ILLUSTRATION_SET}" set (aliases included)`,
      );
    if (UNSAFE_MARKUP.test(resolved.body)) {
      throw new IconBuildError(
        slug,
        id,
        "the body contains markup that must never be served (script, foreignObject, javascript:, or an on* handler)",
      );
    }
    const viewBox = `${resolved.left ?? 0} ${resolved.top ?? 0} ${resolved.width ?? 128} ${resolved.height ?? 128}`;
    // Explicit width and height as well as the viewBox: `ImageWithFallback` reads a finished load with
    // naturalWidth 0 as a failure, and a viewBox-only SVG can report 0 in some browsers.
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${resolved.width ?? 128}" height="${resolved.height ?? 128}" viewBox="${viewBox}">${resolved.body}</svg>\n`;
    const bytes = Buffer.byteLength(svg);
    if (bytes > MAX_ILLUSTRATION_BYTES) {
      throw new IconBuildError(
        slug,
        id,
        `${bytes} bytes exceeds the ${MAX_ILLUSTRATION_BYTES} byte limit for one illustration`,
      );
    }
    total += bytes;
    files.set(`${ILLUSTRATIONS_DIR}/${slug}.svg`, svg);
  }
  if (total > MAX_ILLUSTRATIONS_TOTAL_BYTES) {
    throw new IconBuildError(
      "illustrations",
      `${files.size} files`,
      `${total} bytes together exceeds the ${MAX_ILLUSTRATIONS_TOTAL_BYTES} byte limit`,
    );
  }
  return files;
}

/**
 * R63: Noto Emoji's own licence URL (the `info.json` one) returns 404, so its section carries the canonical
 * Apache 2.0 text plus this record of why. Written once here so `icons:check` covers it.
 */
const NOTO_NOTE =
  "Note: the licence URL above (https://github.com/googlefonts/noto-emoji/blob/main/svg/LICENSE) returned HTTP 404 on 2026-10-23. " +
  'The project README states "Tools and most image resources are under the Apache license, version 2.0", ' +
  "so the canonical Apache License 2.0 text (https://www.apache.org/licenses/LICENSE-2.0.txt) is reproduced above. " +
  "None of the department illustrations on this site is a region flag, the exception the README names.";

/** The notice file: one section per set the registry actually uses, upstream LICENSE text verbatim. */
export function buildLicences(registry: RegistryInput, options: BuildOptions = {}): string {
  const loadInfo = options.loadInfo ?? defaultLoadInfo;
  const licenceDir = options.licenceDir ?? join(process.cwd(), "scripts", "icon-licences");
  const sets = [...new Set(Object.values(registry).map((e) => PROVIDER_SET[e.provider]))];
  if (Object.keys(options.illustrations ?? {}).length > 0) sets.push(ILLUSTRATION_SET);
  sets.sort();
  const seenSpdx = new Map<string, string>();
  const sections: string[] = [];
  for (const set of sets) {
    const info = loadInfo(set);
    const spdx = info.license?.spdx;
    if (!spdx)
      throw new IconLicenceError(`icon set "${set}" declares no SPDX licence in its info.json`);
    if (seenSpdx.has(spdx)) {
      throw new IconLicenceError(
        `sets "${seenSpdx.get(spdx)}" and "${set}" share the licence ${spdx}; scripts/icon-licences/ holds one text per SPDX id, so give each set its own file naming first`,
      );
    }
    seenSpdx.set(spdx, set);
    let text: string;
    try {
      text = readFileSync(join(licenceDir, `${spdx}.txt`), "utf8");
    } catch {
      throw new IconLicenceError(
        `no licence text for ${spdx} (set "${set}"): add scripts/icon-licences/${spdx}.txt with the upstream LICENSE verbatim (${info.license?.url ?? "no url"})`,
      );
    }
    sections.push(
      [
        "=".repeat(78),
        info.name,
        `SPDX licence: ${spdx}`,
        `Author:       ${info.author?.name ?? "unknown"}`,
        `Source:       ${info.author?.url ?? "unknown"}`,
        `Licence URL:  ${info.license?.url ?? "unknown"}`,
        "-".repeat(78),
        text.trimEnd(),
        ...(set === ILLUSTRATION_SET ? ["", NOTO_NOTE] : []),
        "",
      ].join("\n"),
    );
  }
  return [
    "Third-party icon licences",
    "",
    "Icons on this site are drawn from the open-source sets below, bundled at build time.",
    "Generated by `npm run icons:build`; do not edit by hand.",
    "",
    ...sections,
  ].join("\n");
}

/** Every file the generator owns, as repo-relative path -> content. */
export function buildArtefacts(
  registry: RegistryInput,
  options: BuildOptions = {},
): Map<string, string> {
  const files = new Map<string, string>();
  files.set(ICON_DATA_PATH, renderIconDataModule(buildIconData(registry, options)));
  files.set(LICENCES_PATH, buildLicences(registry, options));
  for (const [path, svg] of buildIllustrations(options.illustrations ?? {}, options)) {
    files.set(path, svg);
  }
  return files;
}
