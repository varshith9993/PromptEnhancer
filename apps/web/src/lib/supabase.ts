import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseConfig } from './config';

const { url: supabaseUrl, key: supabaseKey } = getSupabaseConfig();

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);

export const supabase: SupabaseClient | null =
  supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

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

export async function signInWithEmailLink(email: string, syncKey?: string): Promise<void> {
  if (!supabase) {
    throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.');
  }
  const trimmed = email.trim();
  if (!trimmed) {
    throw new Error('Enter a valid email address.');
  }
  const redirectUrl = syncKey
    ? `${window.location.origin}/enhance?auth_sync=${encodeURIComponent(syncKey)}`
    : `${window.location.origin}/enhance`;

  const { error } = await supabase.auth.signInWithOtp({
    email: trimmed,
    options: {
      emailRedirectTo: redirectUrl
    }
  });
  if (error) throw error;
}

export async function verifyEmailOtp(email: string, token: string): Promise<void> {
  if (!supabase) {
    throw new Error('Supabase is not configured.');
  }
  const trimmedEmail = email.trim();
  const trimmedToken = token.trim();
  if (!trimmedEmail || !trimmedToken) {
    throw new Error('Please enter both your email and the 6-digit code.');
  }
  const { error } = await supabase.auth.verifyOtp({
    email: trimmedEmail,
    token: trimmedToken,
    type: 'email'
  });
  if (error) throw error;
}

export async function signOutUser(): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export type AuthSession = Session | null;
