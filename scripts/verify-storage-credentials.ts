import { readFileSync, existsSync } from "node:fs";
import { basename } from "node:path";
import { AwsClient } from "aws4fetch";
import { parse as parseDotenv } from "dotenv";

/**
 * Verify each environment's R2 (S3-compatible) credentials — `npx tsx scripts/verify-storage-credentials.ts`.
 *
 * ## Why this exists
 *
 * `#749` reported "the vendor logo upload fails with no diagnosable message". The real cause turned
 * out to be much larger and entirely invisible from the application: the S3 credential pair is
 * REJECTED, and all three environments share one pair. Every `getStorage()` caller that touches the
 * S3 API — product images, bundle images, campaign banners, the AI campaign-image route, the vendor
 * logo, `lib/product-image-pipeline.ts` — therefore fails everywhere, while the storefront looks
 * perfectly healthy because `publicUrl()` is pure string composition over `CDN_BASE_URL` and reads
 * go to the CDN, not the API.
 *
 * Nothing in `lint`, `typecheck`, `test` or `build` can see this, and `/api/health` reports
 * `storage: { configured: true }` — which only means the variables are present, not that they work.
 *
 * ## What this covers, and what it does not (#780)
 *
 * The credential lives in TWO stores per environment: the env FILE, and the deployed Worker's own
 * secret set. This script probes the files, and separately reports whether each deployed Worker is
 * running its newest version — because Cloudflare bakes secret values into an immutable version, so
 * a Worker whose newest version was never deployed is still serving the OLD credential no matter
 * what the file says.
 *
 * It still cannot read a deployed secret's VALUE — nothing can. A Worker reported `IN SYNC` proves
 * the newest version is live, not that the newest version carries the key you think it does. The
 * only complete proof remains a real upload through the deployed environment.
 *
 * This distinction is not academic: on 2026-09-16 this script reported ACCEPTED for all three
 * environments while both deployed Workers served a revoked key (#755), because the new values sat
 * in versions that had been created through the dashboard and never deployed.
 *
 * ## Why it is read-only
 *
 * It sends a `HEAD` for a key that does not exist. A working credential pair gets `404` (no such
 * object); a rejected one gets `403` before the object is ever looked up. Nothing is written,
 * overwritten or deleted in any environment — which is what makes it safe to point at production.
 *
 * ## Why it is NOT wired into CI
 *
 * It exits non-zero while any environment's credentials are rejected, which is the point of it.
 * Adding it to `quality.yml` would fail every build until the rotation happens, and that job
 * carries no S3 secrets to check with anyway. This is a command a human runs.
 *
 * ## If it reports a rejection
 *
 * Mint a new R2 API token in the Cloudflare dashboard and update BOTH secret stores — all FOUR
 * files (`.env`, `.dev.vars`, `secrets/staging.vars`, `secrets/production.vars`) and the Worker
 * runtime secrets (`wrangler secret put S3_ACCESS_KEY --env <env>`, same for `S3_SECRET_KEY`) —
 * then redeploy. A file-only update leaves the deployed Workers on the old value; this is the same
 * two-store trap `CLAUDE.md` records for Neon password rotation.
 *
 * `.dev.vars` is easy to miss and is the file that wins under `npm run preview`, so forgetting it
 * leaves local preview broken while every other environment looks fine.
 *
 * Prefer `node scripts/configure-env.mjs <env>` over a dashboard edit: it writes through
 * `wrangler secret put`, which deploys as it goes. A secret edited in the dashboard creates a
 * version that is NOT deployed, which both hides the old value behind a healthy-looking file and
 * makes the next `wrangler secret put` — the first step of both deploy workflows — fail outright.
 */

interface Target {
  label: string;
  path: string;
  /**
   * The deployed Worker this file's credentials are supposed to be live on, when there is one.
   *
   * Only staging and production have a deployed Worker. `.env` and `.dev.vars` configure local
   * runs — `.env` carries no `CLOUDFLARE_API_TOKEN` at all — so there is nothing to compare for
   * them and the version check is skipped rather than reported as unknown.
   */
  worker?: string;
}

const TARGETS: Target[] = [
  { label: "dev", path: ".env" },
  // #780 — `.dev.vars` was absent from this list, and per CLAUDE.md's config-precedence rule it is
  // the file that WINS under `npm run preview`. A rotation that updated `.env` and forgot this one
  // passed cleanly while local preview stayed broken.
  { label: "dev.vars", path: ".dev.vars" },
  { label: "staging", path: "secrets/staging.vars", worker: "aheed-store-staging" },
  { label: "production", path: "secrets/production.vars", worker: "aheed-store-production" },
];

