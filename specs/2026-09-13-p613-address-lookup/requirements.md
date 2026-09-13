# Requirements

R1. The checkout application must query `api.postcodes.io/postcodes/{postcode}` to validate user-entered postcodes.
R2. On a successful 200 response, the checkout form must automatically populate the `City` field with the `admin_district` value, and the `County` field with the `admin_county` value (if present).
R3. The `Address Line 1` and `Address Line 2` fields must remain visible and manually editable at all times.
R4. If `postcodes.io` returns a 404 (invalid postcode), the checkout UI must display a clear validation error blocking submission.
R5. If `postcodes.io` times out, returns a 5xx error, or is unavailable, the application must gracefully degrade by falling back to local regex validation and allowing manual entry of all address fields without blocking checkout.
R6. Delivery area eligibility must continue to be evaluated strictly by `isDeliverable` in `lib/delivery.ts` using local vendor prefix configurations, not by the external API.
R7. A "Change postcode" action must be present in the checkout flow after a postcode is selected, which resets the postcode state and reopens the `LocationControl` flow.
