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

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token.trim()).digest('hex');
}

export function generatePromptPilotToken(): { token: string; prefix: string; hash: string } {
  const random = crypto.randomBytes(24).toString('hex');
  const token = `pp_live_${random}`;
  const prefix = `pp_live_${random.slice(0, 6)}...${random.slice(-4)}`;
  const hash = hashToken(token);
  return { token, prefix, hash };
}

