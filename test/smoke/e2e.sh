#!/bin/bash
#
# e2e.sh — atomic E2E test runner for Reeve.
#
# Prerequisite: a Reeve daemon must already be running (REEVE_DIR-aware).
# This script only creates issues, polls results, and verifies outcomes.
#
# Usage:
#   ./test/smoke/e2e.sh <fixture.json>        Run a single fixture
#   ./test/smoke/e2e.sh happy                  Run all happy-path fixtures
#   ./test/smoke/e2e.sh review                 Run all review-rejection fixtures
#   ./test/smoke/e2e.sh all                    Run everything
#
# Env vars:
#   REEVE_DIR          Reeve home dir (default: ~/.reeve-test)
#   POLL_INTERVAL      Seconds between polls (default: 30)
#   TASK_TIMEOUT       Max seconds per fixture (default: 600)
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

export REEVE_DIR="${REEVE_DIR:-$HOME/.reeve-test}"
FIXTURE_DIR="$SCRIPT_DIR/fixtures"
LOG_DIR="$REEVE_DIR/test-logs"
RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)"
POLL_INTERVAL="${POLL_INTERVAL:-30}"
TASK_TIMEOUT="${TASK_TIMEOUT:-600}"

# ── Config ──

SETTINGS="$REEVE_DIR/settings.json"
if [ ! -f "$SETTINGS" ]; then
  echo "FATAL: $SETTINGS not found" >&2
  exit 1
fi
LINEAR_API_KEY="${LINEAR_API_KEY:-$(jq -r '.linearApiKey' "$SETTINGS")}"
LINEAR_PROJECT_SLUG="${LINEAR_PROJECT_SLUG:-$(jq -r '.projects[0].linear' "$SETTINGS")}"
DASHBOARD_PORT=$(jq -r '.dashboard.port // 14500' "$SETTINGS")
API="http://localhost:$DASHBOARD_PORT"

mkdir -p "$LOG_DIR"

# ── Logging ──

log() { printf '[%s] %s\n' "$(date -u +%H:%M:%S)" "$1" >&2; }

# ── Linear API ──

linear() {
  /usr/bin/curl -sf https://api.linear.app/graphql \
    -H "Content-Type: application/json" \
    -H "Authorization: $LINEAR_API_KEY" \
    -d "$1"
}

# Resolve once, cache in globals
resolve_linear_context() {
  local result
  result=$(linear '{"query":"query{projects(filter:{slugId:{eq:\"'"$LINEAR_PROJECT_SLUG"'\"}}){nodes{id teams{nodes{id key}}}}}"}')
  PROJECT_ID=$(echo "$result" | jq -r '.data.projects.nodes[0].id')
  TEAM_ID=$(echo "$result" | jq -r '.data.projects.nodes[0].teams.nodes[0].id')
  TEAM_KEY=$(echo "$result" | jq -r '.data.projects.nodes[0].teams.nodes[0].key')

  [ -n "$PROJECT_ID" ] && [ "$PROJECT_ID" != "null" ] || { log "FATAL: cannot resolve project $LINEAR_PROJECT_SLUG"; exit 1; }

  local states
  states=$(linear '{"query":"query{workflowStates(filter:{team:{key:{eq:\"'"$TEAM_KEY"'\"}}}){nodes{id name type}}}"}')
  TODO_STATE_ID=$(echo "$states" | jq -r '[.data.workflowStates.nodes[] | select(.type=="unstarted")] | sort_by(.name) | .[0].id')
  DONE_STATE_ID=$(echo "$states" | jq -r '[.data.workflowStates.nodes[] | select(.type=="completed")] | sort_by(.name) | .[0].id')
  CANCEL_STATE_ID=$(echo "$states" | jq -r '[.data.workflowStates.nodes[] | select(.type=="canceled")] | .[0].id')

  [ -n "$TODO_STATE_ID" ] && [ "$TODO_STATE_ID" != "null" ] || { log "FATAL: no unstarted state for team $TEAM_KEY"; exit 1; }
}

# Cancel any leftover [e2e] issues from crashed runs
purge_stale_issues() {
  local result
  result=$(linear '{"query":"query{issues(filter:{project:{slugId:{eq:\"'"$LINEAR_PROJECT_SLUG"'\"}},state:{type:{in:[\"unstarted\",\"started\"]}}},first:50){nodes{id identifier title}}}"}')
  local stale
  stale=$(echo "$result" | jq -r '.data.issues.nodes[] | select(.title | startswith("[e2e]")) | .id' 2>/dev/null)

  if [ -n "$stale" ]; then
    local count=0
    for id in $stale; do
      cancel_issue "$id"
      count=$((count + 1))
    done
    log "Purged $count stale [e2e] issue(s)"
  fi
}

