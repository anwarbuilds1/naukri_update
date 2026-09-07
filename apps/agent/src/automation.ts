/**
 * Naukri Playwright Automation Engine.
 *
 * Extracted directly from naukri-profile-refresh.js to maintain 100% behavioral
 * parity while supporting clean dependency injection and structured RunResult output.
 *
 * Key responsibilities:
 * - Session verification & native credentials login
 * - 18-step verified headline refresh with trailing-dot toggle
 * - Authoritative resume discovery, validation, upload, and verification
 * - Diagnostics and local logging
 * - Playwright connection over CDP (chromium.connectOverCDP)
 */

import * as fs from 'fs';
import * as path from 'path';
import { chromium, type Browser, type Locator, type Page } from 'playwright-core';
import type { RunResult, TaskType } from '@naukri-update/shared';
import { checkCDPAvailable, ensureChromeRunning } from './chrome.js';

export interface AutomationOptions {
  /** CDP endpoint for Chrome DevTools (default: http://127.0.0.1:9222) */
  cdpEndpoint: string;
  /** Naukri user profile URL (https://www.naukri.com/mnjuser/profile) */
  naukriProfileUrl: string;
  /** Naukri native login URL */
  naukriLoginUrl?: string;
  /** Naukri account email */
  naukriEmail?: string;
  /** Naukri account password (never logged or sent to external services) */
  naukriPassword?: string;
  /** Application base configuration directory */
  configDir: string;
  /** Chrome user data profile directory */
  profileDir?: string;
  /** Directory containing candidate resumes */
  resumeDir?: string;
  /** Explicitly configured resume file if specified in config/env */
  rawResumeFile?: string;
  /** Timeout in milliseconds for resume upload completion (default: 120000) */
  resumeUploadTimeoutMs?: number;
  /** Path to append human-readable log lines */
  logFile?: string;
  /** Path to save failure screenshots */
  errorScreenshot?: string;
}

export type Logger = (message: string) => void;

// ─── Shared URL & Authentication Helpers ─────────────────────────────────────

export function assertNaukriProfileUrl(url: string): void {
  const parsed = new URL(url);
  if (
    parsed.protocol !== 'https:' ||
    (parsed.hostname !== 'naukri.com' && !parsed.hostname.endsWith('.naukri.com')) ||
    !parsed.pathname.startsWith('/mnjuser/')
  ) {
    throw new Error('NAUKRI_PROFILE_URL must be an HTTPS Naukri /mnjuser/ URL.');
  }
}

export function isAuthenticatedProfile(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      (parsed.hostname === 'naukri.com' || parsed.hostname.endsWith('.naukri.com')) &&
      parsed.pathname.startsWith('/mnjuser')
    );
  } catch {
    return false;
  }
}

export function isNaukriLoginUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      (parsed.hostname === 'naukri.com' || parsed.hostname.endsWith('.naukri.com')) &&
      parsed.pathname.startsWith('/nlogin')
    );
  } catch {
    return false;
  }
}

export async function hasAuthenticatedProfile(page: Page): Promise<boolean> {
  if (!isAuthenticatedProfile(page.url())) return false;
  try {
    await page
      .locator('#lazyResumeHead span.edit.icon, [data-ga-track*="resumeHeadline"] .edit')
      .first()
      .waitFor({ state: 'visible', timeout: 10000 });
    return true;
  } catch {
    return false;
  }
}

export async function findVisibleUnique(
  page: Page,
  selectors: string[],
  description: string
): Promise<Locator> {
  const startTime = Date.now();
  const timeout = 20000;
  while (Date.now() - startTime < timeout) {
    for (const selector of selectors) {
      const locator = page.locator(selector);
      if ((await locator.count()) === 1) {
        return locator;
      }
    }
    await page.waitForTimeout(500);
  }
  throw new Error(`Could not uniquely locate the ${description} on Naukri's native login page.`);
}

