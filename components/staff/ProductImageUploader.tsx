"use client";

import { useRef, useState, useTransition } from "react";
import { ImageUp } from "lucide-react";
import { attachProductImage, requestImageUpload } from "@/features/admin/product-image";
import {
  IMAGE_CONTENT_TYPE,
  IMAGE_QUALITY,
  MAX_IMAGE_EDGE_PX,
  fitWithinEdge,
} from "@/lib/product-image";

/**
 * Product image upload (P6b2, #167).
 *
 * The browser converts the chosen file to WebP, PUTs it straight to object
 * storage with a Worker-signed URL, then asks the server to record the key. No
 * image byte passes through the Worker, so Workers' request-size and CPU limits
 * are not in the upload path.
 *
 * Conversion happens HERE because it can only happen here — the Worker never
 * sees the bytes. That also means storage only ever receives WebP at a sane
 * size, so the .webp key convention holds literally rather than by hope.
 *
 * This component imports lib/product-image (pure constants and arithmetic) but
 * NEVER lib/storage or lib/config: those carry the aws4fetch signer and the
 * secret-reading config loader, and importing either from a "use client" module
 * would ship both to the browser. Same constraint ProductForm documents for
 * composePublicUrl.
 *
 * It renders no <form>. It is placed beside ProductForm's form, not inside it —
 * nested forms are invalid HTML, and a file input inside the product form would
 * ride along with every field save.
 *
 * Colours are semantic design tokens per design-system.md, never raw hex.
 */

export interface ProductImageUploaderProps {
  productId: string;
  /** Shown as the fallback alt hint; the server applies the real fallback. */
  productName: string;
}

/** Anything the browser can decode. The server only ever accepts what we encode. */
const ACCEPTED_INPUT = "image/*";

/**
 * Decode, downscale and re-encode to WebP.
 *
 * `imageOrientation: "from-image"` applies the EXIF rotation, which is the
 * difference between a phone photo appearing upright and appearing on its side —
 * a canvas drawn from a raw bitmap ignores EXIF entirely.
 */
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

export function ProductImageUploader({ productId, productName }: ProductImageUploaderProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [alt, setAlt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState<string | null>(null);
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

      // The size the server signs for is the size AFTER conversion — the source
      // file's size is irrelevant, and a 12 MB phone photo routinely converts to
      // well under the cap.
      const ticket = await requestImageUpload(productId, blob.size);
      if (!ticket.ok) {
        setError(ticket.error);
        return;
      }

      const put = await fetch(ticket.value.url, {
        method: "PUT",
        body: blob,
        // Must match the content type the URL was signed for, exactly.
        headers: { "content-type": IMAGE_CONTENT_TYPE },
      });
      if (!put.ok) {
        setError(`The upload was rejected by storage (${put.status}).`);
        return;
      }

      const attached = await attachProductImage(productId, ticket.value.key, alt);
      if (!attached.ok) {
        setError(attached.error);
        return;
      }

      setUploaded(attached.value.url);
      if (fileRef.current) fileRef.current.value = "";
    });
  }

  return (
    <div className="space-y-3 border-t border-black/10 pt-4">
      {error && (
        <p
          role="alert"
          className="rounded-xl bg-danger-tint px-4 py-3 text-sm font-medium text-danger"
        >
          {error}
        </p>
      )}
      {uploaded && !error && (
        <p
          role="status"
          className="rounded-xl bg-action-tint px-4 py-3 text-sm font-medium text-primary"
        >
          Image updated.
        </p>
      )}

      {uploaded && (
        /* Plain <img>, unsuppressed, exactly as ProductForm, ProductCard and
           ProductImageGallery do it — next/image adoption is #46 and is a
           storefront-wide decision, not one to pre-empt here. */
        <img
          src={uploaded}
          alt={alt.trim() === "" ? productName : alt}
          className="h-24 w-24 rounded-xl border border-black/10 object-cover"
        />
      )}

      <div>
        <label className="mb-1 block text-xs font-medium text-primary/70" htmlFor="imageFile">
          New image — resized to {MAX_IMAGE_EDGE_PX}px and converted to WebP before uploading
        </label>
        <input
          id="imageFile"
          ref={fileRef}
          type="file"
          accept={ACCEPTED_INPUT}
          className="w-full text-sm text-primary/80 file:mr-3 file:rounded-xl file:border-0 file:bg-surface-muted file:px-3 file:py-2 file:text-sm file:font-semibold file:text-primary"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-primary/70" htmlFor="imageAlt">
          Description for screen readers — blank uses the product name
        </label>
        <input
          id="imageAlt"
          value={alt}
          onChange={(event) => setAlt(event.target.value)}
          placeholder={productName}
          className="w-full rounded-xl border border-black/15 bg-surface-muted px-3 py-2 text-sm focus:border-primary focus:bg-white focus:outline-none"
        />
      </div>

      {/*
        type="button" is load-bearing even though this sits outside ProductForm's
        <form>: a bare <button> defaults to submit, and this component is one
        refactor away from being nested inside one.
      */}
      <button
        type="button"
        onClick={upload}
        disabled={pending}
        className="flex items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-bold text-white shadow-md transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <ImageUp className="h-4 w-4" aria-hidden />
        {pending ? "Uploading…" : "Upload image"}
      </button>
    </div>
  );
}
