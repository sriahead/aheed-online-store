# System Validation and Test Cases

This document records essential manual and automated test cases designed to prevent regressions for known critical issues.

## 1. Prisma Connection Limit & Database Pool Regressions

**Background:** 
The application connects to a Neon Serverless Postgres database. The system uses two different Prisma clients (hybrid architecture) due to Cloudflare Worker connection limits.
- **HTTP Client (`getPrisma()`)**: Stateless, used for reads. Cannot do transactions.
- **WebSocket Client (`getPrismaWs()`)**: Stateful, used for writes and `$transaction` blocks.

If mutations accidentally use the HTTP client, or if connection limits are hit due to a misconfiguration, "Error 1102" or Prisma timeout errors will occur under load.

### Test Case: Rapid Cart Mutation
- **Action:** Open a product page and click "Add to Cart" 10 times in rapid succession.
- **Expected Result:** The cart quantity updates correctly without `Server Error` or `500 Internal Server Error`.
- **Failure Condition:** The system throws an error on the 4th or 5th click. This indicates that the WebSocket Prisma driver connection pool limit has been breached or the transaction block was rolled back incorrectly.

### Test Case: Cart Item Quantity Update
- **Action:** Go to the Cart drawer/page. Change the quantity of an item using the (+) and (-) buttons rapidly.
- **Expected Result:** The quantity is updated in the database, and the UI reflects the exact final number. No errors.
- **Failure Condition:** The screen displays an error or the quantity reverts to the previous amount.

---

## 2. Cart Disappearance / Persistence Regressions

**Background:** 
When a user clicks "Proceed to Checkout", the system converts the pending `Cart` items into a `PENDING_PAYMENT` Order and clears the shopping cart to prepare for the Stripe session. If the user hits "Back" from the Stripe Checkout page, they used to lose their items.

### Test Case: Cancel Checkout Flow
- **Action:** 
  1. Add several items to the cart.
  2. Click "Proceed to Checkout".
  3. Wait to be redirected to the Stripe Payment page.
  4. Once on the Stripe page, click the "Back to Aheed Store" link (or use the browser's Back button).
- **Expected Result:** The user is redirected back to the `/cart` page (or homepage). The items previously in the cart are successfully restored to the cart, and the `PENDING_PAYMENT` order is marked as `CANCELLED`, freeing up reserved inventory.
- **Failure Condition:** The user is brought back to an empty shopping cart.

---

## Tracking and GitHub Issues

When adding new features that interact with `Cart` or `Order` entities, ensure these test cases are run. 
If an issue occurs, reference this file and the underlying architecture defined in `CLAUDE.md`.
