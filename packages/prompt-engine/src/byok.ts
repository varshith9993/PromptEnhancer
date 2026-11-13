import type { EnhanceRequest, EnhanceResponse, TargetAgent } from '@promptpilot/shared';
import { getProfileById } from './profiles.js';

export type ByokProviderId =
  | 'openrouter'
  | 'gemini'
  | 'groq'
  | 'nvidia'
  | 'huggingface'
  | 'mistral'
  | 'deepseek'
  | 'together'
  | 'cerebras'
  | 'sambanova'
  | 'ovh'
  | 'pollinations'
  | 'aihorde'
  | 'openai-compatible';

export interface ByokProviderMeta {
  id: ByokProviderId;
  name: string;
  requiresKey: boolean;
  defaultBaseUrl: string;
  defaultModel: string;
  models: string[];
}

export const BYOK_PROVIDERS: readonly ByokProviderMeta[] = [
  {
    id: 'openrouter',
    name: 'OpenRouter',
    requiresKey: true,
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'openai/gpt-4o-mini',
    models: ['openai/gpt-4o-mini', 'anthropic/claude-3.5-sonnet', 'google/gemini-2.0-flash-001', 'meta-llama/llama-3.3-70b-instruct']
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    requiresKey: true,
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-2.5-flash',
    models: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash', 'gemini-1.5-flash']
  },
  {
    id: 'groq',
    name: 'Groq',
    requiresKey: true,
    defaultBaseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768']
  },
  {
    id: 'nvidia',
    name: 'NVIDIA NIM',
    requiresKey: true,
    defaultBaseUrl: 'https://integrate.api.nvidia.com/v1',
    defaultModel: 'meta/llama-3.1-70b-instruct',
    models: ['meta/llama-3.1-70b-instruct', 'mistralai/mixtral-8x22b-instruct-v0.1']
  },
  {
    id: 'huggingface',
    name: 'Hugging Face Router',
    requiresKey: true,
    defaultBaseUrl: 'https://router.huggingface.co/v1',
    defaultModel: 'Qwen/Qwen2.5-72B-Instruct',
    models: ['Qwen/Qwen2.5-72B-Instruct', 'meta-llama/Llama-3.3-70B-Instruct', 'mistralai/Mistral-7B-Instruct-v0.3']
  },
  {
    id: 'mistral',
    name: 'Mistral AI',
    requiresKey: true,
    defaultBaseUrl: 'https://api.mistral.ai/v1',
    defaultModel: 'mistral-small-latest',
    models: ['mistral-small-latest', 'mistral-large-latest', 'codestral-latest']
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    requiresKey: true,
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    models: ['deepseek-chat', 'deepseek-reasoner']
  },
  {
    id: 'together',
    name: 'Together AI',
    requiresKey: true,
    defaultBaseUrl: 'https://api.together.xyz/v1',
    defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    models: ['meta-llama/Llama-3.3-70B-Instruct-Turbo', 'Qwen/Qwen2.5-72B-Instruct-Turbo']
  },
  {
    id: 'cerebras',
    name: 'Cerebras',
    requiresKey: true,
    defaultBaseUrl: 'https://api.cerebras.ai/v1',
    defaultModel: 'llama-3.3-70b',
    models: ['llama-3.3-70b', 'llama3.1-8b']
  },
  {
    id: 'sambanova',
    name: 'SambaNova',
    requiresKey: true,
    defaultBaseUrl: 'https://api.sambanova.ai/v1',
    defaultModel: 'Meta-Llama-3.3-70B-Instruct',
    models: ['Meta-Llama-3.3-70B-Instruct', 'DeepSeek-R1-Distill-Llama-70B']
  },
  {
    id: 'ovh',
    name: 'OVH AI Endpoints (Free/Keyed)',
    requiresKey: false,
    defaultBaseUrl: 'https://oai.endpoints.kepler.ai.cloud.ovh.net/v1',
    defaultModel: 'Meta-Llama-3_3-70B-Instruct',
    models: ['Meta-Llama-3_3-70B-Instruct', 'Mistral-Nemo-Instruct-2407', 'Qwen2.5-Coder-32B-Instruct']
  },
  {
    id: 'pollinations',
    name: 'Pollinations (No Key)',
    requiresKey: false,
    defaultBaseUrl: 'https://text.pollinations.ai/openai',
    defaultModel: 'openai',
    models: ['openai', 'mistral', 'llama']
  },
  {
    id: 'aihorde',
    name: 'AI Horde (No Key)',
    requiresKey: false,
    defaultBaseUrl: 'https://aihorde.net/api/v2',
    defaultModel: 'aphrodite/meta-llama/Meta-Llama-3.1-8B-Instruct',
    models: ['aphrodite/meta-llama/Meta-Llama-3.1-8B-Instruct']
  },
  {
    id: 'openai-compatible',
    name: 'OpenAI-Compatible (Kilo / Custom)',
    requiresKey: false,
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    models: ['gpt-4o-mini', 'gpt-4o']
  }
];

