import { submitReview } from "../submit-review";
import type { ReviewInput } from "@/lib/repositories/reviews";

/** Plain <form action={submitReview}> — no client-side JS, matches P2's zero-client-JS pattern. */
export function ReviewForm({
  productId,
  productSlug,
  existingReview,
}: {
  productId: string;
  productSlug: string;
  existingReview: ReviewInput | null;
}) {
  return (
    <form
      // Server Component refreshes (via revalidatePath after submit) re-render
      // this form with new `existingReview` props but don't remount its DOM
      // nodes — defaultValue only applies at mount, so an unkeyed <select>
      // silently keeps showing its old (pre-submit) value. Keying on the
      // review's identity forces a remount whenever it actually changes.
      key={existingReview ? `${existingReview.rating}:${existingReview.comment ?? ""}` : "new"}
      action={submitReview}
      className="flex flex-col gap-3 rounded-md border border-black/10 p-4"
    >
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="productSlug" value={productSlug} />
      <label className="flex flex-col gap-1">
        <span className="text-sm font-semibold text-primary">Your rating</span>
        <select
          name="rating"
          required
          defaultValue={existingReview?.rating ?? ""}
          className="w-24 rounded-sm border border-black/20 px-3 py-2"
        >
          <option value="" disabled>
            Select
          </option>
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-semibold text-primary">Comment (optional)</span>
        <textarea
          name="comment"
          defaultValue={existingReview?.comment ?? ""}
          rows={3}
          className="rounded-sm border border-black/20 px-3 py-2"
        />
      </label>
      <button
        type="submit"
        className="self-start rounded-full bg-action px-4 py-2 font-semibold text-white"
      >
        {existingReview ? "Update review" : "Submit review"}
      </button>
    </form>
  );
}
