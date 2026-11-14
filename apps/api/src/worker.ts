import { DEFAULT_PLANS, INTEGRATIONS } from '@promptpilot/config';
import {
  BUILTIN_PROFILES,
  BYOK_PROVIDERS,
  enhancePromptRuleBased,
  enhancePromptWithByok,
  testByokConnection,
  type ByokConfig,
  type ByokProviderId
} from '@promptpilot/prompt-engine';
import type { EnhanceRequest, PromptProfile, UserInstruction } from '@promptpilot/shared';
import {
  checkAllUserApiKeys,
  createUserAccessToken,
  deleteUserApiKey,
  fetchUserAccessTokens,
  fetchUserApiKeys,
  fetchUserPreferences,
  fetchUserProfiles,
  getUserDecryptedApiKey,
  getUserDefaultHealthyKey,
  insertUserProfile,
  logPromptHistory,
  replaceUserPreferences,
  revokeUserAccessToken,
  saveUserApiKey,
  toggleApiKeyStatus,
  verifySupabaseUser
} from './supabase-auth.js';

export interface Env {
  WEB_ORIGIN?: string;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  PROMPTPILOT_MASTER_KEY?: string;
}

function getCorsHeaders(request: Request, env?: Env): HeadersInit {
  const origin = request.headers.get('origin');
  const allowedOrigin = env?.WEB_ORIGIN ?? process.env.WEB_ORIGIN ?? '*';
  let allowOrigin = allowedOrigin;
  if (
    origin &&
    (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) ||
      origin.endsWith('.pages.dev') ||
      origin === allowedOrigin)
  ) {
    allowOrigin = origin;
  }
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin'
  };
}

function jsonResponse(data: unknown, status = 200, cors: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      ...cors
    }
  });
}

