#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
repo_dir="$(cd -- "$script_dir/.." && pwd -P)"
env_file="$repo_dir/.env"
hourly_log="$repo_dir/naukri-hourly-refresh.log"

if [[ ! -f "$env_file" ]]; then
  echo "ERROR: .env file not found. Copy .env.example to .env and configure it first." >&2
  exit 1
fi

log() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S %Z')" "$*" >> "$hourly_log"
}

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

# Resolve Node.js v20+
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
  echo "ERROR: Node.js 20 or higher is required but was not found. Please install a compatible Node.js version." >&2
  exit 1
fi

# Validate scheduling configuration
echo "Validating scheduling configuration..."
if ! "$node_bin" "$repo_dir/scripts/scheduler.js" --validate; then
  echo "ERROR: Scheduling configuration in .env is invalid. See errors above." >&2
  exit 1
fi

cron_schedule="* * * * *"
runner_path="$repo_dir/scripts/naukri-refresh-runner.sh"

echo "Installing cron job with schedule: $cron_schedule"
echo "Target runner path: $runner_path"

# Make sure the runner script is executable
chmod +x "$runner_path"

# Clean old runner entries and write new one
(crontab -l 2>/dev/null | grep -E -v "naukri-refresh-runner.sh|hourly-naukri-refresh.sh" || true; echo "$cron_schedule $runner_path") | crontab -

echo "SUCCESS: Cron job successfully configured to check schedule every minute."
