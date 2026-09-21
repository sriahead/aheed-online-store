// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ReviewForm } from "@/features/reviews/components/ReviewForm";

vi.mock("@/features/reviews/submit-review", () => ({
  submitReview: vi.fn(),
}));

afterEach(cleanup);

describe("ReviewForm", () => {
  it("renders clickable stars and allows setting rating", () => {
    render(<ReviewForm productId="prod-1" productSlug="test-product" existingReview={null} />);

    expect(screen.getByText("Your rating")).toBeTruthy();
    expect(screen.getByText("Select rating")).toBeTruthy();

    const star4 = screen.getByRole("radio", { name: /4 stars/ });
    fireEvent.click(star4);

    expect((star4 as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText("Very Good")).toBeTruthy();
  });

  it("pre-fills existing rating and allows updating it", () => {
    render(
      <ReviewForm
        productId="prod-1"
        productSlug="test-product"
        existingReview={{
          rating: 3,
          comment: "Decent",
        }}
      />,
    );

    expect(screen.getByText("Good")).toBeTruthy();
    const star3 = screen.getByRole("radio", { name: /3 stars/ });
    expect((star3 as HTMLInputElement).checked).toBe(true);

    const star5 = screen.getByRole("radio", { name: /5 stars/ });
    fireEvent.click(star5);

    expect((star5 as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText("Excellent")).toBeTruthy();
  });
});
