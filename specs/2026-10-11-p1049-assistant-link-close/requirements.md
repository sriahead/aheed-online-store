# Help assistant links close the panel (requirements / acceptance criteria)

Closes `#1049`. The help assistant (`#1015`) is a full-screen overlay mounted by `FloatingContact`,
which survives client-side navigation; its `<Link>`s navigated behind the still-open panel, so they
looked dead. No schema change, no migration, no server action.

R1. Every `next/link` `<Link>` rendered inside `components/assistant/HelpAssistant.tsx` (the answer
    links from `entry.links` and the "Help Centre" link in the unavailable state) calls the panel's
    `onClose` when clicked, so the dialog unmounts and focus returns to the help-assistant button.
R2. Following an answer link records no extra conversation outcome (no `HANDED_OFF`, no second
    `ANSWERED`).
R3. `tests/help-assistant-panel.test.tsx` asserts R1 for an answer link (the dialog is gone after
    the click) and R2, and the assertion fails against the pre-fix component.
R4. The WhatsApp handoff link is unchanged: it does not close the panel.

## #1051 — WhatsApp through the assistant

Added to this slice at the owner's request: with the help assistant available, the WhatsApp route
is the assistant's handoff, not a direct shortcut on every page.

R5. `components/layout/FloatingContact.tsx` does not render the direct
    `Message <vendor> on WhatsApp` link when `assistantAvailable` is true; it still renders the
    `Open help assistant` control.
R6. When `assistantAvailable` is false and a WhatsApp number is set, the direct WhatsApp link
    renders exactly as before. Facebook and Instagram links are unaffected either way.
R7. `tests/help-assistant-panel.test.tsx` asserts R5 and R6.
R8. `docs/store-admin-guide/admin-tabs-guide.md` (version bumped) states that the WhatsApp icon is
    replaced by the help assistant while it is on, in both the Storefront section and the Help
    Assistant section.
