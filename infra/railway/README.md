# Railway Deployment

Create separate Railway services:

1. `poe-api` from `services/api/Dockerfile`
2. `poe-worker` from `services/worker/Dockerfile`
3. `postgres` plugin
4. `redis` plugin

Set environment variables from `.env.example`.

For worker service start command:

`celery -A worker.celery_app worker --loglevel=INFO`
