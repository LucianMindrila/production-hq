import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { requireMember } from './saved-job';

const text=z.string().max(8000);
export const stageSchema=z.object({id:text,title:text,complete:z.boolean(),status:z.enum(['pending','in_progress','blocked','complete']),due:text,responsible:text,comments:text,recorded:text});
export const jobSchema=z.object({id:text,company:text,customer:text,title:text,delivery:text,status:text,priority:text,nextAction:text,notes:text,createdAt:text.optional(),archivedAt:text.nullable().optional(),stages:z.array(stageSchema).max(500)});
export const documentSchema=z.object({version:z.literal(1),source:z.object({url:text,readAt:text,mode:z.literal('imported_copy')}),jobs:z.array(jobSchema).max(300),materials:z.array(z.record(z.string(),z.unknown())).max(1000),sourceHistory:z.array(z.record(z.string(),z.unknown())).max(5000)}).superRefine((doc,ctx)=>{
  const jobs=new Set<string>(),stages=new Set<string>();
  for(const job of doc.jobs){if(!job.id || jobs.has(job.id))ctx.addIssue({code:'custom',message:'Duplicate or missing job ID'});jobs.add(job.id);
    for(const stage of job.stages){if(!stage.id || stages.has(stage.id))ctx.addIssue({code:'custom',message:'Duplicate or missing stage ID'});stages.add(stage.id);if(stage.complete!==(stage.status==='complete'))ctx.addIssue({code:'custom',message:'Stage status does not match completion'});}}
  for(const line of doc.materials)if(!jobs.has(String(line.jobId)))ctx.addIssue({code:'custom',message:'Material references missing job'});
});
export const boardSchema=z.object({available:z.boolean(),revision:z.number().int().nonnegative(),document:documentSchema.nullable(),updatedAt:z.string().nullable()});
export type Board=z.infer<typeof boardSchema>;
const newStageSchema=z.object({title:z.string().trim().min(1).max(500),due:z.string().max(100).default(''),responsible:z.string().max(200).default(''),comments:z.string().max(4000).default('')}).strict();
export const boardChangeSchema=z.discriminatedUnion('type',[
  z.object({type:z.literal('set_stage'),jobId:z.string().min(1).max(100),stageId:z.string().min(1).max(100),status:z.enum(['pending','in_progress','blocked','complete'])}).strict(),
  z.object({type:z.literal('add_stage'),jobId:z.string().min(1).max(100),title:z.string().trim().min(1).max(500),due:z.string().max(100).default(''),responsible:z.string().max(200).default(''),comments:z.string().max(4000).default('')}).strict(),
  z.object({type:z.literal('create_job'),company:z.enum(['DTS','Cutting Edge']),customer:z.string().trim().min(1).max(200),title:z.string().trim().min(1).max(500),delivery:z.string().max(100).default(''),priority:z.enum(['Normal','High']).default('Normal'),nextAction:z.string().max(1000).default(''),notes:z.string().max(4000).default(''),stages:z.array(newStageSchema).max(100).default([])}).strict(),
  z.object({type:z.literal('archive_job'),jobId:z.string().min(1).max(100)}).strict(),
  z.object({type:z.literal('restore_job'),jobId:z.string().min(1).max(100)}).strict(),
]);
export const boardSaveSchema=z.object({change:boardChangeSchema,expectedRevision:z.number().int().min(0).max(2147483646),requestId:z.uuid(),approved:z.literal(true)}).strict();
export async function readProductionBoard(client:SupabaseClient):Promise<Board>{
  await requireMember(client);
  const {data,error}=await client.from('phq_boards').select('document,revision,updated_at').maybeSingle();
  if(error)throw new Error('The production board is not available. Ask your administrator to finish the board setup.');
  return boardSchema.parse(data?{available:true,document:data.document,revision:data.revision,updatedAt:data.updated_at}:{available:false,document:null,revision:0,updatedAt:null});
}
export async function changeProductionBoard(client:SupabaseClient,input:unknown):Promise<Board>{
  const value=boardSaveSchema.parse(input);await requireMember(client);
  const {data,error}=await client.rpc('phq_change_board',{p_change:value.change,p_expected_revision:value.expectedRevision,p_request_id:value.requestId,p_approved:value.approved});
  if(error){if(error.message.includes('STALE_REVISION'))throw new Error('The board changed elsewhere. Reload before saving.');if(error.message.includes('REQUEST_MISMATCH'))throw new Error('This request ID belongs to another change.');if(error.message.includes('JOB_NOT_COMPLETE'))throw new Error('Complete every subtask before archiving this job.');if(error.message.includes('JOB_ARCHIVED'))throw new Error('Restore the archived job before changing its subtasks.');if(error.message.includes('TOO_MANY_JOBS'))throw new Error('The board has reached its job limit. Contact your administrator.');throw new Error('The change was not confirmed. Retry the same change or reload the board.');}
  const verified=await readProductionBoard(client);
  if(verified.revision!==data.revision)throw new Error('The board changed during verification. Reload to see the latest version.');
  return verified;
}
