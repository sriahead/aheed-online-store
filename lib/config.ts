import { getCloudflareContext } from "@opennextjs/cloudflare";
import { z } from "zod";

/**
 * Reads a config value robustly in BOTH runtimes:
 *  - On Cloudflare Workers, secrets/vars are on the request-scoped binding env.
 *  - Locally (Node / next dev), they come from process.env.
 * Must be called within request scope on Workers (route handlers, server components).
 */
export function readEnv(key: string): string | undefined {
  try {
    const { env } = getCloudflareContext();
    const v = (env as Record<string, unknown>)[key];
    if (typeof v === "string" && v.length > 0) return v;
  } catch {
    /* not in a Worker request context — fall through to process.env */
  }
  return process.env[key];
}

const schema = z
  .object({
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required (Neon POOLED url)"),
    S3_ENDPOINT: z.string().optional(),
    S3_BUCKET: z.string().optional(),
    S3_ACCESS_KEY: z.string().optional(),
    S3_SECRET_KEY: z.string().optional(),
    S3_REGION: z.string().optional(),
    CDN_BASE_URL: z.string().optional(),
    // ADR-002 — Better Auth. Secret is required (session/cookie signing); URL is
    // optional (Better Auth can infer it from the request when unset, but an
    // explicit per-environment value avoids cookie/redirect surprises in prod).
    BETTER_AUTH_SECRET: z.string().min(1, "BETTER_AUTH_SECRET is required"),
    BETTER_AUTH_URL: z.string().optional(),
    // ADR-004 slice 3c (#74) — optional platform family suffix for auth cookies.
    // Unset (the default in every environment today) => host-only cookies, i.e. an
    // isolated session per vendor host. When set (e.g. `.aheedfoodcentre.nocaped.com`),
    // a request whose host is under that suffix gets a parent-domain cookie (SSO across
    // that subdomain family). A custom-domain vendor never matches it → stays isolated.
    AUTH_COOKIE_FAMILY_DOMAIN: z.string().optional(),
    // P1b — Google Sign-In (issue #28). Optional: unset means lib/auth.ts's
    // buildSocialProviders() omits the Google provider and Better Auth runs
    // email/password-only, same as before this slice.
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    // P3c (#99) — Stripe. Both optional in dev/CI: an unconfigured environment falls back to
    // the stub PaymentService rather than crashing, so local dev and CI keep working
    // with no Stripe setup (same degradation as lib/email.ts).
  })
  .superRefine((data, ctx) => {
    // P9.1 (#430) note: Stripe and Resend have their own schemas/getters below
    // to prevent a missing payments key from crashing the entire application (e.g. database reads).
  });

export type AppEnv = z.infer<typeof schema>;

/** Lazily parse env at call time (request scope), never at module import. */
export function getEnv(): AppEnv {
  return schema.parse({
    DATABASE_URL: readEnv("DATABASE_URL"),
    S3_ENDPOINT: readEnv("S3_ENDPOINT"),
    S3_BUCKET: readEnv("S3_BUCKET"),
    S3_ACCESS_KEY: readEnv("S3_ACCESS_KEY"),
    S3_SECRET_KEY: readEnv("S3_SECRET_KEY"),
    S3_REGION: readEnv("S3_REGION"),
    CDN_BASE_URL: readEnv("CDN_BASE_URL"),
    BETTER_AUTH_SECRET: readEnv("BETTER_AUTH_SECRET"),
    BETTER_AUTH_URL: readEnv("BETTER_AUTH_URL"),
    AUTH_COOKIE_FAMILY_DOMAIN: readEnv("AUTH_COOKIE_FAMILY_DOMAIN"),
    GOOGLE_CLIENT_ID: readEnv("GOOGLE_CLIENT_ID"),
    GOOGLE_CLIENT_SECRET: readEnv("GOOGLE_CLIENT_SECRET"),
  });
}

