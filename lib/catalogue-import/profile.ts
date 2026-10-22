import { z } from "zod";

/**
 * #1216 — the import profile: everything about ONE client's source file that is not the file
 * itself. Pure (zod only); held outside the repository like a vendor manifest, because the
 * department map is a client's commercial data and per-client import input (ADR-004, ADR-007).
 *
 * `.strict()` on every object for the same reason `scripts/provision-vendor.ts` does it: a
 * misspelled key would otherwise be dropped silently and the import would run on a default nobody
 * chose.
 */

const headerName = z.string().min(1);

const restriction = z.enum(["PROHIBITED", "AGE_RESTRICTED", "NOT_DELIVERABLE", "NEEDS_REVIEW"]);

export const importProfileSchema = z
  .object({
    /** Source header-cell names. `plu`, `name`, `price` and `department` are required. */
    columns: z
      .object({
        plu: headerName,
        name: headerName,
        price: headerName,
        department: headerName,
        subDepartment: headerName.optional(),
        description: headerName.optional(),
        vat: headerName.optional(),
      })
      .strict(),
    /** `pattern` is searched (case-insensitively) in the name cell; the first match is the unit label. */
    unit: z
      .object({
        pattern: z.string().min(1),
        defaultLabel: z.string().min(1),
      })
      .strict()
      .superRefine((unit, ctx) => {
        try {
          new RegExp(unit.pattern, "i");
        } catch {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "pattern must be a valid regular expression",
            path: ["pattern"],
          });
        }
      }),
    /** The owner's reviewed department lists. A department in none of the three is UNREVIEWED. */
    policy: z
      .object({
        byDepartment: z.record(z.string(), restriction),
        uncertainDepartments: z.array(z.string()),
        unrestrictedDepartments: z.array(z.string()),
      })
      .strict(),
  })
  .strict();

export type ImportProfile = z.infer<typeof importProfileSchema>;
