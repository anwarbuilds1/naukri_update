import assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import test, { describe } from 'node:test';
import {
  assertNaukriProfileUrl,
  cleanupStaleResumes,
  findAuthoritativeResume,
  isAuthenticatedProfile,
  isNaukriLoginUrl,
  isStaleDuplicate,
  sanitizeFilename,
  validateFile,
} from './automation.js';
import {
  getDefaultConfigDir,
  getDerivedKey,
  getMachineId,
  readEncryptedPassword,
  saveEncryptedPassword,
} from './config.js';
import { acquireAutomationLock, getLockFilePath, releaseAutomationLock } from './main.js';
import { getDueTasks, isRefreshDue, isResumeUploadDue, type TaskState } from './scheduler.js';

describe('Shared URL and Profile Validators', () => {
  test('assertNaukriProfileUrl accepts valid HTTPS /mnjuser/ profile URLs', () => {
    assert.doesNotThrow(() => {
      assertNaukriProfileUrl('https://www.naukri.com/mnjuser/profile');
    });
    assert.doesNotThrow(() => {
      assertNaukriProfileUrl('https://naukri.com/mnjuser/homepage');
    });
  });

  test('assertNaukriProfileUrl rejects invalid schemes or hosts or paths', () => {
    assert.throws(() => assertNaukriProfileUrl('http://www.naukri.com/mnjuser/profile'));
    assert.throws(() => assertNaukriProfileUrl('https://evil.com/mnjuser/profile'));
    assert.throws(() => assertNaukriProfileUrl('https://www.naukri.com/nlogin/login'));
  });

  test('isAuthenticatedProfile checks hostname and /mnjuser path', () => {
    assert.strictEqual(isAuthenticatedProfile('https://www.naukri.com/mnjuser/profile'), true);
    assert.strictEqual(isAuthenticatedProfile('https://my.naukri.com/mnjuser/homepage'), true);
    assert.strictEqual(isAuthenticatedProfile('https://www.naukri.com/nlogin/login'), false);
    assert.strictEqual(isAuthenticatedProfile('invalid-url'), false);
  });

  test('isNaukriLoginUrl checks hostname and /nlogin path', () => {
    assert.strictEqual(isNaukriLoginUrl('https://www.naukri.com/nlogin/login'), true);
    assert.strictEqual(isNaukriLoginUrl('https://www.naukri.com/mnjuser/profile'), false);
    assert.strictEqual(isNaukriLoginUrl('not-a-url'), false);
  });
});

describe('Filename Sanitization and Duplicate Detection', () => {
  const fixedDate = new Date(2026, 8, 7); // September 7, 2026

  test('sanitizeFilename removes existing DD-MM-YYYY dates and appends today', () => {
    const output = sanitizeFilename('Anwar_Resume_01-01-2025.pdf', fixedDate);
    assert.strictEqual(output, 'Anwar_Resume_07-09-2026.pdf');
  });

  test('sanitizeFilename sanitizes spaces and special characters', () => {
    const output = sanitizeFilename('My Resume (Software Engineer)!.pdf', fixedDate);
    assert.strictEqual(output, 'My_Resume_Software_Engineer_07-09-2026.pdf');
  });

  test('sanitizeFilename defaults empty base name to resume', () => {
    const output = sanitizeFilename('____.pdf', fixedDate);
    assert.strictEqual(output, 'resume_07-09-2026.pdf');
  });

  test('isStaleDuplicate detects candidate duplicate resume files', () => {
    assert.strictEqual(isStaleDuplicate('Anwar_Resume_01-01-2025.pdf', 'Anwar_Resume'), true);
    assert.strictEqual(isStaleDuplicate('my_cv_update.pdf', 'Anwar_Resume'), true);
    assert.strictEqual(isStaleDuplicate('random_doc_01-02-2025.pdf', 'Anwar'), true);
    assert.strictEqual(isStaleDuplicate('notes.txt', 'Anwar_Resume'), false);
    assert.strictEqual(isStaleDuplicate('unrelated_document.pdf', 'SpecialUniqueBase'), false);
  });
});

