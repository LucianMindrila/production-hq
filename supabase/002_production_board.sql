-- Generic schema only. Never put customer data or imports in the public repository.
begin;
create table if not exists public.phq_boards (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  document jsonb not null check(jsonb_typeof(document->'jobs')='array' and document->>'version'='1'),
  revision integer not null default 0 check(revision>=0),
  updated_at timestamptz not null default now()
);
create table if not exists public.phq_board_history (
  owner_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  expected_revision integer not null,
  after_revision integer not null,
  change jsonb not null,
  before_stage jsonb,
  after_stage jsonb,
  approved_at timestamptz not null default now(),
  primary key(owner_id,request_id)
);
alter table public.phq_boards enable row level security;
alter table public.phq_board_history enable row level security;
revoke all on public.phq_boards,public.phq_board_history from anon,authenticated;
grant select on public.phq_boards,public.phq_board_history to authenticated;
drop policy if exists own_production_board on public.phq_boards;
create policy own_production_board on public.phq_boards for select to authenticated using(owner_id=auth.uid() and public.phq_can_access());
drop policy if exists own_production_history on public.phq_board_history;
create policy own_production_history on public.phq_board_history for select to authenticated using(owner_id=auth.uid() and public.phq_can_access());

create or replace function public.phq_change_board(p_change jsonb,p_expected_revision integer,p_request_id uuid,p_approved boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  who uuid:=auth.uid();
  board public.phq_boards%rowtype;
  prior public.phq_board_history%rowtype;
  job_index integer;
  stage_index integer;
  stage_before jsonb;
  stage_after jsonb;
  new_document jsonb;
  stage_path text[];
begin
  if not public.phq_can_access() then raise exception 'ACCESS_DENIED';end if;
  if nullif(auth.jwt()->>'client_id','') is not null and not(coalesce(auth.jwt()->'phq_permissions','[]'::jsonb)?'jobs:write') then raise exception 'ACCESS_DENIED';end if;
  if p_approved is distinct from true then raise exception 'APPROVAL_REQUIRED';end if;
  if p_request_id is null or p_expected_revision is null or p_expected_revision<0 or jsonb_typeof(p_change) is distinct from 'object' or octet_length(p_change::text)>16000 then raise exception 'INVALID_CHANGE';end if;
  select * into board from public.phq_boards where owner_id=who for update;
  if not found then raise exception 'BOARD_NOT_IMPORTED';end if;
  select * into prior from public.phq_board_history where owner_id=who and request_id=p_request_id;
  if found then
    if prior.change is distinct from p_change or prior.expected_revision<>p_expected_revision then raise exception 'REQUEST_MISMATCH';end if;
    return jsonb_build_object('revision',prior.after_revision);
  end if;
  if board.revision<>p_expected_revision then raise exception 'STALE_REVISION';end if;
  select (ordinality-1)::integer into job_index from jsonb_array_elements(board.document->'jobs') with ordinality where value->>'id'=p_change->>'jobId';
  if job_index is null then raise exception 'JOB_NOT_FOUND';end if;
  if p_change->>'type'='set_stage' then
    if exists(select 1 from jsonb_object_keys(p_change) k where k not in ('type','jobId','stageId','status')) or coalesce(p_change->>'status','') not in ('pending','in_progress','blocked','complete') then raise exception 'INVALID_CHANGE';end if;
    select (ordinality-1)::integer,value into stage_index,stage_before from jsonb_array_elements(board.document->'jobs'->job_index->'stages') with ordinality where value->>'id'=p_change->>'stageId';
    if stage_index is null then raise exception 'STAGE_NOT_FOUND';end if;
    stage_after:=stage_before||jsonb_build_object('status',p_change->>'status','complete',p_change->>'status'='complete');
    stage_path:=array['jobs',job_index::text,'stages',stage_index::text];
    new_document:=jsonb_set(board.document,stage_path,stage_after,false);
  elsif p_change->>'type'='add_stage' then
    if exists(select 1 from jsonb_object_keys(p_change) k where k not in ('type','jobId','title','due','responsible','comments')) or jsonb_typeof(p_change->'title') is distinct from 'string' or length(btrim(p_change->>'title')) not between 1 and 500 then raise exception 'INVALID_CHANGE';end if;
    if exists(select 1 from jsonb_each(p_change) e where e.key in ('due','responsible','comments') and jsonb_typeof(e.value)<>'string') or length(coalesce(p_change->>'due',''))>100 or length(coalesce(p_change->>'responsible',''))>200 or length(coalesce(p_change->>'comments',''))>4000 then raise exception 'INVALID_CHANGE';end if;
    if jsonb_array_length(board.document->'jobs'->job_index->'stages')>=500 then raise exception 'TOO_MANY_STAGES';end if;
    stage_after:=jsonb_build_object('id','ST-'||p_request_id::text,'title',btrim(p_change->>'title'),'complete',false,'status','pending','due',coalesce(p_change->>'due',''),'responsible',coalesce(p_change->>'responsible',''),'comments',coalesce(p_change->>'comments',''),'recorded',to_char(now() at time zone 'Europe/London','YYYY-MM-DD'));
    stage_path:=array['jobs',job_index::text,'stages'];
    new_document:=jsonb_set(board.document,stage_path,(board.document#>stage_path)||jsonb_build_array(stage_after),false);
  else raise exception 'INVALID_CHANGE';end if;
  update public.phq_boards set document=new_document,revision=revision+1,updated_at=now() where owner_id=who;
  insert into public.phq_board_history(owner_id,request_id,expected_revision,after_revision,change,before_stage,after_stage) values(who,p_request_id,p_expected_revision,board.revision+1,p_change,stage_before,stage_after);
  return jsonb_build_object('revision',board.revision+1);
end;
$$;
revoke all on function public.phq_change_board(jsonb,integer,uuid,boolean) from public,anon;
grant execute on function public.phq_change_board(jsonb,integer,uuid,boolean) to authenticated;
commit;
