import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { decryptApiKey, encryptApiKey, hashToken } from './crypto.js';

export interface DbApiKey {
  id: string;
  userId: string;
  providerId: string;
  baseUrl?: string | undefined;
  modelId?: string | undefined;
  label?: string | undefined;
  status: 'healthy' | 'invalid' | 'error';
  enabled: boolean;
  lastCheckedAt?: string | undefined;
  lastHealthyAt?: string | undefined;
  lastError?: string | undefined;
  updatedAt: string;
}

export interface DbAccessToken {
  id: string;
  userId: string;
  tokenPrefix: string;
  name: string;
  lastUsedAt?: string | undefined;
  revokedAt?: string | undefined;
  createdAt: string;
}

let dbInstance: DatabaseSync | null = null;

function getDbPath(): string {
  if (process.env.PROMPTPILOT_DB_PATH) {
    const custom = process.env.PROMPTPILOT_DB_PATH;
    const customDir = path.dirname(custom);
    if (!fs.existsSync(customDir)) {
      fs.mkdirSync(customDir, { recursive: true });
    }
    return custom;
  }
  try {
    const dir = path.join(os.homedir(), '.promptpilot');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return path.join(dir, 'promptpilot.db');
  } catch {
    const fallbackDir = path.join(process.cwd(), '.promptpilot');
    if (!fs.existsSync(fallbackDir)) {
      fs.mkdirSync(fallbackDir, { recursive: true });
    }
    return path.join(fallbackDir, 'promptpilot.db');
  }
}

export function getDatabase(): DatabaseSync {
  if (dbInstance) return dbInstance;
  const dbPath = getDbPath();
  const db = new DatabaseSync(dbPath);
  dbInstance = db;
  initSchema(db);
  return db;
}

function initSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      display_name TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_api_keys (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      encrypted_key TEXT NOT NULL,
      iv TEXT NOT NULL,
      auth_tag TEXT NOT NULL,
      base_url TEXT,
      model_id TEXT,
      label TEXT,
      status TEXT NOT NULL DEFAULT 'healthy',
      enabled INTEGER NOT NULL DEFAULT 1,
      last_checked_at TEXT,
      last_healthy_at TEXT,
      last_error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (user_id, provider_id)
    );

    CREATE TABLE IF NOT EXISTS user_access_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      token_prefix TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT 'Default Key',
      last_used_at TEXT,
      revoked_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS prompt_history (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      original_prompt TEXT NOT NULL,
      enhanced_prompt TEXT NOT NULL,
      mode TEXT NOT NULL,
      category TEXT NOT NULL,
      provider_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_preferences (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      instruction_text TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    INSERT OR IGNORE INTO users (id, email, display_name)
    VALUES ('local-desktop-user', 'desktop@localhost', 'Local Developer');
  `);
}

// User management
export function ensureUser(id: string, email: string, displayName?: string): void {
  const db = getDatabase();
  db.prepare(`
    INSERT INTO users (id, email, display_name) VALUES (?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET email = excluded.email, display_name = COALESCE(excluded.display_name, users.display_name)
  `).run(id, email, displayName || null);
}

// Stored AI Provider Keys
export function saveEncryptedApiKey(params: {
  userId: string;
  providerId: string;
  apiKey: string;
  baseUrl?: string | undefined;
  modelId?: string | undefined;
  label?: string | undefined;
  status?: 'healthy' | 'invalid' | 'error';
  lastError?: string | undefined;
}): void {
  const db = getDatabase();
  const id = crypto.randomUUID();
  const enc = encryptApiKey(params.apiKey.trim());
  const now = new Date().toISOString();
  const status = params.status ?? 'healthy';

  db.prepare(`
    INSERT INTO user_api_keys (
      id, user_id, provider_id, encrypted_key, iv, auth_tag,
      base_url, model_id, label, status, enabled, last_checked_at, last_healthy_at, last_error, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
    ON CONFLICT(user_id, provider_id) DO UPDATE SET
      encrypted_key = excluded.encrypted_key,
      iv = excluded.iv,
      auth_tag = excluded.auth_tag,
      base_url = excluded.base_url,
      model_id = excluded.model_id,
      label = excluded.label,
      status = excluded.status,
      enabled = 1,
      last_checked_at = excluded.last_checked_at,
      last_healthy_at = CASE WHEN excluded.status = 'healthy' THEN excluded.last_checked_at ELSE user_api_keys.last_healthy_at END,
      last_error = excluded.last_error,
      updated_at = excluded.updated_at
  `).run(
    id,
    params.userId,
    params.providerId,
    enc.encrypted,
    enc.iv,
    enc.authTag,
    params.baseUrl?.trim() || null,
    params.modelId?.trim() || null,
    params.label?.trim() || null,
    status,
    now,
    status === 'healthy' ? now : null,
    params.lastError || null,
    now
  );
}

export function listUserApiKeys(userId: string): DbApiKey[] {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT id, user_id, provider_id, base_url, model_id, label, status, enabled,
           last_checked_at, last_healthy_at, last_error, updated_at
    FROM user_api_keys
    WHERE user_id = ?
    ORDER BY updated_at DESC
  `).all(userId) as Array<{
    id: string;
    user_id: string;
    provider_id: string;
    base_url: string | null;
    model_id: string | null;
    label: string | null;
    status: 'healthy' | 'invalid' | 'error';
    enabled: number;
    last_checked_at: string | null;
    last_healthy_at: string | null;
    last_error: string | null;
    updated_at: string;
  }>;

  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    providerId: r.provider_id,
    ...(r.base_url ? { baseUrl: r.base_url } : {}),
    ...(r.model_id ? { modelId: r.model_id } : {}),
    ...(r.label ? { label: r.label } : {}),
    status: r.status,
    enabled: r.enabled === 1,
    ...(r.last_checked_at ? { lastCheckedAt: r.last_checked_at } : {}),
    ...(r.last_healthy_at ? { lastHealthyAt: r.last_healthy_at } : {}),
    ...(r.last_error ? { lastError: r.last_error } : {}),
    updatedAt: r.updated_at
  }));
}

