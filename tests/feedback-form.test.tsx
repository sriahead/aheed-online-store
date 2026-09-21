// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { FeedbackForm } from "@/components/storefront/FeedbackForm";

vi.mock("@/features/feedback/submit-feedback", () => ({
  submitFeedback: vi.fn(async () => ({ error: null, success: false })),
}));

afterEach(cleanup);

describe("FeedbackForm with StarRatingInput", () => {
  it("renders with unrated 5-star rating input by default", () => {
    render(<FeedbackForm existing={null} />);

    expect(screen.getByText("Your rating")).toBeTruthy();
    expect(screen.getByText("Select rating")).toBeTruthy();

    const star1 = screen.getByRole("radio", { name: /1 star/ });
    const star2 = screen.getByRole("radio", { name: /2 stars/ });
    const star3 = screen.getByRole("radio", { name: /3 stars/ });
    const star4 = screen.getByRole("radio", { name: /4 stars/ });
    const star5 = screen.getByRole("radio", { name: /5 stars/ });

    expect(star1).toBeTruthy();
    expect(star2).toBeTruthy();
    expect(star3).toBeTruthy();
    expect(star4).toBeTruthy();
    expect(star5).toBeTruthy();

    expect((star1 as HTMLInputElement).checked).toBe(false);
    expect((star5 as HTMLInputElement).checked).toBe(false);

    // Comment field and send button are also present
    expect(screen.getByLabelText("Your feedback")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Send feedback" })).toBeTruthy();
  });

  it("pre-fills with existing rating and descriptive label when editing", () => {
    render(
      <FeedbackForm
        existing={{
          rating: 5,
          comment: "Excellent service!",
          status: "APPROVED",
        }}
      />,
    );

    expect(screen.getByText("Excellent")).toBeTruthy();
    const star5 = screen.getByRole("radio", { name: /5 stars/ });
    expect((star5 as HTMLInputElement).checked).toBe(true);

    const star4 = screen.getByRole("radio", { name: /4 stars/ });
    expect((star4 as HTMLInputElement).checked).toBe(false);

    expect((screen.getByLabelText("Your feedback") as HTMLTextAreaElement).value).toBe(
      "Excellent service!",
    );
    expect(screen.getByRole("button", { name: "Update my feedback" })).toBeTruthy();
  });

  it("updates rating and label when user clicks a star (1–5)", () => {
    render(<FeedbackForm existing={null} />);

    expect(screen.getByText("Select rating")).toBeTruthy();

    // Click 3 stars
    const star3 = screen.getByRole("radio", { name: /3 stars/ });
    fireEvent.click(star3);

    expect((star3 as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText("Good")).toBeTruthy();

    // Change to 4 stars
    const star4 = screen.getByRole("radio", { name: /4 stars/ });
    fireEvent.click(star4);

    expect((star4 as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText("Very Good")).toBeTruthy();
  });

  it("previews rating on hover and reverts on mouse leave", () => {
    render(
      <FeedbackForm
        existing={{
          rating: 2,
          comment: "Fair experience",
          status: "PENDING",
        }}
      />,
    );

    expect(screen.getByText("Fair")).toBeTruthy();

    const star4Label = screen.getByRole("radio", { name: /4 stars/ }).closest("label");
    expect(star4Label).toBeTruthy();

    fireEvent.mouseEnter(star4Label!);
    expect(screen.getByText("Very Good")).toBeTruthy();

    const container = screen.getByTestId("star-rating-container");
    fireEvent.mouseLeave(container);
    expect(screen.getByText("Fair")).toBeTruthy();
  });

  it("submits the selected star rating in formData", () => {
    render(
      <FeedbackForm
        existing={{
          rating: 4,
          comment: "Very good service",
          status: "APPROVED",
        }}
      />,
    );

    // Update to 5 stars
    const star5 = screen.getByRole("radio", { name: /5 stars/ });
    fireEvent.click(star5);

    expect((star5 as HTMLInputElement).checked).toBe(true);

    const form = star5.closest("form");
    expect(form).toBeTruthy();
    const data = new FormData(form!);
    expect(data.get("rating")).toBe("5");
    expect(data.get("comment")).toBe("Very good service");
  });
});
