import { escapeHtml } from "@/lib/html-escape";
import type { EmailBrand } from "./brand";

/**
 * #1564 R1/R3 — the one email layout. Every customer email is structured content rendered here, so
 * the design, the escaping and the plain-text part are decided once.
 *
 * Email-client rules this follows on purpose: tables for layout, every style inline (Gmail drops
 * most of `<style>`), a 600px container that goes full width on a phone, a table-cell button
 * (Outlook ignores padding on links), a hidden preheader, and a system font stack. The `<style>`
 * block only adds the phone padding and dark-mode colours for clients that read it.
 *
 * All text arrives as plain text and is escaped here. `**bold**` is the one markup a paragraph may
 * carry, applied after escaping, so no input can inject HTML.
 */

export interface EmailLink {
  label: string;
  href: string;
}

export type EmailBlock =
  | { kind: "paragraph"; text: string }
  | { kind: "facts"; rows: readonly { label: string; value: string }[] }
  | {
      kind: "items";
      rows: readonly { label: string; note?: string | null; amount: string }[];
      totals: readonly { label: string; amount: string; strong?: boolean }[];
    }
  | { kind: "callout"; title?: string | null; text: string }
  | { kind: "message"; text: string }
  | { kind: "quote"; caption: string; text: string };

export interface EmailContent {
  preheader: string;
  greeting?: string | null;
  heading: string;
  intro?: string | null;
  blocks?: readonly EmailBlock[];
  cta?: EmailLink | null;
  /** Shown under the button as "If the button doesn't work…" with the raw URL. */
  fallbackUrl?: string | null;
  /** Small secondary links under the button, e.g. "Forgot your password?". */
  links?: readonly EmailLink[];
  reassurance?: string | null;
  signOff?: string | null;
  /** Footer line saying why this email was sent. */
  reason: string;
  /** Extra footer line, e.g. the marketing opt-out, with an optional link. */
  footerNote?: { text: string; link?: EmailLink | null } | null;
}

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const TEXT = "#1f2937";
const MUTED = "#6b7280";
const BORDER = "#e5e7eb";
const PANEL = "#f9fafb";

function inline(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\r?\n/g, "<br>");
}

function plain(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, "$1");
}

function para(html: string, style = ""): string {
  return `<p class="em-text" style="margin:0 0 16px;font-family:${FONT};font-size:16px;line-height:24px;color:${TEXT};${style}">${html}</p>`;
}

function blockHtml(block: EmailBlock, brand: EmailBrand): string {
  switch (block.kind) {
    case "paragraph":
      return para(inline(block.text));
    case "facts":
      return `<table role="presentation" class="em-panel" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;background:${PANEL};border-left:4px solid ${brand.primary};border-radius:6px;">${block.rows
        .map(
          (row) =>
            `<tr><td class="em-muted" style="padding:10px 16px 0;font-family:${FONT};font-size:13px;line-height:18px;color:${MUTED};">${escapeHtml(row.label)}</td></tr><tr><td class="em-text" style="padding:2px 16px 10px;font-family:${FONT};font-size:16px;line-height:22px;font-weight:600;color:${TEXT};">${escapeHtml(row.value)}</td></tr>`,
        )
        .join("")}</table>`;
    case "items": {
      const rows = block.rows
        .map(
          (row) =>
            `<tr><td class="em-text" style="padding:10px 0;border-bottom:1px solid ${BORDER};font-family:${FONT};font-size:15px;line-height:21px;color:${TEXT};">${escapeHtml(row.label)}${
              row.note
                ? `<br><span class="em-muted" style="font-size:13px;color:${MUTED};">Note: ${escapeHtml(row.note)}</span>`
                : ""
            }</td><td class="em-text" align="right" style="padding:10px 0 10px 12px;border-bottom:1px solid ${BORDER};font-family:${FONT};font-size:15px;line-height:21px;color:${TEXT};white-space:nowrap;">${escapeHtml(row.amount)}</td></tr>`,
        )
        .join("");
      const totals = block.totals
        .map((t) => {
          const weight = t.strong ? "font-weight:700;font-size:17px;" : "font-size:15px;";
          return `<tr><td class="em-text" style="padding:6px 0;font-family:${FONT};line-height:22px;color:${TEXT};${weight}">${escapeHtml(t.label)}</td><td class="em-text" align="right" style="padding:6px 0 6px 12px;font-family:${FONT};line-height:22px;color:${TEXT};white-space:nowrap;${weight}">${escapeHtml(t.amount)}</td></tr>`;
        })
        .join("");
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;">${rows}<tr><td colspan="2" style="height:8px;line-height:8px;font-size:0;">&nbsp;</td></tr>${totals}</table>`;
    }
    case "callout":
      return `<table role="presentation" class="em-panel" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;background:${PANEL};border-radius:6px;"><tr><td style="padding:16px;font-family:${FONT};font-size:15px;line-height:22px;color:${TEXT};" class="em-text">${
        block.title
          ? `<strong style="display:block;margin:0 0 4px;color:${brand.primary};">${escapeHtml(block.title)}</strong>`
          : ""
      }${inline(block.text)}</td></tr></table>`;
    case "message":
      return `<div class="em-text" style="margin:0 0 20px;font-family:${FONT};font-size:16px;line-height:24px;color:${TEXT};white-space:pre-wrap;">${escapeHtml(block.text)}</div>`;
    case "quote":
      return `<p class="em-muted" style="margin:0 0 6px;font-family:${FONT};font-size:13px;line-height:18px;color:${MUTED};">${escapeHtml(block.caption)}</p><div class="em-muted" style="margin:0 0 20px;padding:0 0 0 12px;border-left:3px solid ${BORDER};font-family:${FONT};font-size:14px;line-height:21px;color:${MUTED};white-space:pre-wrap;">${escapeHtml(block.text)}</div>`;
  }
}

