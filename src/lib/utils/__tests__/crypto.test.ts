import { encryptToken, decryptToken } from "../crypto";

describe("Cryptographic Utilities", () => {
  const originalEnv = process.env.DRIVE_TOKEN_ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.DRIVE_TOKEN_ENCRYPTION_KEY = "test-secret-key-123456789012345678901234";
  });

  afterAll(() => {
    process.env.DRIVE_TOKEN_ENCRYPTION_KEY = originalEnv;
  });

  it("should encrypt and decrypt a string successfully", () => {
    const rawToken = "ya29.a0AcE1eZ123456789-abcdefghijklmnopqrstuvwxyz";
    const encrypted = encryptToken(rawToken);
    
    expect(encrypted).not.toBe(rawToken);
    expect(encrypted.split(":")).toHaveLength(4);

    const decrypted = decryptToken(encrypted);
    expect(decrypted).toBe(rawToken);
  });

  it("should throw an error on invalid formatted data during decryption", () => {
    expect(() => {
      decryptToken("invalid-formatted-string");
    }).toThrow();
  });

  it("should fail decryption if encryption key changes", () => {
    const rawToken = "my-secret-value";
    const encrypted = encryptToken(rawToken);

    // Change key
    process.env.DRIVE_TOKEN_ENCRYPTION_KEY = "another-secret-key-9999999999999999";
    
    expect(() => {
      decryptToken(encrypted);
    }).toThrow();
  });
});
