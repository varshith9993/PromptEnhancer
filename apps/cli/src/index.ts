#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import {
  BUILTIN_PROFILES,
  BYOK_PROVIDERS,
  enhancePromptRuleBased,
  enhancePromptWithByok,
  type ByokProviderId
} from '@promptpilot/prompt-engine';
import type { TargetAgent } from '@promptpilot/shared';
import {
  clearProviderKey,
  getProviderKey,
  loadCliConfig,
  saveCliConfig,
  setProviderKey,
  type CliConfig
} from './store.js';

const HELP = `PromptPilot CLI (v0.1.0)

Usage:
  promptpilot enhance "<prompt>" [--mode free|byok] [--provider <id>] [--model <id>] [--profile <id>] [--agent <agent>]
  promptpilot enhance --file <path> [options]
  promptpilot config
  promptpilot config set <mode|provider|model|agent|profile> <value>
  promptpilot key set <provider>
  promptpilot key status <provider>
  promptpilot key clear <provider>
  promptpilot setup
  promptpilot profiles
  promptpilot doctor
  promptpilot --help
`;

async function promptLine(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

async function handleConfig(args: string[]): Promise<number> {
  const cfg = await loadCliConfig();
  if (args.length === 0) {
    console.log(JSON.stringify(cfg, null, 2));
    return 0;
  }
  if (args[0] === 'set' && args[1] && args[2] !== undefined) {
    const key = args[1] as keyof CliConfig;
    const val = args[2];
    if (key === 'mode' && val !== 'free' && val !== 'byok') {
      console.error('mode must be "free" or "byok".');
      return 1;
    }
    if (key === 'provider' && !BYOK_PROVIDERS.some((p) => p.id === val)) {
      console.error(`Unknown provider "${val}".`);
      return 1;
    }
    const validKeys: Array<keyof CliConfig> = ['mode', 'provider', 'model', 'agent', 'profile'];
    if (!validKeys.includes(key)) {
      console.error(`Unknown config key "${key}".`);
      return 1;
    }
    const next = { ...cfg, [key]: val } as CliConfig;
    await saveCliConfig(next);
    console.log(`Updated ${key} = ${val}`);
    return 0;
  }
  console.error('Usage: promptpilot config | promptpilot config set <key> <value>');
  return 1;
}

async function handleKey(args: string[], flagKey: string): Promise<number> {
  const action = args[0];
  const provider = args[1];
  if (!action || !provider) {
    console.error('Usage: promptpilot key <set|status|clear> <provider>');
    return 1;
  }
  if (!BYOK_PROVIDERS.some((p) => p.id === provider)) {
    console.error(`Unknown provider "${provider}".`);
    return 1;
  }
  if (action === 'set') {
    const secret =
      flagKey.trim() ||
      (process.env.PROMPTPILOT_API_KEY ?? '').trim() ||
      (await promptLine(`Paste API key for ${provider}: `));
    if (!secret) {
      console.error('Error: empty API key.');
      return 1;
    }
    await setProviderKey(provider, secret);
    console.log(`Saved API key for ${provider} in OS credential store.`);
    return 0;
  }
  if (action === 'status') {
    const stored = await getProviderKey(provider);
    console.log(`${provider}: ${stored ? 'configured in OS credential store' : 'not stored'}`);
    return 0;
  }
  if (action === 'clear') {
    await clearProviderKey(provider);
    console.log(`Cleared stored API key for ${provider}.`);
    return 0;
  }
  console.error('Usage: promptpilot key <set|status|clear> <provider>');
  return 1;
}

async function run(): Promise<number> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      help: { type: 'boolean', short: 'h', default: false },
      agent: { type: 'string', short: 'a', default: '' },
      mode: { type: 'string', short: 'm', default: '' },
      profile: { type: 'string', short: 'p', default: '' },
      provider: { type: 'string', default: '' },
      model: { type: 'string', default: '' },
      file: { type: 'string', short: 'f', default: '' },
      extra: { type: 'string', default: '' },
      key: { type: 'string', default: '' },
      'base-url': { type: 'string', default: '' }
    }
  });

  if (values.help || positionals.length === 0) {
    console.log(HELP);
    return 0;
  }

  const command = positionals[0];

  if (command === 'doctor') {
    const cfg = await loadCliConfig();
    console.log(`Node: ${process.version}`);
    console.log(`Platform: ${process.platform} (${process.arch})`);
    console.log(`Default Mode: ${cfg.mode} | Provider: ${cfg.provider}`);
    console.log(`Available Providers: ${BYOK_PROVIDERS.map((p) => p.id).join(', ')}`);
    return 0;
  }

  if (command === 'setup') {
    const cfg = await loadCliConfig();
    console.log('PromptPilot CLI Setup');
    console.log(`Current config: mode=${cfg.mode}, provider=${cfg.provider}, agent=${cfg.agent}`);
    console.log('1. Free mode: promptpilot config set mode free');
    console.log('2. No-key LLM: promptpilot enhance "Fix bug" --mode byok --provider aihorde');
    console.log('3. Keyed BYOK: promptpilot key set gemini && promptpilot config set mode byok');
    return 0;
  }

  if (command === 'profiles') {
    for (const profile of BUILTIN_PROFILES) {
      console.log(`${profile.id.padEnd(26)} ${profile.name} (${profile.category})`);
    }
    return 0;
  }

  if (command === 'config') {
    return handleConfig(positionals.slice(1));
  }

  if (command === 'key') {
    return handleKey(positionals.slice(1), values.key);
  }

  if (command === 'enhance') {
    const cfg = await loadCliConfig();
    const promptText = values.file
      ? (await readFile(values.file, 'utf8')).trim()
      : positionals.slice(1).join(' ').trim();

    if (!promptText) {
      console.error('Error: provide a prompt string or --file <path>.');
      return 1;
    }

    const activeMode = (values.mode || cfg.mode) as 'free' | 'byok';
    const activeAgent = (values.agent || cfg.agent || 'generic') as TargetAgent;
    const activeProfile = values.profile || cfg.profile;
    const activeProvider = (values.provider || cfg.provider || 'aihorde') as ByokProviderId;
    const activeModel = values.model || cfg.model;

    const baseRequest = {
      originalPrompt: promptText,
      targetAgent: activeAgent,
      ...(activeProfile ? { profileId: activeProfile } : {}),
      ...(values.extra ? { additionalInstructions: values.extra } : {})
    };

    if (activeMode === 'free') {
      const result = enhancePromptRuleBased({ ...baseRequest, mode: 'free' });
      console.log(result.enhancedPrompt);
      return 0;
    }

    if (activeMode === 'byok') {
      const meta = BYOK_PROVIDERS.find((p) => p.id === activeProvider);
      if (!meta) {
        console.error(`Unknown provider "${activeProvider}".`);
        return 1;
      }
      const apiKey =
        values.key.trim() ||
        (process.env.PROMPTPILOT_API_KEY ?? '').trim() ||
        (await getProviderKey(activeProvider)) ||
        '';

      if (meta.requiresKey && !apiKey) {
        console.error(
          `Error: no API key found for ${activeProvider}. Run "promptpilot key set ${activeProvider}" or set PROMPTPILOT_API_KEY.`
        );
        return 1;
      }

      const result = await enhancePromptWithByok(
        { ...baseRequest, mode: 'byok' },
        {
          providerId: activeProvider,
          apiKey,
          ...(activeModel ? { modelId: activeModel } : {}),
          ...(values['base-url'] ? { baseUrl: values['base-url'] } : {})
        }
      );
      console.log(result.enhancedPrompt);
      return 0;
    }

    console.error(`Unsupported mode "${activeMode}". Use free or byok.`);
    return 1;
  }

  console.error(`Unknown command: ${command}\n`);
  console.log(HELP);
  return 1;
}

run()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err) => {
    console.error(err instanceof Error ? err.message : 'Unexpected CLI error');
    process.exitCode = 1;
  });
