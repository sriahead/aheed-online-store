import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { HeaderBrand } from "@/components/layout/HeaderBrand";

/**
 * #1069 R17-R19, amended by #1077 R1-R3 — the four brand cases, as static markup.
 *
 * Markup proves which element, box classes and `alt` each case renders. It cannot prove layout or
 * which request the browser makes: `validation.md` measures those with
 * `scripts/verify-mobile-layout.ts`.
 *
 * #1077 — the logo-and-mark case no longer asserts a `<picture>` with a `(min-width: 768px)`
 * source. Owner testing found the square mark too small to identify the store on a phone, so a
 * vendor WITH a logo renders that logo at every width — which makes this case byte-for-byte
 * identical to the logo-only case, and that equality is what the first test now asserts.
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
  it("logo and mark: the logo at every width, identical to the logo-only case (#1077 R1)", () => {
    const html = render(LOGO, MARK);

    // R1 — the two cases are now ONE branch, so their markup must be indistinguishable. This is
    // the whole requirement in one assertion: anything that made the mark reappear below `md`
    // (a <source>, a second <img>, a md:hidden class) would make these differ.
    expect(html).toBe(render(LOGO, null));

    expect(html).not.toContain("<picture");
    expect(html).not.toContain("<source");
    expect(html).not.toContain(MARK);
    expect(html.match(/<img /g)).toHaveLength(1);
    expect(html).toContain(`src="${LOGO}"`);
    expect(html).toContain(`alt="${ALT}"`);
    // 72x40 below md (h-10 aspect-9/5); the 128x64 (2:1) box from md.
    expect(html).toContain(
      'class="h-10 w-auto shrink-0 aspect-9/5 md:h-16 md:aspect-2/1 object-contain rounded-xl shadow-sm group-hover:opacity-90 transition-opacity"',
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
