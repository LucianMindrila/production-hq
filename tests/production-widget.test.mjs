import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {randomUUID} from 'node:crypto';
const html=await readFile(new URL('../public/production-board.html',import.meta.url),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
class Element{
  constructor(tag='div'){this.tag=tag;this.attrs={};this.children=[];this.events={};this.value='';this.textContent='';}
  setAttribute(key,value){this.attrs[key]=value;if(key==='value')this.value=value;}
  append(...children){this.children.push(...children);}
  replaceChildren(...children){this.children=children;}
  addEventListener(name,fn){this.events[name]=fn;}
  focus(){}
}
const all=node=>[node,...node.children.flatMap(all)];
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function mount(backend,mode){
  const elements=Object.fromEntries(['reload','search','company','filter','summary','proposal','proposal-text','save','cancel','status','jobs','history'].map(id=>[id,new Element()]));elements.filter.value='all';
  const listeners={},location={pathname:mode==='website'?'/production-board.html':'/widget/resource',search:mode==='website'?'?surface=website':''};
  const parent={postMessage(message){if(!message.id)return;setImmediate(async()=>{try{const result=message.method==='ui/initialize'?{}:await backend.call(message.params.name,message.params.arguments);listeners.message({source:parent,data:{id:message.id,result}});}catch(error){listeners.message({source:parent,data:{id:message.id,error:{message:error.message}}});}});}};
  const window={location,addEventListener(name,fn){listeners[name]=fn;},...(mode==='compatibility'?{openai:{callTool:backend.call.bind(backend)}}:{})};
  vm.runInNewContext(script,{location,window,parent,document:{createElement:tag=>new Element(tag),getElementById:id=>elements[id],body:new Element(),documentElement:{scrollHeight:500}},crypto:{randomUUID},URLSearchParams,setTimeout,clearTimeout,confirm:()=>true,ResizeObserver:class{observe(){}},fetch:async(url,options)=>{assert.equal(url,'/api/private/board');const result=await backend.call(options?.method==='POST'?'change_production_stage':'get_production_board',options?.body?JSON.parse(options.body):{});return {ok:true,json:async()=>result.structuredContent};}});
  return elements;
}
for(const mode of ['compatibility','standard','website'])test('production card preserves proposals, retries, reopening and new subtasks: '+mode,async()=>{
  const backend={calls:[],fail:false,state:{available:true,revision:0,updatedAt:null,document:{version:1,jobs:[{id:'J1',company:'DTS',customer:'Example customer',title:'Example job',delivery:'',status:'In progress',priority:'High',nextAction:'Check drawings',notes:'Uncertain',stages:[{id:'S1',title:'Cut material',complete:false,status:'pending',due:'',responsible:'',comments:''}]}],materials:[],sourceHistory:[]}},async call(name,args){this.calls.push({name,args:JSON.parse(JSON.stringify(args))});if(name==='change_production_stage'){assert.equal(args.approved,true);assert.equal(args.expectedRevision,this.state.revision);if(this.fail){this.fail=false;throw new Error('Retry safely');}const stages=this.state.document.jobs[0].stages;if(args.change.type==='set_stage'){stages[0].status=args.change.status;stages[0].complete=args.change.status==='complete';}else stages.push({id:'ST-'+args.requestId,title:args.change.title,status:'pending',complete:false,due:args.change.due,responsible:args.change.responsible,comments:args.change.comments});this.state.revision++;}return {structuredContent:JSON.parse(JSON.stringify(this.state))};}};
  const e=mount(backend,mode);for(let i=0;i<8;i++)await settle();assert.match(e.summary.textContent,/1 jobs · 0 \/ 1 stages/);
  const checkbox=all(e.jobs).find(n=>n.attrs.type==='checkbox');checkbox.checked=true;checkbox.events.change();assert.equal(e.proposal.hidden,false);assert.equal(backend.calls.filter(c=>c.name==='change_production_stage').length,0);
  backend.fail=true;await e.save.events.click();assert.match(e.status.textContent,/Retry safely/);await e.save.events.click();const saves=backend.calls.filter(c=>c.name==='change_production_stage');assert.equal(saves[0].args.requestId,saves[1].args.requestId);assert.equal(backend.state.revision,1);assert.match(e.summary.textContent,/1 \/ 1 stages/);
  const reopened=mount(backend,mode);for(let i=0;i<8;i++)await settle();assert.equal(all(reopened.jobs).find(n=>n.attrs.type==='checkbox').checked,true);
  const form=all(reopened.jobs).find(n=>n.tag==='form');all(form).find(n=>n.attrs.name==='title').value='Contact supplier';form.events.submit({preventDefault(){}});assert.match(reopened['proposal-text'].textContent,/add subtask: Contact supplier/);assert.equal(backend.state.revision,1);await reopened.save.events.click();assert.equal(backend.state.revision,2);assert.equal(backend.state.document.jobs[0].stages.length,2);assert.equal(backend.state.document.jobs[0].stages[1].complete,false);
});
