/**
 * #1564 R9 — renders every customer email template into one HTML gallery for sign-off.
 *
 *   npm run email:preview -- --vars <secrets file> --vendor <slug> --out <file.html>
 *
 * With `--vars`, the store's real branding (name, mark, colours, address, canonical host) and three
 * of its real product names are read READ-ONLY from the database named by `AFC_DATABASE_URL` or
 * `DATABASE_URL` in that file. Without it, the neutral fallback brand and placeholder items are
 * used. The mark is embedded as a data URI so the gallery renders offline. Nothing is sent.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { emailBrandFrom, type EmailBrand } from "../lib/email/layout/brand";
import { fallbackBrand } from "../lib/email/layout/fallback";
import { DEFAULT_PLATFORM_NAME, DEFAULT_PLATFORM_URL } from "../lib/platform-defaults";
import { escapeHtml } from "../lib/html-escape";
import { TEMPLATE_KEYS } from "../lib/email/templates/registry";
import { renderSample } from "../lib/email/templates/samples";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

function readVars(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

async function dataUri(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "image/png";
    return `data:${type};base64,${Buffer.from(await res.arrayBuffer()).toString("base64")}`;
  } catch {
    return null;
  }
}

async function loadStore(): Promise<{ brand: EmailBrand; products: string[] }> {
  const varsPath = arg("vars");
  const slug = arg("vendor");
  if (!varsPath || !slug) {
    return { brand: fallbackBrand("Your Store", "https://shop.example"), products: [] };
  }
  const vars = readVars(varsPath);
  const url = vars.AFC_DATABASE_URL ?? vars.DATABASE_URL;
  if (!url) throw new Error(`no AFC_DATABASE_URL or DATABASE_URL in ${varsPath}`);
  console.log("database host:", url.replace(/.*@([^:/?]+).*/, "$1"));
  const sql = neon(url);
  const [v] = await sql.query(
    `select v.id, c."senderName", b."markStorageKey", b."brandGreenDark", b."brandCream"
       from "Vendor" v join "VendorConfig" c on c."vendorId" = v.id
       left join "VendorBranding" b on b."vendorId" = v.id
      where v.slug = $1`,
    [slug],
  );
  if (!v) throw new Error(`no vendor with slug ${slug}`);
  const [loc] = await sql.query(
    `select "addressLine1", "addressLine2", city, postcode from "VendorLocation" where "vendorId" = $1`,
    [v.id],
  );
  const hosts = await sql.query(
    `select host from "VendorDomain" where "vendorId" = $1 and "isCanonical" order by host`,
    [v.id],
  );
  const products = await sql.query(
    `select name from "Product" where "vendorId" = $1 and "isActive" order by "basePrice" desc limit 3`,
    [v.id],
  );
  const brand = emailBrandFrom({
    storeName: v.senderName,
    markStorageKey: v.markStorageKey,
    primaryHex: v.brandGreenDark,
    backgroundHex: v.brandCream,
    location: (loc as Parameters<typeof emailBrandFrom>[0]["location"]) ?? null,
    cdnBaseUrl: vars.CDN_BASE_URL ?? null,
    siteUrl: hosts[0] ? `https://${hosts[0].host}` : null,
    platformName: DEFAULT_PLATFORM_NAME,
    platformUrl: DEFAULT_PLATFORM_URL,
  });
  if (brand.markUrl) brand.markUrl = (await dataUri(brand.markUrl)) ?? brand.markUrl;
  return { brand, products: products.map((p) => String(p.name)) };
}

async function main() {
  const out = arg("out") ?? "email-preview.html";
  const { brand, products } = await loadStore();
  const store = brand.storeName;
  const emails = TEMPLATE_KEYS.map((key) => ({
    key,
    email: renderSample(key, brand, null, products),
  }));

  const cards = emails
    .map(
      ({ key, email }) => `<section class="card" id="${key}">
  <header><code>${escapeHtml(key)}</code><h2>${escapeHtml(email.subject)}</h2><p class="pre">${escapeHtml(email.preheader)}</p></header>
  <div class="frames">
    <figure><figcaption>Desktop</figcaption><iframe title="${key} desktop" style="width:640px" srcdoc="${escapeHtml(email.html)}"></iframe></figure>
    <figure><figcaption>Phone</figcaption><iframe title="${key} phone" style="width:375px" srcdoc="${escapeHtml(email.html)}"></iframe></figure>
  </div>
  <details><summary>Plain-text version</summary><pre>${escapeHtml(email.text)}</pre></details>
</section>`,
    )
    .join("\n");

  writeFileSync(
    out,
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Email Templates Preview</title>
<style>
:root{--bg:#f4f5f7;--fg:#111827;--muted:#6b7280;--card:#fff;--line:#e5e7eb}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#0f172a;--fg:#f3f4f6;--muted:#9ca3af;--card:#1e293b;--line:#334155}}
:root[data-theme="dark"]{--bg:#0f172a;--fg:#f3f4f6;--muted:#9ca3af;--card:#1e293b;--line:#334155}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 -apple-system,Segoe UI,Roboto,Arial,sans-serif}
main{max-width:1120px;margin:0 auto;padding:24px 16px}
h1{font-size:24px;margin:0 0 4px}.lede{color:var(--muted);margin:0 0 20px}
nav{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 24px}nav a{font-size:12px;padding:4px 8px;border:1px solid var(--line);border-radius:999px;color:var(--fg);text-decoration:none}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px;margin:0 0 24px}
.card header code{font-size:12px;color:var(--muted)}.card h2{font-size:18px;margin:4px 0}.pre{color:var(--muted);margin:0 0 12px;font-size:13px}
.frames{display:flex;gap:16px;overflow-x:auto}figure{margin:0}figcaption{font-size:12px;color:var(--muted);margin:0 0 4px}
iframe{height:900px;border:1px solid var(--line);border-radius:8px;background:#fff;max-width:calc(100vw - 64px)}
pre{white-space:pre-wrap;font-size:12px;background:var(--bg);padding:12px;border-radius:8px}
</style></head><body><main>
<h1>${escapeHtml(store)} email templates</h1>
<p class="lede">Every customer email in the new design, with sample data. Subject in bold, preview line beneath. Nothing here is sent.</p>
<nav>${emails.map(({ key }) => `<a href="#${key}">${escapeHtml(key)}</a>`).join("")}</nav>
${cards}
</main></body></html>`,
  );
  console.log(`wrote ${emails.length} emails to ${out}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
