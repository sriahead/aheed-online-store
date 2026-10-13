import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { HeaderBrand } from "@/components/layout/HeaderBrand";

/**
 * #1069 R17-R19 — the four brand cases, as static markup.
 *
 * Markup proves which element, box classes and `alt` each case renders, and that the logo-and-mark
 * case is ONE <picture> (so the browser fetches one candidate). It cannot prove layout or which
 * request the browser makes: `validation.md` R18/R20 measure those with
 * `scripts/verify-mobile-layout.ts`.
 */

const NAME = "Example Store";
const ALT = `${NAME} — Your Local Store`;
const LOGO = "https://cdn.example.com/vendors/v/logo-x.webp";
const MARK = "https://cdn.example.com/vendors/v/mark-y/192.png";

function render(logoUrl: string | null, markUrl: string | null): string {
  return renderToStaticMarkup(
    <HeaderBrand name={NAME} localityName="Somewhere" logoUrl={logoUrl} markUrl={markUrl} />,
  );
}

describe("HeaderBrand", () => {
  it("logo and mark: one <picture>, the mark below md and the logo from md", () => {
    const html = render(LOGO, MARK);
    expect(html.match(/<img /g)).toHaveLength(1);
    expect(html).toContain('<picture class="contents">');
    expect(html).toContain(`<source media="(min-width: 768px)" srcSet="${LOGO}"/>`);
    expect(html).toContain(`src="${MARK}"`);
    expect(html).toContain(`alt="${ALT}"`);
    // 40x40 below md; the 128x64 (2:1) logo box from md.
    expect(html).toMatch(
      /class="size-10 shrink-0 object-contain[^"]*md:h-16 md:w-auto md:aspect-2\/1/,
    );
    expect(html).not.toContain("Somewhere");
  });

  it("logo only: today's single <img> in the 72x40 box (128x64 from md), no picture, no mark", () => {
    const html = render(LOGO, null);
    expect(html).not.toContain("<picture");
    expect(html.match(/<img /g)).toHaveLength(1);
    expect(html).toContain(`src="${LOGO}"`);
    expect(html).toContain(`alt="${ALT}"`);
    expect(html).toContain(
      'class="h-10 w-auto shrink-0 aspect-9/5 md:h-16 md:aspect-2/1 object-contain rounded-xl shadow-sm group-hover:opacity-90 transition-opacity"',
    );
  });

  it("mark only: the wordmark at every width, with the mark in the tile's 40x40 box", () => {
    const html = render(null, MARK);
    expect(html).not.toContain("<picture");
    expect(html).toContain(`src="${MARK}"`);
    expect(html).toMatch(/<img [^>]*class="size-10 shrink-0 rounded-xl object-contain/);
    expect(html).not.toMatch(/class="[^"]*md:hidden/);
    expect(html).toContain(">Example<");
    expect(html).toContain(">Store<");
    expect(html).toContain("Somewhere");
  });

  it("neither: today's wordmark — initial tile, name and locality, no image", () => {
    const html = render(null, null);
    expect(html).not.toContain("<img");
    expect(html).toContain('class="w-10 h-10 shrink-0 rounded-xl bg-primary');
    expect(html).toContain(">E</div>");
    expect(html).toContain(">Example<");
    expect(html).toContain("Somewhere");
  });
});
