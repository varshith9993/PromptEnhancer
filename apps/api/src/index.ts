import http from 'node:http';
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
  verifySupabaseUser
} from './supabase-auth.js';

const WEB_ORIGIN = process.env.WEB_ORIGIN ?? 'http://localhost:5173';

// Simple in-memory rate limiter: max requests per IP per window.
// shortcut: in-memory only, resets on restart; swap to Redis when scaling.
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_REQUESTS = 30;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(ip);
  if (!bucket || now > bucket.resetAt) {
    rateBuckets.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  bucket.count += 1;
  return bucket.count > RATE_MAX_REQUESTS;
}

function setCors(res: http.ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', WEB_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function setSecurityHeaders(res: http.ServerResponse): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
}

function sendJson(res: http.ServerResponse, status: number, payload: unknown): void {
  setCors(res);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > 64 * 1024) {
        reject(new Error('Request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

// shortcut: Phase 1/2 uses node:http for zero-dependency routes; switch to Fastify + Zod when DB-backed routes land.
export async function handleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  const method = req.method ?? 'GET';
  const url = req.url ?? '/';

  setSecurityHeaders(res);

  if (method === 'OPTIONS') {
    setCors(res);
    res.writeHead(204);
    res.end();
    return;
  }

  if (method === 'GET' && url === '/health') {
    sendJson(res, 200, { ok: true, service: 'promptpilot-api' });
    return;
  }

  if (method === 'GET' && url === '/api/plans') {
    sendJson(res, 200, { plans: DEFAULT_PLANS });
    return;
  }

  if (method === 'GET' && url === '/api/integrations') {
    sendJson(res, 200, { integrations: INTEGRATIONS });
    return;
  }

  if (method === 'GET' && url === '/api/profiles') {
    sendJson(res, 200, { profiles: BUILTIN_PROFILES, providers: BYOK_PROVIDERS });
    return;
  }

  if (method === 'POST' && url === '/api/enhance') {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
    if (isRateLimited(ip)) {
      sendJson(res, 429, { error: 'Too many requests. Try again in a minute.' });
      return;
    }
    try {
      const raw = await readBody(req);
      const parsed = JSON.parse(raw) as Partial<EnhanceRequest> & { providerId?: string };
      if (!parsed.originalPrompt || typeof parsed.originalPrompt !== 'string') {
        sendJson(res, 400, { error: 'originalPrompt is required' });
        return;
      }
      if (parsed.originalPrompt.length > 10_000) {
        sendJson(res, 400, { error: 'Prompt too long (max 10,000 characters)' });
        return;
      }

      // Check for authenticated user (via JWT or personal pp_live_ token)
      const authHeader = req.headers.authorization;
      const user = await verifySupabaseUser(authHeader);

      // If user is authenticated and has stored provider credentials, use their configured AI provider
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
          sendJson(res, 200, result);
          return;
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
      sendJson(res, 200, result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid request';
      sendJson(res, 400, { error: message });
    }
    return;
  }

  if (method === 'POST' && url === '/api/byok/test') {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
    if (isRateLimited(ip)) {
      sendJson(res, 429, { error: 'Too many requests. Try again in a minute.' });
      return;
    }
    try {
      const raw = await readBody(req);
      const config = JSON.parse(raw) as Partial<ByokConfig>;
      if (!config.providerId) {
        sendJson(res, 400, { error: 'providerId is required' });
        return;
      }
      const result = await testByokConnection({
        ...(config as ByokConfig),
        apiKey: config.apiKey ?? ''
      });
      sendJson(res, 200, result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Connection failed';
      sendJson(res, 400, { error: message });
    }
    return;
  }

  if (method === 'POST' && url === '/api/byok/enhance') {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
    if (isRateLimited(ip)) {
      sendJson(res, 429, { error: 'Too many requests. Try again in a minute.' });
      return;
    }
    try {
      const raw = await readBody(req);
      const body = JSON.parse(raw) as {
        request?: Partial<EnhanceRequest>;
        byok?: Partial<ByokConfig>;
      };
      if (!body.request?.originalPrompt || !body.byok?.providerId) {
        sendJson(res, 400, { error: 'originalPrompt and providerId are required' });
        return;
      }
      const result = await enhancePromptWithByok(
        { ...body.request, originalPrompt: body.request.originalPrompt, mode: 'byok' },
        { ...(body.byok as ByokConfig), apiKey: body.byok.apiKey ?? '' }
      );
      sendJson(res, 200, result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Enhancement failed';
      sendJson(res, 400, { error: message });
    }
    return;
  }

  if (
    (url === '/api/me/preferences' || url === '/api/me/profiles') &&
    (method === 'GET' || method === 'PUT' || method === 'POST')
  ) {
    const authHeader = req.headers.authorization;
    const user = await verifySupabaseUser(authHeader);
    if (!user || !authHeader?.startsWith('Bearer ')) {
      sendJson(res, 401, { error: 'Unauthorized' });
      return;
    }
    const token = authHeader.slice(7).trim();

    try {
      if (url === '/api/me/preferences' && method === 'GET') {
        const items = await fetchUserPreferences(token, user.id);
        sendJson(res, 200, { items });
        return;
      }
      if (url === '/api/me/preferences' && method === 'PUT') {
        const body = JSON.parse(await readBody(req)) as { items?: UserInstruction[] };
        if (!Array.isArray(body.items)) {
          sendJson(res, 400, { error: 'items array is required' });
          return;
        }
        await replaceUserPreferences(token, user, body.items);
        sendJson(res, 200, { ok: true });
        return;
      }
      if (url === '/api/me/profiles' && method === 'GET') {
        const profiles = await fetchUserProfiles(token, user.id);
        sendJson(res, 200, { profiles });
        return;
      }
      if (url === '/api/me/profiles' && method === 'POST') {
        const body = JSON.parse(await readBody(req)) as Partial<PromptProfile>;
        if (!body.name || !body.systemGuidance) {
          sendJson(res, 400, { error: 'name and systemGuidance are required' });
          return;
        }
        await insertUserProfile(token, user, {
          name: body.name,
          category: body.category ?? 'feature',
          description: body.description ?? 'Custom user profile',
          systemGuidance: body.systemGuidance
        });
        sendJson(res, 201, { ok: true });
        return;
      }
    } catch (err) {
      sendJson(res, 400, { error: err instanceof Error ? err.message : 'Request failed' });
      return;
    }
  }

  if (
    url?.startsWith('/api/me/keys') &&
    (method === 'GET' || method === 'PUT' || method === 'DELETE')
  ) {
    const authHeader = req.headers.authorization;
    const user = await verifySupabaseUser(authHeader);
    if (!user || !authHeader?.startsWith('Bearer ')) {
      sendJson(res, 401, { error: 'Unauthorized' });
      return;
    }
    const token = authHeader.slice(7).trim();

    try {
      if (method === 'GET') {
        const keys = await fetchUserApiKeys(token, user.id);
        sendJson(res, 200, { keys });
        return;
      }
      if (method === 'PUT') {
        const body = JSON.parse(await readBody(req)) as {
          providerId?: string;
          apiKey?: string;
          baseUrl?: string;
          modelId?: string;
          label?: string;
          skipTest?: boolean;
        };
        if (!body.providerId || !body.apiKey) {
          sendJson(res, 400, { error: 'providerId and apiKey are required' });
          return;
        }

        // Live connection test before saving (matching FreeLLMAPI)
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
            sendJson(res, 400, {
              error: `Provider test failed: ${testErr instanceof Error ? testErr.message : 'Invalid key or connection failed'}`
            });
            return;
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
        sendJson(res, 200, {
          ok: true,
          status: 'healthy',
          model: testResult?.model,
          models: testResult?.models ?? []
        });
        return;
      }
      if (method === 'DELETE') {
        const parsedUrl = new URL(url, 'http://localhost');
        const providerId = parsedUrl.searchParams.get('providerId') || url.split('/').pop();
        if (!providerId || providerId === 'keys') {
          sendJson(res, 400, { error: 'providerId is required' });
          return;
        }
        await deleteUserApiKey(token, user.id, providerId);
        sendJson(res, 200, { ok: true });
        return;
      }
    } catch (err) {
      sendJson(res, 400, { error: err instanceof Error ? err.message : 'Key operation failed' });
      return;
    }
  }

  if (
    url?.startsWith('/api/me/tokens') &&
    (method === 'GET' || method === 'POST' || method === 'DELETE')
  ) {
    const authHeader = req.headers.authorization;
    const user = await verifySupabaseUser(authHeader);
    if (!user || !authHeader?.startsWith('Bearer ')) {
      sendJson(res, 401, { error: 'Unauthorized' });
      return;
    }
    const token = authHeader.slice(7).trim();

    try {
      if (method === 'GET') {
        const tokens = await fetchUserAccessTokens(token, user.id);
        sendJson(res, 200, { tokens });
        return;
      }
      if (method === 'POST') {
        const body = JSON.parse((await readBody(req)) || '{}') as { name?: string };
        const created = await createUserAccessToken(token, user, body.name);
        sendJson(res, 201, created);
        return;
      }
      if (method === 'DELETE') {
        const parsedUrl = new URL(url, 'http://localhost');
        const tokenId = parsedUrl.searchParams.get('id') || url.split('/').pop();
        if (!tokenId || tokenId === 'tokens') {
          sendJson(res, 400, { error: 'tokenId is required' });
          return;
        }
        await revokeUserAccessToken(token, user.id, tokenId);
        sendJson(res, 200, { ok: true });
        return;
      }
    } catch (err) {
      sendJson(res, 400, { error: err instanceof Error ? err.message : 'Token operation failed' });
      return;
    }
  }

  sendJson(res, 404, { error: 'Not found' });
}

export function createServer(): http.Server {
  return http.createServer((req, res) => {
    void handleRequest(req, res);
  });
}

const isMain = process.argv[1]?.endsWith('index.js');
if (isMain) {
  const port = Number(process.env.PORT ?? 4000);
  createServer().listen(port, () => {
    console.log(`PromptPilot API listening on http://localhost:${port}`);
  });
}