export function deleteUserApiKey(userId: string, providerId: string): void {
  const db = getDatabase();
  db.prepare(`
    DELETE FROM user_api_keys WHERE user_id = ? AND provider_id = ?
  `).run(userId, providerId);
}

export function getDecryptedApiKey(
  userId: string,
  providerId: string
): { apiKey: string; baseUrl?: string; modelId?: string } | null {
  const db = getDatabase();
  const row = db.prepare(`
    SELECT encrypted_key, iv, auth_tag, base_url, model_id, status, enabled
    FROM user_api_keys
    WHERE user_id = ? AND provider_id = ? AND enabled = 1
  `).get(userId, providerId) as {
    encrypted_key: string;
    iv: string;
    auth_tag: string;
    base_url: string | null;
    model_id: string | null;
    status: string;
    enabled: number;
  } | undefined;

  if (!row) return null;
  const apiKey = decryptApiKey({
    encrypted: row.encrypted_key,
    iv: row.iv,
    authTag: row.auth_tag
  });
  return {
    apiKey,
    ...(row.base_url ? { baseUrl: row.base_url } : {}),
    ...(row.model_id ? { modelId: row.model_id } : {})
  };
}

export function getFirstHealthyApiKey(
  userId: string
): { providerId: string; apiKey: string; baseUrl?: string; modelId?: string } | null {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT provider_id, encrypted_key, iv, auth_tag, base_url, model_id
    FROM user_api_keys
    WHERE user_id = ? AND enabled = 1 AND status = 'healthy'
    ORDER BY updated_at DESC
  `).all(userId) as Array<{
    provider_id: string;
    encrypted_key: string;
    iv: string;
    auth_tag: string;
    base_url: string | null;
    model_id: string | null;
  }>;

  if (!rows.length || !rows[0]) return null;
  const first = rows[0];
  const apiKey = decryptApiKey({
    encrypted: first.encrypted_key,
    iv: first.iv,
    authTag: first.auth_tag
  });
  return {
    providerId: first.provider_id,
    apiKey,
    ...(first.base_url ? { baseUrl: first.base_url } : {}),
    ...(first.model_id ? { modelId: first.model_id } : {})
  };
}

// Personal Access Tokens
export function saveAccessToken(
  userId: string,
  token: string,
  prefix: string,
  name?: string
): DbAccessToken {
  const db = getDatabase();
  const id = crypto.randomUUID();
  const hash = hashToken(token);
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO user_access_tokens (id, user_id, token_hash, token_prefix, name, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, userId, hash, prefix, name || 'Default Key', now);
  return {
    id,
    userId,
    tokenPrefix: prefix,
    name: name || 'Default Key',
    createdAt: now
  };
}

export function listUserAccessTokens(userId: string): DbAccessToken[] {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT id, user_id, token_prefix, name, last_used_at, revoked_at, created_at
    FROM user_access_tokens
    WHERE user_id = ? AND revoked_at IS NULL
    ORDER BY created_at DESC
  `).all(userId) as Array<{
    id: string;
    user_id: string;
    token_prefix: string;
    name: string;
    last_used_at: string | null;
    revoked_at: string | null;
    created_at: string;
  }>;

  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    tokenPrefix: r.token_prefix,
    name: r.name,
    ...(r.last_used_at ? { lastUsedAt: r.last_used_at } : {}),
    ...(r.revoked_at ? { revokedAt: r.revoked_at } : {}),
    createdAt: r.created_at
  }));
}

export function revokeAccessToken(userId: string, tokenId: string): void {
  const db = getDatabase();
  db.prepare(`
    UPDATE user_access_tokens SET revoked_at = datetime('now')
    WHERE user_id = ? AND id = ?
  `).run(userId, tokenId);
}

export function verifyLocalAccessToken(token: string): { userId: string; email: string } | null {
  const db = getDatabase();
  const hash = hashToken(token);
  const row = db.prepare(`
    SELECT t.id, t.user_id, u.email
    FROM user_access_tokens t
    LEFT JOIN users u ON u.id = t.user_id
    WHERE t.token_hash = ? AND t.revoked_at IS NULL
  `).get(hash) as { id: string; user_id: string; email: string | null } | undefined;

  if (!row) return null;
  // Update last_used_at
  db.prepare(`UPDATE user_access_tokens SET last_used_at = datetime('now') WHERE id = ?`).run(row.id);
  return {
    userId: row.user_id,
    email: row.email || 'developer@promptpilot.local'
  };
}

// Prompt History
export function recordPromptHistory(params: {
  userId: string;
  originalPrompt: string;
  enhancedPrompt: string;
  mode: string;
  category: string;
  providerId?: string | undefined;
}): void {
  const db = getDatabase();
  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO prompt_history (id, user_id, original_prompt, enhanced_prompt, mode, category, provider_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    params.userId,
    params.originalPrompt,
    params.enhancedPrompt,
    params.mode,
    params.category,
    params.providerId || null
  );
}
