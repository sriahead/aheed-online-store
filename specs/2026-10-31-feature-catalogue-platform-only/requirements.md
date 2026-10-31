# Feature Catalogue restricted to platform admins (requirements)

Closes `#1379`. Narrative: `plan.md`.

R1. `app/(admin)/staff/feature-catalogue/page.tsx` returns a "Platform admin only" `PanelRefusal`
    when `auth.via !== "platform-admin"`, and still redirects an anonymous visitor to `/login`.

R2. `/staff/feature-catalogue` is in `PLATFORM_NAV_ITEMS` and not in `STAFF_NAV_GROUPS`.

R3. The catalogue's "Feature Catalogue" entry is under the `platform` role.

R4. The guide section is in `docs/platform-admin-guide/platform-admin-guide.md` with "Who can
    access: Platform admins only", and is no longer in `admin-tabs-guide.md`.

R5. `CHANGELOG.md` names `#1379`; `lint`, `typecheck`, `format:check` and
    `npx vitest run --maxWorkers=4` pass.

R6. After the staging deploy, an anonymous request to `/staff/feature-catalogue` returns 307 to
    `/login`; `demo-platform-admin` sees the catalogue and `demo-admin` sees the refusal.
