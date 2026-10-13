// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { WaysToEarnAccordion } from "@/components/rewards/WaysToEarnAccordion";
import { WaysToRedeemAccordion } from "@/components/rewards/WaysToRedeemAccordion";
import { ReferralCard } from "@/components/rewards/ReferralCard";
import { AvailableRewardsSection } from "@/components/rewards/AvailableRewardsSection";
import { RewardsPanel } from "@/components/rewards/RewardsPanel";
import { RewardsLauncher } from "@/components/rewards/RewardsLauncher";
import { formatPrice } from "@/components/product/format-price";
import { MIN_REFERRAL_ORDER_PENCE, REFERRAL_DISCOUNT_PENCE } from "@/lib/referrals";

afterEach(cleanup);

describe("WaysToEarnAccordion", () => {
  it("renders collapsed by default and expands on click", () => {
    render(<WaysToEarnAccordion pointsPerPoundEarned={1} rewardPoints={100} />);

    expect(screen.getByText("Ways to earn")).toBeTruthy();
    expect(screen.queryByText("Place an order")).toBeNull();

    // Click to expand
    fireEvent.click(screen.getByRole("button", { name: /ways to earn/i }));
    expect(screen.getByText("Place an order")).toBeTruthy();
    expect(screen.getByText(/Earn 1 point for every £1 spent/)).toBeTruthy();
    expect(screen.getByText("Refer your friends")).toBeTruthy();
    expect(screen.getByText(/earn 100 bonus points/)).toBeTruthy();

    // Click to collapse
    fireEvent.click(screen.getByRole("button", { name: /ways to earn/i }));
    expect(screen.queryByText("Place an order")).toBeNull();
  });

  // #1077 R18 — "point" was hardcoded, so a vendor earning 2 points per pound read "2 point".
  it("pluralises the unit on the vendor's own earn rate (R18)", () => {
    render(<WaysToEarnAccordion pointsPerPoundEarned={2} rewardPoints={100} />);
    fireEvent.click(screen.getByRole("button", { name: /ways to earn/i }));

    expect(screen.getByText(/Earn 2 points for every £1 spent/)).toBeTruthy();
  });

  // #1079 R22 — the referral line states the real rule (a minimum spend, one use per friend), from
  // the constants, and no longer promises a "qualifying first order".
  it("states the referral minimum from the constants and no first-order rule (#1079 R22)", () => {
    render(<WaysToEarnAccordion pointsPerPoundEarned={1} rewardPoints={100} />);
    fireEvent.click(screen.getByRole("button", { name: /ways to earn/i }));

    const line = screen.getByText(/bonus points when their order is confirmed/).textContent ?? "";
    expect(line).toContain(`${formatPrice(REFERRAL_DISCOUNT_PENCE)} off an order of`);
    expect(line).toContain(`${formatPrice(MIN_REFERRAL_ORDER_PENCE)} or more`);
    expect(line).toContain("Each friend can use it once");
    expect(line).not.toMatch(/qualifying/i);
    expect(line).not.toMatch(/first order/i);
  });

  // #1077 R16 — the tier-boost line renders only above 1x, which is why a missing `maxMultiplier`
  // made it invisible on the rewards panel without failing anything.
  it("shows the tier-boost line above 1x and hides it at 1x (R16)", () => {
    render(<WaysToEarnAccordion pointsPerPoundEarned={1} rewardPoints={100} maxMultiplier={1.5} />);
    fireEvent.click(screen.getByRole("button", { name: /ways to earn/i }));
    expect(screen.getByText("Loyalty tier boosts")).toBeTruthy();

    cleanup();
    render(<WaysToEarnAccordion pointsPerPoundEarned={1} rewardPoints={100} maxMultiplier={1} />);
    fireEvent.click(screen.getByRole("button", { name: /ways to earn/i }));
    expect(screen.queryByText("Loyalty tier boosts")).toBeNull();
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
  it("renders milestones with status based on points balance", () => {
    render(
      <AvailableRewardsSection
        balancePoints={60}
        pencePerPointRedeemed={1}
        minRedeemPoints={100}
      />,
    );

    expect(screen.getByText("Points milestones")).toBeTruthy();
    expect(screen.getByText("100 pts")).toBeTruthy();
    expect(screen.getByText("200 pts")).toBeTruthy();
    expect(screen.getByText("500 pts")).toBeTruthy();
    expect(screen.getByText("40 more points needed")).toBeTruthy();
  });

  /**
   * #1077 R21/R22 — every threshold is a multiple of the VENDOR's `minRedeemPoints`.
   *
   * 500 and 1000 used to be hardcoded, so this vendor — whose minimum is 250 — was shown a 500
   * step it does not define and a 1000 step presented as the ceiling, both invented by the
   * platform. The figures below are 1x, 2x and 5x of 250 at 2p per point.
   */
  it("derives every threshold from the vendor's own minimum (R21, R22)", () => {
    render(
      <AvailableRewardsSection balancePoints={0} pencePerPointRedeemed={2} minRedeemPoints={250} />,
    );

    expect(screen.getByText("250 pts")).toBeTruthy();
    expect(screen.getByText("500 pts")).toBeTruthy();
    expect(screen.getByText("1250 pts")).toBeTruthy();
    expect(screen.getByText("£5.00 off your basket")).toBeTruthy();
    expect(screen.getByText("£10.00 off your basket")).toBeTruthy();
    expect(screen.getByText("£25.00 off your basket")).toBeTruthy();
    expect(screen.queryByText("1000 pts")).toBeNull();
  });

  // #1077 R23 — no minimum means no threshold to show, so the section hides rather than rendering
  // three cards all reading "0 pts" (#239's null-hides rule).
  it("renders nothing when the vendor sets no redemption minimum (R23)", () => {
    const { container } = render(
      <AvailableRewardsSection balancePoints={500} pencePerPointRedeemed={1} minRedeemPoints={0} />,
    );

    expect(container.innerHTML).toBe("");
  });

  // #1077 R23 — no rendered text calls these vouchers; redemption is a points field at checkout,
  // not an issued code.
  it("promises no voucher anywhere in its rendered copy (R23)", () => {
    const { container } = render(
      <AvailableRewardsSection
        balancePoints={60}
        pencePerPointRedeemed={1}
        minRedeemPoints={100}
      />,
    );

    expect(container.textContent?.toLowerCase()).not.toContain("voucher");
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
        storeName="Aheed Food Centre"
      />,
    );

    expect(screen.getByText("Refer your friends")).toBeTruthy();
    expect(screen.getByText("2 referrals completed")).toBeTruthy();
    expect(screen.getByText("https://aheed.co.uk/?ref=REF-12345678")).toBeTruthy();
    expect(screen.getByRole("button", { name: /copy referral link/i })).toBeTruthy();
  });

  /**
   * #1077 R19/R20 — the offer sentence states the rules the code actually enforces.
   *
   * The £20 is `MIN_REFERRAL_ORDER_PENCE`, written as the referral code's `minSubtotalPence`, and
   * `evaluateCode` refuses below it — so it gates the friend's £5 AND the referrer's points, which
   * are only awarded where a referral redemption exists. "First order" was never enforced at all:
   * the code carries `maxPerCustomer: 1`, one use per customer.
   */
  it("states the enforced minimum and makes no first-order claim (R19, R20)", () => {
    const { container } = render(
      <ReferralCard
        referralUrl="https://aheed.co.uk/?ref=REF-12345678"
        referralCode="REF-12345678"
        completedCount={0}
        discountOffPence={500}
        rewardPoints={100}
        storeName="Aheed Food Centre"
      />,
    );

    const copy = container.textContent ?? "";
    expect(copy).toContain("£5.00 off an order of £20.00 or more");
    expect(copy).toContain("Each friend can use it once");
    expect(copy).not.toMatch(/first order/i);
  });

  // #991 R18 — a signed-in shopper whose code could not be read or created is told so, and is never
  // offered the bare store URL as a £5-off invite. navigator.share is stubbed so the header share
  // button WOULD render if the card did not suppress it.
  describe("with an empty code for a signed-in shopper", () => {
    afterEach(() => {
      delete (navigator as { share?: unknown }).share;
    });

    const renderCard = (referralCode: string) => {
      Object.defineProperty(navigator, "share", { value: vi.fn(), configurable: true });
      render(
        <ReferralCard
          referralUrl={referralCode ? `https://aheed.co.uk/?ref=${referralCode}` : ""}
          referralCode={referralCode}
          authenticated={true}
          storeName="Aheed Food Centre"
        />,
      );
    };

    it("says the link is unavailable and offers no link, copy or share", () => {
      renderCard("");
      expect(
        screen.getByText("Your referral link isn't available right now. Please try again later."),
      ).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Share referral link" })).toBeNull();
      expect(screen.queryByRole("button", { name: /copy referral link/i })).toBeNull();
      expect(screen.queryAllByRole("link", { name: /share referral link/i })).toHaveLength(0);
    });

    it("still offers the share button and links when there is a code", () => {
      renderCard("REF-ABCDEFGH");
      expect(screen.getByRole("button", { name: "Share referral link" })).toBeTruthy();
      expect(screen.getAllByRole("link", { name: /share referral link/i })).toHaveLength(3);
    });
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
          // #1077 R16 — above 1x, so this fixture proves the panel forwards it to the accordion.
          maxMultiplier: 1.25,
          referralCode: "REF-ABC12345",
          referralsCompleted: 0,
          referralUrl: "https://aheed.co.uk/?ref=REF-ABC12345",
          discountOffPence: 500,
          rewardPoints: 100,
        }}
        vendorName="SriMart"
      />,
    );

    // #729 R3 — the header names the CURRENT vendor, not a hardcoded one.
    expect(screen.getByText("SriMart Club")).toBeTruthy();
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
    const { container } = render(
      <RewardsPanel open={false} onClose={vi.fn()} data={null} vendorName="SriMart" />,
    );
    expect(container.firstChild).toBeNull();
  });
});

