import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import jsxA11y from "eslint-plugin-jsx-a11y";

/**
 * P7 closeout (#251/#217) — jsx-a11y's recommended set, at `error`.
 *
 * `eslint-config-next/core-web-vitals` already activates six jsx-a11y rules
 * (alt-text, aria-props, aria-proptypes, aria-unsupported-elements,
 * role-has-required-aria-props, role-supports-aria-props) — but every one of
 * them at severity 1, so `npm run lint` exited 0 with real defects present. A
 * warning nobody reads is not a gate.
 *
 * This escalates the plugin's recommended set as its author wrote it, rather
 * than turning every rule it ships on. That distinction is the whole cost of
 * this part: recommended deliberately sets `label-has-for` (deprecated in
 * favour of `label-has-associated-control`) and `control-has-associated-label`
 * to "off", and forcing those two on produces 140 findings against markup that
 * is largely correct. Escalating only what recommended enables produces 2.
 */
function recommendedA11yAtErrorSeverity() {
  return Object.fromEntries(
    Object.entries(jsxA11y.flatConfigs.recommended.rules).map(([rule, setting]) => {
      const severity = Array.isArray(setting) ? setting[0] : setting;
      if (severity === "off" || severity === 0) return [rule, "off"];
      return [rule, Array.isArray(setting) ? ["error", ...setting.slice(1)] : "error"];
    }),
  );
}

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
      "docs/ui-ref-revised/**",
    ],
  },
  ...nextCoreWebVitals,

  // Accessibility gate — must come AFTER nextCoreWebVitals so these severities
  // win over the six warnings that config sets. No `plugins` key here on
  // purpose: eslint-config-next already registers "jsx-a11y", and flat config
  // treats a second registration of the same name as an error rather than a
  // merge ("Cannot redefine plugin"). The import above is for its rule table.
  {
    files: ["app/**/*.tsx", "components/**/*.tsx", "features/**/*.tsx"],
    rules: recommendedA11yAtErrorSeverity(),
  },

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

  // P7d (#218) settled #46: this project renders images with plain <img>, deliberately.
  //
  // next/image on Workers needs a custom loader (Next's own optimizer isn't available in the
  // Workers runtime), and a loader is only worth having if something behind it can actually
  // resize. It cannot here: Cloudflare Image Transformations are NOT enabled for this zone —
  // /cdn-cgi/image/<opts>/<key> returns 404 on the CDN host, the site host and the absolute-URL
  // form alike (measured 2026-08-19, docs/nfr-baseline.md). A loader that only composes
  // ${CDN_BASE_URL}/${key} would ship byte-for-byte the same image it does today, so adopting
  // next/image would cost a migration and buy nothing measurable.
  //
  // The rule is therefore off rather than suppressed line by line, which was the status quo:
  // some call sites carried an inline disable and others didn't, so the warning conveyed no
  // information. REVISIT if Image Transformations are enabled — the storefront's real problem is
  // byte weight (see docs/nfr-baseline.md's LCP breach), and that is what a resizer would fix.
  {
    files: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}", "features/**/*.{ts,tsx}"],
    rules: { "@next/next/no-img-element": "off" },
  },
];

export default config;
