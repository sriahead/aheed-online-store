// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CardStack } from "@/components/ui/CardStack";

afterEach(cleanup);

describe("CardStack (P824)", () => {
  const items = [
    <div key="1">Card 1</div>,
    <div key="2">Card 2</div>,
    <div key="3">Card 3</div>,
    <div key="4">Card 4</div>,
  ];

  it("renders the active card in front and displays position counter (R6, R9)", () => {
    const { container } = render(<CardStack itemLabel="reviews">{items}</CardStack>);

    expect(screen.getByText("1 / 4")).toBeTruthy();
    const slides = container.querySelectorAll(".card-stack-item");
    expect(slides).toHaveLength(4);

    // Front card (index 0) has scale(1) and no depth offset
    const frontCard = slides[0] as HTMLElement;
    expect(frontCard.style.transform).toContain("scale(1)");
    expect(frontCard.style.transform).toContain("translate3d(0px, 0px, 0px)");

    // Card behind (index 1) has vertical stacked offset and negative translateZ depth
    const nextCard = slides[1] as HTMLElement;
    expect(nextCard.style.transform).toContain("scale(0.955)");
    expect(nextCard.style.transform).toContain("-22px");
    expect(nextCard.style.transform).toContain("-35px");

    // Third card (index 2) is tiered higher and deeper
    const thirdCard = slides[2] as HTMLElement;
    expect(thirdCard.style.transform).toContain("scale(0.91)");
    expect(thirdCard.style.transform).toContain("-44px");
  });

  it("removes previous and next arrow buttons (R7)", () => {
    render(<CardStack itemLabel="reviews">{items}</CardStack>);

    expect(screen.queryByRole("button", { name: /Previous/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Next/ })).toBeNull();
  });

  it("advances active card and counter when clicking the front card (R7, R9)", () => {
    const { container } = render(<CardStack itemLabel="reviews">{items}</CardStack>);
    const slides = container.querySelectorAll(".card-stack-item");

    fireEvent.click(slides[0]);
    expect(screen.getByText("2 / 4")).toBeTruthy();
  });

  it("advances directly to background card when clicking a stacked card (R7, R9)", () => {
    const { container } = render(<CardStack itemLabel="reviews">{items}</CardStack>);
    const slides = container.querySelectorAll(".card-stack-item");

    // Click third card (depth 2)
    fireEvent.click(slides[2]);
    expect(screen.getByText("3 / 4")).toBeTruthy();
  });

  it("navigates to card when clicking pagination indicator pill (R7, R9)", () => {
    render(<CardStack itemLabel="reviews">{items}</CardStack>);

    const tab2 = screen.getByRole("tab", { name: "Go to reviews 2 of 4" });
    fireEvent.click(tab2);

    expect(screen.getByText("2 / 4")).toBeTruthy();
  });

  it("responds to keyboard ArrowRight and ArrowLeft on carousel container (R9)", () => {
    vi.useFakeTimers();
    const { container } = render(<CardStack itemLabel="reviews">{items}</CardStack>);
    const carousel = container.querySelector(".card-stack") as HTMLElement;
    expect(carousel).toBeTruthy();

    fireEvent.keyDown(carousel, { key: "ArrowRight" });
    expect(screen.getByText("2 / 4")).toBeTruthy();

    // Advance past animation duration (400ms) to allow next navigation
    vi.advanceTimersByTime(450);

    fireEvent.keyDown(carousel, { key: "ArrowLeft" });
    expect(screen.getByText("1 / 4")).toBeTruthy();
    vi.useRealTimers();
  });

  it("advances on pointer drag swipe when exceeding threshold (R8)", () => {
    const { container } = render(<CardStack itemLabel="reviews">{items}</CardStack>);
    const carousel = container.querySelector(".card-stack") as HTMLElement;

    // Simulate drag to the left exceeding 45px threshold
    fireEvent.pointerDown(carousel, { clientX: 200, pointerId: 1 });
    fireEvent.pointerMove(carousel, { clientX: 130, pointerId: 1 }); // dx = -70px
    fireEvent.pointerUp(carousel, { pointerId: 1 });

    expect(screen.getByText("2 / 4")).toBeTruthy();
  });

  it("contains an overflow-hidden wrapper preventing horizontal scrollbars (R10)", () => {
    const { container } = render(<CardStack itemLabel="reviews">{items}</CardStack>);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain("overflow-hidden");
  });

  it("returns null when given empty children", () => {
    const { container } = render(<CardStack itemLabel="reviews">{[]}</CardStack>);
    expect(container.firstChild).toBeNull();
  });
});
