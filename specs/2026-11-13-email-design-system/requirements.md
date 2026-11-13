# Email design system and editable templates (requirements)

Issue #1564. Owner decisions 2026-11-13: one branded design for every email; plain text for every
email; customer emails editable by **store admins** as **wording fields** (layout and links locked).
Delivered in three parts (PRs), one promotion.

## Part 1 — layout, plain text, customer emails

R1. **One layout** (`lib/email/layout/`) renders every customer email from structured content:
    hidden preheader, store header, heading, body blocks, at most one primary button, an optional
    fallback link, a reassurance line, a sign-off and the footer. Table-based, inline CSS, 600px max
    width and full width on phones, `color-scheme` meta, system font stack. The button is a
    table-cell button (renders in Outlook, Gmail, Apple Mail).
R2. **Branding comes from the store's data, never from code** (ADR-004): store name
    (`senderName`), the square mark PNG (`markStorageKey` + `CDN_BASE_URL`) beside the name when
    set, else the name alone (the full logo is not used: it is WebP, which Outlook desktop cannot
    show), the button and accent colour from `VendorBranding.brandGreenDark` and the page background
    from `brandCream`. A brand colour whose contrast with white text is below 4.5:1, or that is not
    a `#rrggbb` value, falls back to `#111827`.
R3. **Footer**: store name, the store's address when `VendorLocation` exists, a link to the store's
    site when a base URL is known, one line saying why the email was sent, and
    `Powered by Merqify` linking to `https://merqify.com` (`lib/platform-defaults.ts`). Not
    `PLATFORM_NAME`: the dedicated AFC cells set that to the store's name. Small, muted, never
    louder than the store's own branding.
R4. **Plain text for every email.** `OutgoingEmail` gains optional `text`; the Cloudflare and
    Resend adapters send it. `getEmailService().send` derives text from the HTML when none is given,
    so outbox retries and any email not yet on the layout also carry a text part.
R5. **Templates are data.** Each customer email is a registered template with a key, an audience
    reason, a placeholder list and default copy for the editable fields: `subject`, `preheader`,
    `heading`, `intro`, `ctaLabel`, `reassurance`, `signOff`. `{{placeholder}}` values are
    interpolated, then HTML-escaped in the HTML part. Part 1 always uses the defaults.
R6. **The 14 customer templates** and their content (locked parts in brackets):
    - `order.confirmed`, `order.out_for_delivery`, `order.delivered`,
      `order.ready_for_collection`, `order.collected`, `order.cancelled`, `order.payment_failed`
      — [next-step text from `nextStepText`, shared with the order tracker], [key facts: order
      number, delivery/collection slot when known], [items and totals as today, savings and points
      lines as today], button "View your order" to `customerOrderHref` [only with a base URL].
    - `auth.verify_email`, `auth.reset_password` — button to Better Auth's URL unchanged, plus
      [the same URL as a copyable fallback link].
    - `auth.existing_account` — [sign-in link, Google line, forgot-password link per #1558].
    - `contact.acknowledgement`, `contact.complaint_acknowledgement` — [verified order number as a
      fact when present]; still echoes nothing the submitter typed.
    - `enquiry.reply` — [the staff member's text unchanged, the original message quoted, subject
      `Re: …` unchanged for threading]; editable fields limited to reassurance and sign-off.
    - `marketing.abandoned_checkout` — [first-name greeting, items, code paragraph, unsubscribe
      line and consent reason from #1554]; with a code the subject gains `(<benefit> inside)`.
R7. **Copy rules**: subject says what happened without a store-name suffix (the From name is the
    store); the first line states the purpose; one primary action; reassurance or next step last.
    No fake urgency or scarcity, no marketing in transactional templates (existing guard tests
    keep passing), no name or text a stranger could have typed, except the abandoned-checkout
    first name, which belongs to a consented, signed-in customer.
R8. Existing URLs, Better Auth flows, dispatch, dedupe, outbox and the `[STAGING]` subject tag are
    unchanged. Production carries no environment tag (#1409).
R9. **Sign-off preview**: `npm run email:preview` writes one HTML gallery of every template with
    sample data, rendered with a chosen store's real branding, for the owner to approve.

## Part 2 — editable templates

R10. `EmailTemplateOverride` (vendorId, templateKey, the seven fields as nullable text,
     `updatedByUserId`, `updatedAt`; unique `vendorId + templateKey`) via one hand-authored,
     additive migration. Null or blank means the default.
R11. `/staff/email-templates` (admin tier, registered in `nav-items.ts`): the list of templates
     with "Default" or "Edited"; an edit form per template with the placeholders listed, a live
     preview, **Send test** to the signed-in admin, and **Reset to default**.
R12. Saving refuses an unknown placeholder, a field over its limit (subject and preheader 150,
     heading 120, button 40, other fields 600) and a `{{`/`}}` imbalance, with the reason shown.
     Text only: HTML in a field is escaped, never rendered.
R13. Sending reads the store's overrides at render time; a failed read uses the defaults and never
     blocks the email. Queued retries keep what was rendered.
R14. Documented in the store admin guide (new page section) and the notification matrix.

## Part 3 — store and admin emails

R15. The owner order email and digest, the contact message forwarded to the store and the Client
     Setup test email use the layout (store header and footer, no customer reason line). Not
     editable. Inbound mail forwarded to the store is untouched.
