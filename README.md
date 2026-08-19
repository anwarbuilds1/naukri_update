# Naukri Profile Refresh

This Linux automation attaches Playwright to a manually started, dedicated
Google Chrome instance through Chrome DevTools Protocol (CDP). Chrome owns the
Naukri session; the script never launches Chrome, uses Google authentication,
or accesses the normal Chrome profile.

The dedicated profile is `.naukri-chrome-profile/`. It is separate from your
everyday browser data: no normal-profile cookies, passwords, local storage, or
extensions are copied or read.

## Requirements

- Linux with Node.js 18+ and Google Chrome installed
- A Naukri account

```bash
npm install
```

The only non-secret `.env` setting is:

```dotenv
NAUKRI_PROFILE_URL=https://www.naukri.com/mnjuser/profile
```

## Start and manually authenticate Chrome

```bash
./start-naukri-chrome.sh
```

The launcher detects `google-chrome` or `google-chrome-stable`, starts Chrome
with `.naukri-chrome-profile/`, opens the Naukri profile URL, and binds CDP only
to `127.0.0.1:9222`. Leave Chrome running afterward.

When the saved Naukri session has expired, the refresh script signs in through
Naukri's native login form using credentials that you keep only in your local
`.env`. Restrict that file to your account:

```bash
chmod 600 .env
```

CDP is unauthenticated, so do not run untrusted programs under the same local
user account while the dedicated Chrome instance is running.

## Refresh the headline

```bash
node naukri-profile-refresh.js
```

The script connects only to the local CDP endpoint, opens the Naukri profile,
and changes only the resume-headline trailing period. It reloads Naukri and
checks that the server-side headline exactly matches before recording success.
It disconnects when finished; Chrome remains open.

If CDP is unavailable, start the dedicated Chrome launcher first. If Naukri
requires an additional verification, complete it manually in the dedicated
Chrome window and rerun the command.

## Stop the dedicated Chrome

Close its visible window normally. To stop it from a terminal, first identify
the process using the dedicated profile, then send it a normal termination signal:

```bash
pgrep -af -- '--user-data-dir=.*\.naukri-chrome-profile'
kill <PID>
```

## Local sensitive files

`.env`, `.naukri-chrome-profile/`, `naukri-refresh.log`, and error screenshots
are Git-ignored and should remain local.

## Scope

No auto-apply functionality, recruiter/job scraping, credential collection,
telemetry, analytics, webhooks, or external APIs are included.
