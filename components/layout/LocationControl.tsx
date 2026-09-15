"use client";

import { useRef, useEffect, useState, useTransition } from "react";
import { Truck, MapPin, Store, Check, Pencil } from "lucide-react";
import { setDeliveryPostcode, setFulfilmentMethod } from "@/features/storefront/delivery";
import type { FulfilmentMethodChoice } from "@/lib/fulfilment-cookie";

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
 * Both controls are real `<form>` submissions, so the toggle works with client
 * JavaScript disabled — same posture as the postcode form it sits beside.
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

  const [isPending, startTransition] = useTransition();
  const [isDirty, setIsDirty] = useState(false);
  const hasDeliverablePostcode = Boolean(postcode && deliverable);

  // Close the modal once a submitted postcode comes back deliverable. This
  // deliberately no longer touches the fulfilment method: it used to force
  // DELIVERY here, so a shopper who had chosen Click & Collect and then edited
  // their postcode was silently switched back to Delivery (#748).
  useEffect(() => {
    if (isPending) return;
    if (hasDeliverablePostcode && dialogRef.current?.open) {
      dialogRef.current.close();
    }
  }, [hasDeliverablePostcode, isPending]);

  const openModal = () => {
    setIsDirty(false);
    dialogRef.current?.showModal();
  };
  const closeModal = () => dialogRef.current?.close();

  const toggleClass = (active: boolean) =>
    `flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
      active
        ? "bg-white text-primary shadow-sm border border-black/5"
        : "text-black/60 hover:text-black"
    }`;

  const deliveryLabel =
    method === "DELIVERY" && hasDeliverablePostcode ? `Delivery · ${postcode}` : "Delivery";

  return (
    <div className="flex h-full items-center">
      {offerCollection ? (
        <div className="flex bg-surface-muted rounded-xl p-1 border border-black/10">
          {/*
            Bound straight to the server action — NOT to a client function — so
            the toggle submits with client JavaScript disabled. The chosen value
            rides on the submitting button's own name/value pair.
          */}
          <form action={setFulfilmentMethod}>
            <button
              type="submit"
              name="fulfilmentMethod"
              value="COLLECTION"
              className={toggleClass(method === "COLLECTION")}
            >
              <Store className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Click &amp; Collect</span>
              <span className="sm:hidden">Collect</span>
            </button>
          </form>

          {hasDeliverablePostcode ? (
            <form action={setFulfilmentMethod}>
              <button
                type="submit"
                name="fulfilmentMethod"
                value="DELIVERY"
                className={toggleClass(method === "DELIVERY")}
              >
                {method === "DELIVERY" ? (
                  <Check className="w-3.5 h-3.5 text-action" />
                ) : (
                  <Truck className="w-3.5 h-3.5" />
                )}
                <span className="hidden sm:inline">{deliveryLabel}</span>
                <span className="sm:hidden">{method === "DELIVERY" ? postcode : "Delivery"}</span>
              </button>
            </form>
          ) : (
            // No usable postcode yet, so ask for one rather than selecting a
            // method the shopper cannot complete. A plain button because the
            // modal it opens is `<dialog>.showModal()`, which needs JS anyway —
            // there is no no-JS behaviour being given up here.
            <button type="button" onClick={openModal} className={toggleClass(false)}>
              <Truck className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Delivery</span>
              <span className="sm:hidden">Delivery</span>
            </button>
          )}

          {/*
            #748 — the postcode was previously un-editable: the Delivery button
            opened the modal ONLY when no deliverable postcode was stored, so once
            one was set nothing on the page could reopen it. This is that missing
            affordance, and it is separate from the method toggle on purpose —
            changing where you live is not the same action as changing how you
            receive the order.
          */}
          {postcode && (
            <button
              type="button"
              onClick={openModal}
              aria-label={`Change delivery postcode (currently ${postcode})`}
              title="Change postcode"
              className="flex items-center px-2 text-black/60 transition-colors hover:text-primary"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={openModal}
          className="flex items-center gap-1.5 bg-surface-muted hover:bg-black/5 text-black/80 px-3 py-2 rounded-xl text-xs font-bold transition border border-black/10 w-full sm:w-auto h-full"
          title={hasDeliverablePostcode ? "Change postcode" : "Check availability"}
        >
          {hasDeliverablePostcode ? (
            <Check className="w-4 h-4 text-action" />
          ) : (
            <Truck className="w-4 h-4 text-primary" />
          )}
          <span className="hidden sm:inline">
            {hasDeliverablePostcode ? `Delivery · ${postcode}` : "Check delivery availability"}
          </span>
          <span className="sm:hidden truncate">
            {hasDeliverablePostcode ? `Delivery · ${postcode}` : "Check delivery"}
          </span>
        </button>
      )}

      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/click-events-have-key-events */}
      <dialog
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
        <div className="bg-white p-6 flex flex-col">
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
            <div className="flex items-center gap-2">
              <div className="relative flex-1 flex items-center">
                <MapPin
                  className="pointer-events-none absolute left-3 h-4 w-4 text-black/60"
                  aria-hidden
                />
                <input
                  type="text"
                  name="postcode"
                  defaultValue={postcode ?? ""}
                  onChange={() => setIsDirty(true)}
                  aria-label="Delivery postcode"
                  placeholder="Enter postcode"
                  className="w-full rounded-xl border border-black/10 bg-surface-muted py-2.5 pl-9 pr-3 text-sm font-semibold text-black transition focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:bg-white"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={isPending}
                className="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
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
                    <Check className="w-4 h-4 text-action" />
                    Click &amp; Collect is still available
                  </p>
                )}
              </div>
            )}

            <div className="flex justify-end mt-2">
              <button
                type="button"
                onClick={closeModal}
                className="text-sm font-bold text-black/60 hover:text-black transition-colors px-4 py-2"
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