function blockText(block: EmailBlock): string {
  switch (block.kind) {
    case "paragraph":
      return plain(block.text);
    case "facts":
      return block.rows.map((r) => `${r.label}: ${r.value}`).join("\n");
    case "items":
      return [
        ...block.rows.map((r) => `${r.label}  ${r.amount}${r.note ? `\n  Note: ${r.note}` : ""}`),
        "",
        ...block.totals.map((t) => `${t.label}: ${t.amount}`),
      ].join("\n");
    case "callout":
      return `${block.title ? `${block.title}\n` : ""}${plain(block.text)}`;
    case "message":
      return block.text;
    case "quote":
      return `${block.caption}\n${block.text
        .split(/\r?\n/)
        .map((l) => `> ${l}`)
        .join("\n")}`;
  }
}

function button(cta: EmailLink, brand: EmailBrand): string {
  const href = escapeHtml(cta.href);
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;"><tr><td align="center" bgcolor="${brand.primary}" style="border-radius:8px;background:${brand.primary};"><a href="${href}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:${FONT};font-size:16px;line-height:20px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">${escapeHtml(cta.label)}</a></td></tr></table>`;
}

function header(brand: EmailBrand): string {
  const name = escapeHtml(brand.storeName);
  const mark = brand.markUrl
    ? `<td style="padding-right:12px;" valign="middle"><img src="${escapeHtml(brand.markUrl)}" width="40" height="40" alt="" style="display:block;width:40px;height:40px;border:0;border-radius:8px;"></td>`
    : "";
  const wordmark = `<td valign="middle" style="font-family:${FONT};font-size:20px;line-height:24px;font-weight:700;color:${brand.primary};">${name}</td>`;
  const inner = `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>${mark}${wordmark}</tr></table>`;
  return brand.siteUrl
    ? `<a href="${escapeHtml(brand.siteUrl)}" target="_blank" style="text-decoration:none;">${inner}</a>`
    : inner;
}

