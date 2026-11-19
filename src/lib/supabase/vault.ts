import 'server-only';
import crypto from 'node:crypto';
import { getSupabaseAdmin } from './server';

const allowedSecrets = new Set(['googleClientId','googleClientSecret','groqKey','nvidiaKey','huggingfaceKey']);
function keyBytes() {
  const raw = process.env.APP_ENCRYPTION_KEY || '';
  if (!raw) throw new Error('Set APP_ENCRYPTION_KEY on the server before saving secrets.');
  const key = /^[a-f0-9]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error('APP_ENCRYPTION_KEY must encode exactly 32 bytes (64 hex characters or base64).');
  return key;
}
export function encryptSecret(value: string) {
  const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', keyBytes(), iv);
  const body = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return `v1:${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${body.toString('base64')}`;
}
export function decryptSecret(ciphertext: string) {
  const [version, iv, tag, body] = ciphertext.split(':');
  if (version !== 'v1' || !iv || !tag || !body) throw new Error('Unsupported encrypted secret format.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', keyBytes(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(body, 'base64')), decipher.final()]).toString('utf8');
}
export async function saveCloudSecret(workspaceId: string, name: string, value: string) {
  if (!allowedSecrets.has(name)) throw new Error('Unknown secret name.');
  const admin = getSupabaseAdmin(); if (!admin) throw new Error('Supabase is not configured.');
  const ciphertext = encryptSecret(value);
  const { error } = await admin.from('encrypted_secrets').upsert({ workspace_id: workspaceId, secret_name: name, ciphertext, updated_at: new Date().toISOString() }, { onConflict: 'workspace_id,secret_name' });
  if (error) throw new Error(`Could not save ${name}: ${error.message}`);
}
export async function readCloudSecret(workspaceId: string, name: string) {
  const envName: Record<string,string> = { googleClientId:'GOOGLE_CLIENT_ID', googleClientSecret:'GOOGLE_CLIENT_SECRET', groqKey:'GROQ_API_KEY', nvidiaKey:'NVIDIA_API_KEY', huggingfaceKey:'HUGGINGFACE_API_KEY' };
  const fromEnv = process.env[envName[name] || '']; if (fromEnv) return fromEnv;
  const admin = getSupabaseAdmin(); if (!admin) return '';
  const { data, error } = await admin.from('encrypted_secrets').select('ciphertext').eq('workspace_id', workspaceId).eq('secret_name', name).maybeSingle();
  if (error) throw new Error(`Could not read provider configuration: ${error.message}`);
  return data?.ciphertext ? decryptSecret(data.ciphertext) : '';
}
export async function cloudSecretStatus(workspaceId: string) {
  const admin = getSupabaseAdmin(); if (!admin) return {};
  const { data } = await admin.from('encrypted_secrets').select('secret_name').eq('workspace_id', workspaceId);
  const set = new Set((data || []).map(row => row.secret_name));
  return {
    googleClientIdConfigured: String(Boolean(process.env.GOOGLE_CLIENT_ID || set.has('googleClientId'))),
    googleClientSecretConfigured: String(Boolean(process.env.GOOGLE_CLIENT_SECRET || set.has('googleClientSecret'))),
    groqKeyConfigured: String(Boolean(process.env.GROQ_API_KEY || set.has('groqKey'))),
    nvidiaKeyConfigured: String(Boolean(process.env.NVIDIA_API_KEY || set.has('nvidiaKey'))),
    huggingfaceKeyConfigured: String(Boolean(process.env.HUGGINGFACE_API_KEY || set.has('huggingfaceKey'))),
  };
}
