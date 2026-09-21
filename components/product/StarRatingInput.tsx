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
}

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
 * hover/click visual layer.
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
      <div className="flex items-center gap-2.5">
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
                className={`group relative flex cursor-pointer items-center justify-center p-1 rounded transition-transform hover:scale-110 motion-reduce:hover:scale-100 active:scale-95 motion-reduce:active:scale-100 focus-within:ring-2 focus-within:ring-action ${
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
                  aria-label={`${star} ${star === 1 ? "star" : "stars"}`}
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
        <span className="text-xs font-medium text-primary-muted min-w-[70px]" aria-live="polite">
          {activeRating > 0
            ? `${activeRating} ${activeRating === 1 ? "star" : "stars"}`
            : "Select rating"}
        </span>
      </div>
    </fieldset>
  );
}
