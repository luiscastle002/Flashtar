import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const SALT_LENGTH = 16;
const KEY_LENGTH = 32;
const ITERATIONS = 10000;

function getEncryptionKey(): Buffer {
  const secret = process.env.DRIVE_TOKEN_ENCRYPTION_KEY;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("DRIVE_TOKEN_ENCRYPTION_KEY environment variable is missing.");
    }
    // Fallback for development/testing
    return crypto.scryptSync("dev-fallback-secret-key-please-change-in-prod", "salt", KEY_LENGTH);
  }
  return crypto.scryptSync(secret, "flashtar-salt", KEY_LENGTH);
}

/**
 * Encrypts a plain text token using AES-256-GCM.
 * Returns a serialized format containing: salt:iv:authTag:ciphertext
 */
export function encryptToken(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const salt = crypto.randomBytes(SALT_LENGTH);
  
  const key = crypto.pbkdf2Sync(getEncryptionKey().toString("hex"), salt, ITERATIONS, KEY_LENGTH, "sha256");
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  
  const authTag = cipher.getAuthTag().toString("hex");
  
  return `${salt.toString("hex")}:${iv.toString("hex")}:${authTag}:${encrypted}`;
}

/**
 * Decrypts an encrypted token string.
 */
export function decryptToken(encryptedText: string): string {
  const parts = encryptedText.split(":");
  if (parts.length !== 4) {
    throw new Error("Invalid encrypted text format.");
  }
  
  const [saltHex, ivHex, authTagHex, encryptedDataHex] = parts;
  
  const salt = Buffer.from(saltHex, "hex");
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  
  const key = crypto.pbkdf2Sync(getEncryptionKey().toString("hex"), salt, ITERATIONS, KEY_LENGTH, "sha256");
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encryptedDataHex, "hex", "utf8");
  decrypted += decipher.final("utf8");
  
  return decrypted;
}
