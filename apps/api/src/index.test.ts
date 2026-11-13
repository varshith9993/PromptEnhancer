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
  json: Record<string, unknown>;
}> {
  const payload = body === undefined ? '' : JSON.stringify(body);
  const req = Readable.from(payload ? [Buffer.from(payload)] : []) as unknown as http.IncomingMessage;
  req.method = method;
  req.url = url;
  req.headers = { ...(headers ?? {}) };
  (req as unknown as { socket: { remoteAddress: string } }).socket = { remoteAddress: '127.0.0.1' };

  let status = 200;
  let raw = '';
  const res = {
    setHeader() {},
    writeHead(code: number) {
      status = code;
    },
    end(chunk?: string) {
      if (chunk) raw += chunk;
    }
  } as unknown as http.ServerResponse;

  await handleRequest(req, res);
  return { status, json: raw ? (JSON.parse(raw) as Record<string, unknown>) : {} };
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
  const keys = listKeys.json.keys as Array<{ providerId: string; status: string }>;
  assert.ok(keys.some((k) => k.providerId === 'openrouter' && k.status === 'healthy'));

  const deleteKey = await invoke(
    'DELETE',
    '/api/me/keys?providerId=openrouter',
    undefined,
    { authorization: `Bearer ${pat}` }
  );
  assert.equal(deleteKey.status, 200);
  assert.equal(deleteKey.json.ok, true);
});
