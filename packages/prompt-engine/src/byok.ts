import type { EnhanceRequest, EnhanceResponse, TargetAgent } from '@promptpilot/shared';
import { getProfileById } from './profiles.js';

export type ByokProviderId = 'openrouter' | 'gemini' | 'groq' | 'nvidia' | 'openai-compatible';

export interface ByokProviderMeta {
  id: ByokProviderId;
  name: string;
  defaultBaseUrl: string;
  defaultModel: string;
  models: string[];
}

export const BYOK_PROVIDERS: readonly ByokProviderMeta[] = [
  {
    id: 'openrouter',
    name: 'OpenRouter',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'openai/gpt-4o-mini',
    models: ['openai/gpt-4o-mini', 'anthropic/claude-3.5-sonnet', 'google/gemini-2.0-flash-001', 'meta-llama/llama-3.3-70b-instruct']
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-2.0-flash',
    models: ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-2.5-pro']
  },
  {
    id: 'groq',
    name: 'Groq',
    defaultBaseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768']
  },
  {
    id: 'nvidia',
    name: 'NVIDIA NIM',
    defaultBaseUrl: 'https://integrate.api.nvidia.com/v1',
    defaultModel: 'meta/llama-3.1-70b-instruct',
    models: ['meta/llama-3.1-70b-instruct', 'mistralai/mixtral-8x22b-instruct-v0.1']
  },
  {
    id: 'openai-compatible',
    name: 'OpenAI-Compatible',
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
  return [
    `Original prompt:\n${request.originalPrompt.trim()}`,
    extra ? `Additional instructions:\n${extra}` : '',
    'Return only the enhanced prompt in clean Markdown with Objective, Requirements/Guidance, Constraints, and Verification sections where appropriate.'
  ]
    .filter(Boolean)
    .join('\n\n');
}

async function callProvider(config: ByokConfig, systemPrompt: string, userPrompt: string): Promise<string> {
  const meta = BYOK_PROVIDERS.find((p) => p.id === config.providerId);
  if (!meta) throw new Error(`Unsupported provider: ${config.providerId}`);
  const apiKey = config.apiKey.trim();
  if (!apiKey) throw new Error('API key is required.');

  const model = config.modelId?.trim() || meta.defaultModel;
  const baseUrl = config.baseUrl?.trim() ? validateExternalBaseUrl(config.baseUrl.trim()) : meta.defaultBaseUrl;

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
      throw new Error(`Gemini error (${res.status}): check API key or model name.`);
    }
    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text) throw new Error('Gemini returned an empty response.');
    return text;
  }

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
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
    if (res.status === 401 || res.status === 403) {
      throw new Error(`${meta.name}: invalid or unauthorized API key.`);
    }
    if (res.status === 429) {
      throw new Error(`${meta.name}: rate limit or quota exceeded.`);
    }
    throw new Error(`${meta.name} request failed (${res.status}).`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error(`${meta.name} returned an empty response.`);
  return text;
}

export async function testByokConnection(config: ByokConfig): Promise<{ ok: boolean; model: string }> {
  const meta = BYOK_PROVIDERS.find((p) => p.id === config.providerId);
  const model = config.modelId?.trim() || meta?.defaultModel || 'unknown';
  await callProvider(config, 'Reply with OK.', 'Ping');
  return { ok: true, model };
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

