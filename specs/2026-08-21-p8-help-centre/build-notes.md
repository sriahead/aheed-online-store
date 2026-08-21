# P8.1 Unified Role-Aware Help Centre (build notes)

## What changed and why

`components/layout/Header.tsx`: Updated the 'Help Guide' link to point to `/help` instead of `#`.
`app/(storefront)/help/page.tsx`: Created the new help centre page. It uses `requireVendorRole("STAFF", "ADMIN")` to silently check the user's role and conditionally render an internal staff resource block.
`CHANGELOG.md`: Recorded the addition of the P8.1 Unified Help Centre.

## Decisions taken during the build

Used `lucide-react` icons to visually align the static FAQ boxes with the rest of the storefront's design language.
The `requireVendorRole` check intentionally does not throw or redirect on failure because the shopper view is the fallback state.

## Deviations from the spec

None.

## Known-shaky areas

None.
