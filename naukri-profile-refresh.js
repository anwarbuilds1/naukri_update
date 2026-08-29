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
const { naukriProfileUrl, naukriCredentials, resumeFile, resumeUploadTimeoutMs, rawResumeFile, envPath } = require('./config');

const PROFILE_URL = naukriProfileUrl;
const CDP_ENDPOINT = 'http://127.0.0.1:9222';
const NATIVE_LOGIN_URL = `https://www.naukri.com/nlogin/login?URL=${encodeURIComponent(PROFILE_URL)}`;
const configDir = envPath ? path.dirname(envPath) : __dirname;
const LOG_FILE = path.join(configDir, 'naukri-refresh.log');
const ERROR_SHOT = path.join(configDir, 'naukri-refresh-error.png');

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
    await page.screenshot({ path: ERROR_SHOT }).catch(() => { });
    await printHeadlineEditorDiagnostics(page).catch(() => { });
    throw new Error('The headline field could not be updated.');
  }

  log('Step 12: Locate and click Save...');
  const saveButton = modal.getByRole('button', { name: /^save$/i });
  await saveButton.waitFor({ state: 'visible', timeout: 10000 });
  await saveButton.click();

  log('Step 13: Wait for save/network/UI completion...');
  await modal.waitFor({ state: 'hidden', timeout: 15000 });
  await page.waitForLoadState('networkidle').catch(() => { });

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
  await modalVerify.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => { });

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
    await printHeadlineEditorDiagnostics(page).catch(() => { });
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

  await page.waitForURL((url) => isAuthenticatedProfile(url.toString()), { timeout: 60000 }).catch(() => { });
  if (!isAuthenticatedProfile(page.url())) {
    await page.goto(PROFILE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  }
  if (!await hasAuthenticatedProfile(page)) {
    throw new Error('Native Naukri login did not reach an authenticated profile. Complete any required Naukri verification manually in the dedicated Chrome window, then run the refresh again.');
  }
}

function findAuthoritativeResume(resumeDir) {
  const resolvedDir = path.resolve(resumeDir);
  const hasRawConfig = rawResumeFile && rawResumeFile.trim() !== '';

  if (hasRawConfig) {
    const configuredPath = rawResumeFile.trim();
    const absolutePath = path.isAbsolute(configuredPath)
      ? configuredPath
      : path.resolve(configDir, configuredPath);

    // Path traversal check
    if (!absolutePath.startsWith(resolvedDir)) {
      throw new Error(`Path traversal warning: configured RESUME_FILE "${configuredPath}" is outside the resume directory.`);
    }

    if (fs.existsSync(absolutePath)) {
      const stat = fs.statSync(absolutePath);
      if (stat.isFile()) {
        return absolutePath;
      }
    }
    throw new Error('RESUME_FILE points to a file that does not exist.');
  }

  // Automatic Discovery
  if (!fs.existsSync(resolvedDir)) {
    throw new Error(`Resume directory does not exist: ${resolvedDir}`);
  }

  const files = fs.readdirSync(resolvedDir);
  const candidates = [];

  for (const file of files) {
    const filePath = path.join(resolvedDir, file);
    const stat = fs.statSync(filePath);

    if (!stat.isFile()) continue;
    if (file.startsWith('.')) continue;

    const ext = path.extname(file).toLowerCase();
    if (ext !== '.pdf') continue;

    // Ignore temporary files
    if (file.startsWith('.~lock') || file.endsWith('.tmp') || file.endsWith('.part') || file.endsWith('.crdownload')) {
      continue;
    }

    candidates.push(filePath);
  }

  if (candidates.length === 0) {
    throw new Error('No resume PDF found in the resume directory. Please add exactly one resume PDF or configure RESUME_FILE.');
  }

  if (candidates.length > 1) {
    throw new Error('Multiple resume files were found in the resume directory. Please keep only one resume or set RESUME_FILE explicitly.');
  }

  return candidates[0];
}

