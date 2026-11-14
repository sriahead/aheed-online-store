import { getPrisma } from "@/lib/db";
import { getEmailService } from "@/lib/email";
import { getCurrentEmailBrand } from "@/lib/email-brand-service";
import { getCurrentTemplateOverride } from "@/lib/email-templates-service";
import { notifyExistingAccountSignUp } from "@/lib/notifications/existing-account";
import { getAccountProviders } from "@/lib/repositories/data-rights";
import { DEFAULT_SENDER_NAME } from "@/lib/repositories/vendor";
import { getCurrentVendorSender } from "@/lib/vendor-service";

/** #1558 R1 — the request-scoped half, called from Better Auth's `onExistingUserSignUp` hook. */
export async function notifyExistingAccountSignUpForRequest(
  user: { id: string; email: string },
  baseUrl: string | undefined,
): Promise<void> {
  await notifyExistingAccountSignUp(user, baseUrl, {
    loadProviders: (userId) => getAccountProviders(getPrisma(), userId),
    resolveSender: getCurrentVendorSender,
    defaultStoreName: DEFAULT_SENDER_NAME,
    resolveBrand: (storeName, siteUrl) => getCurrentEmailBrand(siteUrl, storeName),
    resolveOverrides: () => getCurrentTemplateOverride("auth.existing_account"),
    send: (email) => getEmailService().send(email),
    log: (line) => console.error(line),
  });
}