export interface ByokConfig {
  providerId: ByokProviderId;
  apiKey: string;
  modelId?: string;
  baseUrl?: string;
}

const PRIVATE_HOST_RE = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.0\.0\.0|\[::1\])/i;

export function validateExternalBaseUrl(rawUrl: string): string {
  const parsed = new URL(rawUrl);
  if (parsed.protocol !== 'https:') {
    throw new Error('Custom endpoint must use HTTPS.');
  }
  if (PRIVATE_HOST_RE.test(parsed.hostname)) {
    throw new Error('Private or loopback endpoints are blocked.');
  }
  return parsed.toString().replace(/\/+$/, '');
}

function buildSystemPrompt(request: EnhanceRequest): string {
  const profile = getProfileById(request.profileId);
  const agent: TargetAgent = request.targetAgent ?? 'generic';
  const saved = (request.savedInstructions ?? [])
    .filter((i) => i.enabled)
    .map((i) => `- ${i.text}`)
    .join('\n');

  return [
    'You are PromptPilot, a senior software engineering prompt enhancer.',
    'Transform the user instruction into a clear, structured, implementation-ready prompt for an AI coding agent.',
    'Rules: preserve the user intent, do not invent unrelated requirements, avoid fluff, and keep sections concise.',
    `Target coding agent: ${agent}.`,
    profile ? `Active profile (${profile.name}): ${profile.systemGuidance}` : '',
    saved ? `User saved instructions:\n${saved}` : ''
  ]
    .filter(Boolean)
    .join('\n\n');
}

function buildUserPrompt(request: EnhanceRequest): string {
  const extra = request.additionalInstructions?.trim();
  const ctx = request.projectContext;
  const contextParts: string[] = [];

  if (ctx && ctx.mode !== 'none') {
    if (ctx.framework || ctx.language) {
      contextParts.push(
        `Project stack: ${[ctx.language, ctx.framework].filter(Boolean).join(', ')}`
      );
    }
    if (ctx.dependencies?.length) {
      contextParts.push(`Dependencies: ${ctx.dependencies.slice(0, 25).join(', ')}`);
    }
    if (ctx.selectedFiles?.length) {
      const filesText = ctx.selectedFiles
        .map((f) => `--- ${f.path} ---\n${f.content.slice(0, 4000)}`)
        .join('\n\n');
      contextParts.push(`Selected project files:\n${filesText}`);
    }
  }

  return [
    `Original prompt:\n${request.originalPrompt.trim()}`,
    extra ? `Additional instructions:\n${extra}` : '',
    contextParts.length ? `Project context:\n${contextParts.join('\n\n')}` : '',
    'Return only the enhanced prompt in clean Markdown with Objective, Requirements/Guidance, Constraints, and Verification sections where appropriate.'
  ]
    .filter(Boolean)
    .join('\n\n');
}

