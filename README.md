# Modern Punch (Prototype)

Monorepo prototype for split-shift duty tracking, breaks, payroll, and monthly reporting.

## Stack
- `apps/api`: NestJS + Prisma
- `apps/web`: Next.js
- `packages/core`: shared pure business logic (shift resolution + payroll math)

## Features Implemented
- Username/password login (`POST /auth/login`)
- Admin-created users and teams
- Multi-segment shift presets + assignments + overrides
- Duty punch ON/OFF with late calculation per segment
- Break start/end/cancel with daily limit enforcement
- Admin live board endpoint
- Salary rules + payroll runs/items (`DRAFT` -> `FINALIZED`)
- Payroll CSV export endpoint (`/admin/payroll/runs/:id/export.csv`)
- Monthly snapshot reports
- Internal cron/job endpoints secured by `x-job-secret`

## Quick Start
1. Install dependencies:
```bash
npm install
```

2. Configure environment:
```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
```

3. Generate Prisma client:
```bash
npm run prisma:generate
```

4. Run migration (requires valid `DATABASE_URL`):
```bash
npm run prisma:migrate
```

5. Seed initial data:
```bash
npm run seed --workspace @modern-punch/api
```

6. Start both API + web:
```bash
npm run dev
```

- API: `http://localhost:4000/health`
- Web: `http://localhost:3000`

## Important Notes
- Seed creates an admin account from API env vars:
- `SEED_ADMIN_USERNAME` (default `admin`)
- `SEED_ADMIN_PASSWORD` (default `admin123`)
- Admin-created users can be forced to change password on first login (`mustChangePassword`).
- Free-tier target deployment: Vercel (web), Render (api), Neon (db).

## Deploy (Prototype Final)
### 1. Database (Neon)
1. Create a Neon Postgres database.
2. Set `DATABASE_URL` in Render API environment.
3. Run migration and seed from API service shell:
```bash
npm run prisma:migrate
npm run seed --workspace @modern-punch/api
```

### 2. API (Render)
1. Create Render service from this repo.
2. Use `render.yaml` blueprint at repo root.
3. Configure env vars:
- `DATABASE_URL`
- `JWT_SECRET`
- `APP_TIMEZONE`
- `JOB_SECRET`
- optional: `SYSTEM_JOB_USER_ID`
- optional: `BREAK_GRACE_MINUTES`
- optional: `BCRYPT_ROUNDS`
- optional: `SEED_ADMIN_USERNAME`
- optional: `SEED_ADMIN_PASSWORD`

### 3. Web (Vercel)
1. Import the same repo in Vercel with root directory `apps/web`.
2. Configure env vars:
- `NEXT_PUBLIC_API_URL` (public API URL)
- `API_INTERNAL_URL` (same API URL for cron route)
- `JOB_SECRET` (must match API `JOB_SECRET`)
- optional: `CRON_SECRET`
3. `apps/web/vercel.json` schedules daily cron at `00:10 UTC` for `/api/cron/daily`.

## Job Endpoints
All require `x-job-secret` header with `JOB_SECRET`.

- `POST /internal/jobs/run-daily`
- `POST /internal/jobs/auto-close-breaks`
- `POST /internal/jobs/monthly-snapshot` (optional body: `year`, `month`, `teamId`, `force`)

Example:
```bash
curl -X POST "$API_URL/internal/jobs/run-daily" \
  -H "x-job-secret: $JOB_SECRET"
```
