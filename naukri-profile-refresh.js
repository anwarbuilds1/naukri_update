// Node.js version validation
const nodeVersion = process.versions.node;
const majorVersion = parseInt(nodeVersion.split('.')[0], 10);
if (majorVersion < 20) {
  console.error(`ERROR: Node.js 20 or higher is required. You are running Node.js ${nodeVersion}.`);
  process.exit(1);
}

/**
 * Refreshes Naukri profile details (resume headline and resume PDF file) through
 * a manually started, localhost-only Chrome DevTools endpoint.
 */
const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');
const { naukriProfileUrl, naukriCredentials, resumeFile } = require('./config');

const PROFILE_URL = naukriProfileUrl;
const CDP_ENDPOINT = 'http://127.0.0.1:9222';
const NATIVE_LOGIN_URL = `https://www.naukri.com/nlogin/login?URL=${encodeURIComponent(PROFILE_URL)}`;
const LOG_FILE = path.join(__dirname, 'naukri-refresh.log');
const ERROR_SHOT = path.join(__dirname, 'naukri-refresh-error.png');

function initializeLog() {
  fs.appendFileSync(LOG_FILE, `=== RUN START ===\n`);
  try {
    const content = fs.readFileSync(LOG_FILE, 'utf8');
    const runs = content.split(/^=== RUN START ===/m);
    if (runs.length > 6) {
      const keptRuns = runs.slice(runs.length - 5);
      const newContent = keptRuns.map(run => '=== RUN START ===' + run).join('');
      fs.writeFileSync(LOG_FILE, newContent, 'utf8');
    }
  } catch (err) {
    console.error(`Failed to rotate log file: ${err.message}`);
  }
}
initializeLog();

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
  log('Step 1: Navigate to Naukri profile...');
  await page.goto(PROFILE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

  log('Step 2: Confirm authenticated profile page...');
  if (!await hasAuthenticatedProfile(page)) {
    throw new Error('Not on authenticated profile page.');
  }

  log('Step 3: Locate Resume Headline section and Edit icon...');
  const editIcon = page.locator('#lazyResumeHead span.edit.icon, [data-ga-track*="resumeHeadline"] .edit').first();
  await editIcon.waitFor({ state: 'visible', timeout: 30000 });

  log('Step 4: Click Edit (or skip if modal is already open)...');
  const modal = page.locator('form[name="resumeHeadlineForm"]');
  if (await modal.isVisible()) {
    log('Headline modal is already visible; skipping Edit icon click.');
  } else {
    log('Clicking the Edit icon...');
    try {
      await editIcon.click({ timeout: 10000 });
    } catch (e) {
      log(`Normal click failed or was intercepted: ${e.message}. Trying forced click...`);
      await editIcon.click({ force: true });
    }
  }

  log('Step 5: Confirm the headline editor/modal is visible...');
  await modal.waitFor({ state: 'visible', timeout: 15000 });

  log('Step 6: Locate the actual headline input...');
  let editor = modal.locator('textarea#resumeHeadline:visible');
  if (await editor.count() === 0) {
    editor = modal.getByPlaceholder('Enter your resume headline...');
  }
  await editor.waitFor({ state: 'visible', timeout: 15000 });

  log('Step 7: Read its current value...');
  const currentHeadline = (await editor.inputValue()).trimEnd();
  log(`Current headline: "${currentHeadline}"`);
  if (!currentHeadline) {
    throw new Error('Resume headline is empty; nothing was changed.');
  }

  log('Step 8: Calculate expected headline...');
  let expectedHeadline;
  if (currentHeadline.endsWith(".")) {
    expectedHeadline = currentHeadline.slice(0, -1);
  } else {
    expectedHeadline = `${currentHeadline}.`;
  }
  log(`Expected headline: "${expectedHeadline}"`);

  log('Step 9: Fill the input...');
  await editor.fill(expectedHeadline);

  log('Step 10: Read the input again immediately after filling...');
  const afterFill = (await editor.inputValue()).trimEnd();
  log(`After fill: "${afterFill}"`);

  log('Step 11: Verify the input actually changed...');
  if (afterFill !== expectedHeadline) {
    log('ERROR: The input value after fill does not match the expected headline.');
    await page.screenshot({ path: ERROR_SHOT }).catch(() => {});
    await printHeadlineEditorDiagnostics(page).catch(() => {});
    throw new Error('The headline field could not be updated.');
  }

  log('Step 12: Locate and click Save...');
  const saveButton = modal.getByRole('button', { name: /^save$/i });
  await saveButton.waitFor({ state: 'visible', timeout: 10000 });
  await saveButton.click();

  log('Step 13: Wait for save/network/UI completion...');
  await modal.waitFor({ state: 'hidden', timeout: 15000 });
  await page.waitForLoadState('networkidle').catch(() => {});

  log('Step 14: Reload the profile...');
  await page.reload({ waitUntil: 'networkidle', timeout: 60000 });

  log('Step 15: Confirm authenticated profile page after reload...');
  if (!await hasAuthenticatedProfile(page)) {
    throw new Error('Not on authenticated profile page after reload.');
  }

  log('Step 16: Open the headline editor again for verification...');
  const editIconVerify = page.locator('#lazyResumeHead span.edit.icon, [data-ga-track*="resumeHeadline"] .edit').first();
  await editIconVerify.waitFor({ state: 'visible', timeout: 30000 });
  
  const modalVerify = page.locator('form[name="resumeHeadlineForm"]');
  if (await modalVerify.isVisible()) {
    log('Headline modal is already visible on verification; skipping click.');
  } else {
    try {
      await editIconVerify.click({ timeout: 10000 });
    } catch (e) {
      log(`Normal click on verification failed/intercepted: ${e.message}. Trying forced click...`);
      await editIconVerify.click({ force: true });
    }
  }
  await modalVerify.waitFor({ state: 'visible', timeout: 15000 });

  log('Step 17: Read the saved headline...');
  let editorVerify = modalVerify.locator('textarea#resumeHeadline:visible');
  if (await editorVerify.count() === 0) {
    editorVerify = modalVerify.getByPlaceholder('Enter your resume headline...');
  }
  await editorVerify.waitFor({ state: 'visible', timeout: 15000 });
  const saved = (await editorVerify.inputValue()).trimEnd();
  log(`Saved headline: "${saved}"`);

  log('Step 18: Close the verification modal...');
  const cancelBtn = modalVerify.locator('a.cancel-btn, button:has-text("Cancel"), a:has-text("Cancel")').first();
  if (await cancelBtn.count() > 0) {
    await cancelBtn.click();
  }
  await modalVerify.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});

  log('Step 19: Compare saved value with expected value...');
  if (saved !== expectedHeadline) {
    throw new Error('ERROR: headline was not changed/verified.');
  }

  log(`OK: headline ${currentHeadline.endsWith('.') ? 'dot removed' : 'dot added'} and verified from Naukri.`);
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

