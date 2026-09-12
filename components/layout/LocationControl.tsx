"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import { Truck, MapPin, Store, Check, X } from "lucide-react";
import { setDeliveryPostcode } from "@/features/storefront/delivery";

export function LocationControl({
  postcode,
  deliverable,
  offerCollection,
}: {
  postcode: string | null;
  deliverable: boolean | null;
  offerCollection: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  
  const defaultMode = (postcode && deliverable) ? "DELIVERY" : (offerCollection ? "COLLECTION" : "DELIVERY");
  const [mode, setMode] = useState<"DELIVERY" | "COLLECTION">(defaultMode);
  
  const [isPending, startTransition] = useTransition();
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    // Automatically manage modal state and mode based on incoming server state once loading finishes
    if (isPending) return;

    if (postcode && deliverable) {
      if (dialogRef.current?.open) {
        dialogRef.current.close();
      }
      // eslint-disable-next-line
      setMode("DELIVERY");
    } else if (postcode && deliverable === false) {
      if (offerCollection) {
        // eslint-disable-next-line
        setMode("COLLECTION");
      }
    }
  }, [postcode, deliverable, isPending, offerCollection]);

  const openModal = () => {
    setIsDirty(false);
    dialogRef.current?.showModal();
  };

  const closeModal = () => {
    dialogRef.current?.close();
    if (!(postcode && deliverable) && offerCollection) {
      setMode("COLLECTION");
    }
  };

  return (
    <div className="flex h-full items-center">
      {offerCollection ? (
        <div className="flex bg-surface-muted rounded-xl p-1 border border-black/10">
          <button
            type="button"
            onClick={() => setMode("COLLECTION")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
              mode === "COLLECTION"
                ? "bg-white text-primary shadow-sm border border-black/5"
                : "text-black/60 hover:text-black"
            }`}
          >
            <Store className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Click & Collect</span>
            <span className="sm:hidden">Collect</span>
          </button>
          
          <button
            type="button"
            onClick={() => {
              if (postcode && deliverable) {
                setMode("DELIVERY");
              } else {
                openModal();
              }
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
              mode === "DELIVERY"
                ? "bg-white text-primary shadow-sm border border-black/5"
                : "text-black/60 hover:text-black"
            }`}
          >
            {mode === "DELIVERY" && postcode && deliverable ? (
              <Check className="w-3.5 h-3.5 text-action" />
            ) : (
              <Truck className="w-3.5 h-3.5" />
            )}
            <span className="hidden sm:inline">
              {mode === "DELIVERY" && postcode && deliverable ? `Delivery · ${postcode}` : "Delivery"}
            </span>
            <span className="sm:hidden">
              {mode === "DELIVERY" && postcode && deliverable ? postcode : "Delivery"}
            </span>
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={openModal}
          className="flex items-center gap-1.5 bg-surface-muted hover:bg-black/5 text-black/80 px-3 py-2 rounded-xl text-xs font-bold transition border border-black/10 w-full sm:w-auto h-full"
          title="Check availability"
        >
          {postcode && deliverable ? (
            <Check className="w-4 h-4 text-action" />
          ) : (
            <Truck className="w-4 h-4 text-primary" />
          )}
          <span className="hidden sm:inline">
            {postcode && deliverable ? `Delivery · ${postcode}` : "Check delivery availability"}
          </span>
          <span className="sm:hidden truncate">
            {postcode && deliverable ? `Delivery · ${postcode}` : "Check delivery"}
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
                <MapPin className="pointer-events-none absolute left-3 h-4 w-4 text-black/60" aria-hidden />
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
                    Click & Collect is still available
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
