import assert from 'node:assert/strict';
import type http from 'node:http';
import { Readable } from 'node:stream';
import test from 'node:test';
import { handleRequest } from './index.js';

async function invoke(method: string, url: string, body?: unknown): Promise<{
  status: number;
  json: Record<string, unknown>;
}> {
  const payload = body === undefined ? '' : JSON.stringify(body);
  const req = Readable.from(payload ? [Buffer.from(payload)] : []) as unknown as http.IncomingMessage;
  req.method = method;
  req.url = url;
  req.headers = {};
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

  const badByok = await invoke('POST', '/api/byok/enhance', {});
  assert.equal(badByok.status, 400);
});
