import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { google } from 'googleapis';
import { getWorkspaceContext, getSupabaseAdmin } from '@/lib/supabase/server';
import { readCloudSecret } from '@/lib/supabase/vault';

export async function GET(request: Request) {
  const context = await getWorkspaceContext();
  if (!context.workspaceId) return Response.json({ error: 'Workspace is not provisioned.' }, { status: 503 });
  const admin = getSupabaseAdmin();
  if (!admin) return Response.json({ error: 'Supabase server credentials are missing.' }, { status: 503 });

  const requestUrl = new URL(request.url);
  const reconnectAccountId = requestUrl.searchParams.get('accountId');
  const { data: accounts, error } = await admin.from('email_accounts').select('id').eq('workspace_id', context.workspaceId).neq('status', 'disconnected');
  if (error) return Response.json({ error: 'Could not check connected Gmail accounts.' }, { status: 503 });
  if (!reconnectAccountId && (accounts || []).length >= 5) return Response.json({ error: 'A workspace can connect up to five Gmail accounts.' }, { status: 409 });

  const clientId = await readCloudSecret(context.workspaceId, 'googleClientId');
  const clientSecret = await readCloudSecret(context.workspaceId, 'googleClientSecret');
  if (!clientId || !clientSecret) return Response.json({ error: 'Add the Google OAuth Client ID and secret in Settings first.' }, { status: 409 });
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || new URL('/api/auth/callback', requestUrl).toString();
  const oauth = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  const state = crypto.randomBytes(32).toString('base64url');
  const stateHash = crypto.createHash('sha256').update(state).digest('hex');
  if (!context.actorId) return Response.json({ error: 'Workspace owner is not configured.' }, { status: 503 });
  const { error: stateError } = await admin.from('oauth_states').insert({ state_hash: stateHash, workspace_id: context.workspaceId, user_id: context.actorId, reconnect_account_id: reconnectAccountId, expires_at: new Date(Date.now() + 10 * 60_000).toISOString() });
  if (stateError) return Response.json({ error: 'Could not initialize secure Google sign-in.' }, { status: 503 });
  return NextResponse.redirect(oauth.generateAuthUrl({ access_type: 'offline', prompt: 'consent', state, scope: ['https://www.googleapis.com/auth/gmail.send', 'https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/userinfo.email'] }));
}
