import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

test('production server publishes the real card and echoes both checkbox values', async () => {
  const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', '3219'], {stdio:['ignore','pipe','pipe']});
  let log = '';
  server.stdout.on('data', chunk => { log += chunk; });
  server.stderr.on('data', chunk => { log += chunk; });
  const base = 'http://localhost:3219';
  let requestId = 0;
  async function rpc(method, params = {}) {
    const response = await fetch(base + '/api/mcp', {
      method:'POST', headers:{'Content-Type':'application/json','Accept':'application/json, text/event-stream','MCP-Protocol-Version':'2025-11-25'},
      body:JSON.stringify({jsonrpc:'2.0',id:++requestId,method,params}),
    });
    const raw = await response.text();
    assert.equal(response.status, 200, raw);
    const data = response.headers.get('content-type')?.includes('text/event-stream')
      ? JSON.parse(raw.split('\n').find(line=>line.startsWith('data: ')).slice(6)) : JSON.parse(raw);
    assert.equal(data.error, undefined, JSON.stringify(data));
    return data.result;
  }
  try {
    let ready = false;
    for (let i=0;i<80;i++) {
      try { if ((await fetch(base)).ok) { ready=true;break; } } catch {}
      await delay(100);
    }
    assert.ok(ready, log);
    const tools = await rpc('tools/list');
    const show = tools.tools.find(tool=>tool.name==='show_rendering_test_job');
    assert.ok(show);
    const uri = show._meta.ui.resourceUri;
    const resources = await rpc('resources/list');
    assert.ok(resources.resources.some(resource=>resource.uri===uri));
    const resource = await rpc('resources/read', {uri});
    assert.equal(resource.contents[0].mimeType, 'text/html;profile=mcp-app');
    assert.equal(resource.contents[0].text, await (await fetch(base+'/test-job.html')).text());
    assert.match(resource.contents[0].text, /type="checkbox"/);
    assert.match(resource.contents[0].text, /ui\/initialize/);
    for (const complete of [true,false]) {
      const result = await rpc('tools/call', {name:'preview_test_completion',arguments:{complete}});
      assert.equal(result.isError, undefined);
      assert.equal(result.structuredContent.complete, complete);
      assert.equal(result.structuredContent.persisted, false);
    }
    const fresh = await rpc('tools/call', {name:'show_rendering_test_job',arguments:{}});
    assert.equal(fresh.structuredContent.complete, false, 'preview must not claim persistence');
    const invalid = await rpc('tools/call', {name:'preview_test_completion',arguments:{complete:'yes'}});
    assert.equal(invalid.isError, true);
    const discovery = await fetch(base+'/.well-known/oauth-authorization-server');
    assert.equal(discovery.status,404, 'must not advertise nonexistent OAuth');
    for(const route of ['/api/secure-mcp','/api/private/test-state','/.well-known/oauth-protected-resource']) {
      const response=await fetch(base+route);
      assert.equal(response.status,503,'unconfigured secure routes must fail closed: '+route);
    }
    const loginPage=await (await fetch(base+'/login')).text();
    assert.match(loginPage,/Private test setup is pending/);
  } finally {
    if (server.exitCode === null && server.signalCode === null) {
      const exited = new Promise(resolve=>server.once('exit',resolve));
      server.kill('SIGTERM');
      await exited;
    }
  }
});
