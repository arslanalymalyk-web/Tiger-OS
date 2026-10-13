# ServiceTrace — maintenance operations platform (Milestone 1)

Working product name **ServiceTrace** (a placeholder; rename freely). It lives beside the TIGERIS demo in the same Next.js project
under `/app/*`. TIGERIS (`/`, `/sector/*`, …) is unchanged and keeps its own rules in `CLAUDE.md`; those "fictional demo" rules do **not** apply to ServiceTrace.

**Status: Milestone 1 of 4. Not production-ready.** It has not had an external security review, load test, backup/restore drill or accessibility audit. See *Remaining work*.

## Architecture
| Concern | Choice |
|---|---|
| App | Next.js 16 App Router, server components + server actions (built-in Origin check = CSRF protection), TypeScript |
| Database | PostgreSQL 14+ (tested on 16), plain SQL migrations in `db/migrations`, `pg` driver |
| Tenancy | `company_id` on every tenant table + **row-level security** keyed on `app.company_id`, set per transaction. The app connects as `trace_app` (not owner, no BYPASSRLS), so a forgotten `WHERE` still cannot cross tenants. Services also filter explicitly. |
| Auth | scrypt password hashes; opaque random session tokens (only SHA-256 stored); HttpOnly + SameSite=Lax (+Secure, `__Host-` prefix outside dev) cookie; 7-day absolute / 8-hour idle expiry; revocation; optional TOTP MFA (secret AES-256-GCM encrypted); single-use hashed invite/reset tokens; DB-backed rate limits + lockout |
| Authorisation | `src/server/rbac.ts` role→permission matrix, re-checked on the server for every action; record scope in `scope.ts` (tenant, role, customer, shared-with-customer, site/contract grants). Out-of-scope records return 404. |
| Audit | `audit_log` per company, SHA-256 hash chain, append-only (trigger + no UPDATE/DELETE grant). Verify and CSV export in the UI. `case_events`, `case_notes`, `evidence`, decided approvals are immutable by trigger. |
| Evidence | Content sniffing (JPEG/PNG/WebP/PDF only), size cap, random storage key, SHA-256 recorded and re-verified on every download, access-controlled route, nosniff + sandbox CSP. Driver interface in `storage.ts` (local disk implemented). |
| Email | Outbox table with delivery status; SMTP via `SMTP_URL` + `MAIL_FROM`. Unconfigured ⇒ status `not_configured`, never reported as sent. |
| i18n | English + Arabic dictionaries (`src/i18n`), type-checked to be identical; `dir`/`lang` set per request; logical CSS properties for RTL; Gregorian dates with Arabic-Indic digits. |
| AI | **None in Milestone 1.** The existing TIGERIS AI code is not used by ServiceTrace. |

## Workflow implemented
`new → assigned → in_progress → pending_review ⇄ info_requested → awaiting_customer ⇄ customer_query → approved | rejected → (deferred | work_completed) → closed`.
Every step records actor, server time and from/to status (timeline + audit). Technician observation time (device clock) and server receipt time are stored separately.
Engineer-only: return for information, request approval. Customer-approver-only: approve / reject / ask a question (reason mandatory for the last two). Ops/admin can remind and close but cannot make the customer decision or the technical review. The pending owner and elapsed approval time are shown; elapsed time freezes at decision.
Customers see only cases explicitly shared with them, only customer-visible notes/evidence, and a reduced timeline. The UI states that records do not assign contractual or legal responsibility.

## Local setup
```bash
npm install
# one-time, as a Postgres superuser:
#   create role trace_owner login password '…'; create role trace_app login password '…';
#   create database tracedev owner trace_owner;
cp .env.example .env.local          # fill DATABASE_URL, MIGRATE_DATABASE_URL
npm run db:migrate
npm run seed:demo                   # fictional data; prints a generated password once (or set SEED_PASSWORD)
npm run dev                         # http://localhost:3000/app/login
```
Real platform admin (no seed): `PLATFORM_ADMIN_EMAIL=you@corp.com npm run admin:create` prints a single-use invite link; then create companies at `/app/platform`.

