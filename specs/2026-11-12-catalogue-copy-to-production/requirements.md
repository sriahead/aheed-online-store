# Copy the Aheed catalogue from staging to production (requirements)

Issue #1523. See `plan.md`.

R1. Without `--apply` the script writes nothing. It prints both hosts and buckets, the activation policy, and a
    per-table count of create / update / unchanged / destination-only rows. It also prints the most-changed fields, the
    switched-on counts before and after, and the image objects to copy.
R2. `--activation` is required and accepts only `keep-production` or `copy`.
R3. The script refuses to run when:
    - source and destination are the same database or the same bucket;
    - `--apply` is given without `--confirm-host` equal to the destination host;
    - a production destination is given without `--production`;
    - `--skip-images` is given with a production destination;
    - the vendor id differs between the two databases.
R4. A unique-key clash in the combined result (slug, PLU), or a promotion naming a discount code
    the destination lacks, stops the run before any write.
R5. Rows are matched by id, except: stock and tiers by `productId`, attribute values by
    `(productId, attributeId)`, bundle lines by `(bundleId, productId)`. An update writes only
    changed fields, to the destination row's id. Audit rows are only ever created.
R6. `Product.averageRating` and `reviewCount`, and `Inventory.version`, are never copied. A stock
    update increments `version`.
R7. `keep-production` keeps the destination's `isActive` for products, bundles and promotions, and
    a row new to the destination arrives off. `copy` takes the source's. A restricted product is off
    in both.
R8. Only image rows and bundle lines are deleted from the destination (mirrored). Every other
    destination-only row is reported and kept.
R9. Every image object the copied rows reference that the destination bucket lacks is copied,
    key and content type unchanged, before any row is written. An image row whose object is in
    neither bucket is neither copied nor deleted.
R10. Categories are created parents first. A second run after a successful apply reports nothing to
    create or update.
