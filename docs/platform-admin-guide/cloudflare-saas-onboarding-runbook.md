---
id: cloudflare-saas-onboarding-runbook
title: "Cloudflare for SaaS Client Onboarding Runbook"
audience: [platform-admin]
type: runbook
status: approved
version: "1.1.0"
updated: 2026-11-10
visibility: internal
summary: "Standard operating procedure for SaaS client onboarding from Cloudflare account creation, zone configuration, custom hostnames, Neon database mapping, to edge validation."
tags: ["admin", "platform", "cloudflare", "onboarding", "saas", "dns"]
---

# Cloudflare for SaaS Client Onboarding Runbook
## From Cloudflare Account Creation to Production Storefront Verification

## 1. Overview & Architecture

This runbook documents the complete technical onboarding procedure for onboarding a new SaaS client domain onto the platform. Following these steps guarantees a predictable setup, eliminates edge failure modes (such as HTTP 522 routing failures, HTTP 307 redirect loops, and HTTP 403 CDN asset blocking), and cleanly separates **Technical Domain Onboarding** from **Commercial Go-Live**.

```mermaid
flowchart TD
    subgraph 1. Client Cloudflare Account
        A[Create Client Cloudflare Account] --> B[Add Domain as Free Website Container]
        B --> C[Update Nameservers at Registrar]
        C --> D[Add DNS CNAMEs & 301 Apex Redirect]
    end

    subgraph 2. Platform Cloudflare (merqify.com)
        E[Ensure Fallback Worker Routes Active] --> F[Register Custom Hostnames in Cloudflare for SaaS]
        F --> G[Verify Custom Hostname DCV Certificates]
        G --> H[Allow Client Domain in Image CDN WAF Rules]
    end

    subgraph 3. Neon Database Mapping
        I[Insert Host into Production Neon VendorDomain]
        J[Insert Host into Staging Neon VendorDomain]
    end

    subgraph 4. Verification & Testing
        K[Run Edge Health Probes /api/health]
        L[Verify Cross-Domain Image Rendering]
        M[Confirm Public Storefront Operational]
    end

    D & G --> I & J
    H & I & J --> K --> L --> M
```

---

## 2. Pre-Requisites & Information Checklist

Before beginning, gather the following parameters:

| Parameter | Example Value | Description |
| :--- | :--- | :--- |
| **Client Name** | Aheed Food Centre | Human-readable company/brand name |
| **Client Domain** | `aheedfoodcentre.co.uk` | Registered apex domain name |
| **Production Host** | `www.aheedfoodcentre.co.uk` | Canonical customer storefront URL |
| **Staging Host** | `staging.aheedfoodcentre.co.uk` | Internal pre-release preview URL |
| **Vendor UUID** | `a4ed0000-0000-4000-a000-000000000001` | Database primary key in Neon `Vendor` table |
| **Platform Zone** | `merqify.com` | Central SaaS infrastructure zone |
| **Platform Fallback Origin** | `fallback.merqify.com` | Points to production Worker |
| **Platform Staging Origin** | `aheed-staging.merqify.com` | Points to staging Worker |

---

## 3. Step-by-Step Procedure

### Stage 1: Client Cloudflare Account & Zone Creation

