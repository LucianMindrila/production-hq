// Offline import packager. Customer input and generated SQL belong outside this repository.
import { readFile,writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
const [input,output,owner,email]=process.argv.slice(2);
assert.ok(input&&output&&/^[0-9a-f-]{36}$/i.test(owner||'')&&email,'Usage: node scripts/prepare-board-import.mjs input.json output.sql owner-uuid expected-email');
const doc=JSON.parse(await readFile(input,'utf8'));
assert.equal(doc.version,1);assert.equal(doc.source.mode,'imported_copy');assert.ok(Array.isArray(doc.jobs)&&doc.jobs.length<=300);
const ids=new Set(),stages=new Set();
for(const job of doc.jobs){assert.ok(job.id&&!ids.has(job.id));ids.add(job.id);assert.ok(Array.isArray(job.stages)&&job.stages.length<=500);for(const stage of job.stages){assert.ok(stage.id&&!stages.has(stage.id));stages.add(stage.id);assert.ok(['pending','in_progress','blocked','complete'].includes(stage.status));assert.equal(stage.complete,stage.status==='complete');}}
for(const material of doc.materials)assert.ok(ids.has(material.jobId),'Material must reference an existing job');
const payload=JSON.stringify(doc),tag='$phq_'+randomUUID().replaceAll('-','')+'$';assert.ok(!payload.includes(tag));
const sqlString=value=>"'"+value.replaceAll("'","''")+"'";
const migration=await readFile(new URL('../supabase/002_production_board.sql',import.meta.url),'utf8');
const setup=migration.replace('begin;\n','').replace(/commit;\s*$/,'');
const sql=`-- Private Production HQ import. Contains customer information: do not commit or publish.
-- Creates the board schema and imports an approved snapshot for one existing account.
begin;
${setup}
do $guard$ begin
  if not exists(select 1 from auth.users where id=${sqlString(owner)}::uuid and email=${sqlString(email)}) then raise exception 'The expected login was not found. Nothing imported.';end if;
  if not exists(select 1 from public.phq_members where user_id=${sqlString(owner)}::uuid) then raise exception 'Account membership is missing. Nothing imported.';end if;
end; $guard$;
insert into public.phq_boards(owner_id,document)
values (${sqlString(owner)}::uuid,${tag}${payload}${tag}::jsonb)
on conflict(owner_id) do nothing;
do $verify$ declare b jsonb;begin
  select document into b from public.phq_boards where owner_id=${sqlString(owner)}::uuid;
  if b is distinct from ${tag}${payload}${tag}::jsonb then raise exception 'An existing board differs from this import. It has not been overwritten.';end if;
end; $verify$;
commit;
select jsonb_array_length(document->'jobs') as jobs,
  (select count(*) from jsonb_array_elements(document->'jobs') j cross join lateral jsonb_array_elements(j->'stages') s) as subtasks,
  (select count(*) from jsonb_array_elements(document->'jobs') j cross join lateral jsonb_array_elements(j->'stages') s where s->>'complete'='true') as completed_subtasks,
  jsonb_array_length(document->'materials') as material_requirements,
  jsonb_array_length(document->'sourceHistory') as original_history_entries
from public.phq_boards where owner_id=${sqlString(owner)}::uuid;
`;
await writeFile(output,sql,{mode:0o600});
console.log(JSON.stringify({output,jobs:ids.size,stages:stages.size,complete:doc.jobs.flatMap(j=>j.stages).filter(s=>s.complete).length,materials:doc.materials.length,history:doc.sourceHistory.length}));
