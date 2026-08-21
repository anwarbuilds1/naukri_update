#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
repo_dir="$(cd -- "$script_dir/.." && pwd -P)"
cdp_endpoint="http://127.0.0.1:9222"
hourly_log="$repo_dir/naukri-hourly-refresh.log"
monitor_log="$repo_dir/naukri-monitor.log"
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
  local message
  message="[$(date '+%Y-%m-%d %H:%M:%S %Z')] $*"
  printf '%s\n' "$message" >> "$hourly_log"
  printf '%s\n' "$message" >> "$monitor_log"
}

run_logged() {
  "$@" 2>&1 | tee -a "$hourly_log" "$monitor_log"
}

on_exit() {
  local exit_code="$?"
  if [[ "$exit_code" -eq 0 ]]; then
    log 'RUN STATUS: SUCCESS'
  else
    log "RUN STATUS: FAILED (exit code $exit_code)"
  fi
}
trap on_exit EXIT

log "RUN START: runner launched (repo=$repo_dir, display=${DISPLAY:-unset})"

curl_bin="$(command -v curl || true)"
if [[ -z "$curl_bin" ]]; then
  log 'ERROR: curl is required to check the local Chrome CDP endpoint.'
  exit 1
fi

is_node_version_supported() {
  local binary="$1"
  if [[ ! -x "$binary" ]]; then
    return 1
  fi
  local version
  version=$("$binary" -v 2>/dev/null | tr -d 'v' || true)
  if [[ -z "$version" ]]; then
    return 1
  fi
  local major
  major=$(echo "$version" | cut -d. -f1)
  if [[ "$major" -ge 20 ]]; then
    return 0
  fi
  return 1
}

node_bin=""
default_node="$(command -v node || true)"
if [[ -n "$default_node" ]] && is_node_version_supported "$default_node"; then
  node_bin="$default_node"
fi

if [[ -z "$node_bin" ]]; then
  for candidate in "$HOME"/.nvm/versions/node/*/bin/node /usr/local/bin/node /usr/bin/node; do
    if is_node_version_supported "$candidate"; then
      node_bin="$candidate"
      break
    fi
  done
fi

if [[ -z "$node_bin" ]]; then
  log "ERROR: Node.js 20 or higher is required but was not found. Please install a compatible Node.js version."
  exit 1
fi

if ! command -v flock >/dev/null 2>&1; then
  log 'ERROR: flock is required to prevent overlapping refresh runs.'
  exit 1
fi
exec 9>"$lock_file"
if ! flock -n 9; then
  log 'A previous refresh is still running; skipping this run.'
  exit 0
fi

# Validate scheduling configuration first (silent check)
if ! "$node_bin" "$repo_dir/scripts/scheduler.js" --validate >/dev/null 2>&1; then
  log 'ERROR: Scheduling configuration validation failed.'
  exit 1
fi
log 'Configuration validation succeeded.'

# Check tasks
run_headline=false
if "$node_bin" "$repo_dir/scripts/scheduler.js" --should-refresh >/dev/null 2>&1; then
  run_headline=true
fi

run_resume=false
if "$node_bin" "$repo_dir/scripts/scheduler.js" --should-upload-resume >/dev/null 2>&1; then
  run_resume=true
fi

if [[ "$run_headline" == "false" && "$run_resume" == "false" ]]; then
  log 'No task is due; skipping Chrome startup.'
  exit 0
fi

log "Tasks due: headline=$run_headline, resume=$run_resume"

# Print run start marker and rotate logs to keep only last 5 runs
echo "=== RUN START ===" >> "$hourly_log"
"$node_bin" "$repo_dir/scripts/scheduler.js" --rotate-logs "$hourly_log" >> "$hourly_log" 2>&1 || true

echo "=== RUN START ===" >> "$repo_dir/naukri-refresh.log"
"$node_bin" "$repo_dir/scripts/scheduler.js" --rotate-logs "$repo_dir/naukri-refresh.log" >> "$hourly_log" 2>&1 || true

echo "=== RUN START ===" >> "$monitor_log"
"$node_bin" "$repo_dir/scripts/scheduler.js" --rotate-logs "$monitor_log" >> "$monitor_log" 2>&1 || true

# Log active configuration and state context at the start of this execution
"$node_bin" "$repo_dir/scripts/scheduler.js" --validate >> "$hourly_log" 2>&1 || true

cdp_ready() {
  "$curl_bin" --silent --show-error --fail --max-time 2 "$cdp_endpoint/json/version" >/dev/null 2>&1
}

cd "$repo_dir"

if ! cdp_ready; then
  log 'Dedicated Naukri Chrome CDP is unavailable; starting the dedicated Chrome profile.'
  nohup "$repo_dir/scripts/start-naukri-chrome.sh" >> "$hourly_log" 2>&1 < /dev/null 9>&- &

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

if [[ "$run_headline" == "true" ]]; then
  log 'Starting Naukri headline refresh.'
  if run_logged "$node_bin" "$repo_dir/naukri-profile-refresh.js" --refresh-headline; then
    log 'Naukri headline refresh completed.'
    run_logged "$node_bin" "$repo_dir/scripts/scheduler.js" --update-refresh-time
  else
    log 'ERROR: Naukri headline refresh failed.'
    exit 1
  fi
fi

if [[ "$run_resume" == "true" ]]; then
  log 'Starting Naukri resume upload.'
  if run_logged "$node_bin" "$repo_dir/naukri-profile-refresh.js" --upload-resume; then
    log 'Naukri resume upload completed.'
    run_logged "$node_bin" "$repo_dir/scripts/scheduler.js" --update-resume-time
  else
    log 'ERROR: Naukri resume upload failed.'
    exit 1
  fi
fi
