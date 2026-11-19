'use client';

import { useState } from 'react';
import { ArrowRight, CheckCircle2, LockKeyhole } from 'lucide-react';
import { getSupabaseBrowser } from '@/lib/supabase/browser';

export default function LoginPage() {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  async function submit() {
    setBusy(true); setNotice(''); setError('');
    try {
      const supabase=getSupabaseBrowser();if(!supabase)throw new Error('Hosted sign-in is not configured yet.');
      const {error}=await supabase.auth.signInWithOAuth({provider:'google',options:{redirectTo:new URL('/auth/callback',window.location.origin).toString(),queryParams:{hd:'gmail.com',prompt:'select_account'}}});
      if(error)throw error;
      setNotice('Redirecting to Google…');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not start Google sign-in.'); }
    finally { setBusy(false); }
  }
  return <main className="login-shell"><section className="login-panel">
    <div className="login-brand"><span className="brand-symbol"><span>D</span></span><div><b>DEVREFRACT</b><small>OUTREACH WORKSPACE</small></div></div>
    <div className="login-lock"><LockKeyhole size={18}/><span>PRIVATE WORKSPACE</span></div>
    <h1>Welcome back.</h1><p>Your leads, conversations, and next steps are waiting.</p>
    <button className="button-primary login-submit" onClick={()=>void submit()} disabled={busy}>{busy?'Opening Google…':'Sign in with Google'} <ArrowRight size={16}/></button>
    {notice&&<div className="login-message success"><CheckCircle2 size={16}/>{notice}</div>}{error&&<div className="login-message failure">{error}</div>}
    <small className="login-footnote">Access is limited to approved workspace accounts. Gmail sending accounts connect separately.</small>
  </section></main>;
}
