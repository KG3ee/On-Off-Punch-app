# Modern Punch (Prototype)

Monorepo prototype for attendance, split-shift scheduling, breaks, driver requests, violations, and notification workflows.

## Stack
- `apps/api`: NestJS + Prisma + PostgreSQL
- `apps/web`: Next.js (App Router)
- `packages/core`: shared shift/time logic

## Current Workflow Coverage
- Username/password auth with register-request flow and admin approval.
- Role-based UI/API for `ADMIN`, `LEADER`, `MEMBER`, `DRIVER`, `CHEF`, `MAID`.
- Shift management:
  - multi-segment presets
  - team/user assignments
  - date overrides
  - shift change requests (`HALF_DAY_MORNING`, `HALF_DAY_EVENING`, `FULL_DAY_OFF`, `CUSTOM`)
- Attendance:
  - punch ON/OFF with server-side time normalization
  - late minute calculation per resolved segment
  - overtime based on late-end time (early punch-on does not add overtime)
- Breaks:
  - start/end/cancel
  - limit scope is per active duty session (not reset at midnight)
  - over-limit is soft: break still starts and is flagged
- Offline-safe employee actions:
  - punch ON/OFF and break actions queue locally and sync later
- Violations:
  - member report
  - leader triage/observed
  - admin finalize
  - points ledger and CSV export
- Driver requests:
  - general + meal pickup categories
  - request creation is allowed even when drivers are off duty (queued state returned)
- Notifications:
  - in-app notification feed for all authenticated roles
  - optional Web Push (VAPID-based) when enabled
- Internal jobs with `x-job-secret`.

## Quick Start (Local)
1. Install dependencies:
```bash
npm install
```
2. Copy env files:
```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
```
3. Generate Prisma client:
```bash
npm run prisma:generate
```
4. Run migrations:
```bash
npm run prisma:migrate
```
5. Seed baseline data:
```bash
npm run seed --workspace @modern-punch/api
```
6. Start API + web:
```bash
npm run dev
```

Local URLs:
- API health: `http://localhost:4000/health` (or `http://localhost:4001/health` if `PORT` is unset)
- Web: `http://localhost:3000`

## Web UI layout (`apps/web`)
- **Split columns:** A `.split` section is a two-column grid. When a column contains **multiple cards stacked vertically**, wrap them in `<SplitColumnStack>` (or the `split-col-stack` class). Do not use a bare `div` with `className="grid"` for that pattern — the global `.grid` utility is a real **CSS Grid** (`display: grid`; used e.g. on admin deductions with inline `gridTemplateColumns`).
- **New layout classes:** If you introduce a class name in TSX, add the matching rule in `apps/web/src/app/globals.css` in the same change (or reuse an existing primitive). Grep for `className="…"` before merging if you are unsure.
- **Optional hardening:** Visual or Playwright smoke tests on key pages catch accidental layout regressions; the repo does not require them yet.

## Seed Notes
- `SEED_ADMIN_USERNAME` defaults to `admin`.
- `SEED_ADMIN_PASSWORD` is required and must be at least 12 characters.
- Seed creates baseline teams, break policies, split-shift presets, and team assignments.

## Deployment (Vercel + Neon)
This repo is set up for two Vercel projects (`apps/api` and `apps/web`) plus Neon database.

### 1) Neon Database
- Create a Neon Postgres database.
- Keep both connection strings:
  - pooler URL for runtime
  - direct URL for migrations

### 2) API Project (`apps/api`)
1. Import repo in Vercel, root directory `apps/api`.
2. Build command can stay `npm run build`.
3. Migration behavior during Vercel build:
   - uses `DIRECT_DATABASE_URL` when provided
   - skips migrate when only pooler `DATABASE_URL` is set
   - skips when `SKIP_PRISMA_MIGRATE_ON_BUILD=true`
4. Required API env vars:
   - `DATABASE_URL`
   - `JWT_SECRET`
   - `CORS_ORIGIN`
   - `APP_TIMEZONE`
   - `JOB_SECRET`
5. Recommended API env vars:
   - `DIRECT_DATABASE_URL`
   - `AUTH_COOKIE_SAMESITE`
   - `AUTH_COOKIE_SECURE`
   - `AUTH_SESSION_DAYS`
   - `BODY_LIMIT`
   - `SEED_ADMIN_USERNAME`
   - `SEED_ADMIN_PASSWORD`
6. Optional API env vars:
   - `SYSTEM_JOB_USER_ID`
   - `BREAK_GRACE_MINUTES`
   - `MAX_ACTIVE_DUTY_HOURS`
   - `MAX_CLIENT_PAST_HOURS`
   - `MAX_CLIENT_FUTURE_MINUTES`
   - `HIGH_TRUST_SKEW_MINUTES`
   - `MAX_LATE_MINUTES`
   - `MAX_OVERTIME_MINUTES`
   - `BCRYPT_ROUNDS`
   - `SKIP_PRISMA_MIGRATE_ON_BUILD`
7. Optional push-notification API env vars (required only for Web Push delivery):
   - `WEB_PUSH_VAPID_PUBLIC_KEY`
   - `WEB_PUSH_VAPID_PRIVATE_KEY`
   - `WEB_PUSH_VAPID_SUBJECT` (example: `mailto:admin@yourdomain.com`)

## Deployment (Hostinger VPS)
For a flat-cost VPS deployment with Docker Compose, see:

- `/Users/kyawlaymyint/Desktop/ON:OFF/modern-punch/docs/HOSTINGER_VPS_MIGRATION.md`
- `/Users/kyawlaymyint/Desktop/ON:OFF/modern-punch/deploy/hostinger/docker-compose.yml`

This path keeps Supabase as the database and moves only the app hosting from Vercel to your VPS.

### 3) Web Project (`apps/web`)
1. Import same repo in Vercel, root directory `apps/web`.
2. Required web env vars:
   - `NEXT_PUBLIC_API_URL`
   - `API_INTERNAL_URL`
   - `JOB_SECRET`
3. Optional web env vars:
   - `CRON_SECRET`
   - `NEXT_PUBLIC_PUSH_ENABLED` (`true`/`1` to enable push subscription flow)
   - `NEXT_PUBLIC_PUSH_ROLES` (comma-separated roles; default allows all operational roles)
   - `NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY` (required when push is enabled)

### 4) Production Migration/Seed (Manual)
Run from `apps/api` against production direct DB URL:
```bash
DATABASE_URL="<PROD_DIRECT_DATABASE_URL>" npm run prisma:migrate:deploy
DATABASE_URL="<PROD_DATABASE_URL>" SEED_ADMIN_USERNAME="admin" SEED_ADMIN_PASSWORD="<strong-password>" npm run seed
```

## Internal Job Endpoints
All endpoints require header `x-job-secret: <JOB_SECRET>`.

- `POST /internal/jobs/run-daily`
- `POST /internal/jobs/auto-close-breaks`
- `POST /internal/jobs/auto-close-stale-duty`
- `POST /internal/jobs/monthly-snapshot`

Example:
```bash
curl -X POST "$API_URL/internal/jobs/run-daily" -H "x-job-secret: $JOB_SECRET"
```
