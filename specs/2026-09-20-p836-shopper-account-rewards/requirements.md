# P836 — Shopper Account Upgrade & Loyalty/Rewards Integration (requirements / acceptance criteria)

This slice upgrades the Demo/Shopper "Your account" experience to visually match the Staff View / Store Admin layout, integrates the Loyalty & Rewards interaction into the account, adds a persistent floating Rewards launcher with a compact slide-out panel, and establishes a customer referral system with unique links, copy/share tools, and tracking.

R1. The Shopper Account page (`/account`) adopts the same full-width structure, content width (`max-w-5xl px-4 py-8`), margins, and spacing as Staff View / Store Admin.

R2. The page heading "Your account" and subtitle align with the positioning and typography of Store Admin.

R3. Customer profile details (Name, Email, Role) are displayed cleanly near the top in a surface card.

R4. The narrow vertical account menu is replaced with a responsive card-grid style matching Staff View (2-column on desktop, single-column on mobile viewports).

R5. Cards exist for:
  - Your orders (`/account/orders`)
  - Your lists (`/account/lists`)
  - Loyalty & Rewards (`/account/loyalty`)
  - Your feedback (`/feedback`)
  - Your data (`/account/data`)

R6. Each account card matches the Staff View cards for border radius (`rounded-2xl`), border (`border-black/10`), padding (`p-5`), typography, themed icons (`text-action` / `text-accent`), and hover transition (`hover:border-action`).

R7. The Logout button remains clearly accessible below the account cards with a visual boundary separator.

R8. The Loyalty & Rewards page (`/account/loyalty`) is upgraded into the same consistent design, displaying current points balance, cash discount value, expiration date (when configured), current tier, tier progress, expandable accordions for "Ways to earn" and "Ways to redeem", available rewards vouchers, and referral tools.

R9. A floating Rewards launcher button is positioned at `bottom-6 left-6` (`sm:bottom-8 sm:left-8`) across the storefront, opening a compact slide-out/popup rewards panel matching the reference widget (brand header, points, expiry, accordions, referral invite, and account link).

R10. The Loyalty & Rewards account card and the floating rewards launcher share the identical underlying rewards data and API (`/api/rewards`).

R11. The referral system provides unique customer referral links (`/?ref=REF-XXXXXXXX`), copy/share controls (Facebook, X, Email, WhatsApp), completed referral tracking, and guards against self-referrals and duplicate rewards.

R12. `CHANGELOG.md` updated with an entry for `#836` under Post-launch improvements (Gate 4).

R13. `npm run lint`, `npm run typecheck`, `npm run format:check`, and all tests exit 0 with zero errors (Gate 3).
