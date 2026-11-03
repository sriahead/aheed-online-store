// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DESTINATIONS_UNAVAILABLE_MESSAGE } from "@/lib/client-setup/destination-copy";

/**
 * #1392 R5–R9 (Forward to dropdown) and #1403 R14 (Use suggested sender). The server actions are
 * mocked; nothing here submits. A form's posted fields are read with `new FormData(form)`.
 */

const saveSenderAction = vi.fn();
vi.mock("@/app/(admin)/staff/platform/client-setup/actions", () => ({
  addInboundAddressAction: vi.fn(),
  removeInboundAddressAction: vi.fn(),
  saveSenderAction,
  sendTestEmailAction: vi.fn(),
}));

const { AddInboundAddressForm, SenderForm } =
  await import("@/components/staff/client-setup/EmailSetupForms");

afterEach(() => cleanup());

const DEFAULT = { status: "set" as const, address: "hub@inbox.test" };
const OK = {
  status: "ok" as const,
  addresses: [
    { email: "hub@inbox.test", verified: true },
    { email: "shop@inbox.test", verified: true },
    { email: "pending@inbox.test", verified: false },
  ],
};

function renderForm(
  defaultForward: Parameters<typeof AddInboundAddressForm>[0]["defaultForward"],
  destinations: Parameters<typeof AddInboundAddressForm>[0]["destinations"] = OK,
) {
  const { container } = render(
    <AddInboundAddressForm
      vendorId="v1"
      defaultForward={defaultForward}
      destinations={destinations}
    />,
  );
  return container.querySelector("form") as HTMLFormElement;
}

const select = () => screen.getByLabelText(/forward to/i) as unknown as HTMLSelectElement;
const otherInput = () => screen.queryByLabelText(/other mailbox/i) as HTMLInputElement | null;
const warning = () => screen.queryByText(/forwards only to verified destination addresses/i);
const posted = (form: HTMLFormElement) => new FormData(form).getAll("forwardTo");

describe("Forward to dropdown (R5)", () => {
  it("lists verified mailboxes enabled, pending ones disabled, and Other… last", () => {
    renderForm(DEFAULT);
    const options = [...select().options];
    expect(select().tagName).toBe("SELECT");
    expect(options.map((o) => o.textContent)).toEqual([
      "hub@inbox.test",
      "shop@inbox.test",
      "pending@inbox.test (awaiting verification)",
      "Other…",
    ]);
    expect(options.map((o) => o.disabled)).toEqual([false, false, true, false]);
  });

  it("shows the text box and warning only while Other… is chosen", () => {
    renderForm(DEFAULT);
    expect(otherInput()).toBeNull();
    expect(warning()).toBeNull();
    fireEvent.change(select(), { target: { value: "__other__" } });
    expect(otherInput()).not.toBeNull();
    expect(otherInput()!.required).toBe(true);
    expect(warning()).not.toBeNull();
    fireEvent.change(select(), { target: { value: "shop@inbox.test" } });
    expect(otherInput()).toBeNull();
    expect(warning()).toBeNull();
  });
});

describe("Forward to preselection (R6)", () => {
  it("preselects the platform default when it is verified", () => {
    renderForm(DEFAULT);
    expect(select().value).toBe("hub@inbox.test");
    expect(otherInput()).toBeNull();
  });

  it("preselects Other… with the default typed in when the default is not verified", () => {
    renderForm({ status: "set", address: "pending@inbox.test" });
    expect(select().value).toBe("__other__");
    expect(otherInput()!.value).toBe("pending@inbox.test");
  });

  it.each([{ status: "unset" as const }, { status: "invalid" as const }])(
    "preselects the first verified mailbox when the default is $status",
    (defaultForward) => {
      renderForm(defaultForward);
      expect(select().value).toBe("hub@inbox.test");
    },
  );

  it("preselects Other…, empty, when the default is unset and nothing is verified", () => {
    renderForm(
      { status: "unset" },
      { status: "ok", addresses: [{ email: "pending@inbox.test", verified: false }] },
    );
    expect(select().value).toBe("__other__");
    expect(otherInput()!.value).toBe("");
  });
});

describe("exactly one forwardTo is posted (R7)", () => {
  it("posts the selected mailbox", () => {
    const form = renderForm(DEFAULT);
    fireEvent.change(select(), { target: { value: "shop@inbox.test" } });
    expect(posted(form)).toEqual(["shop@inbox.test"]);
  });

  it("posts the typed text when Other… is chosen", () => {
    const form = renderForm(DEFAULT);
    fireEvent.change(select(), { target: { value: "__other__" } });
    fireEvent.change(otherInput()!, { target: { value: "own@mailbox.test" } });
    expect(posted(form)).toEqual(["own@mailbox.test"]);
  });
});

describe("fallback when Cloudflare cannot be read (R8)", () => {
  it.each(["not-configured", "forbidden", "error"] as const)(
    "keeps the #1399 text field and names the %s reason",
    (reason) => {
      const form = renderForm(DEFAULT, { status: "unavailable", reason });
      const input = screen.getByLabelText(/forward to/i) as HTMLInputElement;
      expect(input.tagName).toBe("INPUT");
      expect(input.type).toBe("email");
      expect(input.required).toBe(true);
      expect(input.value).toBe("hub@inbox.test");
      expect(screen.getByText(DESTINATIONS_UNAVAILABLE_MESSAGE[reason])).toBeTruthy();
      expect(posted(form)).toEqual(["hub@inbox.test"]);
    },
  );
});

describe("Use suggested sender (#1403 R14)", () => {
  const SUGGESTION = { name: "Corner Shop", email: "orders@cornershop.example" };

  it("fills both inputs without submitting", () => {
    const { container } = render(
      <SenderForm
        vendorId="v1"
        senderName="Old Name"
        senderEmail="orders@old.example"
        suggestion={SUGGESTION}
      />,
    );
    const form = container.querySelector("form") as HTMLFormElement;
    const onSubmit = vi.fn((e: Event) => e.preventDefault());
    form.addEventListener("submit", onSubmit);

    expect(screen.getByText(/orders@cornershop\.example/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /use suggested sender/i }));

    expect((screen.getByLabelText(/sender name/i) as HTMLInputElement).value).toBe("Corner Shop");
    expect((screen.getByLabelText(/sender email/i) as HTMLInputElement).value).toBe(
      "orders@cornershop.example",
    );
    expect(onSubmit).not.toHaveBeenCalled();
    expect(saveSenderAction).not.toHaveBeenCalled();
  });

  it("is hidden when the saved sender already equals the suggestion (email case-insensitive)", () => {
    render(
      <SenderForm
        vendorId="v1"
        senderName="Corner Shop"
        senderEmail="Orders@CornerShop.example"
        suggestion={SUGGESTION}
      />,
    );
    expect(screen.queryByRole("button", { name: /use suggested sender/i })).toBeNull();
    expect(screen.queryByText(/suggested/i)).toBeNull();
  });

  it("is hidden when there is no suggestion", () => {
    render(<SenderForm vendorId="v1" senderName="" senderEmail="" suggestion={null} />);
    expect(screen.queryByRole("button", { name: /use suggested sender/i })).toBeNull();
  });
});
