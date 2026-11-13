import { execFile } from 'node:child_process';
import { chmod, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import type { ByokProviderId } from '@promptpilot/prompt-engine';
import type { TargetAgent } from '@promptpilot/shared';

const execFileAsync = promisify(execFile);

export interface CliConfig {
  mode: 'free' | 'byok';
  provider: ByokProviderId;
  model: string;
  agent: TargetAgent;
  profile: string;
  token?: string | undefined;
  apiUrl?: string | undefined;
}

const DEFAULT_CONFIG: CliConfig = {
  mode: 'free',
  provider: 'freellmapi',
  model: 'auto',
  agent: 'generic',
  profile: '',
  apiUrl: 'http://localhost:4000'
};

function configDir(): string {
  return path.join(os.homedir(), '.promptpilot');
}

function configPath(): string {
  return path.join(configDir(), 'config.json');
}

export async function loadCliConfig(): Promise<CliConfig> {
  try {
    const raw = await readFile(configPath(), 'utf8');
    return { ...DEFAULT_CONFIG, ...(JSON.parse(raw) as Partial<CliConfig>) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export async function saveCliConfig(next: CliConfig): Promise<void> {
  await mkdir(configDir(), { recursive: true });
  await writeFile(configPath(), JSON.stringify(next, null, 2), 'utf8');
}

function dpapiKeyPath(provider: string): string {
  const safe = provider.replace(/[^a-z0-9_-]/gi, '');
  return path.join(configDir(), 'keys', `${safe}.dpapi`);
}

export async function setProviderKey(provider: string, apiKey: string): Promise<void> {
  const trimmed = apiKey.trim();
  if (!trimmed) throw new Error('API key cannot be empty.');

  if (process.platform === 'win32') {
    const keysDir = path.join(configDir(), 'keys');
    await mkdir(keysDir, { recursive: true });
    const { stdout } = await execFileAsync(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        '$sec = ConvertTo-SecureString $env:PP_KEY -AsPlainText -Force; ConvertFrom-SecureString $sec'
      ],
      { env: { ...process.env, PP_KEY: trimmed } }
    );
    await writeFile(dpapiKeyPath(provider), stdout.trim(), { encoding: 'utf8', mode: 0o600 });
    return;
  }

  if (process.platform === 'darwin') {
    await execFileAsync('security', [
      'add-generic-password',
      '-U',
      '-a',
      'promptpilot',
      '-s',
      `promptpilot-${provider}`,
      '-w',
      trimmed
    ]);
    return;
  }

  // Linux Secret Service (libsecret)
  const child = execFile('secret-tool', [
    'store',
    `--label=PromptPilot (${provider})`,
    'service',
    'promptpilot',
    'provider',
    provider
  ]);
  await new Promise<void>((resolve, reject) => {
    child.on('error', () =>
      reject(new Error('secret-tool not found. Set PROMPTPILOT_API_KEY in your shell instead.'))
    );
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error('Failed to store key in Secret Service.'))
    );
    child.stdin?.end(trimmed);
  });
}

export async function tryReadLocalFreeLlmApiKey(): Promise<string> {
  try {
    const appData =
      process.env.APPDATA ||
      (process.platform === 'darwin'
        ? path.join(os.homedir(), 'Library', 'Application Support')
        : path.join(os.homedir(), '.config'));
    const dbPath = path.join(appData, 'FreeLLMAPI', 'freeapi.db');
    const { existsSync } = await import('node:fs');
    if (!existsSync(dbPath)) return '';
    const { DatabaseSync } = (await import('node:sqlite')) as {
      DatabaseSync: new (
        path: string,
        opts?: { readOnly?: boolean }
      ) => { prepare: (sql: string) => { get: () => unknown } };
    };
    const db = new DatabaseSync(dbPath, { readOnly: true });
    const row = db.prepare("SELECT value FROM settings WHERE key='unified_api_key'").get() as
      | { value?: string }
      | undefined;
    return row?.value?.trim() ?? '';
  } catch {
    return '';
  }
}

export async function getProviderKey(provider: string): Promise<string | null> {
  if (provider === 'freellmapi') {
    const auto = await tryReadLocalFreeLlmApiKey();
    if (auto) return auto;
  }

  if (process.platform === 'win32') {
    try {
      const encrypted = (await readFile(dpapiKeyPath(provider), 'utf8')).trim();
      if (!encrypted) return null;
      const { stdout } = await execFileAsync(
        'powershell',
        [
          '-NoProfile',
          '-Command',
          '$sec = ConvertTo-SecureString $env:PP_ENC; $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec); [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)'
        ],
        { env: { ...process.env, PP_ENC: encrypted } }
      );
      return stdout.trim() || null;
    } catch {
      return null;
    }
  }

  if (process.platform === 'darwin') {
    try {
      const { stdout } = await execFileAsync('security', [
        'find-generic-password',
        '-a',
        'promptpilot',
        '-s',
        `promptpilot-${provider}`,
        '-w'
      ]);
      return stdout.trim() || null;
    } catch {
      return null;
    }
  }

  try {
    const { stdout } = await execFileAsync('secret-tool', [
      'lookup',
      'service',
      'promptpilot',
      'provider',
      provider
    ]);
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

export async function clearProviderKey(provider: string): Promise<void> {
  if (process.platform === 'win32') {
    try {
      await chmod(dpapiKeyPath(provider), 0o600);
      await unlink(dpapiKeyPath(provider));
    } catch {
      // ignore if absent
    }
    return;
  }

  if (process.platform === 'darwin') {
    try {
      await execFileAsync('security', [
        'delete-generic-password',
        '-a',
        'promptpilot',
        '-s',
        `promptpilot-${provider}`
      ]);
    } catch {
      // ignore if absent
    }
    return;
  }

  try {
    await execFileAsync('secret-tool', ['clear', 'service', 'promptpilot', 'provider', provider]);
  } catch {
    // ignore if absent
  }
}

