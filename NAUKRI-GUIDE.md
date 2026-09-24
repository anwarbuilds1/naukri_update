# Naukri Auto-Refresh — Personal Windows Guide

Everything needed to run and manage the Naukri profile refresh automation on this
laptop (Windows). Written specifically for this setup.

---

## What it does

1. Keeps the Naukri profile "fresh" by toggling the trailing **dot** on the resume
   headline (add `.` / remove `.`), then saving, reloading and verifying the change
   directly from Naukri's server.
2. Optionally re-uploads the resume **once per day** with a dated filename
   (`resume_DD-MM-YYYY.pdf`) so Naukri always sees it as a new file.
3. **Job Scout** (separate module): collects fresh Naukri job openings across your
   role keywords, scores each against your skills, buckets by posting age and writes
   a JSON report for you to scan and apply manually.

All automation runs against a **dedicated, isolated Chrome** profile
(`.naukri-chrome-profile/`) on `127.0.0.1:9222` — it never touches your normal
browser or your cookies.

---

## Important files

| File | Purpose |
|------|---------|
| `.env` | All configuration + Naukri email/password (gitignored — never share) |
| `.naukri-chrome-profile/` | Saved logged-in Chrome session (gitignored) |
| `.naukri-refresh-state.json` | Timestamps of the last refresh / resume upload |
| `naukri-profile-refresh.js` | The actual automation script |
| `naukri-refresh.log` | Step-by-step log of each run |
| `naukri-windows-runner.log` | Runner activity (starts, skips, successes/failures) |
| `fullstack-developer-tilak-ram.pdf` | Master resume file that gets uploaded |

`scripts/` helper scripts:

| Script | Use |
|--------|-----|
| `run-refresh-windows.ps1` | Main runner: checks if a task is due, starts Chrome if needed, runs it |
| `install-windows-task.ps1` | One-time: installs the scheduled task (asks for admin) |
| `pause-refresh.ps1` | Stop automation for a day/period (asks for admin) |
| `resume-refresh.ps1` | Start automation again (asks for admin) |
| `start-naukri-chrome.ps1` | Manually open the dedicated Chrome + log in |

---

## One-time setup (already done)

```
node -v                        # need Node 20+ (this machine: v22)
npm install                    # installs playwright-core
.\scripts\install-windows-task.ps1    # registers the "NaukriProfileRefresh" task
```

The scheduled task = **trigger at logon + repeat every 15 minutes, indefinitely**.
The runner exits in ~1 second if nothing is due, so frequent triggers are free.

Fill in `.env` (already done):
- `NAUKRI_EMAIL` / `NAUKRI_PASSWORD`
- `REFRESH_MODE=interval`, `REFRESH_INTERVAL_HOURS=1`
- `RESUME_UPDATE_ENABLED=true` → daily resume upload at `RESUME_UPDATE_TIME=07:00`
- `RESUME_FILE=fullstack-developer-tilak-ram.pdf`

---

## Commands cheat sheet

### Start / stop for a day (office days)
```
.\scripts\pause-refresh.ps1      # stop everything + close the Naukri Chrome window (UAC → Yes)
.\scripts\resume-refresh.ps1     # start again + immediately do a due-check (UAC → Yes)
```

### Manual runs (no task needed)
```
node naukri-profile-refresh.js                       # headline refresh now
node naukri-profile-refresh.js --upload-resume       # resume upload now
.\scripts\start-naukri-chrome.ps1                    # open dedicated Chrome + login manually
```

### Scheduled task management
```
Start-ScheduledTask -TaskName NaukriProfileRefresh      # run the cycle now
Get-ScheduledTask -TaskName NaukriProfileRefresh        # view task state
Get-ScheduledTaskInfo -TaskName NaukriProfileRefresh    # last-run time + result
Disable-ScheduledTask -TaskName NaukriProfileRefresh    # pause (same as pause script)
Enable-ScheduledTask  -TaskName NaukriProfileRefresh    # resume
SchTasks /Delete /TN NaukriProfileRefresh /F            # uninstall the task
```

### Logs / status
```
Get-Content naukri-windows-runner.log -Tail 20          # runner activity
Get-Content naukri-refresh.log -Tail 20                 # step-by-step of a run
```

---

## Scheduling behavior (from `.env`)

- `REFRESH_MODE=interval` → refresh every `REFRESH_INTERVAL_HOURS` hours
  (currently 1 hour). The headline dot alternates on/off, so the text stays clean.
