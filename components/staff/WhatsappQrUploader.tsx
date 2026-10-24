"use client";

import { useRef, useState, useTransition } from "react";
import {
  attachWhatsappQr,
  removeWhatsappQr,
  requestWhatsappQrUpload,
} from "@/features/admin/storefront";
import {
  IMAGE_CONTENT_TYPE,
  IMAGE_QUALITY,
  MAX_IMAGE_EDGE_PX,
  fitWithinEdge,
} from "@/lib/product-image";
import { Icon } from "@/components/icons/Icon";

async function toWebp(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const { width, height } = fitWithinEdge(bitmap.width, bitmap.height, MAX_IMAGE_EDGE_PX);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser can't process images.");
    context.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, IMAGE_CONTENT_TYPE, IMAGE_QUALITY),
    );
    if (!blob) throw new Error("This browser can't produce WebP images.");
    return blob;
  } finally {
    bitmap.close();
  }
}

/**
 * #1233 — upload, replace, or remove the vendor's WhatsApp group QR code image on `/staff/storefront`.
 * Mirrors `VendorLogoUploader` with an explicit Remove button so an admin can clear the QR code back
 * to `null` (hiding the QR card on `/whatsapp-offers`).
 */
export function WhatsappQrUploader({ currentQrUrl }: { currentQrUrl: string | null }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState<string | null>(null);
  const [removed, setRemoved] = useState(false);
  const [pending, startTransition] = useTransition();

  function upload() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Choose an image first.");
      return;
    }

    setError(null);
    setUploaded(null);

    startTransition(async () => {
      let blob: Blob;
      try {
        blob = await toWebp(file);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "That image couldn't be read.");
        return;
      }

      const ticket = await requestWhatsappQrUpload(blob.size);
      if (!ticket.ok) {
        setError(ticket.error);
        return;
      }

      let put: Response;
      try {
        put = await fetch(ticket.value.url, {
          method: "PUT",
          headers: { "Content-Type": IMAGE_CONTENT_TYPE },
          body: blob,
        });
      } catch (cause) {
        setError(
          `The upload could not reach storage: ${cause instanceof Error ? cause.message : "network error"}.`,
        );
        return;
      }

      if (!put.ok) {
        setError(`The upload was rejected by storage (HTTP ${put.status}).`);
        return;
      }

      const attached = await attachWhatsappQr(ticket.value.key);
      if (!attached.ok) {
        setError(attached.error);
        return;
      }

      setRemoved(false);
      setUploaded(URL.createObjectURL(blob));
    });
  }

  function remove() {
    setError(null);
    startTransition(async () => {
      const result = await removeWhatsappQr();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setUploaded(null);
      setRemoved(true);
    });
  }

  const displayUrl = removed ? null : uploaded || currentQrUrl;

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-black/10 bg-black/5 p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-bold text-black">WhatsApp Group QR Code</h3>
        {displayUrl && (
          <button
            type="button"
            disabled={pending}
            onClick={remove}
            className="inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-white px-3 py-1.5 text-xs font-bold text-danger hover:bg-black/5 disabled:opacity-50"
          >
            <Icon name="trash" className="h-3.5 w-3.5" />
            Remove QR code
          </button>
        )}
      </div>

      {displayUrl && (
        <div className="relative h-36 w-36 overflow-hidden rounded-lg border border-black/10 bg-white p-2">
          <img
            src={displayUrl}
            alt="WhatsApp group QR code preview"
            className="h-full w-full object-contain"
          />
        </div>
      )}

      <div className="flex flex-col gap-2">
        <label htmlFor="whatsapp-qr-upload" className="text-sm font-bold text-black/60">
          {displayUrl ? "Replace QR code image" : "Upload QR code image"}
        </label>
        <p className="text-sm text-black/60">
          Shown alongside your WhatsApp group invite button on the Offers &amp; Deals page so
          shoppers on a computer or scanning printed materials can join with their phone camera.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <input
            id="whatsapp-qr-upload"
            ref={fileRef}
            type="file"
            accept="image/*"
            disabled={pending}
            className="file:mr-4 file:rounded-full file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-bold file:text-white hover:file:bg-primary/90 disabled:opacity-50"
          />
          <button
            type="button"
            disabled={pending}
            onClick={upload}
            className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-bold text-black hover:bg-black/5 disabled:opacity-50"
          >
            <Icon name="image-up" className="h-4 w-4" />
            {pending ? "Uploading…" : "Upload QR code"}
          </button>
        </div>
        {error && <p className="text-sm font-bold text-danger">{error}</p>}
      </div>
    </div>
  );
}
