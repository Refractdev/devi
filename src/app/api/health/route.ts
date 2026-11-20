import { NextResponse } from 'next/server';
import { getSupabaseAdmin, getWorkspaceContext } from '@/lib/supabase/server';

export const dynamic='force-dynamic';

export async function GET(request:Request){
  const url=new URL(request.url);
  const probe=request.headers.get('x-healthcheck-token');
  if(probe&&process.env.HEALTHCHECK_TOKEN&&probe===process.env.HEALTHCHECK_TOKEN){const admin=getSupabaseAdmin();if(!admin)return NextResponse.json({status:'degraded'},{status:503});const {data:workspace}=await admin.from('workspaces').select('id').limit(1).maybeSingle();if(!workspace)return NextResponse.json({status:'workspace_missing'},{status:503});const {data,error}=await admin.rpc('worker_health_snapshot',{target_workspace:workspace.id});if(error)return NextResponse.json({status:'degraded'},{status:503});const recent=(data.workers||[]).some((worker:any)=>Date.now()-Date.parse(worker.heartbeat_at)<10*60_000);return recent?NextResponse.json({status:'ok'}):NextResponse.json({status:'worker_stale'},{status:503});}
  const context=await getWorkspaceContext();
  if(!context.workspaceId)return NextResponse.json({error:'Workspace unavailable.'},{status:503});
  const admin=getSupabaseAdmin();if(!admin)return NextResponse.json({error:'Database unavailable.'},{status:503});
  const {data,error}=await admin.rpc('worker_health_snapshot',{target_workspace:context.workspaceId});
  if(error)return NextResponse.json({status:'degraded',error:'Health data unavailable.'},{status:503});
  const workers=Array.isArray(data.workers)?data.workers:[];
  const active=workers.filter((worker:any)=>Date.now()-Date.parse(worker.heartbeat_at)<10*60_000);
  return NextResponse.json({status:active.length?'healthy':'worker_stale',worker:{status:active.length?'healthy':'stale',lastHeartbeat:workers.sort((a:any,b:any)=>Date.parse(b.heartbeat_at)-Date.parse(a.heartbeat_at))[0]?.heartbeat_at||null},queue:data.queue,accounts:data.accounts,ai:data.ai});
}