// lib/email — provider-agnostic outgoing email (#1217). Kept out of `schema`/`getEnv()` above:
// email sending has no dependency on DATABASE_URL/BETTER_AUTH_SECRET, and coupling it to that
// schema meant getEmailService() failed anywhere those unrelated vars weren't set (e.g. CI's
// `gates` job, which never provides them).
//
// EMAIL_PROVIDER picks the adapter (lib/email/*): unset means Cloudflare when the `EMAIL`
// send_email binding exists, otherwise log-only. Resend stays selectable as a fallback
// (`EMAIL_PROVIDER=resend` + RESEND_API_KEY) and needs no code change. The Resend From-address key is retired:
// EMAIL_FROM is the platform sender for every provider.
//
// EMAIL_RECIPIENT_MODE exists because NODE_ENV cannot tell staging from production (both Workers
// run a production build). Anything other than "open" is allowlist mode, so a forgotten setting
// fails safe: staging never mails a real customer.
export const EMAIL_PROVIDERS = ["cloudflare", "resend", "log"] as const;

const emailSchema = z
  .object({
    EMAIL_PROVIDER: z.enum(EMAIL_PROVIDERS).optional(),
    EMAIL_FROM: z.string().optional(),
    EMAIL_VERIFIED_DOMAINS: z.string().optional(),
    EMAIL_RECIPIENT_MODE: z.string().optional(),
    EMAIL_ALLOWED_RECIPIENTS: z.string().optional(),
    // Only read when EMAIL_PROVIDER=resend.
    RESEND_API_KEY: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    // P9.1 (#430) — enforced in production so a misconfiguration is loud, not silent.
    if (process.env.NODE_ENV === "production") {
      if (!data.EMAIL_FROM) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "EMAIL_FROM is required in production",
          path: ["EMAIL_FROM"],
        });
      }
      if (data.EMAIL_PROVIDER === "resend" && !data.RESEND_API_KEY) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "RESEND_API_KEY is required in production when EMAIL_PROVIDER=resend",
          path: ["RESEND_API_KEY"],
        });
      }
    }
  });

export type EmailEnv = z.infer<typeof emailSchema>;

export function getEmailEnv(): EmailEnv {
  return emailSchema.parse({
    EMAIL_PROVIDER: readEnv("EMAIL_PROVIDER"),
    EMAIL_FROM: readEnv("EMAIL_FROM"),
    EMAIL_VERIFIED_DOMAINS: readEnv("EMAIL_VERIFIED_DOMAINS"),
    EMAIL_RECIPIENT_MODE: readEnv("EMAIL_RECIPIENT_MODE"),
    EMAIL_ALLOWED_RECIPIENTS: readEnv("EMAIL_ALLOWED_RECIPIENTS"),
    RESEND_API_KEY: readEnv("RESEND_API_KEY"),
  });
}

// #1217 — the inbound-email resolve route (app/api/inbound-email/resolve). Its own schema, like
// jobs below, so a missing token never breaks anything else. Optional on purpose: the route fails
// closed (503) when it is unset, and reads it through `readOptional`.
const inboundEmailSchema = z.object({
  INBOUND_EMAIL_TOKEN: z.string().min(1).optional(),
});

export type InboundEmailEnv = z.infer<typeof inboundEmailSchema>;

export function getInboundEmailEnv(): InboundEmailEnv {
  return inboundEmailSchema.parse({ INBOUND_EMAIL_TOKEN: readEnv("INBOUND_EMAIL_TOKEN") });
}

// #1055 — the storefront footer's "Powered by {name}" line. Its own schema, like email and
// payments above, so reading it never depends on DATABASE_URL or BETTER_AUTH_SECRET. The platform
// is Merqify (the operator, not a vendor), so unset or blank falls back to the platform's own name
// and tagline in every environment, local included. wrangler.toml's per-environment `[vars]` sets
// both explicitly; a value there overrides the default.
export const DEFAULT_PLATFORM_NAME = "Merqify";
export const DEFAULT_PLATFORM_TAGLINE = "Your Merchandise, Digitised Quickly";

