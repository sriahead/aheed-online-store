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

/** Where the generator writes, relative to the repository root. */
export const ICON_DATA_PATH = "components/icons/generated/icon-data.ts";
export const LICENCES_PATH = "public/third-party-icon-licenses.txt";

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

/** The notice file: one section per set the registry actually uses, upstream LICENSE text verbatim. */
export function buildLicences(registry: RegistryInput, options: BuildOptions = {}): string {
  const loadInfo = options.loadInfo ?? defaultLoadInfo;
  const licenceDir = options.licenceDir ?? join(process.cwd(), "scripts", "icon-licences");
  const sets = [...new Set(Object.values(registry).map((e) => PROVIDER_SET[e.provider]))].sort();
  const seenSpdx = new Map<string, string>();
  const sections: string[] = [];
  for (const set of sets) {
    const info = loadInfo(set);
    const spdx = info.license?.spdx;
    if (!spdx) throw new Error(`icon set "${set}" declares no SPDX licence in its info.json`);
    if (seenSpdx.has(spdx)) {
      throw new Error(
        `sets "${seenSpdx.get(spdx)}" and "${set}" share the licence ${spdx}; scripts/icon-licences/ holds one text per SPDX id, so give each set its own file naming first`,
      );
    }
    seenSpdx.set(spdx, set);
    let text: string;
    try {
      text = readFileSync(join(licenceDir, `${spdx}.txt`), "utf8");
    } catch {
      throw new Error(
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
  return files;
}