/** A key no bucket holds. Deliberately fixed rather than random, so nothing is ever created. */
const PROBE_KEY = "__verify-storage-credentials-does-not-exist";

/**
 * What a Worker's deployed version tells us about whether a rotation actually landed (#780).
 *
 * - `in-sync`  — the newest version IS the deployed one, so a secret written to this Worker is live.
 * - `stale`    — a newer version exists that was never deployed. This is the state that made #755
 *                invisible: the files held the new credential, the script said ACCEPTED, and the
 *                running Worker went on serving the revoked one.
 * - `unknown`  — the lookup itself did not succeed. Deliberately distinct from `stale`.
 */
export type VersionState = "in-sync" | "stale" | "unknown";

/**
 * Decide a Worker's version state (#780, R4/R5).
 *
 * Pure on purpose — no network, no filesystem — so the property that actually matters can be
 * unit-tested: **an unreachable API must never be reported as a mismatch.** This machine produced
 * transient `fetch failed` errors repeatedly while #755 was being diagnosed, and a check that
 * turned a flaky network into "your credentials are not live" would be worse than no check at all.
 *
 * Note the ordering: `lookupOk` is tested FIRST, so a failed lookup returns `unknown` even when the
 * two ids differ (which they trivially do when both are null).
 */
export function workerVersionState(
  deployedId: string | null,
  newestId: string | null,
  lookupOk: boolean,
): VersionState {
  if (!lookupOk || !deployedId || !newestId) return "unknown";
  return deployedId === newestId ? "in-sync" : "stale";
}

interface VersionLookup {
  ok: boolean;
  deployedId: string | null;
  newestId: string | null;
  detail: string;
}

/**
 * Read a Worker's deployed version id and its newest version id from the Cloudflare REST API.
 *
 * `wrangler secret list` cannot answer this — it reports the SCRIPT's secrets, not the RUNNING
 * version's bindings (CLAUDE.md, #767/#771). Reading the deployment is the only way to tell.
 *
 * Never throws: every failure is folded into `ok: false` so the caller can report `unknown`.
 */
async function lookupWorkerVersions(
  accountId: string,
  apiToken: string,
  script: string,
): Promise<VersionLookup> {
  const base = `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${script}`;
  const headers = { Authorization: `Bearer ${apiToken}` };
  const empty = { deployedId: null, newestId: null };

  try {
    const deploymentsRes = await fetch(`${base}/deployments`, { headers });
    if (!deploymentsRes.ok) {
      return { ok: false, ...empty, detail: `deployments returned ${deploymentsRes.status}` };
    }
    const deployments: any = await deploymentsRes.json();
    const deployedId = deployments?.result?.deployments?.[0]?.versions?.[0]?.version_id ?? null;

    const versionsRes = await fetch(`${base}/versions?per_page=1`, { headers });
    if (!versionsRes.ok) {
      return { ok: false, ...empty, detail: `versions returned ${versionsRes.status}` };
    }
    const versions: any = await versionsRes.json();
    const newestId = versions?.result?.items?.[0]?.id ?? null;

    if (!deployedId || !newestId) {
      return { ok: false, ...empty, detail: "response did not carry both version ids" };
    }
    return { ok: true, deployedId, newestId, detail: "" };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "network error";
    return { ok: false, ...empty, detail: message };
  }
}

interface Outcome {
  label: string;
  bucket: string;
  status: number | null;
  verdict: string;
  ok: boolean;
}

async function probe(target: Target): Promise<Outcome | null> {
  if (!existsSync(target.path)) {
    console.log(`${target.label.padEnd(11)} ${target.path} not present — skipped`);
    return null;
  }

  const vars = parseDotenv(readFileSync(target.path));
  const missing = ["S3_ACCESS_KEY", "S3_SECRET_KEY", "S3_ENDPOINT", "S3_BUCKET"].filter(
    (key) => !vars[key],
  );
  if (missing.length > 0) {
    console.log(`${target.label.padEnd(11)} missing ${missing.join(", ")} — skipped`);
    return null;
  }

  const client = new AwsClient({
    accessKeyId: vars.S3_ACCESS_KEY,
    secretAccessKey: vars.S3_SECRET_KEY,
    service: "s3",
    region: vars.S3_REGION || "auto",
  });

  let status: number | null = null;
  try {
    const res = await client.fetch(`${vars.S3_ENDPOINT}/${vars.S3_BUCKET}/${PROBE_KEY}`, {
      method: "HEAD",
    });
    status = res.status;
  } catch (cause) {
    return {
      label: target.label,
      bucket: vars.S3_BUCKET,
      status: null,
      verdict: `unreachable: ${cause instanceof Error ? cause.message : "network error"}`,
      ok: false,
    };
  }

  // 404 is the success case: the credential was accepted and the object genuinely is not there.
  if (status === 404) {
    return {
      label: target.label,
      bucket: vars.S3_BUCKET,
      status,
      verdict: "credentials ACCEPTED",
      ok: true,
    };
  }
  if (status === 403) {
    return {
      label: target.label,
      bucket: vars.S3_BUCKET,
      status,
      verdict: "credentials REJECTED — every image upload in this environment is failing",
      ok: false,
    };
  }
  return {
    label: target.label,
    bucket: vars.S3_BUCKET,
    status,
    verdict: "unexpected status — investigate before trusting this environment",
    ok: false,
  };
}

