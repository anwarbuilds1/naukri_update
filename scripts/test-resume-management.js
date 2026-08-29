const fs = require('fs');
const path = require('path');
const assert = require('assert');

// Helper to clear module cache so we can reload with different env configurations
function reloadModules(envVars = {}) {
  // Apply env modifications
  for (const [k, v] of Object.entries(envVars)) {
    if (v === null) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }

  // Clear caches
  delete require.cache[require.resolve('../config.js')];
  delete require.cache[require.resolve('../naukri-profile-refresh.js')];

  // Require fresh instances
  const config = require('../config.js');
  const refresh = require('../naukri-profile-refresh.js');
  return { config, refresh };
}

const sandboxDir = path.resolve(__dirname, 'sandbox_resume');

// Helper to recreate the sandbox
function setupSandbox() {
  if (fs.existsSync(sandboxDir)) {
    fs.rmSync(sandboxDir, { recursive: true, force: true });
  }
  fs.mkdirSync(sandboxDir, { recursive: true });
}

function cleanupSandbox() {
  if (fs.existsSync(sandboxDir)) {
    fs.rmSync(sandboxDir, { recursive: true, force: true });
  }
}

// Generate valid minimal PDF content (contains %PDF- signature)
const validPdfContent = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF');
const zeroByteContent = Buffer.from('');
const invalidPdfContent = Buffer.from('NOT A PDF FILE CONTENT');

