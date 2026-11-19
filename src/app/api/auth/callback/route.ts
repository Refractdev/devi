import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import crypto from 'node:crypto';
import { getWorkspaceContext, getSupabaseAdmin } from '@/lib/supabase/server';
import { encryptSecret, readCloudSecret } from '@/lib/supabase/vault';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const home = new URL('/', url.origin);
  home.searchParams.set('tab', 'SETTINGS');
  const context = await getWorkspaceContext();
  const admin = getSupabaseAdmin();
  if (!context.user || !context.workspaceId || !admin || !code || !state) {
    home.searchParams.set('error', 'oauth_state');
    return NextResponse.redirect(home);
  }
  const stateHash = crypto.createHash('sha256').update(state).digest('hex');
  const { data: stateRow, error: stateError } = await admin.from('oauth_states').select('*').eq('state_hash', stateHash).eq('workspace_id', context.workspaceId).eq('user_id', context.user.id).gt('expires_at', new Date().toISOString()).maybeSingle();
  if (stateError || !stateRow) {
    home.searchParams.set('error', 'oauth_state');
    return NextResponse.redirect(home);
  }
  await admin.from('oauth_states').delete().eq('state_hash', stateHash);
  if (url.searchParams.get('error')) {
    home.searchParams.set('error', 'oauth_denied');
    return NextResponse.redirect(home);
  }
  try {
    const clientId = await readCloudSecret(context.workspaceId, 'googleClientId');
    const clientSecret = await readCloudSecret(context.workspaceId, 'googleClientSecret');
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || new URL('/api/auth/callback', url).toString();
    const oauth = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    const { tokens } = await oauth.getToken(code);
    oauth.setCredentials(tokens);
    const profile = await google.gmail({ version: 'v1', auth: oauth }).users.getProfile({ userId: 'me' });
    const email = profile.data.emailAddress?.toLowerCase();
    if (!email) throw new Error('Google did not return an account email.');
    const existing = stateRow.reconnect_account_id
      ? await admin.from('email_accounts').select('id,connected_at,warmup_started_at').eq('workspace_id', context.workspaceId).eq('id', stateRow.reconnect_account_id).maybeSingle()
      : await admin.from('email_accounts').select('id,connected_at,warmup_started_at').eq('workspace_id', context.workspaceId).eq('email', email).maybeSingle();
    if (!existing.data) {
      const { count } = await admin.from('email_accounts').select('id', { count: 'exact', head: true }).eq('workspace_id', context.workspaceId).neq('status', 'disconnected');
      if ((count || 0) >= 5) throw new Error('This workspace already has five connected Gmail accounts.');
    }
    if (existing.data && stateRow.reconnect_account_id && existing.data.id !== stateRow.reconnect_account_id) throw new Error('The selected Gmail account identity does not match.');
    const { error } = await admin.from('email_accounts').upsert({ workspace_id: context.workspaceId, email, tokens_ciphertext: encryptSecret(JSON.stringify(tokens)), status: 'connected', connected_at: existing.data?.connected_at || new Date().toISOString(), warmup_started_at: existing.data?.warmup_started_at || new Date().toISOString(), history_cursor: profile.data.historyId || null, paused_until: null, last_error: null, daily_cap: 25 }, { onConflict: 'workspace_id,email' });
    if (error) throw error;
    home.searchParams.set('gmail', 'connected');
    return NextResponse.redirect(home);
  } catch (error) {
    console.error('Gmail OAuth connection failed:', error instanceof Error ? error.message : 'unknown');
    home.searchParams.set('error', 'oauth');
    return NextResponse.redirect(home);
  }
}
