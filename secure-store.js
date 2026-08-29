/**
 * Secure Store Service for Naukri Update.
 * Manages secure storage of sensitive credentials (Naukri Password)
 * using Electron's native safeStorage (libsecret / Keychain / DPAPI)
 * with machine-bound AES-256-GCM fallback for standalone CLI scripts.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

let electronSafeStorage = null;
try {
  const electron = require('electron');
  if (electron && electron.safeStorage) {
    electronSafeStorage = electron.safeStorage;
  }
} catch (e) {
  // Not in Electron main process
}

class SecureStoreService {
  constructor(configDir) {
    this.configDir = configDir;
    this.credentialsPath = path.join(configDir, '.credentials.enc');
  }

  /**
   * Get machine-unique hardware ID for fallback encryption key.
   */
  getMachineId() {
    try {
      if (process.platform === 'linux') {
        if (fs.existsSync('/etc/machine-id')) {
          return fs.readFileSync('/etc/machine-id', 'utf8').trim();
        }
        if (fs.existsSync('/var/lib/dbus/machine-id')) {
          return fs.readFileSync('/var/lib/dbus/machine-id', 'utf8').trim();
        }
      } else if (process.platform === 'darwin') {
        const out = execSync('ioreg -rd1 -c IOPlatformExpertDevice', { stdio: 'pipe' }).toString();
        const match = out.match(/"IOPlatformUUID"\s*=\s*"([^"]+)"/);
        if (match) return match[1];
      } else if (process.platform === 'win32') {
        const out = execSync('wmic csproduct get uuid', { stdio: 'pipe' }).toString();
        const lines = out.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        if (lines.length > 1) return lines[1];
      }
    } catch (e) {}
    
    // Default deterministic fallback seed based on OS user & homedir
    const userInfo = process.env.USER || process.env.USERNAME || 'default_user';
    const homeDir = process.env.HOME || process.env.USERPROFILE || 'default_home';
    return crypto.createHash('sha256').update(`${userInfo}:${homeDir}:naukri_update_seed`).digest('hex');
  }

  /**
   * Derive a 256-bit AES key from the machine ID.
   */
  getDerivedKey() {
    const machineId = this.getMachineId();
    return crypto.pbkdf2Sync(machineId, 'naukri_secure_salt_v1', 100000, 32, 'sha256');
  }

  /**
   * Set password securely.
   */
  setPassword(password) {
    if (!password) {
      if (fs.existsSync(this.credentialsPath)) {
        try { fs.unlinkSync(this.credentialsPath); } catch (e) {}
      }
      return true;
    }

    // Try Electron safeStorage first
    if (electronSafeStorage && electronSafeStorage.isEncryptionAvailable()) {
      try {
        const encryptedBuffer = electronSafeStorage.encryptString(password);
        const data = JSON.stringify({
          type: 'electron_safestorage',
          data: encryptedBuffer.toString('base64')
        });
        this.atomicWrite(data);
        return true;
      } catch (err) {
        console.warn('[SecureStore] Electron safeStorage failed, falling back to machine key:', err.message);
      }
    }

    // Fallback: AES-256-GCM using machine-derived key
    try {
      const key = this.getDerivedKey();
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
      let encrypted = cipher.update(password, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      const authTag = cipher.getAuthTag().toString('hex');

      const data = JSON.stringify({
        type: 'machine_aes_gcm',
        iv: iv.toString('hex'),
        authTag: authTag,
        data: encrypted
      });
      this.atomicWrite(data);
      return true;
    } catch (err) {
      console.error('[SecureStore] Failed to encrypt password:', err.message);
      return false;
    }
  }

  /**
   * Get password securely.
   */
  getPassword() {
    if (!fs.existsSync(this.credentialsPath)) {
      return '';
    }

    try {
      const content = fs.readFileSync(this.credentialsPath, 'utf8');
      const parsed = JSON.parse(content);

      if (parsed.type === 'electron_safestorage' && electronSafeStorage && electronSafeStorage.isEncryptionAvailable()) {
        const buffer = Buffer.from(parsed.data, 'base64');
        return electronSafeStorage.decryptString(buffer);
      }

      if (parsed.type === 'machine_aes_gcm') {
        const key = this.getDerivedKey();
        const iv = Buffer.from(parsed.iv, 'hex');
        const authTag = Buffer.from(parsed.authTag, 'hex');
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(authTag);
        let decrypted = decipher.update(parsed.data, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
      }
    } catch (err) {
      console.error('[SecureStore] Failed to decrypt stored credentials:', err.message);
    }

    return '';
  }

  /**
   * Delete stored password.
   */
  clearPassword() {
    if (fs.existsSync(this.credentialsPath)) {
      try {
        fs.unlinkSync(this.credentialsPath);
        return true;
      } catch (e) {
        return false;
      }
    }
    return true;
  }

  /**
   * Safe atomic file write.
   */
  atomicWrite(content) {
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
    }
    const tempPath = `${this.credentialsPath}.tmp`;
    fs.writeFileSync(tempPath, content, 'utf8');
    
    // Restrict permissions to owner only (chmod 0600 on Unix)
    if (process.platform !== 'win32') {
      try { fs.chmodSync(tempPath, 0o600); } catch (e) {}
    }
    
    fs.renameSync(tempPath, this.credentialsPath);
    if (process.platform !== 'win32') {
      try { fs.chmodSync(this.credentialsPath, 0o600); } catch (e) {}
    }
  }
}

module.exports = SecureStoreService;
