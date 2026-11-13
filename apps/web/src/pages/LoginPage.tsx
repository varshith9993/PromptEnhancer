import { useEffect, useState } from 'react';
import { isSupabaseConfigured, signInWithGoogle, signOutUser, supabase, type AuthSession } from '../lib/supabase';

export function LoginPage() {
  const [session, setSession] = useState<AuthSession>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => sub.subscription.unsubscribe();
  }, []);

  async function handleGoogleLogin() {
    setError('');
    setBusy(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed.');
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <div className="p-6 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-5">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Sign in to PromptPilot</h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Authentication is powered by Supabase Google OAuth. Free and BYOK modes also work without
            signing in.
          </p>
        </div>

        {!isSupabaseConfigured && (
          <div className="p-3 rounded border border-amber-500/40 bg-amber-500/10 text-xs text-amber-400">
            Missing <code>VITE_SUPABASE_URL</code> or <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> in{' '}
            <code>apps/web/.env</code>. See <code>docs/setup-guide.md</code>.
          </div>
        )}

        {error && (
          <div className="p-3 rounded border border-red-500/40 bg-red-500/10 text-xs text-red-400">
            {error}
          </div>
        )}

        {session ? (
          <div className="space-y-4">
            <div className="p-3 rounded bg-zinc-100 dark:bg-zinc-800 text-xs space-y-1">
              <p className="font-medium">Signed in</p>
              <p className="text-zinc-600 dark:text-zinc-300">{session.user.email}</p>
            </div>
            <button
              type="button"
              onClick={() => void signOutUser()}
              className="w-full px-4 py-2 rounded border border-zinc-300 dark:border-zinc-700 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              Sign out
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={!isSupabaseConfigured || busy}
            onClick={() => void handleGoogleLogin()}
            className="w-full px-4 py-2.5 rounded bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-500 disabled:opacity-50"
          >
            {busy ? 'Redirecting to Google...' : 'Continue with Google'}
          </button>
        )}
      </div>
    </div>
  );
}

