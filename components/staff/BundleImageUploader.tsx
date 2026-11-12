"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  approveBundleImage,
  attachBundleImage,
  removeBundleImage,
  requestBundleImageUpload,
} from "@/features/admin/bundle-image";
import {
  IMAGE_CONTENT_TYPE,
  IMAGE_QUALITY,
  MAX_IMAGE_EDGE_PX,
  fitWithinEdge,
} from "@/lib/product-image";
import { Icon } from "@/components/icons/Icon";

/**
 * Bundle image uploader (P8.5c, #347) — the same resize/re-encode → presign →
 * PUT → attach shape as `CampaignBannerUploader.tsx` (P8.5e), scoped to a
 * bundle. R32 asks for this reuse of `lib/product-image.ts`'s constants
 * explicitly rather than a shared abstraction none of the three uploaders needs
 * yet.
 *
 * #1535 — the same options as a product's photo: Auto-Generate (admins only; the
 * prompt is built server-side from the bundle's contents), Remove, and a "Needs
 * review" flag on a generated photo until someone approves or replaces it.
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

export function BundleImageUploader({
  bundleId,
  imageUrl,
  existingAltText,
  needsReview,
  canGenerate,
}: {
  bundleId: string;
  imageUrl: string | null;
  existingAltText: string | null;
  needsReview: boolean;
  canGenerate: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [altText, setAltText] = useState(existingAltText ?? "");
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const busy = pending || generating;

  // A generated photo arrives with derived alt text via a server refresh; show it. Adjusted during
  // render when the prop changes, rather than in an effect.
  const [altSource, setAltSource] = useState(existingAltText);
  if (altSource !== existingAltText) {
    setAltSource(existingAltText);
    setAltText(existingAltText ?? "");
  }

  function upload() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Choose an image first.");
      return;
    }
    if (altText.trim() === "") {
      setError("Describe the photo (alt text) first.");
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

      const ticket = await requestBundleImageUpload(bundleId, blob.size);
      if (!ticket.ok) {
        setError(ticket.error);
        return;
      }

      const put = await fetch(ticket.value.url, {
        method: "PUT",
        headers: { "Content-Type": IMAGE_CONTENT_TYPE },
        body: blob,
      });
      if (!put.ok) {
        setError("The upload was rejected by storage.");
        return;
      }

      const attached = await attachBundleImage(bundleId, ticket.value.key, altText.trim());
      if (!attached.ok) {
        setError(attached.error);
        return;
      }

      if (fileRef.current) fileRef.current.value = "";
      // The refresh clears the review flag (an upload is never flagged) and brings the new URL.
      router.refresh();
    });
  }

  async function generate() {
    setError(null);
    setGenerating(true);
    try {
      const res = await fetch("/api/admin/bundle-images/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bundleId }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? `The photo could not be generated (${res.status}).`);
        return;
      }
      router.refresh();
    } catch {
      setError("The photo could not be generated.");
    } finally {
      setGenerating(false);
    }
  }

  function remove() {
    setError(null);
    startTransition(async () => {
      const result = await removeBundleImage(bundleId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function approve() {
    setError(null);
    startTransition(async () => {
      const result = await approveBundleImage(bundleId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  const displayUrl = imageUrl;

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-black/10 bg-surface-muted p-5">
      <div>
        <h2 className="text-sm font-bold text-primary">Bundle photo</h2>
        <p className="mt-0.5 text-xs text-primary-muted">
          Optional — a bundle with no photo shows a plain card, not a broken image.
        </p>
      </div>

      {displayUrl && needsReview && (
        <div className="rounded-xl border border-accent/30 bg-accent-tint p-4">
          <p className="mb-3 text-sm font-medium text-accent">
            This photo was generated by AI and needs review. Approve it, or replace or remove it.
          </p>
          <button
            type="button"
            onClick={approve}
            disabled={busy}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-bold text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "Saving…" : "Approve photo"}
          </button>
        </div>
      )}

      {displayUrl && (
        <div className="flex flex-wrap items-end gap-3">
          <div className="relative h-32 w-full max-w-xs overflow-hidden rounded-lg border border-black/10 bg-white">
            <img src={displayUrl} alt={altText || ""} className="h-full w-full object-cover" />
          </div>
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-danger hover:underline disabled:opacity-50"
          >
            <Icon name="trash" className="h-3.5 w-3.5" />
            Remove photo
          </button>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <label htmlFor="bundle-alt" className="text-xs font-medium text-primary-muted">
          Photo description (alt text)
        </label>
        <input
          id="bundle-alt"
          type="text"
          value={altText}
          onChange={(event) => setAltText(event.target.value)}
          placeholder="e.g. The products in this bundle arranged together"
          className="rounded-xl border border-black/15 bg-white px-3 py-2 text-sm focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2"
        />

        <label htmlFor="bundle-upload" className="mt-2 text-xs font-medium text-primary-muted">
          {displayUrl ? "Replace photo" : "Upload photo"}
        </label>
        <p className="text-xs text-primary-muted">
          Resized to {MAX_IMAGE_EDGE_PX}px and converted to WebP before uploading.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <input
            id="bundle-upload"
            ref={fileRef}
            type="file"
            accept="image/*"
            disabled={busy}
            className="file:mr-4 file:rounded-full file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-bold file:text-white hover:file:bg-primary/90 disabled:opacity-50"
          />
          <button
            type="button"
            disabled={busy}
            onClick={upload}
            className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-bold text-primary hover:bg-black/5 disabled:opacity-50"
          >
            <Icon name="image-up" className="h-4 w-4" />
            {pending ? "Uploading…" : "Upload"}
          </button>
          {canGenerate && (
            <button
              type="button"
              disabled={busy}
              onClick={generate}
              className="inline-flex items-center gap-2 rounded-full bg-action px-4 py-2 text-sm font-bold text-white hover:bg-action-hover disabled:opacity-50"
            >
              <Icon name="sparkles" className="h-4 w-4" />
              {generating
                ? "Generating…"
                : displayUrl
                  ? "Regenerate with AI"
                  : "Auto-Generate with AI"}
            </button>
          )}
        </div>
        {canGenerate && (
          <p className="text-xs text-primary-muted">
            The AI photo is described from what&apos;s in the bundle and counts against today&apos;s
            AI allowance. It stays marked for review until you approve it.
          </p>
        )}

        {error && (
          <p role="alert" className="text-sm font-bold text-danger">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
