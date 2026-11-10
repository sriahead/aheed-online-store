---
id: 2026-11-10-db-warmup-ping-plan
title: "Database warm-up ping during store opening hours (plan)"
audience: [dev]
type: spec
status: approved
version: "1.0.0"
updated: 2026-11-10
visibility: internal
summary: "A scheduler ping that keeps each cell's Neon database awake during store opening hours, so shoppers do not pay a multi-second cold start. Off by default, configured by platform admins, with a compute-hour and cost estimate. Staging first, then production."
tags: [neon, performance, scheduler, platform-admin, cost]
related: [architecture, 2026-11-10-pr1481-enquiries-team-access-retro-plan]
---

# Database warm-up ping (plan)

Issue **#1491**, owner-approved 2026-11-10 ("try the ping option first; if it doesn't work, turn it
off and switch to always-on").

**Goal:** a shopper visiting during opening hours never waits for a Neon cold start. The cost stays
proportional to opening hours, a platform admin controls it and sees what it costs, and switching
it off is one click.

**Evidence.** On 2026-11-10 the first request after idle took **7.1 s** on Aheed staging, against
~0.2 s of warm server time. Production health took 1.7–3.0 s while waking. Neon suspends compute
after **5 minutes** idle. Every Neon project here is on the **Launch** plan ($0.106/CU-hour,
usage-based, no cap). Measurements were taken from LHR, the same region as Neon `eu-west-2`.

## Scope (this slice)

- **Config, one row per cell database.** `DbWarmupConfig` holds:
  - enabled (default **off**);
  - mode: `OPENING_HOURS` (default), `ALWAYS` or `CUSTOM`;
  - lead minutes (default 30);
  - an optional custom daily window;
  - two estimate inputs: minimum compute size and price per CU-hour.

  It is platform-wide, not per vendor: one database serves every vendor in a cell.
- **The schedule is computed in the app and published to KV.** The scheduler must decide "is it
  warm-up time?" **without touching the database**, or the decision itself would wake it. So the
  app computes the next 8 days of windows (Europe/London, DST-correct) from the config, every
  vendor's `VendorWeeklyHours` and every `VendorHoursOverride`, and writes them to the scheduler's
  existing `JOB_SIGNALS` KV. It republishes on every save of the config, the weekly hours or an
  override, and daily from the scheduler's 03:00 run.
- **Ping.** A new `*/4 * * * *` Cron Trigger on each scheduler environment (4 minutes, below Neon's
  5-minute suspend). Inside a window it POSTs a new token-guarded `/api/jobs/warm-db`, which runs
  one trivial query on the **main** database and records the time in KV. The postcode reference
  database is deliberately not touched.
- **The fail direction is reversed on purpose.** The existing jobs run when in doubt, because
  missing a payment sweep is harmful. The warm-up **skips** when in doubt: a missing, stale or
  unreadable schedule means no ping. A missed ping costs one cold start; a stuck ping costs compute
  all night.
- **Keep warm after signed-in activity (owner, 2026-11-10).** On by default, for 30 minutes. A
  signed-in request records its time in KV (at most one write a minute, never a database write).
  The 4-minute tick also pings while that time is recent.
  - **What it is for:** someone pausing on a page (reading, writing an enquiry reply) for more than
    5 minutes, and staff working outside opening hours.
  - **What it is not for:** the *first* visitor after a quiet spell, because nobody was active to
    trigger it. Opening-hours windows cover that.
  - **`ACTIVITY_ONLY` mode** drops the windows and is the cheapest option, accepting cold first
    visits.
  - **Signed in, not just logged in.** Sessions last days, so being logged in is not a signal; the
    last signed-in *request* is.
  - **A ping never counts as activity**, or it would keep itself alive.
- **When the database goes cold.** Neon suspends a compute after **5 minutes with no active
  query**: a sliding timer reset by every query, where an idle open transaction counts as active. On
  Launch scale-to-zero can only be switched on or off; the 5 minutes is adjustable only on Scale. The
  page shows "expected to go cold at" = later of last ping / last recorded activity + 5 minutes. It
  is approximate, because signed-out shoppers' requests are not recorded.
- **Platform admin page** `/staff/platform/db-warmup` (platform admins only). It holds the form, the
  next 7 days of windows in London time, the last ping, and the **estimated CU-hours and cost per
  month**, with an always-on figure beside it for comparison.
- **Rollout.** Ship off by default. Enable it on Aheed **staging**, compare one week of Neon usage
  with the estimate, then promote. Production is enabled from the same page by a platform admin; no
  code change is needed.

## Why these choices

- **The 4-minute cron is dedicated,** not a faster version of the existing 15-minute tick, so no
  other job's cadence changes. Four schedulers × 2 triggers are live today (8), which already
  exceeds the Free plan's 5 that `env-setup.md` claims, so the account's limit is higher. That doc
  line is corrected here. If a deploy is ever refused for the trigger count, the fallback is to
  move the 15-minute tick to `*/4` and gate the existing jobs by minute. That is not built now.
- **Integers, not floats** (schema rules): compute size is stored in milli-CU (250 = 0.25 CU) and
  price in micro-dollars per CU-hour (106000 = $0.106).
- **The estimate is arithmetic, not a measurement:** window hours per week × 30.4/7 × CU, plus
  Neon's 5-minute tail after each window, × price. The week on staging checks it against Neon's
  console.

## Deliberately excluded

- **Changing Neon plans, compute size or scale-to-zero settings.** Those are owner actions in the
  Neon console; always-on is the documented fallback.
- **Warming the postcode reference database.** It is shared, low-traffic and not on the shopper's
  first page.
- **Reducing query counts on slow pages.** That is a separate performance slice.
- **Per-vendor warm-up within a cell.** One database means one schedule, the union of the cell's
  vendors' hours.
- **Automatic Neon usage readback.** There is no Neon API key here; the week-long comparison is done
  by the owner in the Neon console.

## Open items carried forward

- Each project's actual **minimum compute size** (owner, Neon console). The page defaults to
  0.25 CU; set the real value to make the estimate exact.
- The week-long staging comparison (R16) completes after merge. Promotion waits for it.
