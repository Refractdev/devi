# Deploy Devrefract Outreach on Vercel + Supabase

This is the supported deployment. Vercel hosts the Next.js web app and invokes a short worker tick through Vercel Cron. Supabase is the only runtime database and queue. No VPS, Docker, Tailscale, persistent Node process, local SQLite workspace, or local worker is required. **Use Vercel Pro for this commercial app:** Vercel Hobby is limited to personal/non-commercial use and its Cron frequency is not sufficient for this worker schedule.

## 1. Create the Supabase project

1. Create a Supabase project and save its project URL, anon/publishable key, and server secret key in a password manager.
2. Apply `supabase/migrations/202611130001_workspace.sql` followed by `supabase/migrations/202611160001_hosted_operations.sql`. Use the Supabase SQL editor or link the project with the Supabase CLI and run `supabase db push`.
3. In **Authentication → URL Configuration**, set the production Vercel domain as the Site URL and add the production callback URL to Redirect URLs.
4. In **Authentication → Providers → Google**, configure Google sign-in and the Supabase callback URL shown by Supabase: `https://<project-ref>.supabase.co/auth/v1/callback`.
5. Keep public signups disabled. Set the owner allowlist in Vercel before the first sign-in.

## 2. Create the Vercel project

1. Import the repository in Vercel and leave the Next.js framework preset and build command at their defaults (`npm run build`).
2. Add the public variables `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `NEXT_PUBLIC_APP_URL`.
3. Add server-only variables `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `OWNER_EMAIL`, `OWNER_EMAIL_ALLOWLIST`, `APP_ENCRYPTION_KEY`, `CRON_SECRET`, `HEALTHCHECK_TOKEN`, and `GOOGLE_REDIRECT_URI`. Generate independent random values for the encryption, cron, and health tokens. Never use a `NEXT_PUBLIC_` prefix for secrets.
4. `GOOGLE_REDIRECT_URI` must be the exact production URL `https://<your-domain>/api/auth/callback`. Register this URL as an authorized redirect URI in the Google OAuth client used for Gmail connection.
5. Add a custom domain if desired, point its DNS to Vercel, and wait for Vercel to issue HTTPS. Set both URL variables to the final canonical HTTPS domain.
6. Deploy to Production. `vercel.json` schedules `/api/cron/worker` every minute. Vercel supplies the bearer `CRON_SECRET`; the route verifies it before loading the worker. Confirm in Vercel Cron/Function logs that requests return HTTP 200.

The worker tick claims at most one durable queue job per invocation, schedules inbox/follow-up work, reconciles uncertain sends, and processes operator notifications. Queue leases and idempotency live in Supabase, so a function timeout or retry does not depend on a continuously running process. Vercel Pro supports per-minute Cron and up to five-minute function duration; this route is configured for that duration. If a tick approaches the limit, reduce per-job work or split that job into smaller queue units.

## 3. First login and provider setup

1. Open the production HTTPS URL and sign in with the Google account listed in `OWNER_EMAIL_ALLOWLIST`.
2. The callback creates the initial workspace, membership, settings, and notification preferences.
3. In Settings, add the Gmail OAuth client ID and secret, then connect Gmail accounts. Add Groq/NVIDIA credentials and test each configured model.
4. Fill the physical mailing address before approving outreach. Confirm account health and the worker heartbeat on the health page before enabling a campaign.

## 4. Migrations and legacy data

Apply new SQL migrations in order before deploying code that depends on them. Vercel deployments do not run SQLite migrations and production never falls back to SQLite.

For a one-time import of an existing SQLite archive, run the retained maintenance command from an operator machine with `DATABASE_PATH`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, and `OWNER_EMAIL` set. This is an import utility only; after import, Supabase is the source of truth and there are no dual writes. Keep the archive as a separate backup until counts and sample records are checked.

## 5. Logs, health, and operations

- Use Vercel **Deployments → Functions → Logs** for web and cron invocation logs.
- `/api/health` requires an authenticated workspace session. An external probe may use `x-healthcheck-token` and `HEALTHCHECK_TOKEN`; it returns degraded status if the worker heartbeat is stale.
- The cron endpoint requires `Authorization: Bearer <CRON_SECRET>`. Do not share this URL with the secret embedded in it or expose the secret in browser code.
- A failed tick leaves the job recoverable through its database state/lease. Inspect `job_runs`, `worker_heartbeats`, queue messages, and `send_unknown` messages in Supabase before retrying uncertain Gmail sends.
- STOP ALL is stored in Supabase and checked by the send reservation path.

## 6. Backups and restore

Configure Supabase backups appropriate to the project plan and export the workspace periodically using the authenticated **Export everything** action. Keep exports encrypted outside the live project and store `APP_ENCRYPTION_KEY` separately; losing that key makes stored Gmail/provider credentials unreadable. Test a restore into a separate Supabase project before relying on the backup.

To restore, create a clean Supabase project, apply all migrations, restore the verified export, configure the same encryption key and Vercel environment variables, then deploy. Review `send_unknown` records against Gmail Sent and check STOP ALL before resuming campaigns.

## 7. Update or roll back

Push the approved source revision to the connected Git branch; Vercel builds and deploys it. Apply additive database migrations before switching to code that requires them. To roll back application code, promote the last known-good Vercel deployment; do not roll back destructive schema changes without restoring or applying a forward fix.
