import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { settings } from './config';

export async function sessionClient() {
  const c=settings();const jar=await cookies();
  return createServerClient(c.url,c.key,{cookies:{
    getAll:()=>jar.getAll(),
    setAll:values=>{try {for(const {name,value,options} of values) jar.set(name,value,options);} catch { /* Server components use proxy.ts to refresh cookies. */ }},
  }});
}
export function tokenClient(token:string) {
  const c=settings();
  return createClient(c.url,c.key,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
}
