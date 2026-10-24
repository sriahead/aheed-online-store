import type { Icon3DDefinition, ResolvedPalette } from "./types";

function buildDefs(sid: string, p: ResolvedPalette): string {
  return `<defs>
    <linearGradient id="body-${sid}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${p.accentLight}" />
      <stop offset="52%" stop-color="${p.accent}" />
      <stop offset="100%" stop-color="${p.accentDark}" />
    </linearGradient>
    <linearGradient id="metal-${sid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#f8fafc" />
      <stop offset="50%" stop-color="#cbd5e1" />
      <stop offset="100%" stop-color="#64748b" />
    </linearGradient>
    <linearGradient id="glass-${sid}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#e0f2fe" />
      <stop offset="100%" stop-color="#7dd3fc" />
    </linearGradient>
    <linearGradient id="gold-${sid}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#fef08a" />
      <stop offset="45%" stop-color="#f59e0b" />
      <stop offset="100%" stop-color="#b45309" />
    </linearGradient>
    <linearGradient id="frost-${sid}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#bae6fd" />
      <stop offset="60%" stop-color="#38bdf8" />
      <stop offset="100%" stop-color="#0284c7" />
    </linearGradient>
    <linearGradient id="ruby-${sid}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#fca5a5" />
      <stop offset="50%" stop-color="#ef4444" />
      <stop offset="100%" stop-color="#991b1b" />
    </linearGradient>
    <filter id="soft-${sid}" x="-30%" y="-30%" width="160%" height="170%">
      <feDropShadow dx="0" dy="3" stdDeviation="2.5" flood-color="${p.shadow}" flood-opacity="0.28" />
    </filter>
  </defs>
  <ellipse cx="48" cy="83" rx="30" ry="5" fill="${p.shadow}" opacity="0.18" />`;
}

