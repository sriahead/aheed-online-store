#!/usr/bin/env node
/**
 * configure-env.mjs — securely configure all required env vars for one environment.
 *
 * Usage:
 *   node scripts/configure-env.mjs <staging|production> [--dry-run] [--file <path>]
 *
 * Reads values from a gitignored per-environment file (default: secrets/<env>.vars,
 * KEY=value lines) and pushes each to the correct store:
 *   - GitHub *environment* secrets (consumed by CI deploy workflows)
 *   - Cloudflare *Worker* runtime secrets (consumed by the app at runtime)
 *
 * Security: values are piped to `gh`/`wrangler` via stdin — never placed in argv,
 * never printed. Only variable NAMES and ✓/✗ are logged. The input file is gitignored.
 *
 * Prerequisites (the script checks these): authenticated `gh` and `wrangler`.
 *   - `gh auth login`  (this is where GitHub issues the one-time device code)
 *   - `wrangler login`  (or CLOUDFLARE_API_TOKEN in your shell env)
 */
import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

// --- Which store each variable belongs to ---------------------------------
// GitHub environment secrets — read by .github/workflows/deploy-*.yml.
const GITHUB_ENV_SECRETS = ["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN", "DIRECT_URL"];

// Cloudflare Worker runtime secrets — read by the running app via lib/config.
// (BETTER_AUTH_URL and S3_REGION are required too, though not in the original
// request: BETTER_AUTH_URL is per-environment and OAuth/session break without it;
// S3_REGION is required by ADR-003's storage contract.)
const WORKER_SECRETS = [
  "DATABASE_URL",
  "RESEND_API_KEY",
  "RESEND_FROM_EMAIL",
  "BETTER_AUTH_SECRET",
  "BETTER_AUTH_URL",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "S3_ENDPOINT",
  "S3_BUCKET",
  "S3_ACCESS_KEY",
  "S3_SECRET_KEY",
  "S3_REGION",
  "CDN_BASE_URL",
];

// Cloudflare Worker runtime secrets that are genuinely OPTIONAL — pushed when present,
// never required. This mirrors the app's own contract: getPaymentService() falls back to
// the stub adapter when STRIPE_SECRET_KEY is unset, so an environment without Stripe is
// a supported state, not a misconfiguration. Listing them under WORKER_SECRETS would make
// them required and block configuring a fresh environment that has no Stripe yet.
//
// ⚠ STRIPE_WEBHOOK_SECRET is PER-ENDPOINT, not per-account. Each Stripe webhook endpoint
// has its own signing secret, so staging's value cannot verify deliveries to production's
// endpoint (and vice versa) — copying it between environments produces a webhook that
// fails signature verification on every delivery. Each secrets/<env>.vars must carry the
// secret belonging to THAT environment's endpoint.
const OPTIONAL_WORKER_SECRETS = ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"];

const REQUIRED = [...GITHUB_ENV_SECRETS, ...WORKER_SECRETS];
const KNOWN = [...REQUIRED, ...OPTIONAL_WORKER_SECRETS];
const VALID_ENVS = ["staging", "production"];

// --- Arg parsing ----------------------------------------------------------
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const fileFlagIdx = args.indexOf("--file");
// Index of --file's value (so it isn't mistaken for the positional env arg).
const fileValIdx = fileFlagIdx !== -1 ? fileFlagIdx + 1 : -1;
const positionals = args.filter((a, i) => !a.startsWith("--") && i !== fileValIdx);
const env = positionals[0];
const file = fileValIdx !== -1 ? args[fileValIdx] : `secrets/${env}.vars`;

