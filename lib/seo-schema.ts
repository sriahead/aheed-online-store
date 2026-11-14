/**
 * Schema.org JSON-LD structured data generators for SEO (#1591).
 *
 * Implements Google Search structured data specifications:
 * - GroceryStore / LocalBusiness for storefront organization & local search visibility
 * - Product and Offer for individual product detail pages and rich snippets
 */

export interface StoreJsonLdInput {
  name: string;
  canonicalOrigin: string;
  telephone?: string | null;
  location?: {
    addressLine1?: string | null;
    addressLine2?: string | null;
    city?: string | null;
    postcode?: string | null;
  } | null;
  geo?: {
    latitude: number;
    longitude: number;
  } | null;
  weeklyHours?: Array<{
    dayOfWeek: number;
    openTime?: string | null;
    closeTime?: string | null;
    closed?: boolean | null;
  }>;
  imageUrl?: string | null;
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * Builds Schema.org GroceryStore structured data.
 * Adheres to Google's LocalBusiness guidelines for supermarkets/grocery stores.
 */
export function buildStoreJsonLd(input: StoreJsonLdInput): Record<string, unknown> {
  const origin = input.canonicalOrigin.replace(/\/+$/, "");
  const street = [input.location?.addressLine1, input.location?.addressLine2]
    .filter(Boolean)
    .join(", ");

  const openingHoursSpecification = (input.weeklyHours ?? [])
    .filter((h) => !h.closed && h.openTime && h.closeTime)
    .map((h) => ({
      "@type": "OpeningHoursSpecification",
      dayOfWeek: DAY_NAMES[h.dayOfWeek] ?? "Monday",
      opens: h.openTime,
      closes: h.closeTime,
    }));

  return {
    "@context": "https://schema.org",
    "@type": "GroceryStore",
    "@id": `${origin}/#store`,
    name: input.name,
    url: origin,
    ...(input.telephone ? { telephone: input.telephone } : {}),
    ...(input.imageUrl ? { image: input.imageUrl } : {}),
    address: {
      "@type": "PostalAddress",
      streetAddress: street || "Unit 22-23 Lloyds Court, 11-13 North Tenth Street",
      addressLocality: input.location?.city || "Milton Keynes",
      postalCode: input.location?.postcode || "MK9 3EL",
      addressCountry: "GB",
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude: input.geo?.latitude ?? 52.0438,
      longitude: input.geo?.longitude ?? -0.7513,
    },
    ...(openingHoursSpecification.length > 0 ? { openingHoursSpecification } : {}),
    priceRange: "££",
  };
}

export interface ProductJsonLdInput {
  name: string;
  description: string;
  slug: string;
  basePrice: number;
  isInStock: boolean;
  canonicalOrigin: string;
  vendorName: string;
  imageUrl?: string | null;
  sku?: string | null;
}

/**
 * Builds Schema.org Product structured data with nested Offer.
 * Adheres to Google Search guidelines for Product rich snippets.
 */
export function buildProductJsonLd(input: ProductJsonLdInput): Record<string, unknown> {
  const origin = input.canonicalOrigin.replace(/\/+$/, "");
  const productUrl = `${origin}/products/${input.slug}`;

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${productUrl}#product`,
    name: input.name,
    description: input.description,
    url: productUrl,
    ...(input.sku ? { sku: input.sku } : {}),
    ...(input.imageUrl ? { image: [input.imageUrl] } : {}),
    offers: {
      "@type": "Offer",
      price: (input.basePrice / 100).toFixed(2),
      priceCurrency: "GBP",
      availability: input.isInStock
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
      url: productUrl,
      seller: {
        "@type": "Organization",
        name: input.vendorName,
      },
    },
  };
}

/**
 * Serializes JSON-LD object to HTML-safe string for use in `<script type="application/ld+json">`.
 * Escapes `<` to prevent XSS / script block break-out.
 */
export function serializeJsonLd(data: Record<string, unknown>): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
