import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

export const savedJobSchema=z.object({jobId:z.literal('TEST-001'),title:z.string(),stageTitle:z.string(),complete:z.boolean(),revision:z.number().int().nonnegative(),persisted:z.boolean(),updatedAt:z.string().nullable()});
export type SavedJob=z.infer<typeof savedJobSchema>;
export const saveSchema=z.object({complete:z.boolean(),expectedRevision:z.number().int().min(0).max(2147483646),requestId:z.uuid(),approved:z.literal(true)});
export const emptyJob:SavedJob={jobId:'TEST-001',title:'Private connection check',stageTitle:'Confirm my checkbox stays saved',complete:false,revision:0,persisted:false,updatedAt:null};

export async function requireMember(client:SupabaseClient) {
  const {data,error}=await client.rpc('phq_can_access');
  if(error || data!==true) throw new Error('This account has not been granted access to the private test.');
}
export async function readSavedJob(client:SupabaseClient):Promise<SavedJob> {
  await requireMember(client);
  const {data,error}=await client.from('phq_test_states').select('complete,revision,updated_at').maybeSingle();
  if(error) throw new Error('Could not read saved state.');
  return data ? savedJobSchema.parse({...emptyJob,complete:data.complete,revision:data.revision,persisted:data.revision>0,updatedAt:data.updated_at}) : {...emptyJob};
}
export async function saveJob(client:SupabaseClient,input:unknown):Promise<SavedJob> {
  const change=saveSchema.parse(input);
  await requireMember(client);
  const {data,error}=await client.rpc('phq_save_test_completion',{
    p_complete:change.complete,p_expected_revision:change.expectedRevision,p_request_id:change.requestId,p_approved:change.approved,
  });
  if(error) {
    if(error.message.includes('STALE_REVISION')) throw new Error('This job changed elsewhere. Refresh it before saving again.');
    if(error.message.includes('REQUEST_MISMATCH')) throw new Error('The save request ID was already used for a different change.');
    throw new Error('Save could not be confirmed. Retry the same change or refresh the saved state.');
  }
  const verified=await readSavedJob(client);
  if(verified.revision!==data.revision || verified.complete!==data.complete) throw new Error('The job changed during verification. Refresh to see its latest saved state.');
  return verified;
}