async function validateFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File does not exist: ${filePath}`);
  }
  const stat1 = fs.statSync(filePath);
  if (!stat1.isFile()) {
    throw new Error(`Not a regular file: ${filePath}`);
  }

  const ext = path.extname(filePath).toLowerCase();
  if (ext !== '.pdf') {
    throw new Error('The configured resume file exists but is not a valid/readable PDF.');
  }

  if (stat1.size === 0) {
    throw new Error('The configured resume file exists but is not a valid/readable PDF.');
  }

  // File stability check
  await new Promise(resolve => setTimeout(resolve, 500));
  const stat2 = fs.statSync(filePath);
  if (stat1.size !== stat2.size || stat1.mtimeMs !== stat2.mtimeMs) {
    throw new Error('The resume file appears to still be changing or is incomplete. Aborting this run to avoid uploading a partial file.');
  }

  // PDF signature check
  try {
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(4);
    fs.readSync(fd, buffer, 0, 4, 0);
    fs.closeSync(fd);
    if (buffer.toString() !== '%PDF') {
      throw new Error('Not valid %PDF header');
    }
  } catch (err) {
    throw new Error('The configured resume file exists but is not a valid/readable PDF.');
  }
}

function sanitizeFilename(filename) {
  const ext = path.extname(filename);
  let base = path.basename(filename, ext);

  // Remove existing trailing date in DD-MM-YYYY format
  base = base.replace(/[-_]\d{2}-\d{2}-\d{4}$/, '');

  // Sanitize characters: keep alphanumeric, underscores, dots.
  let sanitizedBase = base
    .replace(/[^a-zA-Z0-9_\.]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');

  if (!sanitizedBase) {
    sanitizedBase = 'resume';
  }

  const today = new Date();
  const dd = String(today.getDate()).padStart(2, '0');
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const yyyy = today.getFullYear();
  const todayStr = `${dd}-${mm}-${yyyy}`;

  return `${sanitizedBase}_${todayStr}${ext}`;
}

function isStaleDuplicate(filename, sourceBaseNormalized) {
  const ext = path.extname(filename).toLowerCase();
  if (ext !== '.pdf') return false;

  const nameLower = filename.toLowerCase();
  const sourceBaseLower = sourceBaseNormalized.toLowerCase();

  if (nameLower.includes(sourceBaseLower)) return true;
  if (nameLower.includes('resume') || nameLower.includes('cv')) return true;
  if (/[-_]\d{2}-\d{2}-\d{4}\.pdf$/i.test(nameLower)) return true;

  return false;
}

function cleanupStaleResumes(resumeDir, sourceFilePath, datedFilename) {
  const resolvedDir = path.resolve(resumeDir);
  const sourceBase = path.basename(sourceFilePath, path.extname(sourceFilePath));
  const sourceBaseNormalized = sourceBase.replace(/[-_]\d{2}-\d{2}-\d{4}$/, '');

  log('Scanning resume directory for stale/duplicate files to clean up...');
  const files = fs.readdirSync(resolvedDir);

  for (const file of files) {
    const filePath = path.join(resolvedDir, file);
    const absolutePath = path.resolve(filePath);

    if (!absolutePath.startsWith(resolvedDir)) {
      log(`WARNING: Skipping deletion check for "${file}" as it resolves outside the resume directory.`);
      continue;
    }

    if (absolutePath === path.resolve(sourceFilePath) || file === datedFilename) {
      continue;
    }

    if (isStaleDuplicate(file, sourceBaseNormalized)) {
      try {
        log(`Cleaning up stale/duplicate resume file: "${file}"`);
        fs.unlinkSync(absolutePath);
      } catch (err) {
        log(`WARNING: Failed to delete "${file}": ${err.message}`);
      }
    }
  }
}

async function uploadAndVerifyResume(page) {
  log('Step 1: Locate resume upload section...');
  const resumeDir = path.resolve(configDir, 'resume');

  // Find authoritative source resume
  const sourceFilePath = findAuthoritativeResume(resumeDir);
  log(`Found authoritative source resume: "${path.basename(sourceFilePath)}"`);

  // Validate the file and verify size stability
  log('Step 2: Validating source resume file...');
  await validateFile(sourceFilePath);

  // Generate dynamic Naukri upload filename
  const datedFilename = sanitizeFilename(path.basename(sourceFilePath));
  const datedFilePath = path.join(resumeDir, datedFilename);

  log(`Target upload filename: "${datedFilename}"`);

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

  // Create temporary copy if names differ
  const isTempCopy = (path.resolve(sourceFilePath) !== path.resolve(datedFilePath));
  if (isTempCopy) {
    log('Step 3: Creating temporary dated resume copy...');
    fs.copyFileSync(sourceFilePath, datedFilePath);
  } else {
    log('Step 3: Source file is already named correctly with today\'s date. No temporary copy needed.');
  }

  try {
    log('Step 4: Locating and setting the file input...');
    const fileInput = page.locator('input#attachCV');
    await fileInput.waitFor({ state: 'attached', timeout: 15000 });

    // Handle any potential dialogs
    page.on('dialog', async dialog => {
      log(`Dialog appeared: "${dialog.message()}". Accepting.`);
      await dialog.accept().catch(() => { });
    });

    await fileInput.setInputFiles(datedFilePath);
    log('Step 5: File input filled. Waiting for upload process to start...');

    const progressEl = page.locator('#lazyAttachCV .progress, #lazyAttachCV [class*="progress"], #lazyAttachCV [class*="loading"], #lazyAttachCV [class*="loader"], #lazyAttachCV [class*="spinner"]');
    const successMsg = page.locator('#attachCVMsgBox .msgBox.success, #attachCVMsgBox .success');

    // Wait up to 15 seconds for either progress bar or success message to appear
    const uploadStarted = await page.waitForFunction((selectors) => {
      const prog = document.querySelector(selectors.progress);
      const succ = document.querySelector(selectors.success);
      return (prog && prog.getBoundingClientRect().width > 0) || (succ && succ.getBoundingClientRect().width > 0);
    }, {
      progress: '#lazyAttachCV .progress, #lazyAttachCV [class*="progress"], #lazyAttachCV [class*="loading"], #lazyAttachCV [class*="loader"], #lazyAttachCV [class*="spinner"]',
      success: '#attachCVMsgBox .msgBox.success, #attachCVMsgBox .success'
    }, { timeout: 15000 }).catch(() => null);

    if (!uploadStarted) {
      log('WARNING: Did not detect progress bar or success message start indicator within 15 seconds. Proceeding to verify state...');
    }

    log('Step 6: Waiting for upload completion...');
    const uploadTimeout = resumeUploadTimeoutMs || 120000;
    const startWait = Date.now();
    let verified = false;
    let lastLoggedPercent = -1;

    while (Date.now() - startWait < uploadTimeout) {
      let isUploading = false;
      let percent = -1;
      if (await progressEl.count() > 0 && await progressEl.first().isVisible()) {
        isUploading = true;
        const widthStyle = await progressEl.first().locator('.determinate').first().getAttribute('style').catch(() => null);
        if (widthStyle) {
          const match = widthStyle.match(/width:\s*(\d+)%/);
          if (match) {
            percent = parseInt(match[1], 10);
          }
        }
      }

      if (isUploading) {
        if (percent !== -1 && percent !== lastLoggedPercent) {
          log(`Upload progress: ${percent}%`);
          lastLoggedPercent = percent;
        } else if (lastLoggedPercent === -1) {
          log(`Upload is in progress...`);
          lastLoggedPercent = 0;
        }
      }

      let hasSuccessMsg = false;
      if (await successMsg.count() > 0 && await successMsg.first().isVisible()) {
        const text = await successMsg.first().innerText();
        if (text.includes('Resume has been successfully uploaded.')) {
          hasSuccessMsg = true;
        }
      }

      let hasNewName = false;
      if (await resumeNameEl.count() > 0) {
        const currentName = (await resumeNameEl.innerText()).trim();
        if (currentName === datedFilename) {
          hasNewName = true;
        }
      }

      // Complete only if success message is visible, the name is updated to new file, and progress bar is either gone or reads 100%
      if (hasSuccessMsg && hasNewName && (!isUploading || percent === 100)) {
        log('Upload completion verified.');
        verified = true;
        break;
      }

      await page.waitForTimeout(500);
    }

    if (!verified) {
      const progressHTML = await progressEl.count() > 0 ? await progressEl.first().evaluate(el => el.outerHTML).catch(() => '') : 'none';
      const successHTML = await successMsg.count() > 0 ? await successMsg.first().evaluate(el => el.outerHTML).catch(() => '') : 'none';
      const currentNameText = await resumeNameEl.count() > 0 ? await resumeNameEl.innerText().catch(() => '') : 'none';
      log(`[diagnostics] Upload timeout reached. Progress HTML: ${progressHTML}, Success HTML: ${successHTML}, Current Name: "${currentNameText}"`);

      throw new Error(`Resume upload failed to complete/verify within ${uploadTimeout / 1000} seconds.`);
    }

    log('Step 7: Checking for optional Save button...');
    const saveBtn = page.locator('#lazyAttachCV button:has-text("Save"), #lazyAttachCV input[type="button"][value="Save"], #lazyAttachCV input[type="submit"][value="Save"]').first();
    if (await saveBtn.count() > 0 && await saveBtn.isVisible()) {
      log('Found a Save button in the resume section. Clicking Save...');
      await saveBtn.click();
      await page.waitForLoadState('networkidle').catch(() => { });
    } else {
      log('No Save button found; Naukri auto-saved the upload.');
    }

    log('Step 8: Reloading the profile for final verification...');
    await page.reload({ waitUntil: 'networkidle', timeout: 60000 });

    if (!await hasAuthenticatedProfile(page)) {
      throw new Error('Not on authenticated profile page after reload during post-save verification.');
    }

    const finalResumeNameEl = page.locator('#lazyAttachCV .resume-name-inline, .attachCV .resume-name-inline').first();
    await finalResumeNameEl.waitFor({ state: 'visible', timeout: 15000 });
    const finalName = (await finalResumeNameEl.innerText()).trim();
    if (finalName !== datedFilename) {
      throw new Error(`Post-save verification failed: final resume filename on profile is "${finalName}", expected "${datedFilename}"`);
    }

    log(`OK: Resume uploaded, saved, and verified from Naukri. New filename: "${datedFilename}"`);

    log('Step 9: Cleaning up temporary copies and stale duplicate files...');
    if (isTempCopy && fs.existsSync(datedFilePath)) {
      fs.unlinkSync(datedFilePath);
      log('Temporary file deleted successfully.');
    }
    cleanupStaleResumes(resumeDir, sourceFilePath, datedFilename);
    log('Cleanup completed successfully.');
  } catch (error) {
    if (isTempCopy && fs.existsSync(datedFilePath)) {
      log(`ERROR: Resume upload failed. Temporary file kept at: ${datedFilePath} for debugging.`);
    }
    throw error;
  }
}

if (require.main === module) {
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
      console.error('Naukri Chrome is not running or its local CDP endpoint is unavailable. Please launch Naukri Update and click Connect Chrome.');
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
        await page.screenshot({ path: ERROR_SHOT }).catch(() => { });
      }
      log(`ERROR: ${error.message.split('\n')[0]} (screenshot: naukri-refresh-error.png)`);
      process.exitCode = 1;
    } finally {
      // For a CDP connection, close() disconnects Playwright; Chrome stays open.
      await browser.close().catch(() => { });
    }
  })();
} else {
  module.exports = {
    findAuthoritativeResume,
    validateFile,
    sanitizeFilename,
    isStaleDuplicate,
    cleanupStaleResumes,
    uploadAndVerifyResume
  };
}
