import type { CSSProperties } from "react";
import { ICON_DATA } from "./generated/icon-data";
import type { IconName } from "./registry";
import {
  DEFAULT_SIZE_PX,
  SECONDARY_OPACITY,
  SIZE_PX,
  TONE_CLASS,
  TONE_SECONDARY,
  type IconData,
  type IconSize,
  type IconTone,
} from "./types";

/**
 * THE icon component (issue 1223, ADR-008). Components address an icon by semantic name and never import
 * an icon library; the registry decides where the artwork comes from.
 *
 * Deliberately a plain function with no client directive and no hooks: it renders on the server and is
 * just as usable from a client component (`DepartmentScroller`), where the same markup is produced.
 *
 * `lucide-react` compatibility. Callers pass `className` for sizing (`h-4 w-4`), colour and fill
 * (`fill-current`, `fill-amber-400`), and one passes `strokeWidth`; all of that keeps working because the
 * presentation attributes sit on the root `<svg>`, exactly as `lucide-react` renders them.
 *
 * Decorative by default: without `label` the icon is `aria-hidden`. Give `label` only for an icon that is
 * the sole content of its control and has no visible text; the control's own `aria-label` is usually the
 * better home for that name (design-system: icon-only buttons carry an explicit `aria-label`).
 */

export interface IconProps {
  name: IconName;
  /** A token from the size scale. Omitted means 24 pixels, the `lucide-react` default, so classes keep deciding size. */
  size?: IconSize;
  /** A vendor-themed colour. Omitted (or `current`) inherits `currentColor` and leaves a duotone icon as drawn. */
  tone?: IconTone;
  /** Accessible name. Switches the icon from `aria-hidden` to `role="img"`. */
  label?: string;
  className?: string;
  style?: CSSProperties;
  /** Overrides the stroke width of an outline icon (Lucide). Ignored by fill-based icons. */
  strokeWidth?: number;
}

/** The fallback glyph for a name the registry does not have (reachable only by bypassing the types). */
const FALLBACK_NAME: IconName = "tag";

/** Root attributes are stored kebab-case (SVG's own names); React wants camelCase. */
const REACT_ATTR: Record<string, string> = {
  "stroke-width": "strokeWidth",
  "stroke-linecap": "strokeLinecap",
  "stroke-linejoin": "strokeLinejoin",
};

export interface IconSvgProps extends Omit<IconProps, "name"> {
  data: IconData;
  name: string;
  /** Set when `data` is the fallback glyph rather than the icon that was asked for. */
  fallback?: boolean;
}

/**
 * Presentational half: renders given data. Exported so tests can render fixture data (a Phosphor duotone
 * body the committed registry does not use until Phase 3) through the very code path production uses.
 */
export function IconSvg({
  data,
  name,
  fallback = false,
  size,
  tone = "current",
  label,
  className,
  style,
  strokeWidth,
}: IconSvgProps) {
  const px = size ? SIZE_PX[size] : DEFAULT_SIZE_PX;

  const rootAttributes: Record<string, string | number> = {};
  for (const [attribute, value] of Object.entries(data.root)) {
    rootAttributes[REACT_ATTR[attribute] ?? attribute] = value;
  }
  if (strokeWidth !== undefined && "stroke-width" in data.root) {
    rootAttributes.strokeWidth = strokeWidth;
  }

  const toneClass = TONE_CLASS[tone];
  const classNames = [toneClass, className].filter(Boolean).join(" ");

  const secondary = TONE_SECONDARY[tone];
  const toneStyle: CSSProperties | undefined = secondary
    ? ({
        "--icon-secondary": secondary,
        "--icon-secondary-opacity": SECONDARY_OPACITY,
      } as CSSProperties)
    : undefined;
  const mergedStyle = toneStyle || style ? { ...toneStyle, ...style } : undefined;

  const accessibility =
    label === undefined
      ? ({ "aria-hidden": true } as const)
      : ({ role: "img", "aria-label": label } as const);

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={data.viewBox}
      width={px}
      height={px}
      focusable="false"
      data-icon={name}
      data-icon-fallback={fallback ? "true" : undefined}
      className={classNames || undefined}
      style={mergedStyle}
      {...rootAttributes}
      {...accessibility}
      // Build-time data only: `scripts/lib/icon-build.ts` rejects script, foreignObject, javascript: and
      // on* handlers, and this body never carries user input. See ADR-008, "Consequences".
      dangerouslySetInnerHTML={{ __html: data.body }}
    />
  );
}

export function Icon({ name, ...props }: IconProps) {
  const data = ICON_DATA[name];
  if (data) return <IconSvg data={data} name={name} {...props} />;
  return <IconSvg data={ICON_DATA[FALLBACK_NAME]} name={FALLBACK_NAME} fallback {...props} />;
}
