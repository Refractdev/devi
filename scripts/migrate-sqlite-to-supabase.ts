import 'dotenv/config';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';
import { createClient } from '@supabase/supabase-js';

type Row = Record<string, any>;
const required = ['SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'OWNER_EMAIL'] as const;
for (const key of required) if (!process.env[key]) throw new Error(`Missing ${key}; migration has not started.`);
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
});
const sqlitePath = process.env.DATABASE_PATH || 'data/app.db';
const legacy = new Database(sqlitePath, { readonly: true, fileMustExist: true });
let workspaceId = '';
const ownerEmail = process.env.OWNER_EMAIL!.trim().toLowerCase();

function deterministicId(type: string, key: string | number) {
  const hash = crypto.createHash('sha256').update(`devrefract:${type}:${key}`).digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
function rows(table: string): Row[] { return legacy.prepare(`select * from ${table}`).all() as Row[]; }
async function upsert(table: string, values: Row[], conflict: string) {
  for (let i = 0; i < values.length; i += 100) {
    const { error } = await supabase.from(table).upsert(values.slice(i, i + 100), { onConflict: conflict });
    if (error) throw new Error(`Import into ${table} failed: ${error.message}`);
  }
}
async function main() {
  let ownerId = process.env.SUPABASE_OWNER_USER_ID || '';
  if (!ownerId) {
    const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (error) throw new Error(`Could not find owner Auth user: ${error.message}`);
    ownerId = data.users.find(user => user.email?.toLowerCase() === ownerEmail)?.id || '';
  }
  if (!ownerId) throw new Error(`No Google-authenticated Supabase user exists for ${ownerEmail}. Sign in to the app first so the owner workspace is created, then rerun this migration.`);
  const {data:membership,error:membershipLookupError}=await supabase.from('workspace_members').select('workspace_id').eq('user_id',ownerId).maybeSingle();
  if(membershipLookupError)throw new Error(`Could not locate the owner's workspace: ${membershipLookupError.message}`);
  workspaceId=process.env.SUPABASE_WORKSPACE_ID||membership?.workspace_id||deterministicId('workspace',ownerEmail);
  const { data: existing } = await supabase.from('workspaces').select('id').eq('id', workspaceId).maybeSingle();
  if (!existing) {
    const { error } = await supabase.from('workspaces').insert({ id: workspaceId, name: 'Devrefract Workspace' });
    if (error) throw new Error(`Workspace bootstrap failed: ${error.message}`);
  }
  const { error: memberError } = await supabase.from('workspace_members').upsert({ workspace_id: workspaceId, user_id: ownerId, role: 'owner' }, { onConflict: 'workspace_id,user_id' });
  if (memberError) throw new Error(`Workspace membership bootstrap failed: ${memberError.message}`);

  const legacySettings = Object.fromEntries(rows('settings').filter(r => !['googleClientId','googleClientSecret','groqKey','nvidiaKey','huggingfaceKey'].includes(r.key)).map(r => [r.key, r.value]));
  const allowedEmails=[...new Set((process.env.OWNER_EMAIL_ALLOWLIST||ownerEmail).split(',').map(value=>value.trim().toLowerCase()).filter(Boolean))];
  const settings = { goal:'5000',goalCurrency:'USD',goalDeadline:'2026-12-06',senderName:'Adilson',senderCompany:'Devrefract',senderAddress:'',daily_cap_per_account:'100',modelWriting:legacySettings.groqModel||'openai/gpt-oss-120b',modelDiagnosis:'openai/gpt-oss-20b',modelChat:'openai/gpt-oss-120b',modelReviewer:'openai/gpt-oss-20b',modelNvidia:'',...legacySettings,allowedEmails };
  await upsert('workspace_settings', [{ workspace_id: workspaceId, values: settings }], 'workspace_id');
  const {error:accessError}=await supabase.from('operator_access').upsert(allowedEmails.map(email=>({email,enabled:true,updated_at:new Date().toISOString()})),{onConflict:'email'});if(accessError)throw new Error(`Could not migrate the login allowlist: ${accessError.message}`);
  const {error:prefsError}=await supabase.from('notification_preferences').upsert({workspace_id:workspaceId,email:process.env.NOTIFICATION_EMAIL||ownerEmail,timezone:'Africa/Luanda',quiet_start:'23:00',quiet_end:'07:00',daily_summary_at:'21:00'},{onConflict:'workspace_id'});if(prefsError)throw new Error(`Could not migrate notification settings: ${prefsError.message}`);

  const companyId = (id: number) => deterministicId('company', id);
  const contactId = (id: number) => deterministicId('contact', id);
  const leadId = (id: number) => deterministicId('lead', id);
  const evidenceId = (id: number) => deterministicId('evidence', id);
  const threadId = (thread: string) => deterministicId('thread', thread);
  const legacyMap: Row[] = [];
  const leads = rows('leads');
  const companies = leads.map(lead => ({
    id: companyId(lead.id), workspace_id: workspaceId, name: lead.name, website: lead.website,
    city: lead.city, niche: lead.niche, source: lead.source, synthetic: lead.source === 'Exemplo',
    created_at: lead.createdAt || new Date().toISOString(),
  }));
  const contacts = leads.filter(lead => lead.email).map(lead => ({
    id: contactId(lead.id), workspace_id: workspaceId, company_id: companyId(lead.id),
    full_name: lead.name, email: lead.email, normalized_email: String(lead.email).trim().toLowerCase(),
  }));
  const leadRows = leads.map(lead => ({
    id: leadId(lead.id), workspace_id: workspaceId, company_id: companyId(lead.id),
    contact_id: lead.email ? contactId(lead.id) : null, status: lead.status, score: lead.score || 0,
    score_reasons: (() => { try { return JSON.parse(lead.scoreReasons || '[]'); } catch { return []; } })(),
    last_contact_at: lead.lastContactAt, synthetic: lead.source === 'Exemplo', legacy_id: lead.id,
    created_at: lead.createdAt || new Date().toISOString(),
  }));
  await upsert('companies', companies, 'id');
  await upsert('contacts', contacts, 'id');
  await upsert('leads', leadRows, 'id');
  for (const lead of leads) legacyMap.push({ workspace_id: workspaceId, entity_type: 'leads', legacy_id: lead.id, entity_id: leadId(lead.id) });

  const oldEvidence = rows('evidence');
  const evidenceRows = oldEvidence.map(item => ({
    id: evidenceId(item.id), workspace_id: workspaceId, company_id: companyId(item.leadId),
    finding_type: item.kind === 'website' ? 'potential_improvement' : 'unknown',
    observation: item.observation, source_url: item.sourceUrl, observed_at: item.observedAt,
    confidence: item.confidence, synthetic: leads.find(l => l.id === item.leadId)?.source === 'Exemplo',
  }));
  await upsert('evidence', evidenceRows, 'id');
  for (const item of oldEvidence) legacyMap.push({ workspace_id: workspaceId, entity_type: 'evidence', legacy_id: item.id, entity_id: evidenceId(item.id) });

  const messages = rows('messages');
  const sent = rows('sent');
  const threadKeys = new Set(messages.map(m => String(m.threadId || `legacy-message-${m.id}`)));
  const threadRows = [...threadKeys].map(key => ({
    id: threadId(key), workspace_id: workspaceId,
    lead_id: (() => { const lead = messages.find(m => String(m.threadId || `legacy-message-${m.id}`) === key)?.leadId; return lead ? leadId(lead) : null; })(),
    email_account_id: null, provider_thread_id: key, subject: messages.find(m => String(m.threadId || `legacy-message-${m.id}`) === key)?.subject,
    last_message_at: messages.find(m => String(m.threadId || `legacy-message-${m.id}`) === key)?.receivedAt,
  }));
  await upsert('email_threads', threadRows, 'id');
  const messageRows = messages.map(m => ({
    id: deterministicId('message', m.id), workspace_id: workspaceId,
    thread_id: threadId(String(m.threadId || `legacy-message-${m.id}`)), lead_id: m.leadId ? leadId(m.leadId) : null,
    direction: m.direction, send_state: m.direction === 'outbound' ? 'sent' : null,
    provider_message_id: m.gmailMessageId, sender: m.sender, recipient: m.recipient, subject: m.subject,
    body: m.body, classification: m.classification, confidence: m.confidence,
    synthetic: Boolean(m.synthetic), received_at: m.receivedAt,
  }));
  const sentRows = sent.map(item => ({
    id: deterministicId('sent', item.id), workspace_id: workspaceId,
    lead_id: item.leadId ? leadId(item.leadId) : null, direction: 'outbound', send_state: item.simulated ? 'sent' : 'send_unknown',
    provider_message_id: `legacy-sent-${item.id}`, recipient: item.toEmail, subject: item.subject, body: item.body,
    synthetic: Boolean(item.simulated), sent_at: item.sentAt,
  }));
  await upsert('messages', [...messageRows, ...sentRows], 'id');
  for (const item of messages) legacyMap.push({ workspace_id: workspaceId, entity_type: 'messages', legacy_id: item.id, entity_id: deterministicId('message', item.id) });
  for (const item of sent) legacyMap.push({ workspace_id: workspaceId, entity_type: 'sent', legacy_id: item.id, entity_id: deterministicId('sent', item.id) });

  const tasks = rows('tasks').map(task => ({
    id: deterministicId('task', task.id), workspace_id: workspaceId, lead_id: task.leadId ? leadId(task.leadId) : null,
    kind: task.kind, title: task.title, details: task.details, due_at: task.dueAt, status: task.status,
    completed_at: task.completedAt, created_at: task.createdAt,
  }));
  const activities = rows('activities').map(event => ({
    id: deterministicId('activity', event.id), workspace_id: workspaceId, kind: event.kind, summary: event.message,
    entity_type: event.leadId ? 'lead' : event.campaignId ? 'campaign' : null,
    entity_id: event.leadId ? leadId(event.leadId) : null, created_at: event.createdAt,
  }));
  const suppressed = rows('suppression').map(entry => ({
    workspace_id: workspaceId, normalized_email: String(entry.email).toLowerCase(), reason: entry.reason || 'legacy opt-out',
    source: entry.source || 'sqlite import', created_at: entry.createdAt,
  }));
  await upsert('tasks', tasks, 'id');
  await upsert('activity_events', activities, 'id');
  await upsert('suppression_entries', suppressed, 'workspace_id,normalized_email');
  await upsert('legacy_id_map', legacyMap, 'workspace_id,entity_type,legacy_id');

  console.log(JSON.stringify({ workspaceId, leads: leads.length, syntheticLeads: leads.filter(l => l.source === 'Exemplo').length,
    evidence: evidenceRows.length, messages: messageRows.length + sentRows.length, simulatedSends: sent.filter(s => s.simulated).length,
    tasks: tasks.length, activities: activities.length, suppressed: suppressed.length, credentialsMigrated: false }, null, 2));
}

main().catch(error => { console.error(error instanceof Error ? error.message : 'Migration failed.'); process.exitCode = 1; }).finally(() => legacy.close());
