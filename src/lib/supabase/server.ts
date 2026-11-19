import 'server-only';
import { createServerClient } from '@supabase/ssr/dist/main/createServerClient.js';
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
  if (!userClient || !admin) return { user: null, workspaceId: null, userClient: null, admin: null };
  const { data: { user }, error } = await userClient.auth.getUser();
  if (error || !user) return { user: null, workspaceId: null, userClient, admin };
  const { data: membership, error: membershipError } = await admin
    .from('workspace_members').select('workspace_id,role').eq('user_id', user.id).maybeSingle();
  if (membershipError || !membership?.workspace_id) {
    return { user, workspaceId: null, userClient, admin };
  }
  return { user, workspaceId: String(membership.workspace_id), userClient, admin };
}
