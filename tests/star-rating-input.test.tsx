// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { StarRatingInput } from "@/components/product/StarRatingInput";

afterEach(cleanup);

describe("StarRatingInput", () => {
  it("renders 5 clickable star options and unrated label by default", () => {
    render(<StarRatingInput name="rating" label="Your rating" />);

    expect(screen.getByText("Your rating")).toBeTruthy();
    expect(screen.getByText("Select rating")).toBeTruthy();

    const group = screen.getByRole("group", { name: "Your rating" });
    expect(group).toBeTruthy();

    const star1 = screen.getByRole("radio", { name: "1 star" });
    const star2 = screen.getByRole("radio", { name: "2 stars" });
    const star3 = screen.getByRole("radio", { name: "3 stars" });
    const star4 = screen.getByRole("radio", { name: "4 stars" });
    const star5 = screen.getByRole("radio", { name: "5 stars" });

    expect(star1).toBeTruthy();
    expect(star2).toBeTruthy();
    expect(star3).toBeTruthy();
    expect(star4).toBeTruthy();
    expect(star5).toBeTruthy();
  });

  it("pre-fills with defaultValue when provided", () => {
    render(<StarRatingInput defaultValue={4} />);

    expect(screen.getByText("4 stars")).toBeTruthy();
    const star4 = screen.getByRole("radio", { name: "4 stars" });
    expect((star4 as HTMLInputElement).checked).toBe(true);

    const star5 = screen.getByRole("radio", { name: "5 stars" });
    expect((star5 as HTMLInputElement).checked).toBe(false);
  });

  it("updates rating when user clicks a star (1–5)", () => {
    const onChange = vi.fn();
    render(<StarRatingInput onChange={onChange} />);

    const star3 = screen.getByRole("radio", { name: "3 stars" });
    fireEvent.click(star3);

    expect((star3 as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText("3 stars")).toBeTruthy();
    expect(onChange).toHaveBeenCalledWith(3);

    // Update to 5 stars
    const star5 = screen.getByRole("radio", { name: "5 stars" });
    fireEvent.click(star5);

    expect((star5 as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText("5 stars")).toBeTruthy();
    expect(onChange).toHaveBeenCalledWith(5);
  });

  it("previews rating on hover and reverts on mouse leave", () => {
    render(<StarRatingInput defaultValue={2} />);

    expect(screen.getByText("2 stars")).toBeTruthy();

    const star4Label = screen.getByRole("radio", { name: "4 stars" }).closest("label");
    expect(star4Label).toBeTruthy();

    fireEvent.mouseEnter(star4Label!);
    expect(screen.getByText("4 stars")).toBeTruthy();

    const container = screen.getByTestId("star-rating-container");
    fireEvent.mouseLeave(container);
    expect(screen.getByText("2 stars")).toBeTruthy();
  });

  it("submits the selected rating within a form", () => {
    let submittedRating: string | null = null;
    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const data = new FormData(e.currentTarget);
      submittedRating = data.get("rating") as string;
    };

    render(
      <form onSubmit={handleSubmit}>
        <StarRatingInput name="rating" defaultValue={3} />
        <button type="submit">Submit</button>
      </form>,
    );

    // Change to 5
    fireEvent.click(screen.getByRole("radio", { name: "5 stars" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    expect(submittedRating).toBe("5");
  });

  it("respects disabled state", () => {
    const onChange = vi.fn();
    render(<StarRatingInput disabled onChange={onChange} />);

    const star4 = screen.getByRole("radio", { name: "4 stars" });
    expect((star4 as HTMLInputElement).disabled).toBe(true);

    fireEvent.click(star4);
    expect(onChange).not.toHaveBeenCalled();
  });
});
