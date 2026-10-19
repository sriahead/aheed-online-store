# Search selector, search pills, footer contact icons, payment logos and Quick Shop examples (requirements / acceptance criteria)

This slice closes `#1169`, the owner's 2026-10-19 polish request, and builds on `#1131` (header
search) and `#1145` (Quick Shop). In one line: the header search selector reads "All" and lists
subcategories; `/search` shows the category page's subcategory pills, linking back into search;
the footer's contact icons move under "Visit & contact us"; real brand glyphs replace the payment
placeholders; and the Quick Shop hint shows both quantity forms the parser accepts. `plan.md`
records the facts these rest on and the owner's two Gate 1 rulings: the `x2` example, and Simple
Icons for the logos. No schema change, no migration, no new dependency. Every UI requirement
holds for **both** vendors, Aheed and SriMart.

**A. Header search selector**

R1. `ALL_DEPARTMENTS_LABEL` in `components/layout/DepartmentSearchBar.tsx` is `"All"`, and the
    select's first option has value `""` and text `All`. The select's `aria-label` is still
    `Search department`.
R2. The select lists every visible department, then each department's visible subcategories
    immediately after it, in `listTree()` order. A subcategory option's value is its slug, and its
    text is two U+00A0 characters followed by its name. A department option's text is its name
    with no leading whitespace.
R3. `components/layout/Header.tsx` builds the selector's list from
    `getCategoryRepository().listTree()` and no longer calls `listTopLevel()` for it. The portal
    still passes an empty list without reading.
R4. When the URL's `category` is a slug present in the list (department **or** subcategory), that
    option is selected. When it is absent or unknown, `All` is selected.

**B. Subcategory pills on `/search`**

R5. `SubcategoryLinks` accepts an optional slug-to-href function. Without it, every link is
    `/categories/<slug>`, unchanged, and `app/(storefront)/categories/[slug]/page.tsx` does not
    pass it.
R6. On `/search` with a `category` that resolves to a department that has subcategories, the page
    renders one `nav[aria-label="Subcategories"]`. Its first link is `All`, carries
    `aria-current="page"`, and is followed by one link per subcategory. Every link's `href` equals
    `categoryFilterHref(<the page's params>, <that pill's slug>)`, with `All` using the
    department's slug.
R7. On `/search` with a `category` that resolves to a subcategory, the same `nav` lists `All`
    (linking to the department's slug) and every subcategory of that department, and only the
    selected subcategory's link carries `aria-current="page"`.
R8. A pill's href keeps the page's `q` and filter parameters and has no `cursor`. For example,
    `/search?q=juice&category=beverages&inStock=1&cursor=24` produces pill hrefs that contain
    `q=juice` and `inStock=1` and do not contain `cursor`.
R9. `/search` renders no `nav[aria-label="Subcategories"]` when `category` is absent, when it does
    not resolve, or when it resolves to a department with no subcategories. The removable category
    chip in `FilterChips` is still rendered whenever `category` resolves.

**C. Footer contact icons**

R10. In `components/layout/StorefrontFooter.tsx`, the `ul[aria-label="Contact us"]` produced by
     `FooterContactChannels` is a descendant of the `section` labelled `Visit & contact us`, and
     no longer a descendant of the `section` labelled `Shop with us`. The "Shop with us" links are
     unchanged.
R11. The "Visit & contact us" section renders when the vendor has an address, a phone or an email,
     **or** at least one contact channel. A vendor with none of the four still renders no such
     section.

**D. Payment logos**

R12. Each of `public/payment-methods/visa.svg`, `mastercard.svg`, `amex.svg`, `apple-pay.svg` and
     `google-pay.svg`:
     - is valid SVG with `viewBox="0 0 48 30"`;
     - contains no `<text>` element and at least one `<path>`;
     - has an `aria-label` naming its brand without the word `placeholder`;
     - carries a comment naming its Simple Icons slug (`visa`, `mastercard`, `americanexpress`,
       `applepay`, `googlepay`) and the Simple Icons licence (CC0).
R13. `lib/payment-badges.ts` is unchanged, and `package.json` gains no dependency.
R14. Rendered in a browser, each of the five SVGs shows its brand's recognisable mark on a white
     tile. Checked visually from a screenshot.

**E. Quick Shop hint**

R15. With an example product name `N`, the hint paragraph's whitespace-normalised text is exactly
     `For example: 2 N or N x2 (up to 100 items, one per line)`, with `2 N` and `N x2` each in a
     bold `span`. Without one, it is exactly
     `For more than one, put 2 before the item or x2 after it (up to 100 items, one per line)`.
R16. A test asserts that `parseListLine("2 " + N)` and `parseListLine(N + " x2")` both return
     quantity 2 and identical `terms`, for at least one name ending in a size (for example
     `Apple Juice 1L`).

**F. Both vendors, live**

R17. Under `npm run preview`, on Aheed (`localhost:8787`) and SriMart (`srimart.localhost:8787`):
     - the header's first option is `All`, and the subcategory options (if that vendor has any)
       appear indented under their department;
     - `/search?category=<a department with subcategories>` renders the pills with `All` active
       and hrefs into `/search` (where the vendor has such a department);
     - the "Contact us" list sits inside "Visit & contact us";
     - the footer's badge `img` elements load the new files;
     - `/shop-your-list` shows the new hint naming that vendor's own product.

     Where a vendor has no subcategories, record that the pill check is not applicable to it,
     rather than passing it.

**Carry-forward and gates**

R18. `specs/roadmap.md`'s change log has a row citing PR #1168 (merge `a182d6d`), and
     `npm run sdd:audit` prints no `PR #1168 ... pending` line.
R19. `CHANGELOG.md` updated (Gate 4).
R20. `lint`, `typecheck`, `test` (`npx vitest run`, run alone), `format:check` and `kms:validate`
     all exit 0. `npm run kms:assemble:internal` followed by a real Next build in
     `kms/site-internal` also exits 0. CI `gates` on the PR is green.
