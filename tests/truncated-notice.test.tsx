// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { SearchTruncationNotice } from "@/components/product/SearchTruncationNotice";

/**
 * P2.6 slice 1 (#564), R19a.
 *
 * WHY THIS EXISTS AS A COMPONENT TEST AND NOT ONLY AS A LIVE CHECK.
 * The notice fires when a query matches more products than `searchProducts` is
 * willing to rank. Whether ANY query on a given database does that is a
 * property of that environment's seed data, not of this code — so a live-only
 * check leaves the UI half of R19 unproven wherever the catalogue is smaller,
 * and invites the one fix that must never be made: lowering
 * SEARCH_CANDIDATE_LIMIT to manufacture a pass. Forcing the prop both ways is
 * deterministic and independent of catalogue contents, which is why the notice
 * was extracted into a presentational component in the first place.
 */

afterEach(cleanup);

describe("SearchTruncationNotice", () => {
  it("renders the notice when truncated is true", () => {
    render(<SearchTruncationNotice truncated />);

    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.getByText(/more matches than we can show/i)).toBeTruthy();
    // The actionable half — a notice that only says "incomplete" tells the
    // shopper nothing they can do about it.
    expect(screen.getByText(/narrow it down/i)).toBeTruthy();
  });

  it("renders nothing at all when truncated is false", () => {
    const { container } = render(<SearchTruncationNotice truncated={false} />);

    expect(container.firstChild).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByText(/more matches than we can show/i)).toBeNull();
  });
});