const orDefault = (fallback: string) =>
  z
    .string()
    .optional()
    .transform((v) => (v && v.trim() !== "" ? v.trim() : fallback));

const platformBrandingSchema = z.object({
  PLATFORM_NAME: orDefault(DEFAULT_PLATFORM_NAME),
  PLATFORM_TAGLINE: orDefault(DEFAULT_PLATFORM_TAGLINE),
});

export type PlatformBrandingEnv = z.infer<typeof platformBrandingSchema>;

export function getPlatformBrandingEnv(): PlatformBrandingEnv {
  return platformBrandingSchema.parse({
    PLATFORM_NAME: readEnv("PLATFORM_NAME"),
    PLATFORM_TAGLINE: readEnv("PLATFORM_TAGLINE"),
  });
}

const paymentSchema = z
  .object({
    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (process.env.NODE_ENV === "production") {
      if (!data.STRIPE_SECRET_KEY) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "STRIPE_SECRET_KEY is required in production",
          path: ["STRIPE_SECRET_KEY"],
        });
      }
      if (!data.STRIPE_WEBHOOK_SECRET) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "STRIPE_WEBHOOK_SECRET is required in production",
          path: ["STRIPE_WEBHOOK_SECRET"],
        });
      }
    }
  });

export type PaymentEnv = z.infer<typeof paymentSchema>;

export function getPaymentEnv(): PaymentEnv {
  return paymentSchema.parse({
    STRIPE_SECRET_KEY: readEnv("STRIPE_SECRET_KEY"),
    STRIPE_WEBHOOK_SECRET: readEnv("STRIPE_WEBHOOK_SECRET"),
  });
}

const aiSchema = z.object({
  CLOUDFLARE_ACCOUNT_ID: z.string().optional(),
  CLOUDFLARE_API_TOKEN: z.string().optional(),
  // #900 — overrides the net-content suggester's default model (lib/net-content-suggester.ts).
  // Optional: unset means DEFAULT_NET_CONTENT_MODEL; a script's --model flag overrides both.
  NET_CONTENT_AI_MODEL: z.string().min(1).optional(),
  // #1016 — override the /shop-your-list pre-pass and the synonym proposals' models
  // (lib/list-normalisation.ts, lib/search-synonym-proposals.ts). Optional: unset means each
  // module's named default, so a model withdrawal becomes a secret change rather than a deploy.
  LIST_NORMALISATION_AI_MODEL: z.string().min(1).optional(),
  SEARCH_SYNONYM_AI_MODEL: z.string().min(1).optional(),
  // #1309 — overrides the pricing refresh's model (lib/pricing-refresh-service.ts). Optional: unset
  // means DEFAULT_PRICING_REVIEW_MODEL.
  PRICING_REVIEW_AI_MODEL: z.string().min(1).optional(),
  // #1028 — which Workers plan the shared Cloudflare account is on (lib/ai-meter.ts). Free enforces
  // the shared daily allowance across every vendor; Paid lifts that cap. Anything other than an
  // exact "paid" — unset, empty, a typo — resolves to "free", so a mistake never removes the cap.
  WORKERS_AI_PLAN: z.preprocess(
    (value) => (value === "paid" ? "paid" : "free"),
    z.enum(["free", "paid"]),
  ),
});

export type AiEnv = z.infer<typeof aiSchema>;

export function getAiEnv(): AiEnv {
  return aiSchema.parse({
    CLOUDFLARE_ACCOUNT_ID: readEnv("CLOUDFLARE_ACCOUNT_ID"),
    CLOUDFLARE_API_TOKEN: readEnv("CLOUDFLARE_API_TOKEN"),
    NET_CONTENT_AI_MODEL: readEnv("NET_CONTENT_AI_MODEL") || undefined,
    LIST_NORMALISATION_AI_MODEL: readEnv("LIST_NORMALISATION_AI_MODEL") || undefined,
    SEARCH_SYNONYM_AI_MODEL: readEnv("SEARCH_SYNONYM_AI_MODEL") || undefined,
    PRICING_REVIEW_AI_MODEL: readEnv("PRICING_REVIEW_AI_MODEL") || undefined,
    WORKERS_AI_PLAN: readEnv("WORKERS_AI_PLAN"),
  });
}

