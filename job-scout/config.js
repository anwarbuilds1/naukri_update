const fs = require('fs');
const path = require('path');

const MOD_DIR = __dirname;
const KEYWORDS_FILE = path.join(MOD_DIR, 'keywords.txt');
const SKILLS_FILE = path.join(MOD_DIR, 'skills.txt');
const RESUME_FILE_TXT = path.join(MOD_DIR, 'resume.txt');

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

const E = loadEnv(path.join(MOD_DIR, '..', '.env'));
const g = (k, d = '') => (E[k] != null && E[k] !== '' ? E[k] : d);
const i = (k, d) => {
  const v = g(k);
  if (!v) return d;
  const n = parseInt(v, 10);
  return isNaN(n) ? d : n;
};

function readListFile(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith('#'));
}

const keywords = readListFile(KEYWORDS_FILE);
if (!keywords.length) throw new Error(`No keywords found in ${KEYWORDS_FILE}`);

const skillEntries = readListFile(SKILLS_FILE).map((line) => {
  const [display, ...rest] = line.split('|').map((s) => s.trim());
  return { display, aliases: [display, ...rest.map((r) => r).filter(Boolean)] };
});

const resumeRaw = fs.existsSync(RESUME_FILE_TXT)
  ? fs.readFileSync(RESUME_FILE_TXT, 'utf8').toLowerCase()
  : '';

const resumeNorm = resumeRaw.replace(/-/g, ' ').replace(/\./g, ' ').replace(/\s+/g, ' ').trim();

function inResume(aliasText) {
  const t = String(aliasText).toLowerCase().replace(/-/g, ' ').replace(/\./g, ' ').replace(/\s+/g, ' ').trim();
  if (!t) return false;
  if (t.length <= 4) {
    const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`\\b${escaped}\\b`).test(resumeNorm);
  }
  return resumeNorm.includes(t);
}

const skills = resumeRaw.trim()
  ? skillEntries.filter((e) => e.aliases.some(inResume))
  : skillEntries;

const locationsRaw = g('SCOUT_LOCATIONS');
const locations = locationsRaw ? locationsRaw.split(',').map((s) => s.trim()).filter(Boolean) : ['India'];

const puneRaw = g('PUNE_LOCATIONS');
const puneTokens = (puneRaw ? puneRaw.split(',').map((s) => s.trim()).filter(Boolean) : ['Pune']).map((s) => s.toLowerCase());

const buckets = [
  { key: 1, label: '1 (0-5 days)', min: 0, max: 5 },
  { key: 2, label: '2 (6-10 days)', min: 6, max: 10 },
  { key: 3, label: '3 (11-15 days)', min: 11, max: 15 },
];

module.exports = {
  maxJobsPerKeyword: i('SCOUT_MAX_JOBS_PER_KEYWORD', 40),
  maxDaysAgo: i('SCOUT_MAX_DAYS_AGO', 15),
  jdSnippetLength: i('SCOUT_JD_SNIPPET_LENGTH', 500),
  keywords,
  locations,
  skills,
  puneTokens,
  buckets,
  usingResume: !!resumeRaw.trim(),
  cdpEndpoint: 'http://127.0.0.1:9222',
  profileUrl: require('../config').naukriProfileUrl,
  naukriCredentials: require('../config').naukriCredentials,
};