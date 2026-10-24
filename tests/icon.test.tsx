import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as lucide from "lucide-react";
import { describe, expect, it } from "vitest";
import { Icon, IconSvg } from "@/components/icons/Icon";
import { ICON_DATA } from "@/components/icons/generated/icon-data";
import { ICON_REGISTRY, type IconName } from "@/components/icons/registry";
import {
  ICON_TONES,
  SIZE_PX,
  TONE_CLASS,
  type IconSize,
  type IconTone,
} from "@/components/icons/types";
import { buildIconData } from "../scripts/lib/icon-build";
import manifest from "./fixtures/lucide-icons-in-use.json";
import { LUCIDE_CHILD_ATTRIBUTE_EXCEPTIONS } from "./fixtures/icon-parity-exceptions";

/**
 * Proves R13 and R17 to R23 (#1223) for the `Icon` component.
 *
 * Rendered with `renderToStaticMarkup` (no browser, no hooks): the component is a plain function of its
 * props, which is also what R22 requires of it.
 */

const render = (element: React.ReactElement) => renderToStaticMarkup(element);
const rootTag = (markup: string) => markup.match(/^<svg[^>]*>/)![0];
const attr = (tag: string, name: string) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];

describe("Icon rendering (R17)", () => {
  const markup = render(<Icon name="search" />);
  const tag = rootTag(markup);

  it("renders one svg with the identifying attributes", () => {
    expect(markup.match(/<svg/g)).toHaveLength(1);
    expect(attr(tag, "data-icon")).toBe("search");
    expect(attr(tag, "xmlns")).toBe("http://www.w3.org/2000/svg");
    expect(attr(tag, "focusable")).toBe("false");
    expect(attr(tag, "viewBox")).toBe("0 0 24 24");
  });

  it("defaults to 24 by 24, the lucide-react default", () => {
    expect(attr(tag, "width")).toBe("24");
    expect(attr(tag, "height")).toBe("24");
  });
});

describe("size tokens (R18)", () => {
  const expected: Record<IconSize, string> = {
    xs: "12",
    sm: "16",
    md: "20",
    lg: "24",
    xl: "32",
    "2xl": "48",
  };
  it.each(Object.entries(expected))("%s renders %s pixels", (size, px) => {
    const tag = rootTag(render(<Icon name="search" size={size as IconSize} />));
    expect(attr(tag, "width")).toBe(px);
    expect(attr(tag, "height")).toBe(px);
    expect(SIZE_PX[size as IconSize]).toBe(Number(px));
  });
});

describe("accessibility (R19)", () => {
  it("is aria-hidden with no role when it has no label", () => {
    const tag = rootTag(render(<Icon name="search" />));
    expect(attr(tag, "aria-hidden")).toBe("true");
    expect(tag).not.toMatch(/\srole=/);
    expect(tag).not.toMatch(/\saria-label=/);
  });

  it("is role=img with an accessible name, and not aria-hidden, when it has a label", () => {
    const tag = rootTag(render(<Icon name="search" label="Search" />));
    expect(attr(tag, "role")).toBe("img");
    expect(attr(tag, "aria-label")).toBe("Search");
    expect(tag).not.toMatch(/aria-hidden/);
  });
});

describe("className, style and strokeWidth (R20)", () => {
  it("appends className after the tone class", () => {
    const tag = rootTag(render(<Icon name="search" tone="action" className="h-4 w-4" />));
    expect(attr(tag, "class")).toBe("text-action h-4 w-4");
  });

  it("renders no class attribute when there is nothing to put in it", () => {
    expect(rootTag(render(<Icon name="search" />))).not.toMatch(/\sclass=/);
  });

  it("merges style with the tone variables, the caller's winning", () => {
    const tag = rootTag(render(<Icon name="search" tone="action" style={{ opacity: 0.5 }} />));
    const style = attr(tag, "style")!;
    expect(style).toContain("--icon-secondary:var(--color-accent)");
    expect(style).toContain("opacity:0.5");
  });

  it("passes strokeWidth to the root of an outline icon", () => {
    const tag = rootTag(render(<Icon name="search" strokeWidth={1.25} />));
    expect(attr(tag, "stroke-width")).toBe("1.25");
  });
});

describe("unknown names (R21)", () => {
  it("falls back to the neutral tag glyph and does not throw", () => {
    // @ts-expect-error "not-a-name" is not a registry key: this line is the compile-time half of R21
    const markup = render(<Icon name="not-a-name" />);
    const tag = rootTag(markup);
    expect(attr(tag, "data-icon")).toBe("tag");
    expect(attr(tag, "data-icon-fallback")).toBe("true");
  });
});

