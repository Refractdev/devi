# Devrefract Outreach

Devrefract Outreach is a hosted, single-operator workspace. **Vercel hosts the Next.js app and scheduled job endpoint; Supabase provides Auth, Postgres, RLS, and the durable PGMQ queue.** There is no SQLite fallback, local sample workspace, or locally running worker in the application runtime.

## Deploy

1. Create a Supabase project and apply the SQL files in `supabase/migrations` in filename order (or use the Supabase CLI against the hosted project).
2. Import this repository into Vercel and configure the variables from `.env.example` in the Vercel project settings.
3. Use Vercel Pro for commercial use and the once-per-minute worker Cron. Set `NEXT_PUBLIC_APP_URL` and `GOOGLE_REDIRECT_URI` to the production HTTPS domain. Configure Supabase Google Auth's callback URL separately as `https://<project-ref>.supabase.co/auth/v1/callback`.
4. Deploy. Vercel Cron invokes `/api/cron/worker` once per minute. The endpoint requires `CRON_SECRET`; Supabase PGMQ and database job records provide durable scheduling and recovery.
5. Sign in with the allowlisted Google account. The first authorized login provisions the workspace. Connect Gmail and configure AI providers in Settings.

See [DEPLOY.md](DEPLOY.md) for the full setup, recovery, and operating instructions.

## Development

`npm run dev` starts only the Next.js development server. It does not start a local database or background worker. Configure a non-production Supabase project and its public/server keys before using the app. Real outreach runs only through the authenticated workspace and the scheduled Vercel endpoint.

The one-time `migrate:sqlite` script remains available solely to import an existing SQLite archive into Supabase. SQLite is a development dependency for that maintenance script, not an application datastore; it is not used by the deployed app.

## Commands

- `npm run dev` — Next.js development server
- `npm run build` — production build
- `npm run typecheck` — TypeScript check
- `npm run migrate:sqlite` — one-time legacy data import (requires `DATABASE_PATH`, Supabase server credentials, and owner email)

## Security boundaries

- Supabase service credentials, `APP_ENCRYPTION_KEY`, and `CRON_SECRET` are server-only Vercel variables.
- Browser access requires the allowed Google identity and workspace membership; database policies enforce workspace scope.
- Gmail OAuth tokens and provider keys saved in Settings are encrypted before storage.
- Cron endpoint requests require the bearer secret. The endpoint processes durable queued jobs; it is not a public worker control API.
- Do not use production credentials with a development Supabase project or deploy preview.
