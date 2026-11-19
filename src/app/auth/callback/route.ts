import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { getSupabaseServer } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const admin=getSupabaseAdmin();
  const encryptionKey=process.env.APP_ENCRYPTION_KEY||'';
  if(admin&&encryptionKey){const ip=request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||'unknown',ipHash=crypto.createHmac('sha256',encryptionKey).update(ip).digest('hex');const {data:allowedAttempt,error}=await admin.rpc('allow_auth_attempt',{target_ip_hash:ipHash});if(error)return NextResponse.json({error:'Authentication is temporarily unavailable.'},{status:503});if(!allowedAttempt)return NextResponse.json({error:'Too many sign-in attempts. Try again in 15 minutes.'},{status:429});}
  const supabase = await getSupabaseServer();
  if (!supabase || !code) return NextResponse.redirect(new URL('/login?error=auth', url));
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(new URL('/login?error=auth', url));
  const { data: { user } } = await supabase.auth.getUser();
  const envAllowed=(process.env.OWNER_EMAIL_ALLOWLIST||process.env.OWNER_EMAIL||'lopesadilson948@gmail.com').split(',').map(value=>value.trim().toLowerCase()).filter(Boolean);
  const {data:operatorRows}=admin?await admin.from('operator_access').select('email').eq('enabled',true):{data:[]};
  const {data:workspace}=admin?await admin.from('workspace_settings').select('values').limit(1).maybeSingle():{data:null};
  const configured=operatorRows?.length?operatorRows.map((row:any)=>String(row.email).trim().toLowerCase()):Array.isArray(workspace?.values?.allowedEmails)?workspace.values.allowedEmails.map((value:string)=>String(value).trim().toLowerCase()):String(workspace?.values?.allowedEmails||'').split(/[\n,;]/).map(value=>value.trim().toLowerCase()).filter(Boolean);
  const allowed=[...new Set([...envAllowed,...configured])];
  if (!user || !user.email || !allowed.includes(user.email.toLowerCase())) {
    if(user?.email&&admin){const hash=(value:string)=>crypto.createHash('sha256').update(value).digest('hex');await admin.from('security_events').insert({email_hash:hash(user.email.toLowerCase()),event_type:'google_login_denied',ip_hash:hash(request.headers.get('x-forwarded-for')||'unknown')});}
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL('/login?error=not_allowed', url));
  }
  let { data: membership } = await supabase.from('workspace_members').select('workspace_id').eq('user_id', user.id).maybeSingle();
  if (!membership&&admin) {
    const allowedEmails=[...new Set([...allowed,user.email.toLowerCase()])];
    const {data:workspaceId,error:provisionError}=await admin.rpc('provision_operator_workspace',{target_user:user.id,target_email:user.email.toLowerCase(),target_allowed:allowedEmails,target_notification_email:process.env.NOTIFICATION_EMAIL||user.email});
    if(!provisionError&&workspaceId)membership={workspace_id:workspaceId};
  }
  if (!membership) {await supabase.auth.signOut();return NextResponse.redirect(new URL('/login?error=workspace', url));}
  return NextResponse.redirect(new URL('/', url));
}
