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
