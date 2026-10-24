# Validation — Click & Collect order details: replace order reference with customer email (#1261)

## Automated Tests

1. `tests/ui-checkout-improvements.test.tsx`:
   - Assert `OrderAddressCard` in `COLLECTION` mode renders "Click & Collect", customer recipient name, customer email, and contact phone.
   - Assert `OrderAddressCard` in `COLLECTION` mode does NOT render "Order Reference".
   - Assert `OrderAddressCard` in `DELIVERY` mode continues to render "Delivering to" and delivery street lines.

2. `tests/orders.test.ts`:
   - Verify `findOrderForViewer` and order reads continue to function with `customerEmail` resolution for guests and members.

3. Quality Gates:
   - `npm run lint` exits 0.
   - `npm run typecheck` exits 0.
   - `npm run format:check` exits 0.
   - `npm run kms:validate` exits 0.
   - `npm run sdd:preclear` exits 0.
