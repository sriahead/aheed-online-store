#!/usr/bin/env bash
#
# provision-project.sh — idempotent provisioning of the "Aheed Online Store — Delivery"
# GitHub Project (Projects V2), its milestones, labels, phase epics and fields.
#
# The Project is a GENERATED VIEW of specs/roadmap.md — the status layer only
# (what is in progress / in review / blocked right now). Scope and acceptance
# criteria live in specs/, never here. See the "Delivery tracking" note in
# specs/roadmap.md.
#
# Safe to re-run: every object is checked before it is created. Nothing is
# updated or deleted — existing objects are left exactly as they are.
#
# Usage:
#   DRY_RUN=1 ./scripts/provision-project.sh    # print planned actions, mutate nothing
#   ./scripts/provision-project.sh              # provision
#
# Requires: gh >= 2.40 authenticated with scopes: repo, project
#   gh auth refresh -s project
#
set -euo pipefail

DRY_RUN="${DRY_RUN:-0}"
PROJECT_TITLE="Aheed Online Store — Delivery"

# ── plumbing ────────────────────────────────────────────────────────────────
c_ok=$'\033[32m'; c_skip=$'\033[90m'; c_warn=$'\033[33m'; c_err=$'\033[31m'; c_off=$'\033[0m'
created=0; skipped=0
ok()   { echo "${c_ok}  + $*${c_off}"; created=$((created+1)); }
skip() { echo "${c_skip}  = $* (exists)${c_off}"; skipped=$((skipped+1)); }
warn() { echo "${c_warn}  ! $*${c_off}"; }
die()  { echo "${c_err}FATAL: $*${c_off}" >&2; exit 1; }
step() { echo; echo "── $* ─────────────────────────────────"; }

# Run a mutating command, or print it under DRY_RUN.
run() {
  if [[ "$DRY_RUN" == "1" ]]; then echo "${c_skip}  DRY-RUN: $*${c_off}"; return 0; fi
  "$@"
}

# ── preflight ───────────────────────────────────────────────────────────────
step "Preflight"
command -v gh >/dev/null || die "gh CLI not found."
gh auth status >/dev/null 2>&1 || die "gh not authenticated. Run: gh auth login"

OWNER="$(gh repo view --json owner --jq .owner.login)"
REPO="$(gh repo view --json name  --jq .name)"
echo "  repo: ${OWNER}/${REPO}"

# Projects V2 is GraphQL-only and needs its own scope; fail loudly and early
# rather than half-provisioning (milestones/labels would succeed, project would not).
# ALLOW_PARTIAL=1 downgrades this to a warning: labels/milestones/epics need only
# the 'repo' scope and are independent of the Project, so they can land first and
# the Project steps complete on a later re-run (every step is guarded).
if ! gh auth status 2>&1 | grep -q "'project'"; then
  if [[ "$DRY_RUN" == "1" || "${ALLOW_PARTIAL:-0}" == "1" ]]; then
    warn "token lacks the 'project' scope — project/field/item steps skipped."
    warn "grant it with 'gh auth refresh -s project', then re-run to finish."
    NO_PROJECT_SCOPE=1
  else
    die "token lacks the 'project' scope. Run:  gh auth refresh -s project"
  fi
fi
NO_PROJECT_SCOPE="${NO_PROJECT_SCOPE:-0}"

# ── 1. labels ───────────────────────────────────────────────────────────────
# Type/area labels only. Deliberately NOT created:
#   * 'feature'      — the repo already uses the default 'enhancement'; two labels, one meaning.
#   * 'priority:*'   — Priority is a Project FIELD (queryable); labels would duplicate it.
#   * 'phase:P_'     — Phase is a Project FIELD; CLAUDE.md's phase label convention was never
#                      actually implemented in this repo, so that stays a separate decision.
step "Labels"
add_label() { # name, color, description
  if gh label list --limit 100 --json name --jq '.[].name' | grep -qxF "$1"; then
    skip "label $1"
  else
    run gh label create "$1" --color "$2" --description "$3" >/dev/null && ok "label $1"
  fi
}
add_label frontend  1d76db "UI, components, storefront rendering"
add_label backend   0e8a16 "Server logic, repositories, features"
add_label database  5319e7 "Prisma schema, migrations, seed"
add_label api       fbca04 "Route handlers and API surface"
add_label testing   c2e0c6 "Tests and validation tooling"
add_label devops    b60205 "CI/CD, Cloudflare, Neon, secrets"

