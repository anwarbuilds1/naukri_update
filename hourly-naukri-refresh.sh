#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
cdp_endpoint="http://127.0.0.1:9222"
hourly_log="$repo_dir/naukri-hourly-refresh.log"
lock_file="$repo_dir/.naukri-hourly-refresh.lock"
user_id="$(id -u)"

# Cron does not inherit the desktop session variables needed to open Chrome.
# These defaults match the active Linux graphical session and are used only
# when this job has to start the dedicated Chrome profile itself.
export DISPLAY="${DISPLAY:-:1}"
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$user_id}"
if [[ -z "${XAUTHORITY:-}" && -r "$XDG_RUNTIME_DIR/gdm/Xauthority" ]]; then
  export XAUTHORITY="$XDG_RUNTIME_DIR/gdm/Xauthority"
fi

log() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S %Z')" "$*" >> "$hourly_log"
}

curl_bin="$(command -v curl || true)"
if [[ -z "$curl_bin" ]]; then
  log 'ERROR: curl is required to check the local Chrome CDP endpoint.'
  exit 1
fi

node_bin="$(command -v node || true)"
if [[ -z "$node_bin" ]]; then
  for candidate in "$HOME"/.nvm/versions/node/*/bin/node /usr/local/bin/node /usr/bin/node; do
    if [[ -x "$candidate" ]]; then
      node_bin="$candidate"
      break
    fi
  done
fi
if [[ -z "$node_bin" ]]; then
  log 'ERROR: Node.js was not found.'
  exit 1
fi

if ! command -v flock >/dev/null 2>&1; then
  log 'ERROR: flock is required to prevent overlapping refresh runs.'
  exit 1
fi
exec 9>"$lock_file"
if ! flock -n 9; then
  log 'A previous hourly refresh is still running; skipping this run.'
  exit 0
fi

cdp_ready() {
  "$curl_bin" --silent --show-error --fail --max-time 2 "$cdp_endpoint/json/version" >/dev/null 2>&1
}

cd "$repo_dir"

if ! cdp_ready; then
  log 'Dedicated Naukri Chrome CDP is unavailable; starting the dedicated Chrome profile.'
  nohup "$repo_dir/start-naukri-chrome.sh" >> "$hourly_log" 2>&1 < /dev/null &

  for ((attempt = 1; attempt <= 30; attempt++)); do
    if cdp_ready; then
      log 'Dedicated Naukri Chrome CDP is ready.'
      break
    fi
    sleep 1
  done

  if ! cdp_ready; then
    log 'ERROR: Dedicated Naukri Chrome did not expose CDP on 127.0.0.1:9222 within 30 seconds.'
    exit 1
  fi
else
  log 'Dedicated Naukri Chrome CDP is already available.'
fi

log 'Starting Naukri headline refresh.'
if "$node_bin" "$repo_dir/naukri-profile-refresh.js" >> "$hourly_log" 2>&1; then
  log 'Naukri headline refresh completed.'
else
  log 'ERROR: Naukri headline refresh failed. Complete any required native Naukri verification in the dedicated Chrome window, then retry.'
  exit 1
fi
