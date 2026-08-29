import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { getPrisma } from "./db";
import { getEnv, type AppEnv } from "./config";
import { getEmailService } from "./email";
import { getCurrentVendorSenderName } from "./vendor-service";
import { resolveAuthOrigin } from "./auth-origin";

/**
 * Hide `$transaction` from the client handed to Better Auth's Prisma adapter
 * (#382). `@better-auth/prisma-adapter` wraps two of its own operations (a
 * token-consume path, a find-then-update path) in `db.$transaction(...)`
 * ONLY when `typeof db.$transaction === "function"` — it already has a
 * working non-transactional fallback for the opposite case, precisely for
 * HTTP-only Prisma drivers. `getPrisma()`'s client (`PrismaNeonHttp`) HAS a
 * `$transaction` method — it just throws "Transactions are not supported in
 * HTTP mode" at runtime — so the adapter's guard never trips and it calls the
 * throwing method instead of its own fallback.
 *
 * Deliberately NOT `getPrismaWs()`: that would fix the crash too, but at the
 * cost of a WebSocket connection on every authenticated request, exactly what
 * the HTTP/WS split in lib/db.ts exists to avoid. Every other property is
 * forwarded and bound to the real client, so Prisma-internal `this`-dependent
 * methods keep working.
 */
export function authDb<T extends object>(client: T): T {
  return new Proxy(client, {
    get(target, prop, _receiver) {
      if (prop === "$transaction") {
        return undefined;
      }
      const value = Reflect.get(target, prop, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

/**
 * Pure helper, split out of getAuth() so it's unit-testable without a DB
 * (getAuth() itself has none, since it depends on getPrisma()). Returns
 * undefined — not `{ google: undefined }` — when either credential is
 * missing, so Better Auth never sees a half-configured provider (P1b,
 * issue #28).
 */
export function buildSocialProviders(
  env: Pick<AppEnv, "GOOGLE_CLIENT_ID" | "GOOGLE_CLIENT_SECRET">,
) {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return undefined;
  return {
    google: {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    },
  };
}

/**
 * Better Auth server instance (ADR-002). Constructed fresh on every call, NOT
 * cached across requests — it wraps whatever getPrisma() returns, and
 * getPrisma() itself must not cross request boundaries (see lib/db.ts). A
 * cached `_auth` singleton would still hold the first request's Prisma/Neon
 * client forever, defeating that fix one level removed. Env is read in
 * request scope on Workers, matching lib/db.ts.
 *
 * `role` is declared via additionalFields with `input: false` so it's part of
 * the session/user object Better Auth returns, but a signup request can never
 * set its own role — it's assigned server-side (Prisma default: CUSTOMER).
 * Google sign-in gets the same default (no separate role-assignment path).
 *
 * `async` (ADR-004 slice 3c, #74): baseURL / trustedOrigins / cookie domain are
 * resolved per request from the host + VendorDomain via resolveAuthOrigin(), so
 * every vendor host gets a correct, isolated (host-only) session by default. Still
 * constructed fresh on every call — async does not cache, matching lib/db.ts.
 */
export async function getAuth() {
  const env = getEnv();
  const email = getEmailService();
  const origin = await resolveAuthOrigin();

  const wrappedDb = authDb(getPrisma());

  return betterAuth({
    database: prismaAdapter(wrappedDb, { provider: "postgresql" }),
    secret: env.BETTER_AUTH_SECRET,
    // Derived per request from the host; BETTER_AUTH_URL is only a fallback when
    // no host header is present (resolveAuthOrigin yields an empty host → "https://").
    baseURL: origin.baseURL === "https://" ? env.BETTER_AUTH_URL : origin.baseURL,
    trustedOrigins: origin.trustedOrigins,
    ...(origin.crossSubDomainCookies
      ? { advanced: { crossSubDomainCookies: origin.crossSubDomainCookies } }
      : {}),
    socialProviders: buildSocialProviders(env),
    // Better Auth enables its built-in rate limiter by default whenever
    // NODE_ENV is production (`options.rateLimit?.enabled ?? isProduction` —
    // this app never opted into it explicitly). Its storage wrapper calls the
    // database adapter's `incrementOne`, which — like the session-consume path
    // authDb() above already covers — falls back to `db.$transaction(...)`
    // when the where-clause isn't a bare id match (#382). Rather than rely on
    // authDb() covering every such path across Better Auth's internals
    // (session handling, rate limiting, and anything a future plugin adds),
    // disable the feature this app never deliberately enabled.
    rateLimit: { enabled: false },
    onRequest: async (req: Request) => {
      const sensitivePaths = [
        "/sign-in",
        "/sign-up",
        "/forget-password",
        "/reset-password",
        "/send-verification-email",
      ];
      
      const url = new URL(req.url);
      const isSensitive = sensitivePaths.some((p) => url.pathname.endsWith(p));

      if (isSensitive) {
        // Next.js context is active because this runs inside app/api/auth/[...all]/route.ts
        const { getCurrentVendorIdOrNull } = await import("./tenant");
        const vendorId = await getCurrentVendorIdOrNull();
        
        if (vendorId) {
          const ip =
            req.headers.get("cf-connecting-ip") ??
            req.headers.get("x-forwarded-for") ??
            "unknown";
            
          const { checkAuthRateLimit } = await import("./repositories/auth-rate-limit");
          const limit = await checkAuthRateLimit(getPrisma(), vendorId, ip);
          
          if (!limit.allowed) {
            return new Response(JSON.stringify({ error: "Too many requests" }), {
              status: 429,
              headers: { "Content-Type": "application/json" },
            });
          }
        }
      }
    },
    user: {
      additionalFields: {
        role: { type: "string", defaultValue: "CUSTOMER", input: false },
      },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      sendResetPassword: async ({ user, url }) => {
        // Sender identity is the resolved vendor's (ADR-004 slice 4); the From
        // address stays the platform-verified Resend identity.
        const senderName = await getCurrentVendorSenderName();
        await email.send({
          to: user.email,
          subject: `Reset your ${senderName} password`,
          html: `<p>Click <a href="${url}">here</a> to reset your password. If you didn't request this, ignore this email.</p>`,
        });
      },
    },
    emailVerification: {
      sendVerificationEmail: async ({ user, url }) => {
        const senderName = await getCurrentVendorSenderName();
        await email.send({
          to: user.email,
          subject: `Verify your ${senderName} email`,
          html: `<p>Click <a href="${url}">here</a> to verify your email.</p>`,
        });
      },
    },
  });
}
