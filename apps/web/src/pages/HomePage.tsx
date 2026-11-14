import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DEFAULT_PLANS, INTEGRATIONS } from '@promptpilot/config';
import { enhancePromptRuleBased } from '@promptpilot/prompt-engine';

const SAMPLE_PROMPTS = [
  'Fix the login page.',
  'Change the UI look.',
  'Make the API faster and add tests.'
];

export function HomePage() {
  const [sampleIdx, setSampleIdx] = useState(0);
  const [showEnhanced, setShowEnhanced] = useState(true);

  const activeSample = SAMPLE_PROMPTS[sampleIdx] ?? SAMPLE_PROMPTS[0] ?? 'Fix the login page.';
  const demoOutput = useMemo(
    () =>
      enhancePromptRuleBased({
        originalPrompt: activeSample,
        mode: 'free',
        targetAgent: 'claude-code'
      }),
    [activeSample]
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 space-y-20">
      <section className="grid lg:grid-cols-2 gap-10 items-start">
        <div className="space-y-6">
          <p className="text-xs font-mono uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
            Developer Prompt Engine
          </p>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
            Turn rough ideas into powerful coding prompts.
          </h1>
          <p className="text-base text-zinc-600 dark:text-zinc-400 leading-relaxed">
            PromptEnhancer turns vague developer instructions into structured, actionable prompts for AI
            coding agents. Run the free rule-based engine with no API key, or paste your own key
            in BYOK mode.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              to="/enhance"
              className="px-4 py-2.5 rounded-md bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-500"
            >
              Open Enhancer
            </Link>
            <Link
              to="/install"
              className="px-4 py-2.5 rounded-md border border-zinc-300 dark:border-zinc-700 text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-900"
            >
              Installation Centre
            </Link>
          </div>
        </div>

        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 dark:border-zinc-800 pb-3">
            <div className="flex gap-1.5">
              {SAMPLE_PROMPTS.map((label, idx) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setSampleIdx(idx)}
                  className={`px-2.5 py-1 rounded text-xs ${
                    idx === sampleIdx
                      ? 'bg-indigo-600 text-white'
                      : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300'
                  }`}
                >
                  Sample {idx + 1}
                </button>
              ))}
            </div>
            <div className="flex gap-1 text-xs">
              <button
                type="button"
                onClick={() => setShowEnhanced(false)}
                className={`px-2.5 py-1 rounded ${
                  !showEnhanced ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900' : 'text-zinc-500'
                }`}
              >
                Original
              </button>
              <button
                type="button"
                onClick={() => setShowEnhanced(true)}
                className={`px-2.5 py-1 rounded ${
                  showEnhanced ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900' : 'text-zinc-500'
                }`}
              >
                Enhanced (Live Rule Engine)
              </button>
            </div>
          </div>

          <pre className="text-xs font-mono whitespace-pre-wrap leading-relaxed text-zinc-800 dark:text-zinc-200 min-h-48">
            {showEnhanced ? demoOutput.enhancedPrompt : demoOutput.originalPrompt}
          </pre>
        </div>
      </section>

      <section className="space-y-6">
        <h2 className="text-2xl font-semibold tracking-tight">How it works</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4 text-sm">
          {[
            '1. Write your rough instruction.',
            '2. Pick Free (No Key) or BYOK.',
            '3. Choose a task profile & agent.',
            '4. Review, Edit, Undo, or Retry.',
            '5. Apply it to your coding agent.'
          ].map((step) => (
            <div
              key={step}
              className="p-4 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900"
            >
              {step}
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-6">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-2xl font-semibold tracking-tight">Integrations</h2>
          <Link to="/install" className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline">
            View setup commands
          </Link>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {INTEGRATIONS.map((item) => (
            <div
              key={item.id}
              className="p-4 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-2"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-sm">{item.name}</span>
                <span className="text-[11px] uppercase px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                  {item.status}
                </span>
              </div>
              <p className="text-xs text-zinc-600 dark:text-zinc-400">{item.summary}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-6">
        <h2 className="text-2xl font-semibold tracking-tight">Modes & Pricing</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {DEFAULT_PLANS.map((plan) => {
            const isDeferred = plan.tier === 'pro' || plan.tier === 'power';
            return (
              <div
                key={plan.tier}
                className="p-5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex flex-col justify-between space-y-4"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-semibold text-sm">{plan.name}</h3>
                    {isDeferred && (
                      <span className="text-[11px] px-2 py-0.5 rounded bg-amber-500/10 text-amber-500">
                        Coming later
                      </span>
                    )}
                  </div>
                  <p className="text-2xl font-bold">₹{plan.priceInrMonthly}/mo</p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    {plan.requiresApiKey
                      ? 'You paste your own API key and pay your provider.'
                      : plan.inferencePayer === 'none'
                        ? 'No API key required. Runs locally.'
                        : 'Managed inference (Razorpay billing coming later).'}
                  </p>
                  <ul className="space-y-1.5 pt-2 text-xs text-zinc-600 dark:text-zinc-300">
                    {plan.features.map((f) => (
                      <li key={f}>• {f}</li>
                    ))}
                  </ul>
                </div>
                {!isDeferred && (
                  <Link
                    to="/enhance"
                    className="block text-center px-3 py-2 rounded bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-500"
                  >
                    Use {plan.tier === 'free' ? 'Free Mode' : 'BYOK Mode'}
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