describe('Resume File Discovery and Validation', () => {
  let tmpDir: string;

  test('setup temp directory', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'naukri-test-'));
  });

  test('validateFile throws for non-existent file', async () => {
    await assert.rejects(async () => {
      await validateFile(path.join(tmpDir, 'does-not-exist.pdf'));
    }, /File does not exist/);
  });

  test('validateFile throws for non-pdf extension', async () => {
    const txtPath = path.join(tmpDir, 'resume.txt');
    fs.writeFileSync(txtPath, 'text content');
    await assert.rejects(async () => {
      await validateFile(txtPath);
    }, /not a valid\/readable PDF/);
  });

  test('validateFile throws for empty PDF', async () => {
    const emptyPdf = path.join(tmpDir, 'empty.pdf');
    fs.writeFileSync(emptyPdf, Buffer.alloc(0));
    await assert.rejects(async () => {
      await validateFile(emptyPdf);
    }, /not a valid\/readable PDF/);
  });

  test('validateFile throws for invalid PDF header', async () => {
    const badHeader = path.join(tmpDir, 'bad_header.pdf');
    fs.writeFileSync(badHeader, 'NOT_PDF_HEADER_DATA');
    await assert.rejects(async () => {
      await validateFile(badHeader);
    }, /not a valid\/readable PDF/);
  });

  test('validateFile succeeds for valid PDF with %PDF header', async () => {
    const goodPdf = path.join(tmpDir, 'valid.pdf');
    fs.writeFileSync(goodPdf, '%PDF-1.4 mock content');
    await assert.doesNotReject(async () => {
      await validateFile(goodPdf);
    });
  });

  test('findAuthoritativeResume discovers exactly one PDF in directory', () => {
    const subDir = path.join(tmpDir, 'single_resume');
    fs.mkdirSync(subDir);
    const resumePath = path.join(subDir, 'MyResume.pdf');
    fs.writeFileSync(resumePath, '%PDF-1.4 test');

    const found = findAuthoritativeResume(subDir);
    assert.strictEqual(found, resumePath);
  });

  test('findAuthoritativeResume throws when multiple PDFs exist without explicit config', () => {
    const multiDir = path.join(tmpDir, 'multi_resume');
    fs.mkdirSync(multiDir);
    fs.writeFileSync(path.join(multiDir, 'Resume1.pdf'), '%PDF-1.4 one');
    fs.writeFileSync(path.join(multiDir, 'Resume2.pdf'), '%PDF-1.4 two');

    assert.throws(() => {
      findAuthoritativeResume(multiDir);
    }, /Multiple resume files were found/);
  });

  test('findAuthoritativeResume throws on directory traversal attempt', () => {
    const safeDir = path.join(tmpDir, 'safe_dir');
    fs.mkdirSync(safeDir);

    assert.throws(() => {
      findAuthoritativeResume(safeDir, '../secret.pdf', safeDir);
    }, /Path traversal warning/);
  });

  test('cleanupStaleResumes removes older duplicates while preserving source and target', () => {
    const cleanDir = path.join(tmpDir, 'clean_resumes');
    fs.mkdirSync(cleanDir);
    const source = path.join(cleanDir, 'Resume.pdf');
    const todayCopy = path.join(cleanDir, 'Resume_07-09-2026.pdf');
    const oldCopy = path.join(cleanDir, 'Resume_01-01-2025.pdf');

    fs.writeFileSync(source, '%PDF-1.4');
    fs.writeFileSync(todayCopy, '%PDF-1.4');
    fs.writeFileSync(oldCopy, '%PDF-1.4');

    cleanupStaleResumes(cleanDir, source, 'Resume_07-09-2026.pdf', () => {});

    assert.strictEqual(fs.existsSync(source), true);
    assert.strictEqual(fs.existsSync(todayCopy), true);
    assert.strictEqual(fs.existsSync(oldCopy), false);
  });
});

