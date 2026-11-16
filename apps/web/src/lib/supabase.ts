import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { getApiUrl, getSupabaseConfig } from './config';

const { url: supabaseUrl, key: supabaseKey } = getSupabaseConfig();

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);

export const supabase: SupabaseClient | null =
  supabaseUrl && supabaseKey
    ? createClient(supabaseUrl, supabaseKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          flowType: 'pkce'
        }
      })
    : null;

export const LOCAL_AUTH_KEY = 'promptenhancer_auth_v1';
export const SESSION_STORAGE_KEY = 'promptenhancer_session_v1';
export const AUTH_CHANGE_EVENT = 'promptenhancer:auth-changed';

let lastSyncedToken = '';
let inflightOAuthPromise: Promise<AuthSession> | null = null;

function notifyAuthChanged(session: AuthSession): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(AUTH_CHANGE_EVENT, { detail: session }));
  }
}

export function getStoredAuthSession(): AuthSession {
  if (typeof window === 'undefined') return null;

  try {
    const savedRaw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (savedRaw) {
      const parsed = JSON.parse(savedRaw) as {
        access_token?: string;
        user?: { id?: string; email?: string; app_metadata?: Record<string, unknown> };
      };
      if (parsed.access_token && parsed.user?.id && parsed.user?.email) {
        return parsed as unknown as AuthSession;
      }
    }
  } catch {
    // ignore malformed stored session
  }

  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (k && /^sb-.*-auth-token$/.test(k)) {
        const raw = localStorage.getItem(k);
        if (!raw) continue;
        const parsed = JSON.parse(raw) as {
          access_token?: string;
          user?: { id?: string; email?: string };
          currentSession?: { access_token?: string; user?: { id?: string; email?: string } };
        };
        const candidate = parsed.currentSession ?? parsed;
        if (candidate.access_token && candidate.user?.id && candidate.user?.email) {
          return candidate as unknown as AuthSession;
        }
      }
    }
  } catch {
    // ignore malformed supabase cache
  }

  const isLocal =
    localStorage.getItem('promptenhancer_auth_v1') === 'true' ||
    localStorage.getItem('promptenhancer_local_mode_v1') === 'true' ||
    localStorage.getItem('promptpilot_local_mode_v1') === 'true';
  if (isLocal) {
    return {
      access_token: 'local-token',
      user: {
        id: 'user-promptenhancer',
        email: 'developer@promptenhancer.dev',
        app_metadata: { provider: 'developer' }
      }
    } as unknown as AuthSession;
  }
  return null;
}

export async function syncUserSessionWithBackend(session: AuthSession): Promise<void> {
  if (!session?.access_token || session.access_token === 'local-token') return;
  if (lastSyncedToken === session.access_token) return;
  lastSyncedToken = session.access_token;
  try {
    await fetch(`${getApiUrl()}/api/me/sync`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`
      }
    });
  } catch {
    lastSyncedToken = '';
  }
}

export async function resolveOAuthCallback(): Promise<AuthSession> {
  if (typeof window === 'undefined') return null;

  const searchParams = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const errDesc =
    searchParams.get('error_description') || hashParams.get('error_description') || '';
  const errCode = searchParams.get('error') || hashParams.get('error') || '';

  const isExternalCodeExchangeError =
    errDesc.includes('Unable to exchange external code') ||
    errDesc.includes('invalid_client') ||
    errCode === 'server_error';

  if (isExternalCodeExchangeError) {
    if (!inflightOAuthPromise) {
      inflightOAuthPromise = (async () => {
        try {
          const res = await fetch(`${getApiUrl()}/api/auth/oauth-fallback`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
          });
          if (!res.ok) return null;
          const data = (await res.json()) as {
            ok?: boolean;
            token?: string;
            user?: { id: string; email: string };
          };
          if (!data.token || !data.user?.id || !data.user?.email) return null;

          const fallbackSession = {
            access_token: data.token,
            user: {
              id: data.user.id,
              email: data.user.email,
              app_metadata: { provider: 'google' }
            }
          } as unknown as AuthSession;

          localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(fallbackSession));
          window.history.replaceState({}, '', window.location.pathname);
          notifyAuthChanged(fallbackSession);
          return fallbackSession;
        } catch {
          return null;
        } finally {
          inflightOAuthPromise = null;
        }
      })();
    }
    return inflightOAuthPromise;
  }

  if (supabase) {
    try {
      const { data } = await supabase.auth.getSession();
      if (data?.session) {
        await syncUserSessionWithBackend(data.session);
        if (
          searchParams.has('code') ||
          hashParams.has('access_token') ||
          searchParams.has('error') ||
          hashParams.has('error')
        ) {
          window.history.replaceState({}, '', window.location.pathname);
        }
        return data.session;
      }
    } catch {
      // ignore
    }
  }

  return getStoredAuthSession();
}

export async function signInWithOAuthProvider(provider: 'google' | 'github'): Promise<void> {
  if (!supabase) {
    throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.');
  }
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: `${window.location.origin}/enhance`
    }
  });
  if (error) throw error;
}

export function signInDemoUser(): void {
  localStorage.setItem('promptenhancer_auth_v1', 'true');
  localStorage.setItem('promptenhancer_local_mode_v1', 'true');
  localStorage.setItem('promptpilot_local_mode_v1', 'true');
  window.location.href = '/enhance';
}

export async function signOutUser(): Promise<void> {
  localStorage.removeItem(SESSION_STORAGE_KEY);
  localStorage.removeItem('promptenhancer_auth_v1');
  localStorage.removeItem('promptenhancer_local_mode_v1');
  localStorage.removeItem('promptpilot_local_mode_v1');
  lastSyncedToken = '';
  if (supabase) {
    try {
      await supabase.auth.signOut();
    } catch {
      // ignore
    }
  }
  window.location.href = '/login';
}

export type AuthSession = Session | null;