async function runTests() {
  console.log('--- Starting Resume Management Unit Tests ---');

  // Test 1 & 4 & 5: Filename sanitization
  console.log('Testing filename sanitization...');
  const { refresh: r1 } = reloadModules({ RESUME_FILE: '' });
  
  // Normal filename
  assert.strictEqual(r1.sanitizeFilename('ram_resume.pdf'), `ram_resume_${getTodayString()}.pdf`);
  // Spaces
  assert.strictEqual(r1.sanitizeFilename('Ram Kumar Resume.pdf'), `Ram_Kumar_Resume_${getTodayString()}.pdf`);
  // Special characters
  assert.strictEqual(r1.sanitizeFilename('Anwar_Rizwan - Resume (Final).pdf'), `Anwar_Rizwan_Resume_Final_${getTodayString()}.pdf`);
  assert.strictEqual(r1.sanitizeFilename('Anwar@Resume#2026.pdf'), `Anwar_Resume_2026_${getTodayString()}.pdf`);
  // Uppercase extension
  assert.strictEqual(r1.sanitizeFilename('Ram_Resume.PDF'), `Ram_Resume_${getTodayString()}.PDF`);
  console.log('✔ Filename sanitization tests passed.');

  // Test 2 & 3 & 12: Existing date / idempotence
  console.log('Testing date idempotence and rewriting...');
  // Yesterday's dated name
  assert.strictEqual(r1.sanitizeFilename('ram_resume_28-08-2026.pdf'), `ram_resume_${getTodayString()}.pdf`);
  // Already today's date
  assert.strictEqual(r1.sanitizeFilename(`ram_resume_${getTodayString()}.pdf`), `ram_resume_${getTodayString()}.pdf`);
  // Repeated execution test
  const name1 = r1.sanitizeFilename(`ram_resume_${getTodayString()}.pdf`);
  const name2 = r1.sanitizeFilename(name1);
  assert.strictEqual(name2, `ram_resume_${getTodayString()}.pdf`);
  console.log('✔ Date idempotence tests passed.');

  // Test 6: Auto-discovery with multiple files (should throw error)
  console.log('Testing multiple files in auto-discovery...');
  setupSandbox();
  fs.writeFileSync(path.join(sandboxDir, 'resume1.pdf'), validPdfContent);
  fs.writeFileSync(path.join(sandboxDir, 'resume2.pdf'), validPdfContent);
  
  const { refresh: r6 } = reloadModules({ RESUME_FILE: '' });
  try {
    r6.findAuthoritativeResume(sandboxDir);
    assert.fail('Should have failed on multiple candidate resumes');
  } catch (err) {
    assert.ok(err.message.includes('Multiple resume files were found in the resume directory'));
  }
  console.log('✔ Multiple candidates error verified.');

  // Test 7: Explicit configuration precedence
  console.log('Testing explicit configuration precedence...');
  setupSandbox();
  const explicitFile = path.join(sandboxDir, 'special_resume.pdf');
  fs.writeFileSync(explicitFile, validPdfContent);
  fs.writeFileSync(path.join(sandboxDir, 'stale_resume.pdf'), validPdfContent);

  const { refresh: r7 } = reloadModules({ RESUME_FILE: explicitFile });
  const selected = r7.findAuthoritativeResume(sandboxDir);
  assert.strictEqual(path.resolve(selected), path.resolve(explicitFile));
  console.log('✔ Explicit configuration precedence passed.');

  // Test 8: Missing configured file
  console.log('Testing missing configured file...');
  const { refresh: r8 } = reloadModules({ RESUME_FILE: path.join(sandboxDir, 'does_not_exist.pdf') });
  try {
    r8.findAuthoritativeResume(sandboxDir);
    assert.fail('Should have failed for missing configured file');
  } catch (err) {
    assert.strictEqual(err.message, 'RESUME_FILE points to a file that does not exist.');
  }
  console.log('✔ Missing configured file error verified.');

  // Test 9: Empty directory
  console.log('Testing empty directory error...');
  setupSandbox();
  const { refresh: r9 } = reloadModules({ RESUME_FILE: '' });
  try {
    r9.findAuthoritativeResume(sandboxDir);
    assert.fail('Should have failed for empty directory');
  } catch (err) {
    assert.strictEqual(err.message, 'No resume PDF found in the resume directory. Please add exactly one resume PDF or configure RESUME_FILE.');
  }
  console.log('✔ Empty directory error verified.');

  // Test 10: Zero-byte PDF and Invalid PDF signature
  console.log('Testing PDF validation (zero-byte and signature)...');
  setupSandbox();
  const zeroByteFile = path.join(sandboxDir, 'zero.pdf');
  fs.writeFileSync(zeroByteFile, zeroByteContent);
  
  const invalidPdfFile = path.join(sandboxDir, 'invalid.pdf');
  fs.writeFileSync(invalidPdfFile, invalidPdfContent);

  const { refresh: r10 } = reloadModules({ RESUME_FILE: '' });
  
  try {
    await r10.validateFile(zeroByteFile);
    assert.fail('Should have rejected zero-byte file');
  } catch (err) {
    assert.strictEqual(err.message, 'The configured resume file exists but is not a valid/readable PDF.');
  }

  try {
    await r10.validateFile(invalidPdfFile);
    assert.fail('Should have rejected invalid signature file');
  } catch (err) {
    assert.strictEqual(err.message, 'The configured resume file exists but is not a valid/readable PDF.');
  }
  console.log('✔ PDF validation tests passed.');

  // Test 11: Temporary / incomplete file stability
  console.log('Testing temporary file stability check...');
  setupSandbox();
  const changingFile = path.join(sandboxDir, 'changing.pdf');
  fs.writeFileSync(changingFile, validPdfContent);

  // We spawn a promise that changes the file size during the validation window
  const checkPromise = r10.validateFile(changingFile);
  setTimeout(() => {
    fs.appendFileSync(changingFile, Buffer.from('\nEXTRA DATA'));
  }, 100);

  try {
    await checkPromise;
    assert.fail('Should have rejected unstable/changing file');
  } catch (err) {
    assert.strictEqual(err.message, 'The resume file appears to still be changing or is incomplete. Aborting this run to avoid uploading a partial file.');
  }
  console.log('✔ File stability check passed.');

  // Test 13: Path traversal protection
  console.log('Testing path traversal protection...');
  const { refresh: r13 } = reloadModules({ RESUME_FILE: '../../secret.pdf' });
  try {
    r13.findAuthoritativeResume(sandboxDir);
    assert.fail('Should have rejected path outside sandbox directory');
  } catch (err) {
    assert.ok(err.message.includes('Path traversal warning'));
  }
  console.log('✔ Path traversal protection passed.');

  // Test cleanup stale duplicate local files
  console.log('Testing stale duplicates cleanup...');
  setupSandbox();
  const mainFile = path.join(sandboxDir, 'john_doe.pdf');
  fs.writeFileSync(mainFile, validPdfContent);
  
  // Stale versions
  const stale1 = path.join(sandboxDir, 'john_doe_28-08-2026.pdf');
  const stale2 = path.join(sandboxDir, 'john_doe (1).pdf');
  const stale3 = path.join(sandboxDir, 'old_resume.pdf');
  const unrelated = path.join(sandboxDir, 'some_other_doc.pdf');
  
  fs.writeFileSync(stale1, validPdfContent);
  fs.writeFileSync(stale2, validPdfContent);
  fs.writeFileSync(stale3, validPdfContent);
  fs.writeFileSync(unrelated, validPdfContent);

  r1.cleanupStaleResumes(sandboxDir, mainFile, `john_doe_${getTodayString()}.pdf`);
  
  assert.ok(fs.existsSync(mainFile), 'Main source resume must be kept!');
  assert.ok(!fs.existsSync(stale1), 'Stale dated resume must be cleaned up');
  assert.ok(!fs.existsSync(stale2), 'Stale duplicated resume must be cleaned up');
  assert.ok(!fs.existsSync(stale3), 'Stale generic old resume must be cleaned up');
  assert.ok(fs.existsSync(unrelated), 'Unrelated PDF must be preserved');
  console.log('✔ Duplicate cleanup tests passed.');

  cleanupSandbox();
  console.log('\n✔ All Resume Management unit tests passed successfully!');
}

function getTodayString() {
  const today = new Date();
  const dd = String(today.getDate()).padStart(2, '0');
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const yyyy = today.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
