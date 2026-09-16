import { getPrisma, getPrismaWs } from "@/lib/db";
import { getUserId } from "@/lib/cart-identity";
import { getCurrentVendorId } from "@/lib/tenant";
import {
  deleteCustomerAddress,
  findCustomerAddress,
  listCustomerAddresses,
  saveCustomerAddress,
  touchCustomerAddress,
  type CustomerAddressInput,
  type CustomerAddressRow,
} from "@/lib/repositories/customer-addresses";

/**
 * Request-scoped wrapper around `lib/repositories/customer-addresses.ts` (#764).
 *
 * Resolves the live Prisma clients, the current vendor and the signed-in user — all three of which
 * need a real Workers request — and passes them in as data. Lives beside, not inside,
 * `lib/repositories/` so that module stays importable by a plain `tsx` script;
 * `tests/repository-purity.test.ts` would fail on the `@/lib/auth` and `@/lib/tenant` imports below
 * if they were in the repository file.
 *
 * Both clients are constructed fresh per call and never cached across requests, and this factory is
 * deliberately not memoised either — caching the wrapper pins the first request's clients inside it
 * just as surely as caching the client would.
 *
 * `getPrismaWs()` is reached only by `touch`, whose scoped `updateMany` cannot run on the HTTP
 * adapter (#382). Everything else uses the ordinary client.
 *
 * **Guests are not served here, by design.** Every method returns an empty or false result when
 * nobody is signed in, because a saved address needs an owner. A guest's postcode still persists in
 * the delivery cookie exactly as before.
 */

export interface CustomerAddressService {
  list(): Promise<CustomerAddressRow[]>;
  find(id: string): Promise<CustomerAddressRow | null>;
  save(input: CustomerAddressInput): Promise<CustomerAddressRow | null>;
  touch(id: string): Promise<void>;
  remove(id: string): Promise<boolean>;
}

export function getCustomerAddressService(): CustomerAddressService {
  const prisma = getPrisma();
  const prismaWs = getPrismaWs();

  let vendorIdPromise: Promise<string> | undefined;
  const vendorId = () => (vendorIdPromise ??= getCurrentVendorId());

  // Reuses `lib/cart-identity.ts`'s existing reader rather than re-deriving the session here —
  // it already resolves the Better Auth session against the request headers, and one place that
  // knows how to read "who is this" is better than two that can disagree. Called fresh on every
  // use, never memoised, for the reason CLAUDE.md records: caching a wrapper around request state
  // pins the first request's clients inside it.
  const userId = (): Promise<string | null> => getUserId();

  return {
    async list() {
      const user = await userId();
      if (!user) return [];
      return listCustomerAddresses(prisma, await vendorId(), user);
    },

    async find(id: string) {
      const user = await userId();
      if (!user) return null;
      return findCustomerAddress(prisma, await vendorId(), user, id);
    },

    async save(input: CustomerAddressInput) {
      const user = await userId();
      if (!user) return null;
      return saveCustomerAddress(prisma, await vendorId(), user, input);
    },

    async touch(id: string) {
      const user = await userId();
      if (!user) return;
      await touchCustomerAddress(prismaWs, await vendorId(), user, id);
    },

    async remove(id: string) {
      const user = await userId();
      if (!user) return false;
      return deleteCustomerAddress(prisma, await vendorId(), user, id);
    },
  };
}
