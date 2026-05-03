#!/usr/bin/env bash
set -euo pipefail

# EMS-54: scan the api_data Docker volume for stale recovery / fix artifacts.
#
# Background: on 2026-04-09 a recovery procedure left a 20GB
# 'edge-monitoring-recovered.db' file inside the api_data volume. It sat
# untouched for ~3 weeks until 2026-05-03 when it filled the 38GB host disk
# and caused the EMS-53 outage. This script finds files matching the
# usual recovery / repair naming patterns so we never miss one again.
#
# DEFAULT MODE: report only. Lists files + sizes + ages. NEVER deletes.
# WITH --apply: deletes after lsof-checking that no process holds the file,
#   and only when run as root. NEVER deletes the live DB or branding/.
#
# Hard exclusions (EMS-54 constraints — must NEVER be touched):
#   - edge-monitoring.db
#   - edge-monitoring.db-shm
#   - edge-monitoring.db-wal
#   - anything under branding/
#
# Usage:
#   ./scripts/cleanup-orphan-db-files.sh                # report only
#   sudo ./scripts/cleanup-orphan-db-files.sh --apply   # delete unheld orphans

VOLUME_DATA_DIR="${VOLUME_DATA_DIR:-/var/lib/docker/volumes/edge-monitoring_api_data/_data}"
APPLY=0

while [ $# -gt 0 ]; do
  case "$1" in
    --apply) APPLY=1 ;;
    --volume-dir) VOLUME_DATA_DIR="${2:-}"; shift ;;
    -h|--help)
      sed -n '3,30p' "$0"
      exit 0
      ;;
    *)
      echo "ERROR: unknown argument: $1" >&2
      exit 2
      ;;
  esac
  shift
done

if [ "$APPLY" -eq 1 ] && [ "$(id -u)" -ne 0 ]; then
  echo "ERROR: --apply requires root (need to inspect /var/lib/docker)" >&2
  exit 1
fi

if [ ! -d "$VOLUME_DATA_DIR" ]; then
  echo "ERROR: volume data dir not found: $VOLUME_DATA_DIR" >&2
  echo "Override with --volume-dir <path> if Docker is configured differently." >&2
  exit 1
fi

if [ "$APPLY" -eq 1 ] && ! command -v lsof >/dev/null 2>&1; then
  echo "ERROR: lsof not installed — required for --apply (sanity check that no process is using the file)" >&2
  exit 1
fi

# Patterns that match the kinds of artifact past recoveries / repairs left behind.
# Anchored to filename (not path) — applied via -name so subdirs are scoped by -path excludes.
ORPHAN_PATTERNS=(
  "*-recovered.db"
  "*-recovered.db-*"
  "*-fixed.db"
  "*-fixed.db-*"
  "*-backup.db"
  "*-backup.db-*"
  "*.db.bak"
  "*.db.old"
  "*-pre-vacuum.db"
  "*-pre-vacuum.db-*"
  "edge-monitoring.db.recovered*"
)

# Files we must NEVER touch — exact filename match in the volume root.
PROTECTED=(
  "edge-monitoring.db"
  "edge-monitoring.db-shm"
  "edge-monitoring.db-wal"
)

is_protected() {
  local base
  base="$(basename "$1")"
  for p in "${PROTECTED[@]}"; do
    if [ "$base" = "$p" ]; then
      return 0
    fi
  done
  # Anything under branding/ at any depth is off-limits — that's user-uploaded
  # logo / favicon assets owned by the API.
  case "$1" in
    "$VOLUME_DATA_DIR/branding/"*) return 0 ;;
  esac
  return 1
}

human_size() {
  # POSIX-portable: prefer numfmt if present, otherwise du -h.
  if command -v numfmt >/dev/null 2>&1; then
    numfmt --to=iec --suffix=B "$1"
  else
    awk -v b="$1" 'BEGIN{
      s="BKMGTP"; i=1;
      while (b>=1024 && i<6) { b=b/1024; i++ }
      printf "%.1f%sB", b, substr(s,i,1)
    }'
  fi
}

age_days() {
  # mtime epoch -> integer days since modification.
  local mtime now
  mtime="$(stat -c %Y "$1" 2>/dev/null || stat -f %m "$1" 2>/dev/null)"
  now="$(date +%s)"
  echo $(( (now - mtime) / 86400 ))
}

echo "=== EMS-54 orphan DB cleanup ==="
echo "Volume:    $VOLUME_DATA_DIR"
echo "Mode:      $([ "$APPLY" -eq 1 ] && echo APPLY '(will delete unheld orphans)' || echo REPORT '(no deletions)')"
echo

# Build the find arguments: a series of -name "<pattern>" predicates ORed
# together inside a single grouped expression. We exclude the branding/ tree
# via -path so user-uploaded assets are never even listed as candidates.
find_args=( "$VOLUME_DATA_DIR" -maxdepth 2 -type f
            -not -path "$VOLUME_DATA_DIR/branding/*"
            \( )
first=1
for pat in "${ORPHAN_PATTERNS[@]}"; do
  if [ $first -eq 1 ]; then
    find_args+=( -name "$pat" )
    first=0
  else
    find_args+=( -o -name "$pat" )
  fi
done
find_args+=( \) -print0 )

# Collect candidate files. -print0 + read -d '' handles spaces / newlines.
CANDIDATES=()
while IFS= read -r -d '' f; do
  CANDIDATES+=("$f")
done < <(find "${find_args[@]}")

if [ "${#CANDIDATES[@]}" -eq 0 ]; then
  echo "No orphan files found. Volume looks clean."
  exit 0
fi

total_size=0
deleted_count=0
deleted_size=0
skipped_count=0

for f in "${CANDIDATES[@]}"; do
  if is_protected "$f"; then
    # Should never happen given the patterns, but the guard is the point.
    echo "PROTECTED skip: $f"
    continue
  fi

  size_bytes="$(stat -c %s "$f" 2>/dev/null || stat -f %z "$f")"
  total_size=$(( total_size + size_bytes ))
  age="$(age_days "$f")"
  printf '  %s  %s  age=%sd  %s\n' "$(human_size "$size_bytes")" "$(date -r "$f" '+%Y-%m-%d' 2>/dev/null || echo '?')" "$age" "$f"

  if [ "$APPLY" -eq 1 ]; then
    # lsof returns 0 if anything has the file open. We refuse to delete in
    # that case — better to leave 20GB on disk than to corrupt a live recovery.
    if lsof -- "$f" >/dev/null 2>&1; then
      echo "    SKIP: file is currently open by a process — not deleting"
      skipped_count=$(( skipped_count + 1 ))
      continue
    fi
    rm -f -- "$f"
    deleted_count=$(( deleted_count + 1 ))
    deleted_size=$(( deleted_size + size_bytes ))
    echo "    DELETED"
  fi
done

echo
echo "=== Summary ==="
echo "Candidates found: ${#CANDIDATES[@]} ($(human_size "$total_size") total)"
if [ "$APPLY" -eq 1 ]; then
  echo "Deleted:          $deleted_count ($(human_size "$deleted_size"))"
  echo "Skipped (in-use): $skipped_count"
else
  echo "Mode was REPORT — nothing was deleted."
  echo "Re-run with sudo and --apply to delete unheld orphans."
fi
