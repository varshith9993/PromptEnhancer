const DEFAULT_SUPABASE_URL = 'https://rctrcehxxgppvateqcrc.supabase.co';
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_kYgxarXfmc9RAm5cX1X_Ug_gD6REbT5';
const DEFAULT_PROD_API_URL = 'https://promptenhancer.varshithkumar006.workers.dev';

export function getApiUrl(): string {
  const envUrl = import.meta.env.VITE_API_URL as string | undefined;
  if (envUrl && envUrl.trim()) {
    return envUrl.trim();
  }
  if (
    typeof window !== 'undefined' &&
    window.location.hostname !== 'localhost' &&
    window.location.hostname !== '127.0.0.1'
  ) {
    return DEFAULT_PROD_API_URL;
  }
  return 'http://localhost:4000';
}

export function getSupabaseConfig(): { url: string; key: string } {
  const env = import.meta.env as Record<string, string | undefined>;
  const url = (env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL).trim();
  const key = (
    env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    env.VITE_SUPABASE_ANON_KEY ||
    DEFAULT_SUPABASE_PUBLISHABLE_KEY
  ).trim();
  return { url, key };
}
