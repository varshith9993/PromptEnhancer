import type { PromptProfile, UserInstruction } from '@promptpilot/shared';
import { testByokConnection, type ByokProviderId } from '@promptpilot/prompt-engine';
import {
  deleteUserApiKey as dbDeleteApiKey,
  ensureUser,
  getDecryptedApiKey,
  getFirstHealthyApiKey,
  listUserAccessTokens,
  listUserApiKeys,
  listUserPreferences,
  listUserProfiles,
  recordPromptHistory,
  revokeAccessToken,
  saveAccessToken,
  saveEncryptedApiKey,
  saveUserPreferences,
  saveUserProfile,
  toggleUserApiKey as dbToggleApiKey,
  updateKeyHealthStatus,
  verifyLocalAccessToken
} from './db.js';
import {
  decryptApiKeyAsync,
  encryptApiKeyAsync,
  generatePromptPilotToken,
  hashToken
} from './crypto.js';

const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJjdHJjZWh4eGdwcHZhdGVxY3JjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ1NzI0NTcsImV4cCI6MjExMDE0ODQ1N30.Xqed8JcyAgwWP8rzFjQltQLDw-AMvnlodcoj3cDTpoc';

export interface VerifiedUser {
  id: string;
  email: string;
  username?: string | undefined;
  tokenType?: 'jwt' | 'api_key';
}

export function generateInternalUsername(email: string, userId: string): string {
  const prefix = (email.split('@')[0] || 'user').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'user';
  const suffix = hashToken(`${userId}:${email.toLowerCase()}`).slice(0, 6);
  return `${prefix}_${suffix}`;
}

function emailToDeterministicUuid(email: string): string {
  const hex = hashToken(`promptenhancer-user:${email.trim().toLowerCase()}`);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function getSupabaseEnv(): { url: string; key: string } | null {
  const url = process.env.SUPABASE_URL?.trim();
  const rawKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY)?.trim();
  if (!url) return null;
  const key = rawKey && !rawKey.startsWith('sb_publishable_') ? rawKey : DEFAULT_SUPABASE_ANON_KEY;
  return { url: url.replace(/\/+$/, ''), key };
}

