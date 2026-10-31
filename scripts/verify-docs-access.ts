import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { parseEnvFile } from "./lib/env-file";

/**
 * Refuse to publish the internal docs site unless Cloudflare Access guards it (#1328, P12).
 *
 *   npx tsx scripts/verify-docs-access.ts --pre  [--env-file secrets/merqify-staging.vars] [--config <toml>]
 *   npx tsx scripts/verify-docs-access.ts --post [--config <toml>]
 *
 * THE HAZARD THIS REMOVES. `kms/site-internal` serves ADRs, `CLAUDE.md` and operator runbooks and
 * has NO authentication of its own: a Cloudflare Access application in front of its host is the only
 * gate. `deploy-docs-internal.yml` runs `wrangler deploy` on every push to `staging` or `main` with
 * the `staging` environment's Cloudflare secrets, so the moment those secrets name an account where
 * no Access application covers the host, the next push publishes the docs to the open internet.
 * Before this script only the runbook's order of steps prevented that.
 *
 * TWO CHECKS, BECAUSE EACH MISSES WHAT THE OTHER CATCHES (owner, Gate 1, 2026-10-30).
 * `--pre` runs before the deploy and asks the Access API whether an application covers every route
 * host without letting everyone in; a failure means nothing is deployed. It never sees what a
 * visitor actually gets, so `--post` runs after the deploy and sends signed-out requests that must
 * be redirected to the Access login. `--post` alone would run after the docs were already public.
 *
 * The hosts are READ FROM THE ROUTES IT PROTECTS (`kms/site-internal/wrangler.toml`), never listed
 * here, so moving the docs to another host is guarded with no change to this file.
 *
 * Everything that decides is an exported pure function (`tests/docs-access-guard.test.ts`); `main()`
 * only does I/O. Progress and verdicts go to stderr. The API token is never printed.
 */

const DOCS_CONFIG = "kms/site-internal/wrangler.toml";
const API_BASE = "https://api.cloudflare.com/client/v4";
const PERMISSION = "Access: Apps and Policies Read";
/** Any page will do — Access answers before the Worker — but a real document proves the point. */
export const DEEP_LINK_PATH = "/dev/runbook/local-dev-playbook";
const PROBE_ATTEMPTS = 6;
const PROBE_DELAY_MS = 20_000;

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

/** The subset of a Cloudflare Access application this check reads. */
export interface AccessApp {
  name?: string;
  type?: string;
  domain?: string;
  self_hosted_domains?: string[];
  destinations?: { type?: string; uri?: string }[];
  policies?: { name?: string; decision?: string; include?: Record<string, unknown>[] }[];
}

/**
 * Every `pattern` in the docs Worker's config. That file has top-level `[[routes]]` only (no
 * `[env.*]` tables), so every pattern line is a route; there is no TOML dependency in this repo.
 */
export function parseDocsRoutePatterns(toml: string): string[] {
  return [...toml.matchAll(/^\s*pattern\s*=\s*["']([^"']+)["']/gm)].map((m) => m[1].toLowerCase());
}

/** Lower-case, no scheme, no trailing `/`. `H/*` is kept as written so the caller can read it. */
function normaliseEntry(entry: string): string {
  return entry
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");
}

/** Every hostname an application is configured for: `domain`, `self_hosted_domains`, public `destinations`. */
export function appHostnames(app: AccessApp): string[] {
  const entries = [
    app.domain,
    ...(app.self_hosted_domains ?? []),
    ...(app.destinations ?? []).filter((d) => (d.type ?? "public") === "public").map((d) => d.uri),
  ];
  return entries
    .filter((e): e is string => typeof e === "string" && e.trim() !== "")
    .map(normaliseEntry);
}

/**
 * Whether one configured hostname covers the WHOLE of `host`: exactly `host`, `host/*`, or a
 * one-label wildcard `*.<parent>` where `host` is `<label>.<parent>`. A path-scoped entry
 * (`host/admin`) does not, because every other path on the host would stay open.
 */
export function entryCoversHost(entry: string, host: string): boolean {
  const target = host.toLowerCase();
  const bare = entry.endsWith("/*") ? entry.slice(0, -2) : entry;
  if (bare.includes("/")) return false;
  if (bare === target) return true;
  if (bare.startsWith("*.")) {
    const parent = bare.slice(2);
    if (!target.endsWith(`.${parent}`)) return false;
    const label = target.slice(0, -(parent.length + 1));
    return label !== "" && !label.includes(".");
  }
  return false;
}

