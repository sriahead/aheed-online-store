import { ICON_3D_DEFINITIONS } from "./catalog";
import { resolvePalette } from "./palette";
import type { Icon3DDefinition, RenderOptions } from "./types";

export function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

let renderCounter = 0;

/**
 * Renders a full theme-aware 3D SVG string for an icon definition.
 */
export function renderIconSvg(
  icon: Icon3DDefinition | string,
  options: RenderOptions = {},
): { svg: string; icon: Icon3DDefinition } | null {
  const item = typeof icon === "string" ? ICON_3D_DEFINITIONS[icon] : icon;
  if (!item) return null;

  const palette = resolvePalette(options.theme ?? "auto", options.primaryColor);
  const isAnimated = options.animated !== false;
  const animSpeed = Math.max(0.2, Math.min(5.0, options.animSpeed ?? 1.0));
  const duration = (2.5 / animSpeed).toFixed(2);
  const animType = isAnimated ? item.recommendedAnim : "none";

  const prefix = options.idPrefix || `a3d-${item.id}-${++renderCounter}`;
  const label = options.label || item.name;
  const size = options.size || 96;

  let animClass = "";
  let styles = "";
  if (animType === "float") {
    animClass = `class="anim-float-${prefix}"`;
    styles = `<style>
      @keyframes float-${prefix} {
        0%, 100% { transform: translateY(0px) perspective(600px) rotateX(0deg); }
        50% { transform: translateY(-5px) perspective(600px) rotateX(4deg); }
      }
      .anim-float-${prefix} {
        animation: float-${prefix} ${duration}s ease-in-out infinite;
        transform-origin: 48px 48px;
      }
      @media (prefers-reduced-motion: reduce) {
        .anim-float-${prefix} {
          animation: none !important;
          transform: none !important;
        }
      }
    </style>`;
  } else if (animType === "pop") {
    animClass = `class="anim-pop-${prefix}"`;
    styles = `<style>
      @keyframes pop-${prefix} {
        0% { transform: scale(1); }
        50% { transform: scale(1.08); }
        100% { transform: scale(1); }
      }
      .anim-pop-${prefix} {
        animation: pop-${prefix} ${(Number(duration) * 0.4).toFixed(2)}s cubic-bezier(0.175, 0.885, 0.32, 1.275) infinite;
        transform-origin: 48px 48px;
      }
      @media (prefers-reduced-motion: reduce) {
        .anim-pop-${prefix} {
          animation: none !important;
          transform: none !important;
        }
      }
    </style>`;
  }

  const body = item.render(palette, prefix);

  const dataIconAttr = `data-icon="${escapeXml(options.dataIcon || item.id)}"`;
  const isDecorative = options.decorative === true;
  const a11yAttrs = isDecorative
    ? 'aria-hidden="true"'
    : `role="img" aria-label="${escapeXml(label)}"`;
  const metaTags = isDecorative
    ? ""
    : `<title>${escapeXml(label)}</title>\n  <desc>${escapeXml(item.purpose)}</desc>`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" ${dataIconAttr} viewBox="0 0 96 96" width="${size}" height="${size}" ${a11yAttrs} style="overflow:visible">
  ${metaTags}
  ${styles}
  <g ${animClass} style="transform-origin: 48px 48px;">
    ${body}
  </g>
</svg>`;

  return { svg, icon: item };
}
