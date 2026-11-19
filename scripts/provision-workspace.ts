import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const url=process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL;
const key=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
const owner=(process.env.OWNER_EMAIL||'lopesadilson948@gmail.com').trim().toLowerCase();
if(!url||!key)throw new Error('Set SUPABASE_URL and SUPABASE_SECRET_KEY in the server environment.');
const admin=createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}});
const {data:users,error:userError}=await admin.auth.admin.listUsers({page:1,perPage:1000});if(userError)throw userError;
const user=users.users.find(item=>item.email?.toLowerCase()===owner);if(!user)throw new Error(`No Supabase Auth user exists for ${owner}. First complete Google login with the allowed owner account.`);
const {data:existing,error:existingError}=await admin.from('workspace_members').select('workspace_id').eq('user_id',user.id).maybeSingle();if(existingError)throw existingError;if(existing?.workspace_id){console.log(`Workspace already provisioned: ${existing.workspace_id}`);process.exit(0);}
const {data:workspace,error:workspaceError}=await admin.from('workspaces').insert({name:process.env.WORKSPACE_NAME||'Devrefract Workspace'}).select('id').single();if(workspaceError)throw workspaceError;
const workspaceId=workspace.id;
const {error:memberError}=await admin.from('workspace_members').insert({workspace_id:workspaceId,user_id:user.id,role:'owner'});if(memberError)throw memberError;
const allowlist=(process.env.OWNER_EMAIL_ALLOWLIST||owner).split(',').map(value=>value.trim().toLowerCase()).filter(Boolean);
const {error:settingsError}=await admin.from('workspace_settings').insert({workspace_id:workspaceId,values:{goal:5000,goalCurrency:'USD',goalDeadline:'2026-12-06',senderName:'Adilson',senderCompany:'Devrefract',senderAddress:'',daily_cap_per_account:100,allowedEmails:allowlist,stopped:'false'}});if(settingsError)throw settingsError;
const {error:prefError}=await admin.from('notification_preferences').insert({workspace_id:workspaceId,email:process.env.NOTIFICATION_EMAIL||owner,timezone:'Africa/Luanda',quiet_start:'23:00',quiet_end:'07:00',daily_summary_at:'21:00'});if(prefError)throw prefError;
for(const email of allowlist){const {error}=await admin.from('operator_access').upsert({email,enabled:true,updated_at:new Date().toISOString()},{onConflict:'email'});if(error)throw error;}
console.log(`Provisioned workspace ${workspaceId} for ${owner}. Set SUPABASE_WORKSPACE_ID=${workspaceId} on the server.`);
