-- Adds job creation and reversible archiving. Does not reimport or delete records.
begin;
alter table public.phq_board_history add column if not exists before_job jsonb;
alter table public.phq_board_history add column if not exists after_job jsonb;
do $migration$ begin
  if to_regprocedure('public.phq_change_stage_v1(jsonb,integer,uuid,boolean)') is null then
    alter function public.phq_change_board(jsonb,integer,uuid,boolean) rename to phq_change_stage_v1;
  end if;
end; $migration$;
revoke all on function public.phq_change_stage_v1(jsonb,integer,uuid,boolean) from public,anon,authenticated;

create or replace function public.phq_change_board(p_change jsonb,p_expected_revision integer,p_request_id uuid,p_approved boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  who uuid:=auth.uid();
  board public.phq_boards%rowtype;
  prior public.phq_board_history%rowtype;
  job_index integer;
  before_job jsonb;
  after_job jsonb;
  new_document jsonb;
  job_prefix text;
  job_number integer;
  job_id text;
  new_stages jsonb:='[]'::jsonb;
  item jsonb;
  item_index integer:=0;
begin
  if not public.phq_can_access() then raise exception 'ACCESS_DENIED';end if;
  if nullif(auth.jwt()->>'client_id','') is not null and not(coalesce(auth.jwt()->'phq_permissions','[]'::jsonb)?'jobs:write') then raise exception 'ACCESS_DENIED';end if;
  if p_approved is distinct from true then raise exception 'APPROVAL_REQUIRED';end if;
  if p_request_id is null or p_expected_revision is null or p_expected_revision<0 or jsonb_typeof(p_change) is distinct from 'object' or octet_length(p_change::text)>65536 then raise exception 'INVALID_CHANGE';end if;
  select * into board from public.phq_boards where owner_id=who for update;
  if not found then raise exception 'BOARD_NOT_IMPORTED';end if;
  select * into prior from public.phq_board_history where owner_id=who and request_id=p_request_id;
  if found then
    if prior.change is distinct from p_change or prior.expected_revision<>p_expected_revision then raise exception 'REQUEST_MISMATCH';end if;
    return jsonb_build_object('revision',prior.after_revision);
  end if;
  if board.revision<>p_expected_revision then raise exception 'STALE_REVISION';end if;
  if p_change->>'type'='create_job' then
    if exists(select 1 from jsonb_object_keys(p_change) k where k not in ('type','company','customer','title','delivery','priority','nextAction','notes','stages')) then raise exception 'INVALID_CHANGE';end if;
    if coalesce(p_change->>'company','') not in ('DTS','Cutting Edge') or jsonb_typeof(p_change->'customer') is distinct from 'string' or length(btrim(p_change->>'customer')) not between 1 and 200 or jsonb_typeof(p_change->'title') is distinct from 'string' or length(btrim(p_change->>'title')) not between 1 and 500 then raise exception 'INVALID_CHANGE';end if;
    if exists(select 1 from jsonb_each(p_change) e where e.key in ('delivery','priority','nextAction','notes') and jsonb_typeof(e.value)<>'string') or length(coalesce(p_change->>'delivery',''))>100 or coalesce(p_change->>'priority','Normal') not in ('Normal','High') or length(coalesce(p_change->>'nextAction',''))>1000 or length(coalesce(p_change->>'notes',''))>4000 then raise exception 'INVALID_CHANGE';end if;
    if jsonb_typeof(coalesce(p_change->'stages','[]'::jsonb)) is distinct from 'array' then raise exception 'INVALID_CHANGE';end if;
    if jsonb_array_length(coalesce(p_change->'stages','[]'::jsonb))>100 then raise exception 'INVALID_CHANGE';end if;
    if jsonb_array_length(board.document->'jobs')>=300 then raise exception 'TOO_MANY_JOBS';end if;
    for item in select value from jsonb_array_elements(coalesce(p_change->'stages','[]'::jsonb)) loop
      if jsonb_typeof(item) is distinct from 'object' then raise exception 'INVALID_CHANGE';end if;
      if exists(select 1 from jsonb_object_keys(item) k where k not in ('title','due','responsible','comments')) or jsonb_typeof(item->'title') is distinct from 'string' or length(btrim(item->>'title')) not between 1 and 500 then raise exception 'INVALID_CHANGE';end if;
      if exists(select 1 from jsonb_each(item) e where e.key in ('due','responsible','comments') and jsonb_typeof(e.value)<>'string') or length(coalesce(item->>'due',''))>100 or length(coalesce(item->>'responsible',''))>200 or length(coalesce(item->>'comments',''))>4000 then raise exception 'INVALID_CHANGE';end if;
      item_index:=item_index+1;
      new_stages:=new_stages||jsonb_build_array(jsonb_build_object('id','ST-'||p_request_id::text||'-'||item_index::text,'title',btrim(item->>'title'),'complete',false,'status','pending','due',coalesce(item->>'due',''),'responsible',coalesce(item->>'responsible',''),'comments',coalesce(item->>'comments',''),'recorded',to_char(now() at time zone 'Europe/London','YYYY-MM-DD')));
    end loop;
    job_prefix:=case when p_change->>'company'='DTS' then 'DTS' else 'CE' end;
    select coalesce(max(substring(value->>'id' from ('^'||job_prefix||'-([0-9]+)$'))::integer),0)+1 into job_number from jsonb_array_elements(board.document->'jobs');
    job_id:=job_prefix||'-'||lpad(job_number::text,greatest(3,length(job_number::text)), '0');
    after_job:=jsonb_build_object('id',job_id,'company',p_change->>'company','customer',btrim(p_change->>'customer'),'title',btrim(p_change->>'title'),'delivery',coalesce(p_change->>'delivery',''),'status','New','priority',coalesce(p_change->>'priority','Normal'),'nextAction',coalesce(p_change->>'nextAction',''),'notes',coalesce(p_change->>'notes',''),'stages',new_stages,'createdAt',now(),'archivedAt',null);
    new_document:=jsonb_set(board.document,array['jobs'],(board.document->'jobs')||jsonb_build_array(after_job),false);
  else
    select (ordinality-1)::integer,value into job_index,before_job from jsonb_array_elements(board.document->'jobs') with ordinality where value->>'id'=p_change->>'jobId';
    if job_index is null then raise exception 'JOB_NOT_FOUND';end if;
    if p_change->>'type' in ('set_stage','add_stage') then
      if nullif(before_job->>'archivedAt','') is not null then raise exception 'JOB_ARCHIVED';end if;
      return public.phq_change_stage_v1(p_change,p_expected_revision,p_request_id,p_approved);
    end if;
    if exists(select 1 from jsonb_object_keys(p_change) k where k not in ('type','jobId')) then raise exception 'INVALID_CHANGE';end if;
    if p_change->>'type'='archive_job' then
      if jsonb_array_length(before_job->'stages')=0 or exists(select 1 from jsonb_array_elements(before_job->'stages') s where s->>'complete' is distinct from 'true') then raise exception 'JOB_NOT_COMPLETE';end if;
      if nullif(before_job->>'archivedAt','') is not null then raise exception 'JOB_ALREADY_ARCHIVED';end if;
      after_job:=before_job||jsonb_build_object('archivedAt',now());
    elsif p_change->>'type'='restore_job' then
      if nullif(before_job->>'archivedAt','') is null then raise exception 'JOB_NOT_ARCHIVED';end if;
      after_job:=before_job||jsonb_build_object('archivedAt',null);
    else raise exception 'INVALID_CHANGE';end if;
    new_document:=jsonb_set(board.document,array['jobs',job_index::text],after_job,false);
  end if;
  update public.phq_boards set document=new_document,revision=revision+1,updated_at=now() where owner_id=who;
  insert into public.phq_board_history(owner_id,request_id,expected_revision,after_revision,change,before_job,after_job) values(who,p_request_id,p_expected_revision,board.revision+1,p_change,before_job,after_job);
  return jsonb_build_object('revision',board.revision+1);
end;
$$;
revoke all on function public.phq_change_board(jsonb,integer,uuid,boolean) from public,anon;
grant execute on function public.phq_change_board(jsonb,integer,uuid,boolean) to authenticated;
commit;
