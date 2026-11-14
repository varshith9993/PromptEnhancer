import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { INTEGRATIONS } from '@promptpilot/config';
import { BYOK_PROVIDERS, type ByokProviderId } from '@promptpilot/prompt-engine';
import { getStoredAuthSession, signInDemoUser, supabase, type AuthSession } from '../lib/supabase';
import { getApiUrl } from '../lib/config';

const API_URL = getApiUrl();

interface StoredKey {
  providerId: string;
  label?: string;
  baseUrl?: string;
  modelId?: string;
  status: 'healthy' | 'invalid' | 'error';
  lastCheckedAt?: string;
  lastHealthyAt?: string;
  lastError?: string;
  updatedAt: string;
}

interface StoredToken {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt?: string;
  createdAt: string;
}

export function DashboardPage() {
  const [session, setSession] = useState<AuthSession>(() => getStoredAuthSession());
  const [loading, setLoading] = useState(true);

  // Stored provider keys
  const [keys, setKeys] = useState<StoredKey[]>([]);
  const [loadingKeys, setLoadingKeys] = useState(false);
  const [addProvider, setAddProvider] = useState<ByokProviderId>('freellmapi');
  const [addApiKey, setAddApiKey] = useState('');
  const [addBaseUrl, setAddBaseUrl] = useState('http://127.0.0.1:31415/v1');
  const [addModelId, setAddModelId] = useState('auto');
  const [addLabel, setAddLabel] = useState('');
  const [savingKey, setSavingKey] = useState(false);
  const [keyError, setKeyError] = useState('');
  const [keySuccess, setKeySuccess] = useState('');

  // PromptPilot API Tokens
  const [tokens, setTokens] = useState<StoredToken[]>([]);
  const [loadingTokens, setLoadingTokens] = useState(false);
  const [newTokenName, setNewTokenName] = useState('');
  const [creatingToken, setCreatingToken] = useState(false);
  const [freshToken, setFreshToken] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState(false);

  useEffect(() => {
    const localSess = getStoredAuthSession();
    if (localSess) {
      setSession(localSess);
      setLoading(false);
    }
    if (!supabase) {
      setLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setSession(data.session);
      }
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      if (next) {
        setSession(next);
      } else if (!getStoredAuthSession()) {
        setSession(null);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  function enableLocalMode() {
    signInDemoUser();
  }

  useEffect(() => {
    if (!session?.access_token) return;
    const token = session.access_token;

    setLoadingKeys(true);
    fetch(`${API_URL}/api/me/keys`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: { keys?: StoredKey[] }) => setKeys(data.keys ?? []))
      .catch(() => setKeys([]))
      .finally(() => setLoadingKeys(false));

    setLoadingTokens(true);
    fetch(`${API_URL}/api/me/tokens`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: { tokens?: StoredToken[] }) => setTokens(data.tokens ?? []))
      .catch(() => setTokens([]))
      .finally(() => setLoadingTokens(false));
  }, [session]);

  async function handleSaveKey(e: React.FormEvent) {
    e.preventDefault();
    if (!session?.access_token || !addApiKey.trim()) return;
    setSavingKey(true);
    setKeyError('');
    setKeySuccess('');
    try {
      const res = await fetch(`${API_URL}/api/me/keys`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          providerId: addProvider,
          apiKey: addApiKey.trim(),
          ...(addBaseUrl.trim() ? { baseUrl: addBaseUrl.trim() } : {}),
          ...(addModelId.trim() ? { modelId: addModelId.trim() } : {}),
          ...(addLabel.trim() ? { label: addLabel.trim() } : {})
        })
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        model?: string;
        models?: string[];
      };
      if (!res.ok) {
        throw new Error(data.error ?? 'Failed to save key');
      }
      setKeySuccess(`✓ Test positive! Connection healthy to model "${data.model || 'auto'}". Key encrypted and saved.`);
      setAddApiKey('');
      setAddLabel('');
      setTimeout(() => setKeySuccess(''), 6000);

      // Refresh list
      const r = await fetch(`${API_URL}/api/me/keys`, {
        headers: { Authorization: `Bearer ${session.access_token}` }
      });
      if (r.ok) {
        const refreshed = (await r.json()) as { keys?: StoredKey[] };
        setKeys(refreshed.keys ?? []);
      }
    } catch (err) {
      setKeyError(err instanceof Error ? err.message : 'Error saving key');
    } finally {
      setSavingKey(false);
    }
  }

  async function handleDeleteKey(providerId: string) {
    if (!session?.access_token) return;
    try {
      await fetch(`${API_URL}/api/me/keys?providerId=${encodeURIComponent(providerId)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.access_token}` }
      });
      setKeys((prev) => prev.filter((k) => k.providerId !== providerId));
    } catch {
      // ignore
    }
  }

  async function handleCreateToken(e: React.FormEvent) {
    e.preventDefault();
    if (!session?.access_token) return;
    setCreatingToken(true);
    try {
      const res = await fetch(`${API_URL}/api/me/tokens`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name: newTokenName.trim() || 'CLI Key' })
      });
      if (!res.ok) throw new Error('Failed to create token');
      const data = (await res.json()) as { token: string; prefix: string; id: string };
      setFreshToken(data.token);
      setNewTokenName('');
      setTokens((prev) => [
        {
          id: data.id,
          name: newTokenName.trim() || 'CLI Key',
          prefix: data.prefix,
          createdAt: new Date().toISOString()
        },
        ...prev
      ]);
    } catch {
      // ignore
    } finally {
      setCreatingToken(false);
    }
  }

  async function handleRevokeToken(tokenId: string) {
    if (!session?.access_token) return;
    try {
      await fetch(`${API_URL}/api/me/tokens?id=${encodeURIComponent(tokenId)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.access_token}` }
      });
      setTokens((prev) => prev.filter((t) => t.id !== tokenId));
    } catch {
      // ignore
    }
  }

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
          <h1 className="text-lg font-semibold">Account Sign In</h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Sign in with Google, GitHub, or Email to sync across devices, or continue in offline local desktop mode.
          </p>
          <div className="flex flex-col gap-2 pt-2">
            <Link
              to="/login"
              className="px-4 py-2 rounded bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-500 text-center"
            >
              Sign In with Cloud Account
            </Link>
            <button
              type="button"
              onClick={enableLocalMode}
              className="px-4 py-2 rounded border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 text-xs font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              Continue in Local Desktop Mode (Offline SQLite DB)
            </button>
          </div>
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
        <div className="flex items-center gap-2">
          <Link
            to="/keys"
            className="px-3.5 py-2 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-medium"
          >
            API Keys Tab
          </Link>
          <Link
            to="/enhance"
            className="px-4 py-2 rounded bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-500"
          >
            Open Enhancer
          </Link>
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-4 text-sm">
        <div className="p-4 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-1">
          <span className="text-xs text-zinc-500">Current Plan</span>
          <p className="font-semibold">Free &amp; BYOK</p>
          <p className="text-xs text-zinc-500">Zero subscription fees</p>
        </div>
        <div className="p-4 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-1">
          <span className="text-xs text-zinc-500">Auth Provider</span>
          <p className="font-semibold capitalize">
            {(session.user.app_metadata?.provider as string | undefined) ?? 'email'}
          </p>
          <p className="text-xs text-zinc-500">
            {session.user.app_metadata?.provider === 'local-sqlite' ? 'Local SQLite DB' : 'Verified via Supabase'}
          </p>
        </div>
        <div className="p-4 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-1">
          <span className="text-xs text-zinc-500">Key Security</span>
          <p className="font-semibold">AES-256-GCM Encrypted</p>
          <p className="text-xs text-zinc-500">Tied strictly to your user account</p>
        </div>
      </div>

      {/* Stored Provider API Keys */}
      <div className="p-5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-4">
        <div>
          <h2 className="text-sm font-semibold">Your AI Provider Keys (Account Stored)</h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Store your provider keys (FreeLLMAPI unified key, Gemini, Groq, OpenRouter) securely in your database account. When you call PromptEnhancer via API or CLI, your stored provider is used automatically.
          </p>
        </div>

        {loadingKeys ? (
          <p className="text-xs text-zinc-500">Loading stored keys...</p>
        ) : keys.length === 0 ? (
          <div className="text-xs text-zinc-500 p-3 rounded bg-zinc-50 dark:bg-zinc-800/50">
            No keys saved yet. Add a provider key below to connect it to your account.
          </div>
        ) : (
          <div className="divide-y divide-zinc-200 dark:divide-zinc-800 border rounded-lg border-zinc-200 dark:border-zinc-800 text-xs">
            {keys.map((k) => {
              const meta = BYOK_PROVIDERS.find((p) => p.id === k.providerId);
              const isHealthy = k.status === 'healthy';
              return (
                <div key={k.providerId} className="p-3 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                        isHealthy
                          ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                          : 'bg-rose-500/10 text-rose-500 border border-rose-500/20'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${isHealthy ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                      {isHealthy ? 'Healthy' : 'Issue'}
                    </span>
                    <div>
                      <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                        {meta?.name ?? k.providerId}
                        {k.label && <span className="ml-2 font-normal text-zinc-400">({k.label})</span>}
                      </div>
                      <div className="text-[11px] text-zinc-500">
                        {k.modelId ? `model: ${k.modelId}` : 'default model'}
                        {k.baseUrl && <span className="ml-2 font-mono text-zinc-400">({k.baseUrl})</span>}
                        {k.lastCheckedAt && (
                          <span className="ml-2">
                            tested {new Date(k.lastCheckedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                      </div>
                      {k.lastError && (
                        <div className="text-[10px] text-rose-400 mt-0.5">{k.lastError}</div>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleDeleteKey(k.providerId)}
                    className="text-xs text-rose-500 hover:text-rose-400 px-2 py-1"
                  >
                    Delete
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <form onSubmit={(e) => void handleSaveKey(e)} className="space-y-3 pt-2 text-xs border-t border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center justify-between">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">Add or Update Provider Key</span>
            <span className="text-[11px] text-zinc-400">Tests connection before saving</span>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
            <div>
              <label className="block text-[11px] text-zinc-500 mb-1">Platform</label>
              <select
                value={addProvider}
                onChange={(e) => {
                  const next = e.target.value as ByokProviderId;
                  setAddProvider(next);
                  const meta = BYOK_PROVIDERS.find((p) => p.id === next);
                  if (meta?.id === 'freellmapi') {
                    setAddBaseUrl('http://127.0.0.1:31415/v1');
                    setAddModelId('auto');
                  } else {
                    setAddBaseUrl(meta?.defaultBaseUrl ?? '');
                    setAddModelId(meta?.defaultModel ?? '');
                  }
                }}
                className="w-full px-2.5 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 bg-transparent text-xs"
              >
                {BYOK_PROVIDERS.map((p) => (
                  <option key={p.id} value={p.id} className="bg-zinc-900 text-zinc-100">
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] text-zinc-500 mb-1">API Key</label>
              <input
                type="password"
                placeholder="Paste key here"
                value={addApiKey}
                onChange={(e) => setAddApiKey(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 bg-transparent text-xs"
              />
            </div>

            <div>
              <label className="block text-[11px] text-zinc-500 mb-1">Label (Optional)</label>
              <input
                type="text"
                placeholder="e.g. My FreeLLMAPI"
                value={addLabel}
                onChange={(e) => setAddLabel(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 bg-transparent text-xs"
              />
            </div>

            <div className="flex items-end">
              <button
                type="submit"
                disabled={savingKey || !addApiKey.trim()}
                className="w-full px-3 py-1.5 rounded bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-medium text-xs disabled:opacity-50 hover:bg-zinc-800"
              >
                {savingKey ? 'Testing Connection...' : 'Test & Add Key'}
              </button>
            </div>
          </div>

          {(addProvider === 'openai-compatible' || addProvider === 'freellmapi') && (
            <div className="grid sm:grid-cols-2 gap-2 pt-1">
              <div>
                <label className="block text-[11px] text-zinc-500 mb-1">Base URL</label>
                <input
                  type="text"
                  value={addBaseUrl}
                  onChange={(e) => setAddBaseUrl(e.target.value)}
                  placeholder="http://127.0.0.1:31415/v1"
                  className="w-full px-2.5 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 bg-transparent text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] text-zinc-500 mb-1">Model ID</label>
                <input
                  type="text"
                  value={addModelId}
                  onChange={(e) => setAddModelId(e.target.value)}
                  placeholder="auto"
                  className="w-full px-2.5 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 bg-transparent text-xs"
                />
              </div>
            </div>
          )}

          {keyError && (
            <div className="p-2.5 rounded bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs">
              {keyError}
            </div>
          )}
          {keySuccess && (
            <div className="p-2.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs">
              {keySuccess}
            </div>
          )}
        </form>
      </div>

      {/* PromptPilot Personal API Keys */}
      <div className="p-5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-4">
        <div>
          <h2 className="text-sm font-semibold">PromptEnhancer Personal API Keys</h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Use this key in Claude Code, Cursor, terminal, or VS Code to trigger your prompt enhancements.
          </p>
        </div>

        {freshToken && (
          <div className="p-3 rounded-lg border border-emerald-500/50 bg-emerald-500/10 text-xs space-y-2">
            <span className="font-semibold text-emerald-600 dark:text-emerald-400">
              New Personal Key Created (copy it now — you won't see it again):
            </span>
            <div className="flex items-center gap-2">
              <code className="flex-1 p-2 rounded bg-zinc-900 text-emerald-300 font-mono text-[11px] break-all">
                {freshToken}
              </code>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(freshToken);
                  setCopiedToken(true);
                  setTimeout(() => setCopiedToken(false), 2000);
                }}
                className="px-3 py-2 rounded bg-emerald-600 text-white font-medium text-xs hover:bg-emerald-500"
              >
                {copiedToken ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <p className="text-[11px] text-zinc-500">
              Run in CLI: <code>node apps/cli/dist/index.js config set token {freshToken}</code>
            </p>
          </div>
        )}

        {loadingTokens ? (
          <p className="text-xs text-zinc-500">Loading keys...</p>
        ) : tokens.length === 0 ? (
          <div className="text-xs text-zinc-500 p-3 rounded bg-zinc-50 dark:bg-zinc-800/50">
            No personal keys created yet. Generate one below to connect your CLI or editor.
          </div>
        ) : (
          <div className="divide-y divide-zinc-200 dark:divide-zinc-800 border rounded-lg border-zinc-200 dark:border-zinc-800 text-xs">
            {tokens.map((t) => (
              <div key={t.id} className="p-3 flex items-center justify-between gap-2">
                <div>
                  <span className="font-semibold">{t.name}</span>
                  <code className="ml-2 font-mono text-zinc-500">{t.prefix}</code>
                  <span className="ml-2 text-[11px] text-zinc-400">
                    Created {new Date(t.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => void handleRevokeToken(t.id)}
                  className="text-xs text-red-500 hover:text-red-400"
                >
                  Revoke
                </button>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={(e) => void handleCreateToken(e)} className="flex items-center gap-2 pt-2 text-xs border-t border-zinc-200 dark:border-zinc-800">
          <input
            type="text"
            placeholder="Key name (e.g. My Laptop CLI, Claude Code)"
            value={newTokenName}
            onChange={(e) => setNewTokenName(e.target.value)}
            className="flex-1 px-2.5 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 bg-transparent"
          />
          <button
            type="submit"
            disabled={creatingToken}
            className="px-3 py-1.5 rounded bg-indigo-600 text-white font-medium hover:bg-indigo-500 disabled:opacity-50"
          >
            {creatingToken ? 'Generating…' : 'Generate Key'}
          </button>
        </form>
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
