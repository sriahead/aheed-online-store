import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  isDecommissionedHost,
  resolveCanonicalHost,
  buildProductMetadata,
  buildCategoryMetadata,
} from "@/lib/page-metadata";
import { buildStoreJsonLd, buildProductJsonLd, serializeJsonLd } from "@/lib/seo-schema";
import { fetchVendorProfile } from "@/lib/repositories/vendor";

describe("SEO Canonical Domain Resolution (#1591)", () => {
  describe("isDecommissionedHost", () => {
    it("flags nocaped.com and its subdomains as decommissioned", () => {
      expect(isDecommissionedHost("nocaped.com")).toBe(true);
      expect(isDecommissionedHost("aheedfoodcentre.nocaped.com")).toBe(true);
      expect(isDecommissionedHost("staging.nocaped.com")).toBe(true);
      expect(isDecommissionedHost("AHEEDFOODCENTRE.NOCAPED.COM")).toBe(true);
    });

    it("does not flag custom production domains as decommissioned", () => {
      expect(isDecommissionedHost("aheedfoodcentre.co.uk")).toBe(false);
      expect(isDecommissionedHost("www.aheedfoodcentre.co.uk")).toBe(false);
      expect(isDecommissionedHost("staging.aheedfoodcentre.co.uk")).toBe(false);
      expect(isDecommissionedHost("srimart.example")).toBe(false);
    });
  });

  describe("resolveCanonicalHost", () => {
    it("uses canonicalHost when provided and valid", () => {
      expect(resolveCanonicalHost("aheedfoodcentre.co.uk", "www.aheedfoodcentre.co.uk")).toBe(
        "www.aheedfoodcentre.co.uk",
      );
      expect(resolveCanonicalHost("aheedfoodcentre.nocaped.com", "www.aheedfoodcentre.co.uk")).toBe(
        "www.aheedfoodcentre.co.uk",
      );
    });

    it("never emits nocaped.com even if request host is nocaped.com and canonicalHost is absent", () => {
      expect(resolveCanonicalHost("aheedfoodcentre.nocaped.com")).toBe("www.aheedfoodcentre.co.uk");
    });

    it("rejects canonicalHost if it points to a decommissioned host", () => {
      expect(
        resolveCanonicalHost("aheedfoodcentre.nocaped.com", "aheedfoodcentre.nocaped.com"),
      ).toBe("www.aheedfoodcentre.co.uk");
    });

    it("preserves tenant request host when canonicalHost is absent and host is valid", () => {
      expect(resolveCanonicalHost("srimart.example")).toBe("srimart.example");
    });
  });

  describe("buildProductMetadata & buildCategoryMetadata with canonical host", () => {
    it("anchors product canonical URL to canonicalHost when provided", () => {
      const meta = buildProductMetadata({
        host: "aheedfoodcentre.co.uk",
        canonicalHost: "www.aheedfoodcentre.co.uk",
        slug: "royal-basmati-rice-5kg",
        name: "Royal Basmati Rice 5kg",
        description: "Finest long grain basmati rice.",
        vendorName: "Aheed Food Centre",
      });

      expect(meta.alternates.canonical).toBe(
        "https://www.aheedfoodcentre.co.uk/products/royal-basmati-rice-5kg",
      );
    });

    it("redirects product canonical away from nocaped.com to www.aheedfoodcentre.co.uk", () => {
      const meta = buildProductMetadata({
        host: "aheedfoodcentre.nocaped.com",
        slug: "halal-chicken-breast-1kg",
        name: "Halal Chicken Breast 1kg",
        description: "Fresh premium chicken breast.",
        vendorName: "Aheed Food Centre",
      });

      expect(meta.alternates.canonical).toBe(
        "https://www.aheedfoodcentre.co.uk/products/halal-chicken-breast-1kg",
      );
    });

    it("anchors category canonical URL to canonicalHost", () => {
      const meta = buildCategoryMetadata({
        host: "aheedfoodcentre.co.uk",
        canonicalHost: "www.aheedfoodcentre.co.uk",
        slug: "spices-seasonings",
        name: "Spices & Seasonings",
        vendorName: "Aheed Food Centre",
      });

      expect(meta.alternates.canonical).toBe(
        "https://www.aheedfoodcentre.co.uk/categories/spices-seasonings",
      );
    });
  });

  describe("Schema.org JSON-LD Generation (#1591)", () => {
    it("generates valid GroceryStore / LocalBusiness JSON-LD", () => {
      const jsonLd = buildStoreJsonLd({
        name: "Aheed Food Centre",
        canonicalOrigin: "https://www.aheedfoodcentre.co.uk",
        telephone: "01908 239130",
        location: {
          addressLine1: "Unit 22-23 Lloyds Court",
          addressLine2: "11-13 North Tenth Street",
          city: "Milton Keynes",
          postcode: "MK9 3EL",
        },
        geo: {
          latitude: 52.0438,
          longitude: -0.7513,
        },
        weeklyHours: [
          { dayOfWeek: 1, openTime: "09:00", closeTime: "20:00" },
          { dayOfWeek: 0, openTime: "09:00", closeTime: "19:00" },
        ],
        imageUrl: "https://cdn.example.com/logo.png",
      });

      expect(jsonLd["@context"]).toBe("https://schema.org");
      expect(jsonLd["@type"]).toBe("GroceryStore");
      expect(jsonLd.name).toBe("Aheed Food Centre");
      expect(jsonLd.url).toBe("https://www.aheedfoodcentre.co.uk");
      expect(jsonLd.telephone).toBe("01908 239130");
      expect(jsonLd.image).toBe("https://cdn.example.com/logo.png");

      const address = jsonLd.address as Record<string, unknown>;
      expect(address["@type"]).toBe("PostalAddress");
      expect(address.streetAddress).toBe("Unit 22-23 Lloyds Court, 11-13 North Tenth Street");
      expect(address.addressLocality).toBe("Milton Keynes");
      expect(address.postalCode).toBe("MK9 3EL");
      expect(address.addressCountry).toBe("GB");

      const geo = jsonLd.geo as Record<string, unknown>;
      expect(geo["@type"]).toBe("GeoCoordinates");
      expect(geo.latitude).toBe(52.0438);
      expect(geo.longitude).toBe(-0.7513);

      const hours = jsonLd.openingHoursSpecification as Array<Record<string, unknown>>;
      expect(hours).toHaveLength(2);
      expect(hours[0].dayOfWeek).toBe("Monday");
      expect(hours[0].opens).toBe("09:00");
      expect(hours[0].closes).toBe("20:00");
      expect(hours[1].dayOfWeek).toBe("Sunday");
      expect(hours[1].opens).toBe("09:00");
      expect(hours[1].closes).toBe("19:00");
    });

    it("generates valid Product and Offer JSON-LD", () => {
      const jsonLd = buildProductJsonLd({
        name: "Shan Biryani Recipe Mix 50g",
        description: "Authentic spice mix for biryani.",
        slug: "shan-biryani-50g",
        basePrice: 129,
        isInStock: true,
        canonicalOrigin: "https://www.aheedfoodcentre.co.uk",
        vendorName: "Aheed Food Centre",
        imageUrl: "https://cdn.example.com/shan-biryani.png",
        sku: "prod-123",
      });

      expect(jsonLd["@context"]).toBe("https://schema.org");
      expect(jsonLd["@type"]).toBe("Product");
      expect(jsonLd.name).toBe("Shan Biryani Recipe Mix 50g");
      expect(jsonLd.url).toBe("https://www.aheedfoodcentre.co.uk/products/shan-biryani-50g");
      expect(jsonLd.sku).toBe("prod-123");
      expect(jsonLd.image).toEqual(["https://cdn.example.com/shan-biryani.png"]);

      const offers = jsonLd.offers as Record<string, unknown>;
      expect(offers["@type"]).toBe("Offer");
      expect(offers.price).toBe("1.29");
      expect(offers.priceCurrency).toBe("GBP");
      expect(offers.availability).toBe("https://schema.org/InStock");
      expect(offers.url).toBe("https://www.aheedfoodcentre.co.uk/products/shan-biryani-50g");

      const seller = offers.seller as Record<string, unknown>;
      expect(seller["@type"]).toBe("Organization");
      expect(seller.name).toBe("Aheed Food Centre");
    });

    it("marks out-of-stock products correctly in Product JSON-LD", () => {
      const jsonLd = buildProductJsonLd({
        name: "Rare Item",
        description: "Currently unavailable",
        slug: "rare-item",
        basePrice: 500,
        isInStock: false,
        canonicalOrigin: "https://www.aheedfoodcentre.co.uk",
        vendorName: "Aheed Food Centre",
      });

      const offers = jsonLd.offers as Record<string, unknown>;
      expect(offers.availability).toBe("https://schema.org/OutOfStock");
    });

    it("serializeJsonLd safely escapes opening HTML tags to prevent XSS", () => {
      const data = {
        name: 'Evil</script><script>alert("xss")</script>',
      };
      const serialized = serializeJsonLd(data);
      expect(serialized).not.toContain("</script>");
      expect(serialized).toContain("\\u003c/script>");
    });
  });

  describe("fetchVendorProfile canonicalHost mapping", () => {
    it("maps canonicalHost from isCanonical VendorDomain", async () => {
      const mockFindUnique = vi.fn().mockResolvedValue({
        name: "Aheed Food Centre",
        domains: [{ host: "www.aheedfoodcentre.co.uk", isCanonical: true }],
        branding: null,
        config: null,
        deliveryAreas: [],
      });
      const prisma = { vendor: { findUnique: mockFindUnique } } as unknown as Parameters<
        typeof fetchVendorProfile
      >[0];

      const profile = await fetchVendorProfile(prisma, "v-aheed");
      expect(profile.canonicalHost).toBe("www.aheedfoodcentre.co.uk");
    });

    it("sets canonicalHost to null when no canonical domain is configured", async () => {
      const mockFindUnique = vi.fn().mockResolvedValue({
        name: "New Store",
        domains: [],
        branding: null,
        config: null,
        deliveryAreas: [],
      });
      const prisma = { vendor: { findUnique: mockFindUnique } } as unknown as Parameters<
        typeof fetchVendorProfile
      >[0];

      const profile = await fetchVendorProfile(prisma, "v-new");
      expect(profile.canonicalHost).toBeNull();
    });
  });
});
