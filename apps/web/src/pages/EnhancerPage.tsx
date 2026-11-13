import { useEffect, useState, type ChangeEvent } from 'react';
import {
  BUILTIN_PROFILES,
  BYOK_PROVIDERS,
  enhancePromptRuleBased,
  enhancePromptWithByok,
  testByokConnection,
  type ByokConfig,
  type ByokProviderId
} from '@promptpilot/prompt-engine';
import type {
  ContextMode,
  EnhanceRequest,
  EnhanceResponse,
  PromptProfile,
  TargetAgent,
  TaskCategory,
  UserInstruction
} from '@promptpilot/shared';

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:4000';

const DEFAULT_PREFERENCES: UserInstruction[] = [
  { id: 'p1', text: 'Preserve existing functionality and routes', enabled: true, isDefault: true },
  { id: 'p2', text: 'Prefer TypeScript and minimal dependencies', enabled: true, isDefault: true },
  { id: 'p3', text: 'Do not modify unrelated files', enabled: false, isDefault: false }
];

const PREFS_STORAGE_KEY = 'promptpilot_preferences_v1';
const CUSTOM_PROFILES_KEY = 'promptpilot_custom_profiles_v1';
const SENSITIVE_FILE_RE = /(^\.env($|\.)|node_modules|dist\/|\.git\/|\.(pem|key|p12|pfx)$)/i;

const AGENTS: Array<{ id: TargetAgent; label: string }> = [
  { id: 'generic', label: 'Generic Agent' },
  { id: 'claude-code', label: 'Claude Code' },
  { id: 'cursor', label: 'Cursor' },
  { id: 'vscode', label: 'VS Code' },
  { id: 'antigravity', label: 'Antigravity' },
  { id: 'opencode', label: 'OpenCode' },
  { id: 'gemini-cli', label: 'Gemini CLI' },
  { id: 'codex-cli', label: 'Codex CLI' }
];

function isNetworkOrCorsError(err: unknown): boolean {
  return err instanceof TypeError;
}

