const fs = require('fs');
const path = require('path');
const base = require('../config');

function loadEnv(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

const E = loadEnv(path.join(__dirname, '..', '.env'));
const g = (k) => (E[k] != null && E[k] !== '' ? E[k] : '');
const i = (k, d) => {
  const v = g(k);
  if (!v) return d;
  const n = parseInt(v, 10);
  return isNaN(n) ? d : n;
};

const CV = Object.assign({}, base.CV);
CV.skills = (() => {
  const raw = base.CV.skills;
  const arr = Array.isArray(raw)
    ? raw
    : (raw || '').split(/[,|]/).map((s) => s.trim()).filter(Boolean);
  return arr;
})();

const keywordsRaw = g('APPLY_KEYWORDS');
const keywords = keywordsRaw
  ? keywordsRaw.split(',').map((s) => s.trim()).filter(Boolean)
  : (CV.skills.length ? CV.skills : ['Full Stack Developer']);

const locationsRaw = g('APPLY_LOCATIONS');
const locations = locationsRaw
  ? locationsRaw.split(',').map((s) => s.trim()).filter(Boolean)
  : ['India'];

module.exports = {
  CV,
  naukriCredentials: base.naukriCredentials,
  profileUrl: base.naukriProfileUrl,
  resumeFile: base.resumeFile,
  keywords,
  locations,
  maxDaysAge: i('APPLY_MAX_DAYS_AGO', 15),
  dailyLimit: i('APPLY_DAILY_LIMIT', 25),
  maxJobsPerKeyword: i('APPLY_MAX_JOBS_PER_KEYWORD', 40),
  minMatchScore: i('APPLY_MIN_MATCH_SCORE', 2),
  delaySeconds: i('APPLY_DELAY_SECONDS', 4),
  cdpEndpoint: 'http://127.0.0.1:9222',
};