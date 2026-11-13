# Sign-up with an existing email (requirements)

Issue: #1558. Found on AFC staging 2026-11-13: re-registering a verified address showed "Check
<email> for a verification link" and sent nothing.

R1. Better Auth's `emailAndPassword.onExistingUserSignUp` hook is wired in `lib/auth.ts`. It runs
    only on the duplicate-email branch of `/sign-up/email` (after Better Auth's timing-equalising
    password hash), so a new sign-up is unchanged: verification email, `New account` Telegram alert,
    marketing-consent record.
R2. The hook sends one email to the existing account's address, from the current store's sender
    (the same `getCurrentVendorSender()` identity as the verification and reset emails). Subject:
    `You already have an account with <store>`. The `[STAGING]`/`[DEV]` tag comes from the email service as
    for every other email, and the staging recipient allowlist applies unchanged.
R3. The body says someone (probably them) tried to create an account with this address, that they
    already have one, and gives:
    - a sign-in link to `<base>/login`;
    - when the account has a password (`credential` provider): a "Forgot your password?" link to
      `<base>/forgot-password`;
    - when it has a Google login: a line saying they can sign in with Google;
    - when it has neither recorded (unexpected): the sign-in and forgot-password links;
    - "If this wasn't you, you can ignore this email. Nothing has changed on your account."
    It contains no password, token or link that changes the account, and the store name is
    HTML-escaped.
R4. `<base>` is the auth `baseURL` already resolved for the request (the store's own host). The
    links are absolute.
R5. The hook never rejects and never changes the sign-up response: a failure to load the login
    methods, resolve the sender or send is caught and logged without the address. The HTTP response
    stays Better Auth's generic duplicate response.
R6. The register success screen says `Check your email` / `We've sent a message to <email>. Open
    it to continue.` — true for a new and an existing account. The resend button is unchanged.
R7. No schema change, no new route, no new Telegram message. `/sign-up/email` stays covered by the
    existing per-store auth rate limit (`SENSITIVE_AUTH_PATHS`), which caps repeat sends.
R8. On AFC staging after deploy: re-registering an existing allowlisted address delivers the email
    and creates no account; a new address still gets the verification email.