describe('Schedule and Task Mapping', () => {
  const baseConfig = {
    refreshMode: 'interval' as const,
    refreshIntervalHours: 2,
    refreshIntervalMinutes: 0,
    refreshTime: '06:11',
    refreshWindowEnabled: false,
    refreshWindowStart: '07:00',
    refreshWindowEnd: '19:00',
    resumeUpdateEnabled: false,
    resumeUpdateTime: '07:00',
  };

  test('isRefreshDue returns true if lastRefreshTime is 0 (never run)', () => {
    const state: TaskState = { lastRefreshTime: 0, lastResumeUploadTime: 0, paused: false };
    assert.strictEqual(isRefreshDue(baseConfig, state, new Date()), true);
  });

  test('isRefreshDue returns false when paused', () => {
    const state: TaskState = { lastRefreshTime: 0, lastResumeUploadTime: 0, paused: true };
    assert.strictEqual(isRefreshDue(baseConfig, state, new Date()), false);
  });

  test('isRefreshDue respects interval time delta', () => {
    const now = new Date('2026-09-07T10:00:00Z');
    const twoHoursOneMinAgo = now.getTime() - (2 * 3600 + 60) * 1000;
    const oneHourAgo = now.getTime() - 3600 * 1000;

    const stateDue: TaskState = { lastRefreshTime: twoHoursOneMinAgo, lastResumeUploadTime: 0, paused: false };
    const stateNotDue: TaskState = { lastRefreshTime: oneHourAgo, lastResumeUploadTime: 0, paused: false };

    assert.strictEqual(isRefreshDue(baseConfig, stateDue, now), true);
    assert.strictEqual(isRefreshDue(baseConfig, stateNotDue, now), false);
  });

  test('getDueTasks returns appropriate tasks', () => {
    const state: TaskState = { lastRefreshTime: 0, lastResumeUploadTime: 0, paused: false };
    const tasks = getDueTasks(baseConfig, state, new Date());
    assert.deepStrictEqual(tasks, ['headline-refresh']);
  });
});

describe('AES-256-GCM Secure Credential Storage', () => {
  test('getMachineId returns a deterministic non-empty string', () => {
    const id1 = getMachineId();
    const id2 = getMachineId();
    assert.ok(id1.length > 0);
    assert.strictEqual(id1, id2);
  });

  test('getDerivedKey produces a 32-byte Buffer', () => {
    const key = getDerivedKey('test-machine-id');
    assert.strictEqual(key.length, 32);
    assert.ok(Buffer.isBuffer(key));
  });

  test('saveEncryptedPassword and readEncryptedPassword roundtrips correctly', () => {
    const tmpCredPath = path.join(os.tmpdir(), `test-creds-${Date.now()}.enc`);
    try {
      const secretPass = 'MyNaukriSecretP@ssword123!';
      const saved = saveEncryptedPassword(tmpCredPath, secretPass);
      assert.strictEqual(saved, true);
      assert.strictEqual(fs.existsSync(tmpCredPath), true);

      const decrypted = readEncryptedPassword(tmpCredPath);
      assert.strictEqual(decrypted, secretPass);
    } finally {
      if (fs.existsSync(tmpCredPath)) {
        fs.unlinkSync(tmpCredPath);
      }
    }
  });

  test('readEncryptedPassword returns empty string for missing file', () => {
    assert.strictEqual(readEncryptedPassword('/non/existent/path/.credentials.enc'), '');
  });
});

describe('Automation Lock Mechanism', () => {
  let lockTestDir: string;

  test('setup lock directory', () => {
    lockTestDir = fs.mkdtempSync(path.join(os.tmpdir(), 'naukri-lock-test-'));
  });

  test('acquireAutomationLock creates lock file and release removes it', () => {
    const acquired = acquireAutomationLock(lockTestDir);
    assert.strictEqual(acquired, true);

    const lockPath = getLockFilePath(lockTestDir);
    assert.strictEqual(fs.existsSync(lockPath), true);

    releaseAutomationLock(lockTestDir);
    assert.strictEqual(fs.existsSync(lockPath), false);
  });
});
