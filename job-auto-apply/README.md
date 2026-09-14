# Naukri Job Auto-Apply (separate module)

An independent module that searches Naukri for jobs, matches them against your
skills, **auto-applies** to the good ones, and keeps a report of everything it
did. Jobs that need the company's own career website are **never auto-applied** —
they are listed as "EXTERNAL" so you can apply manually.

It is fully separate from the profile-refresh module. The only shared pieces:
the same logged-in Chrome profile (`.naukri-chrome-profile`) and `../config` for
your CV data and Naukri credentials.

## Files

```
job-auto-apply/
├── naukri-apply.js            # the bot
├── config.js                  # reads settings from ../.env (APPLY_* keys)
├── run-apply-windows.ps1      # Windows wrapper: starts Chrome if needed, runs the bot
├── applications-report.csv    # the report (opens in Excel)
├── apply-state.json           # dedup state — never applies twice to the same job
├── logs/                      # apply.log, runner-apply.log, apply-error.png
└── README.md
```

## How it works

1. Builds a Naukri search URL per **keyword × location** with `jobAge=15`.
2. Reads every job card: title, company, location, experience, salary,
   **"Posted X days ago"** → keeps only jobs posted within `APPLY_MAX_DAYS_AGO`
   (default 15).
3. Scores each job against the skills list in `.env` (`SKILLS`) → keeps only
   jobs with a score ≥ `APPLY_MIN_MATCH_SCORE`.
4. Opens the job. If it is an **"Apply on company site"** job → records it as
   `EXTERNAL` and moves on (no apply).
5. For Naukri quick-apply: opens the apply modal, fills the questions from your
   CV data (name, email, phone, CTC, notice period, relocation, links, …), picks
   sensible select options, attaches the resume, and submits.
6. Verifies success; records one row in `applications-report.csv`:

   `Date, Keyword, JobTitle, Company, Location, Experience, Salary, PostedDays, Score, Status, Link`

7. Stops when the daily apply cap (`APPLY_DAILY_LIMIT`) is reached.

## Statuses you will see in the report

| Status | Meaning |
|---|---|
| `APPLIED` | Submitted on Naukri successfully |
| `EXTERNAL` | Requires the company's own website — **do this one manually** |
| `CAPTCHA` | A CAPTCHA blocked the apply — **finish manually** |
| `UNVERIFIED` | Submitted but success could not be confirmed — check manually |
| `FAILED` | An error occurred — check the log/screenshot |
| `FOUND` | Only in `--dry-run` mode: would have been applied |
| `SKIPPED-…` | Older than the cutoff / already applied / low JD match |

## Run it

```
# DANGER-FREE first: search + match + report, apply nothing
.\job-auto-apply\run-apply-windows.ps1 --dry-run

# Actually apply
.\job-auto-apply\run-apply-windows.ps1

# Directly with node (Chrome must already be running)
node job-auto-apply\naukri-apply.js --dry-run
```

Open `job-auto-apply\applications-report.csv` in Excel and click the **Link**
column to review / finish any `EXTERNAL` or `CAPTCHA` applies.

## Configuration (in the root `.env`)

Uncomment and edit as you like; all keys are optional (defaults in brackets):

```
APPLY_KEYWORDS=Full Stack Developer, MERN Developer
APPLY_LOCATIONS=India
APPLY_MAX_DAYS_AGO=15
APPLY_DAILY_LIMIT=25
APPLY_MIN_MATCH_SCORE=2
APPLY_MAX_JOBS_PER_KEYWORD=40
APPLY_DELAY_SECONDS=4
```

## Safety rules built in

- Never applies twice to the same job (`apply-state.json`).
- Hard cap on applies per day (default 25) + a delay between applies.
- External-site jobs are **never** auto-applied.
- CAPTCHAs stop the apply (recorded, not fought).
- Changing your `.env` `SKILLS` re-ranks everything on the next run.

## Scheduling

The refresh module's schedule does **not** touch this module. If you want this to
run automatically (e.g. once a day), create a second scheduled task that calls:

```
powershell.exe
-NoProfile -ExecutionPolicy Bypass -File "C:\path\to\naukri_update\job-auto-apply\run-apply-windows.ps1" --dry-run
```
(remove `--dry-run` when you trust the matching) — or just run it manually. Ask if
you want a one-command installer like the refresh task.

## Notes

- Naukri's page structure changes over time; if extraction or applying breaks,
  the bot saves `logs\apply-error.png` and stops that job cleanly.
- This is an independent tool; job sites generally discourage mass automated
  applications — keep the daily cap reasonable and respect Naukri's terms.