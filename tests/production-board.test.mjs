import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('production board protects imported records and audits approved stage changes',async()=>{
  const db=new PGlite(),a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222';
  const first='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',second='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',third='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  try{
    await db.exec(`create role anon;create role authenticated;create role supabase_auth_admin;create schema auth;create table auth.users(id uuid primary key);create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;grant usage on schema public,auth to authenticated;grant execute on function auth.jwt(),auth.uid() to authenticated;insert into auth.users values('${a}'),('${b}');`);
    await db.exec(await readFile(new URL('../supabase/001_private_test.sql',import.meta.url),'utf8'));
    const migration=await readFile(new URL('../supabase/002_production_board.sql',import.meta.url),'utf8');
    await db.exec(migration);await db.exec(migration);
    await db.query('insert into phq_members values($1),($2)',[a,b]);
    await db.query('insert into phq_oauth_clients values($1,$2)',['client','https://app.example/api/secure-mcp']);
    const fixture={version:1,source:{mode:'imported_copy'},jobs:[{id:'J-1',notes:'Preserve this uncertainty',stages:[{id:'S-1',title:'Cut material',complete:false,status:'pending',comments:'Not verified'}]}],materials:[{jobId:'J-1',quantity:'TBC',status:'AWAITING QUANTITY'}],sourceHistory:[{Update:'Source history preserved'}]};
    await db.query('insert into phq_boards(owner_id,document) values($1,$2)',[a,fixture]);
    async function as(user,claims={}){await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:user,...claims})]);await db.exec('set role authenticated');}
    const save=(change,rev,id,approved=true)=>db.query('select phq_change_board($1,$2,$3,$4) as receipt',[change,rev,id,approved]);
    const change={type:'set_stage',jobId:'J-1',stageId:'S-1',status:'in_progress'};
    await as(a);
    await assert.rejects(()=>save(change,0,first,false),/APPROVAL_REQUIRED/);
    assert.deepEqual((await save(change,0,first)).rows[0].receipt,{revision:1});
    assert.deepEqual((await save(change,0,first)).rows[0].receipt,{revision:1});
    await assert.rejects(()=>save({...change,status:'complete'},0,first),/REQUEST_MISMATCH/);
    await assert.rejects(()=>save(change,0,second),/STALE_REVISION/);
    let board=(await db.query('select * from phq_boards')).rows[0];assert.equal(board.document.jobs[0].stages[0].complete,false);assert.equal(board.document.jobs[0].stages[0].status,'in_progress');
    await save({...change,status:'complete'},1,second);
    await save({type:'add_stage',jobId:'J-1',title:'Contact supplier',due:'Tomorrow',responsible:'Owner',comments:'Wrong finish'},2,third);
    board=(await db.query('select * from phq_boards')).rows[0];assert.equal(board.revision,3);assert.equal(board.document.jobs[0].stages[0].id,'S-1');assert.equal(board.document.jobs[0].stages[0].complete,true);assert.equal(board.document.jobs[0].stages[1].id,'ST-'+third);assert.equal(board.document.jobs[0].stages[1].complete,false);
    assert.deepEqual(board.document.materials,fixture.materials);assert.deepEqual(board.document.sourceHistory,fixture.sourceHistory);assert.equal(board.document.jobs[0].notes,fixture.jobs[0].notes);
    const history=await db.query('select * from phq_board_history order by after_revision');assert.equal(history.rows.length,3);assert.equal(history.rows[0].before_stage.status,'pending');assert.equal(history.rows[1].after_stage.status,'complete');
    await assert.rejects(()=>db.exec('update phq_boards set revision=99'),/permission denied/);await assert.rejects(()=>db.exec('delete from phq_board_history'),/permission denied/);
    const invalid='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    await assert.rejects(()=>save({...change,status:'ordered'},3,invalid),/INVALID_CHANGE/);await assert.rejects(()=>save({...change,owner_id:b},3,invalid),/INVALID_CHANGE/);await assert.rejects(()=>save({...change,stageId:'missing'},3,invalid),/STAGE_NOT_FOUND/);await assert.rejects(()=>save({type:'add_stage',jobId:'J-1',title:'',comments:5},3,invalid),/INVALID_CHANGE/);
    await as(b);assert.equal((await db.query('select * from phq_boards')).rows.length,0);assert.equal((await db.query('select * from phq_board_history')).rows.length,0);await assert.rejects(()=>save(change,0,first),/BOARD_NOT_IMPORTED/);
    await as(a,{client_id:'client',resource:'https://app.example/api/secure-mcp',phq_permissions:['jobs:read']});assert.equal((await db.query('select * from phq_boards')).rows.length,1);await assert.rejects(()=>save(change,3,invalid),/ACCESS_DENIED/);
    await as(a,{client_id:'unknown',resource:'https://app.example/api/secure-mcp',phq_permissions:['jobs:read','jobs:write']});assert.equal((await db.query('select * from phq_boards')).rows.length,0);await assert.rejects(()=>save(change,3,invalid),/ACCESS_DENIED/);
    await db.exec('reset role;set role anon');await assert.rejects(()=>db.exec('select * from phq_boards'),/permission denied/);
  }finally{await db.close();}
});
