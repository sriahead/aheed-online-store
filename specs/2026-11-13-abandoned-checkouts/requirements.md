# Abandoned checkouts (requirements)

R1. `/staff/abandoned-checkouts` (admin tier, registered once in `nav-items.ts`) lists this store's
    orders created in the last 30 days that are CANCELLED with a status event noted
    `Checkout session expired…`: expiry time, order number, guest or customer, consent, item count,
    total and reminder status. Other cancellations are not listed.
R2. A row offers **Send reminder** only when no reminder exists, the order belongs to a signed-in
    customer with an email, `hasEffectiveMarketingConsent` is true, and it expired within 7 days.
    Otherwise it shows the reason. The action re-checks every rule on the server.
R3. The admin may attach one of the store's codes that is active, started, not ended and not used
    up. Any other code id is refused before anything is claimed.
R4. The email lists the customer's items (up to 6, then "and N more"), the real total, the code's
    real benefit and conditions when chosen, one "Return to your basket" button to the order page,
    a truthful note that stock is not held, and a "Stop marketing emails" link to `/account/data`.
    It contains no countdown, invented deadline, scarcity count or social-proof claim. All supplied
    text is escaped.
R5. The reminder row is claimed (unique `orderId`, both adapters' unique-violation codes) BEFORE the
    send; losing the claim sends nothing and reports "already sent". The email goes through
    `sendVendorNotifications` (store sender, audience CUSTOMER, event ABANDONED_CHECKOUT_REMINDER),
    so a failed send is retried for 24 hours.
R6. The notification matrix exists at `docs/developer-portal/notification-matrix.md` and the store
    admin guide, staff playbook, platform admin guide, shopper guide and onboarding guide each carry
    their readers' part.
