/**
 * #1216 R3 — "is this manifest ready to be deployed?", as a pure function over the parsed manifest.
 *
 * A manifest may carry PLACEHOLDERS: valid-but-fake values the owner has not yet confirmed (a
 * delivery fee, a sender address, a footer). The schema stays strict, so a placeholder has to be a
 * real value of the right type; what marks it is either the `placeholders` list (which is the only
 * way a number can carry the mark) or the text marker `OWNER TO CONFIRM`, the `.invalid` suffix, or the
 * repo's `[BRACKETED CAPS]` convention on a string. A manifest is ready only when nothing is marked.
 *
 * WHERE THIS IS AND IS NOT ENFORCED. A real client's manifest is never committed, so CI cannot see
 * one. The gate is the operator running `--check-ready` / `--emit-route`, plus the host guard that
 * stops the provisioner writing to a deployed database at all. It is a gate the operator runs, not
 * one CI enforces, and the runbook says so.
 */

export const PLACEHOLDER_MARKER = /owner[\s_-]*to[\s_-]*confirm/i;

/** The repo's existing bracket convention for an unfilled value (`[PHONE]`, `[PLATFORM NAME]`). */
const BRACKET_PLACEHOLDER = /^\[[A-Z0-9 _-]+\]$/;

/** Does a dotted path (`config.senderEmail`, `deliveryPrefixes`, `footer.location`) name a field? */
export function pathResolves(value: unknown, path: string): boolean {
  let current: unknown = value;
  for (const segment of path.split(".")) {
    if (segment === "" || current === null || typeof current !== "object") return false;
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) return false;
      current = current[index];
    } else {
      if (!Object.prototype.hasOwnProperty.call(current, segment)) return false;
      current = (current as Record<string, unknown>)[segment];
    }
  }
  return true;
}

function markedStrings(value: unknown, path: string, out: string[]): void {
  if (typeof value === "string") {
    const text = value.trim();
    if (
      PLACEHOLDER_MARKER.test(text) ||
      /\.invalid$/i.test(text) ||
      BRACKET_PLACEHOLDER.test(text)
    ) {
      out.push(path);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, i) => markedStrings(item, path === "" ? String(i) : `${path}.${i}`, out));
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (key === "placeholders") continue;
      markedStrings(item, path === "" ? key : `${path}.${key}`, out);
    }
  }
}

/** Every path still awaiting the owner: the declared list plus any string carrying the marker. */
export function findPlaceholderPaths(manifest: {
  placeholders?: readonly string[];
  [key: string]: unknown;
}): string[] {
  const found = new Set<string>(manifest.placeholders ?? []);
  const marked: string[] = [];
  markedStrings(manifest, "", marked);
  for (const path of marked) found.add(path);
  return [...found].sort();
}

export const DEPLOY_ENVIRONMENTS = ["staging", "production"] as const;
export type DeployEnvironment = (typeof DEPLOY_ENVIRONMENTS)[number];

export interface CommandResult {
  code: 0 | 1;
  stdout: string;
  stderr: string;
}