# ── 2. milestones = phases (1:1 with specs/roadmap.md) ──────────────────────
# Names are taken verbatim from the roadmap. No new taxonomy. Phases already
# closed are created AND closed, so the board reflects reality instead of
# implying six phases of pending work.
step "Milestones"
declare -a MILESTONES=(
  "M0 — Walking Skeleton|closed"
  "P0 — Foundation & scaffolding|closed"
  "P1 — Auth & accounts|closed"
  "P2 — Catalogue & browsing|closed"
  "P2.5 — Ratings, reviews & storefront visual design|closed"
  "P3 — Cart & checkout|open"
  "P4 — Orders & delivery status|open"
  "P5 — Loyalty & discounts|open"
  "P6 — Admin & staff panel|open"
  "P7 — Compliance & hardening|open"
  "P8 — Deployment & launch|open"
)
existing_ms="$(gh api "repos/${OWNER}/${REPO}/milestones?state=all&per_page=100" --jq '.[].title')"
for entry in "${MILESTONES[@]}"; do
  title="${entry%%|*}"; state="${entry##*|}"
  if grep -qxF "$title" <<<"$existing_ms"; then
    skip "milestone $title"
  else
    run gh api "repos/${OWNER}/${REPO}/milestones" -f title="$title" -f state="$state" \
      -f description="Phase tracked in specs/roadmap.md — scope lives there, not here." \
      >/dev/null && ok "milestone $title [$state]"
  fi
done

# Resolve a milestone title -> number (used when filing epics).
ms_number() {
  gh api "repos/${OWNER}/${REPO}/milestones?state=all&per_page=100" \
    --jq ".[] | select(.title==\"$1\") | .number"
}

