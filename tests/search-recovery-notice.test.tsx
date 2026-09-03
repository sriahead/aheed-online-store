// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { SearchRecoveryNotice } from "@/components/product/SearchRecoveryNotice";

/**
 * P2.6 slice 2 (#565), R21. Matches `tests/truncated-notice.test.tsx`'s pattern — the decision
 * is made in the repository (`ProductPage.recovery`), this proves the four render states
 * deterministically rather than depending on which rung a given catalogue happens to trigger.
 */

afterEach(cleanup);

const CATEGORIES = [{ id: "c1", slug: "fresh-produce", name: "Fresh Produce" }];

describe("SearchRecoveryNotice", () => {
  it("renders nothing when recovery is null", () => {
    const { container } = render(
      <SearchRecoveryNotice recovery={null} terms={["rice"]} categories={CATEGORIES} />,
    );

    expect(container.firstChild).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("renders a short notice for the typo rung, naming the corrected terms", () => {
    render(
      <SearchRecoveryNotice
        recovery={{ rung: "typo", correctedTerms: ["basmati", "rice"] }}
        terms={["bosmati", "ricd"]}
        categories={CATEGORIES}
      />,
    );

    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.getByText(/basmati rice/i)).toBeTruthy();
    // The fallback (category/term links) must NOT also render for a rescued search.
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("renders a short notice for the identity/broad rungs", () => {
    render(
      <SearchRecoveryNotice
        recovery={{ rung: "identity" }}
        terms={["xyz"]}
        categories={CATEGORIES}
      />,
    );

    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.getByText(/related products/i)).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("renders the fallback — category links and one link per term — when the whole ladder found nothing", () => {
    render(
      <SearchRecoveryNotice
        recovery={{ rung: "none" }}
        terms={["organic", "quinoa"]}
        categories={CATEGORIES}
      />,
    );

    expect(screen.getByRole("status")).toBeTruthy();
    const organicLink = screen.getByRole("link", { name: "organic" });
    expect(organicLink.getAttribute("href")).toBe("/search?q=organic");
    const quinoaLink = screen.getByRole("link", { name: "quinoa" });
    expect(quinoaLink.getAttribute("href")).toBe("/search?q=quinoa");
    const categoryLink = screen.getByRole("link", { name: "Fresh Produce" });
    expect(categoryLink.getAttribute("href")).toBe("/categories/fresh-produce");
  });

  it("omits per-term links for a single-term query in the fallback (nothing to split)", () => {
    render(
      <SearchRecoveryNotice
        recovery={{ rung: "none" }}
        terms={["quinoa"]}
        categories={CATEGORIES}
      />,
    );

    expect(screen.queryByRole("link", { name: "quinoa" })).toBeNull();
    expect(screen.getByRole("link", { name: "Fresh Produce" })).toBeTruthy();
  });
});
