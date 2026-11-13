import type { PromptProfile, UserInstruction } from '@promptpilot/shared';

export interface VerifiedUser {
  id: string;
  email: string;
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
  return { id: user.id, email: user.email };
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