export function EnhancerPage() {
  const [mode, setMode] = useState<'free' | 'byok'>('free');
  const [customProfiles, setCustomProfiles] = useState<PromptProfile[]>(() => {
    try {
      const raw = localStorage.getItem(CUSTOM_PROFILES_KEY);
      return raw ? (JSON.parse(raw) as PromptProfile[]) : [];
    } catch {
      return [];
    }
  });
  const allProfiles = [...BUILTIN_PROFILES, ...customProfiles];

  const [profileId, setProfileId] = useState<string>(BUILTIN_PROFILES[0]?.id ?? 'quick-fix');
  const [targetAgent, setTargetAgent] = useState<TargetAgent>('generic');
  const [originalPrompt, setOriginalPrompt] = useState('');
  const [additionalInstructions, setAdditionalInstructions] = useState('');

  // Project context (opt-in, local file picker with sensitive-file filter)
  const [contextMode, setContextMode] = useState<ContextMode>('none');
  const [selectedFiles, setSelectedFiles] = useState<Array<{ path: string; content: string }>>([]);

  // BYOK state stays in React memory only and is never written to localStorage or sent to a DB.
  const [providerId, setProviderId] = useState<ByokProviderId>('openrouter');
  const [apiKey, setApiKey] = useState('');
  const [modelId, setModelId] = useState(BYOK_PROVIDERS[0]?.defaultModel ?? '');
  const [liveModels, setLiveModels] = useState<string[]>([]);
  const [customBaseUrl, setCustomBaseUrl] = useState('');
  const [connStatus, setConnStatus] = useState<string>('');
  const [fallbackChain, setFallbackChain] = useState<ByokConfig[]>([]);

  const [savedInstructions, setSavedInstructions] = useState<UserInstruction[]>(() => {
    try {
      const raw = localStorage.getItem(PREFS_STORAGE_KEY);
      return raw ? (JSON.parse(raw) as UserInstruction[]) : DEFAULT_PREFERENCES;
    } catch {
      return DEFAULT_PREFERENCES;
    }
  });
  const [newRule, setNewRule] = useState('');
  const [newProfileName, setNewProfileName] = useState('');
  const [newProfileGuidance, setNewProfileGuidance] = useState('');

  const [versions, setVersions] = useState<string[]>([]);
  const [activeVersionIdx, setActiveVersionIdx] = useState(0);
  const [enhancedPrompt, setEnhancedPrompt] = useState('');
  const [disclaimer, setDisclaimer] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(savedInstructions));
    } catch {
      // ignore storage errors
    }
  }, [savedInstructions]);

  useEffect(() => {
    try {
      localStorage.setItem(CUSTOM_PROFILES_KEY, JSON.stringify(customProfiles));
    } catch {
      // ignore storage errors
    }
  }, [customProfiles]);

  const activeProvider = BYOK_PROVIDERS.find((p) => p.id === providerId) ?? BYOK_PROVIDERS[0]!;

  function handleProviderChange(nextId: ByokProviderId) {
    setProviderId(nextId);
    const meta = BYOK_PROVIDERS.find((p) => p.id === nextId);
    setModelId(meta?.defaultModel ?? '');
    setLiveModels([]);
    setCustomBaseUrl(
      meta?.id === 'openai-compatible' || meta?.id === 'freellmapi' ? meta.defaultBaseUrl : ''
    );
    setConnStatus('');
  }

  async function handleFileSelect(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    const accepted: Array<{ path: string; content: string }> = [];
    for (const file of files.slice(0, 8)) {
      if (SENSITIVE_FILE_RE.test(file.name)) continue;
      if (file.size > 64 * 1024) continue;
      const content = await file.text();
      accepted.push({ path: file.name, content });
    }
    setSelectedFiles(accepted);
  }

  async function handleTestConnection() {
    setError('');
    setConnStatus('Testing connection...');
    const byokConfig = {
      providerId,
      apiKey: apiKey.trim(),
      modelId: modelId.trim(),
      ...(providerId === 'openai-compatible' && customBaseUrl.trim()
        ? { baseUrl: customBaseUrl.trim() }
        : {})
    };

    try {
      const res = await testByokConnection(byokConfig);
      if (res.models.length > 0) setLiveModels(res.models);
      setModelId(res.model);
      setConnStatus(`Connected (${res.model}${res.models.length ? `, ${res.models.length} models found` : ''})`);
    } catch (err) {
      if (isNetworkOrCorsError(err)) {
        try {
          const proxyRes = await fetch(`${API_URL}/api/byok/test`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(byokConfig)
          });
          const data = (await proxyRes.json()) as {
            ok?: boolean;
            model?: string;
            models?: string[];
            error?: string;
          };
          if (!proxyRes.ok) throw new Error(data.error ?? 'Connection test failed.');
          if (data.models?.length) setLiveModels(data.models);
          if (data.model) setModelId(data.model);
          setConnStatus(`Connected via local API (${data.model ?? byokConfig.modelId})`);
          return;
        } catch (proxyErr) {
          setConnStatus('');
          setError(
            proxyErr instanceof Error
              ? `${proxyErr.message} (Provider blocked browser CORS; ensure local API is running on ${API_URL})`
              : 'Connection test failed.'
          );
          return;
        }
      }
      setConnStatus('');
      setError(err instanceof Error ? err.message : 'Connection test failed.');
    }
  }

  async function runEnhance() {
    setError('');
    setCopied(false);
    setIsEditing(false);
    setLoading(true);
    try {
      const selectedProfile = allProfiles.find((p) => p.id === profileId);
      const customGuidance =
        selectedProfile && !selectedProfile.isBuiltin ? selectedProfile.systemGuidance : '';

      const req: EnhanceRequest = {
        originalPrompt,
        additionalInstructions: [additionalInstructions.trim(), customGuidance]
          .filter(Boolean)
          .join(' '),
        savedInstructions,
        ...(selectedProfile?.isBuiltin ? { profileId: selectedProfile.id } : {}),
        ...(selectedProfile?.category ? { category: selectedProfile.category } : {}),
        targetAgent,
        mode,
        projectContext:
          contextMode === 'selected_files' && selectedFiles.length > 0
            ? { mode: 'selected_files', selectedFiles }
            : { mode: 'none' }
      };

      let result: EnhanceResponse;
      if (mode === 'free') {
        result = enhancePromptRuleBased(req);
      } else {
        const primaryConfig: ByokConfig = {
          providerId,
          apiKey: apiKey.trim(),
          modelId: modelId.trim(),
          ...(providerId === 'openai-compatible' && customBaseUrl.trim()
            ? { baseUrl: customBaseUrl.trim() }
            : {})
        };
        const queue = fallbackChain.length > 0 ? fallbackChain : [primaryConfig];
        const errors: string[] = [];
        let succeeded: EnhanceResponse | null = null;
        let usedMeta = '';

        for (const cfg of queue) {
          try {
            succeeded = await enhancePromptWithByok(req, cfg);
            usedMeta = `${cfg.providerId} / ${cfg.modelId || 'default'}`;
            break;
          } catch (err) {
            if (isNetworkOrCorsError(err)) {
              try {
                const proxyRes = await fetch(`${API_URL}/api/byok/enhance`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ request: req, byok: cfg })
                });
                const data = (await proxyRes.json()) as EnhanceResponse & { error?: string };
                if (!proxyRes.ok) throw new Error(data.error ?? 'BYOK enhancement failed.');
                succeeded = data;
                usedMeta = `${cfg.providerId} / ${cfg.modelId || 'default'} via local API`;
                break;
              } catch (proxyErr) {
                errors.push(`${cfg.providerId}: ${proxyErr instanceof Error ? proxyErr.message : 'CORS/API failed'}`);
                continue;
              }
            }
            errors.push(`${cfg.providerId}: ${err instanceof Error ? err.message : 'Failed'}`);
          }
        }

        if (!succeeded) {
          throw new Error(`All providers failed (${errors.join(' | ')})`);
        }
        result = succeeded;
        setDisclaimer(
          errors.length > 0
            ? `Generated via fallback (${usedMeta}). Skipped failed: ${errors.join('; ')}`
            : `Generated via ${usedMeta}.`
        );
      }

      setVersions((prev) => {
        const next = [...prev, result.enhancedPrompt];
        setActiveVersionIdx(next.length - 1);
        return next;
      });
      setEnhancedPrompt(result.enhancedPrompt);
      if (mode === 'free') {
        setDisclaimer(result.disclaimer ?? '');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Enhancement failed.');
    } finally {
      setLoading(false);
    }
  }

  async function handleApplyCopy() {
    if (!enhancedPrompt) return;
    await navigator.clipboard.writeText(enhancedPrompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleUndo() {
    setEnhancedPrompt('');
    setVersions([]);
    setActiveVersionIdx(0);
    setDisclaimer('');
    setIsEditing(false);
    setCopied(false);
  }

  function addInstruction() {
    const trimmed = newRule.trim();
    if (!trimmed) return;
    setSavedInstructions((prev) => [
      ...prev,
      { id: crypto.randomUUID(), text: trimmed, enabled: true, isDefault: false }
    ]);
    setNewRule('');
  }

  function addCustomProfile() {
    const name = newProfileName.trim();
    const guidance = newProfileGuidance.trim();
    if (!name || !guidance) return;
    const id = `custom-${crypto.randomUUID().slice(0, 8)}`;
    const next: PromptProfile = {
      id,
      name,
      category: 'feature' as TaskCategory,
      description: 'Custom user profile',
      systemGuidance: guidance,
      isBuiltin: false
    };
    setCustomProfiles((prev) => [...prev, next]);
    setProfileId(id);
    setNewProfileName('');
    setNewProfileGuidance('');
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Prompt Enhancer</h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Use Free Rule-Based mode with no key, or paste your own key in BYOK mode.
          </p>
        </div>

        <div className="inline-flex rounded-md border border-zinc-300 dark:border-zinc-700 p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setMode('free')}
            className={`px-3 py-1.5 rounded ${
              mode === 'free' ? 'bg-indigo-600 text-white' : 'text-zinc-600 dark:text-zinc-300'
            }`}
          >
            Free (No Key)
          </button>
          <button
            type="button"
            onClick={() => setMode('byok')}
            className={`px-3 py-1.5 rounded ${
              mode === 'byok' ? 'bg-indigo-600 text-white' : 'text-zinc-600 dark:text-zinc-300'
            }`}
          >
            BYOK (Your Key)
          </button>
        </div>
      </div>

      {mode === 'byok' && (
        <div className="p-4 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-medium">BYOK Provider Configuration (Memory Only)</h2>
            <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
              Your API key stays in memory for this tab only and is never saved to disk or database.
            </span>
          </div>

          {providerId === 'freellmapi' && (
            <div className="p-3 rounded bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs flex items-center justify-between gap-3">
              <div>
                <strong>FreeLLMAPI Unified Router:</strong> Routes across 80+ free models (Google AI Studio, NVIDIA NIM, OpenRouter, Kilo, OVH, AI Horde) with automatic failover at <code className="px-1 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/50">http://127.0.0.1:31415</code>.
                <div className="text-[11px] opacity-90 mt-0.5">
                  Paste your Unified API Key from the FreeLLMAPI desktop app (under the <em>Keys</em> tab).
                </div>
              </div>
            </div>
          )}

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <label className="space-y-1 block">
              <span className="text-zinc-500 dark:text-zinc-400">Provider</span>
              <select
                value={providerId}
                onChange={(e) => handleProviderChange(e.target.value as ByokProviderId)}
                className="w-full px-2.5 py-2 rounded border border-zinc-300 dark:border-zinc-700 bg-transparent"
              >
                {BYOK_PROVIDERS.map((p) => (
                  <option key={p.id} value={p.id} className="bg-zinc-900 text-zinc-100">
                    {p.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1 block">
              <span className="text-zinc-500 dark:text-zinc-400">
                API Key {!activeProvider.requiresKey && '(Optional — No Key Required)'}
              </span>
              <div className="flex gap-1">
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={activeProvider.requiresKey ? 'Paste API key...' : 'Optional key...'}
                  className="w-full px-2.5 py-2 rounded border border-zinc-300 dark:border-zinc-700 bg-transparent"
                />
                {apiKey && (
                  <button
                    type="button"
                    onClick={() => setApiKey('')}
                    className="px-2 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  >
                    Clear
                  </button>
                )}
              </div>
            </label>

            <label className="space-y-1 block">
              <span className="text-zinc-500 dark:text-zinc-400">Model</span>
              <input
                type="text"
                list="byok-models"
                value={modelId}
                onChange={(e) => setModelId(e.target.value)}
                className="w-full px-2.5 py-2 rounded border border-zinc-300 dark:border-zinc-700 bg-transparent"
              />
              <datalist id="byok-models">
                {(liveModels.length > 0 ? liveModels : activeProvider.models).map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </label>

            <div className="flex items-end gap-2">
              <button
                type="button"
                onClick={() => void handleTestConnection()}
                disabled={activeProvider.requiresKey && !apiKey.trim()}
                className="flex-1 px-3 py-2 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50"
              >
                Test
              </button>
              <button
                type="button"
                onClick={() => {
                  const cfg: ByokConfig = {
                    providerId,
                    apiKey: apiKey.trim(),
                    modelId: modelId.trim() || activeProvider.defaultModel,
                    ...(providerId === 'openai-compatible' && customBaseUrl.trim()
                      ? { baseUrl: customBaseUrl.trim() }
                      : {})
                  };
                  setFallbackChain((prev) => [...prev, cfg]);
                }}
                disabled={activeProvider.requiresKey && !apiKey.trim()}
                className="flex-1 px-3 py-2 rounded bg-zinc-800 text-white hover:bg-zinc-700 disabled:opacity-50"
              >
                + Fallback
              </button>
            </div>
          </div>

          {fallbackChain.length > 0 && (
            <div className="p-2.5 rounded border border-zinc-200 dark:border-zinc-800 space-y-1.5 text-xs">
              <div className="flex items-center justify-between text-zinc-500">
                <span>Fallback Chain (tries in order if one fails):</span>
                <button
                  type="button"
                  onClick={() => setFallbackChain([])}
                  className="hover:text-red-400"
                >
                  Clear all
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {fallbackChain.map((item, idx) => (
                  <span
                    key={`${item.providerId}-${idx}`}
                    className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-zinc-100 dark:bg-zinc-800"
                  >
                    <span>
                      {idx + 1}. {item.providerId} ({item.modelId || 'default'})
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setFallbackChain((prev) => prev.filter((_, i) => i !== idx))
                      }
                      className="text-zinc-400 hover:text-red-400"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}

          {providerId === 'openai-compatible' && (
            <label className="space-y-1 block text-xs">
              <span className="text-zinc-500 dark:text-zinc-400">Custom HTTPS Base URL</span>
              <input
                type="url"
                value={customBaseUrl}
                onChange={(e) => setCustomBaseUrl(e.target.value)}
                placeholder="https://api.example.com/v1"
                className="w-full px-2.5 py-2 rounded border border-zinc-300 dark:border-zinc-700 bg-transparent"
              />
            </label>
          )}

          {connStatus && <p className="text-xs text-emerald-500">{connStatus}</p>}
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-3 text-xs">
            <label className="space-y-1 block">
              <span className="text-zinc-500 dark:text-zinc-400">Enhancement Profile</span>
              <select
                value={profileId}
                onChange={(e) => setProfileId(e.target.value)}
                className="w-full px-2.5 py-2 rounded border border-zinc-300 dark:border-zinc-700 bg-transparent"
              >
                {allProfiles.map((p) => (
                  <option key={p.id} value={p.id} className="bg-zinc-900 text-zinc-100">
                    {p.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1 block">
              <span className="text-zinc-500 dark:text-zinc-400">Target Coding Agent</span>
              <select
                value={targetAgent}
                onChange={(e) => setTargetAgent(e.target.value as TargetAgent)}
                className="w-full px-2.5 py-2 rounded border border-zinc-300 dark:border-zinc-700 bg-transparent"
              >
                {AGENTS.map((a) => (
                  <option key={a.id} value={a.id} className="bg-zinc-900 text-zinc-100">
                    {a.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="space-y-1 block text-xs">
            <span className="text-zinc-500 dark:text-zinc-400">
              Original Prompt (supports inline <code>///additional instructions///</code>)
            </span>
            <textarea
              rows={6}
              value={originalPrompt}
              onChange={(e) => setOriginalPrompt(e.target.value)}
              placeholder="e.g. Change the UI look. ///Make it minimal and responsive./// "
              className="w-full p-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm font-mono"
            />
          </label>

          <label className="space-y-1 block text-xs">
            <span className="text-zinc-500 dark:text-zinc-400">Additional Instructions (Optional)</span>
            <input
              type="text"
              value={additionalInstructions}
              onChange={(e) => setAdditionalInstructions(e.target.value)}
              placeholder="Any extra constraints for this prompt..."
              className="w-full px-3 py-2 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
            />
          </label>

          <div className="p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-medium">Project Context (Opt-in)</span>
              <select
                value={contextMode}
                onChange={(e) => setContextMode(e.target.value as ContextMode)}
                className="px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 bg-transparent"
              >
                <option value="none" className="bg-zinc-900">No Context</option>
                <option value="selected_files" className="bg-zinc-900">Selected Files</option>
              </select>
            </div>
            {contextMode === 'selected_files' && (
              <div className="space-y-2">
                <input
                  type="file"
                  multiple
                  onChange={(e) => void handleFileSelect(e)}
                  className="block w-full text-xs text-zinc-500"
                />
                <p className="text-[11px] text-zinc-500">
                  Excludes .env, private keys, and files over 64 KB. Included:{' '}
                  {selectedFiles.length ? selectedFiles.map((f) => f.path).join(', ') : 'none'}
                </p>
              </div>
            )}
          </div>

          <button
            type="button"
            disabled={loading || !originalPrompt.trim()}
            onClick={() => void runEnhance()}
            className="w-full py-2.5 rounded-md bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-500 disabled:opacity-50"
          >
            {loading ? 'Enhancing...' : `Enhance Prompt (${mode === 'free' ? 'Free' : 'BYOK'})`}
          </button>

          {error && (
            <div className="p-3 rounded border border-red-500/40 bg-red-500/10 text-xs text-red-400">
              {error}
            </div>
          )}

          <div className="p-4 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              My Prompt Preferences
            </h2>
            <div className="space-y-2">
              {savedInstructions.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-2 text-xs">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={item.enabled}
                      onChange={() =>
                        setSavedInstructions((prev) =>
                          prev.map((x) => (x.id === item.id ? { ...x, enabled: !x.enabled } : x))
                        )
                      }
                    />
                    <span>{item.text}</span>
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setSavedInstructions((prev) => prev.filter((x) => x.id !== item.id))
                    }
                    className="text-zinc-400 hover:text-red-400"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2 pt-1">
              <input
                type="text"
                value={newRule}
                onChange={(e) => setNewRule(e.target.value)}
                placeholder="Add reusable instruction..."
                className="flex-1 px-2.5 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 bg-transparent text-xs"
              />
              <button
                type="button"
                onClick={addInstruction}
                className="px-3 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                Add
              </button>
            </div>
          </div>

          <div className="p-4 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-2 text-xs">
            <h2 className="font-semibold uppercase tracking-wider text-zinc-500">
              Create Custom Profile
            </h2>
            <input
              type="text"
              value={newProfileName}
              onChange={(e) => setNewProfileName(e.target.value)}
              placeholder="Profile name (e.g. Strict API Audit)"
              className="w-full px-2.5 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 bg-transparent"
            />
            <input
              type="text"
              value={newProfileGuidance}
              onChange={(e) => setNewProfileGuidance(e.target.value)}
              placeholder="Guidance injected into prompts..."
              className="w-full px-2.5 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 bg-transparent"
            />
            <button
              type="button"
              onClick={addCustomProfile}
              disabled={!newProfileName.trim() || !newProfileGuidance.trim()}
              className="px-3 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50"
            >
              Save Profile
            </button>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-medium">Review Output</h2>
              {versions.length > 1 && (
                <div className="flex gap-1">
                  {versions.map((v, idx) => (
                    <button
                      key={`${idx}-${v.slice(0, 12)}`}
                      type="button"
                      onClick={() => {
                        setActiveVersionIdx(idx);
                        setEnhancedPrompt(v);
                      }}
                      className={`px-2 py-0.5 rounded text-[11px] ${
                        idx === activeVersionIdx
                          ? 'bg-indigo-600 text-white'
                          : 'bg-zinc-200 dark:bg-zinc-800'
                      }`}
                    >
                      v{idx + 1}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {enhancedPrompt && (
              <div className="flex items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => void handleApplyCopy()}
                  className="px-2.5 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-500"
                >
                  {copied ? 'Copied' : 'Apply (Copy)'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditing((v) => !v)}
                  className="px-2.5 py-1 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  {isEditing ? 'Done' : 'Edit'}
                </button>
                <button
                  type="button"
                  onClick={() => void runEnhance()}
                  disabled={loading}
                  className="px-2.5 py-1 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  Retry
                </button>
                <button
                  type="button"
                  onClick={handleUndo}
                  className="px-2.5 py-1 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  Undo
                </button>
              </div>
            )}
          </div>

          {enhancedPrompt ? (
            <div className="space-y-2">
              {isEditing ? (
                <textarea
                  rows={16}
                  value={enhancedPrompt}
                  onChange={(e) => setEnhancedPrompt(e.target.value)}
                  className="w-full p-3 rounded-lg border border-indigo-500 bg-white dark:bg-zinc-900 text-xs font-mono leading-relaxed"
                />
              ) : (
                <pre className="p-4 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs font-mono whitespace-pre-wrap leading-relaxed min-h-80">
                  {enhancedPrompt}
                </pre>
              )}
              {disclaimer && (
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">{disclaimer}</p>
              )}
            </div>
          ) : (
            <div className="p-8 rounded-lg border border-dashed border-zinc-300 dark:border-zinc-800 text-center text-xs text-zinc-500 dark:text-zinc-400 min-h-80 flex items-center justify-center">
              Your enhanced prompt will appear here for review before you copy or apply it.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
