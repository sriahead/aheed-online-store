import type { AppEnvironment } from "@/lib/config";
import { withEnvironmentTag } from "@/lib/email/environment-tag";
import { formatLocalInput } from "@/lib/local-datetime";
import { SIGN_UP_EMAIL_PATH } from "@/lib/marketing-consent";
import type { NotificationMessage } from "./dispatch";

/**
 * #1552 R5 — the store owner's Telegram alert when an account is created, from Better Auth's
 * `user.create.after` hook. Injectable so it is tested without a request, a database or Telegram;
 * `lib/registration-alert-service.ts` binds the live pieces.
 *
 * The text carries NO name or email: Telegram is a third party and a staff group can have many
 * members (#1435 R16). The staff link is where the owner sees who it was.
 */

export type SignUpMethod = "Email" | "Google" | "Other";

export function signUpMethod(path: string | undefined): SignUpMethod {
  if (path === SIGN_UP_EMAIL_PATH) return "Email";
  if (path?.includes("google")) return "Google";
  return "Other";
}

export function registrationAlertText(input: {
  storeName: string;
  method: SignUpMethod;
  at: Date;
  baseUrl: string | null;
  environment: AppEnvironment;
}): string {
  const lines = [
    withEnvironmentTag(`New account: ${input.storeName}`, input.environment),
    `Method: ${input.method}`,
    `Time: ${formatLocalInput(input.at).replace("T", " ")} UK time`,
  ];
  if (input.baseUrl) lines.push(`${input.baseUrl}/staff/customers`);
  return lines.join("\n");
}

export interface RegistrationAlertDeps {
  /** The store this request belongs to, or null (a platform host). */
  resolveVendorId(): Promise<string | null>;
  loadStore(vendorId: string): Promise<{
    sender: { name: string };
    baseUrl: string | null;
    telegramChatIds: readonly string[];
    environment: AppEnvironment;
  }>;
  send(vendorId: string, messages: readonly NotificationMessage[]): Promise<void>;
  now(): Date;
  log(line: string): void;
}

/** Never rejects: a sign-up must not fail because a store's alert could not be built or sent. */
export async function alertNewRegistration(
  path: string | undefined,
  deps: RegistrationAlertDeps,
): Promise<void> {
  try {
    const vendorId = await deps.resolveVendorId();
    if (!vendorId) return;
    const store = await deps.loadStore(vendorId);
    if (store.telegramChatIds.length === 0) return;
    const body = registrationAlertText({
      storeName: store.sender.name,
      method: signUpMethod(path),
      at: deps.now(),
      baseUrl: store.baseUrl,
      environment: store.environment,
    });
    await deps.send(
      vendorId,
      store.telegramChatIds.map((chatId) => ({
        channel: "TELEGRAM" as const,
        destination: chatId,
        body,
        log: { audience: "OWNER" as const, event: "REGISTRATION" },
      })),
    );
  } catch (error) {
    deps.log(`registration alert failed: ${error instanceof Error ? error.name : "unknown"}`);
  }
}