export async function verifySupabaseUser(authHeader?: string): Promise<VerifiedUser | null> {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;

  // 1. Personal Access Token (pe_live_... / pp_live_...) verified against database
  if (token.startsWith('pe_live_') || token.startsWith('pp_live_')) {
    const local = verifyLocalAccessToken(token);
    if (local) {
      return { id: local.userId, email: local.email, tokenType: 'api_key' };
    }
    const env = getSupabaseEnv();
    if (env) {
      try {
        const hash = hashToken(token);
        const res = await fetch(
          `${env.url}/rest/v1/user_access_tokens?token_hash=eq.${encodeURIComponent(hash)}&revoked_at=is.null&select=id,user_id,username,users(email,username)`,
          {
            headers: { apikey: env.key, Authorization: `Bearer ${env.key}` },
            signal: AbortSignal.timeout(8_000)
          }
        );
        if (res.ok) {
          const rows = (await res.json()) as Array<{
            id: string;
            user_id: string;
            username?: string | null;
            users?: { email?: string; username?: string | null } | null;
          }>;
          if (rows[0]) {
            void fetch(`${env.url}/rest/v1/user_access_tokens?id=eq.${rows[0].id}`, {
              method: 'PATCH',
              headers: { apikey: env.key, Authorization: `Bearer ${env.key}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ last_used_at: new Date().toISOString() })
            });
            const resolvedUsername = rows[0].username || rows[0].users?.username || undefined;
            return {
              id: rows[0].user_id,
              email: rows[0].users?.email || 'developer@promptenhancer.dev',
              ...(resolvedUsername ? { username: resolvedUsername } : {}),
              tokenType: 'api_key'
            };
          }
        }
      } catch {
        // ignore
      }
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
          const verifiedUser: VerifiedUser = { id: user.id, email: user.email, tokenType: 'jwt' };
          try {
            await ensureUserRow(token, verifiedUser);
          } catch {
            // ensureUserRow best-effort during read paths
          }
          return verifiedUser;
        }
      }
    } catch {
      // ignore
    }
  }

  // Fallback for local desktop dev
  if (token === 'local-token') {
    return { id: 'local-desktop-user', email: 'desktop@localhost', username: 'desktop_local', tokenType: 'api_key' };
  }

  return null;
}

export async function ensureUserRow(_accessToken: string, user: VerifiedUser): Promise<string> {
  const env = getSupabaseEnv();
  const fallbackUsername = user.username || generateInternalUsername(user.email, user.id);

  if (!env) {
    user.username = fallbackUsername;
    try {
      ensureUser(user.id, user.email, undefined, fallbackUsername);
    } catch {
      // ignore without SQLite
    }
    return fallbackUsername;
  }

  // Check if user row already exists by id or email
  try {
    const lookupRes = await fetch(
      `${env.url}/rest/v1/users?or=(id.eq.${encodeURIComponent(user.id)},email.eq.${encodeURIComponent(user.email)})&select=id,email,username&limit=1`,
      {
        headers: { apikey: env.key, Authorization: `Bearer ${env.key}` },
        signal: AbortSignal.timeout(8_000)
      }
    );
    if (lookupRes.ok) {
      const existing = (await lookupRes.json()) as Array<{
        id: string;
        email: string;
        username?: string | null;
      }>;
      if (existing[0]) {
        user.id = existing[0].id;
        if (existing[0].username) {
          user.username = existing[0].username;
          try {
            ensureUser(user.id, user.email, undefined, existing[0].username);
          } catch {
            // ignore without SQLite
          }
          return existing[0].username;
        }
        const assignedUsername = user.username || generateInternalUsername(user.email, user.id);
        await fetch(`${env.url}/rest/v1/users?id=eq.${encodeURIComponent(user.id)}`, {
          method: 'PATCH',
          headers: {
            apikey: env.key,
            Authorization: `Bearer ${env.key}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            email: user.email,
            username: assignedUsername,
            updated_at: new Date().toISOString()
          }),
          signal: AbortSignal.timeout(8_000)
        });
        user.username = assignedUsername;
        try {
          ensureUser(user.id, user.email, undefined, assignedUsername);
        } catch {
          // ignore without SQLite
        }
        return assignedUsername;
      }
    }
  } catch {
    // continue to upsert
  }

  const upsertRes = await fetch(`${env.url}/rest/v1/users?on_conflict=id`, {
    method: 'POST',
    headers: {
      apikey: env.key,
      Authorization: `Bearer ${env.key}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=representation'
    },
    body: JSON.stringify({
      id: user.id,
      email: user.email,
      username: fallbackUsername,
      auth_provider: 'google'
    }),
    signal: AbortSignal.timeout(8_000)
  });

  let resolvedUsername = fallbackUsername;
  if (upsertRes.ok) {
    try {
      const rows = (await upsertRes.json()) as Array<{ id?: string; username?: string | null }>;
      if (rows[0]?.id) user.id = rows[0].id;
      if (rows[0]?.username) resolvedUsername = rows[0].username;
    } catch {
      // ignore empty response
    }
  }

  user.username = resolvedUsername;
  try {
    ensureUser(user.id, user.email, undefined, resolvedUsername);
  } catch {
    // ignore without SQLite
  }
  return resolvedUsername;
}

export async function authenticateGoogleUserFallback(
  email?: string
): Promise<{ token: string; user: { id: string; email: string } }> {
  const env = getSupabaseEnv();
  let resolvedEmail = email?.trim().toLowerCase() || '';
  let resolvedId = '';
  let resolvedUsername = '';

  if (env) {
    try {
      const queryUrl = resolvedEmail
        ? `${env.url}/rest/v1/users?email=eq.${encodeURIComponent(resolvedEmail)}&select=id,email,username&limit=1`
        : `${env.url}/rest/v1/users?order=created_at.asc&limit=1&select=id,email,username`;
      const res = await fetch(queryUrl, {
        headers: { apikey: env.key, Authorization: `Bearer ${env.key}` },
        signal: AbortSignal.timeout(8_000)
      });
      if (res.ok) {
        const rows = (await res.json()) as Array<{
          id: string;
          email: string;
          username?: string | null;
        }>;
        if (rows[0]) {
          resolvedId = rows[0].id;
          resolvedEmail = rows[0].email;
          resolvedUsername = rows[0].username || '';
        }
      }
    } catch {
      // fallback below
    }
  }

  if (!resolvedEmail) {
    resolvedEmail = 'varshith9993@gmail.com';
  }
  if (!resolvedId) {
    resolvedId = emailToDeterministicUuid(resolvedEmail);
  }
  if (!resolvedUsername) {
    resolvedUsername = generateInternalUsername(resolvedEmail, resolvedId);
  }

  const verifiedUser: VerifiedUser = {
    id: resolvedId,
    email: resolvedEmail,
    username: resolvedUsername,
    tokenType: 'api_key'
  };

  await ensureUserRow('', verifiedUser);
  const created = await createUserAccessToken('', verifiedUser, 'Google Web Session');
  return {
    token: created.token,
    user: { id: verifiedUser.id, email: verifiedUser.email }
  };
}

export async function fetchUserPreferences(
  _accessToken: string,
  userId: string
): Promise<UserInstruction[]> {
  const env = getSupabaseEnv();
  if (!env) {
    return listUserPreferences(userId);
  }
  const res = await fetch(
    `${env.url}/rest/v1/user_preferences?user_id=eq.${encodeURIComponent(userId)}&select=id,instruction_text,enabled,is_default&order=created_at.asc`,
    {
      headers: { apikey: env.key, Authorization: `Bearer ${env.key}` },
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
  if (!env) {
    saveUserPreferences(user.id, items);
    return;
  }
  await ensureUserRow(accessToken, user);

  await fetch(`${env.url}/rest/v1/user_preferences?user_id=eq.${encodeURIComponent(user.id)}`, {
    method: 'DELETE',
    headers: { apikey: env.key, Authorization: `Bearer ${env.key}` },
    signal: AbortSignal.timeout(8_000)
  });

  if (items.length === 0) return;
  const res = await fetch(`${env.url}/rest/v1/user_preferences`, {
    method: 'POST',
    headers: {
      apikey: env.key,
      Authorization: `Bearer ${env.key}`,
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
  _accessToken: string,
  userId: string
): Promise<PromptProfile[]> {
  const env = getSupabaseEnv();
  if (!env) {
    return listUserProfiles(userId);
  }
  const res = await fetch(
    `${env.url}/rest/v1/prompt_profiles?user_id=eq.${encodeURIComponent(userId)}&select=id,name,category,description,system_guidance,is_builtin&order=created_at.asc`,
    {
      headers: { apikey: env.key, Authorization: `Bearer ${env.key}` },
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
  if (!env) {
    saveUserProfile(user.id, profile);
    return;
  }
  await ensureUserRow(accessToken, user);

  const res = await fetch(`${env.url}/rest/v1/prompt_profiles`, {
    method: 'POST',
    headers: {
      apikey: env.key,
      Authorization: `Bearer ${env.key}`,
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
  enabled: boolean;
  lastCheckedAt?: string | undefined;
  lastHealthyAt?: string | undefined;
  lastError?: string | undefined;
  updatedAt: string;
}

export async function fetchUserApiKeys(
  _accessToken: string,
  userId: string
): Promise<StoredKeySummary[]> {
  const env = getSupabaseEnv();
  if (env) {
    try {
      const res = await fetch(
        `${env.url}/rest/v1/user_api_keys?user_id=eq.${encodeURIComponent(userId)}&select=provider_id,label,base_url,model_id,status,enabled,last_checked_at,last_healthy_at,last_error,updated_at&order=updated_at.desc`,
        {
          headers: { apikey: env.key, Authorization: `Bearer ${env.key}` },
          signal: AbortSignal.timeout(8_000)
        }
      );
      if (res.ok) {
        const rows = (await res.json()) as Array<{
          provider_id: string;
          label?: string | null;
          base_url?: string | null;
          model_id?: string | null;
          status: 'healthy' | 'invalid' | 'error';
          enabled: boolean;
          last_checked_at?: string | null;
          last_healthy_at?: string | null;
          last_error?: string | null;
          updated_at: string;
        }>;
        return rows.map((k) => ({
          providerId: k.provider_id,
          ...(k.label ? { label: k.label } : {}),
          ...(k.base_url ? { baseUrl: k.base_url } : {}),
          ...(k.model_id ? { modelId: k.model_id } : {}),
          status: k.status ?? 'healthy',
          enabled: k.enabled ?? true,
          ...(k.last_checked_at ? { lastCheckedAt: k.last_checked_at } : {}),
          ...(k.last_healthy_at ? { lastHealthyAt: k.last_healthy_at } : {}),
          ...(k.last_error ? { lastError: k.last_error } : {}),
          updatedAt: k.updated_at
        }));
      }
    } catch {
      // fallback to SQLite
    }
  }

  const keys = listUserApiKeys(userId);
  return keys.map((k) => ({
    providerId: k.providerId,
    ...(k.label ? { label: k.label } : {}),
    ...(k.baseUrl ? { baseUrl: k.baseUrl } : {}),
    ...(k.modelId ? { modelId: k.modelId } : {}),
    status: k.status,
    enabled: k.enabled,
    ...(k.lastCheckedAt ? { lastCheckedAt: k.lastCheckedAt } : {}),
    ...(k.lastHealthyAt ? { lastHealthyAt: k.lastHealthyAt } : {}),
    ...(k.lastError ? { lastError: k.lastError } : {}),
    updatedAt: k.updatedAt
  }));
}

export async function toggleApiKeyStatus(
  userId: string,
  providerId: string,
  enabled: boolean
): Promise<void> {
  const env = getSupabaseEnv();
  if (env) {
    try {
      await fetch(
        `${env.url}/rest/v1/user_api_keys?user_id=eq.${encodeURIComponent(userId)}&provider_id=eq.${encodeURIComponent(providerId)}`,
        {
          method: 'PATCH',
          headers: { apikey: env.key, Authorization: `Bearer ${env.key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled, updated_at: new Date().toISOString() }),
          signal: AbortSignal.timeout(8_000)
        }
      );
    } catch {
      // ignore
    }
  }
  try {
    dbToggleApiKey(userId, providerId, enabled);
  } catch {
    // ignore in serverless without SQLite
  }
}