/** Why a covering application would let anyone in, or `null` if it would not. */
export function policyProblem(app: AccessApp): string | null {
  const policies = app.policies ?? [];
  const bypass = policies.find((p) => p.decision === "bypass");
  if (bypass) return `policy "${bypass.name ?? "unnamed"}" has decision bypass`;
  const everyone = policies.find(
    (p) => p.decision === "allow" && (p.include ?? []).some((rule) => "everyone" in rule),
  );
  if (everyone) return `policy "${everyone.name ?? "unnamed"}" allows everyone`;
  if (!policies.some((p) => p.decision === "allow")) return "it has no allow policy";
  return null;
}

export interface HostVerdict {
  host: string;
  ok: boolean;
  reasons: string[];
}

/**
 * A host passes only if at least one `self_hosted` application covers it and NO covering application
 * has a policy problem — a second, permissive application on the same host would still expose it.
 */
export function evaluateAccess(hosts: string[], apps: AccessApp[]): HostVerdict[] {
  return hosts.map((host) => {
    const covering = apps.filter(
      (app) =>
        app.type === "self_hosted" && appHostnames(app).some((e) => entryCoversHost(e, host)),
    );
    if (covering.length === 0) {
      return { host, ok: false, reasons: [`no Access application covers ${host}`] };
    }
    const reasons = covering.flatMap((app) => {
      const problem = policyProblem(app);
      return problem ? [`Access application "${app.name ?? "unnamed"}": ${problem}`] : [];
    });
    return { host, ok: reasons.length === 0, reasons };
  });
}

/** Every Access application on the account, page by page. Throws on anything but a clean answer. */
export async function fetchAccessApps(
  accountId: string,
  token: string,
  fetcher: Fetcher = fetch,
): Promise<AccessApp[]> {
  const apps: AccessApp[] = [];
  for (let page = 1; ; page++) {
    const url = `${API_BASE}/accounts/${accountId}/access/apps?page=${page}&per_page=100`;
    const response = await fetcher(url, { headers: { authorization: `Bearer ${token}` } });
    const body = (await response.json().catch(() => null)) as {
      success?: boolean;
      errors?: { message?: string }[];
      result?: AccessApp[];
      result_info?: { page?: number; total_pages?: number };
    } | null;
    if (response.status === 403) {
      throw new Error(
        `Cloudflare API refused the Access applications list (HTTP 403). The token needs the ` +
          `"${PERMISSION}" permission on this account.`,
      );
    }
    if (!response.ok || !body || body.success !== true || !Array.isArray(body.result)) {
      const detail = body?.errors?.map((e) => e.message).join("; ") || "no usable body";
      throw new Error(
        `Cloudflare API error listing Access applications (HTTP ${response.status}): ${detail}`,
      );
    }
    apps.push(...body.result);
    const totalPages = body.result_info?.total_pages ?? 1;
    if (page >= totalPages || body.result.length === 0) return apps;
  }
}

export type ProbeVerdict = "pass" | "public" | "retry";

/**
 * A signed-out response passes only as a redirect to the Access login. A 2xx means the docs are
 * being served openly, which no retry can make safe. Anything else (5xx, 404, a redirect elsewhere,
 * no `Location`) may be a custom domain still settling after its first deploy, so it is retried.
 */
export function classifyProbe(status: number, location: string | null): ProbeVerdict {
  if (status >= 200 && status < 300) return "public";
  if ([301, 302, 303, 307, 308].includes(status) && location) {
    try {
      if (new URL(location).hostname.toLowerCase().endsWith(".cloudflareaccess.com")) return "pass";
    } catch {
      // an unparseable Location is not a redirect to Access
    }
  }
  return "retry";
}

export interface ProbeResult {
  url: string;
  verdict: ProbeVerdict;
  detail: string;
}

