# Modern Punch (Prototype)

Monorepo prototype for split-shift duty tracking, breaks, and monthly reporting.

## Stack
- `apps/api`: NestJS + Prisma
- `apps/web`: Next.js
- `packages/core`: shared pure business logic (shift resolution + time helpers)

## Features Implemented
- Username/password login (`POST /auth/login`)
- Admin-created users and teams
- Multi-segment shift presets + assignments + overrides
- Duty punch ON/OFF with late calculation per segment
- Break start/end/cancel with daily limit enforcement
- Admin live board endpoint
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
- Free-tier target deployment: Vercel (web + api), Neon (db).

## Deploy (Prototype Final)
### 1. Database (Neon)
1. Create a Neon Postgres database.
2. Keep the connection string ready for both local migration and Vercel API env.

### 2. API (Vercel Project: `modern-punch-api`)
1. Import this repo in Vercel.
2. Set **Root Directory** to `apps/api`.
3. Framework Preset: `NestJS`.
4. Configure API env vars in Vercel:
- `DATABASE_URL`
- `JWT_SECRET`
- `APP_TIMEZONE`
- `JOB_SECRET`
- `CORS_ORIGIN` (example: `https://your-web.vercel.app,https://*.vercel.app`)
- optional: `SYSTEM_JOB_USER_ID`
- optional: `BREAK_GRACE_MINUTES`
- optional: `MAX_ACTIVE_DUTY_HOURS`
- optional: `MAX_CLIENT_PAST_HOURS`
- optional: `MAX_CLIENT_FUTURE_MINUTES`
- optional: `HIGH_TRUST_SKEW_MINUTES`
- optional: `MAX_LATE_MINUTES`
- optional: `MAX_OVERTIME_MINUTES`
- optional: `BCRYPT_ROUNDS`
- optional: `SEED_ADMIN_USERNAME`
- optional: `SEED_ADMIN_PASSWORD`
5. Deploy and copy the API URL (example: `https://modern-punch-api.vercel.app`).

### 3. Run Migration + Seed (local terminal)
Use the same production `DATABASE_URL` and run:
```bash
npm run prisma:migrate
npm run seed --workspace @modern-punch/api
```

### 4. Web (Vercel Project: `modern-punch-web`)
1. Import the same repo in Vercel with root directory `apps/web`.
2. Configure env vars:
- `NEXT_PUBLIC_API_URL` (your Vercel API URL)
- `API_INTERNAL_URL` (same Vercel API URL)
- `JOB_SECRET` (must match API `JOB_SECRET`)
- optional: `CRON_SECRET`
3. `apps/web/vercel.json` schedules daily cron at `00:10 UTC` for `/api/cron/daily`.

### 5. Final Check
1. Open web URL and login with seeded admin account.
2. Verify API health from browser:
```text
https://your-api.vercel.app/health
```

## Job Endpoints
All require `x-job-secret` header with `JOB_SECRET`.

- `POST /internal/jobs/run-daily`
- `POST /internal/jobs/auto-close-breaks`
- `POST /internal/jobs/auto-close-stale-duty`
- `POST /internal/jobs/monthly-snapshot` (optional body: `year`, `month`, `teamId`, `force`)

Example:
```bash
curl -X POST "$API_URL/internal/jobs/run-daily" \
  -H "x-job-secret: $JOB_SECRET"
```
