import { describe, expect, it } from "vitest";
import { contactChannels, type ContactChannelsInput } from "@/lib/contact-channels";

const VENDOR = "Test Shop";
const ALL: ContactChannelsInput = {
  vendorName: VENDOR,
  facebookUrl: "https://facebook.com/test",
  instagramUrl: "https://instagram.com/test",
  whatsappNumber: "447700900123",
  assistantAvailable: false,
};

describe("contactChannels (#1060 R9)", () => {
  it("lists every set channel in the fixed order, with links and labels", () => {
    expect(contactChannels(ALL)).toEqual([
      { kind: "facebook", href: "https://facebook.com/test", label: `${VENDOR} on Facebook` },
      { kind: "instagram", href: "https://instagram.com/test", label: `${VENDOR} on Instagram` },
      {
        kind: "whatsapp",
        href: `https://wa.me/447700900123?text=${encodeURIComponent(
          `Hi ${VENDOR}, I have a question about my order.`,
        )}`,
        label: `Message ${VENDOR} on WhatsApp`,
      },
    ]);
  });

  it("replaces WhatsApp with the assistant, last, when the assistant is available (#1051)", () => {
    expect(contactChannels({ ...ALL, assistantAvailable: true })).toEqual([
      expect.objectContaining({ kind: "facebook" }),
      expect.objectContaining({ kind: "instagram" }),
      { kind: "assistant", href: null, label: "Open help assistant" },
    ]);
  });

  it("omits each channel whose value is unset", () => {
    expect(contactChannels({ ...ALL, facebookUrl: null }).map((c) => c.kind)).toEqual([
      "instagram",
      "whatsapp",
    ]);
    expect(contactChannels({ ...ALL, instagramUrl: null }).map((c) => c.kind)).toEqual([
      "facebook",
      "whatsapp",
    ]);
    expect(contactChannels({ ...ALL, whatsappNumber: null }).map((c) => c.kind)).toEqual([
      "facebook",
      "instagram",
    ]);
  });

  it("is empty when nothing is set", () => {
    expect(
      contactChannels({
        vendorName: VENDOR,
        facebookUrl: null,
        instagramUrl: null,
        whatsappNumber: null,
        assistantAvailable: false,
      }),
    ).toEqual([]);
  });
});
