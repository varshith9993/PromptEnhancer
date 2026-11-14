import { useEffect, useState, type FormEvent } from 'react';
import {
  isSupabaseConfigured,
  signInWithEmailLink,
  signInWithOAuthProvider,
  signOutUser,
  verifyEmailOtp,
  supabase,
  type AuthSession
} from '../lib/supabase';

export function LoginPage() {
  const [session, setSession] = useState<AuthSession>(null);
  const [email, setEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [emailSent, setEmailSent] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => sub.subscription.unsubscribe();
  }, []);

  async function handleOAuth(provider: 'google' | 'github') {
    setError('');
    setNotice('');
    setBusy(provider);
    try {
      await signInWithOAuthProvider(provider);
    } catch (err) {
      setError(err instanceof Error ? err.message : `${provider} sign-in failed.`);
      setBusy(null);
    }
  }

  async function handleEmailSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setNotice('');
    setBusy('email');
    try {
      const syncKey = Math.random().toString(36).slice(2) + Date.now().toString(36);
      await signInWithEmailLink(email, syncKey);
      setEmailSent(true);
      setNotice('Verification email sent! If you click the link on your mobile, this screen will log in automatically.');

      // Listen for cross-device authentication broadcast from phone
      if (supabase) {
        const client = supabase;
        const channel = client.channel(`auth-sync-${syncKey}`);
        channel.on('broadcast', { event: 'logged_in' }, async ({ payload }) => {
          if (payload?.access_token && payload?.refresh_token) {
            await client.auth.setSession({
              access_token: payload.access_token,
              refresh_token: payload.refresh_token
            });
            channel.unsubscribe();
          }
        });
        channel.subscribe();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send verification email.');
    } finally {
      setBusy(null);
    }
  }

  async function handleOtpSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setNotice('');
    setBusy('otp');
    try {
      await verifyEmailOtp(email, otpCode);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid code. Please check your email and try again.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <div className="p-6 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-5">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Sign in to PromptPilot</h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Sign in with Google, GitHub, or an email verification link. Free and BYOK modes also
            work without signing in.
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

        {notice && (
          <div className="p-3 rounded border border-emerald-500/40 bg-emerald-500/10 text-xs text-emerald-400">
            {notice}
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
          <div className="space-y-4">
            {!emailSent ? (
              <>
                <div className="space-y-2.5">
                  <button
                    type="button"
                    disabled={!isSupabaseConfigured || busy !== null}
                    onClick={() => void handleOAuth('google')}
                    className="w-full px-4 py-2.5 rounded bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-500 disabled:opacity-50"
                  >
                    {busy === 'google' ? 'Redirecting to Google...' : 'Continue with Google'}
                  </button>

                  <button
                    type="button"
                    disabled={!isSupabaseConfigured || busy !== null}
                    onClick={() => void handleOAuth('github')}
                    className="w-full px-4 py-2.5 rounded border border-zinc-300 dark:border-zinc-700 text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50"
                  >
                    {busy === 'github' ? 'Redirecting to GitHub...' : 'Continue with GitHub'}
                  </button>
                </div>

                <div className="flex items-center gap-3 text-[11px] text-zinc-500">
                  <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
                  <span>OR</span>
                  <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
                </div>

                <form onSubmit={(e) => void handleEmailSubmit(e)} className="space-y-2.5">
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full px-3 py-2 rounded border border-zinc-300 dark:border-zinc-700 bg-transparent text-sm"
                  />
                  <button
                    type="submit"
                    disabled={!isSupabaseConfigured || busy !== null || !email.trim()}
                    className="w-full px-4 py-2 rounded border border-zinc-300 dark:border-zinc-700 text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50"
                  >
                    {busy === 'email' ? 'Sending link...' : 'Send Email Verification Link'}
                  </button>
                </form>
              </>
            ) : (
              <div className="space-y-4">
                <div className="p-3 rounded border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/60 text-xs space-y-2">
                  <div className="flex items-center gap-2 text-indigo-400">
                    <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                    <span className="font-medium">Waiting for verification...</span>
                  </div>
                  <p className="text-zinc-500 dark:text-zinc-400">
                    Click the <strong>Sign In</strong> link on your mobile, or enter the 6-digit code from the email below:
                  </p>
                </div>

                <form onSubmit={(e) => void handleOtpSubmit(e)} className="space-y-2.5">
                  <input
                    type="text"
                    required
                    maxLength={10}
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value)}
                    placeholder="Enter 6-digit code"
                    className="w-full px-3 py-2 rounded border border-zinc-300 dark:border-zinc-700 bg-transparent text-sm font-mono tracking-widest text-center text-lg"
                  />
                  <button
                    type="submit"
                    disabled={busy !== null || !otpCode.trim()}
                    className="w-full px-4 py-2 rounded bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-500 disabled:opacity-50"
                  >
                    {busy === 'otp' ? 'Verifying code...' : 'Verify Code & Sign In'}
                  </button>
                </form>

                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => {
                      setEmailSent(false);
                      setOtpCode('');
                      setNotice('');
                      setError('');
                    }}
                    className="text-xs text-zinc-500 hover:text-zinc-300 underline"
                  >
                    Use a different email or resend
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
