import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createMcpHandler } from 'mcp-handler';
import { z } from 'zod';
import { configured, settings } from '../../../lib/config';
import { challenge, verifyMcpToken } from '../../../lib/mcp-auth';
import { tokenClient } from '../../../lib/supabase';
import { readSavedJob, saveJob, saveSchema, savedJobSchema } from '../../../lib/saved-job';
import { readProductionBoard,changeProductionBoard,boardSchema,boardSaveSchema } from '../../../lib/production-board';

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
    const BOARD_URI='ui://production-hq/production-board-v3.html';
    server.registerResource('production-board',BOARD_URI,{title:'Production HQ job board',mimeType:'text/html;profile=mcp-app'},async()=>({contents:[{uri:BOARD_URI,mimeType:'text/html;profile=mcp-app',text:await readFile(path.join(process.cwd(),'public/production-board.html'),'utf8'),_meta:{ui:{prefersBorder:true,csp:{connectDomains:[],resourceDomains:[]}}}}]}));
    server.registerResource('saved-test-card',URI,{title:'Private saved test job',mimeType:'text/html;profile=mcp-app'},async()=>({contents:[{
      uri:URI,mimeType:'text/html;profile=mcp-app',text:await readFile(path.join(process.cwd(),'public/saved-test.html'),'utf8'),
      _meta:{ui:{prefersBorder:true,csp:{connectDomains:[],resourceDomains:[]}}},
    }]}));
    const read=async()=>({content:[{type:'text' as const,text:'Private test job loaded from your account.'}],structuredContent:await readSavedJob(client)});
    const auth={securitySchemes:[{type:'oauth2',scopes:[]}]};
    const boardRead=async()=>({content:[{type:'text' as const,text:'Production board read from your account. This is the imported copy; changes are saved here and are not automatically written to Google Sheets.'}],structuredContent:await readProductionBoard(client)});
    server.registerTool('show_production_board',{title:'Show production jobs',description:'Open current or archived production jobs, subtasks, materials and progress. Supports new jobs with initial tasks, stage updates, archiving completed jobs and restoring them. This imported copy does not automatically sync to Google Sheets.',inputSchema:z.object({}),outputSchema:boardSchema,annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false},_meta:{...auth,ui:{resourceUri:BOARD_URI,visibility:['model','app']},'openai/outputTemplate':BOARD_URI,'openai/widgetAccessible':true}},boardRead);
    server.registerTool('get_production_board',{title:'Read latest production jobs',description:'Read current saved jobs, stages, statuses, notes, materials, original history and board revision. Do not infer completion from dates. Google Sheets is a source snapshot, not a live sync.',inputSchema:z.object({}),outputSchema:boardSchema,annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false},_meta:{...auth,ui:{visibility:['model','app']},'openai/widgetAccessible':true}},boardRead);
    server.registerTool('change_production_stage',{title:'Save an approved production change',description:'Obtain explicit approval of the proposed details before saving. Set stage status, add a subtask, create_job with business/customer/description and initial stages, archive_job after all stages are complete, or restore_job. New jobs receive stable IDs and incomplete stages; never invent dates, owners or completion. Archiving retains records and history and hides them from Current jobs. Restore before changing archived subtasks. Use the latest board revision and a new request UUID; reuse the UUID for retries. Saves history and reads back. Does not update Google Sheets.',inputSchema:boardSaveSchema,outputSchema:boardSchema,annotations:{readOnlyHint:false,destructiveHint:false,openWorldHint:false,idempotentHint:true},_meta:{...auth,ui:{visibility:['model','app']},'openai/widgetAccessible':true}},async input=>({content:[{type:'text' as const,text:'Approved production change saved and read back.'}],structuredContent:await changeProductionBoard(client,input)}));
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
  },{serverInfo:{name:'production-hq-private-test',version:'0.4.0'}});
  const response=await handler(request);response.headers.set('Cache-Control','private, no-store');return response;
}
export {handle as GET,handle as POST,handle as DELETE};
