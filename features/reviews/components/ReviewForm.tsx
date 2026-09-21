import { submitReview } from "../submit-review";
import type { ReviewInput } from "@/lib/repositories/reviews";
import { StarRatingInput } from "@/components/product/StarRatingInput";

/** Product review form with clickable star rating and server action submission. */
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
      // nodes — defaultValue only applies at mount, so an unkeyed form
      // silently keeps showing its old (pre-submit) value. Keying on the
      // review's identity forces a remount whenever it actually changes.
      key={existingReview ? `${existingReview.rating}:${existingReview.comment ?? ""}` : "new"}
      action={submitReview}
      className="flex flex-col gap-3 rounded-2xl border border-black/10 p-4"
    >
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="productSlug" value={productSlug} />
      <StarRatingInput
        name="rating"
        defaultValue={existingReview?.rating ?? null}
        labelClassName="text-sm font-semibold text-primary"
        required
      />
      <label className="flex flex-col gap-1">
        <span className="text-sm font-semibold text-primary">Comment (optional)</span>
        <textarea
          name="comment"
          defaultValue={existingReview?.comment ?? ""}
          rows={3}
          className="rounded-lg border border-black/20 px-3 py-2"
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
