"use client";

import { useRef, useEffect, useState, useTransition } from "react";
import { setDeliveryPostcode, setFulfilmentMethod } from "@/features/storefront/delivery";
import { POSTCODE_INTENT_FIELD, type PostcodeIntent } from "@/lib/delivery-cookie";
import type { FulfilmentMethodChoice } from "@/lib/fulfilment-cookie";
import { Icon } from "@/components/icons/Icon";

/**
 * Header delivery / Click & Collect control.
 *
 * #748 — `mode` used to be local `useState`. That made this component the OWNER
 * of the fulfilment method, which it cannot be: `Header` renders it TWICE
 * (desktop and mobile), so the two instances held independent state and could
 * disagree, and nothing server-rendered — the cart drawer, `/cart`, `/checkout` —
 * could read it at all. The method now arrives as a prop resolved by
 * `lib/fulfilment-service.ts` from a cookie, and the toggle WRITES that cookie
 * through a server action. The two instances therefore always agree, and the
 * choice survives navigation.
 *
 * Both method controls are real `<form>` submissions, so choosing a method works
 * with client JavaScript disabled — same posture as the postcode form it sits
 * beside. #1142 put them inside a native `<details>` menu, which also opens
 * without JavaScript.
 */
export function LocationControl({
  postcode,
  deliverable,
  offerCollection,
  method,
}: {
  postcode: string | null;
  deliverable: boolean | null;
  offerCollection: boolean;
  method: FulfilmentMethodChoice;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const menuRef = useRef<HTMLDetailsElement>(null);

  const [isPending, startTransition] = useTransition();
  const [isDirty, setIsDirty] = useState(false);
  // Which control opened the modal, submitted to the action as a form field
  // (#1087). The component does not act on it — `setDeliveryPostcode` decides,
  // so a crafted post cannot claim an intent the server treats differently
  // from a real one.
  const [intent, setIntent] = useState<PostcodeIntent>("delivery");
  const hasDeliverablePostcode = Boolean(postcode && deliverable);

  // Close the modal once a submitted postcode comes back deliverable. Whether
  // the method changed with it is the ACTION's decision, from the submitted
  // intent: the Delivery affordance selects Delivery, the pencil leaves the
  // method alone. This component forces nothing either way — forcing DELIVERY
  // here unconditionally is exactly what #748 removed.
  useEffect(() => {
    if (isPending) return;
    if (hasDeliverablePostcode && dialogRef.current?.open) {
      dialogRef.current.close();
    }
  }, [hasDeliverablePostcode, isPending]);

  // #1142 — closing the method menu is an enhancement on a native `<details>`: without this the
  // menu still opens and every item still works, it just stays open until the page reloads or
  // the summary is pressed again. Escape and a click outside close it; neither touches the method.
  const closeMenu = () => {
    if (menuRef.current) menuRef.current.open = false;
  };
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const menu = menuRef.current;
      if (event.key !== "Escape" || !menu?.open) return;
      const hadFocus = menu.contains(document.activeElement);
      menu.open = false;
      if (hadFocus) menu.querySelector("summary")?.focus();
    };
    const onClick = (event: MouseEvent) => {
      const menu = menuRef.current;
      if (menu?.open && !menu.contains(event.target as Node)) menu.open = false;
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("click", onClick);
    };
  }, []);

  const openModal = (openedWith: PostcodeIntent) => {
    setIsDirty(false);
    setIntent(openedWith);
    // #1142 — a dialog item hands over to the modal, so the menu behind it closes.
    closeMenu();
    dialogRef.current?.showModal();
  };
  const closeModal = () => dialogRef.current?.close();

  const itemClass =
    "flex min-h-tap w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold text-black/80 transition-colors hover:bg-surface-muted hover:text-primary lg:min-h-0";

  // #1087 — the postcode shows whenever one is stored and deliverable, not only
  // under DELIVERY. A shopper on Click & Collect could otherwise read the
  // postcode they had just typed only by reopening the modal and cancelling it.
  const deliveryLabel = hasDeliverablePostcode ? `Delivery · ${postcode}` : "Delivery";
  // #1142 — the menu's summary names the CURRENT method. Under DELIVERY that is the Delivery
  // item's own text, so the summary and the checked item agree.
  const summaryLabel = method === "COLLECTION" ? "Click & Collect" : deliveryLabel;

  return (
    <div data-tap-surface="location" className="flex h-full items-center">
      {offerCollection ? (
        // #1142 — one native disclosure instead of the toggle pair and pencil, to give the search
        // bar room. NATIVE so it opens with client JavaScript disabled (#748's posture), and its
        // method items are the same server-action forms the toggle pair was. Only the summary is
        // always visible; its text is its accessible name, with no aria-label and no responsive
        // span pair, so #1091's doubled name cannot recur. `open` is never passed as a prop: the
        // browser owns it, and the effect above only ever closes it.
        <details
          ref={menuRef}
          data-location-menu=""
          className="group relative h-full w-full sm:w-auto"
        >
          <summary
            data-tap-surface="location"
            className="flex h-full min-h-tap w-full cursor-pointer list-none items-center gap-1.5 whitespace-nowrap rounded-xl border border-black/10 bg-surface-muted px-3 py-2 text-xs font-bold text-black/80 transition hover:bg-black/5 sm:w-auto lg:min-h-0 [&::-webkit-details-marker]:hidden"
          >
            {method === "COLLECTION" ? (
              <Icon name="store" className="h-4 w-4 shrink-0 text-primary" />
            ) : (
              <Icon name="truck" className="h-4 w-4 shrink-0 text-primary" />
            )}
            <span className="min-w-0 truncate">{summaryLabel}</span>
            <Icon
              name="chevron-down"
              className="ml-auto h-3.5 w-3.5 shrink-0 text-black/60 transition-transform group-open:rotate-180 sm:ml-0"
            />
          </summary>

          <div className="absolute left-0 top-full z-50 mt-1 flex w-64 min-w-full max-w-[calc(100vw-2rem)] flex-col gap-0.5 rounded-xl border border-black/10 bg-white p-1 shadow-lg">
            {/*
              Bound straight to the server action — NOT to a client function — so
              the item submits with client JavaScript disabled. The chosen value
              rides on the submitting button's own name/value pair. Without
              JavaScript the post reloads the page, which closes the menu. With it,
              React submits the action WITHOUT a reload (found at Validate: the menu
              stayed open after a choice), so `onSubmit` closes it. `onSubmit` does
              not prevent the default, so the action still runs.
            */}
            <form action={setFulfilmentMethod} onSubmit={closeMenu}>
              <button
                type="submit"
                name="fulfilmentMethod"
                value="COLLECTION"
                data-tap-surface="location"
                aria-current={method === "COLLECTION" ? "true" : undefined}
                className={itemClass}
              >
                <Icon name="store" className="h-4 w-4 shrink-0 text-primary" />
                <span className="flex-1">Click &amp; Collect</span>
                {method === "COLLECTION" && (
                  <Icon name="check" className="h-4 w-4 shrink-0 text-action" />
                )}
              </button>
            </form>

            {hasDeliverablePostcode ? (
              <form action={setFulfilmentMethod} onSubmit={closeMenu}>
                <button
                  type="submit"
                  name="fulfilmentMethod"
                  value="DELIVERY"
                  data-tap-surface="location"
                  aria-current={method === "DELIVERY" ? "true" : undefined}
                  className={itemClass}
                >
                  <Icon name="truck" className="h-4 w-4 shrink-0 text-primary" />
                  <span className="flex-1">{deliveryLabel}</span>
                  {method === "DELIVERY" && (
                    <Icon name="check" className="h-4 w-4 shrink-0 text-action" />
                  )}
                </button>
              </form>
            ) : (
              // No usable postcode yet, so ask for one rather than selecting a
              // method the shopper cannot complete. A plain button because the
              // modal it opens is `<dialog>.showModal()`, which needs JS anyway —
              // there is no no-JS behaviour being given up here.
              <button
                type="button"
                onClick={() => openModal("delivery")}
                data-tap-surface="location"
                aria-current={method === "DELIVERY" ? "true" : undefined}
                className={itemClass}
              >
                <Icon name="truck" className="h-4 w-4 shrink-0 text-primary" />
                <span className="flex-1">Delivery</span>
                {method === "DELIVERY" && (
                  <Icon name="check" className="h-4 w-4 shrink-0 text-action" />
                )}
              </button>
            )}

            {/*
              #748 — the postcode was previously un-editable: the Delivery control
              opened the modal ONLY when no deliverable postcode was stored, so once
              one was set nothing on the page could reopen it. This is that missing
              affordance, and it is separate from the method items on purpose —
              changing where you live is not the same action as changing how you
              receive the order. #1087 turns that distinction into the submitted
              `edit` intent, which is what keeps this path from selecting Delivery.
            */}
            {postcode && (
              <button
                type="button"
                onClick={() => openModal("edit")}
                data-tap-surface="location"
                className={itemClass}
              >
                <Icon name="pencil" className="h-4 w-4 shrink-0 text-black/60" />
                <span className="flex-1">Change postcode</span>
              </button>
            )}
          </div>
        </details>
      ) : (
        // A vendor with no collection is always DELIVERY
        // (`lib/fulfilment-service.ts` checks that before the cookie), so this
        // single button carries delivery intent whether it is asking for a
        // postcode or changing one — there is no other method to protect.
        <button
          type="button"
          onClick={() => openModal("delivery")}
          className="flex min-h-tap items-center gap-1.5 bg-surface-muted hover:bg-black/5 text-black/80 px-3 py-2 rounded-xl text-xs font-bold transition border border-black/10 w-full sm:w-auto h-full lg:min-h-0"
          title={hasDeliverablePostcode ? "Change postcode" : "Check availability"}
          aria-label={hasDeliverablePostcode ? deliveryLabel : "Check delivery availability"}
        >
          {hasDeliverablePostcode ? (
            <Icon name="check" className="w-4 h-4 text-action" />
          ) : (
            <Icon name="truck" className="w-4 h-4 text-primary" />
          )}
          <span aria-hidden className="hidden sm:inline">
            {hasDeliverablePostcode ? `Delivery · ${postcode}` : "Check delivery availability"}
          </span>
          <span aria-hidden className="sm:hidden truncate">
            {hasDeliverablePostcode ? `Delivery · ${postcode}` : "Check delivery"}
          </span>
        </button>
      )}

      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/click-events-have-key-events */}
      <dialog
        data-location-dialog
        ref={dialogRef}
        onCancel={(e) => {
          e.preventDefault();
          closeModal();
        }}
        onClick={(e) => {
          if (e.target === dialogRef.current) {
            closeModal();
          }
        }}
        className="backdrop:bg-black/50 p-0 rounded-2xl shadow-2xl border border-black/10 m-auto w-[calc(100vw-2rem)] sm:w-[28rem] overflow-hidden"
      >
        <div data-tap-surface="location-dialog" className="bg-white p-6 flex flex-col">
          <h2 className="text-lg font-extrabold text-primary mb-2">Check delivery availability</h2>
          <p className="text-sm text-black/70 mb-5">
            Enter your postcode to check whether we deliver to your area.
          </p>

          <form
            action={(formData) => {
              startTransition(async () => {
                setIsDirty(false);
                await setDeliveryPostcode(formData);
              });
            }}
            className="flex flex-col gap-4"
          >
            {/*
              #1087 — which control opened this modal, read by
              `setDeliveryPostcode` to decide whether a deliverable postcode also
              selects Delivery. A hidden field rather than a closure argument so
              the value travels with the submission the action actually receives.
            */}
            <input type="hidden" name={POSTCODE_INTENT_FIELD} value={intent} />

            <div className="flex items-center gap-2">
              <div className="relative flex-1 flex items-center">
                <Icon
                  name="map-pin"
                  className="pointer-events-none absolute left-3 h-4 w-4 text-black/60"
                />
                <input
                  type="text"
                  name="postcode"
                  autoComplete="postal-code"
                  defaultValue={postcode ?? ""}
                  onChange={() => setIsDirty(true)}
                  aria-label="Delivery postcode"
                  placeholder="Enter postcode"
                  className="min-h-tap w-full rounded-xl border border-black/10 bg-surface-muted py-2.5 pl-9 pr-3 text-sm font-semibold text-black transition focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:bg-white lg:min-h-0"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={isPending}
                className="min-h-tap rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-primary/90 disabled:opacity-50 lg:min-h-0"
              >
                {isPending ? "Checking..." : "Check postcode"}
              </button>
            </div>

            {!isPending && !isDirty && postcode && deliverable === false && (
              <div className="mt-2 bg-danger-tint border border-danger/20 rounded-xl p-4">
                <p className="font-bold text-danger text-sm mb-1">
                  Delivery isn&apos;t available for {postcode}
                </p>
                {offerCollection && (
                  <p className="flex items-center gap-1.5 text-sm font-bold text-primary mt-3">
                    <Icon name="check" className="w-4 h-4 text-action" />
                    Click &amp; Collect is still available
                  </p>
                )}
              </div>
            )}

            <div className="flex justify-end mt-2">
              <button
                type="button"
                onClick={closeModal}
                className="min-h-tap text-sm font-bold text-black/60 hover:text-black transition-colors px-4 py-2 lg:min-h-0"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </dialog>
    </div>
  );
}
