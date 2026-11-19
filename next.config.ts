import type { NextConfig } from 'next';
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants';

export default (phase: string): NextConfig => ({
  // Keep dev and production output separate so a prior build cannot corrupt
  // the dev server manifest (especially on OneDrive/Windows workspaces).
  distDir: phase === PHASE_DEVELOPMENT_SERVER ? '.next-dev' : '.next',
  serverExternalPackages: ['googleapis', 'openai'],
  devIndicators: false,
  async headers() {
    const supabaseOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseHost = supabaseOrigin ? new URL(supabaseOrigin).origin : '';
    const connect = ["'self'", 'https://api.groq.com', 'https://integrate.api.nvidia.com', 'https://router.huggingface.co', 'https://accounts.google.com', supabaseHost, supabaseHost.replace(/^https:/, 'wss:')].filter(Boolean).join(' ');
    const production = phase !== PHASE_DEVELOPMENT_SERVER;
    return [{ source: '/:path*', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      { key: 'Content-Security-Policy', value: `default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self' https://accounts.google.com; script-src 'self' 'unsafe-inline'${production ? '' : " 'unsafe-eval'"}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src ${connect};${production ? ' upgrade-insecure-requests;' : ''}` },
      ...(production ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' }] : []),
    ] }];
  },
});