async function readErrorMessage(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as {
      error?: { message?: string } | string;
      message?: string;
    };
    if (typeof data.error === 'string') return data.error;
    if (data.error?.message) return data.error.message;
    if (data.message) return data.message;
  } catch {
    // ignore JSON parse failure
  }
  return `HTTP ${res.status}`;
}

async function callAiHorde(
  baseUrl: string,
  apiKey: string,
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const submitRes = await fetch(`${baseUrl}/generate/text/async`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: apiKey || '0000000000'
    },
    body: JSON.stringify({
      prompt: `${systemPrompt}\n\n${userPrompt}`,
      params: { max_context_length: 2048, max_length: 512 }
    }),
    signal: AbortSignal.timeout(15_000)
  });
  if (!submitRes.ok) {
    throw new Error(`AI Horde error (${submitRes.status}): ${await readErrorMessage(submitRes)}`);
  }
  const { id } = (await submitRes.json()) as { id?: string };
  if (!id) throw new Error('AI Horde did not return a job id.');

  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    const statusRes = await fetch(`${baseUrl}/generate/text/status/${id}`, {
      signal: AbortSignal.timeout(10_000)
    });
    if (!statusRes.ok) continue;
    const status = (await statusRes.json()) as {
      done?: boolean;
      generations?: Array<{ text?: string }>;
    };
    if (status.done) {
      const text = status.generations?.[0]?.text?.trim();
      if (!text) throw new Error('AI Horde returned an empty response.');
      return text;
    }
  }
  throw new Error('AI Horde timed out waiting for worker.');
}

