"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { assignRoleAction } from "@/app/(admin)/staff/team/actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-action px-6 py-2 font-semibold text-white transition-opacity hover:opacity-90 active:opacity-100 disabled:opacity-50"
    >
      {pending ? "Applying..." : "Apply"}
    </button>
  );
}

export function AssignRoleForm({
  currentAuthVia,
}: {
  currentAuthVia: "platform-admin" | "ADMIN" | "STAFF";
}) {
  const [state, formAction] = useActionState(assignRoleAction, {
    error: undefined,
    success: undefined,
  });
  const canGrantAdmin = currentAuthVia === "platform-admin";

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label htmlFor="email" className="mb-1 block text-sm font-medium text-primary">
            User Email
          </label>
          <input
            type="email"
            id="email"
            name="email"
            required
            placeholder="email@example.com"
            className="w-full rounded-md border border-black/20 bg-white px-3 py-2 text-primary focus:border-action focus:outline-none focus:ring-1 focus:ring-action"
          />
        </div>
        <div className="w-full sm:w-48">
          <label htmlFor="role" className="mb-1 block text-sm font-medium text-primary">
            Role
          </label>
          <select
            id="role"
            name="role"
            required
            className="w-full rounded-md border border-black/20 bg-white px-3 py-2 text-primary focus:border-action focus:outline-none focus:ring-1 focus:ring-action"
          >
            <option value="STAFF">Staff</option>
            {canGrantAdmin && <option value="ADMIN">Store Admin</option>}
            <option value="NONE">Revoke Access (Demote)</option>
          </select>
        </div>
        <SubmitButton />
      </div>

      {state?.error && <p className="text-sm font-medium text-[#d32f2f]">{state.error}</p>}
      {state?.success && (
        <p className="text-sm font-medium text-[#2e7d32]">Role updated successfully.</p>
      )}
    </form>
  );
}
