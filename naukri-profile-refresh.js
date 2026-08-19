/**
 * Refreshes only the Naukri resume headline through a manually started,
 * localhost-only Chrome DevTools endpoint. This script never starts Chrome,
 * never uses Google authentication, and uses native Naukri login only when its
 * dedicated session has expired.
 */
const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');
const { naukriProfileUrl, naukriCredentials } = require('./config');

const PROFILE_URL = naukriProfileUrl;
const CDP_ENDPOINT = 'http://127.0.0.1:9222';
const NATIVE_LOGIN_URL = `https://www.naukri.com/nlogin/login?URL=${encodeURIComponent(PROFILE_URL)}`;
const LOG_FILE = path.join(__dirname, 'naukri-refresh.log');
const ERROR_SHOT = path.join(__dirname, 'naukri-refresh-error.png');

function log(message) {
  const line = `[${new Date().toLocaleString()}] ${message}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, `${line}\n`);
}

function isAuthenticatedProfile(url) {
  try {
    const parsed = new URL(url);
    return (parsed.hostname === 'naukri.com' || parsed.hostname.endsWith('.naukri.com'))
      && parsed.pathname.startsWith('/mnjuser');
  } catch {
    return false;
  }
}

function isNaukriLoginUrl(url) {
  try {
    const parsed = new URL(url);
    return (parsed.hostname === 'naukri.com' || parsed.hostname.endsWith('.naukri.com'))
      && parsed.pathname.startsWith('/nlogin');
  } catch {
    return false;
  }
}

function assertNaukriProfileUrl(url) {
  const parsed = new URL(url);
  if (
    parsed.protocol !== 'https:'
    || (parsed.hostname !== 'naukri.com' && !parsed.hostname.endsWith('.naukri.com'))
    || !parsed.pathname.startsWith('/mnjuser/')
  ) {
    throw new Error('NAUKRI_PROFILE_URL must be an HTTPS Naukri /mnjuser/ URL.');
  }
}

async function updateAndVerifyHeadline(page) {
  const editIcon = page.locator('#lazyResumeHead span.edit.icon, [data-ga-track*="resumeHeadline"] .edit').first();

  await editIcon.waitFor({ timeout: 30000 });
  await editIcon.click();
  let { modal, editor } = await getHeadlineEditor(page);

  const current = (await editor.inputValue()).trimEnd();
  if (!current) throw new Error('Resume headline is empty; nothing was changed.');
  const updated = current.endsWith('.') ? current.slice(0, -1) : `${current}.`;

  await editor.fill(updated);
  await modal.getByRole('button', { name: /^save$/i }).click();
  await modal.waitFor({ state: 'hidden', timeout: 15000 });

  // Reload to verify the value returned by Naukri's server, not local page state.
  await page.goto(PROFILE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await editIcon.waitFor({ timeout: 30000 });
  await editIcon.click();
  ({ modal, editor } = await getHeadlineEditor(page));
  const saved = (await editor.inputValue()).trimEnd();
  if (saved !== updated) throw new Error('Headline save could not be verified against the reloaded profile.');

  log(`OK: headline ${current.endsWith('.') ? 'dot removed' : 'dot added'} and verified from Naukri.`);
}

async function printHeadlineEditorDiagnostics(page) {
  const diagnostics = await page.evaluate(() => {
    const isVisible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };
    const describe = (element) => ({
      tag: element.tagName.toLowerCase(),
      role: element.getAttribute('role'),
      ariaLabel: element.getAttribute('aria-label'),
      name: element.getAttribute('name'),
      type: element.getAttribute('type'),
      placeholder: element.getAttribute('placeholder'),
      visible: isVisible(element),
    });
    return {
      url: location.href,
      headlineModalVisible: [...document.querySelectorAll('form[name="resumeHeadlineForm"]')].some(isVisible),
      resumeHeadlineForms: document.querySelectorAll('form[name="resumeHeadlineForm"]').length,
      textareas: document.querySelectorAll('textarea').length,
      inputs: document.querySelectorAll('input').length,
      contenteditables: document.querySelectorAll('[contenteditable="true"]').length,
      accessibleControls: [...document.querySelectorAll('[role], button, input[type="button"], input[type="submit"]')]
        .filter(isVisible)
        .slice(0, 30)
        .map(describe),
    };
  });
  console.error(`[headline-editor debug] ${JSON.stringify(diagnostics)}`);
}

async function getHeadlineEditor(page) {
  const modal = page.locator('form[name="resumeHeadlineForm"]:visible');
  try {
    await modal.waitFor({ state: 'visible', timeout: 15000 });

    let editor = modal.locator('textarea#resumeHeadline:visible');
    if (await editor.count() === 0) {
      editor = modal.getByPlaceholder('Enter your resume headline...');
    }
    if (await editor.count() !== 1) {
      throw new Error('Could not uniquely locate the Resume headline editor inside its modal.');
    }
    await editor.waitFor({ state: 'visible', timeout: 15000 });
    return { modal, editor };
  } catch (error) {
    await printHeadlineEditorDiagnostics(page).catch(() => {});
    throw error;
  }
}

async function findVisibleUnique(page, selectors, description) {
  const startTime = Date.now();
  const timeout = 20000; // Wait up to 20 seconds for elements to load
  while (Date.now() - startTime < timeout) {
    for (const selector of selectors) {
      const locator = page.locator(selector);
      if (await locator.count() === 1) {
        return locator;
      }
    }
    await page.waitForTimeout(500);
  }
  throw new Error(`Could not uniquely locate the ${description} on Naukri's native login page.`);
}

