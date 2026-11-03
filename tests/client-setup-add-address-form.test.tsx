// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

/**
 * #1399 R5 — Client Setup's Add address form prefills Forward to with the platform default inbox.
 * The server actions are mocked because nothing here submits.
 */

vi.mock("@/app/(admin)/staff/platform/client-setup/actions", () => ({
  addInboundAddressAction: vi.fn(),
  removeInboundAddressAction: vi.fn(),
  saveSenderAction: vi.fn(),
  sendTestEmailAction: vi.fn(),
}));

const { AddInboundAddressForm } = await import("@/components/staff/client-setup/EmailSetupForms");

const HINT = /platform default inbox/i;

// #1392 — these #1399 cases are the fallback: Cloudflare's destination addresses unavailable.
const UNAVAILABLE = { status: "unavailable" as const, reason: "not-configured" as const };

afterEach(() => cleanup());

describe("AddInboundAddressForm forward-to prefill (R5)", () => {
  it("prefills the default, keeps the field required and editable, and shows the hint", () => {
    render(
      <AddInboundAddressForm
        vendorId="v1"
        defaultForward={{ status: "set", address: "hub@inbox.test" }}
        destinations={UNAVAILABLE}
      />,
    );
    const input = screen.getByLabelText(/forward to/i) as HTMLInputElement;
    expect(input.value).toBe("hub@inbox.test");
    expect(input.required).toBe(true);
    expect(input.type).toBe("email");
    expect(input.readOnly).toBe(false);
    expect(screen.getByText(HINT)).toBeTruthy();
  });

  it.each([{ status: "unset" as const }, { status: "invalid" as const }])(
    "renders an empty field with no hint when the default is $status",
    (defaultForward) => {
      render(
        <AddInboundAddressForm
          vendorId="v1"
          defaultForward={defaultForward}
          destinations={UNAVAILABLE}
        />,
      );
      const input = screen.getByLabelText(/forward to/i) as HTMLInputElement;
      expect(input.value).toBe("");
      expect(input.required).toBe(true);
      expect(screen.queryByText(HINT)).toBeNull();
    },
  );
});
