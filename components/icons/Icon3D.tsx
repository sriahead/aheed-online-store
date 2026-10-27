"use client";

import type { CSSProperties } from "react";
import { ICON_3D_DEFINITIONS } from "@/lib/icons-3d/catalog";
import { renderIconSvg } from "@/lib/icons-3d/render";
import type { ThemeMode } from "@/lib/icons-3d/types";
import { ImageWithFallback } from "@/components/ui/ImageWithFallback";
import { useActiveSlotIcons } from "./ActiveSlotIconsProvider";

export type Icon3DName = keyof typeof ICON_3D_DEFINITIONS;

export interface Icon3DProps {
  name: Icon3DName;
  size?: number;
  theme?: ThemeMode;
  primaryColor?: string;
  animated?: boolean;
  animSpeed?: number;
  label?: string;
  className?: string;
  style?: CSSProperties;
  dataIcon?: string;
  decorative?: boolean;
  /**
   * Render mode:
   * - "auto" (default): Renders high-resolution 3D image asset when available with seamless SVG fallback
   * - "image": Renders high-resolution 3D image asset only
   * - "svg": Renders inline procedural SVG vector only
   */
  renderAs?: "auto" | "image" | "svg";
}

/**
 * Registry of high-resolution photorealistic 3D rendered assets.
 * Each asset is pre-rendered at 512x512 with transparent background and studio lighting.
 */
export const ICON_3D_IMAGE_ASSETS: Partial<Record<Icon3DName, { png: string; webp: string }>> = {
  storefront: {
    png: "/images/icons-3d/storefront.png",
    webp: "/images/icons-3d/storefront.webp",
  },
  "quick-shop": {
    png: "/images/icons-3d/quick-shop.png",
    webp: "/images/icons-3d/quick-shop.webp",
  },
  "user-profile": {
    png: "/images/icons-3d/user-profile.png",
    webp: "/images/icons-3d/user-profile.webp",
  },
  "rewards-gift": {
    png: "/images/icons-3d/rewards-gift.png",
    webp: "/images/icons-3d/rewards-gift.webp",
  },
  "rewards-coin": {
    png: "/images/icons-3d/rewards-coin.png",
    webp: "/images/icons-3d/rewards-coin.webp",
  },
  "cart-add": {
    png: "/images/icons-3d/cart-add.png",
    webp: "/images/icons-3d/cart-add.webp",
  },
  "delivery-van": {
    png: "/images/icons-3d/delivery-van.png",
    webp: "/images/icons-3d/delivery-van.webp",
  },
  "halal-certified": {
    png: "/images/icons-3d/halal-certified.png",
    webp: "/images/icons-3d/halal-certified.webp",
  },
  "secure-checkout": {
    png: "/images/icons-3d/secure-checkout.png",
    webp: "/images/icons-3d/secure-checkout.webp",
  },
  "order-updates": {
    png: "/images/icons-3d/order-updates.png",
    webp: "/images/icons-3d/order-updates.webp",
  },
  "postcode-search": {
    png: "/images/icons-3d/postcode-search.png",
    webp: "/images/icons-3d/postcode-search.webp",
  },
  "contact-follow": {
    png: "/images/icons-3d/contact-follow.png",
    webp: "/images/icons-3d/contact-follow.webp",
  },
  "view-shopper": {
    png: "/images/icons-3d/view-shopper.png",
    webp: "/images/icons-3d/view-shopper.webp",
  },
  "view-staff": {
    png: "/images/icons-3d/view-staff.png",
    webp: "/images/icons-3d/view-staff.webp",
  },
  "view-admin": {
    png: "/images/icons-3d/view-admin.png",
    webp: "/images/icons-3d/view-admin.webp",
  },
};

/**
 * 3D Icon Component — delivers theme-aware, realistic commercial 3D icons.
 *
 * When a photorealistic 3D rendered asset exists for the requested name,
 * it renders high-resolution WebP/PNG imagery through ImageWithFallback
 * with instant zero-layout-shift vector fallback.
 */
export function Icon3D({
  name,
  size = 48,
  theme = "auto",
  primaryColor,
  animated = true,
  animSpeed = 1,
  label,
  className = "",
  style,
  dataIcon,
  decorative,
  renderAs = "auto",
}: Icon3DProps) {
  const activeIcons = useActiveSlotIcons();
  const definition = ICON_3D_DEFINITIONS[name];
  if (!definition) return null;

  const activeUrl =
    activeIcons[name] ||
    (name === "cart-add" ? activeIcons["cart-floating"] : undefined) ||
    (name === "cart-floating" ? activeIcons["cart-add"] : undefined);

  const staticAsset = renderAs !== "svg" ? ICON_3D_IMAGE_ASSETS[name] : undefined;
  const imageAsset = activeUrl ? { png: activeUrl, webp: activeUrl } : staticAsset;

  const rendered = renderIconSvg(definition, {
    theme,
    primaryColor,
    animated,
    animSpeed,
    size,
    label: label ?? definition.name,
    idPrefix: `ui-${name}`,
    dataIcon,
    decorative,
  });

  if (!rendered) return null;

  // Image-only mode
  if (renderAs === "image" && imageAsset) {
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center relative ${className}`}
        style={{ width: size, height: size, ...style }}
        data-icon={dataIcon ?? name}
        aria-hidden={decorative ? "true" : undefined}
      >
        <ImageWithFallback
          src={imageAsset.png}
          sources={[{ media: "(min-width: 0px)", srcSet: imageAsset.webp }]}
          alt={decorative ? "" : (label ?? definition.name)}
          width={size}
          height={size}
          loading="eager"
          decoding="async"
          className="w-full h-full object-contain pointer-events-none select-none"
          fallback={
            rendered ? (
              <span
                className="w-full h-full flex items-center justify-center"
                dangerouslySetInnerHTML={{ __html: rendered.svg }}
              />
            ) : null
          }
        />
      </span>
    );
  }

  // Auto mode with realistic image asset: render ImageWithFallback with semantic/fallback vector
  if (renderAs === "auto" && imageAsset) {
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center relative ${className}`}
        style={{ width: size, height: size, ...style }}
        data-icon={dataIcon ?? name}
        aria-hidden={decorative ? "true" : undefined}
      >
        <ImageWithFallback
          src={imageAsset.png}
          sources={[{ media: "(min-width: 0px)", srcSet: imageAsset.webp }]}
          alt={decorative ? "" : (label ?? definition.name)}
          width={size}
          height={size}
          loading="eager"
          decoding="async"
          className="w-full h-full object-contain pointer-events-none select-none relative z-10"
          fallback={
            rendered ? (
              <span
                className="w-full h-full flex items-center justify-center"
                dangerouslySetInnerHTML={{ __html: rendered.svg }}
              />
            ) : null
          }
        />
        {/* Zero-layout-shift fallback & semantic vector artwork */}
        <span
          className="sr-only"
          aria-hidden="true"
          dangerouslySetInnerHTML={{ __html: rendered.svg }}
        />
      </span>
    );
  }

  // SVG mode or fallback
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center ${className}`}
      style={{ width: size, height: size, ...style }}
      dangerouslySetInnerHTML={{ __html: rendered.svg }}
    />
  );
}
