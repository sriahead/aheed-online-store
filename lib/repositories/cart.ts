import { getPrisma, getPrismaWs } from "@/lib/db";
import { getCurrentVendorId } from "@/lib/tenant";
import {
  assertSingleIdentity,
  clampQuantity,
  effectiveStock,
  isMergePending,
  resolveMerge,
  sumLinesByProduct,
  type MergeLine,
  type MergeResolution,
} from "@/lib/cart-rules";
import type { CartIdentity } from "@/lib/cart-identity";

/**
 * Cart read/write path (P3a, #93) — the ONLY DB access for carts; pages,
 * components and feature actions go through here (slice-2 no-direct-Prisma
 * guard). Constructed fresh per call and resolving vendorId once per instance,
 * matching lib/repositories/reviews.ts.
 *
 * The cart stores no prices: unit price is read from Product at read time and is
 * snapshotted only into OrderItem at order creation (P3b).
 */

export interface CartLine {
  productId: string;
  slug: string;
  name: string;
  unitLabel: string;
  unitPricePence: number;
  quantity: number;
  lineTotalPence: number;
  imageKey: string | null;
  stock: number;
  /** false when the product went inactive or out of stock while sitting in the cart */
  available: boolean;
}

export interface CartSummary {
  lines: CartLine[];
  /** Sum of quantities across all lines (what the header badge shows). */
  itemCount: number;
  /** Excludes unavailable lines — they never contribute money. */
  subtotalPence: number;
  /** True when a guest cart and a saved cart both hold items and the shopper must choose. */
  mergePending: boolean;
  savedItemCount: number;
  guestItemCount: number;
}

export const EMPTY_CART: CartSummary = {
  lines: [],
  itemCount: 0,
  subtotalPence: 0,
  mergePending: false,
  savedItemCount: 0,
  guestItemCount: 0,
};

export interface CartRepository {
  getSummary(identity: CartIdentity): Promise<CartSummary>;
  addItem(identity: CartIdentity, productId: string, delta?: number): Promise<void>;
  /**
   * Bulk add for "Shop your list" (P3d, #114) — one cart resolution and one
   * transaction for the whole list, not N sequential addItem() calls.
   * Quantities ADD to what is already in the cart, like every other add path.
   */
  addItems(identity: CartIdentity, lines: MergeLine[]): Promise<void>;
  setQuantity(identity: CartIdentity, productId: string, quantity: number): Promise<void>;
  removeItem(identity: CartIdentity, productId: string): Promise<void>;
  applyMerge(identity: CartIdentity, resolution: MergeResolution): Promise<void>;
  /** True once no guest cart remains for this token — the cookie is then safe to clear. */
  isGuestCartGone(identity: CartIdentity): Promise<boolean>;
  /** The cart id this identity writes to, or null. Checkout (P3b) needs it to hand
   *  the cart to the order transaction — resolved here so the feature layer never
   *  touches Prisma directly. */
  getCartId(identity: CartIdentity): Promise<string | null>;
}

type Tx = Parameters<Parameters<ReturnType<typeof getPrisma>["$transaction"]>[0]>[0];

