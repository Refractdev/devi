'use client';

import { createBrowserClient } from '@supabase/ssr';
import { supabasePublicConfig } from './config';

let browserClient: ReturnType<typeof createBrowserClient> | null = null;

export function getSupabaseBrowser() {
  const config = supabasePublicConfig();
  if (!config.configured) return null;
  browserClient ||= createBrowserClient(config.url, config.anonKey);
  return browserClient;
}
