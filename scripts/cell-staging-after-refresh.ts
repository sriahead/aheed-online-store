import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { readVar } from "./aheed-data-inventory";

/**
 * #1512 — put back a dedicated cell's STAGING-specific rows after its staging database has been
 * refreshed from production (Neon: the staging branch "Reset from parent").
 *
 *   npx tsx scripts/cell-staging-after-refresh.ts <secrets file> <URL key> --domain <client domain>
 *   npx tsx scripts/cell-staging-after-refresh.ts … --domain aheedfoodcentre.co.uk --apply --confirm-host <db host>
 *   e.g. secrets/afc-staging.vars AFC_DIRECT_URL --domain aheedfoodcentre.co.uk
 *
 * A copy of production carries production's hosts and addresses. Four kinds of row differ per
 * environment and are rewritten from the production form to the staging form:
 *   - VendorDomain.host                 www.<domain>          → staging.<domain>
 *   - VendorConfig.senderEmail          <local>@<domain>      → <local>@staging.<domain>
 *   - VendorInboundAddress.address      <local>@<domain>      → <local>@staging.<domain>
 *   - HealthCheck.label                 <label>               → <label>-staging (what /api/health shows)
 * Left alone: contactEmail (the real shop mailbox customers write to), order-alert recipients (staging
 * only mails EMAIL_ALLOWED_RECIPIENTS, #1490), and everything else.
 *
 * Not optional after a refresh: deploy-staging's route check (#1198) compares VendorDomain against the
 * afc-staging routes, so a staging database still naming www.<domain> fails the next staging deploy,
 * and staging's emails would link to production.
 *
 * Dry run by default; idempotent (an already-staging value is left as it is). `--apply` needs
 * `--confirm-host`, and the script REFUSES a database whose host appears in the production secrets
 * file next to the given one, so it can never rewrite production.
 */

export function toStagingHost(host: string, domain: string): string {
  return host === `www.${domain}` || host === domain ? `staging.${domain}` : host;
}

export function toStagingEmail(email: string, domain: string): string {
  const at = email.lastIndexOf("@");
  if (at < 0) return email;
  return email.slice(at + 1).toLowerCase() === domain.toLowerCase()
    ? `${email.slice(0, at)}@staging.${domain}`
    : email;
}

/** A copied HealthCheck label (`afc-dedicated-cell`) gets the staging suffix /api/health shows on staging. */
export function toStagingLabel(label: string): string {
  return label === "ok" || label.endsWith("-staging") ? label : `${label}-staging`;
}

export function parseArgs(argv: readonly string[]) {
  const [file, key] = argv;
  const at = (flag: string) => (argv.indexOf(flag) >= 0 ? argv[argv.indexOf(flag) + 1] : undefined);
  return {
    file,
    key,
    domain: at("--domain"),
    apply: argv.includes("--apply"),
    confirmHost: at("--confirm-host"),
  };
}

async function main() {
  const { file, key, domain, apply, confirmHost } = parseArgs(process.argv.slice(2));
  if (!file || !key || !domain) {
    throw new Error(
      "usage: cell-staging-after-refresh.ts <secrets file> <URL key> --domain <client domain> [--apply --confirm-host <db host>]",
    );
  }
  const url = readVar(file, key);
  if (!url) throw new Error(`${key} not found in ${file}`);
  const host = new URL(url).hostname;
  console.log(`database host: ${host}`);
  const prodFile = file.replace(/staging(\.vars)$/, "production$1");
  const prodUrl = prodFile !== file ? readVar(prodFile, key) : undefined;
  if (prodUrl && new URL(prodUrl).hostname === host) {
    throw new Error(`REFUSED: ${host} is the PRODUCTION database (${prodFile})`);
  }
  console.log(apply ? "MODE: APPLY" : "MODE: dry run (writes nothing)");
  if (apply && confirmHost !== host) {
    throw new Error(`--apply needs --confirm-host ${host} (got ${confirmHost ?? "nothing"})`);
  }

  const p = new PrismaClient({ adapter: new PrismaNeon({ connectionString: url }) });
  try {
    const [domains, configs, inbound, checks] = await Promise.all([
      p.vendorDomain.findMany({ select: { id: true, host: true } }),
      p.vendorConfig.findMany({ select: { id: true, senderEmail: true } }),
      p.vendorInboundAddress.findMany({ select: { id: true, address: true } }),
      p.healthCheck.findMany({ select: { id: true, label: true } }),
    ]);
    const labelChanges = checks
      .map((h) => ({ id: h.id, from: h.label, to: toStagingLabel(h.label) }))
      .filter((c) => c.from !== c.to);
    const domainChanges = domains
      .map((d) => ({ id: d.id, from: d.host, to: toStagingHost(d.host, domain) }))
      .filter((c) => c.from !== c.to);
    const senderChanges = configs
      .map((c) => ({ id: c.id, from: c.senderEmail, to: toStagingEmail(c.senderEmail, domain) }))
      .filter((c) => c.from !== c.to);
    const inboundChanges = inbound
      .map((a) => ({ id: a.id, from: a.address, to: toStagingEmail(a.address, domain) }))
      .filter((c) => c.from !== c.to);

    for (const c of domainChanges) console.log(`  VendorDomain.host       ${c.from} → ${c.to}`);
    for (const c of senderChanges) console.log(`  VendorConfig.sender     ${c.from} → ${c.to}`);
    for (const c of inboundChanges) console.log(`  InboundAddress.address ${c.from} → ${c.to}`);
    for (const c of labelChanges) console.log(`  HealthCheck.label      ${c.from} → ${c.to}`);
    const total =
      domainChanges.length + senderChanges.length + inboundChanges.length + labelChanges.length;
    if (total === 0) {
      console.log("nothing to change: already in the staging form");
      return;
    }
    if (!apply) {
      console.log(`\ndry run only (${total} change(s)). To apply: --apply --confirm-host ${host}`);
      return;
    }
    await p.$transaction(async (tx) => {
      for (const c of domainChanges)
        await tx.vendorDomain.update({ where: { id: c.id }, data: { host: c.to } });
      for (const c of senderChanges)
        await tx.vendorConfig.update({ where: { id: c.id }, data: { senderEmail: c.to } });
      for (const c of inboundChanges)
        await tx.vendorInboundAddress.update({ where: { id: c.id }, data: { address: c.to } });
      for (const c of labelChanges)
        await tx.healthCheck.update({ where: { id: c.id }, data: { label: c.to } });
    });
    console.log(`\nAPPLIED ${total} change(s)`);
  } finally {
    await p.$disconnect();
  }
}

if (process.argv[1]?.endsWith("cell-staging-after-refresh.ts")) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
