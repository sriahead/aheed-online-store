import { readFileSync, existsSync } from "node:fs";
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
 * This script is the one command that answers "do these credentials actually work?".
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
 * Mint a new R2 API token in the Cloudflare dashboard and update BOTH secret stores — the files
 * (`.env`, `secrets/staging.vars`, `secrets/production.vars`) and the Worker runtime secrets
 * (`wrangler secret put S3_ACCESS_KEY --env <env>`, same for `S3_SECRET_KEY`) — then redeploy. A
 * file-only update leaves the deployed Workers on the old value; this is the same two-store trap
 * `CLAUDE.md` records for Neon password rotation.
 */

interface Target {
  label: string;
  path: string;
}

const TARGETS: Target[] = [
  { label: "dev", path: ".env" },
  { label: "staging", path: "secrets/staging.vars" },
  { label: "production", path: "secrets/production.vars" },
];

/** A key no bucket holds. Deliberately fixed rather than random, so nothing is ever created. */
const PROBE_KEY = "__verify-storage-credentials-does-not-exist";

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

  console.log(`\nAll ${outcomes.length} environment(s) accepted their credentials.`);
}

main().catch((cause) => {
  console.error("verify-storage-credentials failed:", cause);
  process.exitCode = 1;
});
