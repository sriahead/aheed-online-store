"use server";

import { revalidatePath } from "next/cache";
import { requireVendorRole } from "@/lib/auth-rbac";
import {
  createSynonym,
  deleteSynonym,
  generateSynonymProposals,
  setSynonymStatus,
  updateSynonym,
} from "@/lib/search-synonyms-service";
import { type SynonymFormState } from "@/lib/synonym-form";

/**
 * The search synonym dictionary's write path (P2.6 slice 3, #566) — `/staff/search-synonyms`.
 *
 * ONLY ASYNC FUNCTIONS MAY BE EXPORTED FROM THIS FILE (CLAUDE.md's Server Actions section — the
 * P6b1/#159 trap, where a same-file `export const initialState` made every action in the module 500
 * for every caller, invisible to `build`/`typecheck`/`test`). `initialSynonymFormState` lives in
 * `lib/synonym-form.ts` for exactly that reason.
 *
 * Each action runs `requireVendorRole("ADMIN")` itself, matching `saveCampaign`/`saveProduct`: a
 * server action is a public endpoint at a stable id, so the page's own check protects the page, not
 * these.
 */

function refusal(status: number): SynonymFormState {
  return {
    error:
      status === 401
        ? "Please sign in as a store admin to manage this store's search dictionary."
        : "You don't have permission to manage this store's search dictionary.",
    field: null,
    notice: null,
  };
}

function revalidate() {
  revalidatePath("/staff/search-synonyms");
}

export async function addSynonym(
  _prev: SynonymFormState,
  form: FormData,
): Promise<SynonymFormState> {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) return refusal(auth.status);

  const result = await createSynonym(auth.vendorId, {
    alias: String(form.get("alias") ?? ""),
    canonical: String(form.get("canonical") ?? ""),
  });
  if (!result.ok) return { error: result.error, field: result.field, notice: null };

  revalidate();
  return { error: null, field: null, notice: "Added." };
}

/**
 * One row's whole toolbar, dispatched by which button was pressed.
 *
 * ONE action and ONE form per row, deliberately. A row needs save, remove and (for a proposal)
 * approve/reject; HTML forbids nesting a form inside a form, so four separate `<form>` elements
 * would have to sit side by side and duplicate the row's hidden fields. A single form with several
 * submit buttons carrying `name="intent"` is the plain-HTML answer, keeps the row a real
 * progressive-enhancement form with no client JS required to submit, and means the authorization
 * check happens once.
 */
export async function manageSynonym(
  _prev: SynonymFormState,
  form: FormData,
): Promise<SynonymFormState> {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) return refusal(auth.status);

  const id = String(form.get("id") ?? "").trim();
  if (id === "") return { error: "Missing entry.", field: null, notice: null };

  const intent = String(form.get("intent") ?? "");

  if (intent === "remove") {
    const result = await deleteSynonym(auth.vendorId, id);
    if (!result.ok) return { error: result.error, field: null, notice: null };
    revalidate();
    return { error: null, field: null, notice: "Removed." };
  }

  if (intent === "approve" || intent === "reject") {
    const status = intent === "approve" ? "APPROVED" : "REJECTED";
    const result = await setSynonymStatus(auth.vendorId, id, status);
    if (!result.ok) return { error: result.error, field: null, notice: null };
    revalidate();
    return { error: null, field: null, notice: status === "APPROVED" ? "Approved." : "Rejected." };
  }

  if (intent !== "save") return { error: "Unknown action.", field: null, notice: null };

  const result = await updateSynonym(auth.vendorId, id, {
    alias: String(form.get("alias") ?? ""),
    canonical: String(form.get("canonical") ?? ""),
  });
  if (!result.ok) return { error: result.error, field: result.field, notice: null };

  revalidate();
  return { error: null, field: null, notice: "Saved." };
}

/**
 * Ask the model to propose mappings from this store's own failing searches (#566).
 *
 * This is the ONLY entry point to any AI call in the search feature, and it sits behind an ADMIN
 * check — `#571`'s requirement that no AI call is reachable from the public `/search` path.
 */
export async function proposeSynonymsFromLog(
  _prev: SynonymFormState,
  _form: FormData,
): Promise<SynonymFormState> {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) return refusal(auth.status);

  const result = await generateSynonymProposals(auth.vendorId);
  if (!result.ok) return { error: result.error, field: null, notice: null };

  revalidate();
  return {
    error: null,
    field: null,
    notice:
      result.created === 0
        ? `Looked at ${result.considered} search(es); nothing new to propose.`
        : `Added ${result.created} suggestion(s) from ${result.considered} search(es), awaiting your approval.`,
  };
}
