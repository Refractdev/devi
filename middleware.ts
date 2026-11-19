import { createServerClient } from '@supabase/ssr/dist/main/createServerClient.js';
import { NextResponse, type NextRequest } from 'next/server';
import { supabasePublicConfig } from './src/lib/supabase/config';

export async function middleware(request: NextRequest) {
  if(process.env.NODE_ENV==='production'&&request.nextUrl.protocol!=='https:'&&!request.nextUrl.hostname.endsWith('.internal')){
    const forwarded=request.headers.get('x-forwarded-proto');
    if(forwarded!=='https'){const secure=request.nextUrl.clone();secure.protocol='https:';return NextResponse.redirect(secure,308);}
  }
  const config = supabasePublicConfig();
  if (!config.configured) {
    return NextResponse.json({error:'Supabase authentication is not configured.'},{status:503});
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (values) => {
        values.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        values.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  const isPublic = path === '/login' || path === '/api/health' || path === '/api/cron/worker' || path.startsWith('/auth/callback') || path.startsWith('/api/auth/');
  if (request.method === 'POST' && path.startsWith('/api/')) {
    const origin = request.headers.get('origin');
    if(!origin)return NextResponse.json({error:'Origin header required.'},{status:403});
    try { if (new URL(origin).origin !== request.nextUrl.origin) return NextResponse.json({ error: 'Cross-origin requests are not allowed.' }, { status: 403 }); }
    catch { return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 }); }
  }
  if (!user && !isPublic) {
    if (path.startsWith('/api/')) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    const login = request.nextUrl.clone(); login.pathname = '/login'; login.searchParams.set('next', path);
    return NextResponse.redirect(login);
  }
  if (user && path === '/login') {
    const home = request.nextUrl.clone(); home.pathname = '/'; home.search = '';
    return NextResponse.redirect(home);
  }
  response.headers.set('X-Content-Type-Options','nosniff');
  response.headers.set('Referrer-Policy','strict-origin-when-cross-origin');
  response.headers.set('X-Frame-Options','DENY');
  response.headers.set('Permissions-Policy','camera=(), microphone=(), geolocation=()');
  if(request.nextUrl.protocol==='https:')response.headers.set('Strict-Transport-Security','max-age=63072000; includeSubDomains; preload');
  return response;
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