# ── 3. phase epics (P3–P8) ──────────────────────────────────────────────────
# One epic per phase, per the rule: a phase stays a single epic until its spec
# exists. P3 is the active phase but has NO spec yet, so it is an epic too —
# decomposing it now would invent scope no requirements.md has defined (Gate 2).
# Epics LINK to their criteria; they never restate them.
step "Phase epics"
declare -a EPICS=(
  "P3 — Cart & checkout"
  "P4 — Orders & delivery status"
  "P5 — Loyalty & discounts"
  "P6 — Admin & staff panel"
  "P7 — Compliance & hardening"
  "P8 — Deployment & launch"
)
existing_titles="$(gh issue list --state all --limit 200 --json title --jq '.[].title')"
for title in "${EPICS[@]}"; do
  phase_id="${title%% *}"
  if grep -qxF "$title" <<<"$existing_titles"; then
    skip "epic $title"
    continue
  fi
  body=$(cat <<EOF
Umbrella issue for **${title}** — one epic per phase until that phase has a spec.

- **Scope & sequencing:** \`specs/roadmap.md\` (the single source — deliberately not restated here).
- **Acceptance criteria:** none yet; this phase has no spec. Once
  \`specs/<YYYY-MM-DD-${phase_id,,}-*>/\` exists, its \`validation.md\` **is** the acceptance
  criteria — link to it, never copy it.
- **On spec approval:** decompose this epic into slice issues and close it.

_Filed by \`scripts/provision-project.sh\`. The Project tracks status only; content stays in specs/._
EOF
)
  msnum="$(ms_number "$title")"
  # Built as an array: the milestone title contains spaces, so an unquoted
  # ${var:+...} expansion would word-split it into broken arguments.
  ms_args=(); [[ -n "$msnum" ]] && ms_args=(--milestone "$title")
  if [[ "$DRY_RUN" == "1" ]]; then
    echo "${c_skip}  DRY-RUN: create epic '$title' (milestone #${msnum:-?}, label enhancement)${c_off}"
  else
    gh issue create --title "$title" --body "$body" --label enhancement \
      ${ms_args[@]+"${ms_args[@]}"} >/dev/null && ok "epic $title"
  fi
done

# ── 4. the Project ──────────────────────────────────────────────────────────
step "Project"
if [[ "$NO_PROJECT_SCOPE" == "1" ]]; then
  warn "skipping project/fields/items — no 'project' scope."
else
  PROJ_NUM="$(gh project list --owner "$OWNER" --format json \
    --jq ".projects[] | select(.title==\"$PROJECT_TITLE\") | .number" 2>/dev/null || true)"
  if [[ -n "$PROJ_NUM" ]]; then
    skip "project '$PROJECT_TITLE' (#$PROJ_NUM)"
  elif [[ "$DRY_RUN" == "1" ]]; then
    echo "${c_skip}  DRY-RUN: create project '$PROJECT_TITLE'${c_off}"
  else
    gh project create --owner "$OWNER" --title "$PROJECT_TITLE" >/dev/null
    PROJ_NUM="$(gh project list --owner "$OWNER" --format json \
      --jq ".projects[] | select(.title==\"$PROJECT_TITLE\") | .number")"
    ok "project '$PROJECT_TITLE' (#$PROJ_NUM)"
  fi

  # ── 5. fields ─────────────────────────────────────────────────────────────
  # Status ships by default (Todo/In Progress/Done) and its options can only be
  # renamed in the UI — see the manual steps printed at the end. Phase/Priority/
  # Complexity are created here. No story points, no velocity: phases are the
  # iterations, and Validation is Gate 3 in gates.yml — not a board column.
  step "Fields"
  if [[ -n "${PROJ_NUM:-}" ]]; then
    field_exists() {
      gh project field-list "$PROJ_NUM" --owner "$OWNER" --format json \
        --jq '.fields[].name' 2>/dev/null | grep -qxF "$1"
    }
    add_field() { # name, comma-separated options
      if field_exists "$1"; then skip "field $1"; else
        run gh project field-create "$PROJ_NUM" --owner "$OWNER" --name "$1" \
          --data-type SINGLE_SELECT --single-select-options "$2" >/dev/null && ok "field $1"
      fi
    }
    add_field Phase      "M0,P0,P1,P2,P2.5,P3,P4,P5,P6,P7,P8"
    add_field Priority   "High,Medium,Low"
    add_field Complexity "S,M,L"
  fi

  # ── 6. items ──────────────────────────────────────────────────────────────
  # Adopt every open issue (the real in-flight work) plus the phase epics.
  # Guarded by content URL so re-runs never duplicate items.
  step "Items"
  if [[ -n "${PROJ_NUM:-}" ]]; then
    in_project="$(gh project item-list "$PROJ_NUM" --owner "$OWNER" --limit 200 --format json \
      --jq '.items[].content.url' 2>/dev/null || true)"
    while read -r url; do
      [[ -z "$url" ]] && continue
      if grep -qxF "$url" <<<"$in_project"; then
        skip "item $(basename "$url")"
      else
        run gh project item-add "$PROJ_NUM" --owner "$OWNER" --url "$url" >/dev/null \
          && ok "item $(basename "$url")"
      fi
    done < <(gh issue list --state open --limit 200 --json url --jq '.[].url')
  fi
fi

# ── manual steps (not exposed by the public Projects V2 API) ────────────────
step "Manual steps (~6 clicks, one time)"
cat <<'EOF'
  The public Projects V2 API exposes no mutations for built-in workflows or view
  creation, so these are UI-only. This script does not pretend otherwise.

  1. Status options — rename to:  Backlog · In Progress · In Review · Done
     (Project ▸ ⋯ ▸ Settings ▸ Status field)

  2. Workflows (Project ▸ ⋯ ▸ Workflows) — enable the built-ins:
       • Item added to project  -> set Status = Backlog
       • Item closed            -> set Status = Done
       • Auto-add to project    -> repo issues (optional)

  3. Views: Board (group by Status) · Roadmap (group by Phase) · Table (all).
     No insights view — insights lean paid on private repos.

  NOTE on "Done": issues here do NOT auto-close on merge, because PRs merge into
  `staging`, not the default branch. An issue closes when its work is promoted to
  `main` — so Done legitimately means "in production", and staging-merged work sits
  in In Review until promotion. This is the agreed semantics, not a bug.
EOF

step "Summary"
echo "  created: $created   already-present: $skipped"
[[ "$DRY_RUN" == "1" ]] && echo "  (dry run — nothing was mutated)"
echo