async function uploadAndVerifyResume(page) {
  log('Step 1: Locate resume upload section...');
  const absoluteResumePath = path.isAbsolute(resumeFile)
    ? resumeFile
    : path.resolve(__dirname, resumeFile);

  const dir = path.dirname(absoluteResumePath);
  const ext = path.extname(absoluteResumePath);
  const base = path.basename(absoluteResumePath, ext);

  // Generate today's dated filename
  const today = new Date();
  const dd = String(today.getDate()).padStart(2, '0');
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const yyyy = today.getFullYear();
  const todayStr = `${dd}-${mm}-${yyyy}`;
  const datedFilename = `${base}_${todayStr}${ext}`;
  const datedFilePath = path.join(dir, datedFilename);

  log(`Target resume filename: "${datedFilename}"`);

  // Check if today's resume is already uploaded
  const resumeNameEl = page.locator('#lazyAttachCV .resume-name-inline, .attachCV .resume-name-inline').first();
  if (await resumeNameEl.count() > 0) {
    const currentName = (await resumeNameEl.innerText()).trim();
    log(`Current resume name on Naukri: "${currentName}"`);
    if (currentName === datedFilename) {
      log(`Today's resume "${datedFilename}" is already uploaded. Skipping upload.`);
      return;
    }
  }

  log('Step 2: Check master resume file exists...');
  if (!fs.existsSync(absoluteResumePath)) {
    throw new Error(`Master resume not found at: ${absoluteResumePath}`);
  }

  log('Step 3: Creating temporary dated resume copy...');
  fs.copyFileSync(absoluteResumePath, datedFilePath);

  try {
    log('Step 4: Locating and setting the file input...');
    const fileInput = page.locator('input#attachCV');
    await fileInput.waitFor({ state: 'attached', timeout: 15000 });

    // Handle any potential dialogs
    page.on('dialog', async dialog => {
      log(`Dialog appeared: "${dialog.message()}". Accepting.`);
      await dialog.accept().catch(() => {});
    });

    await fileInput.setInputFiles(datedFilePath);
    log('Step 5: File input filled. Waiting for upload verification...');

    // Wait for the name to be updated on page (up to 30 seconds)
    let verified = false;
    for (let attempt = 1; attempt <= 30; attempt++) {
      if (await resumeNameEl.count() > 0) {
        const name = (await resumeNameEl.innerText()).trim();
        if (name === datedFilename) {
          verified = true;
          break;
        }
      }
      await page.waitForTimeout(1000);
    }

    if (!verified) {
      throw new Error(`Resume filename verification failed. Name did not update to: ${datedFilename}`);
    }

    log(`OK: Resume uploaded and verified from Naukri. New filename: "${datedFilename}"`);
    
    log('Step 6: Deleting temporary dated resume copy...');
    fs.unlinkSync(datedFilePath);
    log('Temporary file deleted successfully.');
  } catch (error) {
    log(`ERROR: Resume upload failed. Temporary file kept at: ${datedFilePath} for debugging.`);
    throw error;
  }
}

(async () => {
  assertNaukriProfileUrl(PROFILE_URL);

  const args = process.argv.slice(2);
  const runHeadline = args.includes('--refresh-headline') || args.length === 0;
  const runResume = args.includes('--upload-resume');

  if (!runHeadline && !runResume) {
    console.error('No tasks specified. Use --refresh-headline and/or --upload-resume.');
    process.exit(1);
  }

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

    if (runHeadline) {
      await updateAndVerifyHeadline(page);
    }
    if (runResume) {
      await uploadAndVerifyResume(page);
    }
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
