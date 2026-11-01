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
//
// #1217 — the two Resend keys (API key and From address) are no longer required: Cloudflare Email Service is
// the provider (a binding, not a key) and EMAIL_FROM is committed config in wrangler.toml [vars].
// RESEND_API_KEY stays pushable below for the Resend fallback (EMAIL_PROVIDER=resend).
// INBOUND_EMAIL_TOKEN authenticates workers/inbound-email to the app, so it also goes to that
// Worker (INBOUND_WORKER_ALSO).
const WORKER_SECRETS = [
  "DATABASE_URL",
  "INBOUND_EMAIL_TOKEN",
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
//
// #1323 — UK_LOCATION_REF_DATABASE_URL (pooled, read at runtime by lib/reference/) is optional
// here for the same reason: an older env file without it must still push. Its direct twin is the
// optional GitHub secret below.
//
// #1217 — RESEND_API_KEY (the Resend fallback), EMAIL_VERIFIED_DOMAINS and
// EMAIL_ALLOWED_RECIPIENTS are optional too: secrets rather than [vars] so a newly verified domain
// or tester needs no commit, and an unset allowlist simply sends nothing on staging.
const OPTIONAL_WORKER_SECRETS = [
  "RESEND_API_KEY",
  "EMAIL_VERIFIED_DOMAINS",
  "EMAIL_ALLOWED_RECIPIENTS",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "UK_LOCATION_REF_DATABASE_URL",
];

// #1323 — the reference database's DIRECT url, used by sync-reference-data.yml and the reference
// migrations. Optional so a file written before the reference database moved still pushes.
const OPTIONAL_GITHUB_ENV_SECRETS = ["UK_LOCATION_REF_DIRECT_URL"];

// #1323 — Worker secrets that a PRODUCTION GitHub workflow also reads: fill-product-images.yml
// (daily, `environment: production`) writes images with these. Pushing them to the Worker only
// would leave that job writing into the previous bucket after a move, silently. Already required
// as Worker secrets, so this only adds a second destination, and only for production — no
// staging workflow reads them.
const PRODUCTION_GITHUB_ALSO = [
  "S3_ENDPOINT",
  "S3_BUCKET",
  "S3_ACCESS_KEY",
  "S3_SECRET_KEY",
  "S3_REGION",
  "CDN_BASE_URL",
];

// #1217 — secrets the inbound-email Worker (workers/inbound-email) needs as well. Already
// required above; this adds a second destination.
const INBOUND_WORKER_ALSO = ["INBOUND_EMAIL_TOKEN"];
const INBOUND_WORKER_CONFIG = "workers/inbound-email/wrangler.toml";

const REQUIRED = [...GITHUB_ENV_SECRETS, ...WORKER_SECRETS];
const KNOWN = [...REQUIRED, ...OPTIONAL_WORKER_SECRETS, ...OPTIONAL_GITHUB_ENV_SECRETS];
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
const present = (k) => Boolean(values[k] && values[k].length > 0);
const optionalPresent = OPTIONAL_WORKER_SECRETS.filter(present);
const optionalGithubPresent = OPTIONAL_GITHUB_ENV_SECRETS.filter(present);
const productionGithubAlso = env === "production" ? PRODUCTION_GITHUB_ALSO : [];
const optionalAbsent = [...OPTIONAL_WORKER_SECRETS, ...OPTIONAL_GITHUB_ENV_SECRETS].filter(
  (k) => !present(k),
);
console.log(`✓ all ${REQUIRED.length} required variables present for "${env}" (source: ${file})`);

// #1323 — wrangler runs against the account THIS FILE names, never the machine's `wrangler login`
// or whatever the shell exports. A login on this machine pointed at an unrelated account, so
// Worker secrets meant for one account would silently have been written into another. wrangler
// prefers CLOUDFLARE_API_TOKEN/CLOUDFLARE_ACCOUNT_ID from its environment over a stored login.
const wranglerEnv = {
  ...process.env,
  CLOUDFLARE_ACCOUNT_ID: values.CLOUDFLARE_ACCOUNT_ID,
  CLOUDFLARE_API_TOKEN: values.CLOUDFLARE_API_TOKEN,
};
console.log(
  `  Cloudflare target: account …${values.CLOUDFLARE_ACCOUNT_ID.slice(-6)} (from ${file})`,
);
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
  for (const k of optionalGithubPresent) {
    console.log(`  ${k} → github env secret (${env}) [optional]`);
  }
  for (const k of productionGithubAlso) {
    console.log(`  ${k} → github env secret (${env}) [also: fill-product-images.yml]`);
  }
  for (const k of WORKER_SECRETS) console.log(`  ${k} → cloudflare worker secret (${env})`);
  for (const k of optionalPresent) {
    console.log(`  ${k} → cloudflare worker secret (${env}) [optional]`);
  }
  process.exit(0);
}

// --- Prerequisite auth checks --------------------------------------------
function check(cmd, argv, hint, childEnv = process.env) {
  const r = spawnSync(cmd, argv, {
    encoding: "utf8",
    shell: process.platform === "win32",
    env: childEnv,
  });
  if (r.status !== 0) die(`${cmd} not authenticated. ${hint}`);
}
check("gh", ["auth", "status"], "Run `gh auth login` (it will show a one-time device code).");
check(
  "npx",
  ["wrangler", "whoami"],
  `The CLOUDFLARE_API_TOKEN in ${file} was refused for account …${values.CLOUDFLARE_ACCOUNT_ID.slice(-6)}.`,
  wranglerEnv,
);

// --- Push each secret via stdin (value never in argv or logs) -------------
function setSecret(cmd, argv, value, label, childEnv = process.env) {
  const r = spawnSync(cmd, argv, {
    input: value,
    encoding: "utf8",
    shell: process.platform === "win32",
    env: childEnv,
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
for (const k of [...GITHUB_ENV_SECRETS, ...optionalGithubPresent, ...productionGithubAlso]) {
  const good = setSecret("gh", ["secret", "set", k, "--env", env], values[k], `${k} → github`);
  good ? ok++ : failed++;
}

console.log(
  `\nSetting Cloudflare Worker secrets (${env}, account …${values.CLOUDFLARE_ACCOUNT_ID.slice(-6)})…`,
);
for (const k of [...WORKER_SECRETS, ...optionalPresent]) {
  const good = setSecret(
    "npx",
    ["wrangler", "secret", "put", k, "--env", env],
    values[k],
    `${k} → worker`,
    wranglerEnv,
  );
  good ? ok++ : failed++;
}

console.log(`\nDone: ${ok} set, ${failed} failed.`);
process.exit(failed ? 1 : 0);
