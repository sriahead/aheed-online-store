# Realistic Product Photography for Categories (requirements / acceptance criteria)

Closes `#1278` (`feat(catalogue): realistic product photography for categories, Category.imageKey schema, and dynamic image URLs`). Reasoning, multi-tenant architecture decisions (`ADR-003`, `ADR-004`, `#239`), and visual design alignment are in `plan.md`.

## 1. Schema, migration & seed

R1. `model Category` in `prisma/schema.prisma` defines `imageKey String?` (relative storage key per ADR-003; never a URL), and additive migration `prisma/migrations/20261026150000_category_image_key/migration.sql` adds the nullable `TEXT` column `"imageKey"` to table `"Category"`.

R2. The migration backfills seeded categories with their canonical relative photography keys (`categories/<slug>.webp`) so existing stores have photography populated immediately upon migration.

R3. `prisma/seed.ts` is updated to define `imageKey` for all seeded top-level categories across Aheed Food Centre and SriMart.

## 2. Realistic product photography assets

R4. High-resolution, realistic product photographs matching UK grocery standards (Tesco reference model) are provisioned under `public/images/categories/<slug>.webp` for all 15 active departments:
    - `fruit-veg` (Fresh Food / Fruit & Veg): fresh ripe bananas and crisp Gala apples.
    - `bakery` (Bakery): sliced artisan loaf and croissants.
    - `dairy-eggs` (Dairy & Eggs): whole milk bottle, cheddar block, and farm eggs.
    - `halal-meat` (Halal Meat): fresh halal poultry cutlets and butcher cuts.
    - `groceries` (Food Cupboard / Groceries): classic canned beans, basmati rice, and cooking oil.
    - `beverages` (Drinks / Beverages): pure orange juice and beverage bottles.
    - `snacks` (Treats & Snacks): crisps, biscuits, and confectionery snacks.
    - `household` (Household): washing-up liquid and multi-surface spray.
    - `frozen-foods` (Frozen Food): frozen peas and ice cream tub.
    - `international` (International): coconut milk and authentic spices.
    - `health-beauty` (Health & Beauty): shampoo and toiletries.
    - `baby-kids` (Baby & Kids): baby wipes and infant formula.
    - `pet-supplies` (Pet Supplies): pet food nutrition.
    - `sri-electronics` (Electronics): modern wireless headphones.
    - `sri-home` (Home & Living): LED desk lamp.

R5. Every asset is optimized to modern WebP format (<40 KB per image), with transparent or clean neutral background, consistent square aspect ratio, and retina-ready resolution.

## 3. Repositories, service layer & APIs

R6. `CategorySummary`, `StorefrontCategoryNode`, `CategoryWithChildren`, and `AdminCategoryDetail` in `lib/repositories/categories.ts` define `imageKey: string | null` and `imageUrl: string | null`.

R7. `CategoryWriteInput` in `lib/repositories/categories.ts` accepts optional `imageKey?: string | null`.

R8. Category repository functions (`listTopLevelCategories`, `getCategoryBySlug`, `suggestCategories`, `listCategoryTreeForStorefront`) select `"imageKey"` from Prisma and dynamically resolve `imageUrl` using `composeCategoryImageUrl(category.imageKey, category.slug, cdnBaseUrl)`.

R9. `composeCategoryImageUrl(imageKey, slug, cdnBaseUrl)` returns:
    - If `imageKey` is non-null and `cdnBaseUrl` is provided: `composePublicUrl(cdnBaseUrl, imageKey)`.
    - If `imageKey` is null or starts with `/`: a clean relative URL `/images/categories/${slug}.webp`.
    - Otherwise null.

R10. Autocomplete suggestions in `app/api/search/suggest/route.ts` return `imageUrl` for each suggested category.

## 4. Storefront presentation & performance

R11. `components/layout/DepartmentScroller.tsx` renders realistic product photography from `category.imageUrl` inside a clean, rounded photo card with subtle border and theme hover effects. The previous synthetic 3D icons (`Icon3D`) and emoji SVGs are retired in favour of genuine photography.

R12. The first 6 category photographs render with `loading="eager"`, and the remaining render with `loading="lazy"`. All category images render with `decoding="async"` to preserve Core Web Vitals.

R13. When an image is missing or fails to load, `ImageWithFallback` degrades cleanly to the semantic vector icon (`categoryIconName`) without layout shift or broken image icon.

R14. `components/layout/DepartmentGlyph.tsx` renders the department's realistic photograph rather than 3D vector art.

## 5. Admin & onboarding documentation

R15. `components/staff/CategoryForm.tsx` and `features/admin/catalogue.ts` support saving `imageKey`.

R16. KMS documentation in `docs/client-help-centre/category-image-standards.md` documents category image specifications (dimensions, aspect ratio, file size, background, subject guidelines) and onboarding requirements for new vendor onboarding.