async function main(): Promise<void> {
  console.log("Probing each environment's S3 credentials with a read-only HEAD.\n");

  const outcomes: Outcome[] = [];
  for (const target of TARGETS) {
    const outcome = await probe(target);
    if (!outcome) continue;
    outcomes.push(outcome);
    const status = outcome.status === null ? "---" : String(outcome.status);
    console.log(
      `${outcome.label.padEnd(11)} bucket=${outcome.bucket.padEnd(26)} ${status.padEnd(4)} ${outcome.verdict}`,
    );
  }

  // #780 — the credential lives in TWO stores, and everything above this line reads only the
  // first. A file can hold a perfectly good key while the deployed Worker serves the old one,
  // which is exactly how #755 stayed invisible. This reports the second store.
  let anyStale = false;
  const withWorkers = TARGETS.filter((target) => target.worker && existsSync(target.path));

  if (withWorkers.length > 0) {
    console.log("\nChecking whether each deployed Worker is running its newest version.");

    for (const target of withWorkers) {
      const vars = parseDotenv(readFileSync(target.path));
      const accountId = vars.CLOUDFLARE_ACCOUNT_ID;
      const apiToken = vars.CLOUDFLARE_API_TOKEN;

      if (!accountId || !apiToken) {
        console.log(
          `${target.label.padEnd(11)} ${target.worker} — no CLOUDFLARE_ACCOUNT_ID/CLOUDFLARE_API_TOKEN in ${target.path}, version check skipped`,
        );
        continue;
      }

      const lookup = await lookupWorkerVersions(accountId, apiToken, target.worker!);
      const state = workerVersionState(lookup.deployedId, lookup.newestId, lookup.ok);

      if (state === "unknown") {
        console.log(
          `${target.label.padEnd(11)} ${target.worker} — version check could NOT run (${lookup.detail}); this is not a failure`,
        );
        continue;
      }

      const ids = `deployed=${lookup.deployedId!.slice(0, 8)} newest=${lookup.newestId!.slice(0, 8)}`;
      if (state === "in-sync") {
        console.log(`${target.label.padEnd(11)} ${target.worker} — ${ids} IN SYNC`);
      } else {
        anyStale = true;
        console.log(`${target.label.padEnd(11)} ${target.worker} — ${ids} STALE`);
      }
    }
  }

  if (anyStale) {
    console.log(
      `\nAt least one Worker is NOT running its newest version, so a secret written to it is` +
        `\nnot live yet — whatever the files above say. A dashboard secret edit creates a version` +
        `\nwithout deploying it. Recover with:` +
        `\n  npx wrangler versions deploy <version-id>@100 --env <staging|production>`,
    );
    process.exitCode = 1;
  }

  const rejected = outcomes.filter((outcome) => !outcome.ok);
  if (rejected.length > 0) {
    console.log(
      `\n${rejected.length} of ${outcomes.length} environment(s) could not use their credentials.` +
        `\nSee this file's header for the rotation steps — BOTH the *.vars files and the Worker` +
        `\nruntime secrets have to be updated, then the Worker redeployed.`,
    );
    process.exitCode = 1;
    return;
  }

  if (anyStale) return;

  console.log(
    `\nAll ${outcomes.length} environment(s) accepted their credentials, and every deployed` +
      `\nWorker checked is running its newest version.`,
  );
}

/**
 * Run only when invoked directly, so a test can import `workerVersionState` without the whole
 * script executing on import (#780, R4/R8).
 */
const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url.endsWith(basename(process.argv[1]));

if (invokedDirectly) {
  main().catch((cause) => {
    console.error("verify-storage-credentials failed:", cause);
    process.exitCode = 1;
  });
}
