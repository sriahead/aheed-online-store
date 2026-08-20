/**
 * ProductMetadataService port.
 * Fetches product metadata (specifically an image) from Open Food Facts API.
 *
 * Complies with vendor-agnostic architecture using standard fetch.
 */

export interface ProductMetadataService {
  /** Returns an image URL if found on Open Food Facts, or null */
  fetchImageUrl(productName: string, barcode?: string | null): Promise<string | null>;
}

export function getProductMetadataService(): ProductMetadataService {
  return {
    async fetchImageUrl(productName, barcode) {
      if (barcode) {
        // Open food facts API by barcode
        const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${barcode}`);
        if (res.ok) {
          const data = (await res.json()) as any;
          if (data.product && data.product.image_url) {
            return data.product.image_url;
          }
        }
      }

      // Fallback to text search
      const res = await fetch(
        `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(productName)}&search_simple=1&action=process&json=1&page_size=1`,
      );
      if (res.ok) {
        const data = (await res.json()) as any;
        if (data.products && data.products.length > 0 && data.products[0].image_url) {
          return data.products[0].image_url;
        }
      }
      return null;
    },
  };
}
