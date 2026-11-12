# Every live promotion on the landing page; plainer staff search placeholder (requirements)

R1. `getLivePromotionsForStorefront` defaults its limit to `HERO_PROMOTION_LIMIT`, which is at least 10.
    The landing page calls it without its own limit.
R2. With 7 live promotions, the landing page hero renders 7 slides, in priority order.
R3. The `/staff/products` search input's placeholder is "Search your favourite products…". The search
    still matches name, PLU and barcode.
