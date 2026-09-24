const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');
const config = require('./config');

const MOD_DIR = __dirname;
const LOG_DIR = path.join(MOD_DIR, 'logs');
const REPORT_DIR = path.join(MOD_DIR, 'reports');
const LOG_FILE = path.join(LOG_DIR, 'scout.log');
const LATEST_REPORT = path.join(REPORT_DIR, 'job-openings-latest.json');

if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
if (!fs.existsSync(REPORT_DIR)) fs.mkdirSync(REPORT_DIR, { recursive: true });

function log(msg) {
  const line = `[${new Date().toLocaleString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, `${line}\n`);
}

function normalize(text) {
  return String(text || '').toLowerCase().replace(/-/g, ' ').replace(/\./g, ' ').replace(/\s+/g, ' ').trim();
}

function tokenHits(text, normalizedTokens) {
  const hay = ' ' + normalize(text) + ' ';
  const hits = [];
  for (const tok of normalizedTokens) {
    const t = tok.replace(/\s+/g, ' ');
    if (t.length <= 4) {
      const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp(`\\b${escaped}\\b`).test(hay)) hits.push(t);
    } else if (hay.includes(t)) {
      hits.push(t);
    }
  }
  return hits;
}

function normalizeTokens(aliases) {
  const out = new Set();
  for (const a of aliases) {
    const norm = normalize(a).replace(/^\s+|\s+$/g, '');
    if (norm) out.add(norm);
  }
  return [...out];
}

function scoreJob(job, keyword) {
  const normTokensBySkill = config.skills.map((s) => ({
    display: s.display,
    tokens: normalizeTokens(s.aliases),
  }));
  const title = normalize(job.title);
  const jd = normalize(job.jobText);
  let score = 0;
  const matched = [];
  for (const s of normTokensBySkill) {
    const titleHit = tokenHits(title, s.tokens).length > 0;
    const jdHit = tokenHits(jd, s.tokens).length > 0;
    if (titleHit) { score += 2; matched.push(s.display); continue; }
    if (jdHit) { score += 1; matched.push(s.display); }
  }
  const kw = normalize(keyword);
  if (kw && title.includes(kw)) score += 2;
  return { score: Math.min(score, 30), matchedSkills: matched };
}

function bucketOf(postedDays) {
  if (postedDays === null || postedDays === undefined) return null;
  for (const b of config.buckets) {
    if (postedDays >= b.min && postedDays <= b.max) return b.key;
  }
  return null;
}

function isPunePreferred(locationText) {
  const loc = String(locationText || '').toLowerCase();
  return config.puneTokens.some((t) => loc.includes(t));
}

function parseExperience(text) {
  const m = String(text).match(/(\d+)\s*-\s*(\d+)\s*[Yy]rs/);
  return m ? `${m[1]} - ${m[2]} Yrs` : '';
}

function parseSalary(text) {
  const m = String(text).match(/((?:₹|Rs\.?)\s?[\d,.]+(?:\s*-\s*(?:₹|Rs\.?)?\s?[\d,.]+)?\s*(?:LPA|Lacs?|Lakhs?|Cr)?)/i);
  return m ? m[1].replace(/\s+/g, ' ') : '';
}

function parsePostedDays(text) {
  const t = String(text).replace(/\+/g, '').replace(/,/g, '');
  const d = t.match(/(\d+)\s*days?\s*ago/i);
  if (d) return parseInt(d[1], 10);
  const w = t.match(/(\d+)\s*weeks?\s*ago/i);
  if (w) return parseInt(w[1], 10) * 7;
  const mo = t.match(/(\d+)\s*months?\s*ago/i);
  if (mo) return parseInt(mo[1], 10) * 30;
  if (/(today|just\s*now|a few\s*days)/i.test(t)) return 0;
  return null;
}

function parsePostedText(text) {
  const m = String(text).match(/((?:\d+\s*\+\s*)?(?:today|just now|a few days|\d+\s*(?:days?|weeks?|months?))\s*ago)/i);
  return m ? m[1] : '';
}

async function ensureLoggedIn(page) {
  await page.goto(config.profileUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  try {
    await page.locator('#lazyResumeHead, [data-ga-track*="resumeHeadline"], .nameContent').first()
      .waitFor({ state: 'visible', timeout: 10000 });
    return true;
  } catch {}
  if (!config.naukriCredentials.email || !config.naukriCredentials.password) {
    throw new Error('Not authenticated. Log in manually in the dedicated Chrome window.');
  }
  const loginUrl = `https://www.naukri.com/nlogin/login?URL=${encodeURIComponent(config.profileUrl)}`;
  await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const email = await findVisible(page, ['#usernameField:visible', 'input[name="username"]:visible', 'input[type="email"]:visible']);
  const pass = await findVisible(page, ['#passwordField:visible', 'input[name="password"]:visible', 'input[type="password"]:visible']);
  const submit = await findVisible(page, ['button.blue-btn:visible', 'button[type="submit"]:not(.otpButton):visible']);
  await email.fill(config.naukriCredentials.email);
  await pass.fill(config.naukriCredentials.password);
  await submit.click();
  await page.waitForURL((u) => u.toString().includes('/mnjuser'), { timeout: 60000 }).catch(() => {});
  try {
    await page.locator('#lazyResumeHead, [data-ga-track*="resumeHeadline"], .nameContent').first()
      .waitFor({ state: 'visible', timeout: 10000 });
    return true;
  } catch {
    return false;
  }
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
  throw new Error(`Could not find visible element: ${selectors.join(', ')}`);
}

