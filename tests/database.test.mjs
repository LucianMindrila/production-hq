import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('Postgres enforces membership, isolated records, approval, revisions, idempotency and immutable history',async()=>{
  const db=new PGlite();
  const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222',outsider='33333333-3333-4333-8333-333333333333';
  try {
    await db.exec(`create role anon;create role authenticated;create role supabase_auth_admin;create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
      create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
      grant usage on schema public,auth to authenticated;grant execute on function auth.jwt(),auth.uid() to authenticated;
      insert into auth.users values('${a}'),('${b}'),('${outsider}');`);
    await db.exec(await readFile(new URL('../supabase/001_private_test.sql',import.meta.url),'utf8'));
    const resource='https://production-hq-seven.vercel.app/api/secure-mcp';
    await db.query('insert into public.phq_members values($1),($2)',[a,b]);
    await db.query('insert into public.phq_oauth_clients values($1,$2)',['registered-client',resource]);
    async function as(user,extra={}) {
      await db.exec('reset role');
      await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:user,role:'authenticated',...extra})]);
      await db.exec('set role authenticated');
    }
    const save=(complete,revision,request,approved=true)=>db.query('select public.phq_save_test_completion($1,$2,$3,$4) as receipt',[complete,revision,request,approved]);
    const r1='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',r2='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    await as(a);
    await assert.rejects(()=>save(true,0,r1,false),/APPROVAL_REQUIRED/);
    assert.deepEqual((await save(true,0,r1)).rows[0].receipt,{complete:true,revision:1});
    assert.deepEqual((await save(true,0,r1)).rows[0].receipt,{complete:true,revision:1});
    assert.equal((await db.query('select count(*)::int as n from public.phq_test_history')).rows[0].n,1);
    await assert.rejects(()=>save(false,0,r1),/REQUEST_MISMATCH/);
    await assert.rejects(()=>save(false,0,r2),/STALE_REVISION/);
    assert.deepEqual((await save(false,1,r2)).rows[0].receipt,{complete:false,revision:2});
    assert.equal((await db.query('select revision from public.phq_test_states')).rows[0].revision,2);
    await assert.rejects(()=>db.exec('update public.phq_test_states set complete=true'),/permission denied/);
    await assert.rejects(()=>db.exec('delete from public.phq_test_history'),/permission denied/);
    await as(b);assert.equal((await db.query('select * from public.phq_test_states')).rows.length,0);
    await save(true,0,r1);assert.equal((await db.query('select revision from public.phq_test_states')).rows[0].revision,1);
    await as(outsider);assert.equal((await db.query('select public.phq_can_access() as ok')).rows[0].ok,false);
    await assert.rejects(()=>save(true,0,r1),/ACCESS_DENIED/);
    await as(a,{client_id:'unknown',resource,phq_permissions:['jobs:read','jobs:write']});
    await assert.rejects(()=>save(true,2,r1),/ACCESS_DENIED/);
    await as(a,{client_id:'registered-client',resource:'https://wrong.example',phq_permissions:['jobs:read','jobs:write']});
    assert.equal((await db.query('select * from public.phq_test_states')).rows.length,0);
    await as(a,{client_id:'registered-client',resource,phq_permissions:['jobs:read']});
    assert.equal((await db.query('select * from public.phq_test_states')).rows.length,1);
    await assert.rejects(()=>save(true,2,r1),/ACCESS_DENIED/);
    await db.exec('reset role');
    const hook=await db.query('select public.phq_access_token_hook($1::jsonb) as token',[JSON.stringify({client_id:'registered-client',claims:{aud:'authenticated',sub:a,role:'authenticated'}})]);
    assert.equal(hook.rows[0].token.claims.resource,resource);
    assert.deepEqual(hook.rows[0].token.claims.phq_permissions,['jobs:read','jobs:write']);
    await as(a,hook.rows[0].token.claims);
    assert.equal((await db.query('select public.phq_can_access() as ok')).rows[0].ok,true);
    await db.exec('reset role');
    await db.query('delete from public.phq_members where user_id=$1',[a]);
    await as(a);assert.equal((await db.query('select * from public.phq_test_states')).rows.length,0);
    await db.exec('reset role;set role anon');
    await assert.rejects(()=>db.exec('select * from public.phq_test_states'),/permission denied/);
  } finally {await db.close();}
});
