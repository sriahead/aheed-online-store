# Copy the Aheed catalogue from staging to production (build notes)

Worktree `E:\GitRepositories\aheed-wt-1523`, branch `feature/1523-copy-catalogue-to-production` from
`origin/staging` at `1e7b3450`.

## What was found while building

- **Staging serves some images from production's bucket.** HEAD checks on all 125 image keys:
  - 84 are in both buckets;
  - 26 are only in `afc-images-production`;
  - 11 are only in `afc-images-staging`;
  - 4 are in neither.

  So the copy is "whatever production's bucket lacks, from staging's bucket", not a blind copy.
- **4 broken image rows.** Their keys are `products/a4ed0000-…0001/<uuid>.jpg`: a vendor id where a
  product id belongs, from the legacy import. They are left alone on both sides rather than spread.
- **`getStorage()` validates the whole config**, including `DATABASE_URL`, which a cell's secrets file
  names `AFC_DATABASE_URL`. The script fills `DATABASE_URL` with that environment's own URL
  before building each storage client.
- **`NetContentSuggestion.productImage` is `onDelete: SetNull`**, so mirroring image rows cannot fail on
  a suggestion. A guard for that was written and then removed.
- `secrets/scratch-target.vars` credentials have expired, and there is no Neon API or `neonctl` access,
  so no disposable production-like target exists. The apply path is covered by `writePlan` with a fake
  client. The read path was proven by the dry run against dev, where independently seeded ids
  produced 6,120 clashes and the run refused with nothing written.

## Decisions

- **The activation switch is a required flag, not a default.** The owner's pre-launch rule
  (all production products hidden) and "move the data" pull in opposite directions. The person
  running the command chooses `keep-production` or `copy`.
- **No global transaction.** That would mean thousands of writes in one interactive transaction on
  a Neon WebSocket. Instead it is idempotent, phased by table, with images first and a Neon backup
  branch as the rollback.
- **Mirrored tables are only image rows and bundle lines.** Staging replaced placeholder image rows and
  rebuilt bundle lines. Keeping production's old rows would show two primary images or stale lines.

## Known-shaky areas

- **The first real apply is production's.** If production's ids have drifted from staging's (rows
  created in production after the last staging refresh), the dry run shows slug/PLU clashes and
  refuses. Matching by slug would then be a follow-up.
- About 2,000+ product updates are possible if many rows differ; they run 8 at a time.
