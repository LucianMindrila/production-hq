'use server';
import { redirect } from 'next/navigation';
import { safeNext } from '../../lib/config';
import { sessionClient } from '../../lib/supabase';

export async function login(form:FormData) {
  const next=safeNext(form.get('next'));
  const email=String(form.get('email')||'').trim();const password=String(form.get('password')||'');
  if(email.length>254 || password.length>1024 || !email || !password) redirect('/login?error=1&next='+encodeURIComponent(next));
  const client=await sessionClient();
  const {error}=await client.auth.signInWithPassword({email,password});
  if(error) redirect('/login?error=1&next='+encodeURIComponent(next));
  redirect(next);
}
export async function logout() {
  const client=await sessionClient();await client.auth.signOut();redirect('/login');
}
