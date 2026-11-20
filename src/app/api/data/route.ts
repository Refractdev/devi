import { NextResponse } from 'next/server';
import { getWorkspaceContext } from '@/lib/supabase/server';
import { dispatchCloudAction, loadCloudWorkspace } from '@/lib/supabase/workspace';

export const dynamic = 'force-dynamic';

export async function GET() {
  const context = await getWorkspaceContext();
  if (!context.workspaceId) return NextResponse.json({ error: 'Workspace is not provisioned.' }, { status: 503 });
  try {
    return NextResponse.json(await loadCloudWorkspace(context.workspaceId));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not load workspace.' }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const context = await getWorkspaceContext();
  if (!context.workspaceId) return NextResponse.json({ error: 'Workspace is not provisioned.' }, { status: 503 });
  try {
    return NextResponse.json(await dispatchCloudAction(context.workspaceId, await request.json()));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Something went wrong.' }, { status: 400 });
  }
}
