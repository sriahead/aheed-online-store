import { alertNewRegistration } from "@/lib/notifications/registration";
import {
  loadVendorNotificationContext,
  sendVendorNotifications,
} from "@/lib/order-notifications-service";
import { getCurrentVendorIdOrNull } from "@/lib/tenant";

/** #1552 R5 — the request-scoped half of the registration alert, called from `lib/auth.ts`. */
export async function alertNewRegistrationForRequest(path: string | undefined): Promise<void> {
  await alertNewRegistration(path, {
    resolveVendorId: getCurrentVendorIdOrNull,
    loadStore: loadVendorNotificationContext,
    send: sendVendorNotifications,
    now: () => new Date(),
    log: (line) => console.error(line),
  });
}
