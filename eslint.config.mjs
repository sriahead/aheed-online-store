import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

const config = [
  {
    // kms/site-*/ are independent nested Next.js projects (own package.json,
    // own tsconfig, own dependency tree) — each lints itself, not the root.
    // docs/ui-ref/ is the P2.5b mockup's extracted reference source, kept for
    // comparison only — never built or imported by this app.
    ignores: [
      ".next/**",
      ".open-next/**",
      ".wrangler/**",
      "node_modules/**",
      "prisma/generated/**",
      "kms/site-internal/**",
      "kms/site-public/**",
      "docs/ui-ref/**",
    ],
  },
  ...nextCoreWebVitals,

  // ADR-004 slice 2 — keep domain data access inside the repository layer. The app/UI/
  // feature layers must go through lib/repositories/* (which enforce vendorId scoping),
  // never touch Prisma directly. Type imports are blocked too: the app layer programs to
  // the repositories' own interfaces, not Prisma's types (Clean Architecture).
  {
    files: ["app/**/*.{ts,tsx}", "features/**/*.{ts,tsx}", "components/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/db",
              message:
                "Don't use getPrisma() in the app/UI/feature layer — query through a repository in lib/repositories/* (it enforces vendorId scoping, ADR-004 slice 2).",
            },
          ],
          patterns: [
            {
              group: ["@prisma/client", "@prisma/client/*"],
              message:
                "Don't import Prisma in the app/UI/feature layer — use a repository from lib/repositories/* (ADR-004 slice 2).",
            },
          ],
        },
      ],
    },
  },
  // Infra probe: /api/health reads the non-tenant HealthCheck table directly (not domain data).
  {
    files: ["app/api/health/**/*.{ts,tsx}"],
    rules: { "no-restricted-imports": "off" },
  },
];

export default config;
