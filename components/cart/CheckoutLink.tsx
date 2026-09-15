"use client";

import Link from "next/link";
import { useCartDrawer } from "./drawer-context";

/**
 * "Proceed to checkout" (#748).
 *
 * `CartDrawerShell` already closes the drawer when the pathname changes, and that
 * is correct — but `/checkout` is `force-dynamic` and does several sequential
 * database round-trips before it renders, so the pathname does not change until
 * the server has finished. The drawer therefore sat open over the whole hop,
 * which reads as "Proceed to checkout doesn't close the cart".
 *
 * Closing on click makes the drawer respond to the shopper's action rather than
 * to the server's. The pathname effect stays as the backstop for every other way
 * of leaving the page.
 *
 * Still a real `<Link>`: navigation does not depend on the click handler, so this
 * degrades to exactly the previous behaviour if the handler never runs.
 */
export function CheckoutLink() {
  const { close } = useCartDrawer();

  return (
    <Link
      href="/checkout"
      onClick={close}
      className="flex w-full items-center justify-center rounded-2xl bg-primary px-4 py-3 text-sm font-bold text-white"
    >
      Proceed to checkout
    </Link>
  );
}