create_issue() {
  local title="$1" desc="$2"

  local payload
  payload=$(jq -n \
    --arg teamId "$TEAM_ID" \
    --arg projectId "$PROJECT_ID" \
    --arg stateId "$TODO_STATE_ID" \
    --arg title "$title" \
    --arg desc "$desc" \
    '{query: "mutation($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { id identifier } } }", variables: {input: {teamId: $teamId, projectId: $projectId, stateId: $stateId, title: $title, description: $desc}}}')

  local result
  result=$(/usr/bin/curl -sf https://api.linear.app/graphql \
    -H "Content-Type: application/json" \
    -H "Authorization: $LINEAR_API_KEY" \
    -d "$payload")

  local ok id ident
  ok=$(echo "$result" | jq -r '.data.issueCreate.success')
  id=$(echo "$result" | jq -r '.data.issueCreate.issue.id')
  ident=$(echo "$result" | jq -r '.data.issueCreate.issue.identifier')

  [ "$ok" = "true" ] || return 1
  # Return "id ident" pair
  echo "$id $ident"
}

cancel_issue() {
  local issue_id="$1"
  if [ -n "$CANCEL_STATE_ID" ] && [ "$CANCEL_STATE_ID" != "null" ]; then
    linear "{\"query\":\"mutation{issueUpdate(id:\\\"$issue_id\\\",input:{stateId:\\\"$CANCEL_STATE_ID\\\"}){success}}\"}" > /dev/null 2>&1 || true
  fi
}

complete_issue() {
  local issue_id="$1"
  if [ -n "$DONE_STATE_ID" ] && [ "$DONE_STATE_ID" != "null" ]; then
    linear "{\"query\":\"mutation{issueUpdate(id:\\\"$issue_id\\\",input:{stateId:\\\"$DONE_STATE_ID\\\"}){success}}\"}" > /dev/null 2>&1 || true
  fi
}

# ── Daemon interaction ──

require_daemon() {
  /usr/bin/curl -sf "$API/api/status" > /dev/null 2>&1 || {
    log "FATAL: daemon not running at $API"
    log "Start it with: REEVE_DIR=$REEVE_DIR bun run src/cli/app.ts start"
    exit 1
  }
}

get_task() {
  /usr/bin/curl -sf "$API/api/tasks" 2>/dev/null \
    | jq ".[] | select(.identifier==\"$1\")" 2>/dev/null || echo ""
}

# ── Fixture runner (atomic unit) ──

