#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
repo_dir="$(cd -- "$script_dir/.." && pwd -P)"
env_file="$repo_dir/.env"

if [[ ! -f "$env_file" ]]; then
  echo "ERROR: .env file not found. Copy .env.example to .env and configure it first." >&2
  exit 1
fi

# Load REFRESH_INTERVAL_HOURS from .env
interval=$(grep -E "^REFRESH_INTERVAL_HOURS=" "$env_file" | cut -d'=' -f2 | tr -d ' "' || true)
interval="${interval:-1}"

# Validate it is an integer
if ! [[ "$interval" =~ ^[0-9]+$ ]]; then
  echo "ERROR: REFRESH_INTERVAL_HOURS must be a positive integer." >&2
  exit 1
fi

# Validate it is one of the supported intervals that divide 24 evenly
case "$interval" in
  1|2|3|4|6|8|12|24)
    ;;
  *)
    echo "ERROR: REFRESH_INTERVAL_HOURS must be one of: 1, 2, 3, 4, 6, 8, 12, 24." >&2
    echo "Cron scheduler only supports intervals that divide 24 evenly to prevent daily reset misalignment." >&2
    exit 1
    ;;
esac

# Generate cron schedule
if [[ "$interval" -eq 24 ]]; then
  cron_schedule="0 0 * * *"
elif [[ "$interval" -eq 1 ]]; then
  cron_schedule="0 * * * *"
else
  cron_schedule="0 */$interval * * *"
fi

runner_path="$repo_dir/scripts/naukri-refresh-runner.sh"

echo "Configured REFRESH_INTERVAL_HOURS: $interval"
echo "Generated Cron Schedule: $cron_schedule"
echo "Installing cron job for: $runner_path"

# Make sure the runner script is executable
chmod +x "$runner_path"

# Clean old runner entries (and hourly-naukri-refresh.sh entries) and write new one
(crontab -l 2>/dev/null | grep -E -v "naukri-refresh-runner.sh|hourly-naukri-refresh.sh" || true; echo "$cron_schedule $runner_path") | crontab -

echo "SUCCESS: Cron job successfully configured."
