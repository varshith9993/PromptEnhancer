import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseConfig } from './config';

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

export function getStoredAuthSession(): AuthSession {
  if (typeof window === 'undefined') return null;
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
  localStorage.removeItem('promptenhancer_auth_v1');
  localStorage.removeItem('promptenhancer_local_mode_v1');
  localStorage.removeItem('promptpilot_local_mode_v1');
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
