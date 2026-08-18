# Phase 6.6 — P0 Core Shopping UI Overhaul (validation)

> **Rewritten 2026-08-18 under #231.** The previous table asked a reader to "visually verify" that
> six surfaces "match the prototype". That is not a check — it has no failing case a reader could be
> shown to have got wrong, which is the same defect P6.5's exit gate was rewritten to remove. Every
> row below names a command, a file property, or an observable behaviour.

**Run rendered-output rows against `npm run preview`, never `npm run dev`** — `next dev` cannot load
the WASM query engine, so any DB-touching route silently renders an error state. Confirm which Neon
project the app is on before trusting a live result (`.dev.vars` under `preview`, not `.env`).

| Req | How to verify |
|-----|---------------|
| R1  | Load the storefront homepage. For a vendor with `logoStorageKey` set, confirm the header `<img src>` is `${CDN_BASE_URL}/${logoStorageKey}` and the image loads (HTTP 200). For a vendor without one, confirm the fallback renders the vendor's own initial and name rather than a fixed asset. |
| R2  | On the same page, confirm the header displays the vendor's `localityName` as seeded for that vendor; compare against the `VendorConfig` row read from the DB. |
| R3  | Confirm a search input is present. Submit a term; confirm navigation to `/search?q=<term>` and that results reflect the term. Repeat at a 375px viewport to confirm the mobile search row renders. |
| R4  | Signed out: confirm a link to `/login`. Signed in as `demo-customer@example.com`: confirm a link to `/account`. |
| R5  | Add a known quantity to the cart; confirm the header cart trigger displays that item count without a manual reload of a different page. |
| R6  | **Expected to fail until #232 ships.** Search `app/`, `components/`, `features/` and `lib/` for `wishlist` (case-insensitive); confirm whether any control exists. Record the result and confirm #232 is open (`gh issue view 232 --json state`). A pass here means #232 shipped and this row should be re-read, not that the check was skipped. |
| R7  | Confirm the hero renders the vendor's `tagline` from its `VendorConfig` row; for a vendor with no tagline, confirm the documented fallback string. |
| R8  | Submit the hero's postcode form with a postcode inside the vendor's `deliveryPrefixes` and one outside; confirm the deliverable and non-deliverable responses respectively. |
| R9  | Count the merchandising rows on the homepage and the product cards inside each. Confirm at least two rows and at least one card per row. Record the row titles and counts. |
| R10 | Inspect the DOM of one discounted and one non-discounted product card. Confirm the seven elements appear in the required order, and that the discount indicator is present only on the discounted card. |
| R11 | Inspect the rendered department navigation; confirm each top-level category renders as a card/icon element (an element carrying an image or icon plus a label), not a bare `<a>` of text. |
| R12 | Load the same routes on a second vendor host (`srimart-staging.nocaped.com`) and record vendor name, tagline, locality and search placeholder for both. Name and locality must differ. Then search `app/`, `components/`, `features/`, `lib/` for `src="http` and `url(http` and confirm no match. |
| R13 | `git diff <base> -- CHANGELOG.md` — non-empty. |
| R14 | `npm run lint`, `npm run typecheck`, `npm test`, `npm run format:check` — all exit 0. CI on Linux is the authority over a local Windows `format:check`. |