export function getCartRepository(): CartRepository {
  const prisma = getPrisma();
  let vendorIdPromise: Promise<string> | undefined;
  const vendorId = () => (vendorIdPromise ??= getCurrentVendorId());

  /** Find a cart by identity side. Never creates. */
  async function findCart(vid: string, userId: string | null, guestToken: string | null) {
    if (userId) {
      return prisma.cart.findUnique({
        where: { vendorId_userId: { vendorId: vid, userId } },
        select: { id: true, items: { select: { productId: true, quantity: true } } },
      });
    }
    if (guestToken) {
      return prisma.cart.findUnique({
        where: { vendorId_guestToken: { vendorId: vid, guestToken } },
        select: { id: true, items: { select: { productId: true, quantity: true } } },
      });
    }
    return null;
  }

  /** Resolve-or-create the cart the given identity should write to. */
  async function ensureCart(vid: string, identity: CartIdentity): Promise<string> {
    const { userId, guestToken } = identity;
    assertSingleIdentity(userId ?? null, guestToken ?? null);

    const existing = await findCart(vid, userId, guestToken);
    if (existing) return existing.id;

    const created = await prisma.cart.create({
      data: { vendorId: vid, userId: userId ?? null, guestToken: guestToken ?? null },
      select: { id: true },
    });
    return created.id;
  }

  /**
   * Automatic (non-ambiguous) reconciliation, per R10a: if the signed-in shopper
   * has no saved cart, the guest cart is simply adopted; if the guest cart is
   * empty it is deleted. The ambiguous both-non-empty case is left alone for the
   * shopper to decide.
   *
   * The cookie is NOT cleared here: Next forbids writing cookies during a Server
   * Component render, and this runs on the read path. Once the guest cart row is
   * gone the cookie is inert, and the mutation layer clears it on the next write.
   */
  async function autoReconcile(vid: string, identity: CartIdentity) {
    const { userId, guestToken } = identity;
    if (!userId || !guestToken) return;

    const [saved, guest] = await Promise.all([
      findCart(vid, userId, null),
      findCart(vid, null, guestToken),
    ]);
    if (!guest) return;

    const guestCount = guest.items.reduce((a, i) => a + i.quantity, 0);
    const savedCount = saved?.items.reduce((a, i) => a + i.quantity, 0) ?? 0;
    if (isMergePending(savedCount, guestCount)) return; // shopper decides

    if (guestCount === 0) {
      await prisma.cart.delete({ where: { id: guest.id } });
      return;
    }
    // Saved cart is empty or absent → adopt the guest cart wholesale.
    if (saved) await prisma.cart.delete({ where: { id: saved.id } });
    await prisma.cart.update({
      where: { id: guest.id },
      data: { userId, guestToken: null },
    });
  }

  /** Product data for a set of cart lines, in one query. */
  async function decorate(
    vid: string,
    items: { productId: string; quantity: number }[],
  ): Promise<CartLine[]> {
    if (items.length === 0) return [];
    const products = await prisma.product.findMany({
      where: { vendorId: vid, id: { in: items.map((i) => i.productId) } },
      select: {
        id: true,
        slug: true,
        name: true,
        unitLabel: true,
        basePrice: true,
        isActive: true,
        inventory: { select: { quantity: true } },
        images: {
          where: { isPrimary: true },
          select: { storageKey: true },
          take: 1,
        },
      },
    });
    const byId = new Map(products.map((p) => [p.id, p]));

    return items.flatMap((item) => {
      const p = byId.get(item.productId);
      if (!p) return []; // product deleted outright — nothing sensible to render
      const stock = effectiveStock(p.inventory?.quantity);
      const available = p.isActive && stock > 0;
      return [
        {
          productId: p.id,
          slug: p.slug,
          name: p.name,
          unitLabel: p.unitLabel,
          unitPricePence: p.basePrice,
          quantity: item.quantity,
          lineTotalPence: p.basePrice * item.quantity,
          imageKey: p.images[0]?.storageKey ?? null,
          stock,
          available,
        },
      ];
    });
  }

  async function stockMap(vid: string, productIds: string[]): Promise<Map<string, number>> {
    const rows = await prisma.product.findMany({
      where: { vendorId: vid, id: { in: productIds } },
      select: { id: true, isActive: true, inventory: { select: { quantity: true } } },
    });
    return new Map(rows.map((r) => [r.id, r.isActive ? effectiveStock(r.inventory?.quantity) : 0]));
  }

  return {
    async getSummary(identity) {
      const vid = await vendorId();
      const { userId, guestToken } = identity;
      if (!userId && !guestToken) return EMPTY_CART;

      await autoReconcile(vid, identity);

      const [saved, guest] = await Promise.all([
        userId ? findCart(vid, userId, null) : Promise.resolve(null),
        guestToken ? findCart(vid, null, guestToken) : Promise.resolve(null),
      ]);

      const savedItemCount = saved?.items.reduce((a, i) => a + i.quantity, 0) ?? 0;
      const guestItemCount = guest?.items.reduce((a, i) => a + i.quantity, 0) ?? 0;
      const mergePending = Boolean(userId) && isMergePending(savedItemCount, guestItemCount);

      // While a decision is pending the SAVED cart is active — the conservative
      // default, since it is provably the signed-in shopper's own.
      const active = userId ? (saved ?? (mergePending ? null : guest)) : guest;
      const lines = await decorate(vid, active?.items ?? []);

      return {
        lines,
        itemCount: lines.reduce((a, l) => a + l.quantity, 0),
        subtotalPence: lines.reduce((a, l) => a + (l.available ? l.lineTotalPence : 0), 0),
        mergePending,
        savedItemCount,
        guestItemCount,
      };
    },

    async addItem(identity, productId, delta = 1) {
      const vid = await vendorId();
      const stock = (await stockMap(vid, [productId])).get(productId) ?? 0;
      if (stock <= 0) return; // out of stock (or no Inventory row) — refuse

      const cartId = await ensureCart(vid, identity);
      await getPrismaWs().$transaction(async (tx: Tx) => {
        const existing = await tx.cartItem.findUnique({
          where: { cartId_productId: { cartId, productId } },
          select: { quantity: true },
        });
        const next = clampQuantity(existing?.quantity ?? 0, delta, stock);
        if (next <= 0) return;
        await tx.cartItem.upsert({
          where: { cartId_productId: { cartId, productId } },
          create: { cartId, vendorId: vid, productId, quantity: next },
          update: { quantity: next },
        });
      });
    },

    async addItems(identity, lines) {
      // One entry per product: a pasted list can name the same product twice,
      // and two upserts of one row inside a transaction would fight.
      const merged = sumLinesByProduct(lines);
      if (merged.length === 0) return;

      const vid = await vendorId();
      // stockMap is scoped to `vendorId: vid`, so a productId belonging to
      // another vendor (or to nothing) simply has no row and resolves to 0 —
      // which is why the review form's ids can be untrusted input.
      const stocks = await stockMap(
        vid,
        merged.map((line) => line.productId),
      );
      const writable = merged.filter((line) => (stocks.get(line.productId) ?? 0) > 0);
      if (writable.length === 0) return; // nothing addable — don't create a cart

      const cartId = await ensureCart(vid, identity);
      await getPrismaWs().$transaction(async (tx: Tx) => {
        for (const line of writable) {
          const existing = await tx.cartItem.findUnique({
            where: { cartId_productId: { cartId, productId: line.productId } },
            select: { quantity: true },
          });
          const next = clampQuantity(
            existing?.quantity ?? 0,
            line.quantity,
            stocks.get(line.productId) ?? 0,
          );
          if (next <= 0) continue;
          await tx.cartItem.upsert({
            where: { cartId_productId: { cartId, productId: line.productId } },
            create: { cartId, vendorId: vid, productId: line.productId, quantity: next },
            update: { quantity: next },
          });
        }
      });
    },

    async setQuantity(identity, productId, quantity) {
      const vid = await vendorId();
      const stock = (await stockMap(vid, [productId])).get(productId) ?? 0;
      const cart = await findCart(vid, identity.userId, identity.guestToken);
      if (!cart) return;
      // Clamp against stock; never lands on 0 (removal is the explicit path).
      const next = clampQuantity(0, quantity, stock);
      if (next <= 0) return;
      await prisma.cartItem.updateMany({
        where: { cartId: cart.id, productId },
        data: { quantity: next },
      });
    },

    async removeItem(identity, productId) {
      const vid = await vendorId();
      const cart = await findCart(vid, identity.userId, identity.guestToken);
      if (!cart) return;
      await prisma.cartItem.deleteMany({ where: { cartId: cart.id, productId } });
    },

    async applyMerge(identity, resolution) {
      const vid = await vendorId();
      const { userId, guestToken } = identity;
      if (!userId || !guestToken) return;

      const [saved, guest] = await Promise.all([
        findCart(vid, userId, null),
        findCart(vid, null, guestToken),
      ]);
      if (!guest) return; // already resolved — idempotent no-op

      const savedLines = saved?.items ?? [];
      const stocks = await stockMap(vid, [
        ...new Set([...savedLines, ...guest.items].map((i) => i.productId)),
      ]);
      const result = resolveMerge(resolution, savedLines, guest.items, (id) => stocks.get(id) ?? 0);

      await getPrismaWs().$transaction(async (tx: Tx) => {
        // The user's cart becomes the single surviving cart, carrying `result`.
        const targetId =
          saved?.id ??
          (
            await tx.cart.create({
              data: { vendorId: vid, userId },
              select: { id: true },
            })
          ).id;

        await tx.cartItem.deleteMany({ where: { cartId: targetId } });
        if (result.length > 0) {
          await tx.cartItem.createMany({
            data: result.map((l) => ({
              cartId: targetId,
              vendorId: vid,
              productId: l.productId,
              quantity: l.quantity,
            })),
          });
        }
        await tx.cart.delete({ where: { id: guest.id } });
      });
    },

    async isGuestCartGone(identity) {
      if (!identity.guestToken) return true;
      const vid = await vendorId();
      return (await findCart(vid, null, identity.guestToken)) === null;
    },

    async getCartId(identity) {
      const vid = await vendorId();
      const cart = await findCart(vid, identity.userId, identity.guestToken);
      return cart?.id ?? null;
    },
  };
}
