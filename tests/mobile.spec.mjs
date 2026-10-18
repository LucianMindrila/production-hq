import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const html=process.env.BOARD_REF?execFileSync('git',['show',`${process.env.BOARD_REF}:public/production-board.html`],{encoding:'utf8'}):readFileSync('public/production-board.html','utf8');
const fixture=()=>({available:true,revision:0,document:{version:1,jobs:[{id:'J1',company:'DTS',customer:'Example workshop',title:'Kitchen panels and finishing',delivery:'Friday',status:'In progress',priority:'High',nextAction:'Cut panels',notes:'Check dimensions before cutting.',stages:[{id:'S1',title:'Cut panels',status:'pending',complete:false,due:'',responsible:'',comments:''}]}],materials:[],sourceHistory:[]}});
for(const width of [320,375,390,430])for(const mode of ['compatibility','standard','website'])test(`${mode} at ${width}: complete, create, archive, restore`,async({page})=>{
 await page.setViewportSize({width,height:844});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 let state=fixture(),calls=[];
 const call=async(name,args)=>{calls.push({name,args});if(name==='change_production_stage'){expect(args.approved).toBe(true);expect(args.expectedRevision).toBe(state.revision);const c=args.change;if(c.type==='set_stage'){state.document.jobs[0].stages[0].complete=c.status==='complete';state.document.jobs[0].stages[0].status=c.status;}if(c.type==='archive_job'||c.type==='restore_job')state.document.jobs.find(j=>j.id===c.jobId).archivedAt=c.type==='archive_job'?'2026-10-18':null;if(c.type==='create_job')state.document.jobs.push({...c,id:'J2',status:'New',stages:c.stages.map((s,i)=>({...s,id:'N'+i,status:'pending',complete:false}))});state.revision++;}return {structuredContent:structuredClone(state)};};
 await page.exposeFunction('mockTool',call);
 await page.route('**/*',async route=>{const url=new URL(route.request().url());if(url.pathname==='/api/private/board'){const args=route.request().postDataJSON();return route.fulfill({json:(await call(args?'change_production_stage':'get_production_board',args||{})).structuredContent});}if(url.pathname==='/board'||url.pathname==='/production-board.html')return route.fulfill({contentType:'text/html',body:html});return route.abort();});
 if(mode==='compatibility')await page.addInitScript(data=>{window.openai={toolOutput:data,callTool:(name,args)=>window.mockTool(name,args)};},fixture());
 if(mode==='standard'){
   await page.route('**/host',r=>r.fulfill({contentType:'text/html',body:`<iframe title="Board" src="/board" style="border:0;width:100%;height:800px"></iframe><script>addEventListener('message',async e=>{const m=e.data;if(!m.id)return;const result=m.method==='ui/initialize'?{}:await window.mockTool(m.params.name,m.params.arguments);e.source.postMessage({jsonrpc:'2.0',id:m.id,result},'*');});</script>`}));
   await page.goto('http://localhost/host');
 }else await page.goto('http://localhost/'+(mode==='website'?'production-board.html?surface=website':'board'));
 const root=mode==='standard'?page.frameLocator('iframe'):page;
 await expect(root.getByText('Example workshop',{exact:true})).toBeVisible();
 await root.locator('#jobs summary').first().click();
 await root.getByRole('checkbox').first().click();
 await expect(root.locator('.stage #proposal')).toBeVisible();
 await expect(root.locator('#search')).toBeDisabled();
 expect(calls.filter(c=>c.name==='change_production_stage')).toHaveLength(0);
 await root.getByRole('button',{name:'Approve & save'}).click();
 await expect(root.getByText('✓ Saved',{exact:true})).toBeVisible();
 await root.getByRole('button',{name:'Archive completed job'}).click();
 await expect(root.locator('#jobs #proposal')).toBeVisible();
 await root.getByRole('button',{name:'Approve & save'}).click();
 await expect(root.getByText('No jobs match these filters.')).toBeVisible();
 await root.locator('#filter').selectOption('archived');
 if(!await root.locator('#jobs details.job').first().getAttribute('open').then(v=>v!==null))await root.locator('#jobs summary').first().click();
 await root.getByRole('button',{name:'Restore job'}).click();
 await root.getByRole('button',{name:'Approve & save'}).click();
 await root.locator('#filter').selectOption('current');
 await root.locator('#new-job > summary').click();
 await root.locator('#new-company').selectOption('DTS');await root.locator('#new-customer').fill('New example');await root.locator('#new-title').fill('Shelves');await root.locator('#new-stages').fill('Cut\nFinish');
 await root.getByRole('button',{name:'Review new job',exact:true}).click();
 await expect(root.locator('#create-job #proposal')).toBeVisible();
 await root.getByRole('button',{name:'Approve & save'}).click();
 await expect(root.getByText('New example',{exact:true})).toBeVisible();
 const frame=mode==='standard'?page.frames()[1]:page.mainFrame();
 expect(await frame.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 expect(errors).toEqual([]);
 if(width===390&&mode==='compatibility')await page.screenshot({path:process.env.BOARD_SCREENSHOT||'test-results/iphone-board.png',fullPage:true});
});

test('baseline board renders when the read succeeds',async({page})=>{
 await page.route('**/*',r=>r.fulfill({contentType:'text/html',body:html}));
 await page.addInitScript(data=>{window.openai={callTool:async()=>({structuredContent:data})};},fixture());
 await page.goto('http://localhost/board');await expect(page.getByText('Example workshop',{exact:true})).toBeVisible();
});

test('cancel keeps saved state and delayed host data renders without a successful read',async({page})=>{
 await page.route('**/*',r=>r.fulfill({contentType:'text/html',body:html}));
 await page.addInitScript(()=>{window.openai={callTool:async()=>{throw Error('Read unavailable');}};});
 await page.goto('http://localhost/board');
 await page.evaluate(data=>window.dispatchEvent(new CustomEvent('openai:set_globals',{detail:{globals:{toolOutput:data}}})),fixture());
 await expect(page.getByText('Example workshop',{exact:true})).toBeVisible();
 await page.locator('#jobs summary').first().click();await page.getByRole('checkbox').click();
 await page.locator('#cancel').click();await expect(page.getByRole('checkbox')).not.toBeChecked();await expect(page.locator('#search')).toBeEnabled();
});

test('ChatGPT supplied board renders even when a redundant read would fail',async({page})=>{
 await page.route('**/*',r=>r.fulfill({contentType:'text/html',body:html}));
 await page.addInitScript(data=>{window.openai={toolOutput:data,callTool:async()=>{throw Error('Read unavailable');}};},fixture());
 await page.goto('http://localhost/board');await expect(page.getByText('Example workshop',{exact:true})).toBeVisible();
});

