/**
 * Comprehensive Persistence & Credential Security Automated Test Suite.
 */

const fs = require('fs');
const path = require('path');
const ConfigService = require('../config-service');

async function runTests() {
  console.log('=== STARTING PERSISTENCE & CREDENTIAL SECURITY TESTS ===\n');
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`✓ PASS: ${message}`);
      passed++;
    } else {
      console.error(`✗ FAIL: ${message}`);
      failed++;
    }
  }

  try {
    // 1. Initial Reset
    ConfigService.resetAll();
    assert(true, 'Application reset executed cleanly.');

    // 2. Initial Defaults Load & Versioning
    const initialConfig = ConfigService.load();
    assert(initialConfig.version === 1, 'Initial config loads with Schema Version 1.');
    assert(initialConfig.NAUKRI_PROFILE_URL === 'https://www.naukri.com/mnjuser/profile', 'Default profile URL initialized.');

    // 3. Save Settings & Credentials
    const testCredentials = {
      NAUKRI_PROFILE_URL: 'https://www.naukri.com/mnjuser/profile',
      NAUKRI_EMAIL: 'testuser@example.com',
      NAUKRI_PASSWORD: 'SuperSecretPassword123!',
      REFRESH_MODE: 'interval',
      REFRESH_INTERVAL_HOURS: '2',
      REFRESH_INTERVAL_MINUTES: '30'
    };

    ConfigService.save(testCredentials);
    assert(true, 'Saved initial test credentials and settings.');

    // 4. Verify Plain-Text Leak Prevention in config.json
    const configJsonPath = ConfigService.getConfigJsonPath();
    assert(fs.existsSync(configJsonPath), 'config.json exists in AppData directory.');
    const jsonRaw = fs.readFileSync(configJsonPath, 'utf8');
    assert(!jsonRaw.includes('SuperSecretPassword123!'), 'Password is NOT present in plain text in config.json.');

    // 5. Verify Plain-Text Leak Prevention in .env
    const envPath = ConfigService.getEnvPath();
    assert(fs.existsSync(envPath), '.env file exists in AppData directory.');
    const envRaw = fs.readFileSync(envPath, 'utf8');
    assert(!envRaw.includes('SuperSecretPassword123!'), 'Password is NOT present in plain text in .env file.');

    // 6. Verify Secure Password Retrieval
    const loadedConfig = ConfigService.load();
    assert(loadedConfig.NAUKRI_EMAIL === 'testuser@example.com', 'Loaded email matches saved email.');
    assert(loadedConfig.NAUKRI_PASSWORD === 'SuperSecretPassword123!', 'Password decrypted and retrieved successfully from SecureStore.');

    // 7. Test Partial Settings Update Merge
    ConfigService.save({ REFRESH_INTERVAL_HOURS: '3' });
    const mergedConfig = ConfigService.load();
    assert(mergedConfig.NAUKRI_EMAIL === 'testuser@example.com', 'Partial update preserved email.');
    assert(mergedConfig.NAUKRI_PASSWORD === 'SuperSecretPassword123!', 'Partial update preserved secure password.');
    assert(mergedConfig.REFRESH_INTERVAL_HOURS === '3', 'Partial update updated specified interval.');

    // 8. Test Resume File Selection & Health Checks
    const configDir = ConfigService.getAppConfigDir();
    const resumeDir = path.join(configDir, 'resume');
    if (!fs.existsSync(resumeDir)) fs.mkdirSync(resumeDir, { recursive: true });

    const dummyResumePath = path.join(resumeDir, 'sample_resume.pdf');
    fs.writeFileSync(dummyResumePath, '%PDF-1.4 sample content', 'utf8');

    ConfigService.save({ RESUME_FILE: 'resume/sample_resume.pdf' });
    const resumeConfig = ConfigService.load();
    assert(resumeConfig.RESUME_FILE_EXISTS === true, 'Resume file correctly detected as existing.');
    assert(resumeConfig.RESUME_FILE_STATUS === 'Available', 'Resume health status is "Available".');

    // 9. Test Resume File Deletion Resilience (Non-destructive)
    fs.unlinkSync(dummyResumePath);
    const missingResumeConfig = ConfigService.load();
    assert(missingResumeConfig.RESUME_FILE_EXISTS === false, 'Deleted resume file correctly detected as missing.');
    assert(missingResumeConfig.RESUME_FILE_STATUS === 'File not found', 'Resume health status is "File not found".');
    assert(missingResumeConfig.NAUKRI_EMAIL === 'testuser@example.com', 'Missing resume file DID NOT wipe user email.');
    assert(missingResumeConfig.NAUKRI_PASSWORD === 'SuperSecretPassword123!', 'Missing resume file DID NOT wipe user password.');

    // 10. Test Corrupted JSON Recovery
    fs.writeFileSync(configJsonPath, '{ invalid_json_syntax: true, ', 'utf8');
    const recoveredConfig = ConfigService.load();
    assert(recoveredConfig !== null, 'Config loading handled corrupted JSON without throwing an exception.');
    assert(recoveredConfig.NAUKRI_EMAIL === 'testuser@example.com', 'Recovered configuration from fallback .env file.');

    // 11. Test Reset All
    ConfigService.resetAll();
    assert(!fs.existsSync(configJsonPath), 'Reset successfully deleted config.json.');
    assert(!fs.existsSync(envPath), 'Reset successfully deleted .env file.');
    const resetConfig = ConfigService.load();
    assert(resetConfig.NAUKRI_EMAIL === '', 'Reset cleared stored email.');
    assert(resetConfig.NAUKRI_PASSWORD === '', 'Reset cleared stored password.');

  } catch (err) {
    console.error('UNCAUGHT TEST EXCEPTION:', err);
    failed++;
  }

  console.log(`\n=== TEST SUMMARY: ${passed} PASSED, ${failed} FAILED ===`);
  process.exit(failed === 0 ? 0 : 1);
}

runTests();
