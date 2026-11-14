# Email design system (validation)

| Req | How to verify |
| --- | --- |
| R1, R3 | `tests/email-layout.test.ts`: preheader hidden, one table-cell button, footer has address when given, site link, reason line, Powered by link; 600px container. |
| R2 | `tests/email-layout.test.ts`: mark URL composed from the key; no mark gives name only; low-contrast and malformed colours fall back to `#111827`. |
| R4 | `tests/email-layout.test.ts` (htmlToText) and `tests/email-text-part.test.ts`: both adapters pass `text`; `send` derives it when absent. |
| R5 | `tests/email-templates.test.ts`: interpolation, escaping of placeholder values and copy, unknown placeholders left visible in tests only via the validator. |
| R6, R7 | `tests/email-templates.test.ts`: every registered template renders HTML and non-empty text, its CTA is absolute, no subject ends with the store name, transactional templates contain no marketing words; existing order, contact, abandoned-checkout, existing-account and guard tests updated and green. |
| R8 | Existing dispatch/outbox/auth tests green; `[STAGING]` tagging test unchanged. |
| R9 | `npm run email:preview` produces the gallery; owner sign-off recorded in `build-notes.md`. |
| R10–R14 | Part 2: repository, validator and page tests; migration SQL read before apply. |
| R15 | Part 3: owner email tests updated. |

Gates: `lint`, `typecheck`, `format:check`, `npx vitest run --maxWorkers=4`, `kms:validate`,
`kms:coverage`, `kms:check-generated`, and an MDX compile of edited docs.
