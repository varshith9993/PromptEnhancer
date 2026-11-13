import type { PromptProfile, UserInstruction } from '@promptpilot/shared';
import {
  deleteUserApiKey as dbDeleteApiKey,
  ensureUser,
  getDecryptedApiKey,
  getFirstHealthyApiKey,
  listUserAccessTokens,
  listUserApiKeys,
  recordPromptHistory,
  revokeAccessToken,
  saveAccessToken,
  saveEncryptedApiKey,
  verifyLocalAccessToken
} from './db.js';
import { generatePromptPilotToken } from './crypto.js';

export interface VerifiedUser {
  id: string;
  email: string;
  tokenType?: 'jwt' | 'api_key';
}

function getSupabaseEnv(): { url: string; key: string } | null {
  const url = process.env.SUPABASE_URL?.trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY)?.trim();
  if (!url || !key) return null;
  return { url: url.replace(/\/+$/, ''), key };
}

export async function verifySupabaseUser(authHeader?: string): Promise<VerifiedUser | null> {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;

  // 1. Personal Access Token (pp_live_...) verified against database
  if (token.startsWith('pp_live_')) {
    const local = verifyLocalAccessToken(token);
    if (local) {
      return { id: local.userId, email: local.email, tokenType: 'api_key' };
    }
  }

  // 2. Supabase Auth JWT token
  const env = getSupabaseEnv();
  if (env) {
    try {
      const res = await fetch(`${env.url}/auth/v1/user`, {
        headers: {
          apikey: env.key,
          Authorization: `Bearer ${token}`
        },
        signal: AbortSignal.timeout(8_000)
      });
      if (res.ok) {
        const user = (await res.json()) as { id?: string; email?: string };
        if (user.id && user.email) {
          ensureUser(user.id, user.email);
          return { id: user.id, email: user.email, tokenType: 'jwt' };
        }
      }
    } catch {
      // ignore
    }
  }

  // Fallback for local desktop dev
  if (token === 'local-token') {
    return { id: 'local-desktop-user', email: 'desktop@localhost', tokenType: 'api_key' };
  }

  return null;
}

export async function ensureUserRow(accessToken: string, user: VerifiedUser): Promise<void> {
  const env = getSupabaseEnv();
  if (!env) return;
  await fetch(`${env.url}/rest/v1/users?on_conflict=id`, {
    method: 'POST',
    headers: {
      apikey: env.key,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates'
    },
    body: JSON.stringify({ id: user.id, email: user.email }),
    signal: AbortSignal.timeout(8_000)
  });
}

export async function fetchUserPreferences(
  accessToken: string,
  userId: string
): Promise<UserInstruction[]> {
  const env = getSupabaseEnv();
  if (!env) throw new Error('Supabase is not configured on API.');
  const res = await fetch(
    `${env.url}/rest/v1/user_preferences?user_id=eq.${encodeURIComponent(userId)}&select=id,instruction_text,enabled,is_default&order=created_at.asc`,
    {
      headers: { apikey: env.key, Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(8_000)
    }
  );
  if (!res.ok) throw new Error(`Failed to load preferences (${res.status}).`);
  const rows = (await res.json()) as Array<{
    id: string;
    instruction_text: string;
    enabled: boolean;
    is_default: boolean;
  }>;
  return rows.map((r) => ({
    id: r.id,
    text: r.instruction_text,
    enabled: r.enabled,
    isDefault: r.is_default
  }));
}

export async function replaceUserPreferences(
  accessToken: string,
  user: VerifiedUser,
  items: UserInstruction[]
): Promise<void> {
  const env = getSupabaseEnv();
  if (!env) throw new Error('Supabase is not configured on API.');
  await ensureUserRow(accessToken, user);

  await fetch(`${env.url}/rest/v1/user_preferences?user_id=eq.${encodeURIComponent(user.id)}`, {
    method: 'DELETE',
    headers: { apikey: env.key, Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(8_000)
  });

  if (items.length === 0) return;
  const res = await fetch(`${env.url}/rest/v1/user_preferences`, {
    method: 'POST',
    headers: {
      apikey: env.key,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(
      items.map((item) => ({
        user_id: user.id,
        instruction_text: item.text,
        enabled: item.enabled,
        is_default: item.isDefault
      }))
    ),
    signal: AbortSignal.timeout(8_000)
  });
  if (!res.ok) throw new Error(`Failed to save preferences (${res.status}).`);
}

export async function fetchUserProfiles(
  accessToken: string,
  userId: string
): Promise<PromptProfile[]> {
  const env = getSupabaseEnv();
  if (!env) throw new Error('Supabase is not configured on API.');
  const res = await fetch(
    `${env.url}/rest/v1/prompt_profiles?user_id=eq.${encodeURIComponent(userId)}&select=id,name,category,description,system_guidance,is_builtin&order=created_at.asc`,
    {
      headers: { apikey: env.key, Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(8_000)
    }
  );
  if (!res.ok) throw new Error(`Failed to load profiles (${res.status}).`);
  const rows = (await res.json()) as Array<{
    id: string;
    name: string;
    category: PromptProfile['category'];
    description: string;
    system_guidance: string;
    is_builtin: boolean;
  }>;
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    category: r.category,
    description: r.description,
    systemGuidance: r.system_guidance,
    isBuiltin: r.is_builtin
  }));
}

export async function insertUserProfile(
  accessToken: string,
  user: VerifiedUser,
  profile: Omit<PromptProfile, 'id' | 'isBuiltin'>
): Promise<void> {
  const env = getSupabaseEnv();
  if (!env) throw new Error('Supabase is not configured on API.');
  await ensureUserRow(accessToken, user);

  const res = await fetch(`${env.url}/rest/v1/prompt_profiles`, {
    method: 'POST',
    headers: {
      apikey: env.key,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      user_id: user.id,
      name: profile.name,
      category: profile.category,
      description: profile.description,
      system_guidance: profile.systemGuidance,
      is_builtin: false
    }),
    signal: AbortSignal.timeout(8_000)
  });
  if (!res.ok) throw new Error(`Failed to save profile (${res.status}).`);
}

