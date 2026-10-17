import { configured,settings } from '../../../../lib/config';
import { sessionClient } from '../../../../lib/supabase';
import { readProductionBoard,changeProductionBoard } from '../../../../lib/production-board';
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
async function authorize(){const client=await sessionClient();const {data,error}=await client.auth.getUser();return !error&&data.user?client:null;}
export async function GET(){if(!configured())return json({error:'Setup is incomplete.'},503);const client=await authorize();if(!client)return json({error:'Sign in to continue.'},401);try{return json(await readProductionBoard(client));}catch(e){return json({error:(e as Error).message},403);}}
export async function POST(request:Request){
  if(!configured())return json({error:'Setup is incomplete.'},503);
  if(request.headers.get('Origin')!==settings().origin)return json({error:'Request origin is not allowed.'},403);
  if(!request.headers.get('content-type')?.startsWith('application/json'))return json({error:'JSON required.'},415);
  const client=await authorize();if(!client)return json({error:'Sign in to continue.'},401);
  const raw=await request.text();if(raw.length>65536)return json({error:'Request is too large.'},413);
  try{return json(await changeProductionBoard(client,JSON.parse(raw)));}catch(e){return json({error:(e as Error).message},409);}
}
