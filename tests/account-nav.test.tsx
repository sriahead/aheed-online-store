// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AccountNav } from "@/components/account/AccountNav";

let mockPathname = "/account";

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
}));

afterEach(cleanup);

describe("AccountNav", () => {
  it("renders all shopper account navigation tabs", () => {
    mockPathname = "/account";
    render(<AccountNav />);

    expect(screen.getByRole("navigation", { name: /shopper account navigation/i })).toBeTruthy();
    expect(screen.getByRole("link", { name: /overview/i })).toBeTruthy();
    expect(screen.getByRole("link", { name: /orders/i })).toBeTruthy();
    expect(screen.getByRole("link", { name: /lists/i })).toBeTruthy();
    expect(screen.getByRole("link", { name: /loyalty & rewards/i })).toBeTruthy();
    expect(screen.getByRole("link", { name: /feedback/i })).toBeTruthy();
    expect(screen.getByRole("link", { name: /data rights/i })).toBeTruthy();
  });

  it("sets active class on the current path", () => {
    mockPathname = "/account/loyalty";
    render(<AccountNav />);

    const loyaltyLink = screen.getByRole("link", { name: /loyalty & rewards/i });
    expect(loyaltyLink.className).toContain("border-primary text-primary");

    const ordersLink = screen.getByRole("link", { name: /orders/i });
    expect(ordersLink.className).toContain("border-transparent");
  });

  it("sets active class on nested order paths", () => {
    mockPathname = "/account/orders/ORD-12345";
    render(<AccountNav />);

    const ordersLink = screen.getByRole("link", { name: /orders/i });
    expect(ordersLink.className).toContain("border-primary text-primary");
  });

  it("links to correct destinations", () => {
    mockPathname = "/account";
    render(<AccountNav />);

    expect(screen.getByRole("link", { name: /overview/i }).getAttribute("href")).toBe("/account");
    expect(screen.getByRole("link", { name: /orders/i }).getAttribute("href")).toBe(
      "/account/orders",
    );
    expect(screen.getByRole("link", { name: /lists/i }).getAttribute("href")).toBe(
      "/account/lists",
    );
    expect(screen.getByRole("link", { name: /loyalty & rewards/i }).getAttribute("href")).toBe(
      "/account/loyalty",
    );
    expect(screen.getByRole("link", { name: /feedback/i }).getAttribute("href")).toBe("/feedback");
    expect(screen.getByRole("link", { name: /data rights/i }).getAttribute("href")).toBe(
      "/account/data",
    );
  });
});