describe("RewardsLauncher", () => {
  it("renders launcher button with Aheed branding and opens panel with initialData", () => {
    render(
      <RewardsLauncher
        initialData={{
          authenticated: true,
          loyaltyEnabled: true,
          balancePoints: 100419,
          expiryDate: null,
          pointsPerPoundEarned: 1,
          pencePerPointRedeemed: 1,
          minRedeemPoints: 100,
          tier: null,
          maxMultiplier: 1,
          referralCode: "REF-DEMO1234",
          referralsCompleted: 3,
          referralUrl: "https://staging.aheedfoodcentre.nocaped.com/?ref=REF-DEMO1234",
          discountOffPence: 500,
          rewardPoints: 100,
        }}
        vendorName="Aheed Food Centre"
      />,
    );

    const button = screen.getByRole("button", { name: /open rewards and loyalty panel/i });
    expect(button).toBeTruthy();
    expect(button.className).toContain("bg-primary");
    expect(button.className).toContain("text-white");

    // Click to open panel
    fireEvent.click(button);

    // Initial data should immediately be rendered without 0 points flash
    expect(screen.getByText("Your Loyalty Points")).toBeTruthy();
    expect(screen.getByText("Aheed Food Centre Club")).toBeTruthy();
    expect(screen.getByText("100419")).toBeTruthy();
    expect(screen.getByText("Points active")).toBeTruthy();
    expect(screen.getByText("3 referrals completed")).toBeTruthy();
    expect(
      screen.getByText("https://staging.aheedfoodcentre.nocaped.com/?ref=REF-DEMO1234"),
    ).toBeTruthy();
  });
});
