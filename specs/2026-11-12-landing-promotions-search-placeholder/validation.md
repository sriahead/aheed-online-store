# Every live promotion on the landing page; plainer staff search placeholder (validation)

| Req | How to verify |
| --- | --- |
| R1 | `tests/landing-promotions-limit.test.ts` passes. |
| R2 | After deploy, the production landing page HTML contains all 7 live promotion headlines (it contained 3 before). |
| R3 | `grep -n "Search your favourite products" "app/(admin)/staff/products/page.tsx"` matches. `tests/bulk-quantity.test.ts` ("searches name, PLU and barcode") still passes. |
