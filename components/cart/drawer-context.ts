"use client";

import { createContext, useContext } from "react";

/**
 * Lets a control inside the cart drawer close it (#748).
 *
 * `CartContents` is a SERVER component rendered both inside the drawer and on
 * `/cart`, where there is no drawer at all — so its checkout control cannot
 * simply receive `close` as a prop from `CartDrawerShell`. Context solves it in
 * the one direction that works: `CartDrawerShell` provides, anything rendered
 * within its `children` subtree consumes, and `/cart` gets the `null` default and
 * behaves as a plain link.
 *
 * Context flows through server-rendered `children` because the server output
 * lands inside the provider's position in the client tree at runtime.
 */
export const CartDrawerContext = createContext<{ close: () => void } | null>(null);

/** `close` is a no-op outside a drawer (i.e. on `/cart`), never an error. */
export function useCartDrawer(): { close: () => void } {
  return useContext(CartDrawerContext) ?? { close: () => {} };
}
