"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

/**
 * #956 — the one place add-to-cart outcomes are shown and announced.
 *
 * It cannot live inside `AddToCartButton`. On a product card a successful add
 * revalidates the page, and `ProductCard` swaps the button for
 * `CartQuantityStepper` in that same re-render; a sold-out result re-renders
 * the button as the disabled "Out of stock" one. Anything the button rendered
 * (text, or a live region) is gone before it can be seen or heard, and a
 * freshly mounted live region does not reliably announce its first content.
 * So `StorefrontChrome` mounts this once, outside every card, and buttons
 * report into it.
 */

/** How long a message stays before the region empties. */
export const CART_FEEDBACK_MS = 4000;

type Announce = (message: string) => void;

// No provider (a component test, or a page outside the storefront chrome):
// announcing is a silent no-op rather than a crash.
const CartFeedbackContext = createContext<Announce>(() => {});

export function CartFeedbackProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState("");
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const repeatTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const announce = useCallback<Announce>((next) => {
    if (clearTimer.current) clearTimeout(clearTimer.current);
    if (repeatTimer.current) clearTimeout(repeatTimer.current);
    // A screen reader announces a CHANGE to the region's text. Two identical
    // messages in a row (two sold-out clicks) would otherwise read once, so
    // the region is emptied first and refilled on the next tick.
    setMessage("");
    repeatTimer.current = setTimeout(() => setMessage(next), 0);
    clearTimer.current = setTimeout(() => setMessage(""), CART_FEEDBACK_MS);
  }, []);

  useEffect(
    () => () => {
      if (clearTimer.current) clearTimeout(clearTimer.current);
      if (repeatTimer.current) clearTimeout(repeatTimer.current);
    },
    [],
  );

  const value = useMemo(() => announce, [announce]);

  return (
    <CartFeedbackContext.Provider value={value}>
      {children}
      {/*
        Always in the DOM, so it is a live region before its first message.
        Empty, it has no vertical padding and so no visible box; the pill
        exists only while there is something to say. Above the quick-view
        drawer (z-50), because the drawer's add reports here too.
      */}
      <div
        data-cart-feedback
        role="status"
        aria-atomic="true"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(1.5rem+env(safe-area-inset-bottom))] z-[60] flex justify-center px-4"
      >
        {message && (
          <p className="max-w-sm rounded-xl bg-primary px-4 py-3 text-center text-sm font-semibold text-white shadow-lg">
            {message}
          </p>
        )}
      </div>
    </CartFeedbackContext.Provider>
  );
}

export function useCartFeedback(): Announce {
  return useContext(CartFeedbackContext);
}
