// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { ActiveSlotIconsProvider } from "@/components/icons/ActiveSlotIconsProvider";
import { Icon3D } from "@/components/icons/Icon3D";
import { IconMedallion } from "@/components/icons/IconMedallion";

/** #1288 R13/R14: the one circular frame, and how it resolves its content. */

afterEach(cleanup);

const AI_URL = "https://cdn.example.com/icons/v1/storefront-abc.png";

function withMap(map: Record<string, string>, node: ReactNode) {
  return <ActiveSlotIconsProvider initialIcons={map}>{node}</ActiveSlotIconsProvider>;
}

function medallionOf(container: HTMLElement): HTMLElement {
  const element = container.querySelector<HTMLElement>("[data-medallion]");
  if (!element) throw new Error("no [data-medallion] rendered");
  return element;
}

describe("IconMedallion frame (#1288 R13)", () => {
  it("is a client component", () => {
    const firstLine = readFileSync("components/icons/IconMedallion.tsx", "utf8").split("\n")[0];
    expect(firstLine).toBe('"use client";');
  });

  it("is a vendor-tinted circle of the given size", () => {
    const { container } = render(<IconMedallion icon3d="storefront" size={40} decorative />);
    const root = medallionOf(container);
    expect(root.className).toContain("rounded-full");
    expect(root.className).toContain("overflow-hidden");
    expect(root.className).toContain("bg-action-tint");
    expect(root.style.width).toBe("40px");
    expect(root.style.height).toBe("40px");
  });

  it("uses the requested tint", () => {
    const { container } = render(
      <IconMedallion icon="triangle-alert" size={32} tint="danger" decorative />,
    );
    expect(medallionOf(container).className).toContain("bg-danger-tint");
  });

  it("marks the active item with the action ring", () => {
    const { container } = render(<IconMedallion icon="package" size={32} active decorative />);
    expect(medallionOf(container).className).toContain("ring-action");
  });

  it("reports the resolved slot, and none for a photo", () => {
    const { container: storefront } = render(<IconMedallion icon3d="storefront" size={32} />);
    expect(medallionOf(storefront).getAttribute("data-medallion-slot")).toBe("storefront");
    cleanup();
    const { container: pkg } = render(<IconMedallion icon="package" size={32} />);
    expect(medallionOf(pkg).getAttribute("data-medallion-slot")).toBe("icon:package");
    cleanup();
    const { container: photo } = render(<IconMedallion imageUrl="/p.jpg" size={32} />);
    expect(medallionOf(photo).hasAttribute("data-medallion-slot")).toBe(false);
  });

  it("is aria-hidden when decorative and a named image when labelled", () => {
    const { container: decorative } = render(<IconMedallion icon="package" size={32} />);
    expect(medallionOf(decorative).getAttribute("aria-hidden")).toBe("true");
    cleanup();
    const { container: named } = render(
      <IconMedallion icon="package" size={32} label="Your orders" />,
    );
    const root = medallionOf(named);
    expect(root.getAttribute("role")).toBe("img");
    expect(root.getAttribute("aria-label")).toBe("Your orders");
  });
});

describe("IconMedallion content resolution (#1288 R14)", () => {
  it("shows a photo when given imageUrl", () => {
    const { container } = render(<IconMedallion imageUrl="/cat.jpg" size={64} />);
    const root = medallionOf(container);
    expect(root.getAttribute("data-medallion-source")).toBe("photo");
    const img = root.querySelector("img")!;
    expect(img.getAttribute("src")).toBe("/cat.jpg");
    expect(img.className).toContain("h-full w-full object-cover mix-blend-multiply");
  });

  it("prefers the vendor's active AI asset for a 3D slot", () => {
    const { container } = render(
      withMap({ storefront: AI_URL }, <IconMedallion icon3d="storefront" size={40} />),
    );
    const root = medallionOf(container);
    expect(root.getAttribute("data-medallion-source")).toBe("ai");
    const img = root.querySelector("img")!;
    expect(img.getAttribute("src")).toBe(AI_URL);
    expect(img.className).toContain("h-full w-full object-cover mix-blend-multiply");
  });

  it("looks up cart-add under its cart-floating slot", () => {
    const { container } = render(
      withMap({ "cart-floating": AI_URL }, <IconMedallion icon3d="cart-add" size={28} />),
    );
    expect(medallionOf(container).getAttribute("data-medallion-source")).toBe("ai");
  });

  it("prefers the vendor's active AI asset for a flat icon", () => {
    const { container } = render(
      withMap({ "icon:package": AI_URL }, <IconMedallion icon="package" size={32} />),
    );
    expect(medallionOf(container).getAttribute("data-medallion-source")).toBe("ai");
  });

  it("falls back to the static 3D cut-out, inset to 80%", () => {
    const { container } = render(withMap({}, <IconMedallion icon3d="storefront" size={40} />));
    const root = medallionOf(container);
    expect(root.getAttribute("data-medallion-source")).toBe("static");
    const img = root.querySelector("img")!;
    expect(img.getAttribute("width")).toBe(String(Math.round(40 * 0.8)));
    expect(img.className).toContain("object-contain mix-blend-multiply");
  });

  it("falls back to the build-time vector for a flat icon, inset to 70%", () => {
    const { container } = render(withMap({}, <IconMedallion icon="package" size={40} />));
    const root = medallionOf(container);
    expect(root.getAttribute("data-medallion-source")).toBe("vector");
    const box = root.querySelector<HTMLElement>('[data-medallion-content="vector"]')!;
    expect(box.style.width).toBe(`${Math.round(40 * 0.7)}px`);
    expect(box.querySelector('svg[data-icon="package"]')).not.toBeNull();
  });

  it("renders a 3D icon with no static asset as its vector, tagged data-icon3d", () => {
    const { container } = render(withMap({}, <IconMedallion icon3d="halal-meat" size={40} />));
    const root = medallionOf(container);
    expect(root.getAttribute("data-medallion-source")).toBe("vector");
    expect(root.querySelector('[data-icon3d="halal-meat"]')).not.toBeNull();
  });

  it("never looks up a functional icon in the active map", () => {
    const { container } = render(
      withMap({ "icon:chevron-down": AI_URL }, <IconMedallion icon="chevron-down" size={32} />),
    );
    expect(medallionOf(container).getAttribute("data-medallion-source")).toBe("vector");
  });

  it("Icon3D carries data-icon3d in every render mode", () => {
    for (const renderAs of ["auto", "image", "svg"] as const) {
      const { container } = render(<Icon3D name="storefront" size={24} renderAs={renderAs} />);
      expect(container.querySelector('[data-icon3d="storefront"]'), renderAs).not.toBeNull();
      cleanup();
    }
  });
});
