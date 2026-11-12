# Net content for the live catalogue (requirements)

R1. `extractDetailedNetContent` never returns HIGH for a size range ("500–800g", "1100–1200g"), an
    amount followed by "+" ("800g+", "200G+50%"), or "Pack of N" beside a single weight. A size grade
    followed by a weight ("13/15 – 1kg", "31/40 – 400g"), a real multipack ("4 x 5kg") and a count
    pack ("Whole (Pack of 2)", read as 2 each) stay HIGH.
R2. `suggestNetContentByRule` suggests a HIGH name size, or 1 kg when the unit label's per-kg price
    equals the base price. Otherwise it suggests nothing.
R3. "Suggest net content" queues a PENDING suggestion with model "rules (no AI)" for every eligible
    product the rules read (up to 500 per click), before and independent of the AI step. The AI is
    then asked only about products with no suggestion.
R4. The run's message states how many the rules queued, including when the AI step is refused or
    has nothing left.
R5. Nothing reaches a product until a person accepts or edits it, as before.
