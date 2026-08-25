"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireVendorRole } from "@/lib/auth-rbac";
import { readForm } from "@/lib/catalogue-form";
import {
  BUNDLE_FIELDS,
  parseBundleForm,
  parseBundleItems,
  type BundleFormState,
} from "@/lib/bundle-form";
import {
  saveBundleForVendor,
  saveBundleItemsForVendor,
  deleteBundleForVendor,
} from "@/lib/bundles-service";

/**
 * Curated bundle write path (P8.5c, #347) — the text-and-constituents half of
 * `/staff/bundles`; `features/admin/bundle-image.ts` is the image half.
 *
 * ONLY ASYNC FUNCTIONS MAY BE EXPORTED FROM THIS FILE (CLAUDE.md's Server
 * Actions section — the P6b1/#159 trap, which 500s EVERY action in a file the
 * moment one non-function export exists, while every local gate stays green).
 * `initialBundleFormState` lives in lib/bundle-form.ts for exactly that reason.
 *
 * Each action runs `requireVendorRole("ADMIN")` itself, matching `saveCampaign`
 * / `saveCategory` / `saveProduct` — a server action is a public endpoint at a
 * stable id, so the page's own check protects the page, not this.
 */

function refusal(status: number): BundleFormState {
  return {
    error:
      status === 401
        ? "Please sign in as a store admin to manage this store's bundles."
        : "You don't have permission to manage this store's bundles.",
    field: null,
    saved: false,
  };
}

/**
 * Save a bundle's details AND its constituent list in one submit.
 *
 * The two writes are deliberately sequential rather than wrapped in a single
 * transaction: the form is one screen, but a half-saved bundle here means "the
 * name updated and the item list didn't", which the admin sees immediately on
 * the re-render and can simply resubmit. Wrapping them would mean threading a
 * transaction client through `upsertBundle` — whose whole value is being
 * callable from a plain script — for a failure mode with no data-integrity
 * consequence. The item replacement is itself atomic (`setBundleItems`).
 */
export async function saveBundle(_prev: BundleFormState, form: FormData): Promise<BundleFormState> {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) return refusal(auth.status);

  const rawId = String(form.get("bundleId") ?? "").trim();
  const bundleId = rawId === "" ? null : rawId;

  const parsed = parseBundleForm(readForm(form, BUNDLE_FIELDS));
  if (!parsed.ok) {
    return { error: parsed.error.message, field: parsed.error.field, saved: false };
  }

  const items = parseBundleItems(
    form.getAll("productId").map((value) => String(value)),
    form.getAll("quantity").map((value) => String(value)),
  );
  if (!items.ok) {
    return { error: items.error.message, field: items.error.field, saved: false };
  }

  const saved = await saveBundleForVendor(auth.vendorId, bundleId, parsed.value);
  if (!saved.ok) {
    return { error: saved.error, field: saved.field ?? null, saved: false };
  }

  const written = await saveBundleItemsForVendor(auth.vendorId, saved.id, items.value);
  if (!written.ok) {
    return { error: written.error, field: written.field ?? null, saved: false };
  }

  revalidatePath("/staff/bundles");
  revalidatePath(`/staff/bundles/${saved.id}`);
  revalidatePath("/categories");

  // A newly created bundle has no URL of its own until now — send the admin to
  // it, so the next save is an edit rather than a second create.
  if (bundleId === null) redirect(`/staff/bundles/${saved.id}`);

  return { error: null, field: null, saved: true };
}

export async function removeBundle(formData: FormData) {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) redirect("/staff/bundles");

  const bundleId = String(formData.get("bundleId") ?? "").trim();
  if (bundleId !== "") {
    await deleteBundleForVendor(auth.vendorId, bundleId);
    revalidatePath("/staff/bundles");
    revalidatePath("/categories");
  }

  redirect("/staff/bundles");
}