function die(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

if (!VALID_ENVS.includes(env)) {
  die(`first argument must be one of: ${VALID_ENVS.join(", ")}  (got: ${env ?? "nothing"})`);
}
if (!existsSync(file)) {
  die(
    `input file not found: ${file}\n  Copy secrets/example.vars to ${`secrets/${env}.vars`} and fill it in (it is gitignored).`,
  );
}

// --- Parse KEY=value (quotes optional; # comments and blanks ignored) -----
const values = {};
for (const raw of readFileSync(file, "utf8").split(/\r?\n/)) {
  const line = raw.trim();
  if (!line || line.startsWith("#")) continue;
  const eq = line.indexOf("=");
  if (eq === -1) continue;
  const key = line.slice(0, eq).trim();
  let val = line.slice(eq + 1).trim();
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1);
  }
  values[key] = val;
}

// --- Validate completeness (names only; never values) ---------------------
const missing = REQUIRED.filter((k) => !values[k] || values[k].length === 0);
if (missing.length) {
  die(`missing/empty required variables in ${file}:\n  - ${missing.join("\n  - ")}`);
}
const extra = Object.keys(values).filter((k) => !KNOWN.includes(k));
if (extra.length) {
  console.warn(`! ignoring ${extra.length} unrecognized key(s): ${extra.join(", ")}`);
}
const optionalPresent = OPTIONAL_WORKER_SECRETS.filter((k) => values[k] && values[k].length > 0);
const optionalAbsent = OPTIONAL_WORKER_SECRETS.filter((k) => !optionalPresent.includes(k));
console.log(`✓ all ${REQUIRED.length} required variables present for "${env}" (source: ${file})`);
if (optionalPresent.length) {
  console.log(`  + ${optionalPresent.length} optional: ${optionalPresent.join(", ")}`);
}
if (optionalAbsent.length) {
  console.log(
    `  - ${optionalAbsent.length} optional not set (skipped): ${optionalAbsent.join(", ")}`,
  );
}

if (dryRun) {
  console.log("\n[dry-run] would set (no values shown):");
  for (const k of GITHUB_ENV_SECRETS) console.log(`  ${k} → github env secret (${env})`);
  for (const k of WORKER_SECRETS) console.log(`  ${k} → cloudflare worker secret (${env})`);
  for (const k of optionalPresent) {
    console.log(`  ${k} → cloudflare worker secret (${env}) [optional]`);
  }
  process.exit(0);
}

// --- Prerequisite auth checks --------------------------------------------
function check(cmd, argv, hint) {
  const r = spawnSync(cmd, argv, { encoding: "utf8", shell: process.platform === "win32" });
  if (r.status !== 0) die(`${cmd} not authenticated. ${hint}`);
}
check("gh", ["auth", "status"], "Run `gh auth login` (it will show a one-time device code).");
check("npx", ["wrangler", "whoami"], "Run `wrangler login`, or export CLOUDFLARE_API_TOKEN.");

// --- Push each secret via stdin (value never in argv or logs) -------------
function setSecret(cmd, argv, value, label) {
  const r = spawnSync(cmd, argv, {
    input: value,
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  if (r.status === 0) {
    console.log(`  ✓ ${label}`);
    return true;
  }
  // stderr from gh/wrangler does not echo the piped value; safe to show a trimmed hint.
  console.error(
    `  ✗ ${label} — ${(r.stderr || r.stdout || "unknown error").trim().split("\n")[0]}`,
  );
  return false;
}

let ok = 0;
let failed = 0;

console.log(`\nSetting GitHub environment secrets (${env})…`);
for (const k of GITHUB_ENV_SECRETS) {
  const good = setSecret("gh", ["secret", "set", k, "--env", env], values[k], `${k} → github`);
  good ? ok++ : failed++;
}

console.log(`\nSetting Cloudflare Worker secrets (${env})…`);
for (const k of [...WORKER_SECRETS, ...optionalPresent]) {
  const good = setSecret(
    "npx",
    ["wrangler", "secret", "put", k, "--env", env],
    values[k],
    `${k} → worker`,
  );
  good ? ok++ : failed++;
}

console.log(`\nDone: ${ok} set, ${failed} failed.`);
process.exit(failed ? 1 : 0);
