# Naukri Job Scout

Search-and-report only (no auto-apply). Scans Naukri across your role keywords,
scores each job against your skill set, groups by posting age, and writes a JSON
report so you can sit down and apply manually.

## Report

`reports/job-openings-latest.json` (overwritten each run) + timestamped backups.

Buckets by posting age:

- `1 (0-5 days)`
- `2 (6-10 days)`
- `3 (11-15 days)`

Each job includes: keyword, title, company, direct apply link, location,
`punePreferred` flag, experience, salary, posted days, relevance `score`,
`matchedSkills`, and a JD snippet. Jobs outside the 15-day window go to `ignored`.

## Run

```
.\job-scout\run-scout-windows.ps1
```

or `node job-scout/naukri-scout.js`. The `NaukriJobScout` scheduled task
regenerates the report every 3 hours.

## Edit anytime (no code changes)

| File | Purpose |
|------|---------|
| `keywords.txt` | One role keyword per line (`#` for comments) |
| `skills.txt` | Scoring catalog — `Display Name | alias1, alias2` per line |
| `resume.txt` | Optional plain-text resume — if present, only skills found in it count |
| `.env` | `SCOUT_LOCATIONS`, `SCOUT_MAX_JOBS_PER_KEYWORD`, `SCOUT_MAX_DAYS_AGO`, `PUNE_LOCATIONS` |