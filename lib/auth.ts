import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { getPrisma } from "./db";
import { getEnv } from "./config";
import { getEmailService } from "./email";

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
 * No Google/OAuth provider here — P1a is email/password only (see issue #23);
 * Google Sign-In is a separate P1b slice once OAuth credentials exist.
 */
export function getAuth() {
  const env = getEnv();
  const email = getEmailService();

  return betterAuth({
    database: prismaAdapter(getPrisma(), { provider: "postgresql" }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    user: {
      additionalFields: {
        role: { type: "string", defaultValue: "CUSTOMER", input: false },
      },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      sendResetPassword: async ({ user, url }) => {
        await email.send({
          to: user.email,
          subject: "Reset your Aheed Food Centre password",
          html: `<p>Click <a href="${url}">here</a> to reset your password. If you didn't request this, ignore this email.</p>`,
        });
      },
    },
    emailVerification: {
      sendVerificationEmail: async ({ user, url }) => {
        await email.send({
          to: user.email,
          subject: "Verify your Aheed Food Centre email",
          html: `<p>Click <a href="${url}">here</a> to verify your email.</p>`,
        });
      },
    },
  });
}