describe("server compatibility (R22)", () => {
  const source = readFileSync(join(__dirname, "../components/icons/Icon.tsx"), "utf8");
  it("has no use client directive", () => {
    expect(source).not.toMatch(/["']use client["']/);
  });
  it("imports no React hook", () => {
    expect(source).not.toMatch(
      /\buse(State|Effect|Ref|Memo|Callback|Context|Reducer|Id|Layout)\w*\b/,
    );
  });
});

describe("tones (R23)", () => {
  const expectedSecondary: Record<IconTone, string | null> = {
    current: null,
    muted: null,
    primary: "var(--color-accent)",
    action: "var(--color-accent)",
    accent: "var(--color-action)",
    danger: "var(--color-accent)",
  };
  it.each(ICON_TONES)("%s renders its class and secondary variables", (tone) => {
    const tag = rootTag(render(<Icon name="search" tone={tone} />));
    const expectedClass = TONE_CLASS[tone];
    if (expectedClass) expect(attr(tag, "class")).toBe(expectedClass);
    else expect(tag).not.toMatch(/\sclass=/);
    const style = attr(tag, "style");
    const secondary = expectedSecondary[tone];
    if (secondary) {
      expect(style).toContain(`--icon-secondary:${secondary}`);
      expect(style).toContain("--icon-secondary-opacity:.7");
    } else {
      expect(style ?? "").not.toContain("--icon-secondary");
    }
  });

  it("never uses an alpha modifier on a themed token", () => {
    for (const tone of ICON_TONES) expect(TONE_CLASS[tone] ?? "").not.toMatch(/\/\d/);
  });
});

describe("Lucide icons keep lucide-react's root attributes (R13)", () => {
  const ROOT = {
    fill: "none",
    stroke: "currentColor",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "stroke-width": "2",
  };
  const lucideEntries = (
    Object.entries(ICON_REGISTRY) as Array<[IconName, { provider: string }]>
  ).filter(([, entry]) => entry.provider === "lucide");
  /** Elements below the root that carry their own fill, stroke or stroke-width. */
  const descendantsWithOwnPaint = (markup: string) =>
    [...markup.slice(markup.indexOf(">") + 1).matchAll(/<[A-Za-z][^>]*>/g)].filter((m) =>
      /\s(fill|stroke|stroke-width)="/.test(m[0]),
    ).length;

  it.each(lucideEntries)("%s carries the six attributes on the root", (name) => {
    const tag = rootTag(render(<Icon name={name} />));
    for (const [key, value] of Object.entries(ROOT))
      expect(attr(tag, key), `${name} ${key}`).toBe(value);
  });

  it("puts no more own-paint attributes on children than lucide-react does", () => {
    const exceptions = new Set(LUCIDE_CHILD_ATTRIBUTE_EXCEPTIONS.map((e) => e.key));
    const byKey = new Map(manifest.icons.map((i) => [i.key, i.export]));
    for (const [name] of lucideEntries) {
      if (exceptions.has(name)) continue;
      const component = (lucide as unknown as Record<string, React.ComponentType>)[
        byKey.get(name)!
      ];
      const reference = descendantsWithOwnPaint(render(createElement(component)));
      const ours = descendantsWithOwnPaint(render(<Icon name={name} />));
      expect(
        ours,
        `${name}: children carrying their own paint (lucide-react: ${reference})`,
      ).toBeLessThanOrEqual(reference);
    }
  });

  it("a root fill class can therefore take effect: star keeps fill=none on the root only", () => {
    const markup = render(<Icon name="star" className="fill-current" />);
    const tag = rootTag(markup);
    expect(attr(tag, "fill")).toBe("none");
    expect(attr(tag, "class")).toBe("fill-current");
    expect(descendantsWithOwnPaint(markup)).toBe(0);
  });
});

describe("Noto Emoji icons render colourful multi-path SVG without clobbering root fill (#1239)", () => {
  it("renders heart (red-heart) and heart-outline (white-heart) without root fill or stroke clobbering", () => {
    for (const name of ["heart", "heart-outline"] as const) {
      const markup = render(<Icon name={name} />);
      const tag = rootTag(markup);
      expect(attr(tag, "fill")).toBeUndefined();
      expect(attr(tag, "stroke")).toBeUndefined();
      expect(markup).toContain("<path");
    }
  });
});

describe("Phosphor icons render through the same path (R14)", () => {
  const data = buildIconData({
    truck: { tier: "decorative", provider: "ph", id: "truck-duotone" },
  });
  it("sets fill on the root and keeps the secondary layer variable-driven", () => {
    const markup = render(<IconSvg data={data.truck} name="truck" tone="action" />);
    expect(attr(rootTag(markup), "fill")).toBe("currentColor");
    expect(markup).toContain("var(--icon-secondary,currentColor)");
    expect(attr(rootTag(markup), "style")).toContain("--icon-secondary:var(--color-accent)");
  });
});

describe("the data and the registry agree (sanity)", () => {
  it("every registry name has generated data", () => {
    for (const name of Object.keys(ICON_REGISTRY))
      expect(ICON_DATA[name as IconName], name).toBeDefined();
  });
});
