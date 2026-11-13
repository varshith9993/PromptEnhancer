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
import type { EnhanceRequest } from '@promptpilot/shared';

const WEB_ORIGIN = process.env.WEB_ORIGIN ?? 'http://localhost:5173';

function setCors(res: http.ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', WEB_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
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
export function createServer(): http.Server {
  return http.createServer(async (req, res) => {
    const method = req.method ?? 'GET';
    const url = req.url ?? '/';

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
      try {
        const raw = await readBody(req);
        const parsed = JSON.parse(raw) as Partial<EnhanceRequest>;
        if (!parsed.originalPrompt || typeof parsed.originalPrompt !== 'string') {
          sendJson(res, 400, { error: 'originalPrompt is required' });
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

    sendJson(res, 404, { error: 'Not found' });
  });
}

const isMain = process.argv[1]?.endsWith('index.js');
if (isMain) {
  const port = Number(process.env.PORT ?? 4000);
  createServer().listen(port, () => {
    console.log(`PromptPilot API listening on http://localhost:${port}`);
  });
}
