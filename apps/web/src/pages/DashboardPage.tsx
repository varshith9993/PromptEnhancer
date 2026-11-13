import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { INTEGRATIONS } from '@promptpilot/config';
import { supabase, type AuthSession } from '../lib/supabase';

export function DashboardPage() {
  const [session, setSession] = useState<AuthSession>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-12 text-xs text-zinc-500">
        Loading account...
      </div>
    );
  }

  if (!session) {
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <div className="p-6 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-4 text-center">
          <h1 className="text-lg font-semibold">Sign in required</h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Sign in with Google, GitHub, or Email to view your dashboard. Free and BYOK enhancement
            still work without signing in.
          </p>
          <Link
            to="/login"
            className="inline-block px-4 py-2 rounded bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-500"
          >
            Go to Sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Signed in as {session.user.email}
          </p>
        </div>
        <Link
          to="/enhance"
          className="px-4 py-2 rounded bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-500"
        >
          Open Enhancer
        </Link>
      </div>

      <div className="grid sm:grid-cols-3 gap-4 text-sm">
        <div className="p-4 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-1">
          <span className="text-xs text-zinc-500">Current Plan</span>
          <p className="font-semibold">Free & BYOK</p>
          <p className="text-xs text-zinc-500">Managed AI & Razorpay billing deferred</p>
        </div>
        <div className="p-4 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-1">
          <span className="text-xs text-zinc-500">Auth Provider</span>
          <p className="font-semibold capitalize">
            {(session.user.app_metadata?.provider as string | undefined) ?? 'email'}
          </p>
          <p className="text-xs text-zinc-500">Verified via Supabase Auth</p>
        </div>
        <div className="p-4 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-1">
          <span className="text-xs text-zinc-500">BYOK Key Storage</span>
          <p className="font-semibold">Memory-only / Local CLI</p>
          <p className="text-xs text-zinc-500">Keys are never saved to database</p>
        </div>
      </div>

      <div className="p-5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">Integrations Status</h2>
          <Link to="/install" className="text-xs text-indigo-500 hover:underline">
            Installation Centre
          </Link>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          {INTEGRATIONS.map((item) => (
            <div key={item.id} className="p-3 rounded border border-zinc-200 dark:border-zinc-800">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{item.name}</span>
                <span className="uppercase text-[10px] text-zinc-500">{item.status}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