/**
 * Shared secret authorising an unattended job invocation (P9.2, #618).
 *
 * The scheduled Worker has no session, so `requireVendorRole` — the gate on
 * `app/api/admin/jobs/backfill-images/route.ts` — cannot apply to a cron-driven
 * route. This is the credential that stands in its place, and the route fails
 * closed (503) when it is absent rather than running the sweep unauthenticated.
 *
 * Required in production for the same reason STRIPE_SECRET_KEY is: an absent
 * value there is a misconfiguration that would silently disable payment
 * recovery, not a degraded mode worth supporting.
 */
const jobsSchema = z
  .object({
    JOB_INVOCATION_TOKEN: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (process.env.NODE_ENV === "production" && !data.JOB_INVOCATION_TOKEN) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "JOB_INVOCATION_TOKEN is required in production",
        path: ["JOB_INVOCATION_TOKEN"],
      });
    }
  });

/**
 * UK location-reference database (#764).
 *
 * A SECOND Neon project (`uk-location-reference`), separate from Aheed's transactional database,
 * holding shared postcode and place reference data. Aheed reads it through `lib/reference/`.
 *
 * `UK_LOCATION_REF_DATABASE_URL` is the POOLED url used at runtime; `UK_LOCATION_REF_DIRECT_URL` is the direct
 * one used by migrations and the bulk sync — the same split `DATABASE_URL`/`DIRECT_URL` already
 * uses, and for the same reasons.
 *
 * DELIBERATELY NOT required-in-production. Unlike the payment and job secrets, an absent reference
 * database is a RECOVERABLE state, not a misconfiguration to crash on: the reference service treats
 * it as UNVERIFIED and checkout degrades to manual address entry. Making it fail-hard would turn a
 * provisioning gap into a broken storefront, which is the exact inversion this feature's state
 * model exists to prevent. Callers use `isReferenceDatabaseConfigured()` rather than a bare check.
 *
 * `UK_LOCATION_REF_POSTCODE_AREAS` is the demand-driven coverage list — which postcode AREAS to
 * materialise, comma-separated (e.g. "MK,RG"). It lives in configuration precisely so that adding
 * an area needs no migration, no importer and no application change. The default is empty: an
 * environment that has not said what it needs gets nothing rather than silently importing the whole
 * of Great Britain.
 */
const referenceSchema = z.object({
  UK_LOCATION_REF_DATABASE_URL: z.string().optional(),
  UK_LOCATION_REF_DIRECT_URL: z.string().optional(),
  UK_LOCATION_REF_POSTCODE_AREAS: z.string().optional(),
});

export type ReferenceEnv = z.infer<typeof referenceSchema>;

export function getReferenceEnv(): ReferenceEnv {
  return referenceSchema.parse({
    UK_LOCATION_REF_DATABASE_URL: readEnv("UK_LOCATION_REF_DATABASE_URL"),
    UK_LOCATION_REF_DIRECT_URL: readEnv("UK_LOCATION_REF_DIRECT_URL"),
    UK_LOCATION_REF_POSTCODE_AREAS: readEnv("UK_LOCATION_REF_POSTCODE_AREAS"),
  });
}

/**
 * The postcode areas this environment requires, normalised and de-duplicated.
 *
 * Upper-cased and trimmed so `"mk, rg"` and `"MK,RG"` are the same configuration, and sorted so two
 * environments listing the same areas in different orders compare equal. Returns an empty array
 * when unset — see the schema note above for why that is the safe default rather than "everything".
 */
export function getRequiredPostcodeAreas(): string[] {
  const raw = getReferenceEnv().UK_LOCATION_REF_POSTCODE_AREAS ?? "";
  return [
    ...new Set(
      raw
        .split(",")
        .map((area) => area.trim().toUpperCase())
        .filter((area) => area !== ""),
    ),
  ].sort();
}