- `RESUME_UPDATE_ENABLED=true` → uploads the dated resume once daily at
  `RESUME_UPDATE_TIME` (07:00). Only **once per day** — the state file prevents
  duplicates.
- Optional active window: set `REFRESH_WINDOW_ENABLED=true` +
  `REFRESH_WINDOW_START`/`REFRESH_WINDOW_END` to restrict runs to certain hours
  (e.g. 22:00–06:00 so nothing runs during office hours).

## Laptop restart / shutdown?

Nothing to redo. After boot + login the task auto-runs, starts the dedicated Chrome
(because the runner launches it when it's missing), and refreshes if it is due.
The login session lives in `.naukri-chrome-profile/`; if Naukri ever drops it, the
script auto-logins using `.env` credentials (if a CAPTCHA shows up, just log in once
manually in the dedicated Chrome window).

## Resume filename — is the date mandatory?

No. The dated suffix is a Naukri trick: uploading a file with a *new* name is what
makes Naukri count it as an update. The script copies the master file to
`<name>_DD-MM-YYYY.pdf`, uploads that, then deletes the copy. Any master filename
works (yours is fine); the date is added automatically.

## Keeping it invisible (office days)

- Use `pause-refresh.ps1` for any day(s) you don't want it to run or to be visible.
- While running, you can park the dedicated Chrome window on a separate
  virtual desktop (Task View) and minimize it. Note: if the task reopens Chrome
  later, the new window appears on whichever desktop is active at that moment —
  pausing is the reliable option for "nobody sees it".

## Notes / gotchas

- Pause/resume/install scripts prompt a **UAC "Yes"** because the scheduled task
  requires admin rights (they auto-relaunch elevated).
- `naukri-refresh-error.png` is a screenshot auto-captured whenever a run fails —
  check it for diagnostics.
- The dedicated Chrome does not need to be left open; the runner reopens it on
  demand.

---

## Job Scout (search + report, no auto-apply)

Gathers job openings into a JSON report so you can sit down and apply manually.

### Important files

| File | Purpose |
|------|---------|
| `job-scout/keywords.txt` | **Edit anytime** — one role keyword per line |
| `job-scout/skills.txt` | Skill catalog + aliases used for scoring |
| `job-scout/resume.txt` | Optional — your resume as plain text; if present it filters which skills count |
| `job-scout/naukri-scout.js` | The scout script |
| `job-scout/run-scout-windows.ps1` | Runner (starts Chrome if needed) |
| `job-scout/reports/job-openings-latest.json` | **The report to open** (regenerated every run) |
| `job-scout/reports/job-openings-<timestamp>.json` | Backup of each run |
| `scripts/install-scout-task.ps1` | Installs the `NaukriJobScout` scheduled task |

### The report

- Jobs grouped into buckets by posting age: **1 = 0–5 days, 2 = 6–10 days, 3 = 11–15 days**.
- Each job has: keyword, title, company, **direct apply link**, location,
  `punePreferred` flag, experience, salary, posted days, **score**, **matchedSkills**, JD snippet.
- Sorted per bucket: Pune-preferred first, then higher score, then newer.
- `summary` at the top shows totals; `ignored` lists jobs outside the 15-day window
  (with reason).
- Jobs older than 15 days are excluded.

### Run it

```
.\job-scout\run-scout-windows.ps1          # one run now, writes the JSON report
node job-scout\naukri-scout.js            # same thing without the wrapper
Start-ScheduledTask -TaskName NaukriJobScout   # manual trigger of the scheduled task
```

The `NaukriJobScout` scheduled task regenerates the report every 3 hours (already
installed). The old `NaukriJobApply` auto-apply task is **disabled** (auto-apply
was unreliable across different job forms; manual applying from this report is
the approach).

### Tuning (edit anytime, no code change)

- **Keywords** → `job-scout/keywords.txt`
- **Scoring skills** → `job-scout/skills.txt` (+ optional `resume.txt` filter)
- **Pune flag** → `PUNE_LOCATIONS` in `.env` (e.g. `PUNE_LOCATIONS=Pune, Pimpri-Chinchwad`)
- **Limits** → `SCOUT_MAX_JOBS_PER_KEYWORD`, `SCOUT_MAX_DAYS_AGO`, `SCOUT_LOCATIONS` in `.env`