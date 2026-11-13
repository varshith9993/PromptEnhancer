import { useState } from 'react';
import { INTEGRATIONS } from '@promptpilot/config';
import type { TargetAgent } from '@promptpilot/shared';

type OsKind = 'windows' | 'macos' | 'linux';

function detectOs(): OsKind {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('win')) return 'windows';
  if (ua.includes('mac')) return 'macos';
  return 'linux';
}

function CopyBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-900 text-zinc-100 p-3 text-xs font-mono overflow-x-auto">
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard.writeText(code);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="absolute top-2 right-2 px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-[11px]"
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
      <pre className="pr-14 whitespace-pre-wrap">{code}</pre>
    </div>
  );
}

export function InstallPage() {
  const [os, setOs] = useState<OsKind>(detectOs);
  const [editor, setEditor] = useState<TargetAgent>('generic');

  const selected = INTEGRATIONS.find((i) => i.id === editor) ?? INTEGRATIONS[0]!;

  const localRunCmd =
    os === 'windows'
      ? `git clone https://github.com/varshith9993/PromptEnhancer.git\ncd PromptEnhancer\nnpm install\nnpm run build\nnode apps/cli/dist/index.js enhance "Change the UI look"`
      : `git clone https://github.com/varshith9993/PromptEnhancer.git\ncd PromptEnhancer\nnpm install\nnpm run build\nnode apps/cli/dist/index.js enhance "Change the UI look"`;

  const editorCmd =
    editor === 'claude-code'
      ? os === 'windows'
        ? `mkdir -Force "$HOME\\.claude\\commands"\nCopy-Item integrations\\claude-code\\promptpilot-enhance.md "$HOME\\.claude\\commands\\promptpilot-enhance.md"\n# Then in Claude Code run:\n# /promptpilot-enhance Change the UI look ///Make it minimal///`
        : `mkdir -p ~/.claude/commands\ncp integrations/claude-code/promptpilot-enhance.md ~/.claude/commands/promptpilot-enhance.md\n# Then in Claude Code run:\n# /promptpilot-enhance Change the UI look ///Make it minimal///`
      : editor === 'antigravity'
        ? os === 'windows'
          ? `mkdir -Force "$HOME\\.gemini\\config\\skills\\promptpilot-enhance"\nCopy-Item integrations\\antigravity\\promptpilot-enhance\\SKILL.md "$HOME\\.gemini\\config\\skills\\promptpilot-enhance\\SKILL.md"`
          : `mkdir -p ~/.gemini/config/skills/promptpilot-enhance\ncp integrations/antigravity/promptpilot-enhance/SKILL.md ~/.gemini/config/skills/promptpilot-enhance/SKILL.md`
        : os === 'windows'
          ? `. .\\integrations\\generic\\PromptPilot.ps1\nenhance "Change the UI look ///Make it minimal///"`
          : `source ./integrations/generic/promptpilot.sh\nenhance "Change the UI look ///Make it minimal///"`;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Installation Centre</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Pick your operating system and coding environment to see verified local setup steps.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4 text-xs">
        <div className="space-y-1.5">
          <span className="text-zinc-500 dark:text-zinc-400">Operating System</span>
          <div className="flex gap-2">
            {(['windows', 'macos', 'linux'] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setOs(item)}
                className={`px-3 py-1.5 rounded border capitalize ${
                  os === item
                    ? 'border-indigo-500 bg-indigo-600 text-white'
                    : 'border-zinc-300 dark:border-zinc-700'
                }`}
              >
                {item === 'macos' ? 'macOS' : item}
              </button>
            ))}
          </div>
        </div>

        <label className="space-y-1.5 block">
          <span className="text-zinc-500 dark:text-zinc-400">Target Editor / Agent</span>
          <select
            value={editor}
            onChange={(e) => setEditor(e.target.value as TargetAgent)}
            className="w-full px-3 py-2 rounded border border-zinc-300 dark:border-zinc-700 bg-transparent"
          >
            {INTEGRATIONS.map((item) => (
              <option key={item.id} value={item.id} className="bg-zinc-900 text-zinc-100">
                {item.name} ({item.status})
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="p-5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-6 text-sm">
        <div className="flex items-center justify-between gap-2 border-b border-zinc-200 dark:border-zinc-800 pb-3">
          <div>
            <h2 className="font-semibold">{selected.name}</h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">{selected.summary}</p>
          </div>
          <span className="text-[11px] uppercase px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800">
            Status: {selected.status}
          </span>
        </div>

        <div className="space-y-2">
          <h3 className="font-medium text-xs uppercase tracking-wider text-zinc-500">
            1. Prerequisites ({os === 'macos' ? 'macOS' : os})
          </h3>
          <p className="text-xs text-zinc-600 dark:text-zinc-300">
            Node.js 22+ and npm 10+ installed on your machine.
          </p>
        </div>

        <div className="space-y-2">
          <h3 className="font-medium text-xs uppercase tracking-wider text-zinc-500">
            2. Build & Run Free Rule-Based CLI
          </h3>
          <CopyBlock code={localRunCmd} />
        </div>

        <div className="space-y-2">
          <h3 className="font-medium text-xs uppercase tracking-wider text-zinc-500">
            3. Activate {selected.name} (/enhance &amp; ///...///)
          </h3>
          <CopyBlock code={editorCmd} />
        </div>

        <div className="space-y-2">
          <h3 className="font-medium text-xs uppercase tracking-wider text-zinc-500">
            4. Diagnostics & Troubleshooting
          </h3>
          <CopyBlock code="node apps/cli/dist/index.js doctor" />
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Note: Dedicated editor plugins (such as Claude Code slash commands and VS Code
            extensions) are currently marked as <strong>{selected.status}</strong> until packaged
            and verified. Use the CLI or Web Enhancer with clipboard Apply in the meantime.
          </p>
        </div>
      </div>
    </div>
  );
}

