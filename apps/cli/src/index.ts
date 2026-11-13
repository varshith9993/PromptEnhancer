#!/usr/bin/env node
import { parseArgs } from 'node:util';
import {
  BUILTIN_PROFILES,
  BYOK_PROVIDERS,
  enhancePromptRuleBased,
  enhancePromptWithByok,
  type ByokProviderId
} from '@promptpilot/prompt-engine';
import type { TargetAgent } from '@promptpilot/shared';

const HELP = `PromptPilot CLI (v0.1.0)

Usage:
  promptpilot enhance "<prompt>" [--mode free|byok] [--profile <id>] [--agent <agent>]
  promptpilot enhance "<prompt>" --mode byok --provider <id> [--model <model>] [--base-url <url>]
  promptpilot profiles
  promptpilot doctor
  promptpilot --help

Environment (for BYOK without passing --key in shell history):
  PROMPTPILOT_API_KEY   Your AI provider API key
`;

async function run(): Promise<number> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      help: { type: 'boolean', short: 'h', default: false },
      agent: { type: 'string', short: 'a', default: 'generic' },
      mode: { type: 'string', short: 'm', default: 'free' },
      profile: { type: 'string', short: 'p', default: '' },
      provider: { type: 'string', default: 'openrouter' },
      model: { type: 'string', default: '' },
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
    console.log(`Node: ${process.version}`);
    console.log(`Platform: ${process.platform} (${process.arch})`);
    console.log('Free Engine: @promptpilot/prompt-engine ready');
    console.log(`BYOK Providers: ${BYOK_PROVIDERS.map((p) => p.id).join(', ')}`);
    return 0;
  }

  if (command === 'profiles') {
    for (const profile of BUILTIN_PROFILES) {
      console.log(`${profile.id.padEnd(26)} ${profile.name} (${profile.category})`);
    }
    return 0;
  }

  if (command === 'enhance') {
    const prompt = positionals.slice(1).join(' ').trim();
    if (!prompt) {
      console.error('Error: provide a prompt string, e.g. promptpilot enhance "Fix the login page"');
      return 1;
    }

    const baseRequest = {
      originalPrompt: prompt,
      targetAgent: values.agent as TargetAgent,
      ...(values.profile ? { profileId: values.profile } : {})
    };

    if (values.mode === 'free') {
      const result = enhancePromptRuleBased({ ...baseRequest, mode: 'free' });
      console.log(result.enhancedPrompt);
      return 0;
    }

    if (values.mode === 'byok') {
      const apiKey = (values.key || process.env.PROMPTPILOT_API_KEY || '').trim();
      if (!apiKey) {
        console.error('Error: set PROMPTPILOT_API_KEY or pass --key for BYOK mode.');
        return 1;
      }
      const result = await enhancePromptWithByok(
        { ...baseRequest, mode: 'byok' },
        {
          providerId: values.provider as ByokProviderId,
          apiKey,
          ...(values.model ? { modelId: values.model } : {}),
          ...(values['base-url'] ? { baseUrl: values['base-url'] } : {})
        }
      );
      console.log(result.enhancedPrompt);
      return 0;
    }

    console.error(`Mode "${values.mode}" is not supported yet. Use --mode free or --mode byok.`);
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
