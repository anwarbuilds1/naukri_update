const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');
const config = require('./config');

const APP_DIR = __dirname;
const LOG_DIR = path.join(APP_DIR, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'apply.log');
const REPORT_FILE = path.join(APP_DIR, 'applications-report.csv');
const STATE_FILE = path.join(APP_DIR, 'apply-state.json');
const ERROR_SHOT = path.join(LOG_DIR, 'apply-error.png');

if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

function rotateLog() {
  fs.appendFileSync(LOG_FILE, '=== RUN START ===\n');
  try {
    const content = fs.readFileSync(LOG_FILE, 'utf8');
    const runs = content.split(/^=== RUN START ===/m);
    if (runs.length > 6) {
      const kept = runs.slice(runs.length - 5).map((r) => '=== RUN START ===' + r).join('');
      fs.writeFileSync(LOG_FILE, kept, 'utf8');
    }
  } catch {}
}

rotateLog();

function log(msg) {
  const line = `[${new Date().toLocaleString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, `${line}\n`);
}

function loadState() {
  if (fs.existsSync(STATE_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    } catch {}
  }
  return { seen: {}, appliedByUrl: {} };
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

function ensureReport() {
  if (!fs.existsSync(REPORT_FILE)) {
    fs.writeFileSync(REPORT_FILE,
      'Date,Keyword,JobTitle,Company,Location,Experience,Salary,PostedDays,Score,Status,Link\n', 'utf8');
  }
}

function appendReport(row) {
  const esc = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  fs.appendFileSync(REPORT_FILE, row.map(esc).join(',') + '\n', 'utf8');
}

function delay(seconds, jitter = 2000) {
  const ms = (seconds * 1000) + Math.floor(Math.random() * jitter);
  return new Promise((r) => setTimeout(r, ms));
}

function isNaukriUrl(u) {
  try {
    const p = new URL(u);
    return p.hostname === 'naukri.com' || p.hostname.endsWith('.naukri.com');
  } catch {
    return false;
  }
}

function isAuthenticatedProfile(url) {
  try {
    const p = new URL(url);
    return (p.hostname === 'naukri.com' || p.hostname.endsWith('.naukri.com')) && p.pathname.startsWith('/mnjuser');
  } catch {
    return false;
  }
}

async function hasProfileAuth(page) {
  if (!isAuthenticatedProfile(page.url())) return false;
  try {
    await page.locator('#lazyResumeHead, [data-ga-track*="resumeHeadline"], .nameContent').first()
      .waitFor({ state: 'visible', timeout: 10000 });
    return true;
  } catch {
    return false;
  }
}

async function ensureLoggedIn(page) {
  await page.goto(config.profileUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  if (await hasProfileAuth(page)) return true;
  if (!config.naukriCredentials.email || !config.naukriCredentials.password) {
    throw new Error('Not authenticated. Log in manually in the dedicated Chrome window, or set NAUKRI_EMAIL/NAUKRI_PASSWORD in .env');
  }
  const loginUrl = `https://www.naukri.com/nlogin/login?URL=${encodeURIComponent(config.profileUrl)}`;
  await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const email = await findVisible(page, ['#usernameField:visible', 'input[name="username"]:visible', 'input[type="email"]:visible']);
  const pass = await findVisible(page, ['#passwordField:visible', 'input[name="password"]:visible', 'input[type="password"]:visible']);
  const submit = await findVisible(page, ['button.blue-btn:visible', 'button[type="submit"]:not(.otpButton):visible']);
  await email.fill(config.naukriCredentials.email);
  await pass.fill(config.naukriCredentials.password);
  await submit.click();
  await page.waitForURL((u) => isAuthenticatedProfile(u.toString()), { timeout: 60000 }).catch(() => {});
  return hasProfileAuth(page);
}

async function findVisible(page, selectors, timeout = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    for (const sel of selectors) {
      const loc = page.locator(sel);
      if ((await loc.count()) === 1) return loc;
    }
    await page.waitForTimeout(500);
  }
  throw new Error(`Could not find visible element with selectors: ${selectors.join(', ')}`);
}

function parsePostedDays(text) {
  const t = text.replace(/\+/g, '').replace(/,/g, '');
  const d = t.match(/(\d+)\s*days?\s*ago/i);
  if (d) return parseInt(d[1], 10);
  const w = t.match(/(\d+)\s*weeks?\s*ago/i);
  if (w) return parseInt(w[1], 10) * 7;
  const mo = t.match(/(\d+)\s*months?\s*ago/i);
  if (mo) return parseInt(mo[1], 10) * 30;
  if (/(today|just\s*now|a few\s*days)/i.test(t)) return 0;
  return null;
}