/** One URL: retried on `retry`, never on `public`. The last attempt's verdict stands. */
export async function probeUrl(
  url: string,
  fetcher: Fetcher = fetch,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  attempts = PROBE_ATTEMPTS,
  delayMs = PROBE_DELAY_MS,
): Promise<ProbeResult> {
  let last: ProbeResult = { url, verdict: "retry", detail: "not attempted" };
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetcher(url, { redirect: "manual" });
      const location = response.headers.get("location");
      const verdict = classifyProbe(response.status, location);
      last = {
        url,
        verdict,
        detail: `HTTP ${response.status}${location ? ` -> ${location}` : ""}`,
      };
    } catch (error) {
      last = {
        url,
        verdict: "retry",
        detail: `network error: ${error instanceof Error ? error.message : error}`,
      };
    }
    if (last.verdict !== "retry") return last;
    if (attempt < attempts) {
      console.error(`  ${url}: ${last.detail}; retrying (${attempt}/${attempts})`);
      await sleep(delayMs);
    }
  }
  return last;
}

function usage(): never {
  console.error(
    "usage: npx tsx scripts/verify-docs-access.ts (--pre | --post) [--config <wrangler.toml>] [--env-file <vars file>]\n" +
      "  --pre   before deploy: an Access application must guard every route host\n" +
      "  --post  after deploy: signed-out requests must redirect to the Access login",
  );
  process.exit(1);
}

function flagValue(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  if (i < 0) return undefined;
  const value = args[i + 1];
  if (!value || value.startsWith("--")) usage();
  return value;
}

async function runPre(hosts: string[], envFile: string | undefined): Promise<boolean> {
  const source = envFile ? parseEnvFile(envFile) : process.env;
  const accountId = source.CLOUDFLARE_ACCOUNT_ID?.trim();
  const token = source.CLOUDFLARE_API_TOKEN?.trim();
  for (const [name, value] of [
    ["CLOUDFLARE_ACCOUNT_ID", accountId],
    ["CLOUDFLARE_API_TOKEN", token],
  ] as const) {
    if (!value) {
      console.error(
        `FAIL  ${name} is empty${envFile ? ` in ${envFile}` : ""} — cannot ask the Access API.`,
      );
      return false;
    }
  }
  console.error(`Access check: account …${accountId!.slice(-6)}, ${hosts.length} host(s)`);
  const apps = await fetchAccessApps(accountId!, token!);
  const verdicts = evaluateAccess(hosts, apps);
  for (const v of verdicts) {
    if (v.ok) console.error(`  OK    ${v.host} is guarded by Cloudflare Access`);
    else for (const reason of v.reasons) console.error(`  FAIL  ${v.host}: ${reason}`);
  }
  if (verdicts.every((v) => v.ok)) return true;
  console.error(
    "\nRefusing to deploy: the internal docs have no authentication of their own, so publishing them " +
      "without Access puts them on the open internet. Create or fix the self-hosted Access application " +
      'for the host(s) above (docs/developer-portal/env-setup.md, "Merqify account").',
  );
  return false;
}

async function runPost(hosts: string[]): Promise<boolean> {
  const urls = hosts.flatMap((h) => [`https://${h}/`, `https://${h}${DEEP_LINK_PATH}`]);
  let ok = true;
  for (const url of urls) {
    const result = await probeUrl(url);
    if (result.verdict === "pass") {
      console.error(`  OK    ${url}: ${result.detail}`);
      continue;
    }
    ok = false;
    if (result.verdict === "public") {
      console.error(
        `  FAIL  ${url}: ${result.detail} — THE INTERNAL DOCS ARE PUBLICLY SERVED. Remove the custom ` +
          `domain ${new URL(url).hostname} from the aheed-kms-internal Worker now (dashboard: Workers > ` +
          "aheed-kms-internal > Settings > Domains & Routes), then fix the Access application.",
      );
    } else {
      console.error(`  FAIL  ${url}: ${result.detail} — not a redirect to the Access login`);
    }
  }
  return ok;
}

async function main() {
  const args = process.argv.slice(2);
  const pre = args.includes("--pre");
  const post = args.includes("--post");
  if (pre === post) usage();

  const config = flagValue(args, "--config") ?? DOCS_CONFIG;
  const hosts = parseDocsRoutePatterns(readFileSync(config, "utf8"));
  if (hosts.length === 0) {
    console.error(
      `FAIL  ${config} declares no route pattern — nothing to check, so nothing is proven.`,
    );
    process.exit(1);
  }

  const passed = pre ? await runPre(hosts, flagValue(args, "--env-file")) : await runPost(hosts);
  if (!passed) process.exit(1);
  console.error(
    pre
      ? "OK  every docs host is guarded by Cloudflare Access"
      : "OK  every docs URL redirects to the Access login",
  );
}

// Only when run as a script: the test imports the pure functions above.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`FAIL  ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  });
}