export async function loginWithNaukriCredentials(
  page: Page,
  options: AutomationOptions,
  logger: Logger = console.log
): Promise<void> {
  const email = options.naukriEmail;
  const password = options.naukriPassword;
  const profileUrl = options.naukriProfileUrl;
  const loginUrl =
    options.naukriLoginUrl ??
    `https://www.naukri.com/nlogin/login?URL=${encodeURIComponent(profileUrl)}`;

  if (!email || !password) {
    throw new Error(
      'Naukri session is not authenticated. Add NAUKRI_EMAIL and NAUKRI_PASSWORD to your local configuration, then run again.'
    );
  }

  logger(`[login] Navigating to Naukri native login...`);
  await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

  const emailField = await findVisibleUnique(
    page,
    [
      '#usernameField:visible',
      'input[name="username"]:visible',
      'input[type="email"]:visible',
      'input[autocomplete="username"]:visible',
    ],
    'Naukri email field'
  );

  const passwordField = await findVisibleUnique(
    page,
    [
      '#passwordField:visible',
      'input[name="password"]:visible',
      'input[type="password"]:visible',
      'input[autocomplete="current-password"]:visible',
    ],
    'Naukri password field'
  );

  const submitButton = await findVisibleUnique(
    page,
    [
      'button.blue-btn:visible',
      'button[type="submit"]:not(.otpButton):visible',
      'button[type="submit"]:visible',
      'button:has-text("Login"):visible',
      'button:has-text("Sign in"):visible',
    ],
    'Naukri login submit button'
  );

  await emailField.fill(email);
  await passwordField.fill(password);
  await submitButton.click();

  await page.waitForURL((url) => isAuthenticatedProfile(url.toString()), { timeout: 60000 }).catch(() => {});
  if (!isAuthenticatedProfile(page.url())) {
    await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  }

  if (!(await hasAuthenticatedProfile(page))) {
    const currentUrl = page.url();
    const isOtpOrCaptcha =
      currentUrl.includes('/otp') ||
      currentUrl.includes('/verify') ||
      currentUrl.includes('/challenge') ||
      currentUrl.includes('/verification');

    if (isOtpOrCaptcha) {
      throw new Error(
        'Naukri requires OTP or CAPTCHA verification. Complete the verification manually in the Chrome window, then run the refresh again.'
      );
    }

    throw new Error(
      'Native Naukri login did not reach an authenticated profile. Complete any required Naukri verification manually in the dedicated Chrome window, then run the refresh again.'
    );
  }
}

// ─── Headline Automation (18-step verified flow) ─────────────────────────────

