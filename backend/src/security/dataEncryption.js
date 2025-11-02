const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

class DataEncryption {
  constructor(config = {}) {
    this.algorithm = config.algorithm || 'aes-256-gcm';
    this.keyDerivationIterations = config.iterations || 100000;
    this.saltLength = config.saltLength || 64;
    this.tagLength = config.tagLength || 16;
    this.ivLength = config.ivLength || 16;

    // Key management
    this.masterKey = null;
    this.dataKeys = new Map();
    this.keyRotationInterval = config.keyRotationInterval || 30 * 24 * 60 * 60 * 1000; // 30 days

    this.initializeMasterKey();
  }

  async initializeMasterKey() {
    // In production, use HSM or KMS
    const masterKeyPath = process.env.MASTER_KEY_PATH || '.keys/master.key';

    try {
      const keyData = await fs.readFile(masterKeyPath);
      this.masterKey = keyData;
    } catch (_error) {
      // Generate new master key if not exists
      this.masterKey = crypto.randomBytes(32);
      await this.saveMasterKey(masterKeyPath);
    }
  }

  async saveMasterKey(keyPath) {
    const dir = path.dirname(keyPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(keyPath, this.masterKey, { mode: 0o600 });
  }

  // Field-level encryption
  async encryptField(data, fieldName) {
    const dataKey = await this.getDataKey(fieldName);
    const iv = crypto.randomBytes(this.ivLength);
    const cipher = crypto.createCipheriv(this.algorithm, dataKey, iv);

    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify(data), 'utf8'),
      cipher.final()
    ]);

    const tag = cipher.getAuthTag();

    return {
      encrypted: encrypted.toString('base64'),
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
      algorithm: this.algorithm,
      keyId: this.getKeyId(fieldName)
    };
  }

  async decryptField(encryptedData, fieldName) {
    const dataKey = await this.getDataKey(fieldName);
    const decipher = crypto.createDecipheriv(
      encryptedData.algorithm || this.algorithm,
      dataKey,
      Buffer.from(encryptedData.iv, 'base64')
    );

    decipher.setAuthTag(Buffer.from(encryptedData.tag, 'base64'));

    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedData.encrypted, 'base64')),
      decipher.final()
    ]);

    return JSON.parse(decrypted.toString('utf8'));
  }

  // Database encryption
  async encryptDatabase(data) {
    const encrypted = {};

    for (const [key, value] of Object.entries(data)) {
      if (this.shouldEncrypt(key)) {
        encrypted[key] = await this.encryptField(value, key);
      } else {
        encrypted[key] = value;
      }
    }

    return encrypted;
  }

  async decryptDatabase(encryptedData) {
    const decrypted = {};

    for (const [key, value] of Object.entries(encryptedData)) {
      if (value && typeof value === 'object' && value.encrypted) {
        decrypted[key] = await this.decryptField(value, key);
      } else {
        decrypted[key] = value;
      }
    }

    return decrypted;
  }

  // File encryption
  async encryptFile(filePath, outputPath) {
    const data = await fs.readFile(filePath);
    const iv = crypto.randomBytes(this.ivLength);
    const key = await this.getDataKey('file');

    const cipher = crypto.createCipheriv(this.algorithm, key, iv);
    const encrypted = Buffer.concat([
      iv,
      cipher.update(data),
      cipher.final(),
      cipher.getAuthTag()
    ]);

    await fs.writeFile(outputPath, encrypted);

    return {
      size: encrypted.length,
      checksum: crypto.createHash('sha256').update(encrypted).digest('hex')
    };
  }

  async decryptFile(encryptedPath, outputPath) {
    const data = await fs.readFile(encryptedPath);
    const iv = data.slice(0, this.ivLength);
    const tag = data.slice(-this.tagLength);
    const encrypted = data.slice(this.ivLength, -this.tagLength);

    const key = await this.getDataKey('file');
    const decipher = crypto.createDecipheriv(this.algorithm, key, iv);
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final()
    ]);

    await fs.writeFile(outputPath, decrypted);

    return {
      size: decrypted.length,
      checksum: crypto.createHash('sha256').update(decrypted).digest('hex')
    };
  }

  // Tokenization for sensitive data
  async tokenize(sensitiveData) {
    const token = crypto.randomBytes(32).toString('hex');
    const encrypted = await this.encryptField(sensitiveData, 'token');

    // Store in secure vault
    await this.storeToken(token, encrypted);

    return token;
  }

  async detokenize(token) {
    const encrypted = await this.retrieveToken(token);
    if (!encrypted) {
      throw new Error('Invalid token');
    }

    return await this.decryptField(encrypted, 'token');
  }

  // Format preserving encryption
  encryptPreserveFormat(data, format) {
    // Simplified FPE implementation
    if (format === 'email') {
      const [local, domain] = data.split('@');
      const encryptedLocal = this.hashString(local).substring(0, local.length);
      return `${encryptedLocal}@${domain}`;
    } else if (format === 'phone') {
      const digits = data.replace(/\D/g, '');
      const encrypted = this.hashString(digits);
      return data.replace(/\d/g, (d, i) => encrypted.charCodeAt(i) % 10);
    } else if (format === 'ssn') {
      const digits = data.replace(/\D/g, '');
      const encrypted = this.hashString(digits);
      return data.replace(/\d/g, (d, i) => encrypted.charCodeAt(i) % 10);
    }

    return data;
  }

  // Searchable encryption
  async createSearchableIndex(data, fields) {
    const index = {};

    for (const field of fields) {
      if (data[field]) {
        const tokens = this.tokenizeForSearch(data[field]);
        for (const token of tokens) {
          const hash = this.createBlindIndex(token);
          if (!index[hash]) {
            index[hash] = [];
          }
          index[hash].push(field);
        }
      }
    }

    return index;
  }

  tokenizeForSearch(text) {
    return text.toLowerCase().split(/\s+/);
  }

  createBlindIndex(token) {
    const hmac = crypto.createHmac('sha256', this.masterKey);
    hmac.update(token);
    return hmac.digest('hex').substring(0, 16);
  }

  async searchEncryptedData(query, index) {
    const tokens = this.tokenizeForSearch(query);
    const results = new Set();

    for (const token of tokens) {
      const hash = this.createBlindIndex(token);
      if (index[hash]) {
        index[hash].forEach(field => results.add(field));
      }
    }

    return Array.from(results);
  }

  // Key management
  async getDataKey(identifier) {
    const keyId = this.getKeyId(identifier);

    if (!this.dataKeys.has(keyId)) {
      // Derive data key from master key
      const salt = crypto.randomBytes(this.saltLength);
      const key = crypto.pbkdf2Sync(
        this.masterKey,
        salt,
        this.keyDerivationIterations,
        32,
        'sha256'
      );
      this.dataKeys.set(keyId, key);
    }

    return this.dataKeys.get(keyId);
  }

  getKeyId(identifier) {
    // Generate consistent key ID for each identifier
    const hash = crypto.createHash('sha256');
    hash.update(identifier);
    return hash.digest('hex').substring(0, 16);
  }

  // Key rotation
  async rotateKeys() {
    const newMasterKey = crypto.randomBytes(32);
    const _oldMasterKey = this.masterKey;

    // Re-encrypt all data with new key
    // This is a simplified version - in production, use proper key rotation
    this.masterKey = newMasterKey;
    this.dataKeys.clear();

    await this.saveMasterKey(process.env.MASTER_KEY_PATH || '.keys/master.key');

    return {
      rotated: true,
      timestamp: Date.now()
    };
  }

  // Compliance helpers
  shouldEncrypt(fieldName) {
    const sensitiveFields = [
      'password',
      'ssn',
      'creditCard',
      'bankAccount',
      'privateKey',
      'email',
      'phone',
      'address',
      'dateOfBirth',
      'passport',
      'driverLicense',
      'medicalRecord'
    ];

    return sensitiveFields.some(field =>
      fieldName.toLowerCase().includes(field.toLowerCase())
    );
  }

  // Hash function for non-reversible data
  hashString(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  // Secure token storage (placeholder)
  async storeToken(token, encrypted) {
    // In production, use secure vault or database
    if (!this.tokenVault) {
      this.tokenVault = new Map();
    }
    this.tokenVault.set(token, encrypted);
  }

  async retrieveToken(token) {
    if (!this.tokenVault) {
      return null;
    }
    return this.tokenVault.get(token);
  }

  // Export encrypted backup
  async exportBackup(data, password) {
    const salt = crypto.randomBytes(this.saltLength);
    const key = crypto.pbkdf2Sync(password, salt, this.keyDerivationIterations, 32, 'sha256');
    const iv = crypto.randomBytes(this.ivLength);

    const cipher = crypto.createCipheriv(this.algorithm, key, iv);
    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify(data), 'utf8'),
      cipher.final()
    ]);

    return {
      version: '1.0',
      algorithm: this.algorithm,
      salt: salt.toString('base64'),
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
      data: encrypted.toString('base64'),
      timestamp: Date.now()
    };
  }

  async importBackup(backup, password) {
    const salt = Buffer.from(backup.salt, 'base64');
    const key = crypto.pbkdf2Sync(password, salt, this.keyDerivationIterations, 32, 'sha256');

    const decipher = crypto.createDecipheriv(
      backup.algorithm,
      key,
      Buffer.from(backup.iv, 'base64')
    );

    decipher.setAuthTag(Buffer.from(backup.tag, 'base64'));

    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(backup.data, 'base64')),
      decipher.final()
    ]);

    return JSON.parse(decrypted.toString('utf8'));
  }
}

module.exports = new DataEncryption();