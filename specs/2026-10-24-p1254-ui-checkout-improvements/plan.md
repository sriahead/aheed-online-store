---
id: p1254-ui-checkout-improvements
title: "UI and Checkout Improvements: Cart Tooltip, Contact Hub, Payment Logos, Address Layout, Click & Collect Details, Animated Quick Shop"
audience: [dev, design]
type: spec
status: approved
version: "1.0.0"
updated: 2026-10-24
visibility: internal
summary: UI and checkout refinements addressing trolley tooltip ('My Cart'), Contact & Follow Hub label cleanup, official vector payment logos, UK address layout order, Click & Collect customer order details card, and animated Quick Shop navigation icon.
tags: [ui, checkout, cart, address, payment, icons, click-and-collect]
---

# UI and Checkout Improvements (Plan)

Issue `#1254`. Implements 6 UI and checkout improvements requested by the store owner:
1. **Cart Tooltip:** Change trolley tooltip to "My Cart" consistently across all viewports.
2. **Contact & Follow Hub:** Remove "3D" prefix and display "Contact & Follow Hub" only.
3. **Payment Icons:** Upgrade Visa, Mastercard, American Express, Apple Pay, and Google Pay to official brand artwork on consistent 48×30 white rounded tiles.
4. **Delivery Address Layout:** In `CheckoutForm`, move the Flat/Building (optional) input above the Street Address input to reflect standard UK postal address entry order.
5. **Click & Collect Order Details:** In order confirmation and account/staff order detail views (`OrderAddressCard`), branch on `fulfilmentMethod`:
   - `DELIVERY`: renders "Delivering to" with the customer's delivery address.
   - `COLLECTION`: renders "Click & Collect" with "Customer Collection" badge, customer name, order reference, and contact phone number. Never displays store location as a customer delivery destination.
6. **Quick Shop Icon:** Enable CSS keyframe animation (`animated={true}`) on the header's Quick Shop 3D icon in `ShoppingListLink`.
