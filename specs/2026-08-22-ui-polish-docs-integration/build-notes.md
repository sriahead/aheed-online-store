---
id: ui-polish-docs-integration-build
title: "UI Polish & Docs Integration Build Notes"
audience: [dev]
type: spec
status: approved
version: "1.0.0"
updated: 2026-08-22
visibility: internal
summary: "Technical notes detailing the CSS animation injection and the resolution of the KMS indexing bug for new audiences."
tags: ["ui", "docs", "help-centre", "runbook", "build-notes"]
---

# UI Polish & Docs Integration (build notes)

- **UI Animations:** Rather than individually patching every Tailwind component, a robust base layer override was applied in `app/globals.css`. It targets all semantic interactive elements and assigns a hardware-accelerated transition property.
- **KMS Schema Bug:** While attempting to surface the `shopping-guide.md`, it was discovered that `kms:build-index.ts` silently ignores files with invalid Zod frontmatter. Because the previous documentation restructuring introduced new audiences (`shopper`, `store-admin`, etc.) that were not in the Zod schema, the KMS index entirely dropped 7 markdown files.
- **KMS Schema Resolution:** `kms/schema/frontmatter.ts` was updated to expand the `Audience` and `DocType` enums. The `trackFor` derivation function was also updated so that `store-admin` maps to `staff-ops` and `shopper` maps to `customer-help`.
- **Help Centre Rendering:** The `HelpPage` (`app/(storefront)/help/page.tsx`) was upgraded to a Server Component that queries the local `docs.ts` index, finds the shopper guide, and renders it safely via `react-markdown`.
