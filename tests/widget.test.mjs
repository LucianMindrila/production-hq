import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const html = await readFile(new URL('../public/test-job.html', import.meta.url), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const settle = () => new Promise(resolve => setImmediate(resolve));
function mount(mode) {
  const calls = [];
  const elements = Object.fromEntries(['complete','test','status','connection'].map(id => [id, {
    checked:false, disabled:false, textContent:'', events:{},
    addEventListener(name, callback) { this.events[name] = callback; },
  }]));
  let onMessage;
  const result = complete => ({structuredContent:{complete,persisted:false}});
  const parent = {
    get location() { throw new Error('cross origin'); },
    postMessage(message) {
      calls.push(message);
      if (!message.id) return;
      queueMicrotask(() => onMessage({source:parent,data:{jsonrpc:'2.0',id:message.id,
        ...(mode === 'broken' ? {error:{message:'Host rejected initialization'}} :
          {result:message.method==='tools/call' ? result(message.params.arguments.complete) : {}}),
      }}));
    },
  };
  const window = {parent, location:{origin:'https://sandbox.example'},
    addEventListener(name, callback) { if(name === 'message') onMessage=callback; },
  };
  if (mode === 'compatibility') window.openai = {
    toolOutput:{complete:false,persisted:false},
    async callTool(name,args) { calls.push({name,args});return result(args.complete); },
  };
  vm.runInNewContext(script, {window, document:{getElementById:id=>elements[id],body:{},documentElement:{scrollHeight:350}},
    setTimeout, clearTimeout, ResizeObserver:class {observe() {}}});
  return {elements,calls};
}

for (const mode of ['standard','compatibility']) test(`${mode} bridge lets the checkbox button complete a server round trip`, async () => {
  const {elements:e,calls} = mount(mode);
  await settle();
  assert.equal(e.test.disabled,false);
  assert.match(e.connection.textContent,/ready/);
  assert.ok(!calls.some(c=>c.params?.name==='show_rendering_test_job'), 'startup must use host-provided data, not call the show tool again');
  for (const complete of [true,false]) {
    e.complete.checked=complete;
    e.complete.events.change();
    await e.test.events.click();
    assert.match(e.status.textContent,/Connection works/);
    assert.equal(e.complete.checked,complete);
    assert.equal(e.test.disabled,false);
  }
});

test('startup errors remain visible after checkbox changes and button clicks', async () => {
  const {elements:e} = mount('broken');
  await settle();
  assert.match(e.connection.textContent,/Host rejected initialization/);
  e.complete.checked=true;e.complete.events.change();
  assert.match(e.connection.textContent,/Host rejected initialization/);
  assert.equal(e.test.disabled,false);
  await e.test.events.click();
  assert.match(e.status.textContent,/Connection test failed/);
  assert.equal(e.test.disabled,false);
});
