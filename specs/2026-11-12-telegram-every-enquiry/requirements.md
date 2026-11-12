# Telegram alert for every contact-form enquiry (requirements)

R1. A contact-form submission that returns success alerts the store exactly once, whatever its type
    and whether or not it names an order. This replaces #1390 R12's complaint-or-order condition.
R2. A honeypot, invalid, rate-limited, order-not-found or no-recipient submission still never
    alerts.
R3. The contact-form brief carries `contactType` equal to the submission's type. Its other fields are
    unchanged: source, store name, order number or null, sender name, subject.
R4. The alert's first line reads `Complaint: <store>` for `COMPLAINT`, `Enquiry: <store>` for
    `ENQUIRY`, and `Order inquiry: <store>` when `contactType` is absent. The environment tag applies
    as before. The other four lines are unchanged.
R5. A rejecting alert still leaves the submission successful and logs nothing personal (unchanged).
R6. On Aheed staging after deploy, a contact-form ENQUIRY with no order produces an
    `order alert … channel=TELEGRAM status=sent` log line for the working recipient.
