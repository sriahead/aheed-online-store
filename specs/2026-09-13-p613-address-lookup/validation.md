| Req | How to verify |
|---|---|
| R1 | Run `npm run test -- tests/postcodes-api.test.ts` to assert that the integration function fetches successfully. |
| R2 | In the browser, enter `SW1A 1AA` during checkout. Verify that the City field populates with "Westminster" (the `admin_district`). |
| R3 | In the browser, verify that `Address Line 1` remains an empty, editable text input after a successful postcode lookup. |
| R4 | Enter `XX99 9XX` in the checkout form. Verify that an invalid postcode error is shown and submission is prevented. |
| R5 | Mock a 500 error from `postcodes.io` using a test handler. Verify the checkout proceeds successfully using local regex validation. |
| R6 | Run `npm run test -- tests/is-deliverable.test.ts` to ensure delivery logic remains pure and disconnected from network calls. |
| R7 | In the browser, after confirming a deliverable postcode, verify the presence of a "Change postcode" button. Click it and verify the modal reopens. |
