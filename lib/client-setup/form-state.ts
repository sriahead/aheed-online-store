import { z } from "zod";

/**
 * Form state and input schemas for the Client Setup server actions (#1217). A plain module because
 * a "use server" file may export ONLY async functions (CLAUDE.md, Server Actions) — a constant or a
 * schema exported from app/(admin)/staff/platform/client-setup/actions.ts would 500 every action.
 */

export interface ClientSetupFormState {
  ok: boolean;
  message: string | null;
}

export const initialClientSetupFormState: ClientSetupFormState = { ok: false, message: null };

const email = z.string().trim().toLowerCase().email("Enter a valid email address.");

export const senderSchema = z.object({
  vendorId: z.string().min(1),
  senderName: z.string().trim().min(1, "Enter a sender name.").max(120),
  senderEmail: email,
});

export const inboundAddressSchema = z.object({
  vendorId: z.string().min(1),
  address: email,
  purpose: z.enum(["ORDERS", "SUPPORT"]),
  forwardTo: email,
});

export const removeInboundAddressSchema = z.object({
  vendorId: z.string().min(1),
  id: z.string().min(1),
});

export const testEmailSchema = z.object({ vendorId: z.string().min(1) });

// #1390 — order-alert recipients. A Telegram chat id is numeric; a group's starts with "-".
export const CHAT_ID_MESSAGE = "Enter the numeric Telegram chat ID (group IDs start with -).";

export const orderAlertRecipientSchema = z.object({
  vendorId: z.string().min(1),
  channel: z.enum(["TELEGRAM"]),
  destination: z
    .string()
    .trim()
    .regex(/^-?\d{1,20}$/, CHAT_ID_MESSAGE),
});

export const orderAlertRecipientIdSchema = z.object({
  vendorId: z.string().min(1),
  id: z.string().min(1),
});

// #1585 — platform branding terminology configured via Client Setup
export const platformBrandingFormSchema = z.object({
  vendorId: z.string().min(1),
  platformBrandingTerminology: z
    .string()
    .max(120, "Platform branding terminology must be 120 characters or fewer.")
    .optional(),
  applyToAll: z.preprocess((v) => v === "true" || v === "on" || v === true, z.boolean()),
});

export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Check the form and try again.";
}
