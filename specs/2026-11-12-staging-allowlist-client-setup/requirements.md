# Staging allowlist: Client Setup addresses (requirements)

R1. In allowlist mode, a recipient listed in `EMAIL_ALLOWED_RECIPIENTS` is sent as before, with no
    database lookup.
R2. In allowlist mode, an unlisted recipient that equals (case-insensitively) the forward-to mailbox
    of any saved receiving address is sent.
R3. Once that receiving address is removed, the same recipient is skipped again.
R4. Client Setup's test email reaches the signed-in platform admin's own address in allowlist mode.
    Only `lib/client-setup-service.ts` may set `recipientIsSignedInAdmin`.
R5. Any other unlisted recipient is skipped with the existing reason. If the lookup fails, the mail
    is skipped and the failure is logged.
R6. In open mode (production), behaviour is unchanged and no lookup runs.
R7. On staging, the Receiving addresses card tells the admin that forward-to mailboxes receive
    staging mail without being added to the secret.
