import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';

const html=await readFile(new URL('../public/saved-test.html',import.meta.url),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function mount(backend) {
  const elements=Object.fromEntries(['complete','save','reload','revision','proposal','connection','status'].map(id=>[id,{
    checked:false,disabled:id==='save'||id==='complete',hidden:true,textContent:'',events:{},addEventListener(name,fn){this.events[name]=fn;},
  }]));
  const parent={location:{origin:'https://sandbox.example'}};
  const window={parent,location:{pathname:'/widget/card',search:'',origin:'https://sandbox.example'},openai:{callTool:backend.call.bind(backend)},addEventListener(){}};
  vm.runInNewContext(script,{document:{getElementById:id=>elements[id]},window,parent,crypto:{randomUUID},URLSearchParams,setTimeout,clearTimeout});
  return elements;
}
test('private card stages changes, explicitly approves saving, retries the same ID, and reloads persisted state',async()=>{
  const backend={
    state:{jobId:'TEST-001',complete:false,revision:0,persisted:false,updatedAt:null},calls:[],failOnce:false,
    async call(name,args){
      this.calls.push({name,args});
      if(name==='save_test_completion') {
        assert.equal(args.approved,true);assert.equal(args.expectedRevision,this.state.revision);
        if(this.failOnce){this.failOnce=false;throw new Error('Temporary network error');}
        this.state={...this.state,complete:args.complete,revision:this.state.revision+1,persisted:true,updatedAt:'2026-10-17T10:00:00Z'};
      }
      return {structuredContent:{...this.state}};
    },
  };
  const e=mount(backend);await settle();await settle();
  assert.equal(e.complete.disabled,false);assert.equal(e.save.disabled,true);
  e.complete.checked=true;e.complete.events.change();
  assert.equal(e.save.disabled,false);assert.equal(e.proposal.hidden,false);
  assert.equal(backend.calls.filter(c=>c.name==='save_test_completion').length,0);
  backend.failOnce=true;await e.save.events.click();
  assert.match(e.status.textContent,/Temporary network error/);assert.equal(e.save.disabled,false);
  await e.save.events.click();
  const saves=backend.calls.filter(c=>c.name==='save_test_completion');
  assert.equal(saves[0].args.requestId,saves[1].args.requestId);
  assert.match(e.status.textContent,/Saved and verified at revision 1/);assert.equal(e.save.disabled,true);
  const reopened=mount(backend);await settle();await settle();
  assert.equal(reopened.complete.checked,true);assert.match(reopened.revision.textContent,/revision 1/);
  reopened.complete.checked=false;reopened.complete.events.change();await reopened.reload.events.click();
  assert.equal(reopened.complete.checked,true,'reload must use the server record');
  assert.equal(backend.state.revision,1,'discarding preview must not write a revision');
});