async function collectJobs(page, keyword, location) {
  const q = encodeURIComponent(keyword);
  const l = encodeURIComponent(location);
  const slug = keyword.toLowerCase().replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '');
  const url = `https://www.naukri.com/${slug}-jobs?k=${q}&l=${l}&sort=1`;
  log(`Searching: ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('div.cust-job-tuple', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2000);

  const cards = page.locator('div.cust-job-tuple');
  const count = Math.min(await cards.count(), config.maxJobsPerKeyword);
  const jobs = [];

  for (let i = 0; i < count; i++) {
    const card = cards.nth(i);
    try {
      const text = (await card.innerText()).replace(/\s+/g, ' ');
      const titleEl = card.locator('a.title, a[href*="job-listings"], a[class*="title"]').first();
      const title = (await titleEl.innerText()).trim();
      const href = await titleEl.getAttribute('href').catch(() => null);
      const link = href ? new URL(href, page.url()).toString() : null;
      if (!title || !link) continue;
      const company = await card.locator('a.comp-name, a[class*="comp-name"], span[class*="company"]').first()
        .innerText().then((t) => t.trim()).catch(() => '');
      let locationText = await card.locator('[class*="-location"], [class*="loc"]').first()
        .innerText().then((t) => t.trim()).catch(() => '');
      if (!locationText) {
        const locMatch = text.match(/Yrs\s+(.+?)(?=\s\.\s|\.)/);
        if (locMatch) locationText = locMatch[1].trim().slice(0, 160);
      }
      jobs.push({
        title,
        company,
        link,
        location: locationText || location,
        experience: parseExperience(text),
        salary: parseSalary(text),
        postedDays: parsePostedDays(text),
        postedText: parsePostedText(text),
        jobText: text.slice(0, config.jdSnippetLength),
      });
    } catch (e) {
      log(`Card ${i} skipped: ${e.message.split('\n')[0]}`);
    }
  }
  return jobs;
}

(async () => {
  const startedAt = new Date();
  log(`Job scout start | keywords=${config.keywords.length} | locations=${config.locations.join(', ')} | maxDays=${config.maxDaysAgo} | skills=${config.skills.length}${config.usingResume ? ' (from resume.txt)' : ' (from skills.txt)'}`);

  let browser;
  try {
    browser = await chromium.connectOverCDP(config.cdpEndpoint, { timeout: 10000 });
  } catch {
    console.error('Naukri Chrome is not running (CDP 127.0.0.1:9222 unavailable). Start the dedicated Chrome first via run-scout-windows.ps1.');
    process.exitCode = 1;
    return;
  }

  try {
    const context = browser.contexts()[0];
    if (!context) throw new Error('No browser context available.');
    const page = context.pages()[0] || await context.newPage();
    await ensureLoggedIn(page);

    const byLink = new Map();
    const seenLog = new Set();

    for (const location of config.locations) {
      for (const keyword of config.keywords) {
        let jobs;
        try {
          jobs = await collectJobs(page, keyword, location);
        } catch (e) {
          log(`Search failed for "${keyword}" @ ${location}: ${e.message.split('\n')[0]}`);
          continue;
        }
        log(`"${keyword}" @ ${location}: ${jobs.length} cards scraped`);
        for (const job of jobs) {
          if (byLink.has(job.link)) {
            const existing = byLink.get(job.link);
            const rescore = scoreJob(job, keyword);
            if (rescore.score > existing.score) {
              byLink.set(job.link, { ...job, keyword, ...rescore });
            }
            continue;
          }
          const scored = scoreJob(job, keyword);
          byLink.set(job.link, { ...job, keyword, ...scored });
        }
      }
    }

    const allJobs = [...byLink.values()];
    const good = [];
    const ignored = [];
    for (const job of allJobs) {
      const bucket = bucketOf(job.postedDays);
      if (bucket === null) {
        ignored.push({
          title: job.title,
          company: job.company,
          link: job.link,
          location: job.location,
          postedText: job.postedText || '',
          reason: job.postedDays === null ? 'age unknown' : `older than ${config.maxDaysAgo}d (${job.postedText || job.postedDays + 'd'})`,
        });
        continue;
      }
      job.bucket = bucket;
      job.punePreferred = isPunePreferred(job.location);
      good.push(job);
      seenLog.add(`B${bucket}${job.punePreferred ? ' [Pune]' : ''}  score=${job.score}  ${job.title} @ ${job.company}  ${job.location}  ${job.postedText || job.postedDays + 'd'}`);
    }

    const sortKey = (a, b) => (b.punePreferred - a.punePreferred) || (b.score - a.score) || ((a.postedDays ?? 999) - (b.postedDays ?? 999));
    good.sort(sortKey);

    const bucketsOut = {};
    for (const b of config.buckets) {
      const list = good.filter((j) => j.bucket === b.key)
        .map((j) => ({
          keyword: j.keyword,
          title: j.title,
          company: j.company,
          link: j.link,
          location: j.location,
          punePreferred: j.punePreferred,
          experience: j.experience,
          salary: j.salary,
          postedDays: j.postedDays,
          postedText: j.postedText,
          score: j.score,
          matchedSkills: j.matchedSkills,
          jdSnippet: j.jobText,
        }));
      bucketsOut[b.label] = list;
    }

    const punePreferred = good.filter((j) => j.punePreferred)
      .map((j) => ({
        keyword: j.keyword,
        title: j.title,
        company: j.company,
        link: j.link,
        location: j.location,
        experience: j.experience,
        salary: j.salary,
        postedDays: j.postedDays,
        postedText: j.postedText,
        bucket: j.bucket,
        score: j.score,
        matchedSkills: j.matchedSkills,
      }));

    const byKeyword = {};
    for (const j of good) {
      byKeyword[j.keyword] = (byKeyword[j.keyword] || 0) + 1;
    }

    const report = {
      generatedAt: startedAt.toISOString(),
      source: { buckets: config.buckets.map((b) => ({ label: b.label, days: `${b.min}-${b.max}` })), maxDaysAgo: config.maxDaysAgo },
      keywords: config.keywords,
      summary: {
        totalJobs: good.length,
        punePreferred: punePreferred.length,
        byBucket: Object.fromEntries(config.buckets.map((b) => [`${b.key}`, good.filter((j) => j.bucket === b.key).length])),
        byKeyword,
      },
      buckets: bucketsOut,
      punePreferred,
      ignored,
    };

    fs.writeFileSync(LATEST_REPORT, JSON.stringify(report, null, 2), 'utf8');
    const stamp = startedAt.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const backup = path.join(REPORT_DIR, `job-openings-${stamp}.json`);
    fs.writeFileSync(backup, JSON.stringify(report, null, 2), 'utf8');

    log(`DONE. Total=${good.length} | PuneHits=${punePreferred.length} | B1=${report.summary.byBucket['1']} B2=${report.summary.byBucket['2']} B3=${report.summary.byBucket['3']} | ignored=${ignored.length}`);
    log(`Report: ${LATEST_REPORT}`);
  } catch (error) {
    log(`ERROR: ${error.message.split('\n')[0]}`);
    process.exitCode = 1;
  } finally {
    await browser.close().catch(() => {});
  }
})();