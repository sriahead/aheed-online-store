# One reusable pagination component (requirements)

R1. On `/staff/products` the search field and its Search button sit below the filter row and Apply
    filters, in the same form.
R2. `components/ui/Pagination.tsx` renders every pagination bar. It has the `/staff/products` design:
    "Page X of Y · Showing a–b of N", Previous, a windowed page list, Next, and a jump box past 7 pages.
R3. Numbered mode is used on Staff Products, Staff Customers and a typed Search. Each link carries
    the list's filters, and `?page=` is 1-based and clamped.
R4. Sequential mode, with the same chips and no total, is used on category browsing (Page N,
    Previous, Next), browse-only Search, Staff Orders and Account Orders (Next, and First page once
    past the start).
R5. No architecture rule changes: keyset lists stay keyset.
R6. A test fails if a paginated page hand-writes its own Previous/Next links or stops importing the
    shared component.
