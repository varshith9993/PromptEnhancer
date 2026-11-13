import http from 'node:http';
import { DEFAULT_PLANS, INTEGRATIONS } from '@promptpilot/config';
import {
  BUILTIN_PROFILES,
  BYOK_PROVIDERS,
  enhancePromptRuleBased,
  enhancePromptWithByok,
  testByokConnection,
  type ByokConfig
} from '@promptpilot/prompt-engine';
import type { EnhanceRequest, PromptProfile, UserInstruction } from '@promptpilot/shared';
import {
  fetchUserPreferences,
  fetchUserProfiles,
  insertUserProfile,
  replaceUserPreferences,
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
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
    if (isRateLimited(ip)) {
      sendJson(res, 429, { error: 'Too many requests. Try again in a minute.' });
      return;
    }
    try {
      const raw = await readBody(req);
      const parsed = JSON.parse(raw) as Partial<EnhanceRequest>;
      if (!parsed.originalPrompt || typeof parsed.originalPrompt !== 'string') {
        sendJson(res, 400, { error: 'originalPrompt is required' });
        return;
      }
      if (parsed.originalPrompt.length > 10_000) {
        sendJson(res, 400, { error: 'Prompt too long (max 10,000 characters)' });
        return;
      }
      const result = enhancePromptRuleBased({
        ...parsed,
        originalPrompt: parsed.originalPrompt,
        mode: 'free'
      });
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
