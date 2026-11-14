import assert from 'node:assert/strict';
import type http from 'node:http';
import { Readable } from 'node:stream';
import test from 'node:test';
import { handleRequest } from './index.js';
import { decryptApiKey, encryptApiKey, generatePromptPilotToken, hashToken } from './crypto.js';

async function invoke(
  method: string,
  url: string,
  body?: unknown,
  headers?: Record<string, string>
): Promise<{
  status: number;
  headers: Record<string, string>;
  json: Record<string, unknown>;
}> {
  const payload = body === undefined ? '' : JSON.stringify(body);
  const req = Readable.from(payload ? [Buffer.from(payload)] : []) as unknown as http.IncomingMessage;
  req.method = method;
  req.url = url;
  req.headers = { ...(headers ?? {}) };
  (req as unknown as { socket: { remoteAddress: string } }).socket = { remoteAddress: '127.0.0.1' };

  let status = 200;
  const outHeaders: Record<string, string> = {};
  let raw = '';
  const res = {
    setHeader(key: string, val: string) {
      outHeaders[key.toLowerCase()] = val;
    },
    writeHead(code: number) {
      status = code;
    },
    end(chunk?: string) {
      if (chunk) raw += chunk;
    }
  } as unknown as http.ServerResponse;

  await handleRequest(req, res);
  return { status, headers: outHeaders, json: raw ? (JSON.parse(raw) as Record<string, unknown>) : {} };
}

