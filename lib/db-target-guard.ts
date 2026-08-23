/**
 * A pure check that a destructive maintenance script is pointed at a database
 * it is allowed to write to (#273, P8.1b).
 *
 * WHY THIS IS A SEPARATE, PURE MODULE
 *
 * The guard's whole value is that it refuses staging and production, and the
 * only honest way to demonstrate that is a unit test — pointing a real deletion
 * script at staging "to see it refuse" risks the exact outcome the guard exists
 * to prevent, and a guard that has never been observed refusing anything is a
 * comment, not a control.
 *
 * It compares HOSTS, deliberately, not file names or flags. `CLAUDE.md` records
 * the P5a incident where `.env` and `.dev.vars` agreed perfectly with each other
 * and both pointed at production while the surrounding config in the same file
 * said staging: "a 'staging-sounding' file is not evidence the DB host is
 * staging; only the host is."
 *
 * Neon's pooled and direct URLs differ only by a `-pooler` suffix on the host,
 * so both forms normalise to the same endpoint id before comparison — otherwise
 * a script handed a pooled production URL would sail past a guard holding only
 * the direct one.
 */

/** The endpoint identity of a Neon URL: host with any `-pooler` suffix removed. */
export function neonEndpoint(url: string): string | null {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return null;
  }
  if (host === "") return null;
  return host.toLowerCase().replace(/-pooler(?=\.|$)/, "");
}

export type TargetVerdict =
  { allowed: true; endpoint: string } | { allowed: false; reason: string };

/**
 * Decide whether `targetUrl` may be written to.
 *
 * `forbiddenUrls` are the connection strings this script must never touch —
 * in practice whatever `secrets/staging.vars` and `secrets/production.vars`
 * hold. An unparseable target is refused rather than allowed: a guard that
 * fails open is worse than none, because it reads as protection.
 */
export function checkDestructiveTarget(
  targetUrl: string | undefined,
  forbiddenUrls: { label: string; url: string | undefined }[],
): TargetVerdict {
  if (!targetUrl) {
    return { allowed: false, reason: "No target URL provided (is DIRECT_URL set?)" };
  }

  const target = neonEndpoint(targetUrl);
  if (!target) {
    return { allowed: false, reason: `Target URL is not a parseable connection string` };
  }

  for (const forbidden of forbiddenUrls) {
    const endpoint = forbidden.url ? neonEndpoint(forbidden.url) : null;
    if (endpoint && endpoint === target) {
      return {
        allowed: false,
        reason: `Target endpoint ${target} is ${forbidden.label} — refusing to write.`,
      };
    }
  }

  return { allowed: true, endpoint: target };
}
