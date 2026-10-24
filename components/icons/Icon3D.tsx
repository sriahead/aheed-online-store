import type { CSSProperties } from "react";
import { ICON_3D_DEFINITIONS } from "@/lib/icons-3d/catalog";
import { renderIconSvg } from "@/lib/icons-3d/render";
import type { ThemeMode } from "@/lib/icons-3d/types";

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
}

/**
 * 3D Icon Component — delivers theme-aware, multi-layered 3D vector artwork.
 *
 * Renders inline SVG on the server to eliminate network roundtrips
 * and guarantee instant paint with zero client bundle overhead.
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
}: Icon3DProps) {
  const definition = ICON_3D_DEFINITIONS[name];
  if (!definition) return null;

  const rendered = renderIconSvg(definition, {
    theme,
    primaryColor,
    animated,
    animSpeed,
    size,
    label: label ?? definition.name,
    idPrefix: `ui-${name}`,
    dataIcon,
  });

  if (!rendered) return null;

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center ${className}`}
      style={{ width: size, height: size, ...style }}
      dangerouslySetInnerHTML={{ __html: rendered.svg }}
    />
  );
}
