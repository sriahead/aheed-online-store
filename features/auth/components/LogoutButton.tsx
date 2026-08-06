"use client";

import { useRouter } from "next/navigation";
import { signOut } from "../api-client";

export function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    await signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      className="rounded-full border border-black/20 px-4 py-2 font-semibold text-primary"
    >
      Log out
    </button>
  );
}
