import { getPrisma, getPrismaWs } from "@/lib/db";
import { getUserId } from "@/lib/cart-identity";
import { getCurrentVendorId } from "@/lib/tenant";
import {
  createShoppingList,
  deleteShoppingList,
  findShoppingList,
  listShoppingLists,
  renameShoppingList,
  type ShoppingListDetail,
  type ShoppingListSummary,
} from "@/lib/repositories/shopping-lists";
import type { SavedListItemInput } from "@/lib/saved-list";

/**
 * Request-scoped wrapper around `lib/repositories/shopping-lists.ts` (#116).
 *
 * Resolves the live Prisma clients, the current vendor and the signed-in user — all three of which
 * need a real Workers request — and passes them in as data. Lives beside, not inside,
 * `lib/repositories/` so that module stays importable by a plain `tsx` script;
 * `tests/repository-purity.test.ts` would fail on the `@/lib/tenant` and `@/lib/cart-identity`
 * imports below if they were in the repository file.
 *
 * Both clients are constructed fresh per call and never cached across requests, and this factory
 * is deliberately not memoised either — caching the wrapper pins the first request's clients
 * inside it just as surely as caching the client would.
 *
 * `getPrismaWs()` is reached only by `save` and `rename`, whose nested create and scoped
 * `updateMany` cannot run on the HTTP adapter (#382). Everything else uses the ordinary client.
 *
 * **Guests are not served here, by design.** Every method returns an empty, null or false result
 * when nobody is signed in — never a throw, so a caller never has to distinguish "signed out"
 * from "went wrong". Guests keep the stateless /shop-your-list path, which writes nothing.
 */

export interface ShoppingListService {
  list(): Promise<ShoppingListSummary[]>;
  find(id: string): Promise<ShoppingListDetail | null>;
  save(name: string, items: readonly SavedListItemInput[]): Promise<string | null>;
  rename(id: string, name: string): Promise<boolean>;
  remove(id: string): Promise<boolean>;
}

export function getShoppingListService(): ShoppingListService {
  const prisma = getPrisma();
  const prismaWs = getPrismaWs();

  let vendorIdPromise: Promise<string> | undefined;
  const vendorId = () => (vendorIdPromise ??= getCurrentVendorId());

  // Reuses `lib/cart-identity.ts`'s existing reader rather than re-deriving the session here — it
  // already resolves the Better Auth session against the request headers, and one place that
  // knows "who is this" is better than two that can disagree. Called fresh on every use, never
  // memoised, for the reason CLAUDE.md records: caching a wrapper around request state pins the
  // first request's clients inside it.
  const userId = (): Promise<string | null> => getUserId();

  return {
    async list() {
      const user = await userId();
      if (!user) return [];
      return listShoppingLists(prisma, await vendorId(), user);
    },

    async find(id: string) {
      const user = await userId();
      if (!user) return null;
      return findShoppingList(prisma, await vendorId(), user, id);
    },

    async save(name: string, items: readonly SavedListItemInput[]) {
      const user = await userId();
      if (!user) return null;
      return createShoppingList(prismaWs, await vendorId(), user, name, items);
    },

    async rename(id: string, name: string) {
      const user = await userId();
      if (!user) return false;
      return renameShoppingList(prismaWs, await vendorId(), user, id, name);
    },

    async remove(id: string) {
      const user = await userId();
      if (!user) return false;
      return deleteShoppingList(prisma, await vendorId(), user, id);
    },
  };
}