function parseExperience(text) {
  const m = text.match(/(\d+)\s*-\s*(\d+)\s*yrs/i);
  return m ? `${m[1]} - ${m[2]} Yrs` : '';
}

function parseSalary(text) {
  const m = text.match(/((?:₹|Rs\.?)\s?[\d,.]+(?:\s*-\s*(?:₹|Rs\.?)?\s?[\d,.]+)?\s*(?:LPA|Lacs?|Lakhs?|Cr)?)/i);
  return m ? m[1].replace(/\s+/g, ' ') : '';
}

function matchScore(job) {
  const hay = `${job.title} ${job.company} ${job.jobText}`.toLowerCase();
  let score = 0;
  for (const s of config.CV.skills || []) {
    for (const token of s.split(/\s+/)) {
      if (token.length >= 3 && hay.includes(token.toLowerCase())) { score += 1; break; }
    }
  }
  return score;
}

async function collectJobs(page, keyword, location) {
  const q = encodeURIComponent(keyword);
  const l = encodeURIComponent(location);
  const slug = keyword.toLowerCase().replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '');
  const url = `https://www.naukri.com/${slug}-jobs?k=${q}&l=${l}&jobAge=15&sort=1`;
  log(`Searching: ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('div.cust-job-tuple', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2000);

  const cards = page.locator('div.cust-job-tuple');
  const count = Math.min(await cards.count(), config.maxJobsPerKeyword);
  log(`Found ${await cards.count()} job cards; scanning up to ${count}.`);
  const jobs = [];

  for (let i = 0; i < count; i++) {
    const card = cards.nth(i);
    try {
      const text = (await card.innerText()).replace(/\s+/g, ' ');
      const titleEl = card.locator('a.title, a[href*="job-listings"], a[class*="title"]').first();
      const title = (await titleEl.innerText()).trim();
      const href = await titleEl.getAttribute('href').catch(() => null);
      const link = href ? new URL(href, page.url()).toString() : null;
      const company = await card.locator('a.comp-name, a[class*="comp-name"], span[class*="company"]').first()
        .innerText().then((t) => t.trim()).catch(() => '');
      const exp = parseExperience(text);
      const salary = parseSalary(text);
      const posted = parsePostedDays(text);
      let locationText = await card.locator('[class*="-location"], [class*="loc"]').first()
        .innerText().then((t) => t.trim()).catch(() => '');
      if (!locationText) {
        const locMatch = text.match(/Yrs\s+(.+?)(?=\s\.\s|\.)/);
        if (locMatch) locationText = locMatch[1].trim().slice(0, 160);
      }
      if (!title || !link) continue;
      jobs.push({
        title, company, link, exp, salary, posted, location: locationText || location,
        jobText: text.slice(0, 1200),
      });
    } catch (e) {
      log(`Card ${i} skipped: ${e.message.split('\n')[0]}`);
    }
  }
  return jobs;
}

async function filterJobs(page, jobs, keyword, state) {
  const out = { keep: [], skipped: [] };
  const today = new Date().toISOString().slice(0, 10);
  for (const job of jobs) {
    if (job.posted !== null && job.posted > config.maxDaysAge) {
      out.skipped.push({ ...job, reason: `older than ${config.maxDaysAge}d (posted ${job.posted}d ago)` });
      continue;
    }
    const prev = state.seen[job.link];
    if (prev && prev.date === today) {
      out.skipped.push({ ...job, reason: `already processed today (${prev.status})` });
      continue;
    }
    if (state.appliedByUrl[job.link]) {
      out.skipped.push({ ...job, reason: 'already applied before' });
      continue;
    }
    const score = matchScore(job);
    if (score < config.minMatchScore) {
      out.skipped.push({ ...job, reason: `low JD match (score ${score})` });
      continue;
    }
    out.keep.push({ ...job, score });
  }
  return out;
}

async function detectApplyButton(page) {
  const ext = page.locator('button, a').filter({ hasText: /apply\s*on\s*(company\s*)?(site|website|external)/i }).first();
  if (await ext.count() > 0 && await ext.isVisible()) return { type: 'external' };

  const easy = page.locator('button.apply, a.apply-btn, button[class*="apply"][class*="btn"], button:has-text("Apply"), a:has-text("Apply")').first();
  for (const cand of [easy]) {
    try { if (await cand.count() > 0 && await cand.isVisible()) return { type: 'easy', btn: cand }; } catch {}
  }
  const simple = page.locator('button, a').filter({ hasText: /^apply$/i }).first();
  try { if (await simple.count() > 0 && await simple.isVisible()) return { type: 'easy', btn: simple }; } catch {}
  return { type: 'none' };
}

async function hasCaptcha(page) {
  const body = await page.locator('body').innerText().catch(() => '');
  if (/captcha|verify you are human/i.test(body)) return true;
  return (await page.locator('iframe[src*="captcha"], div[class*="captcha"], [data-hcaptcha], [data-recaptcha]').count()) > 0;
}

async function fillApplicationModal(page, job) {
  const modal = page.locator('div[class*="apply"], form, [role="dialog"], div[class*="modal"]').filter({ has: page.locator('input, textarea, select') }).last();
  await modal.waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});

  const cv = config.CV;
  const map = [
    [/(full\s*name|your\s*name|name\s*\*?)/i, 'text', cv.name],
    [/(e-?mail|email\s*address)/i, 'text', cv.email],
    [/(mobile|phone|contact\s*no)/i, 'text', cv.phone],
    [/(current\s*location|city)/i, 'text', cv.location],
    [/(current\s*ctc|current\s*salary)/i, 'text', cv.currentSalary],
    [/(expected\s*ctc|expected\s*salary)/i, 'text', cv.expectedSalary],
    [/(notice\s*period)/i, 'select', cv.noticePeriod],
    [/(can\s*you\s*(start|join)|date\s*of\s*joining|joining\s*date|immediate)/i, 'text', cv.startDate],
    [/(relocat)/i, 'select', 'Yes'],
    [/(remote|work\s*mode)/i, 'select', 'Yes'],
    [/(github)/i, 'text', cv.github],
    [/(linkedin)/i, 'text', cv.linkedin],
    [/(portfolio)/i, 'text', cv.portfolio],
    [/(cover\s*letter|why\s*should|about\s*yourself|summary)/i, 'textarea', cv.highlights.join('\n')],
    [/(work\s*authoriz)/i, 'select', cv.workAuth],
  ];

  const inputs = modal.locator('input:not([type="hidden"]):not([type="radio"]):not([type="checkbox"]):not([type="file"]), textarea');
  const selects = modal.locator('select');
  const nInputs = await inputs.count();
  for (let i2 = 0; i2 < nInputs; i2++) {
    const el = inputs.nth(i2);
    const label = ((await el.getAttribute('name')) || '') + ' ' + ((await el.getAttribute('placeholder')) || '') + ' ' + ((await el.getAttribute('aria-label')) || '');
    if (/email|e-?mail/i.test(label)) {
      await el.fill(cv.email).catch(() => {});
      continue;
    }
    let filled = false;
    for (const [re, type, val] of map) {
      if (re.test(label) && val) {
        await el.fill(String(val)).catch(() => {});
        filled = true;
        break;
      }
    }
    if (!filled) continue;
  }
  const nSelects = await selects.count();
  for (let s = 0; s < nSelects; s++) {
    const sel = selects.nth(s);
    const label = ((await sel.getAttribute('name')) || '') + ' ' + ((await sel.getAttribute('class')) || '');
    const opts = sel.locator('option');
    const nOpts = await opts.count();
    let target = '';
    for (const [re, , val] of map) {
      if (re.test(label) && val) {
        target = String(val).toLowerCase();
        break;
      }
    }
    if (!target) continue;
    for (let o = 0; o < nOpts; o++) {
      const optText = (await opts.nth(o).innerText()).toLowerCase();
      if (optText.includes(target.split(' ')[0])) {
        await sel.selectOption({ index: o }).catch(() => {});
        break;
      }
    }
  }

  const resume = path.isAbsolute(config.resumeFile)
    ? config.resumeFile
    : path.resolve(__dirname, '..', config.resumeFile);
  const fileInput = modal.locator('input[type="file"]');
  if ((await fileInput.count()) > 0 && fs.existsSync(resume)) {
    await fileInput.setInputFiles(resume).catch(() => {});
  }
}

async function applyToJob(page, job, keyword) {
  log(`Opening job: ${job.title} | ${job.company}`);
  await page.goto(job.link, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2500);

  const btn = await detectApplyButton(page);
  if (btn.type === 'external') {
    log('External apply detected — skipping application, noting for manual.');
    return 'EXTERNAL';
  }
  if (btn.type === 'none') {
    return 'UNVERIFIED';
  }
  await btn.btn.click({ timeout: 15000 }).catch(async () => { await btn.btn.click({ force: true }); });

  await page.waitForTimeout(1500);
  if (await hasCaptcha(page)) {
    await page.screenshot({ path: ERROR_SHOT }).catch(() => {});
    return 'CAPTCHA';
  }

  await fillApplicationModal(page, job);

  const submit = page.locator('div[class*="apply"] input[type="submit"], div[class*="apply"] button:has-text("Submit"), div[class*="apply"] button:has-text("Save"), button:has-text("Submit Application"), button:has-text("Apply")').last();
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      if (await submit.count() > 0 && await submit.isVisible()) {
        await submit.click({ timeout: 10000 });
        break;
      }
    } catch {}
    await page.waitForTimeout(1500);
  }

  await page.waitForTimeout(4000);
  const body = await page.locator('body').innerText().catch(() => '');
  if (/thank you for (your\s*)?application|you have successfully applied|applied successfully/i.test(body)) {
    return 'APPLIED';
  }
  const appliedBtn = await page.locator('button, a').filter({ hasText: /^applied$/i }).first();
  try {
    if (await appliedBtn.count() > 0 && await appliedBtn.isVisible()) return 'APPLIED';
  } catch {}
  await page.screenshot({ path: ERROR_SHOT }).catch(() => {});
  return 'UNVERIFIED';
}

(async () => {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  const state = loadState();
  ensureReport();
  const today = new Date().toISOString().slice(0, 10);
  let appliedToday = 0;

  log(`Apply bot start (dry-run=${dryRun}) | keywords=${config.keywords.join(', ')} | locations=${config.locations.join(', ')} | maxDays=${config.maxDaysAge} | dailyLimit=${config.dailyLimit}`);

  let browser;
  try {
    browser = await chromium.connectOverCDP(config.cdpEndpoint, { timeout: 10000 });
  } catch {
    console.error('Naukri Chrome is not running (CDP 127.0.0.1:9222 unavailable). Start it via scripts\\start-naukri-chrome.ps1 first.');
    process.exitCode = 1;
    return;
  }

  try {
    const context = browser.contexts()[0];
    if (!context) throw new Error('No browser context available. Open the dedicated Chrome first.');
    const page = context.pages()[0] || await context.newPage();
    await ensureLoggedIn(page);

    for (const location of config.locations) {
      for (const keyword of config.keywords) {
        if (appliedToday >= config.dailyLimit && !dryRun) {
          log(`Daily limit (${config.dailyLimit}) reached. Stopping.`);
          return;
        }
        let jobs;
        try {
          jobs = await collectJobs(page, keyword, location);
        } catch (e) {
          log(`Search failed for "${keyword}" @ ${location}: ${e.message.split('\n')[0]}`);
          continue;
        }
        const { keep, skipped } = await filterJobs(page, jobs, keyword, state);
        for (const s of skipped) {
          appendReport([today, keyword, s.title, s.company, s.location, s.exp, s.salary, s.posted, '', `SKIPPED-${s.reason}`, s.link]);
          log(`Skip: ${s.title} @ ${s.company} — ${s.reason}`);
        }
        log(`${keyword} @ ${location}: ${keep.length} matching, ${skipped.length} skipped.`);
        for (const job of keep) {
          let status;
          if (dryRun) {
            status = 'FOUND';
            log(`[dry-run] Match: ${job.title} @ ${job.company} (score ${job.score})`);
          } else {
            try {
              status = await applyToJob(page, job, keyword);
            } catch (e) {
              log(`Apply error: ${e.message.split('\n')[0]}`);
              try { await page.screenshot({ path: ERROR_SHOT }); } catch {}
              status = 'FAILED';
            }
            await delay(config.delaySeconds);
          }
          appendReport([today, keyword, job.title, job.company, job.location, job.exp, job.salary, job.posted, job.score, status, job.link]);
          log(`Result: ${status} | ${job.title} @ ${job.company} | ${job.link}`);
          if (!dryRun) {
            state.seen[job.link] = { date: today, status };
            if (status === 'APPLIED') {
              state.appliedByUrl[job.link] = { date: today, status };
              appliedToday += 1;
            }
            saveState(state);
          }
          if (appliedToday >= config.dailyLimit && !dryRun) {
            log(`Daily limit (${config.dailyLimit}) reached. Stopping.`);
            return;
          }
        }
      }
    }
    log(`Run complete. Applied=${appliedToday}. Report: ${REPORT_FILE}`);
  } catch (error) {
    log(`ERROR: ${error.message.split('\n')[0]}`);
    process.exitCode = 1;
  } finally {
    await browser.close().catch(() => {});
  }
})();