async function callProvider(config: ByokConfig, systemPrompt: string, userPrompt: string): Promise<string> {
  const meta = BYOK_PROVIDERS.find((p) => p.id === config.providerId);
  if (!meta) throw new Error(`Unsupported provider: ${config.providerId}`);
  const apiKey = config.apiKey.trim();
  if (meta.requiresKey && !apiKey) throw new Error(`${meta.name} requires an API key.`);

  const model = config.modelId?.trim() || meta.defaultModel;
  const baseUrl = config.baseUrl?.trim() ? validateExternalBaseUrl(config.baseUrl.trim()) : meta.defaultBaseUrl;

  if (config.providerId === 'aihorde') {
    return callAiHorde(baseUrl, apiKey, systemPrompt, userPrompt);
  }

  if (config.providerId === 'gemini') {
    const endpoint = `${baseUrl}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }]
      }),
      signal: AbortSignal.timeout(30_000)
    });
    if (!res.ok) {
      const detail = await readErrorMessage(res);
      throw new Error(`Gemini error (${res.status}): ${detail}`);
    }
    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text) throw new Error('Gemini returned an empty response.');
    return text;
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.3
    }),
    signal: AbortSignal.timeout(30_000)
  });

  if (!res.ok) {
    const detail = await readErrorMessage(res);
    if (res.status === 401 || res.status === 403) {
      throw new Error(`${meta.name} auth error (${res.status}): ${detail}`);
    }
    if (res.status === 429) {
      throw new Error(`${meta.name} rate limit (${res.status}): ${detail}`);
    }
    throw new Error(`${meta.name} error (${res.status}): ${detail}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error(`${meta.name} returned an empty response.`);
  return text;
}

export async function listByokModels(config: ByokConfig): Promise<string[]> {
  const meta = BYOK_PROVIDERS.find((p) => p.id === config.providerId);
  if (!meta) throw new Error(`Unsupported provider: ${config.providerId}`);
  const apiKey = config.apiKey.trim();
  if (meta.requiresKey && !apiKey) throw new Error(`${meta.name} requires an API key.`);

  const baseUrl = config.baseUrl?.trim() ? validateExternalBaseUrl(config.baseUrl.trim()) : meta.defaultBaseUrl;

  if (config.providerId === 'aihorde') {
    return meta.models;
  }

  if (config.providerId === 'gemini') {
    const res = await fetch(`${baseUrl}/models?key=${encodeURIComponent(apiKey)}`, {
      signal: AbortSignal.timeout(15_000)
    });
    if (!res.ok) {
      const detail = await readErrorMessage(res);
      throw new Error(`Gemini error (${res.status}): ${detail}`);
    }
    const data = (await res.json()) as {
      models?: Array<{ name?: string; supportedGenerationMethods?: string[] }>;
    };
    const ids = (data.models ?? [])
      .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
      .map((m) => (m.name ?? '').replace(/^models\//, ''))
      .filter(Boolean);
    return ids.length ? ids : meta.models;
  }

  const headers: Record<string, string> = {};
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const res = await fetch(`${baseUrl}/models`, {
    headers,
    signal: AbortSignal.timeout(15_000)
  });
  if (!res.ok) {
    const detail = await readErrorMessage(res);
    throw new Error(`${meta.name} error (${res.status}): ${detail}`);
  }
  const data = (await res.json()) as { data?: Array<{ id?: string }> };
  const ids = (data.data ?? []).map((m) => m.id ?? '').filter(Boolean);
  return ids.length ? ids : meta.models;
}

export async function testByokConnection(
  config: ByokConfig
): Promise<{ ok: boolean; model: string; models: string[] }> {
  const meta = BYOK_PROVIDERS.find((p) => p.id === config.providerId);
  let models: string[] = meta?.models ?? [];
  try {
    models = await listByokModels(config);
  } catch {
    // Fall back to static defaults if provider /models listing is disabled.
  }

  const requested = config.modelId?.trim();
  const model =
    requested && (models.length === 0 || models.includes(requested))
      ? requested
      : (models[0] ?? requested ?? meta?.defaultModel ?? 'unknown');

  await callProvider({ ...config, modelId: model }, 'Reply with OK.', 'Ping');
  return { ok: true, model, models };
}

export async function enhancePromptWithByok(
  request: EnhanceRequest,
  config: ByokConfig
): Promise<EnhanceResponse> {
  const original = request.originalPrompt.trim();
  if (!original) throw new Error('Original prompt cannot be empty.');

  const profile = getProfileById(request.profileId);
  const category = request.category ?? profile?.category ?? 'feature';
  const targetAgent: TargetAgent = request.targetAgent ?? 'generic';
  const enhancedPrompt = await callProvider(config, buildSystemPrompt(request), buildUserPrompt(request));

  return {
    originalPrompt: request.originalPrompt,
    enhancedPrompt,
    mode: 'byok',
    category,
    targetAgent,
    assumptions: [
      `Provider: ${config.providerId}`,
      `Model: ${config.modelId?.trim() || BYOK_PROVIDERS.find((p) => p.id === config.providerId)?.defaultModel || 'default'}`
    ]
  };
}

export interface FallbackAttempt {
  providerId: ByokProviderId;
  ok: boolean;
  error?: string;
}

export async function enhancePromptWithFallback(
  request: EnhanceRequest,
  configs: ByokConfig[]
): Promise<{ response: EnhanceResponse; usedProvider: ByokProviderId; attempts: FallbackAttempt[] }> {
  const attempts: FallbackAttempt[] = [];
  for (const config of configs) {
    try {
      const response = await enhancePromptWithByok(request, config);
      attempts.push({ providerId: config.providerId, ok: true });
      return { response, usedProvider: config.providerId, attempts };
    } catch (err) {
      attempts.push({
        providerId: config.providerId,
        ok: false,
        error: err instanceof Error ? err.message : 'Failed'
      });
    }
  }
  const summary = attempts.map((a) => `${a.providerId}: ${a.error}`).join(' | ');
  throw new Error(`All providers in fallback chain failed (${summary})`);
}