run_fixture() {
  local file="$1"
  local name mode title prompt expect_verdict fixture_timeout
  name=$(jq -r '.name' "$file")
  mode=$(jq -r '.mode' "$file")
  title=$(jq -r '.title' "$file")
  prompt=$(jq -r '.prompt' "$file")
  expect_verdict=$(jq -r '.expect.verdict' "$file")
  fixture_timeout=$(jq -r '.timeout // empty' "$file")
  fixture_timeout="${fixture_timeout:-$TASK_TIMEOUT}"

  local fixture_log="$LOG_DIR/$RUN_ID-$name.log"

  log "── $name ($mode) ──"
  log "  expect: verdict=$expect_verdict"

  # Log header
  {
    echo "=== Fixture: $name ==="
    echo "Mode:     $mode"
    echo "Title:    $title"
    echo "Expected: verdict=$expect_verdict"
    echo "Started:  $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo ""
  } > "$fixture_log"

  # Create issue
  local pair issue_id identifier
  pair=$(create_issue "[e2e] $title" "$prompt") || {
    log "  ERROR: failed to create Linear issue"
    echo "Result: ERROR (issue creation failed)" >> "$fixture_log"
    echo "ERROR"
    return 0
  }
  issue_id="${pair%% *}"
  identifier="${pair##* }"
  log "  created: $identifier"

  # Poll until done or timeout
  local elapsed=0 state="unknown" approved=false
  while [ "$elapsed" -lt "$fixture_timeout" ]; do
    local task
    task=$(get_task "$identifier")
    state=$(echo "$task" | jq -r '.state // "unknown"' 2>/dev/null || echo "unknown")
    local pr=$(echo "$task" | jq -r '.prUrl // empty' 2>/dev/null)
    printf '  [%ds] state=%s\n' "$elapsed" "$state" >> "$fixture_log"
    [ "$state" = "done" ] && break

    # Auto-approve: when a happy-path fixture reaches published with a PR,
    # move the Linear issue to Done so the kernel transitions published → done(merged)
    if [ "$state" = "published" ] && [ -n "$pr" ] && [ "$expect_verdict" = "PASS" ] && [ "$approved" = "false" ]; then
      log "  auto-approving $identifier (published + PR detected)"
      complete_issue "$issue_id"
      approved=true
    fi

    sleep "$POLL_INTERVAL"
    elapsed=$((elapsed + POLL_INTERVAL))
  done

  # Evaluate
  local task_detail done_reason result
  task_detail=$(get_task "$identifier")
  done_reason=$(echo "$task_detail" | jq -r '.doneReason // "unknown"' 2>/dev/null)
  local pr_url
  pr_url=$(echo "$task_detail" | jq -r '.prUrl // empty' 2>/dev/null)

  local retry_count
  retry_count=$(echo "$task_detail" | jq -r '.retryCount // 0' 2>/dev/null)
  retry_count="${retry_count:-0}"

  if [ "$state" != "done" ]; then
    result="TIMEOUT"
    log "  TIMEOUT after ${fixture_timeout}s (last state: $state)"
  elif [ "$expect_verdict" = "PASS" ] && [ "$done_reason" = "merged" ]; then
    result="PASS"
    log "  PASS (merged)"
  elif [ "$expect_verdict" = "FAIL" ] && [ "$done_reason" = "failed" ]; then
    result="PASS"
    log "  PASS (correctly rejected)"
  else
    result="FAIL"
    log "  FAIL (expected=$expect_verdict got=$done_reason)"
  fi

  # Review-mode fixtures must have retried at least once
  if [ "$result" = "PASS" ] && [ "$mode" = "review" ] && [ "$retry_count" -lt 1 ]; then
    result="FAIL"
    log "  FAIL (review fixture expected retryCount>=1 but got $retry_count)"
  fi

  # Log details
  {
    echo ""
    echo "=== Result ==="
    echo "Result:     $result"
    echo "State:      $state"
    echo "DoneReason: $done_reason"
    echo "Elapsed:    ${elapsed}s"
    echo "Finished:   $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo ""
    echo "=== Task Detail ==="
    echo "$task_detail" | jq . 2>/dev/null || echo "$task_detail"
  } >> "$fixture_log"

  # Cleanup: cancel Linear issue + close PR + delete remote branch
  cancel_issue "$issue_id"
  if [ -n "$pr_url" ]; then
    local pr_number repo
    pr_number=$(echo "$pr_url" | grep -o '[0-9]*$')
    repo=$(echo "$pr_url" | sed 's|https://github.com/||;s|/pull/.*||')
    if [ -n "$pr_number" ] && [ -n "$repo" ]; then
      gh pr close "$pr_number" --repo "$repo" --delete-branch 2>/dev/null || true
    fi
  fi
  log "  cleaned up $identifier"

  echo "$result"
}

# ── Collect fixtures ──

collect_fixtures() {
  local filter="$1"
  if [ -f "$filter" ]; then
    echo "$filter"
  elif [ "$filter" = "all" ]; then
    find "$FIXTURE_DIR" -name '*.json' | sort
  elif [ "$filter" = "happy" ]; then
    find "$FIXTURE_DIR" -name 'happy-*.json' | sort
  elif [ "$filter" = "review" ]; then
    find "$FIXTURE_DIR" -name 'review-*.json' | sort
  else
    echo "Usage: $0 [all|happy|review|<fixture.json>]" >&2
    exit 1
  fi
}

# ── Main ──

FILTER="${1:-all}"
fixtures=$(collect_fixtures "$FILTER")
count=$(echo "$fixtures" | wc -l | tr -d ' ')

log "REEVE_DIR=$REEVE_DIR"
log "E2E run $RUN_ID — $count fixture(s), filter=$FILTER"
log ""

require_daemon
resolve_linear_context
purge_stale_issues

pass=0 fail=0 error=0

for f in $fixtures; do
  result=$(run_fixture "$f")
  case "$result" in
    PASS)    pass=$((pass + 1)) ;;
    ERROR)   error=$((error + 1)) ;;
    *)       fail=$((fail + 1)) ;;
  esac
done

log ""
log "── Summary ──"
log "  pass=$pass fail=$fail error=$error"
log "  logs: $LOG_DIR/$RUN_ID-*.log"

[ "$fail" -gt 0 ] || [ "$error" -gt 0 ] && exit 1
exit 0
