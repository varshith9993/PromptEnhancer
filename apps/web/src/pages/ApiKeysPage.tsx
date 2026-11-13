import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BYOK_PROVIDERS, type ByokProviderId } from '@promptpilot/prompt-engine';
import { supabase, type AuthSession } from '../lib/supabase';

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:4000';
const LOCAL_SESSION_KEY = 'promptpilot_local_mode_v1';

interface StoredKey {
  providerId: string;
  label?: string;
  baseUrl?: string;
  modelId?: string;
  status: 'healthy' | 'invalid' | 'error';
  enabled: boolean;
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

type TabType = 'providers' | 'unified' | 'agents';
type FilterStatus = 'all' | 'healthy' | 'issues' | 'disabled';

export function ApiKeysPage() {
  const [session, setSession] = useState<AuthSession>(() => {
    if (localStorage.getItem(LOCAL_SESSION_KEY) === 'true') {
      return {
        access_token: 'local-token',
        user: {
          id: 'local-desktop-user',
          email: 'desktop@localhost',
          app_metadata: { provider: 'local-sqlite' }
        }
      } as unknown as AuthSession;
    }
    return null;
  });
  const [loadingSession, setLoadingSession] = useState(true);

  // Active view tab & filter
  const [activeTab, setActiveTab] = useState<TabType>('providers');
  const [filterQuery, setFilterQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');

  // Keys & tokens state
  const [keys, setKeys] = useState<StoredKey[]>([]);
  const [loadingKeys, setLoadingKeys] = useState(false);
  const [checkingAll, setCheckingAll] = useState(false);
  const [tokens, setTokens] = useState<StoredToken[]>([]);
  const [loadingTokens, setLoadingTokens] = useState(false);
  const [freshToken, setFreshToken] = useState<string | null>(null);
  const [newTokenName, setNewTokenName] = useState('');
  const [creatingToken, setCreatingToken] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);
  const [copiedCurl, setCopiedCurl] = useState(false);

  // Add Key Modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [modalTab, setModalTab] = useState<'provider' | 'custom'>('provider');
  const [addProvider, setAddProvider] = useState<ByokProviderId>('gemini');
  const [addApiKey, setAddApiKey] = useState('');
  const [addLabel, setAddLabel] = useState('');
  const [addBaseUrl, setAddBaseUrl] = useState('');
  const [addModelId, setAddModelId] = useState('');
  const [testingAndSaving, setTestingAndSaving] = useState(false);
  const [modalError, setModalError] = useState('');
  const [globalBanner, setGlobalBanner] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // PromptPilot engine toggle (always ON by default)
  const [promptPilotEngineEnabled, setPromptPilotEngineEnabled] = useState(true);

  // Check auth session on mount
  useEffect(() => {
    if (!supabase) {
      setLoadingSession(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setSession(data.session);
      }
      setLoadingSession(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (nextSession) {
        setSession(nextSession);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  function enableLocalMode() {
    localStorage.setItem(LOCAL_SESSION_KEY, 'true');
    setSession({
      access_token: 'local-token',
      user: {
        id: 'local-desktop-user',
        email: 'desktop@localhost',
        app_metadata: { provider: 'local-sqlite' }
      }
    } as unknown as AuthSession);
  }

  // Fetch keys and tokens when authenticated
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

  // Check All Keys (Live health test)
  async function handleCheckAll() {
    if (!session?.access_token) return;
    setCheckingAll(true);
    setGlobalBanner(null);
    try {
      const res = await fetch(`${API_URL}/api/me/keys/check-all`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` }
      });
      const data = (await res.json()) as { ok?: boolean; keys?: StoredKey[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Check all failed');
      setKeys(data.keys ?? []);
      setGlobalBanner({ type: 'success', message: 'All configured provider keys verified.' });
      setTimeout(() => setGlobalBanner(null), 5000);
    } catch (err) {
      setGlobalBanner({ type: 'error', message: err instanceof Error ? err.message : 'Check failed' });
    } finally {
      setCheckingAll(false);
    }
  }

  // Toggle Key Enabled / Disabled
  async function handleToggleKey(providerId: string, currentEnabled: boolean) {
    if (!session?.access_token) return;
    const nextEnabled = !currentEnabled;
    setKeys((prev) =>
      prev.map((k) => (k.providerId === providerId ? { ...k, enabled: nextEnabled } : k))
    );
    try {
      await fetch(`${API_URL}/api/me/keys`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ providerId, enabled: nextEnabled })
      });
    } catch {
      // Revert on failure
      setKeys((prev) =>
        prev.map((k) => (k.providerId === providerId ? { ...k, enabled: currentEnabled } : k))
      );
    }
  }

  // Delete Key
  async function handleDeleteKey(providerId: string) {
    if (!session?.access_token) return;
    if (!confirm(`Are you sure you want to remove the API key for ${providerId}?`)) return;
    try {
      await fetch(`${API_URL}/api/me/keys?providerId=${encodeURIComponent(providerId)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.access_token}` }
      });
      setKeys((prev) => prev.filter((k) => k.providerId !== providerId));
      setGlobalBanner({ type: 'success', message: `Key for ${providerId} removed.` });
      setTimeout(() => setGlobalBanner(null), 4000);
    } catch {
      // ignore
    }
  }

  // Add Key Modal submission
  async function handleAddKeySubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!session?.access_token || !addApiKey.trim()) return;
    setTestingAndSaving(true);
    setModalError('');
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
        throw new Error(data.error ?? 'Connection test failed');
      }

      // Close modal and refresh keys
      setShowAddModal(false);
      setAddApiKey('');
      setAddLabel('');
      setGlobalBanner({
        type: 'success',
        message: `✓ Connection healthy: model "${data.model || 'auto'}" verified. Stored securely in your account.`
      });
      setTimeout(() => setGlobalBanner(null), 6000);

      const r = await fetch(`${API_URL}/api/me/keys`, {
        headers: { Authorization: `Bearer ${session.access_token}` }
      });
      if (r.ok) {
        const refreshed = (await r.json()) as { keys?: StoredKey[] };
        setKeys(refreshed.keys ?? []);
      }
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Error adding key');
    } finally {
      setTestingAndSaving(false);
    }
  }

  // Create PromptPilot Personal Access Token
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
        body: JSON.stringify({ name: newTokenName.trim() || 'PromptPilot API Key' })
      });
      if (!res.ok) throw new Error('Failed to create key');
      const data = (await res.json()) as { token: string; prefix: string; id: string };
      setFreshToken(data.token);
      setNewTokenName('');
      setTokens((prev) => [
        {
          id: data.id,
          name: newTokenName.trim() || 'PromptPilot API Key',
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

  // Revoke Personal Access Token
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

  // Export configured providers (without leaking raw keys)
  function handleExport() {
    const exportData = {
      exportedAt: new Date().toISOString(),
      account: session?.user.email,
      providers: keys.map((k) => ({
        providerId: k.providerId,
        label: k.label,
        modelId: k.modelId,
        baseUrl: k.baseUrl,
        status: k.status,
        enabled: k.enabled,
        lastCheckedAt: k.lastCheckedAt
      })),
      defaultFallback: 'PromptPilot Rule-Based Engine (no key needed)'
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `promptpilot-keys-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Filtering
  const filteredKeys = keys.filter((k) => {
    const matchesQuery =
      !filterQuery.trim() ||
      k.providerId.toLowerCase().includes(filterQuery.toLowerCase()) ||
      k.label?.toLowerCase().includes(filterQuery.toLowerCase()) ||
      k.modelId?.toLowerCase().includes(filterQuery.toLowerCase());

    if (!matchesQuery) return false;
    if (filterStatus === 'healthy') return k.status === 'healthy' && k.enabled;
    if (filterStatus === 'issues') return k.status !== 'healthy';
    if (filterStatus === 'disabled') return !k.enabled;
    return true;
  });

  const healthyCount = keys.filter((k) => k.status === 'healthy' && k.enabled).length;

  // Render auth gate if user is not logged in
  if (loadingSession) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-16 text-center text-xs text-zinc-500">
        Loading API Keys...
      </div>
    );
  }

  if (!session) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20">
        <div className="p-8 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xl space-y-5 text-center">
          <div className="w-12 h-12 mx-auto rounded-full bg-indigo-500/10 flex items-center justify-center text-indigo-400 font-bold text-lg">
            🔑
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
              Account Required to Store API Keys
            </h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-2 leading-relaxed">
              Your API keys are encrypted at rest with AES-256-GCM and stored strictly inside your private account database. An authenticated account is required to add and manage keys.
            </p>
          </div>

          <div className="flex flex-col gap-2.5 pt-2">
            <Link
              to="/login"
              className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow transition-colors"
            >
              Sign In to Your Account
            </Link>
            <button
              type="button"
              onClick={enableLocalMode}
              className="w-full py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs font-medium transition-colors"
            >
              Continue in Offline Local Desktop Mode (SQLite)
            </button>
          </div>

          <p className="text-[11px] text-zinc-500 border-t border-zinc-100 dark:border-zinc-800 pt-3">
            Want to enhance prompts right now without an account? Use the{' '}
            <Link to="/enhance" className="text-indigo-500 hover:underline">
              Enhancer Tab
            </Link>{' '}
            with free rule-based mode.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 pb-20">
      <div className="mx-auto max-w-6xl px-4 py-8 space-y-6">
        {/* Top Header matching FreeLLMAPI screenshot */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800/80 pb-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white">Keys</h1>
            <p className="text-xs text-zinc-400 mt-1">
              Provider credentials and the unified API key your apps connect with.
            </p>
            <div className="text-[11px] text-zinc-500 mt-1">
              Account: <span className="text-zinc-300 font-mono">{session.user.email}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleCheckAll()}
              disabled={checkingAll || keys.length === 0}
              className="px-3 py-1.5 rounded-md bg-zinc-900 border border-zinc-700 text-xs font-medium text-zinc-200 hover:bg-zinc-800 disabled:opacity-50 transition-colors"
            >
              {checkingAll ? 'Checking all...' : 'Check all'}
            </button>
            <button
              type="button"
              onClick={handleExport}
              disabled={keys.length === 0}
              className="px-3 py-1.5 rounded-md bg-zinc-900 border border-zinc-700 text-xs font-medium text-zinc-200 hover:bg-zinc-800 disabled:opacity-50 transition-colors"
            >
              Export
            </button>
            <button
              type="button"
              onClick={() => {
                setShowAddModal(true);
                setModalError('');
              }}
              className="px-3.5 py-1.5 rounded-md bg-zinc-100 hover:bg-white text-zinc-950 text-xs font-semibold shadow transition-colors flex items-center gap-1.5"
            >
              <span className="text-sm leading-none">+</span> Add key
            </button>

            {/* Subtabs matching screenshot */}
            <div className="ml-2 inline-flex rounded-md bg-zinc-900 border border-zinc-800 p-0.5 text-xs font-medium">
              <button
                type="button"
                onClick={() => setActiveTab('providers')}
                className={`px-3 py-1 rounded ${
                  activeTab === 'providers' ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Providers
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('unified')}
                className={`px-3 py-1 rounded ${
                  activeTab === 'unified' ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Unified API key
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('agents')}
                className={`px-3 py-1 rounded ${
                  activeTab === 'agents' ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Coding agents
              </button>
            </div>
          </div>
        </div>

        {globalBanner && (
          <div
            className={`p-3 rounded-lg text-xs border flex items-center justify-between ${
              globalBanner.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
            }`}
          >
            <span>{globalBanner.message}</span>
            <button
              type="button"
              onClick={() => setGlobalBanner(null)}
              className="text-zinc-400 hover:text-white ml-2"
            >
              ×
            </button>
          </div>
        )}

        {/* TAB 1: PROVIDERS */}
        {activeTab === 'providers' && (
          <div className="space-y-4">
            {/* Filter bar matching screenshot */}
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 flex-1 max-w-md">
                <div className="relative w-full">
                  <input
                    type="text"
                    placeholder="Filter providers or keys"
                    value={filterQuery}
                    onChange={(e) => setFilterQuery(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-200 placeholder-zinc-500 text-xs focus:outline-none focus:border-zinc-600"
                  />
                  <span className="absolute left-2.5 top-2 text-zinc-500">🔍</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="inline-flex rounded-md bg-zinc-900 border border-zinc-800 p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setFilterStatus('all')}
                    className={`px-2.5 py-1 rounded ${
                      filterStatus === 'all' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterStatus('healthy')}
                    className={`px-2.5 py-1 rounded ${
                      filterStatus === 'healthy' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    Healthy
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterStatus('issues')}
                    className={`px-2.5 py-1 rounded ${
                      filterStatus === 'issues' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    Issues
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterStatus('disabled')}
                    className={`px-2.5 py-1 rounded ${
                      filterStatus === 'disabled' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    Disabled
                  </button>
                </div>
                <span className="text-zinc-500 text-xs">
                  {keys.length} providers • {healthyCount} healthy
                </span>
              </div>
            </div>

            {/* Guaranteed Default Provider: PromptPilot Enhancer (no key needed) */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/90 overflow-hidden">
              <div className="p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  {/* Switch (Locked on by default) */}
                  <button
                    type="button"
                    onClick={() => setPromptPilotEngineEnabled((v) => !v)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                      promptPilotEngineEnabled ? 'bg-indigo-600' : 'bg-zinc-700'
                    }`}
                    title="By default always ON"
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        promptPilotEngineEnabled ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>

                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-white">
                        PromptPilot Enhancer (no key needed)
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        1 • 1 healthy
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                        Last Priority Fallback
                      </span>
                    </div>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      Deterministic prompt optimization engine. Always ON by default. If you configure AI keys, PromptPilot calls your AI model first; if no AI keys are configured or if they fail, it falls back to this engine.
                    </p>
                  </div>
                </div>

                <div className="text-right text-xs text-zinc-500 shrink-0">
                  <span className="px-2 py-1 rounded bg-zinc-800 text-zinc-300">Always Active</span>
                </div>
              </div>
            </div>

            {/* List of Configured Provider Keys matching FreeLLMAPI screenshot */}
            {loadingKeys ? (
              <div className="p-8 text-center text-xs text-zinc-500">Loading stored provider keys...</div>
            ) : filteredKeys.length === 0 ? (
              <div className="p-8 rounded-xl border border-dashed border-zinc-800 text-center space-y-3">
                <p className="text-sm text-zinc-400">
                  {keys.length === 0 ? 'No AI provider keys added yet.' : 'No keys match the current filter.'}
                </p>
                <p className="text-xs text-zinc-500 max-w-md mx-auto">
                  Add your FreeLLMAPI unified key, Google AI Studio key, OpenRouter key, or Groq key to enhance prompts using actual LLM models.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(true);
                    setModalError('');
                  }}
                  className="px-3.5 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium"
                >
                  + Add your first key
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredKeys.map((k) => {
                  const meta = BYOK_PROVIDERS.find((p) => p.id === k.providerId);
                  const isHealthy = k.status === 'healthy';
                  return (
                    <div
                      key={k.providerId}
                      className="rounded-xl border border-zinc-800 bg-zinc-900/60 hover:border-zinc-700 transition-colors overflow-hidden"
                    >
                      {/* Provider Row */}
                      <div className="p-4 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          {/* Toggle switch */}
                          <button
                            type="button"
                            onClick={() => void handleToggleKey(k.providerId, k.enabled)}
                            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                              k.enabled ? 'bg-emerald-600' : 'bg-zinc-700'
                            }`}
                          >
                            <span
                              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                k.enabled ? 'translate-x-5' : 'translate-x-0'
                              }`}
                            />
                          </button>

                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-sm text-white">
                                {meta?.name ?? k.providerId}
                              </span>
                              {k.label && <span className="text-xs text-zinc-400">({k.label})</span>}
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                                  isHealthy
                                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                    : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                                }`}
                              >
                                <span className={`w-1.5 h-1.5 rounded-full ${isHealthy ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                                {isHealthy ? '1 • 1 healthy' : '1 • 1 issue'}
                              </span>
                            </div>
                            <div className="text-xs text-zinc-400 mt-0.5 flex flex-wrap items-center gap-2">
                              <span>Model: <code className="text-zinc-300">{k.modelId || meta?.defaultModel || 'auto'}</code></span>
                              {k.baseUrl && <span>Endpoint: <code className="text-zinc-500">{k.baseUrl}</code></span>}
                              {k.lastCheckedAt && (
                                <span className="text-zinc-500">
                                  Tested {new Date(k.lastCheckedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              )}
                            </div>
                            {k.lastError && (
                              <p className="text-[11px] text-rose-400 mt-1">Error: {k.lastError}</p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => void handleDeleteKey(k.providerId)}
                            className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-rose-950/40 text-zinc-400 hover:text-rose-400 text-xs transition-colors"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: UNIFIED API KEY */}
        {activeTab === 'unified' && (
          <div className="space-y-6">
            <div className="p-6 rounded-xl border border-zinc-800 bg-zinc-900/60 space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-white">Your PromptPilot API Key</h2>
                <p className="text-xs text-zinc-400 mt-1">
                  Use this key in your applications, CLI, VS Code, Cursor, or Claude Code. Calls authenticated with this key automatically route to your healthy stored AI provider keys.
                </p>
              </div>

              {freshToken && (
                <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-xs space-y-2">
                  <span className="font-semibold text-emerald-400">
                    New Personal Key Created (copy it now — it is not shown again):
                  </span>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 p-2.5 rounded bg-zinc-950 text-emerald-300 font-mono text-xs break-all">
                      {freshToken}
                    </code>
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard.writeText(freshToken);
                        setCopiedToken(true);
                        setTimeout(() => setCopiedToken(false), 2000);
                      }}
                      className="px-3.5 py-2 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs transition-colors"
                    >
                      {copiedToken ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                </div>
              )}

              {loadingTokens ? (
                <p className="text-xs text-zinc-500">Loading keys...</p>
              ) : tokens.length === 0 ? (
                <p className="text-xs text-zinc-500">No personal API keys generated yet. Create one below.</p>
              ) : (
                <div className="divide-y divide-zinc-800 border rounded-lg border-zinc-800 text-xs">
                  {tokens.map((t) => (
                    <div key={t.id} className="p-3.5 flex items-center justify-between gap-3">
                      <div>
                        <span className="font-semibold text-white">{t.name}</span>
                        <code className="ml-2 font-mono text-zinc-400">{t.prefix}</code>
                        <span className="ml-3 text-[11px] text-zinc-500">
                          Created {new Date(t.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleRevokeToken(t.id)}
                        className="text-xs text-rose-400 hover:text-rose-300"
                      >
                        Revoke
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <form onSubmit={(e) => void handleCreateToken(e)} className="flex items-center gap-2 pt-2 text-xs">
                <input
                  type="text"
                  placeholder="Key name (e.g. My Laptop CLI, Claude Code)"
                  value={newTokenName}
                  onChange={(e) => setNewTokenName(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-700 text-xs"
                />
                <button
                  type="submit"
                  disabled={creatingToken}
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium disabled:opacity-50 transition-colors"
                >
                  {creatingToken ? 'Generating…' : 'Generate Key'}
                </button>
              </form>
            </div>

            {/* Code Examples */}
            <div className="p-6 rounded-xl border border-zinc-800 bg-zinc-900/60 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">How to call your PromptPilot API</h3>
                <button
                  type="button"
                  onClick={() => {
                    const code = `curl -X POST ${API_URL}/api/enhance \\\n  -H "Authorization: Bearer <YOUR_PROMPTPILOT_KEY>" \\\n  -H "Content-Type: application/json" \\\n  -d '{"originalPrompt": "/enhance create a login form ///use tailwind///"}'`;
                    void navigator.clipboard.writeText(code);
                    setCopiedCurl(true);
                    setTimeout(() => setCopiedCurl(false), 2000);
                  }}
                  className="text-xs text-indigo-400 hover:text-indigo-300"
                >
                  {copiedCurl ? 'Copied curl command!' : 'Copy curl example'}
                </button>
              </div>

              <pre className="p-4 rounded-lg bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-300 overflow-x-auto leading-relaxed">
{`# 1. Terminal / CLI setup
node apps/cli/dist/index.js config set token <YOUR_PROMPTPILOT_KEY>

# 2. Curl endpoint call
curl -X POST ${API_URL}/api/enhance \\
  -H "Authorization: Bearer <YOUR_PROMPTPILOT_KEY>" \\
  -H "Content-Type: application/json" \\
  -d '{"originalPrompt": "/enhance create a login form ///use tailwind///"}'`}
              </pre>
            </div>
          </div>
        )}

        {/* TAB 3: CODING AGENTS */}
        {activeTab === 'agents' && (
          <div className="grid md:grid-cols-3 gap-4">
            <div className="p-5 rounded-xl border border-zinc-800 bg-zinc-900/60 space-y-3">
              <h3 className="font-semibold text-white text-sm">Claude Code</h3>
              <p className="text-xs text-zinc-400">
                Enhance prompts right inside your terminal with the <code>/enhance</code> command.
              </p>
              <pre className="p-2.5 rounded bg-zinc-950 text-[11px] font-mono text-zinc-300">
                /enhance Build responsive navbar ///minimal///
              </pre>
              <Link to="/install" className="text-xs text-indigo-400 hover:underline inline-block">
                Setup instructions →
              </Link>
            </div>

            <div className="p-5 rounded-xl border border-zinc-800 bg-zinc-900/60 space-y-3">
              <h3 className="font-semibold text-white text-sm">Cursor</h3>
              <p className="text-xs text-zinc-400">
                Use the PromptPilot rules to rewrite prompts in the Composer or Chat window.
              </p>
              <pre className="p-2.5 rounded bg-zinc-950 text-[11px] font-mono text-zinc-300">
                .cursorrules / promptpilot.mdc
              </pre>
              <Link to="/install" className="text-xs text-indigo-400 hover:underline inline-block">
                View rule config →
              </Link>
            </div>

            <div className="p-5 rounded-xl border border-zinc-800 bg-zinc-900/60 space-y-3">
              <h3 className="font-semibold text-white text-sm">VS Code Extension</h3>
              <p className="text-xs text-zinc-400">
                Trigger enhancement with Ctrl+Shift+P or keybinding in any open file or prompt bar.
              </p>
              <pre className="p-2.5 rounded bg-zinc-950 text-[11px] font-mono text-zinc-300">
                PromptPilot: Enhance Prompt
              </pre>
              <Link to="/install" className="text-xs text-indigo-400 hover:underline inline-block">
                Install extension →
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* ADD KEY MODAL matching FreeLLMAPI screenshot (Image 3) */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900 p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h2 className="text-base font-semibold text-white">Add key</h2>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-zinc-400 hover:text-white text-lg leading-none"
              >
                ×
              </button>
            </div>

            {/* Modal tabs */}
            <div className="flex gap-2 text-xs">
              <button
                type="button"
                onClick={() => setModalTab('provider')}
                className={`px-3 py-1.5 rounded-md font-medium ${
                  modalTab === 'provider' ? 'bg-zinc-100 text-zinc-900' : 'bg-zinc-800 text-zinc-400 hover:text-white'
                }`}
              >
                Provider key
              </button>
              <button
                type="button"
                onClick={() => setModalTab('custom')}
                className={`px-3 py-1.5 rounded-md font-medium ${
                  modalTab === 'custom' ? 'bg-zinc-100 text-zinc-900' : 'bg-zinc-800 text-zinc-400 hover:text-white'
                }`}
              >
                Custom endpoint
              </button>
            </div>

            <form onSubmit={(e) => void handleAddKeySubmit(e)} className="space-y-4 text-xs">
              <div>
                <label className="block text-zinc-400 mb-1">Platform</label>
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
                  className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100 focus:outline-none focus:border-zinc-700"
                >
                  {BYOK_PROVIDERS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">API key</label>
                <input
                  type="password"
                  required
                  placeholder="paste key here"
                  value={addApiKey}
                  onChange={(e) => setAddApiKey(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-700 font-mono text-xs"
                />
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">Label (Optional)</label>
                <input
                  type="text"
                  placeholder="optional label, e.g. Primary Work Key"
                  value={addLabel}
                  onChange={(e) => setAddLabel(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-700"
                />
              </div>

              {(modalTab === 'custom' || addProvider === 'openai-compatible' || addProvider === 'freellmapi') && (
                <div className="space-y-3 pt-1 border-t border-zinc-800">
                  <div>
                    <label className="block text-zinc-400 mb-1">Base URL</label>
                    <input
                      type="text"
                      value={addBaseUrl}
                      onChange={(e) => setAddBaseUrl(e.target.value)}
                      placeholder="http://127.0.0.1:31415/v1"
                      className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-zinc-400 mb-1">Model ID</label>
                    <input
                      type="text"
                      value={addModelId}
                      onChange={(e) => setAddModelId(e.target.value)}
                      placeholder="auto"
                      className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100 text-xs font-mono"
                    />
                  </div>
                </div>
              )}

              {modalError && (
                <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs leading-relaxed">
                  {modalError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3 py-1.5 rounded-lg border border-zinc-800 hover:bg-zinc-800 text-zinc-400 text-xs font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={testingAndSaving || !addApiKey.trim()}
                  className="px-4 py-1.5 rounded-lg bg-white hover:bg-zinc-200 text-zinc-950 text-xs font-semibold disabled:opacity-50 transition-colors"
                >
                  {testingAndSaving ? 'Testing connection…' : 'Add key'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
