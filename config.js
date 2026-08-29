/**
 * Loads all personal data + credentials from the central ConfigService so nothing sensitive lives in code.
 * Exposes compatibility fields for the existing automation core.
 */
const path = require('path');
const ConfigService = require('./config-service');

const envPath = ConfigService.getEnvPath();
const E = ConfigService.load();
const g = (k, d = '') => (E[k] != null && E[k] !== '' ? E[k] : (process.env[k] || d));

if (!g('NAME') && !g('EMAIL') && !g('NAUKRI_EMAIL')) {
  console.warn('[config] Config missing or empty — complete setup in the application GUI.');
}

const CV = {
  name: g('NAME'),
  email: g('EMAIL'),
  phone: g('PHONE'),
  location: g('LOCATION'),
  currentRole: g('CURRENT_ROLE'),
  company: g('COMPANY') || (g('CURRENT_ROLE') ? (g('CURRENT_ROLE').split(' at ')[1] || '').split(' (')[0] : ''),
  education: g('EDUCATION'),
  yearsOfExperience: g('YEARS_EXPERIENCE'),
  skills: g('SKILLS'),
  highlights: g('HIGHLIGHTS') ? g('HIGHLIGHTS').split('||').map((s) => s.trim()).filter(Boolean) : [],
  // application answers
  noticePeriod: g('NOTICE_PERIOD'),
  currentCTC: g('CURRENT_CTC'),                 // bare number for chatbots, e.g. "10"
  expectedCTC: g('EXPECTED_CTC'),               // e.g. "18-25"
  currentSalary: g('CURRENT_CTC') + ' LPA',     // formatted for free-text fields
  expectedSalary: g('EXPECTED_CTC') + ' LPA',
  dob: g('DOB'),
  gender: g('GENDER'),
  workAuth: g('WORK_AUTH', 'Authorized to work in my country of residence.'),
  // links
  github: g('GITHUB_URL'),
  linkedin: g('LINKEDIN_URL'),
  portfolio: g('PORTFOLIO_URL'),
  links: `GitHub: ${g('GITHUB_URL')} | LinkedIn: ${g('LINKEDIN_URL')} | Portfolio: ${g('PORTFOLIO_URL')}`,
  // derived sentences
  remoteOk: 'Yes, I am fully set up for remote work and also open to hybrid/onsite.',
  relocate: `Yes, I am open to relocation. I am currently based in ${g('LOCATION')}.`,
  startDate: `I can start within ${g('NOTICE_PERIOD')}.`,
};

const naukriCredentials = {
  email: g('NAUKRI_EMAIL') || g('EMAIL'),
  password: g('NAUKRI_PASSWORD'),
};
const geminiKey = g('GEMINI_KEY');
const naukriProfileUrl = g('NAUKRI_PROFILE_URL', 'https://www.naukri.com/mnjuser/profile');
const resumeFile = g('RESUME_FILE', '');
const resumeUploadTimeoutMs = parseInt(g('RESUME_UPLOAD_TIMEOUT_MS', '120000'), 10);
const rawResumeFile = process.env['RESUME_FILE'] !== undefined ? process.env['RESUME_FILE'] : (E['RESUME_FILE'] || '');

module.exports = { 
  CV, 
  naukriCredentials, 
  geminiKey, 
  naukriProfileUrl, 
  resumeFile, 
  resumeUploadTimeoutMs, 
  rawResumeFile, 
  envPath, 
  getEnvPath: () => ConfigService.getEnvPath() 
};
