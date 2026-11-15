#!/usr/bin/env bash
# Installs a .env file that a deploy generated from the repo's GitHub "production" environment.
#   install-env.sh <new file> <target .env> <required keys...>
# Refuses (and fails the deploy) if a required key is missing or empty, so a half-configured
# environment can never replace working settings. Keeps the previous file as <target>.bak and
# prints only the names of settings that changed, never values.
set -euo pipefail
new="$1"; target="$2"; shift 2
[ -s "$new" ] || { echo "settings: none sent; keeping the current file"; exit 0; }
for k in "$@"; do
  grep -qE "^$k=.+" "$new" || { echo "settings: $k is missing or empty in the GitHub environment; deploy stopped, current settings kept" >&2; exit 1; }
done
if [ -f "$target" ] && cmp -s "$new" <(sort "$target"); then echo "settings: unchanged"; rm -f "$new"; exit 0; fi
if [ -f "$target" ]; then
  changed=$(diff <(sort "$target") "$new" | grep -E '^[<>] [A-Z_]+=' | sed -E 's/^[<>] ([A-Z_]+)=.*/\1/' | sort -u | tr '\n' ' ' || true)
  echo "settings changed: ${changed:-(order only)}"
  cp -p "$target" "$target.bak"
fi
install -m 600 "$new" "$target"
rm -f "$new"
