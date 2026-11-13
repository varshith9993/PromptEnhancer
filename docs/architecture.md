# PromptPilot Architecture

## 1. Repository Analysis

- **Initial State**: Empty repository with only `.git` and a placeholder `README.md`.
- **Runtime**: Node.js `v22.19.0`, npm `11.12.1`. (`pnpm` is not installed globally, so npm workspaces are used for zero-friction workspace linking.)

## 2. Core Components

1. **Web (`apps/web`)**: React + TypeScript + Vite + Tailwind CSS + React Router (Phase 2–3).
2. **API (`apps/api`)**: Node.js TypeScript REST API (`node:http` in Phase 1; Fastify + Zod in Phase 2–8) + PostgreSQL.
3. **CLI (`apps/cli`)**: Lightweight Node.js TypeScript CLI sharing `@promptpilot/prompt-engine`.
4. **Shared Packages (`packages/*`)**:
   - `@promptpilot/shared`: Domain types for modes, categories, requests/responses, plans, integrations.
   - `@promptpilot/config`: Configurable pricing tiers and honest integration status registry.
   - `@promptpilot/prompt-engine`: Core enhancement engine (rule-based in Phase 1/4; provider-agnostic AI orchestration in Phase 5/8).

## 3. Security & Privacy Boundaries

- **BYOK**: Keys are stored in OS credential stores via CLI and sent directly from local CLI to the user's chosen provider—never persisted in the website database.
- **Managed AI**: Master provider keys stay strictly on the backend behind auth, rate limits, and subscription quota checks.
- **Payments**: Razorpay subscriptions and webhooks are verified server-side using raw-body HMAC signatures and idempotent event IDs.