export type JobsEnv = z.infer<typeof jobsSchema>;

export function getJobsEnv(): JobsEnv {
  return jobsSchema.parse({
    JOB_INVOCATION_TOKEN: readEnv("JOB_INVOCATION_TOKEN"),
  });
}

/**
 * #955 — whether this environment may be indexed by search engines.
 *
 * KEPT OUT OF `schema`/`getEnv()` ABOVE, for the same reason email and payments are: that schema
 * requires `DATABASE_URL` and `BETTER_AUTH_SECRET`, and `app/robots.ts` touches neither. Joining it
 * would mean an unrelated missing secret turned `/robots.txt` into an uncaught `ZodError`, i.e. a
 * bare 500 on the one route whose job is to answer a crawler.
 *
 * ABSENT IS THE SAFE VALUE, and it is why this is a tri-state string rather than a boolean: only
 * the exact string `"true"` opts an environment in, so staging, preview and local are
 * non-indexable by being unconfigured rather than by naming a host. `app/robots.ts` previously
 * decided this by comparing the request host against a hardcoded
 * `PRODUCTION_HOST = "aheedfoodcentre.nocaped.com"`, which de-indexed every other vendor in
 * production — ADR-004 says nothing vendor-specific lives in code, and a hostname literal is
 * exactly that.
 *
 * It is a committed `wrangler.toml` `[env.production.vars]` entry, NOT a secret: there is nothing
 * confidential about it, and `wrangler deploy` rebuilds a Worker's `vars` wholesale from that file
 * — a dashboard-only var is silently dropped on the next deploy, which is how
 * `UK_LOCATION_REF_POSTCODE_AREAS` disappeared from the deployed staging Worker once.
 */
const seoSchema = z.object({
  SEO_INDEXABLE: z.string().optional(),
});

export type SeoEnv = z.infer<typeof seoSchema>;

export function getSeoEnv(): SeoEnv {
  return seoSchema.parse({
    SEO_INDEXABLE: readEnv("SEO_INDEXABLE"),
  });
}

/** True only when this environment has explicitly opted in. See `seoSchema` for why. */
export function isIndexable(): boolean {
  return getSeoEnv().SEO_INDEXABLE === "true";
}

/**
 * Calls `read` and returns its result, or `undefined` if it threw (P9.2, #621).
 *
 * WHY THIS EXISTS. The accessors above are deliberately fail-hard: each one's
 * zod `superRefine` adds an issue when its field is absent and
 * `process.env.NODE_ENV === "production"`, so `getPaymentEnv()`/`getJobsEnv()`
 * THROW rather than handing back an empty value. That is the right default —
 * a missing payment secret in production is a misconfiguration, not a mode.
 *
 * But `NODE_ENV` is unconditionally `"production"` in every BUILT Worker this
 * app runs in — `npm run preview`, staging and production alike, because
 * `next build` bakes it in regardless of deploy target. So a caller written as
 * `const { X } = getXEnv(); if (!X) { ...handle it... }` never reaches its own
 * `if`: the accessor throws first and the handled branch is dead code that only
 * "works" under `next dev` or a plain Node script, neither of which these routes
 * ever run under. The observable result is an uncaught `ZodError` — a bare 500
 * with no body — in place of whatever considered response the route intended.
 *
 * A route that wants to treat "this required-in-production secret happens to be
 * absent right now" as its own recoverable case must therefore catch the throw,
 * which is all this does. Confirmed live at #618's /validate for
 * `app/api/jobs/reconcile-payments/route.ts` (its documented 503 was
 * unreachable), and it lived there as a local helper until #621 found
 * `app/api/webhooks/stripe/route.ts` had the identical latent defect. It is
 * exported from here rather than copied a second time precisely because one
 * private copy is how the first instance stopped being findable.
 */
export function readOptional<T>(read: () => T): T | undefined {
  try {
    return read();
  } catch {
    return undefined;
  }
}