export async function handleWorkerRequest(request: Request, env?: Env): Promise<Response> {
  const cors = getCorsHeaders(request, env);
  const method = request.method.toUpperCase();
  const url = new URL(request.url);
  const pathname = url.pathname;

  if (method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  if (method === 'GET' && pathname === '/health') {
    return jsonResponse({ ok: true, service: 'promptpilot-api', platform: 'cloudflare-worker' }, 200, cors);
  }

  if (method === 'GET' && pathname === '/api/plans') {
    return jsonResponse({ plans: DEFAULT_PLANS }, 200, cors);
  }

  if (method === 'GET' && pathname === '/api/integrations') {
    return jsonResponse({ integrations: INTEGRATIONS }, 200, cors);
  }

  if (method === 'GET' && pathname === '/api/profiles') {
    return jsonResponse({ profiles: BUILTIN_PROFILES, providers: BYOK_PROVIDERS }, 200, cors);
  }

  if (method === 'POST' && pathname === '/api/enhance') {
    try {
      const parsed = (await request.json()) as Partial<EnhanceRequest> & { providerId?: string };
      if (!parsed.originalPrompt || typeof parsed.originalPrompt !== 'string') {
        return jsonResponse({ error: 'originalPrompt is required' }, 400, cors);
      }
      if (parsed.originalPrompt.length > 10_000) {
        return jsonResponse({ error: 'Prompt too long (max 10,000 characters)' }, 400, cors);
      }

      const authHeader = request.headers.get('authorization') ?? undefined;
      const user = await verifySupabaseUser(authHeader);

      if (user && parsed.mode !== 'free') {
        const preferredProvider = parsed.providerId;
        let keyConfig = preferredProvider
          ? await getUserDecryptedApiKey(user.id, preferredProvider)
          : null;
        let resolvedProvider = preferredProvider;

        if (!keyConfig) {
          const defaultKey = await getUserDefaultHealthyKey(user.id);
          if (defaultKey) {
            keyConfig = {
              apiKey: defaultKey.apiKey,
              ...(defaultKey.baseUrl ? { baseUrl: defaultKey.baseUrl } : {}),
              ...(defaultKey.modelId ? { modelId: defaultKey.modelId } : {})
            };
            resolvedProvider = defaultKey.providerId;
          }
        }

        if (keyConfig && resolvedProvider) {
          try {
            const providerId = resolvedProvider as ByokProviderId;
            const result = await enhancePromptWithByok(
              { ...parsed, originalPrompt: parsed.originalPrompt, mode: 'byok' },
              {
                providerId,
                apiKey: keyConfig.apiKey,
                ...(keyConfig.modelId ? { modelId: keyConfig.modelId } : {}),
                ...(keyConfig.baseUrl ? { baseUrl: keyConfig.baseUrl } : {})
              }
            );
            void logPromptHistory(user.id, parsed.originalPrompt, result.enhancedPrompt, 'byok', result.category, providerId);
            return jsonResponse(result, 200, cors);
          } catch {
            // fall back to PromptPilot rule-based engine
          }
        }
      }

      const result = enhancePromptRuleBased({
        ...parsed,
        originalPrompt: parsed.originalPrompt,
        mode: 'free'
      });
      if (user) {
        void logPromptHistory(user.id, parsed.originalPrompt, result.enhancedPrompt, 'free', result.category);
      }
      return jsonResponse(result, 200, cors);
    } catch (err) {
      return jsonResponse({ error: err instanceof Error ? err.message : 'Invalid request' }, 400, cors);
    }
  }

  if (method === 'POST' && pathname === '/api/byok/test') {
    try {
      const config = (await request.json()) as Partial<ByokConfig>;
      if (!config.providerId) {
        return jsonResponse({ error: 'providerId is required' }, 400, cors);
      }
      const result = await testByokConnection({
        ...(config as ByokConfig),
        apiKey: config.apiKey ?? ''
      });
      return jsonResponse(result, 200, cors);
    } catch (err) {
      return jsonResponse({ error: err instanceof Error ? err.message : 'Connection failed' }, 400, cors);
    }
  }

  if (method === 'POST' && pathname === '/api/byok/enhance') {
    try {
      const body = (await request.json()) as {
        request?: Partial<EnhanceRequest>;
        byok?: Partial<ByokConfig>;
      };
      if (!body.request?.originalPrompt || !body.byok?.providerId) {
        return jsonResponse({ error: 'originalPrompt and providerId are required' }, 400, cors);
      }
      const result = await enhancePromptWithByok(
        { ...body.request, originalPrompt: body.request.originalPrompt, mode: 'byok' },
        { ...(body.byok as ByokConfig), apiKey: body.byok.apiKey ?? '' }
      );
      return jsonResponse(result, 200, cors);
    } catch (err) {
      return jsonResponse({ error: err instanceof Error ? err.message : 'Enhancement failed' }, 400, cors);
    }
  }

  // Preferences & Profiles
  if (
    (pathname === '/api/me/preferences' || pathname === '/api/me/profiles') &&
    (method === 'GET' || method === 'PUT' || method === 'POST')
  ) {
    const authHeader = request.headers.get('authorization') ?? undefined;
    const user = await verifySupabaseUser(authHeader);
    if (!user || !authHeader?.startsWith('Bearer ')) {
      return jsonResponse({ error: 'Unauthorized' }, 401, cors);
    }
    const token = authHeader.slice(7).trim();

    try {
      if (pathname === '/api/me/preferences' && method === 'GET') {
        const items = await fetchUserPreferences(token, user.id);
        return jsonResponse({ items }, 200, cors);
      }
      if (pathname === '/api/me/preferences' && method === 'PUT') {
        const body = (await request.json()) as { items?: UserInstruction[] };
        if (!Array.isArray(body.items)) {
          return jsonResponse({ error: 'items array is required' }, 400, cors);
        }
        await replaceUserPreferences(token, user, body.items);
        return jsonResponse({ ok: true }, 200, cors);
      }
      if (pathname === '/api/me/profiles' && method === 'GET') {
        const profiles = await fetchUserProfiles(token, user.id);
        return jsonResponse({ profiles }, 200, cors);
      }
      if (pathname === '/api/me/profiles' && method === 'POST') {
        const body = (await request.json()) as Partial<PromptProfile>;
        if (!body.name || !body.systemGuidance) {
          return jsonResponse({ error: 'name and systemGuidance are required' }, 400, cors);
        }
        await insertUserProfile(token, user, {
          name: body.name,
          category: body.category ?? 'feature',
          description: body.description ?? 'Custom user profile',
          systemGuidance: body.systemGuidance
        });
        return jsonResponse({ ok: true }, 201, cors);
      }
    } catch (err) {
      return jsonResponse({ error: err instanceof Error ? err.message : 'Request failed' }, 400, cors);
    }
  }

  // Keys
  if (
    pathname.startsWith('/api/me/keys') &&
    (method === 'GET' || method === 'PUT' || method === 'PATCH' || method === 'DELETE' || method === 'POST')
  ) {
    const authHeader = request.headers.get('authorization') ?? undefined;
    const user = await verifySupabaseUser(authHeader);
    if (!user || !authHeader?.startsWith('Bearer ')) {
      return jsonResponse({ error: 'Unauthorized' }, 401, cors);
    }
    const token = authHeader.slice(7).trim();

    try {
      if (pathname === '/api/me/keys/check-all' && method === 'POST') {
        const keys = await checkAllUserApiKeys(user.id);
        return jsonResponse({ ok: true, keys }, 200, cors);
      }
      if (method === 'PATCH') {
        const body = (await request.json()) as { providerId?: string; enabled?: boolean };
        if (!body.providerId || typeof body.enabled !== 'boolean') {
          return jsonResponse({ error: 'providerId and enabled (boolean) are required' }, 400, cors);
        }
        await toggleApiKeyStatus(user.id, body.providerId, body.enabled);
        return jsonResponse({ ok: true }, 200, cors);
      }
      if (method === 'GET') {
        const keys = await fetchUserApiKeys(token, user.id);
        return jsonResponse({ keys }, 200, cors);
      }
      if (method === 'PUT') {
        const body = (await request.json()) as {
          providerId?: string;
          apiKey?: string;
          baseUrl?: string;
          modelId?: string;
          label?: string;
          skipTest?: boolean;
        };
        if (!body.providerId || !body.apiKey) {
          return jsonResponse({ error: 'providerId and apiKey are required' }, 400, cors);
        }

        let testResult: { ok: boolean; model: string; models: string[] } | null = null;
        if (!body.skipTest) {
          try {
            testResult = await testByokConnection({
              providerId: body.providerId as ByokProviderId,
              apiKey: body.apiKey,
              ...(body.baseUrl ? { baseUrl: body.baseUrl } : {}),
              ...(body.modelId ? { modelId: body.modelId } : {})
            });
          } catch (testErr) {
            return jsonResponse(
              { error: `Provider test failed: ${testErr instanceof Error ? testErr.message : 'Invalid key'}` },
              400,
              cors
            );
          }
        }

        const finalModelId = testResult?.model || body.modelId;
        await saveUserApiKey(token, user, {
          providerId: body.providerId,
          apiKey: body.apiKey,
          ...(body.baseUrl ? { baseUrl: body.baseUrl } : {}),
          ...(finalModelId ? { modelId: finalModelId } : {}),
          ...(body.label ? { label: body.label } : {}),
          status: 'healthy'
        });
        return jsonResponse(
          {
            ok: true,
            status: 'healthy',
            model: testResult?.model,
            models: testResult?.models ?? []
          },
          200,
          cors
        );
      }
      if (method === 'DELETE') {
        const providerId = url.searchParams.get('providerId') || pathname.split('/').pop();
        if (!providerId || providerId === 'keys') {
          return jsonResponse({ error: 'providerId is required' }, 400, cors);
        }
        await deleteUserApiKey(token, user.id, providerId);
        return jsonResponse({ ok: true }, 200, cors);
      }
    } catch (err) {
      return jsonResponse({ error: err instanceof Error ? err.message : 'Key operation failed' }, 400, cors);
    }
  }

  // Personal Access Tokens
  if (
    pathname.startsWith('/api/me/tokens') &&
    (method === 'GET' || method === 'POST' || method === 'DELETE')
  ) {
    const authHeader = request.headers.get('authorization') ?? undefined;
    const user = await verifySupabaseUser(authHeader);
    if (!user || !authHeader?.startsWith('Bearer ')) {
      return jsonResponse({ error: 'Unauthorized' }, 401, cors);
    }
    const token = authHeader.slice(7).trim();

    try {
      if (method === 'GET') {
        const tokens = await fetchUserAccessTokens(token, user.id);
        return jsonResponse({ tokens }, 200, cors);
      }
      if (method === 'POST') {
        const body = (await request.json().catch(() => ({}))) as { name?: string };
        const created = await createUserAccessToken(token, user, body.name);
        return jsonResponse(created, 201, cors);
      }
      if (method === 'DELETE') {
        const tokenId = url.searchParams.get('id') || pathname.split('/').pop();
        if (!tokenId || tokenId === 'tokens') {
          return jsonResponse({ error: 'tokenId is required' }, 400, cors);
        }
        await revokeUserAccessToken(token, user.id, tokenId);
        return jsonResponse({ ok: true }, 200, cors);
      }
    } catch (err) {
      return jsonResponse({ error: err instanceof Error ? err.message : 'Token operation failed' }, 400, cors);
    }
  }

  return jsonResponse({ error: 'Not found' }, 404, cors);
}

export default {
  async fetch(request: Request, env: Env = {}): Promise<Response> {
    if (env.SUPABASE_URL) process.env.SUPABASE_URL = env.SUPABASE_URL;
    if (env.SUPABASE_SERVICE_ROLE_KEY) process.env.SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
    if (env.SUPABASE_PUBLISHABLE_KEY) process.env.SUPABASE_PUBLISHABLE_KEY = env.SUPABASE_PUBLISHABLE_KEY;
    if (env.PROMPTPILOT_MASTER_KEY) process.env.PROMPTPILOT_MASTER_KEY = env.PROMPTPILOT_MASTER_KEY;
    if (env.WEB_ORIGIN) process.env.WEB_ORIGIN = env.WEB_ORIGIN;

    return handleWorkerRequest(request, env);
  }
};