export const ICON_3D_DEFINITIONS: Record<string, Icon3DDefinition> = {
  "delivery-van": {
    id: "delivery-van",
    name: "3D Delivery Van",
    category: "commerce",
    purpose: "Local fast delivery across Milton Keynes and surrounding areas",
    recommendedAnim: "float",
    tags: ["delivery", "truck", "van", "shipping", "fulfilment", "local"],
    render: (p, sid) =>
      buildDefs(sid, p) +
      `<g filter="url(#soft-${sid})">
        <path d="M12 34q0-4 5-4h35q3 0 3 4v25H12Z" fill="url(#body-${sid})" stroke="${p.accentDark}" stroke-width="1.5"/>
        <path d="M55 40h13q3 0 5 4l7 9v6H55Z" fill="#f8fafc" stroke="${p.outline}" stroke-width="1.5"/>
        <path d="M59 43h8q2 0 3 3l4 5H59Z" fill="url(#glass-${sid})" stroke="#94a3b8"/>
        <path d="M18 36h28" stroke="#ffffff" stroke-width="2" stroke-linecap="round" opacity="0.8"/>
        <rect x="19" y="41" width="27" height="12" rx="2" fill="#ffffff"/>
        <path d="m25 47 4-4 4 4-4 4Z" fill="${p.accent}"/>
        <path d="M35 45h7M35 49h5" stroke="${p.accentDark}" stroke-width="1.5" stroke-linecap="round"/>
        <path d="M12 57h68v3q0 3-3 3H15q-3 0-3-3Z" fill="${p.accentDark}"/>
        <circle cx="28" cy="62" r="7" fill="#1e293b"/>
        <circle cx="28" cy="62" r="3.2" fill="url(#metal-${sid})"/>
        <circle cx="66" cy="62" r="7" fill="#1e293b"/>
        <circle cx="66" cy="62" r="3.2" fill="url(#metal-${sid})"/>
        <rect x="74" y="54" width="4" height="4" rx="1" fill="#fca5a5"/>
      </g>`,
  },

  "halal-certified": {
    id: "halal-certified",
    name: "HMC Halal Certified Badge",
    category: "trust",
    purpose: "Authentic 100% Certified HMC Halal verification medal",
    recommendedAnim: "pop",
    tags: ["halal", "hmc", "certified", "trust", "badge", "quality", "meat"],
    render: (p, sid) =>
      buildDefs(sid, p) +
      `<g filter="url(#soft-${sid})">
        <path d="m48 10 9 5 10 0 3 10 8 7-4 10 2 10-10 6-5 9-11-2-9 6-8-7-11-2-1-11-6-8 4-10-1-10 11-4 7-8Z" fill="url(#body-${sid})" stroke="${p.accentDark}" stroke-width="1.8"/>
        <path d="m48 18 7 4 8 0 2 8 6 5-3 8 2 7-8 5-4 7-8-2-7 5-6-6-8-1-1-8-5-7 3-7-1-7 9-3 5-8Z" fill="#ffffff" opacity="0.95"/>
        <circle cx="48" cy="46" r="21" fill="url(#gold-${sid})" stroke="#d97706" stroke-width="1.5" />
        <circle cx="48" cy="46" r="17" fill="#ffffff" />
        <path d="m39 46 6 6 13-14" fill="none" stroke="${p.accent}" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M37 60q11 4 22-1" fill="none" stroke="${p.accentLight}" stroke-width="2" stroke-linecap="round"/>
      </g>`,
  },

  "postcode-search": {
    id: "postcode-search",
    name: "3D Postcode Checker",
    category: "navigation",
    purpose: "Visual cue for postcode lookup, delivery radius, and store locator",
    recommendedAnim: "float",
    tags: ["postcode", "location", "pin", "map", "checker", "radius", "search"],
    render: (p, sid) =>
      buildDefs(sid, p) +
      `<g filter="url(#soft-${sid})">
        <path d="M48 13C34 13 24 23 24 36c0 16 24 34 24 34s24-18 24-34C72 23 62 13 48 13Z" fill="url(#body-${sid})" stroke="${p.accentDark}" stroke-width="1.5"/>
        <circle cx="48" cy="35" r="14" fill="#ffffff"/>
        <path d="M39 29h18M39 35h12M39 41h15" stroke="${p.accent}" stroke-width="2.5" stroke-linecap="round"/>
        <circle cx="64" cy="58" r="11" fill="url(#metal-${sid})" stroke="${p.outline}" stroke-width="2"/>
        <circle cx="64" cy="58" r="6.5" fill="url(#glass-${sid})"/>
        <path d="m72 66 7 7" stroke="${p.outline}" stroke-width="4" stroke-linecap="round"/>
      </g>`,
  },

  "cart-add": {
    id: "cart-add",
    name: "3D Supermarket Trolley",
    category: "commerce",
    purpose: "Supermarket trolley with 3D basket depth and add action highlight",
    recommendedAnim: "pop",
    tags: ["cart", "trolley", "basket", "shop", "checkout", "add-to-cart"],
    render: (p, sid) =>
      buildDefs(sid, p) +
      `<g filter="url(#soft-${sid})">
        <path d="M16 23h8l7 34h34l8-25H29" fill="none" stroke="${p.outline}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M30 35h37l-5 17H34Z" fill="url(#body-${sid})" stroke="${p.accentDark}" stroke-width="1.5"/>
        <path d="M35 38h26" stroke="#ffffff" stroke-width="2" stroke-linecap="round" opacity="0.8"/>
        <circle cx="38" cy="65" r="5.5" fill="#1e293b"/>
        <circle cx="38" cy="65" r="2.5" fill="url(#metal-${sid})"/>
        <circle cx="62" cy="65" r="5.5" fill="#1e293b"/>
        <circle cx="62" cy="65" r="2.5" fill="url(#metal-${sid})"/>
        <circle cx="67" cy="22" r="13" fill="url(#gold-${sid})" stroke="#d97706" stroke-width="1.5"/>
        <path d="M67 15v14M60 22h14" stroke="#ffffff" stroke-width="3" stroke-linecap="round"/>
      </g>`,
  },

  "secure-checkout": {
    id: "secure-checkout",
    name: "3D Secure Checkout Shield",
    category: "trust",
    purpose: "Stripe-backed encrypted payment and consumer trust badge",
    recommendedAnim: "float",
    tags: ["security", "shield", "checkout", "stripe", "payment", "lock", "cards"],
    render: (p, sid) =>
      buildDefs(sid, p) +
      `<g filter="url(#soft-${sid})">
        <path d="m48 12 24 9v18c0 16-11 25-24 32-13-7-24-16-24-32V21Z" fill="url(#body-${sid})" stroke="${p.accentDark}" stroke-width="1.5"/>
        <path d="m48 19 17 6v14c0 11-7 18-17 24-10-6-17-13-17-24V25Z" fill="#ffffff" opacity="0.9"/>
        <rect x="37" y="36" width="22" height="17" rx="3" fill="url(#metal-${sid})" stroke="${p.outline}" stroke-width="1.5"/>
        <path d="M41 36v-5a7 7 0 0 1 14 0v5" fill="none" stroke="${p.outline}" stroke-width="3" stroke-linecap="round"/>
        <circle cx="48" cy="43" r="2" fill="${p.accent}"/>
        <path d="M48 45v3" stroke="${p.accent}" stroke-width="2" stroke-linecap="round"/>
      </g>`,
  },

  "order-updates": {
    id: "order-updates",
    name: "3D Notification Bell",
    category: "trust",
    purpose: "Order progress, email notification, and dispatch tracking alert",
    recommendedAnim: "pop",
    tags: ["updates", "bell", "notifications", "alerts", "email", "tracking"],
    render: (p, sid) =>
      buildDefs(sid, p) +
      `<g filter="url(#soft-${sid})">
        <path d="M48 16a6 6 0 0 0-6 6v2a18 18 0 0 0-14 17c0 8-3 12-3 12h46s-3-4-3-12a18 18 0 0 0-14-17v-2a6 6 0 0 0-6-6Z" fill="url(#gold-${sid})" stroke="#b45309" stroke-width="1.5" />
        <path d="M43 57a5 5 0 0 0 10 0" fill="none" stroke="#b45309" stroke-width="2.5" stroke-linecap="round"/>
        <circle cx="68" cy="24" r="8" fill="url(#ruby-${sid})" stroke="#ffffff" stroke-width="1.5"/>
        <path d="M68 20v8M64 24h8" stroke="#ffffff" stroke-width="2" stroke-linecap="round"/>
      </g>`,
  },

  "fruit-veg": {
    id: "fruit-veg",
    name: "3D Crisp Farm Produce",
    category: "departments",
    purpose: "Fresh fruit and vegetables department illustration",
    recommendedAnim: "float",
    tags: ["fruit", "vegetables", "produce", "apple", "fresh", "farm"],
    render: (p, sid) =>
      buildDefs(sid, p) +
      `<g filter="url(#soft-${sid})">
        <path d="M48 20c-8-8-22-3-22 14 0 20 18 34 22 36 4-2 22-16 22-36 0-17-14-22-22-14Z" fill="url(#ruby-${sid})" stroke="#991b1b" stroke-width="1.5"/>
        <path d="M48 19c0-6 4-11 8-12" fill="none" stroke="#78350f" stroke-width="3" stroke-linecap="round"/>
        <path d="M54 10c4-1 9 1 10 5-3 3-8 2-10-5Z" fill="url(#body-${sid})" stroke="${p.accentDark}" stroke-width="1"/>
        <path d="M35 30q-4 8 2 16" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" opacity="0.6"/>
      </g>`,
  },

  "halal-meat": {
    id: "halal-meat",
    name: "3D Prime Halal Cut",
    category: "departments",
    purpose: "Fresh butcher & halal meat department illustration",
    recommendedAnim: "pop",
    tags: ["meat", "halal", "butcher", "beef", "chicken", "lamb", "cut"],
    render: (p, sid) =>
      buildDefs(sid, p) +
      `<g filter="url(#soft-${sid})">
        <ellipse cx="48" cy="48" rx="28" ry="18" fill="url(#ruby-${sid})" stroke="#991b1b" stroke-width="1.8" transform="rotate(-15 48 48)"/>
        <path d="M32 46q16-8 32-2" fill="none" stroke="#ffffff" stroke-width="3.5" stroke-linecap="round" opacity="0.8"/>
        <circle cx="34" cy="45" r="6" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.5"/>
        <circle cx="34" cy="45" r="2.5" fill="#e2e8f0"/>
      </g>`,
  },

  bakery: {
    id: "bakery",
    name: "3D Golden Croissant",
    category: "departments",
    purpose: "Artisan bread and bakery department illustration",
    recommendedAnim: "float",
    tags: ["bakery", "bread", "croissant", "pastry", "breakfast"],
    render: (p, sid) =>
      buildDefs(sid, p) +
      `<g filter="url(#soft-${sid})">
        <path d="M22 56c4-16 16-26 26-26s22 10 26 26c-8-4-16-6-26-6s-18 2-26 6Z" fill="url(#gold-${sid})" stroke="#b45309" stroke-width="1.5"/>
        <path d="M30 46c6-10 12-12 18-12s12 2 18 12" fill="none" stroke="#78350f" stroke-width="2" stroke-linecap="round"/>
        <path d="M38 38c3-4 7-6 10-6s7 2 10 6" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" opacity="0.6"/>
      </g>`,
  },

  "dairy-eggs": {
    id: "dairy-eggs",
    name: "3D Dairy Milk & Egg",
    category: "departments",
    purpose: "Dairy, milk, cheese, and farm eggs department illustration",
    recommendedAnim: "float",
    tags: ["dairy", "milk", "eggs", "cheese", "farm", "butter"],
    render: (p, sid) =>
      buildDefs(sid, p) +
      `<g filter="url(#soft-${sid})">
        <rect x="24" y="24" width="22" height="38" rx="4" fill="url(#glass-${sid})" stroke="#0284c7" stroke-width="1.5"/>
        <rect x="27" y="19" width="16" height="6" rx="2" fill="#0284c7"/>
        <path d="M25 40h20v20H25Z" fill="#ffffff" opacity="0.95"/>
        <ellipse cx="60" cy="50" rx="14" ry="17" fill="url(#gold-${sid})" stroke="#b45309" stroke-width="1.5" transform="rotate(10 60 50)"/>
        <circle cx="58" cy="48" r="7" fill="#ffffff" opacity="0.3"/>
      </g>`,
  },

  beverages: {
    id: "beverages",
    name: "3D Hot & Cold Beverages",
    category: "departments",
    purpose: "Tea, coffee, sodas, juices and refreshments illustration",
    recommendedAnim: "float",
    tags: ["beverages", "drinks", "tea", "coffee", "juice", "soda"],
    render: (p, sid) =>
      buildDefs(sid, p) +
      `<g filter="url(#soft-${sid})">
        <path d="M26 32h34v22a14 14 0 0 1-14 14H40a14 14 0 0 1-14-14V32Z" fill="url(#body-${sid})" stroke="${p.accentDark}" stroke-width="1.8"/>
        <path d="M60 38h7a7 7 0 0 1 7 7v2a7 7 0 0 1-7 7h-7" fill="none" stroke="${p.outline}" stroke-width="3" stroke-linecap="round"/>
        <path d="M34 24q3-6 0-11M43 24q3-6 0-11M52 24q3-6 0-11" fill="none" stroke="#94a3b8" stroke-width="2" stroke-linecap="round" opacity="0.7"/>
      </g>`,
  },

  snacks: {
    id: "snacks",
    name: "3D Choc-Chip Cookie",
    category: "departments",
    purpose: "Snacks, biscuits, crisps and sweet treats illustration",
    recommendedAnim: "pop",
    tags: ["snacks", "biscuits", "cookie", "crisps", "chocolate", "sweets"],
    render: (p, sid) =>
      buildDefs(sid, p) +
      `<g filter="url(#soft-${sid})">
        <circle cx="48" cy="48" r="24" fill="url(#gold-${sid})" stroke="#b45309" stroke-width="1.8"/>
        <circle cx="40" cy="40" r="3.5" fill="#451a03"/>
        <circle cx="56" cy="38" r="3" fill="#451a03"/>
        <circle cx="48" cy="54" r="4" fill="#451a03"/>
        <circle cx="36" cy="52" r="2.8" fill="#451a03"/>
        <circle cx="58" cy="54" r="3.2" fill="#451a03"/>
      </g>`,
  },

  "frozen-foods": {
    id: "frozen-foods",
    name: "3D Frost Snowflake",
    category: "departments",
    purpose: "Frozen goods, ice creams, ready meals illustration",
    recommendedAnim: "float",
    tags: ["frozen", "ice", "snowflake", "freezer", "meals"],
    render: (p, sid) =>
      buildDefs(sid, p) +
      `<g filter="url(#soft-${sid})">
        <circle cx="48" cy="48" r="24" fill="url(#frost-${sid})" stroke="#0284c7" stroke-width="1.5"/>
        <path d="M48 28v40M28 48h40M34 34l28 28M34 62l28-28" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round"/>
        <circle cx="48" cy="48" r="5" fill="#ffffff"/>
      </g>`,
  },

  household: {
    id: "household",
    name: "3D Soap Pump Dispenser",
    category: "departments",
    purpose: "Household, cleaning and personal hygiene illustration",
    recommendedAnim: "float",
    tags: ["household", "cleaning", "soap", "detergent", "home"],
    render: (p, sid) =>
      buildDefs(sid, p) +
      `<g filter="url(#soft-${sid})">
        <rect x="34" y="32" width="28" height="34" rx="6" fill="url(#body-${sid})" stroke="${p.accentDark}" stroke-width="1.8"/>
        <rect x="44" y="24" width="8" height="8" fill="url(#metal-${sid})" stroke="${p.outline}" stroke-width="1.5"/>
        <path d="M44 24h18v-4H48q-4 0-4 4Z" fill="url(#metal-${sid})" stroke="${p.outline}" stroke-width="1.5"/>
        <path d="M42 42h12" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" opacity="0.8"/>
      </g>`,
  },

  "rewards-coin": {
    id: "rewards-coin",
    name: "3D Gold Loyalty Coin",
    category: "rewards",
    purpose: "Customer reward points and loyalty tokens",
    recommendedAnim: "pop",
    tags: ["rewards", "points", "coin", "gold", "loyalty", "money"],
    render: (p, sid) =>
      buildDefs(sid, p) +
      `<g filter="url(#soft-${sid})">
        <circle cx="48" cy="48" r="26" fill="url(#gold-${sid})" stroke="#b45309" stroke-width="2"/>
        <circle cx="48" cy="48" r="21" fill="none" stroke="#fef08a" stroke-width="1.5" stroke-dasharray="3 3"/>
        <path d="m48 34 3.5 7 7.5 1-5.5 5.5 1.5 7.5-7-3.5-7 3.5 1.5-7.5-5.5-5.5 7.5-1Z" fill="#ffffff" stroke="#b45309" stroke-width="1"/>
      </g>`,
  },

  "rewards-gift": {
    id: "rewards-gift",
    name: "3D Wrapped Gift Box",
    category: "rewards",
    purpose: "Promotional gift box with celebratory ribbon",
    recommendedAnim: "pop",
    tags: ["gift", "present", "box", "reward", "promo", "discount"],
    render: (p, sid) =>
      buildDefs(sid, p) +
      `<g filter="url(#soft-${sid})">
        <rect x="22" y="36" width="52" height="34" rx="4" fill="url(#body-${sid})" stroke="${p.accentDark}" stroke-width="1.5"/>
        <rect x="18" y="28" width="60" height="10" rx="3" fill="url(#gold-${sid})" stroke="#b45309" stroke-width="1.5"/>
        <path d="M44 28v42h8V28Z" fill="url(#gold-${sid})" stroke="#b45309" stroke-width="1"/>
        <path d="M48 28c-6-8-14-6-12 0 4 6 12 0 12 0Zm0 0c6-8 14-6 12 0-4 6-12 0-12 0Z" fill="url(#gold-${sid})" stroke="#b45309" stroke-width="1.5"/>
      </g>`,
  },

  storefront: {
    id: "storefront",
    name: "3D Supermarket Storefront",
    category: "navigation",
    purpose: "Storefront and departments catalog navigation entry",
    recommendedAnim: "float",
    tags: ["shop", "store", "storefront", "market", "groceries", "aisles"],
    render: (p, sid) =>
      buildDefs(sid, p) +
      `<g filter="url(#soft-${sid})">
        <rect x="18" y="32" width="60" height="46" rx="4" fill="url(#metal-${sid})" stroke="${p.outline}" stroke-width="1.5"/>
        <rect x="22" y="36" width="52" height="40" rx="3" fill="#ffffff"/>
        <path d="M14 32 L82 32 L78 46 L18 46 Z" fill="url(#body-${sid})" stroke="${p.accentDark}" stroke-width="1.5"/>
        <path d="M22 32 L30 32 L28 46 L20 46 Z M38 32 L46 32 L44 46 L36 46 Z M54 32 L62 32 L60 46 L52 46 Z M70 32 L78 32 L76 46 L68 46 Z" fill="#ffffff" opacity="0.9"/>
        <path d="M18 46 q4 5 8 0 q4 5 8 0 q4 5 8 0 q4 5 8 0 q4 5 8 0 q4 5 8 0 q4 5 8 0" fill="url(#body-${sid})" stroke="${p.accentDark}" stroke-width="1"/>
        <rect x="30" y="20" width="36" height="12" rx="2" fill="url(#gold-${sid})" stroke="#b45309" stroke-width="1.2"/>
        <rect x="34" y="24" width="28" height="4" rx="1" fill="#ffffff"/>
        <rect x="34" y="48" width="28" height="28" rx="2" fill="url(#glass-${sid})" stroke="#64748b" stroke-width="1.5"/>
        <line x1="48" y1="48" x2="48" y2="76" stroke="#64748b" stroke-width="1.5"/>
        <circle cx="45" cy="62" r="1.8" fill="url(#gold-${sid})"/>
        <circle cx="51" cy="62" r="1.8" fill="url(#gold-${sid})"/>
        <path d="M37 52 L45 52 L39 68 L35 68 Z" fill="#ffffff" opacity="0.45"/>
      </g>`,
  },

  "quick-shop": {
    id: "quick-shop",
    name: "3D Quick Shop Bag",
    category: "commerce",
    purpose: "Quick shopping list hub and rapid multi-item ordering",
    recommendedAnim: "pop",
    tags: ["quick-shop", "bag", "list", "smart-lists", "shopping", "lightning"],
    render: (p, sid) =>
      buildDefs(sid, p) +
      `<g filter="url(#soft-${sid})">
        <path d="M36 34 C36 17 60 17 60 34" fill="none" stroke="url(#metal-${sid})" stroke-width="4.5" stroke-linecap="round"/>
        <path d="M36 34 C36 19 60 19 60 34" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" opacity="0.8"/>
        <path d="M25 34 L71 34 L67 76 L29 76 Z" fill="url(#body-${sid})" stroke="${p.accentDark}" stroke-width="1.8"/>
        <path d="M29 34 L67 34" stroke="#ffffff" stroke-width="2" stroke-linecap="round" opacity="0.6"/>
        <rect x="36" y="44" width="24" height="26" rx="3" fill="#ffffff" stroke="${p.outline}" stroke-width="1.2"/>
        <rect x="42" y="40" width="12" height="5" rx="1.5" fill="url(#metal-${sid})" stroke="${p.outline}" stroke-width="1"/>
        <line x1="40" y1="50" x2="56" y2="50" stroke="${p.accent}" stroke-width="2" stroke-linecap="round"/>
        <line x1="40" y1="56" x2="54" y2="56" stroke="${p.accent}" stroke-width="2" stroke-linecap="round"/>
        <line x1="40" y1="62" x2="50" y2="62" stroke="${p.accent}" stroke-width="2" stroke-linecap="round"/>
        <path d="m24 44 2.5-5 2.5 5 5 2.5-5 2.5-2.5 5-2.5-5-5-2.5Z" fill="url(#gold-${sid})" stroke="#b45309" stroke-width="0.8"/>
        <path d="m70 54 2-3.5 2 3.5 3.5 2-3.5 2-2 3.5-2-3.5-3.5-2Z" fill="url(#gold-${sid})" stroke="#b45309" stroke-width="0.8"/>
      </g>`,
  },

  "contact-follow": {
    id: "contact-follow",
    name: "Contact & Follow Hub",
    category: "general",
    purpose: "Contact cluster, social channels, and customer support launcher",
    recommendedAnim: "pop",
    tags: ["contact", "follow", "chat", "support", "community", "social"],
    render: (p, sid) =>
      buildDefs(sid, p) +
      `<g filter="url(#soft-${sid})">
        <circle cx="58" cy="38" r="20" fill="url(#gold-${sid})" stroke="#b45309" stroke-width="1.5"/>
        <path d="M68 50 L75 58 L62 54 Z" fill="url(#gold-${sid})" stroke="#b45309" stroke-width="1.2"/>
        <circle cx="58" cy="38" r="14" fill="#ffffff" opacity="0.35"/>
        <circle cx="52" cy="38" r="2.2" fill="#78350f"/>
        <circle cx="58" cy="38" r="2.2" fill="#78350f"/>
        <circle cx="64" cy="38" r="2.2" fill="#78350f"/>
        <circle cx="40" cy="52" r="24" fill="url(#body-${sid})" stroke="${p.accentDark}" stroke-width="1.8"/>
        <path d="M26 68 L18 78 L34 72 Z" fill="url(#body-${sid})" stroke="${p.accentDark}" stroke-width="1.5"/>
        <circle cx="40" cy="44" r="7" fill="#ffffff"/>
        <path d="M27 64 c0-7 6-11 13-11 s13 4 13 11 Z" fill="#ffffff"/>
      </g>`,
  },

  "user-profile": {
    id: "user-profile",
    name: "3D User Profile",
    category: "general",
    purpose: "Customer account, profile settings, and membership avatar",
    recommendedAnim: "pop",
    tags: ["user", "profile", "account", "avatar", "person", "member"],
    render: (p, sid) =>
      buildDefs(sid, p) +
      `<g filter="url(#soft-${sid})">
        <circle cx="48" cy="48" r="34" fill="url(#body-${sid})" stroke="${p.accentDark}" stroke-width="2"/>
        <circle cx="48" cy="48" r="30" fill="none" stroke="#ffffff" stroke-width="1.5" opacity="0.4"/>
        <circle cx="48" cy="38" r="13" fill="#ffffff" stroke="${p.accentDark}" stroke-width="1.2"/>
        <circle cx="45" cy="34" r="3.5" fill="#ffffff" opacity="0.6"/>
        <path d="M25 72 C25 56 35 52 48 52 C61 52 71 56 71 72 Z" fill="#ffffff" stroke="${p.accentDark}" stroke-width="1.2"/>
        <circle cx="68" cy="28" r="7" fill="url(#gold-${sid})" stroke="#b45309" stroke-width="1"/>
        <path d="m68 23 1 2.5 2.5 1-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1Z" fill="#ffffff"/>
      </g>`,
  },
};
