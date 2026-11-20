'use client';

import { useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, LockKeyhole } from 'lucide-react';
import { getSupabaseBrowser } from '@/lib/supabase/browser';

export default function LoginPage() {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  useEffect(()=>{
    const params=new URLSearchParams(window.location.search);
    const reason=params.get('error');
    if(reason==='not_allowed')setError('This Google account is not on the workspace allowlist.');
    else if(reason==='workspace')setError('Your Google account was accepted, but the workspace is not provisioned yet.');
    else if(reason==='auth')setError('Google sign-in could not be completed. Check the Supabase Google provider and callback URL.');
  },[]);
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
    <div className="login-brand"><span className="brand-symbol"><span>D</span></span><div><b>DEVREFRACT</b><small>PERSONAL OUTREACH</small></div></div>
    <div className="login-lock"><LockKeyhole size={18}/><span>PRIVATE WORKSPACE</span></div>
    <h1>Welcome back.</h1><p>Your leads, conversations, and next steps are waiting.</p>
    <button className="button-primary login-submit" onClick={()=>void submit()} disabled={busy}>{busy?'Opening Google…':'Sign in with Google'} <ArrowRight size={16}/></button>
    {notice&&<div className="login-message success"><CheckCircle2 size={16}/>{notice}</div>}{error&&<div className="login-message failure">{error}</div>}
    <small className="login-footnote">Access is limited to approved workspace accounts. Gmail sending accounts connect separately.</small>
  </section></main>;
}
