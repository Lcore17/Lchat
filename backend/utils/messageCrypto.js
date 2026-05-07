const crypto = require('crypto');

const ENCRYPTION_PREFIX = 'enc:v1';
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

function getEncryptionKey() {
  const secret = process.env.MESSAGE_ENCRYPTION_KEY;
  if (!secret || typeof secret !== 'string' || secret.trim().length === 0) {
    return null;
  }
  return crypto.createHash('sha256').update(secret, 'utf8').digest();
}

function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith(`${ENCRYPTION_PREFIX}:`);
}

function encryptMessageText(plainText) {
  if (typeof plainText !== 'string' || plainText.length === 0) {
    return plainText;
  }

  if (isEncrypted(plainText)) {
    return plainText;
  }

  const key = getEncryptionKey();
  if (!key) {
    return plainText;
  }

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plainText, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return `${ENCRYPTION_PREFIX}:${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
}

function decryptMessageText(value) {
  if (typeof value !== 'string' || value.length === 0) {
    return value;
  }

  if (!isEncrypted(value)) {
    return value;
  }

  const key = getEncryptionKey();
  if (!key) {
    return '[Encrypted message]';
  }

  const parts = value.split(':');
  if (parts.length !== 5) {
    return '[Encrypted message]';
  }

  const iv = Buffer.from(parts[2], 'base64');
  const authTag = Buffer.from(parts[3], 'base64');
  const encrypted = Buffer.from(parts[4], 'base64');

  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  } catch (error) {
    return '[Encrypted message]';
  }
}

module.exports = {
  encryptMessageText,
  decryptMessageText,
  isEncrypted,
};
