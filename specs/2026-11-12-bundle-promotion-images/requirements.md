# Bundle and promotion images (requirements)

R1. `Bundle` and `Promotion` have `imageNeedsReview` (boolean, default false), and `AiFeature` has
    `BUNDLE_IMAGE`, added by a hand-authored, additive migration.
R2. An admin can generate a bundle photo with AI from the bundle's page. The prompt names the bundle's
    contents and states the guardrails: no live animals, no people, no text. The photo is saved
    flagged for review and metered as `BUNDLE_IMAGE`. A budget refusal answers 429 and spends nothing.
    A missing or another vendor's bundle answers 404. Staff do not see the button, and the route
    refuses them.
R3. An admin can fill missing bundle photos from the Bundles list: at most 10 per click, live bundles
    first, each flagged for review. The run stops at a budget refusal and reports the progress so far.
    One failure does not stop the others.
R4. Staff and admins can remove a bundle photo and approve a flagged one. An upload clears the flag.
R5. The Bundles list shows "No photo" and "Photo needs review" against each bundle.
R6. An admin can generate a promotion banner without changing its headline or copy. The subject comes
    from the promotion's target, scoped to the vendor. With neither a target nor a headline, the route
    refuses before generating.
R7. On the promotion form, an AI banner (from either AI button) is flagged for review. Approve, Replace
    (always offered) and Remove clear the flag. Save stores it, and the flag is never stored without
    an image.
R8. The staff guide describes the new options.