## Tests
```bash
npm test            # 32 tests: tenant isolation (service + raw-SQL RLS), RBAC, workflow, timestamps, approval duration,
                    #   evidence, audit-chain tamper detection, auth/MFA/reset/rate limit, dashboard traceability, i18n parity
# Browser end-to-end (needs a production build, seeded DB, Chromium):
npm run build && APP_ENV=staging APP_ENCRYPTION_KEY=$(openssl rand -hex 32) npx next start -p 3200 &
SEED_PASSWORD=… CHROMIUM_PATH=/path/to/chromium npm run test:e2e -- http://localhost:3200 ./e2e-shots
```
Tests need Postgres roles/DBs `trace_owner`/`trace_app`/`tracetest` (URLs overridable via `MIGRATE_DATABASE_URL`/`DATABASE_URL`) and **drop the schema** of that database.

## Deployment (staging/production)
1. Managed PostgreSQL with TLS, automated backups + point-in-time recovery. Create `trace_owner` (migrations) and `trace_app` (runtime, `NOBYPASSRLS`, not superuser).
2. Set env vars from `.env.example` in your host's secret store. Required: `APP_ENV`, `APP_BASE_URL` (https), `DATABASE_URL`, `APP_ENCRYPTION_KEY`; for email `SMTP_URL`, `MAIL_FROM`. `UPLOAD_DIR` must be a persistent, backed-up volume (or implement an S3 driver).
3. CI/deploy step: `npm ci && npm run build && npm run db:migrate` (with `MIGRATE_DATABASE_URL`), then `npm start`. Health check: `GET /api/health`.
4. Terminate TLS at a trusted reverse proxy that **overwrites** `X-Forwarded-For` (rate limits and audit IPs rely on it).
5. Keep development, staging and production on separate databases, keys and storage. Never run `seed:demo` in production (it refuses).
**Backups/recovery:** back up the database *and* the upload volume together (evidence rows reference files by key). Restore both to the same point, run `verifyChain` from *Audit log → Verify*, and spot-check evidence downloads (hashes are re-verified). Rehearse this before go-live; it has not been rehearsed here.
**Logs:** structured JSON to stdout (`src/server/log.ts`), secrets redacted; ship to your log platform.

## Required from you before Milestone 2 / go-live
- **Business decisions:** product name & branding (no KEMSCO marks are used); hosting region / data-residency; data-retention periods; whether customers may raise requests themselves; who may defer vs reject; SLA targets per contract (defaults: urgent 1h/8h, high 4h/24h, medium 8h/72h, low 24h/168h — editable only in the DB until Milestone 2 settings UI).
- **Accounts/credentials:** PostgreSQL instance; SMTP provider (or SES/Resend etc.); object storage account if not using local disk; domain + TLS; a log/monitoring destination. For later milestones: SMS/WhatsApp provider, accounting/ERP API access, an AI provider key and a data-processing agreement.

## Remaining work (not done, deliberately not faked)
Milestone 1 gaps: buildings/zones (assets have parent hierarchy only), contract/site grants UI beyond invite-time site limits, role *editing* (matrix is code), notification preferences UI, retention settings, attachment versioning, QR-code image rendering (token stored), PDF/case export (audit CSV only), CSP nonces, a dedicated security review, accessibility audit (axe) of the new pages, offline mode (**not implemented**; a reliable version needs a service worker + local queue with server-side conflict checks — planned, not started), and S3 storage driver.
Milestones 2–4 (schedules, inspections, dispatch/calendar, escalation, parts/quotes/invoices, integrations, AI) are **not started**. Integrations will show "not configured" until credentials exist and a real test succeeds.
Known limitation: dates display in `APP_TIMEZONE` (default UTC), not per-user time zones.
