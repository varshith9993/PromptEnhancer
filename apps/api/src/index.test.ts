import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { createServer } from './index.js';

test('API core routes: /health, /api/plans, /api/enhance, and 401 on protected route', async () => {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const healthRes = await fetch(`${baseUrl}/health`);
    assert.equal(healthRes.status, 200);
    const healthJson = (await healthRes.json()) as { ok: boolean };
    assert.equal(healthJson.ok, true);

    const plansRes = await fetch(`${baseUrl}/api/plans`);
    assert.equal(plansRes.status, 200);
    const plansJson = (await plansRes.json()) as { plans: unknown[] };
    assert.ok(plansJson.plans.length >= 4);

    const enhanceRes = await fetch(`${baseUrl}/api/enhance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ originalPrompt: 'Change the UI look ///Keep it minimal///' })
    });
    assert.equal(enhanceRes.status, 200);
    const enhanceJson = (await enhanceRes.json()) as { enhancedPrompt: string };
    assert.match(enhanceJson.enhancedPrompt, /## Objective/);
    assert.match(enhanceJson.enhancedPrompt, /Keep it minimal/);

    const unauthRes = await fetch(`${baseUrl}/api/me/preferences`);
    assert.equal(unauthRes.status, 401);

    const badByokRes = await fetch(`${baseUrl}/api/byok/enhance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    assert.equal(badByokRes.status, 400);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve()))
    );
  }
});
