// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { RoleJourneyMaps } from "@/components/help/RoleJourneyMaps";

afterEach(cleanup);

describe("RoleJourneyMaps", () => {
  it("defaults to customer journey when detectedRole is customer", () => {
    render(<RoleJourneyMaps detectedRole="customer" />);
    expect(screen.getByRole("heading", { name: "Platform User Journey Maps" })).toBeDefined();
    expect(screen.getByRole("heading", { name: /Customer \(Shopper\) Journey/i })).toBeDefined();
    expect(screen.getByText(/Discover Storefront & Trust Badges/i)).toBeDefined();
  });

  it("defaults to store-admin journey when detectedRole is store-admin", () => {
    render(<RoleJourneyMaps detectedRole="store-admin" />);
    expect(screen.getByRole("heading", { name: /Store Admin Journey/i })).toBeDefined();
    expect(screen.getByText(/Brand Storefront & Manage Themes/i)).toBeDefined();
  });

  it("defaults to staff journey when detectedRole is staff", () => {
    render(<RoleJourneyMaps detectedRole="staff" />);
    expect(screen.getByRole("heading", { name: /Store Staff Journey/i })).toBeDefined();
    expect(screen.getByText(/Process Orders in the Queue/i)).toBeDefined();
  });

  it("defaults to platform-admin journey when detectedRole is platform-admin", () => {
    render(<RoleJourneyMaps detectedRole="platform-admin" />);
    expect(screen.getByRole("heading", { name: /Platform Admin Journey/i })).toBeDefined();
    expect(screen.getByText(/Audit Tenant Directory & Readiness/i)).toBeDefined();
  });

  it("switches journey when user clicks on a different role tab", () => {
    render(<RoleJourneyMaps detectedRole="customer" />);
    expect(screen.getByRole("heading", { name: /Customer \(Shopper\) Journey/i })).toBeDefined();

    const staffTab = screen.getByRole("tab", { name: /Store Staff/i });
    fireEvent.click(staffTab);

    expect(screen.getByRole("heading", { name: /Store Staff Journey/i })).toBeDefined();
    expect(screen.getByText(/Live Orders Queue/i)).toBeDefined();

    const adminTab = screen.getByRole("tab", { name: /Store Admin/i });
    fireEvent.click(adminTab);

    expect(screen.getByRole("heading", { name: /Store Admin Journey/i })).toBeDefined();
    expect(screen.getByText(/Storefront & Branding/i)).toBeDefined();
  });
});
