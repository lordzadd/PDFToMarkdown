#!/usr/bin/env bash
set -euo pipefail

START_COMMIT="${1:-c447d32}"
END_REF="${2:-HEAD}"

if ! git cat-file -e "${START_COMMIT}^{commit}" >/dev/null 2>&1; then
  START_COMMIT="$(git rev-list --max-parents=0 HEAD)"
fi

RANGE="${START_COMMIT}..${END_REF}"
DATE_UTC="$(date -u +"%Y-%m-%d %H:%M UTC")"
TAG_NAME="${GITHUB_REF_NAME:-manual}"

TOTAL_COMMITS="$(git rev-list --count "$RANGE")"
DIFF_STAT="$(git diff --shortstat "$RANGE" || true)"

cat <<NOTES
# Tingyun Snipping Tool ${TAG_NAME}

Generated: ${DATE_UTC}

## Summary Since Project Start
- Baseline commit: ${START_COMMIT}
- End ref: ${END_REF}
- Total commits: ${TOTAL_COMMITS}
- Diff stat: ${DIFF_STAT:-n/a}

## Full Commit Changelog
NOTES

git log --reverse --pretty=format:'- %h %s (%an, %ad)' --date=short "$RANGE"
