"use client";

import { useState } from "react";
import { Star } from "lucide-react";

export interface StarRatingInputProps {
  name?: string;
  defaultValue?: number | null;
  value?: number;
  onChange?: (rating: number) => void;
  required?: boolean;
  disabled?: boolean;
  label?: string;
  labelClassName?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
  ratingLabels?: Record<number, string>;
}

export const DEFAULT_RATING_LABELS: Record<number, string> = {
  1: "Poor",
  2: "Fair",
  3: "Good",
  4: "Very Good",
  5: "Excellent",
};

const STAR_SIZES = {
  sm: "h-5 w-5",
  md: "h-6 w-6",
  lg: "h-7 w-7",
};

/**
 * Clickable star rating input replacing traditional <select> dropdowns.
 *
 * Uses accessible radio inputs under the hood for keyboard navigation (arrows/Tab),
 * screen-reader support, and zero-JS form serialization, with an interactive
 * hover/click visual layer and descriptive labels (Poor, Fair, Good, Very Good, Excellent).
 */
export function StarRatingInput({
  name = "rating",
  defaultValue = null,
  value,
  onChange,
  required = true,
  disabled = false,
  label = "Your rating",
  labelClassName = "text-xs font-semibold text-primary",
  size = "md",
  className = "",
  ratingLabels = DEFAULT_RATING_LABELS,
}: StarRatingInputProps) {
  const [internalRating, setInternalRating] = useState<number>(defaultValue ?? 0);
  const [hoveredRating, setHoveredRating] = useState<number>(0);

  const isControlled = value !== undefined;
  const currentRating = isControlled ? value : internalRating;
  const activeRating = hoveredRating > 0 ? hoveredRating : currentRating;

  const handleSelect = (star: number) => {
    if (disabled) return;
    if (!isControlled) {
      setInternalRating(star);
    }
    onChange?.(star);
  };

  const starSizeClass = STAR_SIZES[size] ?? STAR_SIZES.md;

  return (
    <fieldset className={`flex flex-col gap-1.5 border-0 p-0 m-0 ${className}`}>
      {label && <legend className={labelClassName}>{label}</legend>}
      {/* #981 — `flex-wrap` so the rating-label text drops to its own line when the 44px stars
      leave it no room. Measured at 360px inside Quick View: the review form has 288px of content
      box, five 44px stars plus their gaps are 228px (which fits), but adding this row's gap and
      the label's `min-w-[75px]` needs 313px. Without the wrap that 25px widened the page. */}
      <div className="flex flex-wrap items-center gap-2.5">
        <div
          data-testid="star-rating-container"
          className="flex items-center gap-0.5"
          onMouseLeave={() => !disabled && setHoveredRating(0)}
        >
          {[1, 2, 3, 4, 5].map((star) => {
            const isFilled = star <= activeRating;
            const isChecked = currentRating === star;

            return (
              <label
                key={star}
                // #981 — the LABEL is the tap target (the radio is absolutely positioned to fill
                // it), so it carries `tap` below `lg` while the Star icon keeps its own size.
                // `lg:min-h-0 lg:min-w-0` restores the exact pre-#981 desktop box.
                className={`group relative flex min-h-tap min-w-tap lg:min-h-0 lg:min-w-0 cursor-pointer items-center justify-center p-1 rounded transition-transform hover:scale-110 motion-reduce:hover:scale-100 active:scale-95 motion-reduce:active:scale-100 focus-within:ring-2 focus-within:ring-action ${
                  disabled ? "cursor-not-allowed opacity-50" : ""
                }`}
                onMouseEnter={() => !disabled && setHoveredRating(star)}
              >
                <input
                  type="radio"
                  name={name}
                  value={star}
                  checked={isChecked}
                  onChange={() => handleSelect(star)}
                  required={required}
                  disabled={disabled}
                  aria-label={`${star} ${star === 1 ? "star" : "stars"} - ${ratingLabels[star] ?? ""}`}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                />
                <Star
                  className={`${starSizeClass} transition-colors ${
                    isFilled
                      ? "fill-amber-400 text-amber-400"
                      : "fill-transparent text-primary-subtle group-hover:text-amber-300"
                  }`}
                  aria-hidden="true"
                />
              </label>
            );
          })}
        </div>
        <span className="text-xs font-medium text-primary-muted min-w-[75px]" aria-live="polite">
          {activeRating > 0
            ? (ratingLabels[activeRating] ??
              `${activeRating} ${activeRating === 1 ? "star" : "stars"}`)
            : "Select rating"}
        </span>
      </div>
    </fieldset>
  );
}
