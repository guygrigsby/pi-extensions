#!/usr/bin/env bash
# Pull GitHub PR descriptions authored by a given user, write JSONL into the
# voice corpus. Filters bodies < 100 chars and AI-co-authored content.
#
# Usage:    bash pull_pr_descriptions.sh <github_user> [exclude_repo_pattern]
# Example:  bash pull_pr_descriptions.sh alice
#           bash pull_pr_descriptions.sh alice 'alice/(toy-app|prototype-x)'
#
# Output:   $VOICE_HOME/corpus/github_prs/pr_descriptions.jsonl
#           $VOICE_HOME/corpus/github_prs/pr_descriptions_pure.jsonl   (no agent footer, body > 100)
#           $VOICE_HOME/corpus/github_prs/pr_descriptions_assisted.jsonl
#
# Requires: gh CLI (authenticated), jq.

set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "usage: $0 <github_user> [exclude_repo_regex]" >&2
  exit 2
fi

USER=$1
EXCLUDE=${2:-}
HOME_DIR=${VOICE_HOME:-$HOME/.claude/voice}
OUT_DIR=$HOME_DIR/corpus/github_prs
mkdir -p "$OUT_DIR"

ALL=$OUT_DIR/pr_descriptions.jsonl
PURE=$OUT_DIR/pr_descriptions_pure.jsonl
ASSISTED=$OUT_DIR/pr_descriptions_assisted.jsonl

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

echo "[1/3] Searching PRs by $USER..." >&2
gh search prs --author="$USER" --state=open   --limit=1000 --json url,title,repository,createdAt,state,body >"$TMP/open.json"
gh search prs --author="$USER" --state=closed --limit=1000 --json url,title,repository,createdAt,state,body >"$TMP/closed.json"
jq -s '.[0] + .[1] | unique_by(.url)' "$TMP/open.json" "$TMP/closed.json" >"$TMP/all.json"

TOTAL=$(jq length "$TMP/all.json")
echo "    found $TOTAL PRs" >&2

echo "[2/3] Filtering and writing JSONL..." >&2

JQ_FILTER='
  .[]
  | select((.body // "") | length > 100)
  | (if (.repository.nameWithOwner | test($exclude)) then empty else . end)
  | {url, title, repo: .repository.nameWithOwner, created: .createdAt, state, body}
'

if [[ -n "$EXCLUDE" ]]; then
  jq -c --arg exclude "$EXCLUDE" "$JQ_FILTER" "$TMP/all.json" >"$ALL"
else
  jq -c --arg exclude "^$" "$JQ_FILTER" "$TMP/all.json" >"$ALL"
fi

jq -c 'select(.body | test("Generated with .*(Claude Code|Cursor|Copilot)"; "i") | not)' "$ALL" >"$PURE"
jq -c 'select(.body | test("Generated with .*(Claude Code|Cursor|Copilot)"; "i"))'        "$ALL" >"$ASSISTED"

ALL_N=$(wc -l <"$ALL" | tr -d ' ')
PURE_N=$(wc -l <"$PURE" | tr -d ' ')
ASSISTED_N=$(wc -l <"$ASSISTED" | tr -d ' ')

echo "[3/3] Wrote:" >&2
echo "    $ALL  ($ALL_N rows)" >&2
echo "    $PURE  ($PURE_N rows; no AI footer)" >&2
echo "    $ASSISTED  ($ASSISTED_N rows; agent-co-authored)" >&2
echo >&2
echo "Note: even rows in pr_descriptions_pure.jsonl can be agent-co-authored if no footer was added." >&2
echo "Inspect by repo. Recent personal-repo PRs with heavy structural sections (## Summary / ## Test plan / acceptance criteria) are likely agent-mediated." >&2