async function hasAuthenticatedProfile(page) {
  if (!isAuthenticatedProfile(page.url())) return false;
  try {
    await page.locator('#lazyResumeHead span.edit.icon, [data-ga-track*="resumeHeadline"] .edit')
      .first()
      .waitFor({ state: 'visible', timeout: 10000 });
    return true;
  } catch {
    return false;
  }
}

async function loginWithNaukriCredentials(page) {
  if (!naukriCredentials.email || !naukriCredentials.password) {
    throw new Error('Naukri session is not authenticated. Add NAUKRI_EMAIL and NAUKRI_PASSWORD to your local .env, then run the refresh again.');
  }

  await page.goto(NATIVE_LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const emailField = await findVisibleUnique(page, [
    '#usernameField:visible',
    'input[name="username"]:visible',
    'input[type="email"]:visible',
    'input[autocomplete="username"]:visible',
  ], 'Naukri email field');
  const passwordField = await findVisibleUnique(page, [
    '#passwordField:visible',
    'input[name="password"]:visible',
    'input[type="password"]:visible',
    'input[autocomplete="current-password"]:visible',
  ], 'Naukri password field');
  const submitButton = await findVisibleUnique(page, [
    'button.blue-btn:visible',
    'button[type="submit"]:not(.otpButton):visible',
    'button[type="submit"]:visible',
    'button:has-text("Login"):visible',
    'button:has-text("Sign in"):visible',
  ], 'Naukri login submit button');

  await emailField.fill(naukriCredentials.email);
  await passwordField.fill(naukriCredentials.password);
  await submitButton.click();

  await page.waitForURL((url) => isAuthenticatedProfile(url.toString()), { timeout: 60000 }).catch(() => {});
  if (!isAuthenticatedProfile(page.url())) {
    await page.goto(PROFILE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  }
  if (!await hasAuthenticatedProfile(page)) {
    throw new Error('Native Naukri login did not reach an authenticated profile. Complete any required Naukri verification manually in the dedicated Chrome window, then run the refresh again.');
  }
}

(async () => {
  assertNaukriProfileUrl(PROFILE_URL);

  let browser;
  try {
    browser = await chromium.connectOverCDP(CDP_ENDPOINT, { timeout: 10000 });
  } catch {
    console.error('Naukri Chrome is not running or its local CDP endpoint is unavailable. Run:\n./start-naukri-chrome.sh\nthen authenticate with Naukri manually in that Chrome window.');
    process.exitCode = 1;
    return;
  }

  let page;
  let nativeLoginInProgress = false;
  try {
    const context = browser.contexts()[0];
    if (!context) throw new Error('No Chrome browser context is available through CDP.');
    page = context.pages().find((candidate) => isAuthenticatedProfile(candidate.url())) || await context.newPage();
    await page.goto(PROFILE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

    if (!await hasAuthenticatedProfile(page)) {
      nativeLoginInProgress = true;
      await loginWithNaukriCredentials(page);
      nativeLoginInProgress = false;
    }

    await updateAndVerifyHeadline(page);
  } catch (error) {
    if (page && !nativeLoginInProgress && !isNaukriLoginUrl(page.url())) {
      await page.screenshot({ path: ERROR_SHOT }).catch(() => {});
    }
    log(`ERROR: ${error.message.split('\n')[0]} (screenshot: naukri-refresh-error.png)`);
    process.exitCode = 1;
  } finally {
    // For a CDP connection, close() disconnects Playwright; Chrome stays open.
    await browser.close().catch(() => {});
  }
})();
