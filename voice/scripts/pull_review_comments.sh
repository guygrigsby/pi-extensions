#!/usr/bin/env bash
# Pull GitHub PR review and conversation comments authored by a given user,
# write JSONL into the voice corpus.
#
# Usage:    bash pull_review_comments.sh <github_user> [exclude_repo_regex]
# Example:  bash pull_review_comments.sh alice
#           bash pull_review_comments.sh alice 'alice/(toy-app|prototype-x)'
#
# Output:   $VOICE_HOME/corpus/github_prs/review_comments.jsonl
#
# Each row is tagged with `kind`:
#   "pulls"  = inline code-review comment (terse-technical register)
#   "issues" = PR conversation comment (discussion register)
#
# Filters:
#  - keep only comments where user.login == <github_user>
#  - drop bodies < 30 chars
#  - drop one-line acks (LGTM, ok, thanks, done, 👍, 🚀, sounds good)
#  - skip personal-agentic repos via the exclude_repo_regex arg
#
# Requires: gh CLI (authenticated; for private-org repos with SAML SSO, run
# `gh auth refresh -h github.com -s repo,read:org` and authorize for the org).

set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "usage: $0 <github_user> [exclude_repo_regex]" >&2
  exit 2
fi

USER=$1
EXCLUDE=${2:-^$}     # default: regex matching nothing
HOME_DIR=${VOICE_HOME:-$HOME/.claude/voice}
OUT_DIR=$HOME_DIR/corpus/github_prs
mkdir -p "$OUT_DIR"

OUT=$OUT_DIR/review_comments.jsonl
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

echo "[1/3] Searching for PRs $USER has commented on..." >&2
gh search prs --commenter="$USER" --state=open   --limit=1000 --json url,repository,number,createdAt >"$TMP/open.json"
gh search prs --commenter="$USER" --state=closed --limit=1000 --json url,repository,number,createdAt >"$TMP/closed.json"
jq -s '.[0] + .[1] | unique_by(.url)' "$TMP/open.json" "$TMP/closed.json" >"$TMP/prs.json"
TOTAL=$(jq length "$TMP/prs.json")
echo "    found $TOTAL PRs" >&2

echo "[2/3] Fetching comments..." >&2
: >"$OUT"
COUNT=0
jq -r '.[] | [.repository.nameWithOwner, (.number|tostring)] | @tsv' "$TMP/prs.json" | \
while IFS=$'\t' read -r repo num; do
  COUNT=$((COUNT+1))
  if [[ "$repo" =~ $EXCLUDE ]]; then continue; fi
  printf "    [%d/%d] %s#%s\r" "$COUNT" "$TOTAL" "$repo" "$num" >&2
  for kind in pulls issues; do
    gh api --paginate "repos/$repo/$kind/$num/comments" 2>/dev/null | \
      jq -c --arg repo "$repo" --arg num "$num" --arg kind "$kind" \
        --arg user "$USER" '
        (if type == "array" then . else [] end)[]
        | select(type == "object" and (.user.login // "") == $user)
        | select((.body // "") | length > 30)
        | select((.body // "") | test("^\\s*(lgtm|ok|thanks|thx|done|sounds good|👍|🚀|✅)\\W*\\s*$"; "i") | not)
        | {repo: $repo, pr: ($num|tonumber), kind: $kind,
           created: .created_at, url: .html_url, body: .body,
           in_reply_to: (.in_reply_to_id // null),
           path: (.path // null), line: (.line // null)}
      ' 2>/dev/null >>"$OUT" || true
  done
done
echo >&2

LINES=$(wc -l <"$OUT" | tr -d ' ')
echo "[3/3] Saved $LINES comments to $OUT" >&2
echo >&2
echo "By kind:" >&2
jq -r '.kind' "$OUT" 2>/dev/null | sort | uniq -c >&2 || true
echo >&2
echo "Top 10 repos:" >&2
jq -r '.repo' "$OUT" 2>/dev/null | sort | uniq -c | sort -rn | head -10 >&2 || true
