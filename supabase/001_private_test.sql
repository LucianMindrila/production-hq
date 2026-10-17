-- Run once in a dedicated Supabase test project. No customer data is imported.
create table public.phq_members (
  user_id uuid primary key references auth.users(id) on delete cascade
);
create table public.phq_oauth_clients (
  client_id text primary key,
  resource text not null check (resource like 'https://%')
);
create table public.phq_test_states (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  complete boolean not null default false,
  revision integer not null default 0 check (revision >= 0),
  updated_at timestamptz
);
create table public.phq_test_history (
  owner_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  expected_revision integer not null,
  before_complete boolean not null,
  after_complete boolean not null,
  after_revision integer not null,
  approved_at timestamptz not null default now(),
  primary key(owner_id, request_id)
);
alter table public.phq_members enable row level security;
alter table public.phq_oauth_clients enable row level security;
alter table public.phq_test_states enable row level security;
alter table public.phq_test_history enable row level security;
revoke all on public.phq_members,public.phq_oauth_clients,public.phq_test_states,public.phq_test_history from anon,authenticated;

-- Membership and the OAuth client's resource binding are checked inside the DB,
-- including when someone calls its REST/RPC endpoints directly.
create function public.phq_can_access() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
    and exists(select 1 from public.phq_members m where m.user_id=auth.uid())
    and (
      nullif(auth.jwt()->>'client_id','') is null
      or exists(select 1 from public.phq_oauth_clients c
        where c.client_id=auth.jwt()->>'client_id'
          and c.resource=auth.jwt()->>'resource'
          and coalesce(auth.jwt()->'phq_permissions','[]'::jsonb) ? 'jobs:read')
    );
$$;
revoke all on function public.phq_can_access() from public,anon;
grant execute on function public.phq_can_access() to authenticated;
grant select on public.phq_test_states,public.phq_test_history to authenticated;
create policy own_test_state on public.phq_test_states for select to authenticated
  using(owner_id=auth.uid() and public.phq_can_access());
create policy own_test_history on public.phq_test_history for select to authenticated
  using(owner_id=auth.uid() and public.phq_can_access());

create function public.phq_save_test_completion(
  p_complete boolean,p_expected_revision integer,p_request_id uuid,p_approved boolean
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  who uuid := auth.uid();
  current_state public.phq_test_states%rowtype;
  previous_request public.phq_test_history%rowtype;
begin
  if not public.phq_can_access() then raise exception 'ACCESS_DENIED'; end if;
  if nullif(auth.jwt()->>'client_id','') is not null
    and not(coalesce(auth.jwt()->'phq_permissions','[]'::jsonb) ? 'jobs:write')
    then raise exception 'ACCESS_DENIED'; end if;
  if p_approved is distinct from true then raise exception 'APPROVAL_REQUIRED'; end if;
  if p_complete is null or p_request_id is null or p_expected_revision is null or p_expected_revision<0
    then raise exception 'INVALID_CHANGE'; end if;
  insert into public.phq_test_states(owner_id) values(who) on conflict do nothing;
  select * into current_state from public.phq_test_states where owner_id=who for update;
  select * into previous_request from public.phq_test_history where owner_id=who and request_id=p_request_id;
  if found then
    if previous_request.after_complete is distinct from p_complete or previous_request.expected_revision<>p_expected_revision
      then raise exception 'REQUEST_MISMATCH'; end if;
    return jsonb_build_object('complete',previous_request.after_complete,'revision',previous_request.after_revision);
  end if;
  if current_state.revision<>p_expected_revision then raise exception 'STALE_REVISION'; end if;
  update public.phq_test_states set complete=p_complete,revision=revision+1,updated_at=now() where owner_id=who;
  insert into public.phq_test_history(owner_id,request_id,expected_revision,before_complete,after_complete,after_revision)
    values(who,p_request_id,p_expected_revision,current_state.complete,p_complete,current_state.revision+1);
  return jsonb_build_object('complete',p_complete,'revision',current_state.revision+1);
end;
$$;
revoke all on function public.phq_save_test_completion(boolean,integer,uuid,boolean) from public,anon;
grant execute on function public.phq_save_test_completion(boolean,integer,uuid,boolean) to authenticated;

-- Enable this function under Authentication > Hooks > Custom Access Token.
-- Keep Supabase's authenticated audience for its Data API, and bind MCP tokens
-- to our exact resource through a separate signed resource claim.
create function public.phq_access_token_hook(event jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  claims jsonb := event->'claims';
  client text := coalesce(event->>'client_id',event->'claims'->>'client_id');
  target text;
begin
  claims := claims - 'resource' - 'phq_permissions';
  select resource into target from public.phq_oauth_clients where client_id=client;
  if found then
    claims := claims || jsonb_build_object('client_id',client,'resource',target,'phq_permissions',jsonb_build_array('jobs:read','jobs:write'));
  end if;
  return jsonb_build_object('claims',claims);
end;
$$;
revoke all on function public.phq_access_token_hook(jsonb) from public,anon,authenticated;
grant usage on schema public to supabase_auth_admin;
grant execute on function public.phq_access_token_hook(jsonb) to supabase_auth_admin;
