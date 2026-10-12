"use client";

import { useRef, useState, useTransition } from "react";
import { ImageUp } from "lucide-react";
import { requestMarkUpload, attachVendorMark } from "@/features/admin/storefront";
import {
  MARK_CONTENT_TYPE,
  MARK_FILES,
  MARK_MIN_SOURCE_EDGE_PX,
  containInSquare,
  markEdgeFor,
  type MarkFileId,
} from "@/lib/vendor-mark";

const TOO_SMALL = `This image is too small — use one at least ${MARK_MIN_SOURCE_EDGE_PX} pixels wide or tall.`;

class MarkTooSmallError extends Error {}

/**
 * #1069 — draw the five mark files in the browser. Each is a PNG: the mark is contained in its
 * square (never cropped), and `180.png` and `og.png` are filled with the vendor's cream first
 * (see `MARK_FILES`). Done client-side, like the logo's WebP conversion, so the Worker never does
 * image work.
 */
async function renderMarkFiles(file: File, cream: string): Promise<Record<MarkFileId, Blob>> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    if (Math.max(bitmap.width, bitmap.height) < MARK_MIN_SOURCE_EDGE_PX) {
      throw new MarkTooSmallError(TOO_SMALL);
    }

    const out = {} as Record<MarkFileId, Blob>;
    for (const spec of MARK_FILES) {
      const canvas = document.createElement("canvas");
      canvas.width = spec.width;
      canvas.height = spec.height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("This browser can't process images.");

      if (spec.creamBackground) {
        context.fillStyle = cream;
        context.fillRect(0, 0, spec.width, spec.height);
      }
      context.imageSmoothingQuality = "high";
      const rect = containInSquare(
        bitmap.width,
        bitmap.height,
        spec.width,
        spec.height,
        markEdgeFor(spec),
      );
      context.drawImage(bitmap, rect.x, rect.y, rect.width, rect.height);

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, MARK_CONTENT_TYPE),
      );
      if (!blob) throw new Error("This browser can't produce PNG images.");
      out[spec.id] = blob;
    }
    return out;
  } finally {
    bitmap.close();
  }
}

export function VendorMarkUploader({
  currentMarkUrl,
  cream,
}: {
  currentMarkUrl: string | null;
  /** The vendor's saved `brandCream`, used behind `180.png` and `og.png`. */
  cream: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
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
      let blobs: Record<MarkFileId, Blob>;
      try {
        blobs = await renderMarkFiles(file, cream);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "That image couldn't be read.");
        return;
      }

      const sizes = Object.fromEntries(MARK_FILES.map((f) => [f.id, blobs[f.id].size])) as Record<
        MarkFileId,
        number
      >;
      const ticket = await requestMarkUpload(sizes);
      if (!ticket.ok) {
        setError(ticket.error);
        return;
      }

      // #749's shape: a thrown network error is caught and a refused PUT reports its status. Nothing
      // is attached unless every one of the five PUTs succeeded.
      for (const spec of MARK_FILES) {
        let put: Response;
        try {
          put = await fetch(ticket.value.uploads[spec.id], {
            method: "PUT",
            headers: { "Content-Type": MARK_CONTENT_TYPE },
            body: blobs[spec.id],
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
      }

      const attached = await attachVendorMark(ticket.value.markStorageKey);
      if (!attached.ok) {
        setError(attached.error);
        return;
      }

      setUploaded(URL.createObjectURL(blobs.icon192));
    });
  }

  const displayUrl = uploaded || currentMarkUrl;

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-black/10 bg-black/5 p-4">
      <h3 className="font-bold text-black">Square mark</h3>
      <p className="text-sm text-black/60">
        Your square symbol. It is used for the browser tab icon, the phone home-screen icon, the
        picture shown when someone shares a link to your shop, and the header on phones.
      </p>
      {displayUrl && (
        <div className="relative h-32 w-32 overflow-hidden rounded-lg border border-black/10 bg-white">
          <img
            src={displayUrl}
            alt="Current square mark"
            className="h-full w-full object-contain"
          />
        </div>
      )}

      <div className="flex flex-col gap-2">
        <label htmlFor="mark-upload" className="text-sm font-bold text-black/60">
          Replace square mark
        </label>
        <p className="text-sm text-black/60">
          At least {MARK_MIN_SOURCE_EDGE_PX} pixels wide or tall. A rectangular image is fitted
          inside the square, not cropped.
        </p>
        <div className="flex items-center gap-3">
          <input
            id="mark-upload"
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
            <ImageUp className="h-4 w-4" />
            {pending ? "Uploading…" : "Upload image"}
          </button>
        </div>
        {error && <p className="text-sm font-bold text-red-600">{error}</p>}
      </div>
    </div>
  );
}
