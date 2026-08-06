"use client";

import { createAuthClient } from "better-auth/react";

/** Better Auth's browser client — same-origin, talks to app/api/auth/[...all]. */
export const authClient = createAuthClient();

export const { useSession, signIn, signUp, signOut, requestPasswordReset, resetPassword } =
  authClient;
