#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
profile_dir="$repo_dir/.naukri-chrome-profile"
profile_url="https://www.naukri.com/mnjuser/profile"

if [[ "${1:-}" == "--help" ]]; then
  echo "Usage: ./start-naukri-chrome.sh"
  echo "Starts dedicated Chrome with CDP bound to 127.0.0.1:9222."
  exit 0
fi

chrome=""
for candidate in google-chrome google-chrome-stable; do
  if command -v "$candidate" >/dev/null 2>&1; then
    chrome="$(command -v "$candidate")"
    break
  fi
done

if [[ -z "$chrome" ]]; then
  echo "Google Chrome was not found. Install it or add google-chrome to PATH." >&2
  exit 1
fi

if [[ -e "$profile_dir/SingletonLock" || -L "$profile_dir/SingletonLock" ]]; then
  echo "The dedicated Naukri Chrome profile is already in use. Close that Chrome window, then run ./start-naukri-chrome.sh again." >&2
  exit 1
fi

mkdir -p "$profile_dir"
exec "$chrome" \
  --remote-debugging-address=127.0.0.1 \
  --remote-debugging-port=9222 \
  --user-data-dir="$profile_dir" \
  "$profile_url"
