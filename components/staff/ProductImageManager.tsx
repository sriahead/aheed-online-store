"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImageUp, Star, Trash2, ChevronUp, ChevronDown, Sparkles } from "lucide-react";
import {
  addProductImage,
  promoteProductImage,
  removeProductImage,
  reorderProductImages,
  requestImageUpload,
  approveProductImage,
} from "@/features/admin/product-image";
import {
  IMAGE_CONTENT_TYPE,
  IMAGE_QUALITY,
  MAX_IMAGE_EDGE_PX,
  fitWithinEdge,
} from "@/lib/product-image";

/**
 * Multi-image gallery management (#211, GAP-014/GAP-015): add a second+ image,
 * set which one is primary, remove one, reorder them.
 *
 * A SEPARATE component from ProductImageUploader.tsx, deliberately — that
 * component (and the primary-replacing upload it drives) is required to stay
 * unchanged, so its WebP-conversion step is duplicated here rather than
 * factored out from underneath it.
 *
 * Same posture as ProductImageUploader: no lib/storage or lib/config import
 * (would ship the aws4fetch signer to the browser), no <form> (sits beside
 * ProductForm's form, not inside it — nested forms are invalid HTML), plain
 * <img>, unsuppressed (next/image adoption is #46).
 *
 * Relies on Next's Server Action revalidation to refresh `images` from the
 * parent server component after each call — no router.refresh(), matching
 * how ProductImageUploader already leaves that to revalidatePath.
 */

export interface ProductImageManagerImage {
  id: string;
  url: string;
  alt: string;
  isPrimary: boolean;
}

export interface ProductImageManagerProps {
  productId: string;
  productName: string;
  images: ProductImageManagerImage[];
  imageNeedsReview: boolean;
}

const ACCEPTED_INPUT = "image/*";

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

export function ProductImageManager({ productId, productName, images, imageNeedsReview }: ProductImageManagerProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [generating, setGenerating] = useState(false);
  const router = useRouter();

  async function autoGenerateImage() {
    setError(null);
    setGenerating(true);
    try {
      const res = await fetch("/api/admin/product-images/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ productId, productName }),
      });
      const data = (await res.json()) as any;
      if (!res.ok) {
        throw new Error(data.error || "Failed to generate image");
      }
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setGenerating(false);
    }
  }

  function addAnother() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Choose an image first.");
      return;
    }

    setError(null);

    startTransition(async () => {
      let blob: Blob;
      try {
        blob = await toWebp(file);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "That image couldn't be read.");
        return;
      }

      const ticket = await requestImageUpload(productId, blob.size);
      if (!ticket.ok) {
        setError(ticket.error);
        return;
      }

      const put = await fetch(ticket.value.url, {
        method: "PUT",
        body: blob,
        headers: { "content-type": IMAGE_CONTENT_TYPE },
      });
      if (!put.ok) {
        setError(`The upload was rejected by storage (${put.status}).`);
        return;
      }

      const attached = await addProductImage(productId, ticket.value.key, productName);
      if (!attached.ok) {
        setError(attached.error);
        return;
      }

      if (fileRef.current) fileRef.current.value = "";
    });
  }

  function promote(imageId: string) {
    setError(null);
    startTransition(async () => {
      const result = await promoteProductImage(productId, imageId);
      if (!result.ok) setError(result.error);
    });
  }

  function remove(imageId: string) {
    setError(null);
    startTransition(async () => {
      const result = await removeProductImage(productId, imageId);
      if (!result.ok) setError(result.error);
    });
  }

  function approve() {
    setError(null);
    startTransition(async () => {
      const result = await approveProductImage(productId);
      if (!result.ok) setError(result.error);
    });
  }

  function move(index: number, direction: -1 | 1) {
    const next = images.map((image) => image.id);
    const swapWith = index + direction;
    if (swapWith < 0 || swapWith >= next.length) return;
    [next[index], next[swapWith]] = [next[swapWith], next[index]];

    setError(null);
    startTransition(async () => {
      const result = await reorderProductImages(productId, next);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <div className="space-y-3">
      {imageNeedsReview && (
        <div className="mb-4 rounded-xl border border-accent/30 bg-accent-tint p-4">
          <p className="mb-3 text-sm font-medium text-accent">
            An AI-generated image was added to this product and needs review.
          </p>
          <button
            type="button"
            onClick={approve}
            disabled={pending || generating}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-bold text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "Approving..." : "Approve Image"}
          </button>
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-xl bg-danger-tint px-4 py-3 text-sm font-medium text-danger"
        >
          {error}
        </p>
      )}

      {images.length === 0 ? (
        <p className="text-sm text-primary/60">No image yet.</p>
      ) : (
        <ul className="flex flex-wrap gap-3">
          {images.map((image, index) => (
            <li
              key={image.id}
              className="w-28 space-y-1 rounded-xl border border-black/10 p-2 text-center"
            >
              <div className="relative">
                <img
                  src={image.url}
                  alt={image.alt}
                  className="h-24 w-24 rounded-lg border border-black/10 object-cover"
                />
                {image.isPrimary && (
                  <span
                    title="Primary image"
                    className="absolute right-1 top-1 rounded-full bg-white/90 p-1 text-accent"
                  >
                    <Star className="h-3.5 w-3.5 fill-current" aria-hidden />
                  </span>
                )}
              </div>
              <div className="flex items-center justify-center gap-1">
                <button
                  type="button"
                  disabled={pending || index === 0}
                  onClick={() => move(index, -1)}
                  aria-label="Move earlier"
                  className="rounded-lg p-1 text-primary/70 hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <ChevronUp className="h-4 w-4" aria-hidden />
                </button>
                <button
                  type="button"
                  disabled={pending || index === images.length - 1}
                  onClick={() => move(index, 1)}
                  aria-label="Move later"
                  className="rounded-lg p-1 text-primary/70 hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <ChevronDown className="h-4 w-4" aria-hidden />
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => remove(image.id)}
                  aria-label="Remove image"
                  className="rounded-lg p-1 text-danger hover:bg-danger-tint disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </div>
              {!image.isPrimary && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => promote(image.id)}
                  className="w-full rounded-lg bg-surface-muted px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Set primary
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div>
        <label className="mb-1 block text-xs font-medium text-primary/70" htmlFor="addImageFile">
          Add another image — resized to {MAX_IMAGE_EDGE_PX}px and converted to WebP before
          uploading
        </label>
        <input
          id="addImageFile"
          ref={fileRef}
          type="file"
          accept={ACCEPTED_INPUT}
          className="w-full text-sm text-primary/80 file:mr-3 file:rounded-xl file:border-0 file:bg-surface-muted file:px-3 file:py-2 file:text-sm file:font-semibold file:text-primary"
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={addAnother}
          disabled={pending || generating}
          className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-primary/30 bg-white px-4 py-3 text-sm font-bold text-primary shadow-sm transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <ImageUp className="h-4 w-4" aria-hidden />
          {pending ? "Working…" : "Add another image"}
        </button>
        <button
          type="button"
          onClick={autoGenerateImage}
          disabled={pending || generating}
          className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-action/30 bg-action/10 px-4 py-3 text-sm font-bold text-action shadow-sm transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Sparkles className="h-4 w-4" aria-hidden />
          {generating ? "Generating…" : "✨ Auto-Generate Image"}
        </button>
      </div>
    </div>
  );
}
