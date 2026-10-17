import { configured, settings } from '../../../lib/config';
export function GET() {
  if(!configured()) return Response.json({error:'OAuth setup is not complete.'},{status:503});
  const c=settings();
  return Response.json({resource:c.resource,authorization_servers:[c.url+'/auth/v1'],bearer_methods_supported:['header'],resource_name:'Production HQ private test'}, {headers:{'Cache-Control':'no-store','Access-Control-Allow-Origin':'*'}});
}
export function OPTIONS() {return new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, OPTIONS'}});}
