export interface BrandEnrichmentResult {
  brandName: string | null;
  source: "COLUMN" | "KNOWN_BRAND" | "DELIMITED_PREFIX" | null;
  confidence: "HIGH" | "LOW";
}

const PLACEHOLDER_BRANDS = new Set([
  "",
  "-",
  "--",
  ".",
  "n/a",
  "na",
  "none",
  "unknown",
  "generic",
  "misc",
  "general",
  "default",
  "null",
  "undefined",
  "other",
]);

const GENERIC_CATEGORY_PREFIXES = new Set([
  "grocery",
  "food",
  "produce",
  "veg",
  "vegetable",
  "vegetables",
  "fruit",
  "fruits",
  "bakery",
  "bread",
  "meat",
  "poultry",
  "chicken",
  "mutton",
  "beef",
  "fish",
  "seafood",
  "dairy",
  "chilled",
  "frozen",
  "drinks",
  "beverages",
  "snacks",
  "household",
  "cleaning",
  "toiletries",
  "baby",
  "pets",
  "pet food",
  "item",
  "product",
  "offer",
  "offers",
  "promo",
  "promotion",
  "special",
  "new",
  "deal",
]);

export const CURATED_COMMON_BRANDS: readonly string[] = Object.freeze([
  "TRS",
  "Natco",
  "Niru",
  "Aytac",
  "Tropical Sun",
  "Shan",
  "Laziza",
  "Rajah",
  "Rubicon",
  "Diamond",
  "Royal",
  "Shankar",
  "Kasturi",
  "Maggi",
  "Saki",
  "KTC",
  "Vatika",
  "Nestle",
  "Aachi",
  "Pataks",
  "Patak's",
  "Nandos",
  "Nando's",
  "Tilda",
  "Aynoor",
  "Sapna",
  "Aani",
  "Humza",
  "Maliban",
  "MDH",
  "Ahmed",
  "Laila",
  "Regal",
  "Aashirvaad",
  "Preema",
  "KCB",
  "Elephant Atta",
  "Elephant",
  "East End",
  "National",
  "Heera",
  "Al Shifa",
  "Haldiram",
  "Haldiram's",
  "Pran",
  "Dabur",
  "Patanjali",
  "Parle",
  "Britannia",
  "Vimto",
  "Rooh Afza",
  "Hamdard",
  "Foco",
  "Maaza",
  "Frooti",
  "Brooke Bond",
  "Tapal",
  "Cadbury",
  "Coca-Cola",
  "Coke",
  "Pepsi",
  "Fanta",
  "Sprite",
  "7Up",
  "Mirinda",
  "Lucozade",
  "Red Bull",
  "Monster",
  "Boost",
  "Horlicks",
  "Complan",
  "Milo",
  "Galaxy",
  "Mars",
  "Snickers",
  "KitKat",
  "Ferrero",
  "Kinder",
  "Nutella",
  "Lotus",
  "Biscoff",
  "Oreo",
  "McVitie's",
  "Fox's",
  "Walkers",
  "Doritos",
  "Lays",
  "Kurkure",
  "Cheetos",
  "Pringles",
  "KP",
  "Dettol",
  "Lifebuoy",
  "Savlon",
  "Carex",
  "Radox",
  "Dove",
  "Palmolive",
  "Colgate",
  "Aquafresh",
  "Sensodyne",
  "Ariel",
  "Persil",
  "Fairy",
  "Bold",
  "Surf",
  "Comfort",
  "Lenor",
  "Vanish",
  "Flash",
  "Cif",
  "Domestos",
  "Harpic",
  "Stella",
  "Heineken",
  "Budweiser",
  "Peroni",
  "Corona",
  "Guinness",
  "Smirnoff",
  "Bacardi",
  "Koka",
  "Indomie",
  "Nissin",
  "Samyang",
  "Bisto",
  "Oxo",
  "Knorr",
  "Colman's",
  "Greenfields",
  "Fudco",
  "Top-Op",
  "Golden Temple",
  "Pillsbury",
  "Ashoka",
  "Surati",
  "Deep",
  "Swad",
  "Geeta's",
  "Sharwood's",
  "Blue Dragon",
  "Lee Kum Kee",
  "Kikkoman",
  "Grace",
  "Dunn's River",
  "Encona",
  "Levi Roots",
  "Pride",
  "Island Sun",
]);

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Automatically identifies and populates product brands using available Excel data.
 * Adheres strictly to the high-confidence rule:
 * - Direct brand cell value (when not a blank/placeholder)
 * - Known vendor brand dictionary matching
 * - Explicit delimiter prefix pattern (e.g. "Brand - Product Name")
 *
 * Never guesses or invents brands from arbitrary words.
 */
export function identifyProductBrand(
  rowBrand: string | undefined,
  productName: string,
  knownBrands: readonly string[] = [],
): BrandEnrichmentResult {
  // 1. Explicit brand column in the spreadsheet
  if (rowBrand && typeof rowBrand === "string") {
    const trimmed = rowBrand.trim();
    const lower = trimmed.toLowerCase();
    if (trimmed.length >= 2 && trimmed.length <= 80 && !PLACEHOLDER_BRANDS.has(lower)) {
      return {
        brandName: trimmed,
        source: "COLUMN",
        confidence: "HIGH",
      };
    }
  }

  if (!productName || typeof productName !== "string") {
    return { brandName: null, source: null, confidence: "LOW" };
  }

  const cleanName = productName.trim();

  // 2. Delimited prefix pattern: e.g. "TRS - Cumin Seeds 100g", "Shan | Biryani Masala", "Laila : Basmati Rice"
  const delimiterMatch = /^([A-Za-z0-9&'.\s]{2,30})\s*(?:[-|:])\s+(.+)$/.exec(cleanName);
  if (delimiterMatch) {
    const candidate = delimiterMatch[1].trim();
    const candidateLower = candidate.toLowerCase();
    const isNumericOnly = /^\d+$/.test(candidate);
    const isGeneric = GENERIC_CATEGORY_PREFIXES.has(candidateLower);

    if (
      candidate.length >= 2 &&
      !isNumericOnly &&
      !isGeneric &&
      !PLACEHOLDER_BRANDS.has(candidateLower)
    ) {
      return {
        brandName: candidate,
        source: "DELIMITED_PREFIX",
        confidence: "HIGH",
      };
    }
  }

  // 3. Known vendor brand matching (merging known vendor brands with curated common grocery brands)
  const combinedBrands = Array.from(new Set([...knownBrands, ...CURATED_COMMON_BRANDS]));
  if (combinedBrands.length > 0) {
    // Sort longest first so e.g. "Elephant Atta" matches before "Elephant"
    const sortedBrands = combinedBrands.sort((a, b) => b.length - a.length);

    for (const brand of sortedBrands) {
      if (!brand || brand.trim().length < 2) continue;
      const bTrimmed = brand.trim();
      const pattern = new RegExp(`^${escapeRegex(bTrimmed)}(?:\\b|\\s|[-|:])`, "i");
      if (pattern.test(cleanName)) {
        return {
          brandName: bTrimmed,
          source: "KNOWN_BRAND",
          confidence: "HIGH",
        };
      }
    }
  }

  // Default: never guess
  return {
    brandName: null,
    source: null,
    confidence: "LOW",
  };
}
