import { useEffect, useState } from 'react';
import {
  BUILTIN_PROFILES,
  BYOK_PROVIDERS,
  enhancePromptRuleBased,
  enhancePromptWithByok,
  testByokConnection,
  type ByokProviderId
} from '@promptpilot/prompt-engine';
import type { TargetAgent, UserInstruction } from '@promptpilot/shared';

const DEFAULT_PREFERENCES: UserInstruction[] = [
  { id: 'p1', text: 'Preserve existing functionality and routes', enabled: true, isDefault: true },
  { id: 'p2', text: 'Prefer TypeScript and minimal dependencies', enabled: true, isDefault: true },
  { id: 'p3', text: 'Do not modify unrelated files', enabled: false, isDefault: false }
];

const PREFS_STORAGE_KEY = 'promptpilot_preferences_v1';

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

export function EnhancerPage() {
  const [mode, setMode] = useState<'free' | 'byok'>('free');
  const [profileId, setProfileId] = useState<string>(BUILTIN_PROFILES[0]?.id ?? 'quick-fix');
  const [targetAgent, setTargetAgent] = useState<TargetAgent>('generic');
  const [originalPrompt, setOriginalPrompt] = useState('');
  const [additionalInstructions, setAdditionalInstructions] = useState('');

  // BYOK state stays in React memory only and is never written to localStorage or sent to a DB.
  const [providerId, setProviderId] = useState<ByokProviderId>('openrouter');
  const [apiKey, setApiKey] = useState('');
  const [modelId, setModelId] = useState(BYOK_PROVIDERS[0]?.defaultModel ?? '');
  const [customBaseUrl, setCustomBaseUrl] = useState('');
  const [connStatus, setConnStatus] = useState<string>('');

  const [savedInstructions, setSavedInstructions] = useState<UserInstruction[]>(() => {
    try {
      const raw = localStorage.getItem(PREFS_STORAGE_KEY);
      return raw ? (JSON.parse(raw) as UserInstruction[]) : DEFAULT_PREFERENCES;
    } catch {
      return DEFAULT_PREFERENCES;
    }
  });
  const [newRule, setNewRule] = useState('');

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
      // ignore storage quota errors
    }
  }, [savedInstructions]);

  const activeProvider = BYOK_PROVIDERS.find((p) => p.id === providerId) ?? BYOK_PROVIDERS[0]!;

  function handleProviderChange(nextId: ByokProviderId) {
    setProviderId(nextId);
    const meta = BYOK_PROVIDERS.find((p) => p.id === nextId);
    setModelId(meta?.defaultModel ?? '');
    setConnStatus('');
  }

  async function handleTestConnection() {
    setError('');
    setConnStatus('Testing connection...');
    try {
      const res = await testByokConnection({
        providerId,
        apiKey,
        modelId,
        ...(providerId === 'openai-compatible' && customBaseUrl ? { baseUrl: customBaseUrl } : {})
      });
      setConnStatus(`Connected (${res.model})`);
    } catch (err) {
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
      const req = {
        originalPrompt,
        additionalInstructions,
        savedInstructions,
        profileId,
        targetAgent,
        mode
      } as const;

      if (mode === 'free') {
        const res = enhancePromptRuleBased(req);
        setEnhancedPrompt(res.enhancedPrompt);
        setDisclaimer(res.disclaimer ?? '');
      } else {
        const res = await enhancePromptWithByok(req, {
          providerId,
          apiKey,
          modelId,
          ...(providerId === 'openai-compatible' && customBaseUrl ? { baseUrl: customBaseUrl } : {})
        });
        setEnhancedPrompt(res.enhancedPrompt);
        setDisclaimer('Generated via BYOK directly from your browser using your API key.');
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
              <span className="text-zinc-500 dark:text-zinc-400">API Key</span>
              <div className="flex gap-1">
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Paste API key..."
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
                {activeProvider.models.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </label>

            <div className="flex items-end gap-2">
              <button
                type="button"
                onClick={() => void handleTestConnection()}
                disabled={!apiKey.trim()}
                className="w-full px-3 py-2 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50"
              >
                Test Connection
              </button>
            </div>
          </div>

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
                {BUILTIN_PROFILES.map((p) => (
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
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium">Review Output</h2>
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

