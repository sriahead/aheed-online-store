# Plan — #1049

Add `onClick={onClose}` to the two `<Link>`s in `HelpAssistant.tsx`. Closing via `onClose` (rather
than a `usePathname` effect in `FloatingContact`) keeps the fix local, also covers a link to the
current page (no pathname change), and reuses the existing focus-return path. Add one test to the
existing panel test file.
