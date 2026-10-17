import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { configured, settings } from './lib/config';

export async function proxy(request:NextRequest) {
  if(!configured()) return NextResponse.next();
  const c=settings();let response=NextResponse.next({request});
  response.headers.set('Cache-Control','private, no-store');
  const client=createServerClient(c.url,c.key,{cookies:{
    getAll:()=>request.cookies.getAll(),
    setAll:values=>{
      for(const {name,value} of values) request.cookies.set(name,value);
      response=NextResponse.next({request});
      response.headers.set('Cache-Control','private, no-store');
      for(const {name,value,options} of values) response.cookies.set(name,value,options);
    },
  }});
  await client.auth.getClaims();
  return response;
}
export const config={matcher:['/dashboard/:path*','/login','/oauth/consent','/api/private/:path*','/api/oauth/decision']};
