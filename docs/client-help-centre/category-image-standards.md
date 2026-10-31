---
id: category-image-standards
title: "Category Image Standards & Photography Guide"
audience: [store-admin, platform-admin, staff]
type: guide
status: approved
version: "1.0.0"
updated: 2026-10-27
visibility: internal
summary: "Technical image specifications, commercial studio photography standards, aspect ratios, candidate asset review, dedicated icon gallery, and onboarding requirements for store categories and departments."
tags: [catalogue, categories, photography, images, standards, onboarding, store-admin]
related: [getting-started-onboarding, products-catalogue-guide, store-admin-tabs-guide]
---

# Category Image Standards & Photography Guide

This guide establishes the mandatory visual standards, file specifications, and onboarding workflow for category and department images across all platform storefronts.

To maintain the premium retail quality expected of leading UK supermarket platforms (such as Tesco and Sainsbury's), all categories must use **genuine commercial product photography**, never AI-generated illustrations, low-resolution mockups, or generic clip art.

---

## 1. Technical Image Specifications

Every category photograph uploaded to the platform or provisioned during client onboarding must strictly adhere to the following technical requirements:

| Specification | Requirement | Justification |
| :--- | :--- | :--- |
| **Aspect Ratio** | **1:1 (Square)** | Guarantees consistent alignment in scrollers, grids, and mobile navigation cards. |
| **Dimensions** | **512 × 512 pixels** (Minimum: 256 × 256 px) | Crisp high-DPI retina sharpness without excessive bandwidth payload. |
| **File Format** | **WebP** or **High-Quality JPEG (.jpg)** | Optimal compression and sub-100ms loading speed. |
| **File Size Limit** | **Maximum 80 KB** (Target: 25–45 KB) | Preserves Core Web Vitals (Largest Contentful Paint under 2.5s). |
| **Background** | **Pure Seamless White (`#FFFFFF`) or Transparent** | Seamless blend into category cards, active theme tints, and navigation strips. |
| **Subject Framing** | **80% container fill, centered with natural contact shadow** | Prevents claustrophobic edge-clipping while highlighting the product clearly. |

---

## 2. Category Photography Guidelines (Tesco Model)

Categories must depict authentic, high-quality representative products that instantly inform the shopper:

| Department / Category | Approved Subject Reference | Common Pitfalls to Avoid |
| :--- | :--- | :--- |
| **Fresh Food / Fruit & Veg** | Clean bunch of ripe yellow bananas alongside crisp red apples. | Wilted greens, cut fruit with oxidation, busy kitchen cutting boards. |
| **Bakery** | Sliced golden artisan farmhouse bread loaf and croissants. | Generic wheat grain illustrations, cartoon bread icons. |
| **Dairy & Eggs** | Clear glass milk bottle, cheddar cheese wedge, and farm eggs in carton. | Spilled liquid, unbranded generic white boxes. |
| **Halal Meat** | Fresh, tender cutlets of fresh halal poultry and lamb. | Raw slaughterhouse scenes, cooked stew dishes. |
| **Food Cupboard / Groceries** | Classic canned beans, transparent basmati rice bag, and cooking oil. | Cluttered kitchen cupboards, unreadable barcodes. |
| **Drinks / Beverages** | Chilled bottle of pure orange juice and beverage can. | Crushed cans, alcoholic imagery for halal-certified grocers. |
| **Treats & Snacks** | Sealed potato crisps bag, chocolate biscuits, and roasted nut bowl. | Crumbled broken biscuits, party scatter mess. |
| **Household** | Transparent green washing-up liquid and multi-surface spray bottle. | Dirty cleaning cloths, hazardous chemical warnings. |
| **Frozen Food** | Clear packet of frozen garden peas and ice cream tub. | Heavy freezer frost covering the product, unsealed freezer bags. |
| **International** | Tin of rich coconut milk, authentic spices jar, and fresh red chilies. | Generic globe illustrations, flag collages. |
| **Health & Beauty** | Elegant shampoo pump bottle, soap bar, and moisturizer tube. | Medical syringes, pill blisters. |
| **Baby & Kids** | Resealable baby wet wipes pack and infant nutrition formula tin. | Cluttered nursery toys, cartoon mascots. |
| **Pet Supplies** | Nutrition dog food can and pet bowl with dry kibbles. | Animal faces without food context. |

---

## 3. How to Configure & Generate Category Imagery

### Candidate Asset Management (Generate, Review, Select, Delete)

Operators can generate multiple candidate assets for a single category to compare visual alternatives before deciding which to activate:

1. In the **Category Imagery & Icon** panel on `/staff/categories/[id]`, click **Generate New Candidate** as many times as desired.
2. All generated variations appear below in the **Generated Candidate Assets** gallery.
3. Each candidate card displays:
   - High-resolution preview thumbnail.
   - Preset style badge (*Photo* or *3D Icon*).
   - **Active Badge** on the currently assigned primary icon.
   - **Select** button: Activates the candidate as the primary live image and updates `imageKey` immediately.
   - **Delete** button: Permanently removes the candidate from object storage and catalog database.
4. If an active image is deleted, the system automatically promotes the next available candidate or clears the field gracefully.

### Centralized Icon & Asset Gallery (`/staff/icons`)

To inspect and manage all visual assets across the entire store in one unified interface:

1. Navigate to **Catalogue &rarr; Visual Asset Gallery** (`/staff/icons`).
2. Use the tabs to filter between **All Assets**, **Category Imagery**, and **System Icons**.
3. Search by department name, slot key, or storage key.
4. Click any asset thumbnail to open the **High-Resolution Inspection Modal** featuring full image preview, storage key, creation timestamp, and dimensions.
5. Use the **Quick Generator** bar at the top to generate new assets on-the-fly for any category or system icon slot (*delivery-van*, *storefront*, *quick-shop*, *user-profile*, *cart-floating*, *secure-checkout*, *order-updates*, etc.).

### Bulk Backfill Missing Category Images (`/staff/categories`)

When onboarding a new store catalogue or adding multiple categories at once:
1. Navigate to the main **Categories** list (`/staff/categories`).
2. Above the category table, view the **Auto-fill Missing Images** control showing the count of categories without imagery.
3. Choose the style preset (*Studio Product Photography* or *Commercial 3D Rendered Icon*).
4. Click **Auto-generate missing images**. The system processes missing categories in batches of 5, displaying live progress and remaining counts.

### Manual Storage Key Configuration

Store operators may also specify custom photography assets:
1. Under the **Photograph storage key** field, enter the relative object storage key:
   - Example: `categories/fruit-veg.jpg`
2. Click **Save changes**. The storefront department strip and navigation will immediately reflect the updated photograph.
3. If left blank, the platform automatically falls back to the canonical photography asset `/images/categories/[slug].jpg`.

### For Technical Onboarding (Platform Administrators)

When provisioning a new store tenant:
1. Ensure the vendor's department list matches the standard department slugs.
2. In the vendor manifest (`prisma/manifests/<vendor>.json`), reference the category relative keys under storage namespace `vendors/<vendorId>/categories/`.
3. Upload approved 512×512 WebP/JPEG assets to the vendor's R2/S3 bucket under the corresponding relative keys.
4. Verify rendering on both desktop and mobile viewports (`/` and `/categories`).

---

## 4. Performance & Responsive Behaviour

- **Eager vs. Lazy Loading:** The first 6 visible category images are rendered with `loading="eager"` to minimize initial render latency. Categories 7+ are automatically loaded with `loading="lazy"`.
- **Off-Thread Decoding:** All category images specify `decoding="async"` to prevent main-thread scrolling hitching.
- **Fail-Safe Fallback:** If an image fails to load or the storage key is unreachable, `ImageWithFallback` automatically degrades to the theme-aware vector icon without breaking layout geometry or displaying broken image placeholders.

---

## 5. Related Guides

- **[Store Onboarding & Launch Checklist](/staff/guide/getting-started-onboarding)** — Complete pre-launch store audit.
- **[Catalogue & Product Management](/staff/guide/products-catalogue-guide)** — Product creation, pricing, and stock modes.
- **[Store Admin Guide](/staff/runbook/store-admin-tabs-guide)** — Complete walkthrough of all staff panel tabs.
