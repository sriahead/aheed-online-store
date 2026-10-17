// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { MatchListState, ResolvedLine } from "@/lib/shopping-list";

/**
 * #1131 R26 — a guest who matches a list is told how to save it.
 *
 * Before this, `canSave` false rendered nothing where the save form goes, so a guest had no way to
 * learn that saving exists. The two server actions are mocked (the pattern
 * `tests/category-form.test.tsx` uses), because what is under test is only which of the save form
 * and the sign-in prompt appears, and when. `ListReview` has its own test.
 */

const LINE: ResolvedLine = {
  original: "rice",
  terms: ["rice"],
  quantity: 1,
  measure: null,
  brand: null,
  resolution: { kind: "unmatched" },
} as ResolvedLine;

vi.mock("@/features/cart/match-list", () => ({
  matchList: vi.fn(async (): Promise<MatchListState> => ({ lines: [LINE] })),
}));
vi.mock("@/features/lists/save-list-from-match", () => ({ saveListFromMatch: vi.fn() }));
vi.mock("@/components/cart/ListReview", () => ({ ListReview: () => <div>review</div> }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const { ShopYourList } = await import("@/components/cart/ShopYourList");

const PROMPT = "Sign in to save this list for next time.";

async function renderAndMatch(canSave: boolean) {
  const { container } = render(<ShopYourList canSave={canSave} exampleNames={[]} />);
  fireEvent.change(container.querySelector("textarea")!, { target: { value: "rice" } });
  await act(async () => {
    fireEvent.submit(container.querySelector("form")!);
  });
  await screen.findByText("review");
  return container;
}

afterEach(cleanup);

describe("Shop your list save prompt (#1131 R26)", () => {
  it("a guest who has matched a list sees the sign-in prompt and no save form", async () => {
    const container = await renderAndMatch(false);
    expect(screen.getByText(PROMPT)).toBeTruthy();
    const link = screen.getByRole("link", { name: "Sign in" });
    expect(link.getAttribute("href")).toBe("/login");
    expect(container.querySelector("#listName")).toBeNull();
  });

  it("a guest who has not matched anything yet sees neither", () => {
    render(<ShopYourList canSave={false} exampleNames={[]} />);
    expect(screen.queryByText(PROMPT)).toBeNull();
    expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
  });

  it("a signed-in shopper sees the save form and no prompt", async () => {
    const container = await renderAndMatch(true);
    expect(container.querySelector("#listName")).not.toBeNull();
    expect(screen.queryByText(PROMPT)).toBeNull();
  });
});