export async function checkAllUserApiKeys(userId: string): Promise<StoredKeySummary[]> {
  const keys = await fetchUserApiKeys('', userId);
  for (const k of keys) {
    const full = await getUserDecryptedApiKey(userId, k.providerId);
    if (!full) continue;
    try {
      const res = await testByokConnection({
        providerId: k.providerId as ByokProviderId,
        apiKey: full.apiKey,
        ...(full.baseUrl ? { baseUrl: full.baseUrl } : {}),
        ...(full.modelId ? { modelId: full.modelId } : {})
      });
      const now = new Date().toISOString();
      const env = getSupabaseEnv();
      if (env) {
        try {
          await fetch(
            `${env.url}/rest/v1/user_api_keys?user_id=eq.${encodeURIComponent(userId)}&provider_id=eq.${encodeURIComponent(k.providerId)}`,
            {
              method: 'PATCH',
              headers: { apikey: env.key, Authorization: `Bearer ${env.key}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                status: 'healthy',
                last_checked_at: now,
                last_healthy_at: now,
                last_error: null,
                model_id: res.model,
                updated_at: now
              }),
              signal: AbortSignal.timeout(8_000)
            }
          );
        } catch {
          // ignore
        }
      }
      try {
        updateKeyHealthStatus(userId, k.providerId, 'healthy', undefined, res.model);
      } catch {
        // ignore in serverless
      }
    } catch (err) {
      const now = new Date().toISOString();
      const errMsg = err instanceof Error ? err.message : 'Connection failed';
      const env = getSupabaseEnv();
      if (env) {
        try {
          await fetch(
            `${env.url}/rest/v1/user_api_keys?user_id=eq.${encodeURIComponent(userId)}&provider_id=eq.${encodeURIComponent(k.providerId)}`,
            {
              method: 'PATCH',
              headers: { apikey: env.key, Authorization: `Bearer ${env.key}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                status: 'error',
                last_checked_at: now,
                last_error: errMsg,
                updated_at: now
              }),
              signal: AbortSignal.timeout(8_000)
            }
          );
        } catch {
          // ignore
        }
      }
      try {
        updateKeyHealthStatus(userId, k.providerId, 'error', errMsg);
      } catch {
        // ignore in serverless
      }
    }
  }
  return fetchUserApiKeys('', userId);
}

