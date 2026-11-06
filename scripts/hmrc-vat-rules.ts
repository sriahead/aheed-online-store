/**
 * UK HMRC VAT Rules Engine (Value Added Tax Act 1994, Schedule 8, Group 1 - Food)
 * Conforming strictly with HMRC VAT Notice 701/14 (Food) & Notice 700.
 */

export interface VatRuleResult {
  rate: 0 | 20;
  category: "ZERO_RATED" | "STANDARD_RATED";
  rule: string;
  code: "FOOD_ZERO" | "SOFT_DRINK_20" | "ALCOHOL_20" | "ICE_CREAM_20" | "CONFECTIONERY_20" | "POTATO_CRISPS_ROASTED_NUTS_20" | "TOBACCO_20" | "NON_FOOD_20" | "EXEMPT_STAMPS_0";
}

export function evaluateHmrCvat(
  deptRaw: string,
  subDeptRaw: string,
  nameRaw: string
): VatRuleResult {
  const dept = deptRaw.trim().toUpperCase();
  const subDept = subDeptRaw.trim().toUpperCase();
  const name = nameRaw.trim().toUpperCase();

  const matches = (regex: RegExp) => regex.test(name);

  // --------------------------------------------------------------------------
  // RULE 1: POSTAL STAMPS (HMRC: Exempt from VAT)
  // --------------------------------------------------------------------------
  if (dept === "STAMPS" || matches(/\b(STAMP|STAMPS)\b/)) {
    return {
      rate: 0,
      category: "ZERO_RATED",
      rule: "HMRC Notice 701/8: Royal Mail postal stamps are exempt from VAT (0%)",
      code: "EXEMPT_STAMPS_0",
    };
  }

  // --------------------------------------------------------------------------
  // RULE 2: ALCOHOLIC BEVERAGES (Notice 700: Always 20%)
  // --------------------------------------------------------------------------
  if (
    dept === "ALCOHOL" ||
    matches(/\b(BEER|LAGER|ALE|STOUT|WINE|VODKA|WHISKY|WHISKEY|RUM|GIN|BRANDY|CIDER|STELLA|HEINEKEN|CORONA|CARLSBERG|CARLING|FOSTERS|BUDWEISER|PERONI|GUINNESS)\b/)
  ) {
    return {
      rate: 20,
      category: "STANDARD_RATED",
      rule: "HMRC Notice 700: Alcoholic beverages are standard-rated (20%)",
      code: "ALCOHOL_20",
    };
  }

  // --------------------------------------------------------------------------
  // RULE 3: TOBACCO, SHISHA & SMOKING (Always 20%)
  // --------------------------------------------------------------------------
  if (
    dept === "TOBACCO" ||
    subDept.includes("CIGARETTE") ||
    subDept.includes("ROLLING") ||
    matches(/\b(SHISHA|SHEESHA|TOBACCO|CIGARETTE|CIGAR|LIGHTER|ROLLING PAPER|RIZLA|AL FAKHER|SHEESHA COAL|SHISHA COAL|HOOKAH)\b/)
  ) {
    return {
      rate: 20,
      category: "STANDARD_RATED",
      rule: "HMRC: Tobacco, shisha, and smoking requisites are standard-rated (20%)",
      code: "TOBACCO_20",
    };
  }

  // --------------------------------------------------------------------------
  // RULE 4: SPECIFIC FOOD RESCUES FROM MISCLASSIFIED DEPARTMENTS
  // If an ambient food staple was accidentally filed in Non-Food / H&B / Stationary,
  // HMRC taxes the ACTUAL GOODS, not the spreadsheet department name.
  // --------------------------------------------------------------------------
  const isDefinitiveFood = matches(
    /\b(FLOUR|ATTA|AASHIRVAAD|RICE|SALT|SUGAR|BEANS|LENTIL|LENTILS|DAL|DALL|JAGGERY|GINGER|GARLIC|SPICE|SPICES|CHICKPEAS|CHICK PEAS|CASSAVA|DOUGH|ZOMI|PLANTAIN|YAM|CHIN CHIN|MURUKKU|SEV|MIXTURE|CRACKER|CRACKERS|CREAM CRACKER|BISCUIT|BISCUITS|NOODLES|PASTA|OIL|GHEE|SEEDS|MILK|EGGS|MEAT|FISH|CHICKEN|TURKEY|BREAD|ROTI|NAAN|PARATHA)\b/
  );

  // --------------------------------------------------------------------------
  // RULE 5: TELECOM, E-PAY & ELECTRONICS (Always 20%)
  // --------------------------------------------------------------------------
  if (
    dept === "E-PAY" ||
    dept === "PHONE CARDS" ||
    dept === "CD/TAPES/VIDEO" ||
    matches(/\b(IPHONE|CABLE|CHARGER|ADAPTOR|HEADPHONE|EARPHONE|SIM|LYCA|LEBARA|VODAFONE|EE|O2|THREE|TOPUP|PHONE CARD)\b/)
  ) {
    if (!isDefinitiveFood) {
      return {
        rate: 20,
        category: "STANDARD_RATED",
        rule: "HMRC: Telecommunications and electronic accessories are standard-rated (20%)",
        code: "NON_FOOD_20",
      };
    }
  }

  // --------------------------------------------------------------------------
  // RULE 6: HOUSEHOLD, CLEANING, HARDWARE, TOILETRIES (Always 20%)
  // --------------------------------------------------------------------------
  if (
    dept === "HOUSEHOLD SUNDRIES" ||
    dept === "NON FOOD" ||
    dept === "STATIONARY" ||
    dept === "HEALTH & BEAUTY" ||
    matches(/\b(BATTERY|DURACELL|PANASONIC|FOIL|BLEACH|DETTOL|FAIRY|SURF|PERSIL|ARIEL|TISSUE|ANDREX|TOILET|NAPKIN|BIN LINER|AIR FRESHNER|ROOM SPRAY|GLUE|SELLOTAPE|CLEANER|SOAP|SHAMPOO|CONDITIONER|TOOTHPASTE|TOOTHBRUSH|COLGATE|DEODORANT|DEODERANT|LYNX|VASELINE|COTTON BUD|PERFUME|COLOGNE|BODY WASH|SHOWER GEL)\b/)
  ) {
    if (!isDefinitiveFood) {
      return {
        rate: 20,
        category: "STANDARD_RATED",
        rule: "HMRC: Non-food household items, toiletries, and cleaning supplies are standard-rated (20%)",
        code: "NON_FOOD_20",
      };
    }
  }

  // --------------------------------------------------------------------------
  // RULE 7: EXCEPTED ITEM 1 - ICE CREAM & FROZEN CONFECTIONS (20%)
  // --------------------------------------------------------------------------
  const isIceCreamProduct = matches(/\b(ICE CREAM|ICE CGEEM|KULFI|ICE LOLLY|GELATO|SORBET|POPSICLE|CHOC ICE|MAGNUM|CORNETTO)\b/);
  const isDryMixOrCooking = matches(/\b(FALOODA MIX|PUDDING MIX|JELLY CRYSTALS|CUSTARD POWDER|ROSE WATER|KEWRA WATER)\b/);

  if (isIceCreamProduct && !isDryMixOrCooking) {
    return {
      rate: 20,
      category: "STANDARD_RATED",
      rule: "HMRC Notice 701/14 Section 3.5 (Excepted Item 1): Ice cream, ice lollies, and frozen confections are standard-rated (20%)",
      code: "ICE_CREAM_20",
    };
  }

  // --------------------------------------------------------------------------
  // RULE 8: EXCEPTED ITEM 3 - SOFT DRINKS & BEVERAGES (20%)
  // Zero-rated: unflavoured milk, infant formula, tea, coffee
  // --------------------------------------------------------------------------
  const isZeroRatedBeverage = matches(
    /\b(NURISHMENT|FRESH MILK|UHT MILK|CONDENSED MILK|EVAPORATED MILK|COCONUT MILK|SOYA MILK|ALMOND MILK|OAT MILK|TEA|TEABAGS|COFFEE|COFFEE GRANULES|CHAI|APTAMIL|COW & GATE|SMA)\b/
  );

  if (!isZeroRatedBeverage) {
    if (
      dept === "SOFT DRINKS" ||
      matches(/\b(COKE|COCA COLA|PEPSI|7UP|7 UP|FANTA|SPRITE|MIRINDA|TANGO|LUCOZADE|RED BULL|MONSTER|ENERGY DRINK|GINGER BEER|SODA|LEMONADE|JUICE|NECTAR|CORDIAL|SQUASH|RIBENA|RUBICON|MAAZA|WATER|MINERAL WATER|SPARKLING WATER|STILL WATER|EVIAN|VOLVIC|ALOE VERA|VIMTO|ROSE SYRUP|SHANI)\b/)
    ) {
      if (!isDefinitiveFood) {
        return {
          rate: 20,
          category: "STANDARD_RATED",
          rule: "HMRC Notice 701/14 Section 3.7.2 (Excepted Item 3): Soft drinks, fruit juices, carbonated drinks, and bottled waters are standard-rated (20%)",
          code: "SOFT_DRINK_20",
        };
      }
    }
  }

  // --------------------------------------------------------------------------
  // RULE 9: EXCEPTED ITEM 2 - CONFECTIONERY & SWEETS (20%)
  // Zero-rated: Traditional South Asian mithai/halwa, all cakes, plain biscuits
  // --------------------------------------------------------------------------
  const isZeroRatedMithaiCakeOrBiscuit = matches(
    /\b(SOAN PAPDI|SOANPAPDI|SOAN CAKE|BAKLAWA|BAKLAVA|HALWA|BARFI|BURFI|GULAB JAMUN|RASGULLA|RASGULA|LADDU|LADOO|MITHAI|RUSK|CAKE RUSK|MADEIRA|SPONGE|MUFFIN|ROLL|BREAD|BUN|ROTI|NAAN|PARATHA|DIGESTIVE|RICH TEA|CREAM CRACKER|CRACKER)\b/
  );

  if (!isZeroRatedMithaiCakeOrBiscuit) {
    if (
      dept === "CONFECTIONERY" ||
      matches(/\b(CHOCOLATE|CHOC|CADBURY|GALAXY|MARS|SNICKERS|SNKRS|BOUNTY|KIT KAT|M&M|TWIX|HARIBO|GUMMY|GUMMIES|GUM|BUBBLE GUM|CHEWING GUM|LOLLIPOP|LOLLY|MINTS|POLO|TOFFEE|FUDGE|CANDY|SWEETS|MARSHMALLOW)\b/)
    ) {
      if (!isDefinitiveFood) {
        return {
          rate: 20,
          category: "STANDARD_RATED",
          rule: "HMRC Notice 701/14 Section 3.6 (Excepted Item 2): Confectionery, chocolates, sweets, and chewing gums are standard-rated (20%)",
          code: "CONFECTIONERY_20",
        };
      }
    }
  }

  // --------------------------------------------------------------------------
  // RULE 10: EXCEPTED ITEM 4 - POTATO CRISPS & SALTED/ROASTED NUTS (20%)
  // Zero-rated: Cassava/plantain chips, namkeen, sev, murukku, plain raw/cooking nuts
  // --------------------------------------------------------------------------
  const isZeroRatedSnack = matches(
    /\b(CASSAVA|PLANTAIN|YAM|CHIN CHIN|MURUKKU|SEV|MIXTURE|BHUJIA|BOONDI|CHANA DAL|ROASTED CHICKPEAS|GRAM|RAW ALMOND|WALNUT|CASHEW RAW|COOKING NUTS|CREAM CRACKER|CRACKERS|WATER BISCUITS)\b/
  );

  if (!isZeroRatedSnack) {
    if (
      matches(/\b(POTATO|CRISP|CRISPS|PRINGLES|WALKERS|DORITOS|TORTILLA|PUFFS|ROASTED & SALTED|ROASTED SALTED|SALTED CASHEW|SALTED PISTACHIO|SALTED PEANUT|ROASTED PEANUT|ROASTED CASHEW|DRY ROASTED|POPCORN)\b/)
    ) {
      return {
        rate: 20,
        category: "STANDARD_RATED",
        rule: "HMRC Notice 701/14 Section 3.4 (Excepted Item 4): Potato crisps, potato-based snacks, and salted/roasted nuts are standard-rated (20%)",
        code: "POTATO_CRISPS_ROASTED_NUTS_20",
      };
    }
  }

  // --------------------------------------------------------------------------
  // RULE 11: ALL OTHER HUMAN FOOD (ZERO-RATED 0%)
  // Meat, poultry, fish, fruit, veg, dairy, grains, flours, bread, cakes, cooking staples
  // --------------------------------------------------------------------------
  return {
    rate: 0,
    category: "ZERO_RATED",
    rule: "HMRC Notice 701/14 Section 2 (Group 1 Food): Human food for domestic consumption is zero-rated (0%)",
    code: "FOOD_ZERO",
  };
}
