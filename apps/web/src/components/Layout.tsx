import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { supabase, signOutUser, type AuthSession } from '../lib/supabase';

export function Layout() {
  const location = useLocation();
  const [dark, setDark] = useState(true);
  const [session, setSession] = useState<AuthSession>(null);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const navLinks = [
    { to: '/', label: 'Home' },
    { to: '/enhance', label: 'Enhancer' },
    { to: '/dashboard', label: 'Dashboard' },
    { to: '/install', label: 'Install' }
  ];

  return (
    <div className="min-h-screen flex flex-col bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <header className="sticky top-0 z-20 border-b border-zinc-200 dark:border-zinc-800 bg-white/90 dark:bg-zinc-950/90 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <Link to="/" className="font-semibold tracking-tight text-base flex items-center gap-2">
              <span className="inline-block w-2.5 h-2.5 rounded-sm bg-indigo-500" />
              PromptPilot
            </Link>
            <nav className="flex items-center gap-4 text-sm">
              {navLinks.map((link) => {
                const active = location.pathname === link.to;
                return (
                  <Link
                    key={link.to}
                    to={link.to}
                    className={
                      active
                        ? 'font-medium text-indigo-600 dark:text-indigo-400'
                        : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
                    }
                  >
                    {link.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center gap-3 text-sm">
            <button
              type="button"
              onClick={() => setDark((d) => !d)}
              className="px-2.5 py-1 rounded border border-zinc-300 dark:border-zinc-700 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-900"
            >
              {dark ? 'Light' : 'Dark'}
            </button>
            {session ? (
              <div className="flex items-center gap-2">
                <span className="hidden sm:inline text-xs text-zinc-500 dark:text-zinc-400">
                  {session.user.email}
                </span>
                <button
                  type="button"
                  onClick={() => void signOutUser()}
                  className="px-3 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-900"
                >
                  Sign out
                </button>
              </div>
            ) : (
              <Link
                to="/login"
                className="px-3 py-1.5 rounded bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-500"
              >
                Sign in
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-zinc-200 dark:border-zinc-800 py-8 text-xs text-zinc-500 dark:text-zinc-400">
        <div className="mx-auto max-w-6xl px-4 flex flex-wrap items-center justify-between gap-4">
          <span>PromptPilot — Turn rough ideas into powerful coding prompts.</span>
          <div className="flex items-center gap-4">
            <Link to="/enhance" className="hover:underline">Enhancer</Link>
            <Link to="/install" className="hover:underline">Installation</Link>
            <Link to="/login" className="hover:underline">Account</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