test('API core routes: /health, /api/plans, /api/enhance, and 401 on protected route', async () => {
  const health = await invoke('GET', '/health');
  assert.equal(health.status, 200);
  assert.equal(health.json.ok, true);

  const plans = await invoke('GET', '/api/plans');
  assert.equal(plans.status, 200);
  assert.ok(Array.isArray(plans.json.plans) && plans.json.plans.length >= 4);

  const enhance = await invoke('POST', '/api/enhance', {
    originalPrompt: 'Change the UI look ///Keep it minimal///'
  });
  assert.equal(enhance.status, 200);
  assert.match(String(enhance.json.enhancedPrompt), /## Objective/);
  assert.match(String(enhance.json.enhancedPrompt), /Keep it minimal/);

  const unauth = await invoke('GET', '/api/me/preferences');
  assert.equal(unauth.status, 401);

  const unauthKeys = await invoke('GET', '/api/me/keys');
  assert.equal(unauthKeys.status, 401);

  const unauthTokens = await invoke('GET', '/api/me/tokens');
  assert.equal(unauthTokens.status, 401);

  const badByok = await invoke('POST', '/api/byok/enhance', {});
  assert.equal(badByok.status, 400);
});

test('crypto: AES-256-GCM encryption, decryption and PromptPilot token generation', () => {
  const secretKey = 'sk-or-v1-my-secret-openrouter-key-123456';
  const enc = encryptApiKey(secretKey);
  assert.notEqual(enc.encrypted, secretKey);
  assert.ok(enc.iv && enc.authTag);

  const dec = decryptApiKey(enc);
  assert.equal(dec, secretKey);

  const { token, prefix, hash } = generatePromptPilotToken();
  assert.match(token, /^pp_live_[a-f0-9]{48}$/);
  assert.match(prefix, /^pp_live_[a-f0-9]{6}\.\.\.[a-f0-9]{4}$/);
  assert.equal(hashToken(token), hash);
});

test('User API keys and personal access tokens lifecycle: create, list, authenticate, and manage', async () => {
  const tokenRes = await invoke(
    'POST',
    '/api/me/tokens',
    { name: 'Integration Test Key' },
    { authorization: 'Bearer local-token' }
  );
  assert.equal(tokenRes.status, 201);
  const pat = String(tokenRes.json.token);
  assert.match(pat, /^pp_live_/);

  const listTokens = await invoke('GET', '/api/me/tokens', undefined, {
    authorization: `Bearer ${pat}`
  });
  assert.equal(listTokens.status, 200);
  assert.ok(Array.isArray(listTokens.json.tokens));

  const saveKey = await invoke(
    'PUT',
    '/api/me/keys',
    {
      providerId: 'openrouter',
      apiKey: 'sk-or-test-mock-key-12345',
      modelId: 'qwen/qwen-2.5-coder-32b-instruct',
      label: 'Testing Key',
      skipTest: true
    },
    { authorization: `Bearer ${pat}` }
  );
  assert.equal(saveKey.status, 200);
  assert.equal(saveKey.json.ok, true);

  const listKeys = await invoke('GET', '/api/me/keys', undefined, {
    authorization: `Bearer ${pat}`
  });
  assert.equal(listKeys.status, 200);
  const keys = listKeys.json.keys as Array<{ providerId: string; status: string; enabled: boolean }>;
  assert.ok(keys.some((k) => k.providerId === 'openrouter' && k.status === 'healthy' && k.enabled === true));

  // Toggle key enabled -> false
  const patchRes = await invoke(
    'PATCH',
    '/api/me/keys',
    { providerId: 'openrouter', enabled: false },
    { authorization: `Bearer ${pat}` }
  );
  assert.equal(patchRes.status, 200);
  assert.equal(patchRes.json.ok, true);

  const deleteKey = await invoke(
    'DELETE',
    '/api/me/keys?providerId=openrouter',
    undefined,
    { authorization: `Bearer ${pat}` }
  );
  assert.equal(deleteKey.status, 200);
  assert.equal(deleteKey.json.ok, true);
});

test('CORS handles dynamic localhost/127.0.0.1 ports and methods PATCH/DELETE', async () => {
  const optionsRes = await invoke('OPTIONS', '/api/me/keys', undefined, {
    origin: 'http://localhost:5174'
  });
  assert.equal(optionsRes.status, 204);
  assert.equal(optionsRes.headers['access-control-allow-origin'], 'http://localhost:5174');
  assert.match(optionsRes.headers['access-control-allow-methods'], /PATCH/);
  assert.match(optionsRes.headers['access-control-allow-methods'], /DELETE/);

  const ipOriginRes = await invoke('OPTIONS', '/api/enhance', undefined, {
    origin: 'http://127.0.0.1:3000'
  });
  assert.equal(ipOriginRes.status, 204);
  assert.equal(ipOriginRes.headers['access-control-allow-origin'], 'http://127.0.0.1:3000');
});

test('Offline SQLite fallback for user preferences and user profiles', async () => {
  // Put preferences
  const savePrefs = await invoke(
    'PUT',
    '/api/me/preferences',
    { items: [{ id: 'pref-1', text: 'Prefer TypeScript strict mode', enabled: true, isDefault: true }] },
    { authorization: 'Bearer local-token' }
  );
  assert.equal(savePrefs.status, 200);

  // Get preferences
  const getPrefs = await invoke('GET', '/api/me/preferences', undefined, {
    authorization: 'Bearer local-token'
  });
  assert.equal(getPrefs.status, 200);
  const items = getPrefs.json.items as Array<{ text: string; enabled: boolean }>;
  assert.ok(items.some((i) => i.text === 'Prefer TypeScript strict mode'));

  // Post profile
  const saveProf = await invoke(
    'POST',
    '/api/me/profiles',
    {
      name: 'Custom Team Profile',
      category: 'feature',
      description: 'Profile for internal team',
      systemGuidance: 'Follow project style guide rigorously.'
    },
    { authorization: 'Bearer local-token' }
  );
  assert.equal(saveProf.status, 201);

  // Get profiles
  const getProf = await invoke('GET', '/api/me/profiles', undefined, {
    authorization: 'Bearer local-token'
  });
  assert.equal(getProf.status, 200);
  const profiles = getProf.json.profiles as Array<{ name: string; systemGuidance: string }>;
  assert.ok(profiles.some((p) => p.name === 'Custom Team Profile'));
});
