import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

test('configured private MCP rejects unauthenticated and malformed tokens and publishes discovery',async()=>{
  const base='http://localhost:3221';
  const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p','3221'],{stdio:['ignore','pipe','pipe'],env:{...process.env,APP_ORIGIN:base,NEXT_PUBLIC_SUPABASE_URL:'https://example.supabase.co',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'test-publishable-key',MCP_OAUTH_CLIENT_ID:'registered-client'}});
  let log='';server.stdout.on('data',d=>{log+=d;});server.stderr.on('data',d=>{log+=d;});
  try {
    let ready=false;
    for(let i=0;i<100;i++){try{if((await fetch(base,{signal:AbortSignal.timeout(1000)})).ok){ready=true;break;}}catch{}await delay(100);}
    assert.ok(ready,log);
    for(const headers of [{},{Authorization:'Bearer invalid.jwt.token'}]) {
      const response=await fetch(base+'/api/secure-mcp',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:'{}'});
      assert.equal(response.status,401);assert.match(response.headers.get('www-authenticate'),/oauth-protected-resource/);
    }
    const metadata=await (await fetch(base+'/.well-known/oauth-protected-resource')).json();
    assert.equal(metadata.resource,base+'/api/secure-mcp');
    assert.deepEqual(metadata.authorization_servers,['https://example.supabase.co/auth/v1']);
  } finally {
    if(server.exitCode===null && server.signalCode===null){const exited=new Promise(r=>server.once('exit',r));server.kill('SIGTERM');await exited;}
  }
});
