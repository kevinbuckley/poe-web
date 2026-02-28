# Vercel Deployment

## Setup

1. Import repo into Vercel.
2. Set root directory to `poe-platform/apps/web`.
3. Set env var `NEXT_PUBLIC_API_BASE_URL` to your external API URL.
4. Build command: `pnpm --filter web build`.

## Notes

- Keep API/workers external (Railway/Fly) for stable SSE and background tasks.
