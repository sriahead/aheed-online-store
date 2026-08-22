---
id: gap-register
title: Phase 6.5 Gap Register (superseded by the master register)
audience: [dev, admin]
type: doc
status: approved
version: "2.0.0"
updated: 2026-08-17
visibility: internal
summary: The Phase 6.5 audit's gap register, now a pointer — its four findings (GAP-001..004) were folded into the single master register at docs/gap-register.md on 2026-08-17.
tags: [gap-register, self-review, audit, hardening, superseded]
related: [gap-register-audit, self-review-report, p6-5-residual-validation-plan]
---

# Phase 6.5 — Gap Register

> **This file no longer holds a gap table.** The Phase 6.5 findings — **GAP-001** (IPv6 loopback
> host truncation), **GAP-002** (local preview sign-in origin mismatch, #176), **GAP-003** (unstyled
> fallback 404) and **GAP-004** (`ARTIFACT_INDEX.md` staleness) — now live in the single master
> register:
>
> **[`../../gap-register.md`](../../gap-register.md)**

## Why it moved

Until 2026-08-17 there were **two** approved gap registers sharing one GAP-ID space: this file held
GAP-001..004 and `docs/gap-register.md` held GAP-005..015. Neither referenced the other, so a reader
who found one had no way to know the other existed, and no single place answered "what is the state
of this application's known gaps?"

They were consolidated by `specs/2026-08-17-p6.5-residual-validation/` (issue #192), which also
re-derived every row's status from the code. Five rows turned out to be wrong, and this file's own
GAP-002 row was one of the misleading ones — recorded `Fixed` on unit-test evidence alone while
issue #176 stayed open against a symptom nobody had re-fired.

The Phase 6.5 narrative and results remain here alongside this pointer:

- [`SELF-REVIEW.md`](SELF-REVIEW.md) — the Phase 6 exit-gate report.
- [`VALIDATION-RESULTS.md`](VALIDATION-RESULTS.md) — the audit-step and fix log.
