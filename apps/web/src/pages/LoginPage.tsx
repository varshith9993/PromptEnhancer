import { useEffect, useState } from 'react';
import {
  AUTH_CHANGE_EVENT,
  getStoredAuthSession,
  isSupabaseConfigured,
  resolveOAuthCallback,
  signInDemoUser,
  signInWithOAuthProvider,
  signOutUser,
  supabase,
  syncUserSessionWithBackend,
  type AuthSession
} from '../lib/supabase';

export function LoginPage() {
  const [session, setSession] = useState<AuthSession>(() => getStoredAuthSession());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const errDesc =
      searchParams.get('error_description') ||
      searchParams.get('error') ||
      hashParams.get('error_description') ||
      hashParams.get('error');

    if (searchParams.has('code') || hashParams.has('access_token') || errDesc) {
      setBusy('oauth_exchange');
    }

    let cancelled = false;
    void resolveOAuthCallback().then((resolved) => {
      if (cancelled) return;
      if (resolved) {
        setSession(resolved);
        setError('');
        setBusy(null);
        return;
      }
      setBusy(null);
      if (errDesc) {
        setError(decodeURIComponent(errDesc.replace(/\+/g, ' ')));
      }
    });

    const onAuthEvent = (ev: Event) => {
      const detail = (ev as CustomEvent<AuthSession>).detail;
      if (detail) {
        setSession(detail);
        setError('');
        setBusy(null);
      }
    };
    window.addEventListener(AUTH_CHANGE_EVENT, onAuthEvent);

    let unsubscribe: (() => void) | undefined;
    if (supabase) {
      const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
        if (next) {
          setSession(next);
          setBusy(null);
          void syncUserSessionWithBackend(next).finally(() => {
            window.location.href = '/enhance';
          });
        }
      });
      unsubscribe = () => sub.subscription.unsubscribe();
    }

    return () => {
      cancelled = true;
      window.removeEventListener(AUTH_CHANGE_EVENT, onAuthEvent);
      unsubscribe?.();
    };
  }, []);

  async function handleOAuth(provider: 'google' | 'github') {
    setError('');
    setBusy(provider);
    try {
      await signInWithOAuthProvider(provider);
    } catch (err) {
      setError(err instanceof Error ? err.message : `${provider} sign-in failed.`);
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <div className="p-6 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-6 shadow-sm">
        <div className="space-y-1.5 text-center">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-indigo-600/10 text-indigo-500 mb-2">
            <span className="w-4 h-4 rounded-sm bg-indigo-600" />
          </div>
          <h1 className="text-xl font-semibold">Sign in to PromptEnhancer</h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Sign in to manage your API keys, sync custom preferences, and generate your personal PromptEnhancer key.
          </p>
        </div>

        {!isSupabaseConfigured && (
          <div className="p-3 rounded border border-amber-500/40 bg-amber-500/10 text-xs text-amber-400">
            Missing Supabase configuration. See docs/setup-guide.md.
          </div>
        )}

        {error && (
          <div className="p-3.5 rounded border border-red-500/40 bg-red-500/10 text-xs text-red-400 space-y-1">
            <p className="font-semibold">Sign-in Notice:</p>
            <p className="leading-relaxed">{error}</p>
          </div>
        )}

        {session ? (
          <div className="space-y-4">
            <div className="p-3.5 rounded-md bg-zinc-100 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-800 text-xs space-y-1">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <p className="font-medium text-zinc-900 dark:text-zinc-100">Signed In</p>
              </div>
              <p className="text-zinc-600 dark:text-zinc-400 pl-4">{session.user.email}</p>
            </div>
            <div className="flex gap-2">
              <a
                href="/enhance"
                className="flex-1 text-center px-4 py-2.5 rounded-md bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-500 transition"
              >
                Go to Enhancer
              </a>
              <button
                type="button"
                onClick={() => void signOutUser()}
                className="px-4 py-2.5 rounded-md border border-zinc-300 dark:border-zinc-700 text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
              >
                Sign out
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <button
              type="button"
              disabled={!isSupabaseConfigured || busy !== null}
              onClick={() => void handleOAuth('google')}
              className="w-full flex items-center justify-center gap-2.5 px-4 py-2.5 rounded-md bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-500 disabled:opacity-50 transition shadow-sm"
            >
              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                <path d="M12.24 10.285V13.4h6.887C18.2 16.14 15.645 18 12.24 18c-3.315 0-6-2.685-6-6s2.685-6 6-6c1.47 0 2.805.54 3.84 1.425l2.4-2.4C16.89 3.51 14.7 2.6 12.24 2.6 7.05 2.6 2.84 6.81 2.84 12s4.21 9.4 9.4 9.4c5.43 0 9.045-3.825 9.045-9.225 0-.675-.075-1.32-.195-1.89H12.24z" />
              </svg>
              {busy === 'google' ? 'Redirecting to Google...' : busy === 'oauth_exchange' ? 'Exchanging credentials...' : 'Continue with Google'}
            </button>

            <button
              type="button"
              disabled={!isSupabaseConfigured || busy !== null}
              onClick={() => void handleOAuth('github')}
              className="w-full flex items-center justify-center gap-2.5 px-4 py-2.5 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-700/60 disabled:opacity-50 transition"
            >
              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
              </svg>
              {busy === 'github' ? 'Redirecting to GitHub...' : 'Continue with GitHub'}
            </button>

            <div className="flex items-center gap-3 text-[11px] text-zinc-500 pt-1">
              <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
              <span>OR INSTANT ACCESS</span>
              <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
            </div>

            <button
              type="button"
              onClick={() => signInDemoUser()}
              className="w-full py-2.5 px-4 rounded-md border border-dashed border-indigo-500/40 bg-indigo-500/5 hover:bg-indigo-500/10 text-indigo-400 text-xs font-medium transition"
            >
              Instant 1-Click Sign In (Demo Developer Mode) &rarr;
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
