// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { HorizontalScroller } from "@/components/layout/HorizontalScroller";

/**
 * #511 — the shop page showed one row that scrolled (the department strip) and
 * three that were wrapping grids, so it read as two designs meeting. This is the
 * extracted behaviour they now share.
 */
afterEach(cleanup);

describe("HorizontalScroller", () => {
  it("names its arrows after what they scroll", () => {
    // Three of these render on /categories. Arrows all called "Scroll right"
    // would be indistinguishable to a screen reader, which is why itemLabel is
    // required rather than defaulted.
    render(
      <HorizontalScroller itemLabel="products">
        <div>card</div>
      </HorizontalScroller>,
    );

    expect(screen.getByRole("button", { name: "Scroll products left" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Scroll products right" })).toBeTruthy();
  });

  it("renders a ul track when asked, so <li> children stay valid", () => {
    // BundleCard renders an <li>. The scroll container and the items' parent are
    // necessarily the same element, so a <ul> nested inside a scrolling <div>
    // is not an option — an invalid content model is #351's territory.
    const { container } = render(
      <HorizontalScroller itemLabel="bundles" as="ul">
        <li>bundle</li>
      </HorizontalScroller>,
    );

    const list = container.querySelector("ul");
    expect(list).not.toBeNull();
    expect(list?.querySelector("li")?.textContent).toBe("bundle");
  });

  it("defaults to a div track", () => {
    const { container } = render(
      <HorizontalScroller itemLabel="products">
        <div>card</div>
      </HorizontalScroller>,
    );

    expect(container.querySelector("ul")).toBeNull();
  });

  it("scrolls by the explicit step when one is given", () => {
    const scrollBy = vi.fn();
    const { container } = render(
      <HorizontalScroller itemLabel="departments" step={260}>
        <div>a</div>
      </HorizontalScroller>,
    );
    const track = container.querySelector("div.no-scrollbar") as HTMLElement;
    track.scrollBy = scrollBy;

    screen.getByRole("button", { name: "Scroll departments right" }).click();
    expect(scrollBy).toHaveBeenCalledWith({ left: 260, behavior: "smooth" });

    screen.getByRole("button", { name: "Scroll departments left" }).click();
    expect(scrollBy).toHaveBeenCalledWith({ left: -260, behavior: "smooth" });
  });

  it("falls back to a share of the visible width when no step is given", () => {
    const scrollBy = vi.fn();
    const { container } = render(
      <HorizontalScroller itemLabel="products">
        <div>a</div>
      </HorizontalScroller>,
    );
    const track = container.querySelector("div.no-scrollbar") as HTMLElement;
    track.scrollBy = scrollBy;
    Object.defineProperty(track, "clientWidth", { value: 1000, configurable: true });

    screen.getByRole("button", { name: "Scroll products right" }).click();
    // 90% of the visible width — adapts to card size and viewport rather than
    // hard-coding a card width that would drift from the CSS.
    expect(scrollBy).toHaveBeenCalledWith({ left: 900, behavior: "smooth" });
  });

  it("never scrolls by less than a readable amount on a narrow track", () => {
    const scrollBy = vi.fn();
    const { container } = render(
      <HorizontalScroller itemLabel="products">
        <div>a</div>
      </HorizontalScroller>,
    );
    const track = container.querySelector("div.no-scrollbar") as HTMLElement;
    track.scrollBy = scrollBy;
    // jsdom reports 0 for clientWidth by default; a real narrow viewport is
    // small but non-zero. Either way an arrow press must still move.
    Object.defineProperty(track, "clientWidth", { value: 100, configurable: true });

    screen.getByRole("button", { name: "Scroll products right" }).click();
    expect(scrollBy).toHaveBeenCalledWith({ left: 200, behavior: "smooth" });
  });
});