export async function printHeadlineEditorDiagnostics(
  page: Page,
  logger: Logger = console.log
): Promise<void> {
  try {
    const diagnostics = await page.evaluate(() => {
      const isVisible = (element: Element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      };
      const describe = (element: Element) => ({
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
        accessibleControls: [
          ...document.querySelectorAll('[role], button, input[type="button"], input[type="submit"]'),
        ]
          .filter(isVisible)
          .slice(0, 30)
          .map(describe),
      };
    });
    logger(`[headline-editor debug] ${JSON.stringify(diagnostics)}`);
  } catch {
    // ignore diagnostics failure
  }
}

export async function updateAndVerifyHeadline(
  page: Page,
  options: AutomationOptions,
  logger: Logger = console.log
): Promise<string> {
  const profileUrl = options.naukriProfileUrl;
  const errorShot = options.errorScreenshot ?? path.join(options.configDir, 'naukri-refresh-error.png');

  logger('Step 1: Navigate to Naukri profile...');
  await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

  logger('Step 2: Confirm authenticated profile page...');
  if (!(await hasAuthenticatedProfile(page))) {
    throw new Error('Not on authenticated profile page.');
  }

  logger('Step 3: Locate Resume Headline section and Edit icon...');
  const editIcon = page
    .locator('#lazyResumeHead span.edit.icon, [data-ga-track*="resumeHeadline"] .edit')
    .first();
  await editIcon.waitFor({ state: 'visible', timeout: 30000 });

  logger('Step 4: Click Edit (or skip if modal is already open)...');
  const modal = page.locator('form[name="resumeHeadlineForm"]');
  if (await modal.isVisible()) {
    logger('Headline modal is already visible; skipping Edit icon click.');
  } else {
    logger('Clicking the Edit icon...');
    try {
      await editIcon.click({ timeout: 10000 });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      logger(`Normal click failed or was intercepted: ${msg}. Trying forced click...`);
      await editIcon.click({ force: true });
    }
  }

  logger('Step 5: Confirm the headline editor/modal is visible...');
  await modal.waitFor({ state: 'visible', timeout: 15000 });

  logger('Step 6: Locate the actual headline input...');
  let editor = modal.locator('textarea#resumeHeadline:visible');
  if ((await editor.count()) === 0) {
    editor = modal.getByPlaceholder('Enter your resume headline...');
  }
  await editor.waitFor({ state: 'visible', timeout: 15000 });

  logger('Step 7: Read its current value...');
  const currentHeadline = (await editor.inputValue()).trimEnd();
  logger(`Current headline: "${currentHeadline}"`);
  if (!currentHeadline) {
    throw new Error('Resume headline is empty; nothing was changed.');
  }

  logger('Step 8: Calculate expected headline...');
  let expectedHeadline: string;
  if (currentHeadline.endsWith('.')) {
    expectedHeadline = currentHeadline.slice(0, -1);
  } else {
    expectedHeadline = `${currentHeadline}.`;
  }
  logger(`Expected headline: "${expectedHeadline}"`);

  logger('Step 9: Fill the input...');
  await editor.fill(expectedHeadline);

  logger('Step 10: Read the input again immediately after filling...');
  const afterFill = (await editor.inputValue()).trimEnd();
  logger(`After fill: "${afterFill}"`);

  logger('Step 11: Verify the input actually changed...');
  if (afterFill !== expectedHeadline) {
    logger('ERROR: The input value after fill does not match the expected headline.');
    await page.screenshot({ path: errorShot }).catch(() => {});
    await printHeadlineEditorDiagnostics(page, logger).catch(() => {});
    throw new Error('The headline field could not be updated.');
  }

  logger('Step 12: Locate and click Save...');
  const saveButton = modal.getByRole('button', { name: /^save$/i });
  await saveButton.waitFor({ state: 'visible', timeout: 10000 });
  await saveButton.click();

  logger('Step 13: Wait for save/network/UI completion...');
  await modal.waitFor({ state: 'hidden', timeout: 15000 });
  await page.waitForLoadState('networkidle').catch(() => {});

  logger('Step 14: Reload the profile...');
  await page.reload({ waitUntil: 'networkidle', timeout: 60000 });

  logger('Step 15: Confirm authenticated profile page after reload...');
  if (!(await hasAuthenticatedProfile(page))) {
    throw new Error('Not on authenticated profile page after reload.');
  }

  logger('Step 16: Open the headline editor again for verification...');
  const editIconVerify = page
    .locator('#lazyResumeHead span.edit.icon, [data-ga-track*="resumeHeadline"] .edit')
    .first();
  await editIconVerify.waitFor({ state: 'visible', timeout: 30000 });

  const modalVerify = page.locator('form[name="resumeHeadlineForm"]');
  if (await modalVerify.isVisible()) {
    logger('Headline modal is already visible on verification; skipping click.');
  } else {
    try {
      await editIconVerify.click({ timeout: 10000 });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      logger(`Normal click on verification failed/intercepted: ${msg}. Trying forced click...`);
      await editIconVerify.click({ force: true });
    }
  }
  await modalVerify.waitFor({ state: 'visible', timeout: 15000 });

  logger('Step 17: Read the saved headline...');
  let editorVerify = modalVerify.locator('textarea#resumeHeadline:visible');
  if ((await editorVerify.count()) === 0) {
    editorVerify = modalVerify.getByPlaceholder('Enter your resume headline...');
  }
  await editorVerify.waitFor({ state: 'visible', timeout: 15000 });
  const saved = (await editorVerify.inputValue()).trimEnd();
  logger(`Saved headline: "${saved}"`);

  logger('Step 18: Close the verification modal...');
  const cancelBtn = modalVerify
    .locator('a.cancel-btn, button:has-text("Cancel"), a:has-text("Cancel")')
    .first();
  if ((await cancelBtn.count()) > 0) {
    await cancelBtn.click();
  }
  await modalVerify.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});

  logger('Step 19: Compare saved value with expected value...');
  if (saved !== expectedHeadline) {
    throw new Error('ERROR: headline was not changed/verified.');
  }

  const actionDone = currentHeadline.endsWith('.') ? 'dot removed' : 'dot added';
  const successMsg = `OK: headline ${actionDone} and verified from Naukri.`;
  logger(successMsg);
  return successMsg;
}

