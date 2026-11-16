import crypto from 'node:crypto';

// Master encryption key for securing user API keys at rest.
// Falls back to a derived stable machine key if APP_ENCRYPTION_KEY is not set.
function getMasterKey(): Buffer {
  const envKey = process.env.APP_ENCRYPTION_KEY?.trim();
  if (envKey) {
    return crypto.createHash('sha256').update(envKey).digest();
  }
  // Derive a fallback key from supabase project or host identifier
  const fallbackSeed = process.env.SUPABASE_URL || 'promptpilot-local-secret-seed-key';
  return crypto.createHash('sha256').update(fallbackSeed).digest();
}

export interface EncryptedPayload {
  encrypted: string;
  iv: string;
  authTag: string;
}

export function encryptApiKey(plainText: string): EncryptedPayload {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getMasterKey(), iv);
  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return {
    encrypted,
    iv: iv.toString('hex'),
    authTag
  };
}

export function decryptApiKey(payload: EncryptedPayload): string {
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    getMasterKey(),
    Buffer.from(payload.iv, 'hex')
  );
  decipher.setAuthTag(Buffer.from(payload.authTag, 'hex'));
  let decrypted = decipher.update(payload.encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

export async function encryptApiKeyAsync(plainText: string): Promise<EncryptedPayload> {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const rawKey = new Uint8Array(getMasterKey());
  const key = await globalThis.crypto.subtle.importKey('raw', rawKey, { name: 'AES-GCM' }, false, ['encrypt']);
  const encoded = new TextEncoder().encode(plainText);
  const cipherBuf = new Uint8Array(
    await globalThis.crypto.subtle.encrypt({ name: 'AES-GCM', iv, tagLength: 128 }, key, encoded)
  );
  const encryptedBytes = cipherBuf.subarray(0, cipherBuf.length - 16);
  const authTagBytes = cipherBuf.subarray(cipherBuf.length - 16);
  return {
    encrypted: Buffer.from(encryptedBytes).toString('hex'),
    iv: Buffer.from(iv).toString('hex'),
    authTag: Buffer.from(authTagBytes).toString('hex')
  };
}

export async function decryptApiKeyAsync(payload: EncryptedPayload): Promise<string> {
  const rawKey = new Uint8Array(getMasterKey());
  const key = await globalThis.crypto.subtle.importKey('raw', rawKey, { name: 'AES-GCM' }, false, ['decrypt']);
  const iv = new Uint8Array(Buffer.from(payload.iv, 'hex'));
  const encryptedBytes = Buffer.from(payload.encrypted, 'hex');
  const authTagBytes = Buffer.from(payload.authTag, 'hex');
  const combined = new Uint8Array(Buffer.concat([encryptedBytes, authTagBytes]));
  const decryptedBuf = await globalThis.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, tagLength: 128 },
    key,
    combined
  );
  return new TextDecoder().decode(decryptedBuf);
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token.trim()).digest('hex');
}

export function generatePromptPilotToken(): { token: string; prefix: string; hash: string } {
  const random = crypto.randomBytes(24).toString('hex');
  const token = `pe_live_${random}`;
  const prefix = `pe_live_${random.slice(0, 6)}...${random.slice(-4)}`;
  const hash = hashToken(token);
  return { token, prefix, hash };
}

