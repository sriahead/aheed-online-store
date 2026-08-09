import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { getPrisma } from "./db";
import { getEnv, type AppEnv } from "./config";
import { getEmailService } from "./email";
import { getCurrentVendorSenderName } from "./repositories/vendor";

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
 */
export function getAuth() {
  const env = getEnv();
  const email = getEmailService();

  return betterAuth({
    database: prismaAdapter(getPrisma(), { provider: "postgresql" }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    socialProviders: buildSocialProviders(env),
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
