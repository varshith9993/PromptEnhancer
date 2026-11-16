const DEFAULT_SUPABASE_URL = 'https://rctrcehxxgppvateqcrc.supabase.co';
const DEFAULT_SUPABASE_PUBLISHABLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJjdHJjZWh4eGdwcHZhdGVxY3JjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ1NzI0NTcsImV4cCI6MjExMDE0ODQ1N30.Xqed8JcyAgwWP8rzFjQltQLDw-AMvnlodcoj3cDTpoc';
const DEFAULT_PROD_API_URL = 'https://promptenhancer.varshithkumar006.workers.dev';

export function getApiUrl(): string {
  const isNonLocalHost =
    typeof window !== 'undefined' &&
    window.location.hostname !== 'localhost' &&
    window.location.hostname !== '127.0.0.1';
  const envUrl = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
  if (envUrl && !(isNonLocalHost && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(envUrl))) {
    return envUrl;
  }
  return isNonLocalHost ? DEFAULT_PROD_API_URL : 'http://localhost:4000';
}

export function getSupabaseConfig(): { url: string; key: string } {
  const env = import.meta.env as Record<string, string | undefined>;
  const url = (env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL).trim();
  const candidateKey = (env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY || '').trim();
  const key = candidateKey.startsWith('eyJ') ? candidateKey : DEFAULT_SUPABASE_PUBLISHABLE_KEY;
  return { url, key };
}
