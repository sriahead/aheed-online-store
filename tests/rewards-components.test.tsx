// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { WaysToEarnAccordion } from "@/components/rewards/WaysToEarnAccordion";
import { WaysToRedeemAccordion } from "@/components/rewards/WaysToRedeemAccordion";
import { ReferralCard } from "@/components/rewards/ReferralCard";
import { AvailableRewardsSection } from "@/components/rewards/AvailableRewardsSection";
import { RewardsPanel } from "@/components/rewards/RewardsPanel";

afterEach(cleanup);

describe("WaysToEarnAccordion", () => {
  it("renders collapsed by default and expands on click", () => {
    render(<WaysToEarnAccordion pointsPerPoundEarned={1} rewardPoints={100} />);

    expect(screen.getByText("Ways to earn")).toBeTruthy();
    expect(screen.queryByText("Order groceries")).toBeNull();

    // Click to expand
    fireEvent.click(screen.getByRole("button", { name: /ways to earn/i }));
    expect(screen.getByText("Order groceries")).toBeTruthy();
    expect(screen.getByText(/Earn 1 point for every £1 spent/)).toBeTruthy();
    expect(screen.getByText("Refer your friends")).toBeTruthy();
    expect(screen.getByText(/Earn 100 bonus points/)).toBeTruthy();

    // Click to collapse
    fireEvent.click(screen.getByRole("button", { name: /ways to earn/i }));
    expect(screen.queryByText("Order groceries")).toBeNull();
  });
});

describe("WaysToRedeemAccordion", () => {
  it("renders collapsed by default and expands on click", () => {
    render(<WaysToRedeemAccordion pencePerPointRedeemed={1} minRedeemPoints={100} />);

    expect(screen.getByText("Ways to redeem")).toBeTruthy();
    expect(screen.queryByText("Instant checkout discount")).toBeNull();

    // Click to expand
    fireEvent.click(screen.getByRole("button", { name: /ways to redeem/i }));
    expect(screen.getByText("Instant checkout discount")).toBeTruthy();
    expect(screen.getByText(/Every 100 points equals £1.00 off/)).toBeTruthy();
    expect(screen.getByText("Low redemption threshold")).toBeTruthy();
    expect(screen.getByText(/reaches 100 points/)).toBeTruthy();
  });
});

describe("AvailableRewardsSection", () => {
  it("renders available vouchers with status based on points balance", () => {
    render(
      <AvailableRewardsSection
        balancePoints={60}
        pencePerPointRedeemed={1}
        minRedeemPoints={100}
      />,
    );

    expect(screen.getByText("Available rewards")).toBeTruthy();
    expect(screen.getByText("100 pts")).toBeTruthy();
    expect(screen.getByText("500 pts")).toBeTruthy();
    expect(screen.getByText("1000 pts")).toBeTruthy();
    expect(screen.getByText("40 more points needed")).toBeTruthy();
  });

  it("shows ready state when points balance meets threshold", () => {
    render(
      <AvailableRewardsSection
        balancePoints={150}
        pencePerPointRedeemed={1}
        minRedeemPoints={100}
      />,
    );

    expect(screen.getByText("Ready")).toBeTruthy();
    expect(screen.getByText("Available at checkout")).toBeTruthy();
  });
});

describe("ReferralCard", () => {
  it("displays referral link and copy button", () => {
    render(
      <ReferralCard
        referralUrl="https://aheed.co.uk/?ref=REF-12345678"
        referralCode="REF-12345678"
        completedCount={2}
        discountOffPence={500}
        rewardPoints={100}
      />,
    );

    expect(screen.getByText("Refer your friends")).toBeTruthy();
    expect(screen.getByText("2 referrals completed")).toBeTruthy();
    expect(screen.getByText("https://aheed.co.uk/?ref=REF-12345678")).toBeTruthy();
    expect(screen.getByRole("button", { name: /copy referral link/i })).toBeTruthy();
  });
});

describe("RewardsPanel", () => {
  it("renders slide-out panel with header and sections when open", () => {
    const handleClose = vi.fn();
    render(
      <RewardsPanel
        open={true}
        onClose={handleClose}
        data={{
          authenticated: true,
          loyaltyEnabled: true,
          balancePoints: 60,
          expiryDate: "July 22, 2027",
          pointsPerPoundEarned: 1,
          pencePerPointRedeemed: 1,
          minRedeemPoints: 100,
          tier: null,
          referralCode: "REF-ABC12345",
          referralsCompleted: 0,
          referralUrl: "https://aheed.co.uk/?ref=REF-ABC12345",
          discountOffPence: 500,
          rewardPoints: 100,
        }}
      />,
    );

    expect(screen.getByText("Your Loyalty Points")).toBeTruthy();
    expect(screen.getByText("60")).toBeTruthy();
    expect(screen.getByText("Expiration date: July 22, 2027")).toBeTruthy();
    expect(screen.getByText("Ways to earn")).toBeTruthy();
    expect(screen.getByText("Ways to redeem")).toBeTruthy();
    expect(screen.getByText("Refer your friends")).toBeTruthy();

    // Click close button
    fireEvent.click(screen.getByRole("button", { name: /close rewards panel/i }));
    expect(handleClose).toHaveBeenCalledOnce();
  });

  it("does not render when open is false", () => {
    const { container } = render(<RewardsPanel open={false} onClose={vi.fn()} data={null} />);
    expect(container.firstChild).toBeNull();
  });
});
