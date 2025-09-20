# Repository Guidelines

## Project Structure & Module Organization
The Next.js app directory lives in `app/`, with `page.tsx` and route segments for user flows. Shared UI pieces belong in `components/` and should stay framework-agnostic. Domain logic is split under `lib/`: `lib/orchestration` coordinates multi-agent conversations, `lib/providers` wraps OpenAI and mock adapters, and `lib/store` tracks session state. Static assets sit in `public/`. End-to-end specs live in `tests/`, and `middleware.ts` wires session cookies for the Playwright flows.

## Build, Test, and Development Commands
- `npm run dev` — start the Turbopack dev server at `http://localhost:3000`.
- `npm run build` — produce the production bundle; runs type checks and bundling.
- `npm run start` — serve the built app locally for smoke tests.
- `npm run lint` — run ESLint with the Next.js config; add `--fix` before committing.
- `npm run test:e2e` — execute the Playwright suite using projects defined in `playwright.config.ts`.
- `pnpm test:e2e --project=chromium-real` — optional real API regression pass referenced in `README.md`.

## Coding Style & Naming Conventions
Use TypeScript throughout and favor functional components. Match the existing two-space indentation, keep semicolons, and prefer double quotes in JSX. Components and hooks use PascalCase filenames (`PanelHeader.tsx`, `useSession.ts`). Utility modules in `lib/` use camelCase exports. Run `npm run lint -- --fix` to enforce formatting before opening a pull request.

## Testing Guidelines
Playwright specs live in `tests/*.spec.ts`; name tests with user-focused scenarios (e.g., `test('start finance panel')`). Local runs assume `http://localhost:3000`, but you can override with `PLAYWRIGHT_BASE_URL`. Seed auth by reusing the helpers in existing specs, and capture screenshots on failure with `npx playwright test --trace on`. Add new specs when altering conversation orchestration or session flows.

## Commit & Pull Request Guidelines
Git history favors short, present-tense subjects (`session update`, `fixing unfurl`). Keep subjects under 60 characters, include context in the body if behavior changes, and reference issue numbers when available. Pull requests should outline the change, note impacted routes or providers, and include evidence of lint/tests. Attach UI screenshots or recorded runs for user-facing tweaks.

## Security & Configuration Tips
Required secrets are defined in `env.d.ts`; at minimum set `OPENAI_API_KEY`, plus `REDIS_URL`/`REDIS_TOKEN` when using Upstash. Store secrets in `.env.local` and never commit them. Regenerate keys if logged or shared. When adding providers, extend `env.d.ts` and document any new variables here.
