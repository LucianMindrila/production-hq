import { settings } from '../../../../lib/config';
import { sessionClient } from '../../../../lib/supabase';
import { requireMember } from '../../../../lib/saved-job';
export async function POST(request:Request) {
  if(request.headers.get('Origin')!==settings().origin) return new Response('Request origin is not allowed.',{status:403});
  const form=await request.formData();const id=form.get('authorization_id');const decision=form.get('decision');
  if(typeof id!=='string' || !id || id.length>512 || !['approve','deny'].includes(String(decision))) return new Response('Invalid request.',{status:400});
  const client=await sessionClient();const {data,error}=await client.auth.getUser();
  if(error || !data.user) return new Response('Sign in again.',{status:401});
  try{await requireMember(client);}catch{return new Response('Access has not been granted.',{status:403});}
  const result=decision==='approve' ? await client.auth.oauth.approveAuthorization(id,{skipBrowserRedirect:true}) : await client.auth.oauth.denyAuthorization(id,{skipBrowserRedirect:true});
  if(result.error || !result.data) return new Response('Connection request could not be completed. Start again in ChatGPT.',{status:400});
  return Response.redirect(result.data.redirect_url,303);
}
