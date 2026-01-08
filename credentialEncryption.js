const crypto = require('crypto');

// Use a fixed encryption key derived from app-specific identifier
// In production, consider using a more secure key derivation method
// For this implementation, we'll use a combination of machine ID and app name
function getEncryptionKey() {
  // Create a stable key using a combination of app name and a fixed salt
  // This ensures the same key is used for encryption/decryption on the same machine
  const appName = 'Renocrew Time Tracker';
  const salt = 'timesheet_tracker_2024';
  const keyMaterial = `${appName}:${salt}`;
  
  // Derive a 32-byte key (256 bits) for AES-256
  return crypto.createHash('sha256').update(keyMaterial).digest();
}

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 16 bytes for AES
const SALT_LENGTH = 64; // 64 bytes for additional security
const TAG_LENGTH = 16; // 16 bytes for GCM authentication tag

/**
 * Encrypts a string using AES-256-GCM
 * @param {string} text - The text to encrypt
 * @returns {string} - Base64 encoded encrypted data (format: salt:iv:tag:encrypted)
 */
function encrypt(text) {
  if (!text || typeof text !== 'string') {
    throw new Error('Text to encrypt must be a non-empty string');
  }

  try {
    const key = getEncryptionKey();
    
    // Generate random IV and salt for each encryption
    const iv = crypto.randomBytes(IV_LENGTH);
    const salt = crypto.randomBytes(SALT_LENGTH);
    
    // Create cipher
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    // Encrypt the text
    let encrypted = cipher.update(text, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    
    // Get authentication tag
    const tag = cipher.getAuthTag();
    
    // Combine salt, IV, tag, and encrypted data
    const result = `${salt.toString('base64')}:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted}`;
    
    return result;
  } catch (error) {
    console.error('[CredentialEncryption] Encryption error:', error);
    throw new Error(`Failed to encrypt data: ${error.message}`);
  }
}

/**
 * Decrypts a string encrypted with encrypt()
 * @param {string} encryptedData - Base64 encoded encrypted data (format: salt:iv:tag:encrypted)
 * @returns {string} - Decrypted text
 */
function decrypt(encryptedData) {
  if (!encryptedData || typeof encryptedData !== 'string') {
    throw new Error('Encrypted data must be a non-empty string');
  }

  try {
    const key = getEncryptionKey();
    
    // Split the encrypted data
    const parts = encryptedData.split(':');
    if (parts.length !== 4) {
      throw new Error('Invalid encrypted data format');
    }
    
    const [saltB64, ivB64, tagB64, encrypted] = parts;
    
    // Decode base64 components
    const iv = Buffer.from(ivB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    
    // Create decipher
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    
    // Decrypt the data
    let decrypted = decipher.update(encrypted, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('[CredentialEncryption] Decryption error:', error);
    throw new Error(`Failed to decrypt data: ${error.message}`);
  }
}

module.exports = {
  encrypt,
  decrypt,
  getEncryptionKey: () => getEncryptionKey().toString('hex').substring(0, 32) // For debugging only
};

