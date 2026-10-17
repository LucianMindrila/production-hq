import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createMcpHandler } from 'mcp-handler';
import { z } from 'zod';
import { configured, settings } from '../../../lib/config';
import { challenge, verifyMcpToken } from '../../../lib/mcp-auth';
import { tokenClient } from '../../../lib/supabase';
import { readSavedJob, saveJob, saveSchema, savedJobSchema } from '../../../lib/saved-job';

export const runtime='nodejs';export const maxDuration=30;
const URI='ui://production-hq/saved-test-v1.html';
async function handle(request:Request) {
  if(!configured()) return Response.json({error:'Secure test setup is not complete.'},{status:503,headers:{'Cache-Control':'no-store'}});
  const c=settings();const token=request.headers.get('Authorization')?.match(/^Bearer ([^\s]+)$/i)?.[1];
  try {if(!token) throw new Error('Missing bearer token');await verifyMcpToken(token,c);}
  catch {return Response.json({error:'Sign in to Production HQ to continue.'},{status:401,headers:{'WWW-Authenticate':challenge(),'Cache-Control':'no-store'}});}
  const client=tokenClient(token!);
  // One handler per request: the user's credentials are never shared across requests.
  const handler=createMcpHandler(server=>{
    server.registerResource('saved-test-card',URI,{title:'Private saved test job',mimeType:'text/html;profile=mcp-app'},async()=>({contents:[{
      uri:URI,mimeType:'text/html;profile=mcp-app',text:await readFile(path.join(process.cwd(),'public/saved-test.html'),'utf8'),
      _meta:{ui:{prefersBorder:true,csp:{connectDomains:[],resourceDomains:[]}}},
    }]}));
    const read=async()=>({content:[{type:'text' as const,text:'Private test job loaded from your account.'}],structuredContent:await readSavedJob(client)});
    const auth={securitySchemes:[{type:'oauth2',scopes:[]}]};
    server.registerTool('show_saved_test_job',{
      title:'Show my saved test job',description:'Open your authenticated private test checkbox with its saved revision. Google Sheets is not connected.',
      inputSchema:z.object({}),outputSchema:savedJobSchema,
      annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false},
      _meta:{...auth,ui:{resourceUri:URI,visibility:['model','app']},'openai/outputTemplate':URI,'openai/widgetAccessible':true},
    },read);
    server.registerTool('get_saved_test_job',{
      title:'Refresh my saved test job',description:'Read the latest saved test checkbox and revision for the authenticated account.',
      inputSchema:z.object({}),outputSchema:savedJobSchema,
      annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false},_meta:{...auth,ui:{visibility:['model','app']},'openai/widgetAccessible':true},
    },read);
    server.registerTool('save_test_completion',{
      title:'Save approved test checkbox change',description:'Save an explicitly approved test checkbox change. Obtain user approval first. Use the revision from the latest read and a unique request UUID, reusing it for retries of the same operation. Appends history and verifies the saved state.',
      inputSchema:saveSchema,outputSchema:savedJobSchema,
      annotations:{readOnlyHint:false,destructiveHint:false,openWorldHint:false,idempotentHint:true},
      _meta:{...auth,ui:{visibility:['model','app']},'openai/widgetAccessible':true},
    },async input=>({content:[{type:'text' as const,text:'Approved change saved and read back from the database.'}],structuredContent:await saveJob(client,input)}));
  },{serverInfo:{name:'production-hq-private-test',version:'0.2.0'}});
  const response=await handler(request);response.headers.set('Cache-Control','private, no-store');return response;
}
export {handle as GET,handle as POST,handle as DELETE};
