import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { supabasePublicConfig, supabaseServerConfig } from './config';

export async function getSupabaseServer() {
  const config = supabasePublicConfig();
  if (!config.configured) return null;
  const cookieStore = await cookies();
  return createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (values) => {
        try { values.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); }
        catch { /* Server Components cannot write refreshed cookies. Middleware handles refresh. */ }
      },
    },
  });
}

export function getSupabaseAdmin() {
  const config = supabaseServerConfig();
  if (!config.configured) return null;
  return createClient(config.url, config.secretKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}

export async function getWorkspaceContext() {
  const userClient = await getSupabaseServer();
  const admin = getSupabaseAdmin();
  if (!admin) return { user: null, workspaceId: null, actorId: null, userClient, admin };
  const { data: { user }, error } = userClient ? await userClient.auth.getUser() : { data: { user: null }, error: null };
  // This is a single-operator workspace. Unless explicitly disabled, allow the
  // private deployment to open directly without a second app login screen.
  // Gmail still asks Google for consent when a sending account is connected.
  if (error || !user) {
    if (process.env.PERSONAL_WORKSPACE_MODE !== 'false') {
      const { data: owner } = await admin.from('workspace_members').select('workspace_id,user_id').order('created_at', { ascending: true }).limit(1).maybeSingle();
      if (owner?.workspace_id) return { user: null, workspaceId: String(owner.workspace_id), actorId: String(owner.user_id), userClient, admin };
    }
    return { user: null, workspaceId: null, actorId: null, userClient, admin };
  }
  const { data: membership, error: membershipError } = await admin
    .from('workspace_members').select('workspace_id,role').eq('user_id', user.id).maybeSingle();
  if (membershipError || !membership?.workspace_id) {
    return { user, workspaceId: null, actorId: user.id, userClient, admin };
  }
  return { user, workspaceId: String(membership.workspace_id), actorId: user.id, userClient, admin };
}