1. **Create the Dedicated Client Account:**
   - Log into the [Cloudflare Dashboard](https://dash.cloudflare.com/).
   - Create a dedicated account for the client (e.g. `Aheed Food Centre`).

2. **Add the Domain as a Free Website Container:**
   - In the client account, click **Add a Domain**.
   - Enter the apex domain (e.g. `aheedfoodcentre.co.uk`).
   - Select the **Free** plan.
   > [!IMPORTANT]
   > If the domain is being moved from another Cloudflare account, the gaining account **must add the domain container first**. Attempting to initiate a zone transfer without this container triggers the error: `"Gaining account must first add the domain as a website"`.

3. **Update Nameservers at Registrar:**
   - Note the two Cloudflare nameservers assigned (e.g. `brady.ns.cloudflare.com` and `noor.ns.cloudflare.com`).
   - Log into the client's domain registrar (Nominet, GoDaddy, 123 Reg, etc.) and update the authoritative nameservers.
   - Wait for Cloudflare to show: **"Great news! Cloudflare is now protecting your site"** (Zone Status: `Active`).

---

### Stage 2: Cloudflare for SaaS Configuration (Platform Account: `merqify.com`)

1. **Verify Platform Fallback Origin & Worker Routes:**
   - In `merqify.com` > **DNS > Records**:
     - CNAME `fallback` points to `merqify.com` (Proxied - Orange Cloud).
     - CNAME `aheed-staging` points to `merqify.com` (Proxied - Orange Cloud).
   - In **Workers & Pages > aheed-store-production > Settings > Triggers > Routes**:
     - Ensure Route `fallback.merqify.com/*` is bound to `aheed-store-production`.
   - In **Workers & Pages > aheed-store-staging > Settings > Triggers > Routes**:
     - Ensure Route `aheed-staging.merqify.com/*` is bound to `aheed-store-staging`.
   > [!WARNING]
   > Never bind a wildcard route like `*/*` to the production Worker. Doing so intercepts all traffic across the platform, including staging and other client subdomains.

2. **Register Custom Hostnames:**
   - Go to `merqify.com` > **SSL/TLS > Custom Hostnames**.
   - Click **Add Custom Hostname**:
     - **Custom Hostname:** `www.<client-domain>` (e.g. `www.aheedfoodcentre.co.uk`)
     - **Custom Origin Server:** Leave blank to use Fallback Origin (`fallback.merqify.com`)
     - **TLS version:** Default (1.2/1.3)
     - **Validation method:** HTTP or TXT
   - Repeat for staging:
     - **Custom Hostname:** `staging.<client-domain>` (e.g. `staging.aheedfoodcentre.co.uk`)
     - **Custom Origin Server:** `aheed-staging.merqify.com`

   > [!WARNING]
   > **Dedicated cells (ADR-009) are different.** The two origins above belong to the **platform**
   > Workers. A client with its own cell (Aheed Food Centre: `afc-store-staging` /
   > `afc-store-production`) must use **its own cell's origin**, or its traffic reaches the platform
   > Worker, with the platform database and the platform Google client, whenever its routes do not
   > intercept it. That happened to `staging.aheedfoodcentre.co.uk` on 2026-11-10 (#1482): Google
   > sign-in failed with `redirect_uri_mismatch`, and the footer said "Merqify".
   >
   > - Give the cell's Worker an origin custom domain in `wrangler.toml`, e.g.
   >   `afc-staging-origin.merqify.com` with `custom_domain = true` under `[env.afc-staging]`, and list
   >   it in `SAAS_ORIGIN_HOSTS` (`scripts/verify-worker-routes.ts`). Deploy first.
   > - Then set the custom hostname's **Origin server** and **Origin SNI** to that host. Do it in this
   >   order: the new origin must answer before the custom hostname points at it.
   > - Check that the storefront footer shows the client's own `PLATFORM_TAGLINE`, and that
   >   `POST /api/auth/sign-in/social` returns the cell's own Google `client_id`.
   > - Each cell's Worker also needs **its own** `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` (`wrangler
   >   secret put … --env afc-<env>`). These are set by hand, not by CI. Don't copy the platform
   >   Worker's values.

3. **Retrieve DCV (Domain Control Validation) Records:**
   - In the Custom Hostnames table, click the newly created hostnames.
   - Note the **Certificate validation TXT record**:
     - Name: `_cf-custom-hostname.<hostname>`
     - Content/Target: `<unique-token>`

---

### Stage 3: DNS Records & 301 Redirect (Client Cloudflare Account)

In the client's Cloudflare account:

1. **Add DCV Verification Records:**
   - **Type:** `TXT` | **Name:** `_cf-custom-hostname.www` | **Content:** `<token-from-platform>`
   - **Type:** `TXT` | **Name:** `_cf-custom-hostname.staging` | **Content:** `<token-from-platform>`

2. **Add Routing CNAMEs:**
   - **Type:** `CNAME` | **Name:** `www` | **Target:** `fallback.merqify.com` | **Proxy Status:** Proxied (Orange Cloud)
   - **Type:** `CNAME` | **Name:** `staging` | **Target:** `aheed-staging.merqify.com` | **Proxy Status:** Proxied (Orange Cloud)

3. **Configure Apex 301 Redirect to WWW:**
   - *DNS Record:*
     - **Type:** `A` | **Name:** `@` | **IPv4 address:** `192.0.2.1` (Dummy reserved documentation IP) | **Proxy Status:** Proxied (Orange Cloud)
   - *Redirect Rule:*
     - Go to **Rules > Redirect Rules > Create Rule**.
     - **Rule Name:** `Redirect Apex to WWW`
     - **When incoming requests match:** Custom filter expression
     - **Field:** `Hostname` | **Operator:** `equals` | **Value:** `<client-domain>` (e.g. `aheedfoodcentre.co.uk`)
     - **Type:** Dynamic
     - **Expression:** `concat("https://www.", http.host, http.request.uri.path)`
     - **Status code:** `301 - Moved Permanently`
     - **Preserve query string:** Checked

---

### Stage 4: Neon Database Mapping (`VendorDomain`)

The Next.js multi-tenant resolver inspects the incoming `host` header to match a tenant. If no row exists in `VendorDomain`, the app redirects to `/coming-soon` with HTTP 307.

1. **Production Neon (`DATABASE_URL`):**
   Execute in the production database (Neon project or via Prisma):
   ```sql
   INSERT INTO "VendorDomain" (id, host, "vendorId", "isCanonical", "createdAt", "updatedAt")
   VALUES (
     gen_random_uuid(),
     'www.<client-domain>',
     '<vendorId>',
     true,
     NOW(),
     NOW()
   )
   ON CONFLICT (host) DO UPDATE
   SET "vendorId" = EXCLUDED."vendorId", "isCanonical" = true, "updatedAt" = NOW();
   ```

2. **Staging Neon (`STAGING_DATABASE_URL`):**
   Execute in the staging database:
   ```sql
   INSERT INTO "VendorDomain" (id, host, "vendorId", "isCanonical", "createdAt", "updatedAt")
   VALUES (
     gen_random_uuid(),
     'staging.<client-domain>',
     '<vendorId>',
     true,
     NOW(),
     NOW()
   )
   ON CONFLICT (host) DO UPDATE
   SET "vendorId" = EXCLUDED."vendorId", "isCanonical" = true, "updatedAt" = NOW();
   ```

---

### Stage 5: Image CDN & WAF Cross-Domain Access (`merqify.com`)

Branding images, logos, and product graphics are served from `images.merqify.com`.

1. **Verify WAF Custom Rules & Hotlink Protection:**
   - In `merqify.com` > **Security > WAF > Custom Rules**:
   - Check if any rule blocks requests with missing or third-party `Referer` headers.
   - If a custom anti-hotlinking rule is active, add an exception:
     ```text
     and not (http.referer contains "merqify.com" or http.referer contains "<client-domain>")
     ```
   - Alternatively, disable the restrictive rule if CDN assets are public.
   > [!NOTE]
   > If this rule is blocking, the storefront HTML will load with 200 OK, but logos, 3D icons, and product photos will fail with `403 Forbidden`.

---

## 4. Verification & Testing Checklist

Run these command-line probes (using PowerShell or Bash) to verify every tier:

### 1. Test Apex 301 Redirect
```bash
curl -I -s "https://<client-domain>/" | grep -E "(HTTP|location)"
```
*Expected Output:*
```http
HTTP/2 301
location: https://www.<client-domain>/
```

### 2. Test Production Storefront & Backend Database Health
```bash
curl -s "https://www.<client-domain>/api/health"
```
*Expected Output:*
```json
{"commit":"...","nodeEnv":"production","db":{"ok":true},"referenceDb":{"ok":true}}
```

### 3. Test Staging Storefront & Backend Database Health
```bash
curl -s "https://staging.<client-domain>/api/health"
```
*Expected Output:*
```json
{"commit":"...","nodeEnv":"staging","db":{"ok":true},"referenceDb":{"ok":true}}
```

### 4. Test Cross-Domain Asset Delivery (Anti-Hotlink Check)
```bash
curl -I -H "Referer: https://www.<client-domain>/" "https://images.merqify.com/vendors/<vendorId>/app/logo.png"
```
*Expected Output:*
```http
HTTP/2 200
content-type: image/png
access-control-allow-origin: *
```
*(If you receive `HTTP/2 403 Forbidden`, review Stage 5 WAF rules immediately).*

---

## 5. Troubleshooting Matrix & Quick Fixes

| Symptom / Error | Root Cause | Exact Remedy |
| :--- | :--- | :--- |
| **"Gaining account must first add the domain as a website"** | Cloudflare registrar transfer attempted before creating zone container. | Add domain as Free website in gaining Cloudflare account first. |
| **HTTP 522 Connection Timed Out** | No Worker Route listening on `fallback.merqify.com/*`. | In Cloudflare Workers, add Route `fallback.merqify.com/*` bound to the production Worker. |
| **HTTP 307 Temporary Redirect to `/coming-soon`** | Hostname missing from Neon `VendorDomain` table. | Insert row into `VendorDomain` matching `www.<client-domain>` with `isCanonical: true`. |
| **Staging loads Production content** | Custom hostname CNAME points to `fallback.merqify.com` instead of staging origin, or wildcard `*/*` route exists on prod Worker. | 1. Remove `*/*` route from prod Worker.<br/>2. Point `staging` custom hostname to `aheed-staging.merqify.com`. |
| **Dedicated-cell staging shows the platform (footer says Merqify, Google `redirect_uri_mismatch`)** | The custom hostname's origin is a **platform** Worker (`aheed-staging.merqify.com`), and the cell Worker's routes are not intercepting. | Point the custom hostname's Origin server and SNI at the cell's own origin custom domain (`afc-staging-origin.merqify.com`). See the Stage 2 warning for dedicated cells (#1482). |
| **Store loads but Logo/Icons show broken image (HTTP 403)** | Cloudflare WAF Custom Rule on `merqify.com` blocking cross-domain referrers. | In `merqify.com` Security > Custom Rules, disable referrer block or whitelist `<client-domain>`. |
| **`DNS_PROBE_FINISHED_NXDOMAIN` in browser** | Local ISP / Wi-Fi router cached stale DNS records before nameserver update completed. | Enable Chrome Secure DNS (DoH using Cloudflare 1.1.1.1) or flush local DNS (`ipconfig /flushdns`). |

---

## 6. Commercial Go-Live Handover (Separation of Milestones)

Once all technical stages above are verified, hand off the store to the **Commercial Milestone**:

1. **Email Verification:** Complete Cloudflare Email Sending setup if the client desires `@<client-domain>` sender addresses.
2. **Stripe Connect:** Connect client's live Stripe account and bank details.
3. **Product Catalogue:** Import client's approved stock CSV/spreadsheet if updating from initial template.
4. **Admin Role:** Run `npx tsx scripts/grant-role.ts --email <owner-email> --role ADMIN --vendor <vendorId>` to grant the client owner administrative access.
