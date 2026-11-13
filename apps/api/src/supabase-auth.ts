import type { PromptProfile, UserInstruction } from '@promptpilot/shared';
import {
  decryptApiKey,
  encryptApiKey,
  generatePromptPilotToken,
  hashToken
} from './crypto.js';

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
  const env = getSupabaseEnv();
  if (!env || !authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;

  // 1. Personal Access Token (pp_live_...)
  if (token.startsWith('pp_live_')) {
    const hash = hashToken(token);
    const res = await fetch(
      `${env.url}/rest/v1/user_access_tokens?token_hash=eq.${encodeURIComponent(hash)}&revoked_at=is.null&select=id,user_id,users(id,email)`,
      {
        headers: { apikey: env.key, Authorization: `Bearer ${env.key}` },
        signal: AbortSignal.timeout(8_000)
      }
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{
      id: string;
      user_id: string;
      users?: { id: string; email: string };
    }>;
    if (rows.length && rows[0]?.users) {
      // Update last_used_at timestamp in background
      void fetch(`${env.url}/rest/v1/user_access_tokens?id=eq.${rows[0].id}`, {
        method: 'PATCH',
        headers: {
          apikey: env.key,
          Authorization: `Bearer ${env.key}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ last_used_at: new Date().toISOString() })
      });
      return { id: rows[0].users.id, email: rows[0].users.email, tokenType: 'api_key' };
    }
    return null;
  }

  // 2. Supabase Auth JWT token
  const res = await fetch(`${env.url}/auth/v1/user`, {
    headers: {
      apikey: env.key,
      Authorization: `Bearer ${token}`
    },
    signal: AbortSignal.timeout(8_000)
  });
  if (!res.ok) return null;
  const user = (await res.json()) as { id?: string; email?: string };
  if (!user.id || !user.email) return null;
  return { id: user.id, email: user.email, tokenType: 'jwt' };
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
  updatedAt: string;
}

export async function fetchUserApiKeys(
  accessToken: string,
  userId: string
): Promise<StoredKeySummary[]> {
  const env = getSupabaseEnv();
  if (!env) throw new Error('Supabase is not configured on API.');
  const res = await fetch(
    `${env.url}/rest/v1/user_api_keys?user_id=eq.${encodeURIComponent(userId)}&select=provider_id,label,base_url,model_id,updated_at&order=updated_at.desc`,
    {
      headers: { apikey: env.key, Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(8_000)
    }
  );
  if (!res.ok) throw new Error(`Failed to load keys (${res.status}).`);
  const rows = (await res.json()) as Array<{
    provider_id: string;
    label?: string;
    base_url?: string;
    model_id?: string;
    updated_at: string;
  }>;
  return rows.map((r) => ({
    providerId: r.provider_id,
    label: r.label,
    baseUrl: r.base_url,
    modelId: r.model_id,
    updatedAt: r.updated_at
  }));
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
  }
): Promise<void> {
  const env = getSupabaseEnv();
  if (!env) throw new Error('Supabase is not configured on API.');
  await ensureUserRow(accessToken, user);

  const enc = encryptApiKey(params.apiKey.trim());

  const res = await fetch(`${env.url}/rest/v1/user_api_keys?on_conflict=user_id,provider_id`, {
    method: 'POST',
    headers: {
      apikey: env.key,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates'
    },
    body: JSON.stringify({
      user_id: user.id,
      provider_id: params.providerId,
      encrypted_key: enc.encrypted,
      iv: enc.iv,
      auth_tag: enc.authTag,
      base_url: params.baseUrl?.trim() || null,
      model_id: params.modelId?.trim() || null,
      label: params.label?.trim() || null,
      updated_at: new Date().toISOString()
    }),
    signal: AbortSignal.timeout(8_000)
  });
  if (!res.ok) throw new Error(`Failed to save key (${res.status}).`);
}

export async function deleteUserApiKey(
  accessToken: string,
  userId: string,
  providerId: string
): Promise<void> {
  const env = getSupabaseEnv();
  if (!env) throw new Error('Supabase is not configured on API.');
  const res = await fetch(
    `${env.url}/rest/v1/user_api_keys?user_id=eq.${encodeURIComponent(userId)}&provider_id=eq.${encodeURIComponent(providerId)}`,
    {
      method: 'DELETE',
      headers: { apikey: env.key, Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(8_000)
    }
  );
  if (!res.ok) throw new Error(`Failed to delete key (${res.status}).`);
}

export async function getUserDecryptedApiKey(
  userId: string,
  providerId: string
): Promise<{ apiKey: string; baseUrl?: string; modelId?: string } | null> {
  const env = getSupabaseEnv();
  if (!env) return null;
  const res = await fetch(
    `${env.url}/rest/v1/user_api_keys?user_id=eq.${encodeURIComponent(userId)}&provider_id=eq.${encodeURIComponent(providerId)}&select=encrypted_key,iv,auth_tag,base_url,model_id`,
    {
      headers: { apikey: env.key, Authorization: `Bearer ${env.key}` },
      signal: AbortSignal.timeout(8_000)
    }
  );
  if (!res.ok) return null;
  const rows = (await res.json()) as Array<{
    encrypted_key: string;
    iv: string;
    auth_tag: string;
    base_url?: string;
    model_id?: string;
  }>;
  if (!rows.length || !rows[0]) return null;
  const row = rows[0];
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

// User Personal Access Tokens (pp_live_...)
export interface StoredTokenSummary {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt?: string | undefined;
  createdAt: string;
}

export async function fetchUserAccessTokens(
  accessToken: string,
  userId: string
): Promise<StoredTokenSummary[]> {
  const env = getSupabaseEnv();
  if (!env) throw new Error('Supabase is not configured on API.');
  const res = await fetch(
    `${env.url}/rest/v1/user_access_tokens?user_id=eq.${encodeURIComponent(userId)}&revoked_at=is.null&select=id,name,token_prefix,last_used_at,created_at&order=created_at.desc`,
    {
      headers: { apikey: env.key, Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(8_000)
    }
  );
  if (!res.ok) throw new Error(`Failed to load tokens (${res.status}).`);
  const rows = (await res.json()) as Array<{
    id: string;
    name: string;
    token_prefix: string;
    last_used_at?: string;
    created_at: string;
  }>;
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    prefix: r.token_prefix,
    lastUsedAt: r.last_used_at,
    createdAt: r.created_at
  }));
}

export async function createUserAccessToken(
  accessToken: string,
  user: VerifiedUser,
  name?: string
): Promise<{ token: string; prefix: string; id: string }> {
  const env = getSupabaseEnv();
  if (!env) throw new Error('Supabase is not configured on API.');
  await ensureUserRow(accessToken, user);

  const { token, prefix, hash } = generatePromptPilotToken();
  const res = await fetch(`${env.url}/rest/v1/user_access_tokens`, {
    method: 'POST',
    headers: {
      apikey: env.key,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: JSON.stringify({
      user_id: user.id,
      token_hash: hash,
      token_prefix: prefix,
      name: name?.trim() || 'Default Key'
    }),
    signal: AbortSignal.timeout(8_000)
  });
  if (!res.ok) throw new Error(`Failed to create token (${res.status}).`);
  const rows = (await res.json()) as Array<{ id: string }>;
  return { token, prefix, id: rows[0]?.id ?? '' };
}

export async function revokeUserAccessToken(
  accessToken: string,
  userId: string,
  tokenId: string
): Promise<void> {
  const env = getSupabaseEnv();
  if (!env) throw new Error('Supabase is not configured on API.');
  const res = await fetch(
    `${env.url}/rest/v1/user_access_tokens?id=eq.${encodeURIComponent(tokenId)}&user_id=eq.${encodeURIComponent(userId)}`,
    {
      method: 'PATCH',
      headers: {
        apikey: env.key,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ revoked_at: new Date().toISOString() }),
      signal: AbortSignal.timeout(8_000)
    }
  );
  if (!res.ok) throw new Error(`Failed to revoke token (${res.status}).`);
}

export async function logPromptHistory(
  userId: string,
  originalPrompt: string,
  enhancedPrompt: string,
  mode: string,
  category: string
): Promise<void> {
  const env = getSupabaseEnv();
  if (!env) return;
  void fetch(`${env.url}/rest/v1/prompt_history`, {
    method: 'POST',
    headers: {
      apikey: env.key,
      Authorization: `Bearer ${env.key}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      user_id: userId,
      original_prompt: originalPrompt,
      enhanced_prompt: enhancedPrompt,
      mode,
      category
    }),
    signal: AbortSignal.timeout(8_000)
  });
}

