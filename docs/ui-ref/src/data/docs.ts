import { DocArticle } from '../types';

export const DOC_ARTICLES: DocArticle[] = [
  // CUSTOMER HELP GUIDE (PUBLIC)
  {
    id: 'doc-cust-1',
    title: 'Browsing, Searching & Filtering Catalogue',
    slug: 'browsing-catalogue',
    audience: 'customer',
    visibility: 'public',
    category: 'Storefront Basics',
    summary: 'How to easily find cultural ingredients, fresh produce, and HMC Halal meat.',
    lastUpdated: '2026-08-01',
    content: `
# Browsing, Searching & Filtering Catalogue

Welcome to **Aheed Food Centre Online Store**! Our online storefront is designed to make shopping for authentic cultural groceries effortless.

### Searching
- Use the search bar at the top of the screen to quickly search by product name, ingredient, or origin (e.g. "Basmati", "Chicken", "Lentils", "India").

### Filtering by Category
- Click any category chip at the top of the storefront:
  - **Fresh Produce**: Daily fruit, vegetables & herbs.
  - **Meat & Poultry**: 100% Certified HMC Halal Fresh Meat.
  - **Groceries & Rice**: Rice, oil, lentils, spices.
  - **International Staples**: Asian, Afro-Caribbean & Middle Eastern specialty brands.
- Use the quick filter badges for **HMC Halal**, **Offers**, and **Fresh Daily** items.
    `,
  },
  {
    id: 'doc-cust-2',
    title: 'Placing an Order: Guest vs. Account',
    slug: 'guest-vs-account-checkout',
    audience: 'customer',
    visibility: 'public',
    category: 'Checkout & Orders',
    summary: 'Aheed welcomes guest checkouts without forced registration or dark patterns.',
    lastUpdated: '2026-08-01',
    content: `
# Guest Checkout vs. Creating an Account

At Aheed Food Centre, **guests are first-class customers**. You can browse, add items to your cart, and complete your purchase without creating an account.

### Guest Path
- **No registration forced**: Your cart and progress remain saved during your browser session.
- **Fast checkout**: Provide your delivery address and pay securely via Stripe.
- **Order Confirmation**: You receive an on-screen reference and email confirmation.
- **Optional Account Creation**: At confirmation, you can optionally create an account with a single password to save your details for next time and start earning Aheed Loyalty Points.

### Account Path (Progressive Enhancement)
- Save multiple Leicester delivery addresses.
- Reorder past baskets in 1-click.
- Earn 1 Aheed Loyalty Point for every £1 spent.
    `,
  },
  {
    id: 'doc-cust-3',
    title: 'Payment & Stripe Security Privacy',
    slug: 'payment-stripe-security',
    audience: 'customer',
    visibility: 'public',
    category: 'Checkout & Orders',
    summary: 'How payments are processed securely via Stripe without storing sensitive card details.',
    lastUpdated: '2026-08-01',
    content: `
# Payment & Stripe Security

All payments on Aheed Food Centre are processed through **Stripe**, a certified PCI-DSS Level 1 payment processor.

### What Stripe Does
- Encrypts your payment information over TLS 1.3.
- Processes major credit/debit cards (Visa, Mastercard, American Express).

### What Aheed Does NOT Store
- We **never** store your 16-digit credit card number, CVV code, or bank details on our servers.
- Only tokenized payment IDs are referenced to verify transaction completion.
    `,
  },
  {
    id: 'doc-cust-4',
    title: 'Understanding Delivery Status & Aheed Self-Delivery',
    slug: 'delivery-status-expectations',
    audience: 'customer',
    visibility: 'public',
    category: 'Fulfillment & Delivery',
    summary: 'Aheed self-delivers with local drivers across Leicester. Learn what each status stage means.',
    lastUpdated: '2026-08-01',
    content: `
# Understanding Delivery Status

Aheed Food Centre operates its own fleet of local delivery drivers in Leicester (postcodes LE1 to LE5).

### The 3 Live Delivery Stages:
1. **Confirmed**: Our shop-floor butchers and staff have received your order and are picking fresh stock.
2. **Out for Delivery**: Your items are loaded onto our dedicated refrigerated delivery van and dispatched to your Leicester address.
3. **Delivered**: Hand-delivered to your doorstep or safe place.

*Note: Because we self-deliver locally, we do not send external courier tracking links. You can check live status directly on our order tracking screen.*
    `,
  },
  {
    id: 'doc-cust-5',
    title: 'Aheed Loyalty Points: Earning & Redeeming',
    slug: 'loyalty-points-guide',
    audience: 'customer',
    visibility: 'public',
    category: 'Loyalty & Rewards',
    summary: 'Earn 1 point for every £1 spent and redeem for instant cart discounts.',
    lastUpdated: '2026-08-01',
    content: `
# Aheed Loyalty Program

Our way of thanking our loyal Leicester community!

### Earning Points
- Earn **1 Aheed Point** for every full **£1** spent on eligible products.
- Points are credited instantly upon order completion.

### Redeeming Points
- **100 Points = £1.00 Discount**.
- Redeem your points directly at checkout during payment selection.
    `,
  },

  // STAFF & ADMIN OPERATIONAL GUIDE (INTERNAL)
  {
    id: 'doc-staff-1',
    title: 'Staff Track: Toggling Product Availability & Honest Live Stock',
    slug: 'staff-toggle-availability',
    audience: 'staff',
    visibility: 'internal',
    category: 'Shop-Floor Operations',
    summary: 'Shop-floor procedures for marking out-of-stock items honestly without fake scarcity.',
    lastUpdated: '2026-08-02',
    content: `
# Staff Track: Product Availability Toggles

As shop-floor staff, maintaining honest live stock is a core trust claim of Aheed Food Centre.

### Guidelines
1. **Never advertise unavailable items**: If fresh butcher cuts or produce run out, toggle "In Stock / Available" to **OFF** immediately.
2. **No artificial scarcity**: We never artificially lower stock numbers to create urgency.
3. **Stock Updates**: When fresh butcher deliveries arrive, update stock counts directly in the Staff Panel.
    `,
  },
  {
    id: 'doc-staff-2',
    title: 'Staff Track: Advancing Delivery Order Status',
    slug: 'staff-delivery-status',
    audience: 'staff',
    visibility: 'internal',
    category: 'Order Fulfillment',
    summary: 'How to transition orders from Confirmed → Out for delivery → Delivered.',
    lastUpdated: '2026-08-02',
    content: `
# Staff Track: Order Status Progression

When fulfillment starts:
1. **Confirmed**: New orders arrive automatically in this status.
2. **Out for Delivery**: Mark this status when driver collects the packed box for dispatch.
3. **Delivered**: Driver marks delivered upon arrival at customer address.
    `,
  },
  {
    id: 'doc-admin-1',
    title: 'Admin Track: Product Pricing & Integer Pence Convention',
    slug: 'admin-pricing-pence-convention',
    audience: 'staff',
    visibility: 'internal',
    category: 'Admin & Finance',
    summary: 'Mandatory standard: prices are stored as integer pence to prevent floating point currency bugs.',
    lastUpdated: '2026-08-02',
    content: `
# Admin Track: Product Pricing (Integer Pence Rule)

To eliminate IEEE 754 floating point rounding errors in financial transactions:

### Money Convention
- **Database Storage**: Stored as integer pence (pricePence: 149).
- **Storefront Display**: Formatted cleanly as £1.49.
- **Admin Input**: Enter exact integer pence (e.g. 899 for £8.99).
    `,
  },

  // DEV KMS / ARCHITECTURE ADR (INTERNAL)
  {
    id: 'doc-dev-1',
    title: 'ADR-001: All-Serverless Architecture (Cloudflare Workers + Neon + R2)',
    slug: 'adr-001-serverless-architecture',
    audience: 'dev',
    visibility: 'internal',
    category: 'Architecture ADRs',
    summary: 'Rationale for OpenNext Cloudflare Workers, Neon Postgres, and S3-compatible R2.',
    lastUpdated: '2026-08-03',
    content: `
# ADR-001: All-Serverless Origin Architecture

### Decision
Deploy Next.js application on **Cloudflare Workers** (via OpenNext adapter), using **Neon Serverless PostgreSQL** for transactional persistence and **Cloudflare R2** for media assets via S3 API.

### Key Rationale
- **Cost Posture**: Scales to exact zero cost when idle.
- **Zero Egress Fees**: Cloudflare R2 object storage eliminates data transfer fees.
- **Low Latency**: Cloudflare edge LHR node + Neon London region ensures <25ms database latency across UK.
    `,
  },
  {
    id: 'doc-dev-2',
    title: 'ADR-002: Better Auth Authentication & Impersonation Audit Controls',
    slug: 'adr-002-better-auth-impersonation',
    audience: 'dev',
    visibility: 'internal',
    category: 'Security & Compliance',
    summary: 'Better Auth integration details, session JWTs, and strict zero-trust impersonation audit logs.',
    lastUpdated: '2026-08-03',
    content: `
# ADR-002: Better Auth & Impersonation Security

### Better Auth
We utilize Better Auth for zero-overhead authentication sessions, supporting email/password, magic links, and RBAC claims (\`customer\`, \`staff\`, \`admin\`).

### Impersonation Safeguards
1. **Admin-Only**: Only users with \`role: 'admin'\` can trigger "Login as User".
2. **Audit Logging**: Mandatory field for reason ("who, whom, when, why").
3. **Banner Alert**: High-contrast top banner explicitly warning "YOU ARE IMPERSONATING".
4. **Disabled Payments**: Financial payments are blocked during active impersonation sessions.
    `,
  },
];