function footer(content: EmailContent, brand: EmailBrand): string {
  const small = `font-family:${FONT};font-size:12px;line-height:18px;color:${MUTED};`;
  const lines: string[] = [
    `<strong style="color:${TEXT};" class="em-text">${escapeHtml(brand.storeName)}</strong>`,
  ];
  if (brand.address) lines.push(escapeHtml(brand.address));
  if (brand.siteUrl) {
    const host = brand.siteUrl.replace(/^https?:\/\//, "");
    lines.push(
      `<a href="${escapeHtml(brand.siteUrl)}" target="_blank" style="color:${MUTED};text-decoration:underline;">${escapeHtml(host)}</a>`,
    );
  }
  const note = content.footerNote
    ? `<p class="em-muted" style="margin:12px 0 0;${small}">${escapeHtml(content.footerNote.text)}${
        content.footerNote.link
          ? ` <a href="${escapeHtml(content.footerNote.link.href)}" target="_blank" style="color:${MUTED};text-decoration:underline;">${escapeHtml(content.footerNote.link.label)}</a>`
          : ""
      }</p>`
    : "";
  const platformCredit = brand.platformBrandingTerminology
    ? `<a href="${escapeHtml(brand.platformUrl)}" target="_blank" style="color:${MUTED};text-decoration:underline;">${escapeHtml(brand.platformBrandingTerminology)}</a>`
    : `Powered by <a href="${escapeHtml(brand.platformUrl)}" target="_blank" style="color:${MUTED};text-decoration:underline;">${escapeHtml(brand.platformName)}</a>`;
  return `<p class="em-muted" style="margin:0;${small}">${lines.join("<br>")}</p><p class="em-muted" style="margin:12px 0 0;${small}">${escapeHtml(content.reason)}</p>${note}<p class="em-muted" style="margin:16px 0 0;${small}">${platformCredit}</p>`;
}

/** R1 — the HTML and plain-text parts of one email. */
export function renderEmail(
  content: EmailContent,
  brand: EmailBrand,
): { html: string; text: string } {
  const blocks = content.blocks ?? [];
  const body: string[] = [];
  if (content.greeting) body.push(para(inline(content.greeting)));
  body.push(
    `<h1 class="em-text" style="margin:0 0 16px;font-family:${FONT};font-size:24px;line-height:32px;font-weight:700;color:${TEXT};">${escapeHtml(content.heading)}</h1>`,
  );
  if (content.intro) body.push(para(inline(content.intro)));
  for (const block of blocks) body.push(blockHtml(block, brand));
  if (content.cta) body.push(button(content.cta, brand));
  if (content.fallbackUrl) {
    body.push(
      para(
        `If the button doesn't work, copy this link into your browser:<br><a href="${escapeHtml(content.fallbackUrl)}" target="_blank" style="color:${brand.primary};word-break:break-all;">${escapeHtml(content.fallbackUrl)}</a>`,
        `font-size:13px;line-height:19px;color:${MUTED};`,
      ),
    );
  }
  if (content.links?.length) {
    body.push(
      para(
        content.links
          .map(
            (l) =>
              `<a href="${escapeHtml(l.href)}" target="_blank" style="color:${brand.primary};text-decoration:underline;">${escapeHtml(l.label)}</a>`,
          )
          .join("&nbsp;&nbsp;·&nbsp;&nbsp;"),
        "font-size:15px;",
      ),
    );
  }
  if (content.reassurance) {
    body.push(
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 16px;"><tr><td style="border-top:1px solid ${BORDER};padding-top:16px;font-family:${FONT};font-size:14px;line-height:21px;color:${MUTED};" class="em-muted">${inline(content.reassurance)}</td></tr></table>`,
    );
  }
  if (content.signOff) body.push(para(inline(content.signOff), "margin:0;"));

  const preheader = escapeHtml(content.preheader);
  const html = `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(content.heading)}</title>
<style>
@media (max-width:620px){.em-pad{padding:24px 20px !important}.em-outer{padding:12px 8px !important}}
@media (prefers-color-scheme:dark){.em-bg{background:#111827 !important}.em-card{background:#1f2937 !important}.em-text{color:#f3f4f6 !important}.em-muted{color:#9ca3af !important}.em-panel{background:#111827 !important}}
</style>
</head>
<body class="em-bg" style="margin:0;padding:0;background:${brand.background};">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${brand.background};opacity:0;">${preheader}${"&zwnj;&nbsp;".repeat(40)}</div>
<table role="presentation" class="em-bg" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${brand.background};">
<tr><td align="center" class="em-outer" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;">
<tr><td style="padding:0 8px 20px;">${header(brand)}</td></tr>
<tr><td class="em-card em-pad" style="background:#ffffff;border-radius:12px;border-top:4px solid ${brand.primary};padding:36px 40px;">
${body.join("\n")}
</td></tr>
<tr><td style="padding:24px 8px 0;">${footer(content, brand)}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  const text = [
    brand.storeName.toUpperCase(),
    "",
    content.greeting ? plain(content.greeting) : null,
    content.heading,
    content.intro ? plain(content.intro) : null,
    ...blocks.map(blockText),
    content.cta ? `${content.cta.label}: ${content.cta.href}` : null,
    ...(content.links ?? []).map((l) => `${l.label}: ${l.href}`),
    content.reassurance ? plain(content.reassurance) : null,
    content.signOff ? plain(content.signOff) : null,
    "--",
    [brand.storeName, brand.address, brand.siteUrl].filter(Boolean).join("\n"),
    content.reason,
    content.footerNote
      ? `${content.footerNote.text}${content.footerNote.link ? ` ${content.footerNote.link.label}: ${content.footerNote.link.href}` : ""}`
      : null,
    brand.platformBrandingTerminology
      ? `${brand.platformBrandingTerminology} (${brand.platformUrl})`
      : `Powered by ${brand.platformName} (${brand.platformUrl})`,
  ]
    .filter((part): part is string => part !== null)
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { html, text };
}