// User-stored AI provider keys (encrypted at rest)
export interface StoredKeySummary {
  providerId: string;
  label?: string | undefined;
  baseUrl?: string | undefined;
  modelId?: string | undefined;
  status: 'healthy' | 'invalid' | 'error';
  lastCheckedAt?: string | undefined;
  lastHealthyAt?: string | undefined;
  lastError?: string | undefined;
  updatedAt: string;
}

export async function fetchUserApiKeys(
  _accessToken: string,
  userId: string
): Promise<StoredKeySummary[]> {
  const keys = listUserApiKeys(userId);
  return keys.map((k) => ({
    providerId: k.providerId,
    ...(k.label ? { label: k.label } : {}),
    ...(k.baseUrl ? { baseUrl: k.baseUrl } : {}),
    ...(k.modelId ? { modelId: k.modelId } : {}),
    status: k.status,
    ...(k.lastCheckedAt ? { lastCheckedAt: k.lastCheckedAt } : {}),
    ...(k.lastHealthyAt ? { lastHealthyAt: k.lastHealthyAt } : {}),
    ...(k.lastError ? { lastError: k.lastError } : {}),
    updatedAt: k.updatedAt
  }));
}

export async function saveUserApiKey(
  _accessToken: string,
  user: VerifiedUser,
  params: {
    providerId: string;
    apiKey: string;
    baseUrl?: string;
    modelId?: string;
    label?: string;
    status?: 'healthy' | 'invalid' | 'error';
    lastError?: string;
  }
): Promise<void> {
  ensureUser(user.id, user.email);
  saveEncryptedApiKey({
    userId: user.id,
    providerId: params.providerId,
    apiKey: params.apiKey,
    ...(params.baseUrl ? { baseUrl: params.baseUrl } : {}),
    ...(params.modelId ? { modelId: params.modelId } : {}),
    ...(params.label ? { label: params.label } : {}),
    status: params.status ?? 'healthy',
    ...(params.lastError ? { lastError: params.lastError } : {})
  });
}

export async function deleteUserApiKey(
  _accessToken: string,
  userId: string,
  providerId: string
): Promise<void> {
  dbDeleteApiKey(userId, providerId);
}

export async function getUserDecryptedApiKey(
  userId: string,
  providerId: string
): Promise<{ apiKey: string; baseUrl?: string; modelId?: string } | null> {
  return getDecryptedApiKey(userId, providerId);
}

export async function getUserDefaultHealthyKey(
  userId: string
): Promise<{ providerId: string; apiKey: string; baseUrl?: string; modelId?: string } | null> {
  return getFirstHealthyApiKey(userId);
}

// User Personal Access Tokens (pp_live_...)
export interface StoredTokenSummary {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt?: string | undefined;
  createdAt: string;
}

export async function fetchUserAccessTokens(
  _accessToken: string,
  userId: string
): Promise<StoredTokenSummary[]> {
  const tokens = listUserAccessTokens(userId);
  return tokens.map((t) => ({
    id: t.id,
    name: t.name,
    prefix: t.tokenPrefix,
    ...(t.lastUsedAt ? { lastUsedAt: t.lastUsedAt } : {}),
    createdAt: t.createdAt
  }));
}

export async function createUserAccessToken(
  _accessToken: string,
  user: VerifiedUser,
  name?: string
): Promise<{ token: string; prefix: string; id: string }> {
  ensureUser(user.id, user.email);
  const { token, prefix } = generatePromptPilotToken();
  const saved = saveAccessToken(user.id, token, prefix, name);
  return { token, prefix, id: saved.id };
}

export async function revokeUserAccessToken(
  _accessToken: string,
  userId: string,
  tokenId: string
): Promise<void> {
  revokeAccessToken(userId, tokenId);
}

export async function logPromptHistory(
  userId: string,
  originalPrompt: string,
  enhancedPrompt: string,
  mode: string,
  category: string,
  providerId?: string
): Promise<void> {
  recordPromptHistory({
    userId,
    originalPrompt,
    enhancedPrompt,
    mode,
    category,
    ...(providerId ? { providerId } : {})
  });
}