// ─── Resume Automation & File Utilities ──────────────────────────────────────

export function findAuthoritativeResume(
  resumeDir: string,
  rawResumeFile?: string,
  configDir?: string
): string {
  const resolvedDir = path.resolve(resumeDir);
  const hasRawConfig = rawResumeFile && rawResumeFile.trim() !== '';

  if (hasRawConfig) {
    const configuredPath = rawResumeFile.trim();
    const absolutePath = path.isAbsolute(configuredPath)
      ? configuredPath
      : path.resolve(configDir ?? process.cwd(), configuredPath);

    // Path traversal check
    if (!absolutePath.startsWith(resolvedDir)) {
      throw new Error(
        `Path traversal warning: configured RESUME_FILE "${configuredPath}" is outside the resume directory.`
      );
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
  const candidates: string[] = [];

  for (const file of files) {
    const filePath = path.join(resolvedDir, file);
    const stat = fs.statSync(filePath);

    if (!stat.isFile()) continue;
    if (file.startsWith('.')) continue;

    const ext = path.extname(file).toLowerCase();
    if (ext !== '.pdf') continue;

    // Ignore temporary files
    if (
      file.startsWith('.~lock') ||
      file.endsWith('.tmp') ||
      file.endsWith('.part') ||
      file.endsWith('.crdownload')
    ) {
      continue;
    }

    candidates.push(filePath);
  }

  if (candidates.length === 0) {
    throw new Error(
      'No resume PDF found in the resume directory. Please add exactly one resume PDF or configure RESUME_FILE.'
    );
  }

  if (candidates.length > 1) {
    throw new Error(
      'Multiple resume files were found in the resume directory. Please keep only one resume or set RESUME_FILE explicitly.'
    );
  }

  return candidates[0]!;
}

export async function validateFile(filePath: string): Promise<void> {
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
  await new Promise((resolve) => setTimeout(resolve, 500));
  const stat2 = fs.statSync(filePath);
  if (stat1.size !== stat2.size || stat1.mtimeMs !== stat2.mtimeMs) {
    throw new Error(
      'The resume file appears to still be changing or is incomplete. Aborting this run to avoid uploading a partial file.'
    );
  }

  // PDF signature check
  try {
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(4);
    fs.readSync(fd, buffer, 0, 4, 0);
    fs.closeSync(fd);
    if (buffer.toString('utf8') !== '%PDF') {
      throw new Error('Not valid %PDF header');
    }
  } catch {
    throw new Error('The configured resume file exists but is not a valid/readable PDF.');
  }
}

export function sanitizeFilename(filename: string, now: Date = new Date()): string {
  // Normalize backslashes to forward slashes to protect against cross-platform traversal
  const normalized = filename.replace(/\\/g, '/');
  const ext = path.extname(normalized);
  let base = path.basename(normalized, ext);

  // Remove existing trailing date in DD-MM-YYYY format
  base = base.replace(/[-_]\d{2}-\d{2}-\d{4}$/, '');

  // Strip leading dots or slashes from basename
  base = base.replace(/^[.\s_-]+/, '');

  // Sanitize characters: keep alphanumeric, underscores.
  let sanitizedBase = base
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');

  if (!sanitizedBase) {
    sanitizedBase = 'resume';
  }

  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  const todayStr = `${dd}-${mm}-${yyyy}`;

  return `${sanitizedBase}_${todayStr}${ext}`;
}

export function isStaleDuplicate(filename: string, sourceBaseNormalized: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  if (ext !== '.pdf') return false;

  const nameLower = filename.toLowerCase();
  const sourceBaseLower = sourceBaseNormalized.toLowerCase();

  if (nameLower.includes(sourceBaseLower)) return true;
  if (nameLower.includes('resume') || nameLower.includes('cv')) return true;
  if (/[-_]\d{2}-\d{2}-\d{4}\.pdf$/i.test(nameLower)) return true;

  return false;
}

export function cleanupStaleResumes(
  resumeDir: string,
  sourceFilePath: string,
  datedFilename: string,
  logger: Logger = console.log
): void {
  const resolvedDir = path.resolve(resumeDir);
  const sourceBase = path.basename(sourceFilePath, path.extname(sourceFilePath));
  const sourceBaseNormalized = sourceBase.replace(/[-_]\d{2}-\d{2}-\d{4}$/, '');

  logger('Scanning resume directory for stale/duplicate files to clean up...');
  const files = fs.readdirSync(resolvedDir);

  for (const file of files) {
    const filePath = path.join(resolvedDir, file);
    const absolutePath = path.resolve(filePath);

    if (!absolutePath.startsWith(resolvedDir)) {
      logger(`WARNING: Skipping deletion check for "${file}" as it resolves outside the resume directory.`);
      continue;
    }

    if (absolutePath === path.resolve(sourceFilePath) || file === datedFilename) {
      continue;
    }

    if (isStaleDuplicate(file, sourceBaseNormalized)) {
      try {
        logger(`Cleaning up stale/duplicate resume file: "${file}"`);
        fs.unlinkSync(absolutePath);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        logger(`WARNING: Failed to delete "${file}": ${msg}`);
      }
    }
  }
}

export async function uploadAndVerifyResume(
  page: Page,
  options: AutomationOptions,
  logger: Logger = console.log
): Promise<string> {
  logger('Step 1: Locate resume upload section...');
  const resumeDir = path.resolve(options.resumeDir ?? path.join(options.configDir, 'resume'));

  // Find authoritative source resume
  const sourceFilePath = findAuthoritativeResume(resumeDir, options.rawResumeFile, options.configDir);
  logger(`Found authoritative source resume: "${path.basename(sourceFilePath)}"`);

  // Validate the file and verify size stability
  logger('Step 2: Validating source resume file...');
  await validateFile(sourceFilePath);

  // Generate dynamic Naukri upload filename
  const datedFilename = sanitizeFilename(path.basename(sourceFilePath));
  const datedFilePath = path.join(resumeDir, datedFilename);

  logger(`Target upload filename: "${datedFilename}"`);

  // Check if today's resume is already uploaded
  const resumeNameEl = page.locator('#lazyAttachCV .resume-name-inline, .attachCV .resume-name-inline').first();
  if ((await resumeNameEl.count()) > 0) {
    const currentName = (await resumeNameEl.innerText()).trim();
    logger(`Current resume name on Naukri: "${currentName}"`);
    if (currentName === datedFilename) {
      const skipMsg = `Today's resume "${datedFilename}" is already uploaded. Skipping upload.`;
      logger(skipMsg);
      return skipMsg;
    }
  }

  // Create temporary copy if names differ
  const isTempCopy = path.resolve(sourceFilePath) !== path.resolve(datedFilePath);
  if (isTempCopy) {
    logger('Step 3: Creating temporary dated resume copy...');
    fs.copyFileSync(sourceFilePath, datedFilePath);
  } else {
    logger("Step 3: Source file is already named correctly with today's date. No temporary copy needed.");
  }

  try {
    logger('Step 4: Locating and setting the file input...');
    const fileInput = page.locator('input#attachCV');
    await fileInput.waitFor({ state: 'attached', timeout: 15000 });

    // Handle any potential dialogs
    page.on('dialog', async (dialog) => {
      logger(`Dialog appeared: "${dialog.message()}". Accepting.`);
      await dialog.accept().catch(() => {});
    });

    await fileInput.setInputFiles(datedFilePath);
    logger('Step 5: File input filled. Waiting for upload process to start...');

    const progressEl = page.locator(
      '#lazyAttachCV .progress, #lazyAttachCV [class*="progress"], #lazyAttachCV [class*="loading"], #lazyAttachCV [class*="loader"], #lazyAttachCV [class*="spinner"]'
    );
    const successMsg = page.locator('#attachCVMsgBox .msgBox.success, #attachCVMsgBox .success');

    // Wait up to 15 seconds for either progress bar or success message to appear
    const uploadStarted = await page
      .waitForFunction(
        (selectors: { progress: string; success: string }) => {
          const prog = document.querySelector(selectors.progress);
          const succ = document.querySelector(selectors.success);
          return (
            (prog && prog.getBoundingClientRect().width > 0) ||
            (succ && succ.getBoundingClientRect().width > 0)
          );
        },
        {
          progress:
            '#lazyAttachCV .progress, #lazyAttachCV [class*="progress"], #lazyAttachCV [class*="loading"], #lazyAttachCV [class*="loader"], #lazyAttachCV [class*="spinner"]',
          success: '#attachCVMsgBox .msgBox.success, #attachCVMsgBox .success',
        },
        { timeout: 15000 }
      )
      .catch(() => null);

    if (!uploadStarted) {
      logger(
        'WARNING: Did not detect progress bar or success message start indicator within 15 seconds. Proceeding to verify state...'
      );
    }

    logger('Step 6: Waiting for upload completion...');
    const uploadTimeout = options.resumeUploadTimeoutMs ?? 120000;
    const startWait = Date.now();
    let verified = false;
    let lastLoggedPercent = -1;

    while (Date.now() - startWait < uploadTimeout) {
      let isUploading = false;
      let percent = -1;
      if ((await progressEl.count()) > 0 && (await progressEl.first().isVisible())) {
        isUploading = true;
        const widthStyle = await progressEl
          .first()
          .locator('.determinate')
          .first()
          .getAttribute('style')
          .catch(() => null);
        if (widthStyle) {
          const match = widthStyle.match(/width:\s*(\d+)%/);
          if (match && match[1]) {
            percent = parseInt(match[1], 10);
          }
        }
      }

      if (isUploading) {
        if (percent !== -1 && percent !== lastLoggedPercent) {
          logger(`Upload progress: ${percent}%`);
          lastLoggedPercent = percent;
        } else if (lastLoggedPercent === -1) {
          logger(`Upload is in progress...`);
          lastLoggedPercent = 0;
        }
      }

      let hasSuccessMsg = false;
      if ((await successMsg.count()) > 0 && (await successMsg.first().isVisible())) {
        const text = await successMsg.first().innerText();
        if (text.includes('Resume has been successfully uploaded.')) {
          hasSuccessMsg = true;
        }
      }

      let hasNewName = false;
      if ((await resumeNameEl.count()) > 0) {
        const currentName = (await resumeNameEl.innerText()).trim();
        if (currentName === datedFilename) {
          hasNewName = true;
        }
      }

      // Complete only if success message is visible, name updated, and progress finished
      if (hasSuccessMsg && hasNewName && (!isUploading || percent === 100)) {
        logger('Upload completion verified.');
        verified = true;
        break;
      }

      await page.waitForTimeout(500);
    }

    if (!verified) {
      const progressHTML =
        (await progressEl.count()) > 0
          ? await progressEl.first().evaluate((el) => el.outerHTML).catch(() => '')
          : 'none';
      const successHTML =
        (await successMsg.count()) > 0
          ? await successMsg.first().evaluate((el) => el.outerHTML).catch(() => '')
          : 'none';
      const currentNameText =
        (await resumeNameEl.count()) > 0 ? await resumeNameEl.innerText().catch(() => '') : 'none';
      logger(
        `[diagnostics] Upload timeout reached. Progress HTML: ${progressHTML}, Success HTML: ${successHTML}, Current Name: "${currentNameText}"`
      );

      throw new Error(`Resume upload failed to complete/verify within ${uploadTimeout / 1000} seconds.`);
    }

    logger('Step 7: Checking for optional Save button...');
    const saveBtn = page
      .locator(
        '#lazyAttachCV button:has-text("Save"), #lazyAttachCV input[type="button"][value="Save"], #lazyAttachCV input[type="submit"][value="Save"]'
      )
      .first();
    if ((await saveBtn.count()) > 0 && (await saveBtn.isVisible())) {
      logger('Found a Save button in the resume section. Clicking Save...');
      await saveBtn.click();
      await page.waitForLoadState('networkidle').catch(() => {});
    } else {
      logger('No Save button found; Naukri auto-saved the upload.');
    }

    logger('Step 8: Reloading the profile for final verification...');
    await page.reload({ waitUntil: 'networkidle', timeout: 60000 });

    if (!(await hasAuthenticatedProfile(page))) {
      throw new Error('Not on authenticated profile page after reload during post-save verification.');
    }

    const finalResumeNameEl = page
      .locator('#lazyAttachCV .resume-name-inline, .attachCV .resume-name-inline')
      .first();
    await finalResumeNameEl.waitFor({ state: 'visible', timeout: 15000 });
    const finalName = (await finalResumeNameEl.innerText()).trim();
    if (finalName !== datedFilename) {
      throw new Error(
        `Post-save verification failed: final resume filename on profile is "${finalName}", expected "${datedFilename}"`
      );
    }

    const successMsgText = `OK: Resume uploaded, saved, and verified from Naukri. New filename: "${datedFilename}"`;
    logger(successMsgText);

    logger('Step 9: Cleaning up temporary copies and stale duplicate files...');
    if (isTempCopy && fs.existsSync(datedFilePath)) {
      fs.unlinkSync(datedFilePath);
      logger('Temporary file deleted successfully.');
    }
    cleanupStaleResumes(resumeDir, sourceFilePath, datedFilename, logger);
    logger('Cleanup completed successfully.');
    return successMsgText;
  } catch (error) {
    if (isTempCopy && fs.existsSync(datedFilePath)) {
      logger(`ERROR: Resume upload failed. Temporary file kept at: ${datedFilePath} for debugging.`);
    }
    throw error;
  }
}

// ─── Main runTask Orchestrator ───────────────────────────────────────────────

function initializeLogRotation(logFile: string): void {
  try {
    const dir = path.dirname(logFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.appendFileSync(logFile, `=== RUN START ===\n`);
    const content = fs.readFileSync(logFile, 'utf8');
    const runs = content.split(/^=== RUN START ===/m);
    if (runs.length > 6) {
      const keptRuns = runs.slice(runs.length - 5);
      const newContent = keptRuns.map((run) => '=== RUN START ===' + run).join('');
      fs.writeFileSync(logFile, newContent, 'utf8');
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Failed to rotate log file: ${msg}`);
  }
}

/**
 * Executes an automation task ('headline-refresh' or 'resume-upload').
 *
 * Full pipeline:
 * 1. Ensure Chrome is running and CDP endpoint is reachable.
 * 2. Connect Playwright over CDP (reusing existing Chrome instance).
 * 3. Verify session authentication; execute native login if needed.
 * 4. Execute headline update or resume upload.
 * 5. Verify result and return structured RunResult.
 */
export async function runTask(
  task: TaskType | 'refresh-headline' | 'upload-resume',
  options: AutomationOptions
): Promise<RunResult> {
  const startTime = Date.now();

  // Normalize task name
  let normalizedTask: TaskType = 'headline-refresh';
  if (task === 'resume-upload' || task === 'upload-resume') {
    normalizedTask = 'resume-upload';
  }

  const configDir = options.configDir;
  const logFile = options.logFile ?? path.join(configDir, 'naukri-refresh.log');
  const errorShot = options.errorScreenshot ?? path.join(configDir, 'naukri-refresh-error.png');
  const profileDir = options.profileDir ?? path.join(configDir, '.naukri-chrome-profile');

  initializeLogRotation(logFile);

  const log: Logger = (message: string) => {
    const line = `[${new Date().toLocaleString()}] [${normalizedTask}] ${message}`;
    console.log(line);
    try {
      fs.appendFileSync(logFile, `${line}\n`, 'utf8');
    } catch {
      // ignore logging errors
    }
  };

  log(`Starting automation task: ${normalizedTask}`);

  let browser: Browser | null = null;
  let page: Page | null = null;
  let nativeLoginInProgress = false;
  let screenshotSaved = false;

  try {
    assertNaukriProfileUrl(options.naukriProfileUrl);

    // 1. Ensure Chrome CDP is ready
    let cdpReady = await checkCDPAvailable(options.cdpEndpoint);
    if (!cdpReady) {
      log('Chrome CDP is not active. Attempting to start Chrome...');
      cdpReady = await ensureChromeRunning(profileDir, options.naukriProfileUrl, options.cdpEndpoint);
      if (!cdpReady) {
        throw new Error(
          `Naukri Chrome is not running and could not be started. CDP endpoint unavailable at ${options.cdpEndpoint}.`
        );
      }
    }

    // 2. Connect Playwright over CDP
    log(`Connecting Playwright to Chrome at ${options.cdpEndpoint}...`);
    browser = await chromium.connectOverCDP(options.cdpEndpoint, { timeout: 15000 });

    const context = browser.contexts()[0];
    if (!context) {
      throw new Error('No Chrome browser context is available through CDP.');
    }

    // Reuse existing authenticated page if present, else find or create one
    const pages = context.pages();
    page = pages.find((candidate) => isAuthenticatedProfile(candidate.url())) || (await context.newPage());

    log('Navigating to profile URL...');
    await page.goto(options.naukriProfileUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

    // 3. Verify authentication / login
    if (!(await hasAuthenticatedProfile(page))) {
      log('Profile page is not authenticated. Attempting native login with credentials...');
      nativeLoginInProgress = true;
      await loginWithNaukriCredentials(page, options, log);
      nativeLoginInProgress = false;
      log('Authentication successfully verified.');
    }

    // 4. Execute task
    let taskResultMessage = '';
    if (normalizedTask === 'headline-refresh') {
      taskResultMessage = await updateAndVerifyHeadline(page, options, log);
    } else {
      taskResultMessage = await uploadAndVerifyResume(page, options, log);
    }

    const durationMs = Date.now() - startTime;
    log(`Task completed successfully in ${durationMs}ms: ${taskResultMessage}`);

    return {
      task: normalizedTask,
      success: true,
      message: taskResultMessage,
      durationMs,
      timestamp: Date.now(),
    };
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    const durationMs = Date.now() - startTime;

    // Take screenshot on unexpected automation failures (skip on native login credential errors or login page)
    if (page && !nativeLoginInProgress && !isNaukriLoginUrl(page.url())) {
      try {
        await page.screenshot({ path: errorShot });
        screenshotSaved = true;
        log(`Saved error screenshot to ${errorShot}`);
      } catch (shotErr: unknown) {
        const msg = shotErr instanceof Error ? shotErr.message : String(shotErr);
        log(`Failed to take error screenshot: ${msg}`);
      }
    }

    const firstLine = error.message.split('\n')[0] ?? error.message;
    log(`ERROR: ${firstLine}${screenshotSaved ? ' (screenshot: naukri-refresh-error.png)' : ''}`);

    return {
      task: normalizedTask,
      success: false,
      message: firstLine,
      durationMs,
      timestamp: Date.now(),
      screenshotPath: screenshotSaved ? errorShot : undefined,
    };
  } finally {
    // For a CDP connection, close() disconnects Playwright while leaving Chrome running.
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}
