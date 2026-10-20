import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `#232` R9 — a signed-out caller writes nothing and is refused quietly.
 *
 * Favourites are authenticated-only, and the storefront renders a `/login` link rather than a
 * toggle for a guest, so this branch is **defence in depth**: it is what a hand-made POST meets.
 * That makes it worth a test, because nothing in the UI exercises it.
 *
 * TWO PROPERTIES, and the second is the one that would be easy to lose:
 *  1. the action returns the signed-out outcome rather than throwing — a throw here would reach the
 *     route error boundary and replace the page the shopper was reading;
 *  2. the repository is never reached at all, so no row can be written under a guessed identity.
 *
 * A STUB IS THE RIGHT TOOL HERE, unlike the duplicate-key guard. CLAUDE.md's warning that "a
 * hand-built double only reproduces its author's guess" is about `error.code` shapes, where the
 * real adapters disagree with each other. This is plain control flow over the module's own return
 * value, with no driver behaviour involved — and `scripts/verify-favourites.ts` covers the half
 * that does need a real database.
 */

const getUserId = vi.fn();
const toggle = vi.fn();
const revalidatePath = vi.fn();

vi.mock("@/lib/cart-identity", () => ({ getUserId }));
vi.mock("@/lib/favourites-service", () => ({
  getFavouritesRepository: () => ({ toggle, listProducts: vi.fn(), listProductIds: vi.fn() }),
}));
vi.mock("next/cache", () => ({ revalidatePath }));

// Imported after the mocks are registered, so the action closes over them.
const { toggleFavourite } = await import("@/features/favourites/toggle-favourite");

beforeEach(() => {
  getUserId.mockReset();
  toggle.mockReset();
  revalidatePath.mockReset();
});

describe("toggleFavourite — signed out (R9)", () => {
  it("returns the signed-out outcome instead of throwing", async () => {
    getUserId.mockResolvedValue(null);

    await expect(toggleFavourite("prod-1")).resolves.toEqual({ kind: "signed-out" });
  });

  it("never reaches the repository, so nothing can be written", async () => {
    getUserId.mockResolvedValue(null);

    await toggleFavourite("prod-1");

    expect(toggle).not.toHaveBeenCalled();
    // And it does not bust a cache for a write that never happened.
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("toggleFavourite — signed in", () => {
  it("passes the session's own user id to the repository, never one from the caller", async () => {
    getUserId.mockResolvedValue("user-7");
    toggle.mockResolvedValue("added");

    const result = await toggleFavourite("prod-1");

    expect(result).toEqual({ kind: "added" });
    expect(toggle).toHaveBeenCalledWith("user-7", "prod-1");
  });

  it("revalidates only the favourites listing, not the whole layout", async () => {
    getUserId.mockResolvedValue("user-7");
    toggle.mockResolvedValue("removed");

    const result = await toggleFavourite("prod-1");

    expect(result).toEqual({ kind: "removed" });
    // No chrome shows a favourite count, so there is nothing to revalidate `/` as a layout for —
    // unlike the cart's header badge, which is why `revalidateCartSurfaces()` does.
    expect(revalidatePath).toHaveBeenCalledTimes(1);
    expect(revalidatePath).toHaveBeenCalledWith("/account/favourites");
  });
});