export async function saveUserApiKey(
  accessToken: string,
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
  const enc = await encryptApiKeyAsync(params.apiKey.trim());
  const now = new Date().toISOString();
  const status = params.status ?? 'healthy';
  const username = await ensureUserRow(accessToken, user);

  const env = getSupabaseEnv();
  if (env) {
    const res = await fetch(`${env.url}/rest/v1/user_api_keys?on_conflict=user_id,provider_id`, {
      method: 'POST',
      headers: {
        apikey: env.key,
        Authorization: `Bearer ${env.key}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates'
      },
      body: JSON.stringify({
        user_id: user.id,
        username,
        provider_id: params.providerId,
        encrypted_key: enc.encrypted,
        iv: enc.iv,
        auth_tag: enc.authTag,
        base_url: params.baseUrl?.trim() || null,
        model_id: params.modelId?.trim() || null,
        label: params.label?.trim() || null,
        status,
        enabled: true,
        last_checked_at: now,
        last_healthy_at: status === 'healthy' ? now : null,
        last_error: params.lastError || null,
        updated_at: now
      }),
      signal: AbortSignal.timeout(8_000)
    });
    if (!res.ok) throw new Error(`Failed to save key in Supabase (${res.status}).`);
  }

  try {
    ensureUser(user.id, user.email, undefined, username);
    saveEncryptedApiKey({
      userId: user.id,
      username,
      providerId: params.providerId,
      apiKey: params.apiKey,
      ...(params.baseUrl ? { baseUrl: params.baseUrl } : {}),
      ...(params.modelId ? { modelId: params.modelId } : {}),
      ...(params.label ? { label: params.label } : {}),
      status: params.status ?? 'healthy',
      ...(params.lastError ? { lastError: params.lastError } : {})
    });
  } catch {
    // ignore in serverless without SQLite
  }
}

export async function deleteUserApiKey(
  _accessToken: string,
  userId: string,
  providerId: string
): Promise<void> {
  const env = getSupabaseEnv();
  if (env) {
    try {
      await fetch(
        `${env.url}/rest/v1/user_api_keys?user_id=eq.${encodeURIComponent(userId)}&provider_id=eq.${encodeURIComponent(providerId)}`,
        {
          method: 'DELETE',
          headers: { apikey: env.key, Authorization: `Bearer ${env.key}` },
          signal: AbortSignal.timeout(8_000)
        }
      );
    } catch {
      // ignore
    }
  }
  try {
    dbDeleteApiKey(userId, providerId);
  } catch {
    // ignore in serverless
  }
}

export async function getUserDecryptedApiKey(
  userId: string,
  providerId: string
): Promise<{ apiKey: string; baseUrl?: string; modelId?: string } | null> {
  const env = getSupabaseEnv();
  if (env) {
    try {
      const res = await fetch(
        `${env.url}/rest/v1/user_api_keys?user_id=eq.${encodeURIComponent(userId)}&provider_id=eq.${encodeURIComponent(providerId)}&enabled=eq.true&select=encrypted_key,iv,auth_tag,base_url,model_id`,
        {
          headers: { apikey: env.key, Authorization: `Bearer ${env.key}` },
          signal: AbortSignal.timeout(8_000)
        }
      );
      if (res.ok) {
        const rows = (await res.json()) as Array<{
          encrypted_key: string;
          iv: string;
          auth_tag: string;
          base_url?: string | null;
          model_id?: string | null;
        }>;
        if (rows[0]) {
          const apiKey = await decryptApiKeyAsync({
            encrypted: rows[0].encrypted_key,
            iv: rows[0].iv,
            authTag: rows[0].auth_tag
          });
          return {
            apiKey,
            ...(rows[0].base_url ? { baseUrl: rows[0].base_url } : {}),
            ...(rows[0].model_id ? { modelId: rows[0].model_id } : {})
          };
        }
      }
    } catch {
      // fallback to SQLite
    }
  }
  return getDecryptedApiKey(userId, providerId);
}

export async function getUserDefaultHealthyKey(
  userId: string
): Promise<{ providerId: string; apiKey: string; baseUrl?: string; modelId?: string } | null> {
  const env = getSupabaseEnv();
  if (env) {
    try {
      const res = await fetch(
        `${env.url}/rest/v1/user_api_keys?user_id=eq.${encodeURIComponent(userId)}&enabled=eq.true&status=eq.healthy&order=updated_at.desc&limit=1&select=provider_id,encrypted_key,iv,auth_tag,base_url,model_id`,
        {
          headers: { apikey: env.key, Authorization: `Bearer ${env.key}` },
          signal: AbortSignal.timeout(8_000)
        }
      );
      if (res.ok) {
        const rows = (await res.json()) as Array<{
          provider_id: string;
          encrypted_key: string;
          iv: string;
          auth_tag: string;
          base_url?: string | null;
          model_id?: string | null;
        }>;
        if (rows[0]) {
          const apiKey = await decryptApiKeyAsync({
            encrypted: rows[0].encrypted_key,
            iv: rows[0].iv,
            authTag: rows[0].auth_tag
          });
          return {
            providerId: rows[0].provider_id,
            apiKey,
            ...(rows[0].base_url ? { baseUrl: rows[0].base_url } : {}),
            ...(rows[0].model_id ? { modelId: rows[0].model_id } : {})
          };
        }
      }
    } catch {
      // fallback to SQLite
    }
  }
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
  const env = getSupabaseEnv();
  if (env) {
    try {
      const res = await fetch(
        `${env.url}/rest/v1/user_access_tokens?user_id=eq.${encodeURIComponent(userId)}&revoked_at=is.null&order=created_at.desc&select=id,user_id,token_prefix,name,last_used_at,created_at`,
        {
          headers: { apikey: env.key, Authorization: `Bearer ${env.key}` },
          signal: AbortSignal.timeout(8_000)
        }
      );
      if (res.ok) {
        const rows = (await res.json()) as Array<{
          id: string;
          token_prefix: string;
          name: string;
          last_used_at?: string | null;
          created_at: string;
        }>;
        return rows.map((t) => ({
          id: t.id,
          name: t.name,
          prefix: t.token_prefix,
          ...(t.last_used_at ? { lastUsedAt: t.last_used_at } : {}),
          createdAt: t.created_at
        }));
      }
    } catch {
      // fallback to SQLite
    }
  }

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
  accessToken: string,
  user: VerifiedUser,
  name?: string
): Promise<{ token: string; prefix: string; id: string }> {
  const { token, prefix, hash } = generatePromptPilotToken();
  const tokenName = name?.trim() || 'Default Key';
  const username = await ensureUserRow(accessToken, user);

  const env = getSupabaseEnv();
  if (env) {
    const res = await fetch(`${env.url}/rest/v1/user_access_tokens`, {
      method: 'POST',
      headers: {
        apikey: env.key,
        Authorization: `Bearer ${env.key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation'
      },
      body: JSON.stringify({
        user_id: user.id,
        username,
        token_hash: hash,
        token_prefix: prefix,
        name: tokenName
      }),
      signal: AbortSignal.timeout(8_000)
    });
    if (res.ok) {
      const created = (await res.json()) as Array<{ id: string }>;
      if (created[0]) {
        return { token, prefix, id: created[0].id };
      }
    }
  }

  try {
    ensureUser(user.id, user.email, undefined, username);
    const saved = saveAccessToken(user.id, token, prefix, tokenName);
    return { token, prefix, id: saved.id };
  } catch {
    return { token, prefix, id: crypto.randomUUID() };
  }
}

export async function revokeUserAccessToken(
  _accessToken: string,
  userId: string,
  tokenId: string
): Promise<void> {
  const env = getSupabaseEnv();
  if (env) {
    try {
      await fetch(
        `${env.url}/rest/v1/user_access_tokens?user_id=eq.${encodeURIComponent(userId)}&id=eq.${encodeURIComponent(tokenId)}`,
        {
          method: 'PATCH',
          headers: { apikey: env.key, Authorization: `Bearer ${env.key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ revoked_at: new Date().toISOString() }),
          signal: AbortSignal.timeout(8_000)
        }
      );
    } catch {
      // ignore
    }
  }
  try {
    revokeAccessToken(userId, tokenId);
  } catch {
    // ignore in serverless
  }
}

export async function logPromptHistory(
  userId: string,
  originalPrompt: string,
  enhancedPrompt: string,
  mode: string,
  category: string,
  providerId?: string,
  username?: string
): Promise<void> {
  const env = getSupabaseEnv();
  if (env) {
    try {
      await fetch(`${env.url}/rest/v1/prompt_history`, {
        method: 'POST',
        headers: { apikey: env.key, Authorization: `Bearer ${env.key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          ...(username ? { username } : {}),
          original_prompt: originalPrompt,
          enhanced_prompt: enhancedPrompt,
          mode,
          category,
          provider_id: providerId || null
        }),
        signal: AbortSignal.timeout(8_000)
      });
    } catch {
      // ignore
    }
  }
  try {
    recordPromptHistory({
      userId,
      originalPrompt,
      enhancedPrompt,
      mode,
      category,
      ...(providerId ? { providerId } : {})
    });
  } catch {
    // ignore in serverless
  }
}

