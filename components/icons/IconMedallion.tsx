"use client";

import { Icon } from "./Icon";
import { Icon3D, ICON_3D_IMAGE_ASSETS, type Icon3DName } from "./Icon3D";
import { useActiveSlotIcons } from "./ActiveSlotIconsProvider";
import type { IconName } from "./registry";
import { ImageWithFallback } from "@/components/ui/ImageWithFallback";
import { slotIdForIcon3D, slotIdForIconName } from "@/lib/icon-slots";

/**
 * THE circular frame for every icon and category image (#1288, ADR-008 Decision 6,
 * design-system "Icons").
 *
 * One vendor-tinted circle whatever fills it, resolved in this order (first match wins):
 *   1. `imageUrl` — a category photo                          → `data-medallion-source="photo"`
 *   2. the vendor's active AI asset for the slot              → `"ai"`
 *   3. for `icon3d`, a static cut-out in `ICON_3D_IMAGE_ASSETS` → `"static"`
 *   4. the vector artwork (`Icon3D` SVG or build-time `<Icon>`) → `"vector"`
 *
 * Photos and AI assets fill the circle with `mix-blend-multiply`, so the plain white background every
 * prompt asks for takes on the tint and every medallion reads as one family. Static cut-outs are
 * transparent, so they are inset to 80 % instead of cropped; vectors are inset to 70 %.
 *
 * A client component because the active-asset map comes from `ActiveSlotIconsProvider`, loaded once
 * per request by the admin layout and `StorefrontChrome` — there is no per-icon lookup request.
 * `<Icon>` itself stays hook-free and server-renderable (ADR-008 Decision 1).
 */

export type MedallionTint = "action" | "accent" | "danger";

const TINT_CLASS: Record<MedallionTint, string> = {
  action: "bg-action-tint",
  accent: "bg-accent-tint",
  danger: "bg-danger-tint",
};

const STATIC_SCALE = 0.8;
const VECTOR_SCALE = 0.7;

type MedallionContent =
  | { icon3d: Icon3DName; icon?: never; imageUrl?: never }
  | { icon: IconName; icon3d?: never; imageUrl?: never }
  | { imageUrl: string; icon3d?: never; icon?: never };

export type IconMedallionProps = MedallionContent & {
  /** Outer diameter in px; matches the icon box the medallion replaced, so nothing shifts. */
  size: number;
  /** An `ICON_SLOTS` id to look up instead of the one derived from `icon3d`/`icon`. */
  slot?: string;
  tint?: MedallionTint;
  /** The current item in a set (e.g. the open department); adds the action ring. */
  active?: boolean;
  /** Accessible name; without it the medallion is decorative. */
  label?: string;
  decorative?: boolean;
  className?: string;
  /** Passed through to `Icon3D` for its animated SVG; static and AI art never animate. */
  animated?: boolean;
  /** The `data-icon` value existing selectors and tests address this icon by. */
  dataIcon?: string;
  loading?: "eager" | "lazy";
  /** For `imageUrl`: the glyph shown if the photo fails to load. */
  fallbackIcon?: IconName;
  /**
   * For `imageUrl`: `cover` (default) fills the circle, for photos on a white background;
   * `inset` sits at 80 % like a static 3D cut-out, for transparent artwork such as the department
   * illustrations, which a circular crop would clip.
   */
  imageFit?: "cover" | "inset";
};

export function IconMedallion(props: IconMedallionProps) {
  const {
    size,
    slot,
    tint = "action",
    active = false,
    label,
    decorative,
    className = "",
    animated = false,
    dataIcon,
    loading = "eager",
    fallbackIcon,
    imageFit = "cover",
  } = props;
  const activeIcons = useActiveSlotIcons();

  const slotId =
    props.imageUrl !== undefined
      ? slot
      : (slot ??
        (props.icon3d !== undefined
          ? slotIdForIcon3D(props.icon3d)
          : slotIdForIconName(props.icon)));
  const aiUrl = props.imageUrl === undefined && slotId ? activeIcons[slotId] : undefined;
  const staticAsset = props.icon3d !== undefined ? ICON_3D_IMAGE_ASSETS[props.icon3d] : undefined;

  const source: "photo" | "ai" | "static" | "vector" =
    props.imageUrl !== undefined ? "photo" : aiUrl ? "ai" : staticAsset ? "static" : "vector";

  const isDecorative = decorative ?? label === undefined;
  // The medallion itself carries the accessible name; the image inside is presentational.
  const alt = "";
  const vectorPx = Math.round(size * VECTOR_SCALE);

  const vectorIcon = props.icon ?? (props.imageUrl !== undefined ? fallbackIcon : undefined);
  const vector =
    props.icon3d !== undefined ? (
      <Icon3D name={props.icon3d} size={vectorPx} renderAs="svg" animated={animated} decorative />
    ) : vectorIcon !== undefined ? (
      <span
        className="inline-flex items-center justify-center"
        style={{ width: vectorPx, height: vectorPx }}
        data-medallion-content="vector"
      >
        <Icon name={vectorIcon} className="h-full w-full" />
      </span>
    ) : null;

  let content;
  const staticPx = Math.round(size * STATIC_SCALE);
  if (source === "photo" && imageFit === "inset") {
    content = (
      <ImageWithFallback
        src={props.imageUrl as string}
        alt={alt}
        width={staticPx}
        height={staticPx}
        loading={loading}
        decoding="async"
        className="object-contain mix-blend-multiply"
        fallback={vector}
      />
    );
  } else if (source === "photo" || source === "ai") {
    const src = (props.imageUrl ?? aiUrl) as string;
    content = (
      <ImageWithFallback
        src={src}
        alt={alt}
        width={size}
        height={size}
        loading={loading}
        decoding="async"
        className="h-full w-full object-cover mix-blend-multiply"
        fallback={vector}
      />
    );
  } else if (source === "static" && staticAsset) {
    content = (
      <ImageWithFallback
        src={staticAsset.png}
        sources={[{ media: "(min-width: 0px)", srcSet: staticAsset.webp }]}
        alt={alt}
        width={staticPx}
        height={staticPx}
        loading={loading}
        decoding="async"
        className="object-contain mix-blend-multiply"
        fallback={vector}
      />
    );
  } else {
    content = vector;
  }

  const ring = active ? "ring-2 ring-action" : "ring-1 ring-black/5";

  return (
    <span
      data-medallion=""
      data-medallion-slot={slotId}
      data-medallion-source={source}
      data-icon={dataIcon ?? props.icon3d ?? props.icon}
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full ${TINT_CLASS[tint]} ${ring} ${className}`}
      style={{ width: size, height: size }}
      {...(isDecorative ? { "aria-hidden": true as const } : { role: "img", "aria-label": label })}
    >
      {content}
    </span>
  );
}
