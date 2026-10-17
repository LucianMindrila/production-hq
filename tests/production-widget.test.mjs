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
  const elements=Object.fromEntries(['reload','search','company','filter','summary','proposal','proposal-text','save','cancel','status','jobs','history','new-job','create-job','new-company','new-customer','new-title','new-delivery','new-priority','new-next-action','new-notes','new-stages','create'].map(id=>[id,new Element()]));elements.filter.value='current';elements['new-priority'].value='Normal';
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

for(const mode of ['website','standard','compatibility'])test('create, archive and restore require review: '+mode,async()=>{
 const backend={calls:[],state:{available:true,revision:0,document:{version:1,jobs:[{id:'DTS-001',company:'DTS',customer:'Done customer',title:'Done job',priority:'Normal',nextAction:'',notes:'',stages:[{id:'S1',title:'Done',status:'complete',complete:true}]}],materials:[],sourceHistory:[]}},async call(name,args){this.calls.push({name,args});if(name==='change_production_stage'){const c=args.change;assert.equal(args.approved,true);assert.equal(args.expectedRevision,this.state.revision);if(c.type==='create_job')this.state.document.jobs.push({...c,id:'DTS-002',status:'New',stages:c.stages.map((s,i)=>({...s,id:'N'+i,complete:false,status:'pending'}))});else this.state.document.jobs.find(j=>j.id===c.jobId).archivedAt=c.type==='archive_job'?'2026-10-17':null;this.state.revision++;}return {structuredContent:JSON.parse(JSON.stringify(this.state))};}};
 const e=mount(backend,mode);for(let i=0;i<8;i++)await settle();
 const archive=all(e.jobs).find(n=>n.textContent==='Archive completed job');assert.equal(archive.disabled,false);archive.events.click();assert.equal(backend.state.revision,0);await e.save.events.click();assert.equal(backend.state.revision,1);assert.match(all(e.jobs).map(n=>n.textContent).join(' '),/No jobs match/);
 e.filter.value='archived';e.filter.events.change();assert.equal(all(e.jobs).find(n=>n.attrs.type==='checkbox').disabled,true);all(e.jobs).find(n=>n.textContent==='Restore job').events.click();assert.equal(backend.state.revision,1);await e.save.events.click();
 e.filter.value='current';e.filter.events.change();assert.ok(all(e.jobs).find(n=>n.textContent==='Done customer'));
 e['new-company'].value='DTS';e['new-customer'].value='New customer';e['new-title'].value='New job';e['new-stages'].value='Order material\nCut and edge'.replace('\\n','\n');e['create-job'].events.submit({preventDefault(){}});assert.equal(backend.state.revision,2);assert.match(e['proposal-text'].textContent,/New customer/);await e.save.events.click();assert.equal(backend.state.revision,3);assert.equal(backend.state.document.jobs[1].stages.length,2);assert.equal(e['new-customer'].value,'');assert.equal(e.filter.value,'current');
 const buttons=all(e.jobs).filter(n=>n.textContent==='Archive completed job');assert.equal(buttons[1].disabled,true);
});
