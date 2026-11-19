export function supabasePublicConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
  return { url, anonKey, configured: Boolean(url && anonKey) };
}

export function supabaseServerConfig() {
  const { url, anonKey, configured } = supabasePublicConfig();
  const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return { url, anonKey, secretKey, configured: configured && Boolean(secretKey) };
}

export const cloudMode = () => supabasePublicConfig().configured;
