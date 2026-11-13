# Setup guide for PromptPilot

PromptPilot runs locally with Node.js 22 and npm. You can use Free rule-based mode without any keys, or paste your own provider key in BYOK mode. Supabase handles Google login and PostgreSQL storage, and Razorpay billing is left for a later phase.

## What you need installed

Check that Node.js 22 or newer and npm are available on your machine.

Windows (PowerShell):

```powershell
node -v
npm -v
```

macOS (Terminal) and Linux (bash):

```bash
node -v
npm -v
```

## Install dependencies and build

Clone or open the repository folder, install packages across the monorepo, and run the initial build.

Windows (PowerShell):

```powershell
cd PromptEnhancer
npm install
npm run build
npm test
```

macOS and Linux:

```bash
cd PromptEnhancer
npm install
npm run build
npm test
```

## Configure environment files

Copy `.env.example` to `.env` at the repository root, and create `apps/web/.env` so Vite can read your public Supabase settings.

Windows (PowerShell):

```powershell
Copy-Item .env.example .env
@"
VITE_API_URL=http://localhost:4000
VITE_SUPABASE_URL=https://rctrcehxxgppvateqcrc.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_kYgxarXfmc9RAm5cX1X_Ug_gD6REbT5
"@ | Set-Content apps/web/.env
```

macOS and Linux:

```bash
cp .env.example .env
cat << 'EOF' > apps/web/.env
VITE_API_URL=http://localhost:4000
VITE_SUPABASE_URL=https://rctrcehxxgppvateqcrc.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_kYgxarXfmc9RAm5cX1X_Ug_gD6REbT5
EOF
```

In the root `.env` file, replace `[YOUR-PASSWORD]` in `DATABASE_URL` with your actual Supabase database password:

```env
DATABASE_URL=postgresql://postgres:[YOUR-PASSWORD]@db.rctrcehxxgppvateqcrc.supabase.co:5432/postgres
```

Leave `OPENROUTER_API_KEY`, `GEMINI_API_KEY`, and the `RAZORPAY_*` fields empty for now.

## Set up Supabase database and Google login

1. Open your Supabase project dashboard and go to the SQL Editor.
2. Copy the contents of `apps/api/src/db/schema.sql` and run it to create the tables.
3. Go to Authentication, then Providers, and enable Google.
4. Add your Google OAuth Client ID and Client Secret from Google Cloud Console.
5. Under Authentication, then URL Configuration, add `http://localhost:5173/enhance` to the Redirect URLs list so Google login redirects back to the enhancer page.

## Run the web app and API

Start the API in one terminal and the Vite web app in a second terminal.

Terminal 1 (Windows, macOS, and Linux):

```bash
npm run start -w @promptpilot/api
```

Terminal 2 (Windows, macOS, and Linux):

```bash
npm run dev -w @promptpilot/web
```

Open `http://localhost:5173` in your browser. Go to `/enhance` to use Free rule-based mode right away, or switch to BYOK mode and paste an API key from OpenRouter, Google Gemini, Groq, NVIDIA NIM, or any HTTPS OpenAI-compatible endpoint. Keys pasted in the web UI stay in tab memory and are never written to `localStorage` or the database.

## Use the CLI on each operating system

After running `npm run build`, you can run the CLI directly from `apps/cli/dist/index.js`.

### Free mode (no API key)

Windows (PowerShell), macOS, and Linux:

```bash
node apps/cli/dist/index.js enhance "Change the UI look"
node apps/cli/dist/index.js enhance "Fix login ///Preserve OAuth flow///" --profile quick-fix --agent claude-code
node apps/cli/dist/index.js profiles
node apps/cli/dist/index.js doctor
```

### BYOK mode (bring your own key)

Set `PROMPTPILOT_API_KEY` in your current shell session instead of passing `--key` as an argument so your key stays out of shell history.

Windows (PowerShell):

```powershell
$env:PROMPTPILOT_API_KEY="paste-your-key-here"
node apps/cli/dist/index.js enhance "Fix the login page" --mode byok --provider openrouter
```

macOS (zsh) and Linux (bash):

```bash
export PROMPTPILOT_API_KEY="paste-your-key-here"
node apps/cli/dist/index.js enhance "Fix the login page" --mode byok --provider openrouter
```

To clear the key from your current terminal session when you are done:

Windows (PowerShell):

```powershell
Remove-Item Env:PROMPTPILOT_API_KEY
```

macOS and Linux:

```bash
unset PROMPTPILOT_API_KEY
```

