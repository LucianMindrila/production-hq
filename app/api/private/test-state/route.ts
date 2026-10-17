import { configured, settings } from '../../../../lib/config';
import { sessionClient } from '../../../../lib/supabase';
import { readSavedJob, saveJob } from '../../../../lib/saved-job';

const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
async function authorize() {
  const client=await sessionClient();const {data,error}=await client.auth.getUser();
  if(error || !data.user) return null;
  return client;
}
export async function GET() {
  if(!configured()) return json({error:'Secure test setup is not complete.'},503);
  const client=await authorize();if(!client) return json({error:'Sign in to continue.'},401);
  try{return json(await readSavedJob(client));}catch(e){return json({error:(e as Error).message},403);}
}
export async function POST(request:Request) {
  if(!configured()) return json({error:'Secure test setup is not complete.'},503);
  if(request.headers.get('Origin')!==settings().origin) return json({error:'Request origin is not allowed.'},403);
  if(!request.headers.get('content-type')?.startsWith('application/json')) return json({error:'JSON required.'},415);
  const client=await authorize();if(!client) return json({error:'Sign in to continue.'},401);
  const raw=await request.text();if(raw.length>2048) return json({error:'Request is too large.'},413);
  try{return json(await saveJob(client,JSON.parse(raw)));}catch(e){return json({error:(e as Error).message},409);}
}
