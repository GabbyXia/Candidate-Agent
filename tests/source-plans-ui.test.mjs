import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const source=(await readFile(new URL('../ui/runtime.js', import.meta.url), 'utf8')) + '\n' + await readFile(new URL('../ui/source-plans.js',import.meta.url),'utf8');
const {CONFERENCES}=await import('../shared/catalog.js');
const data=JSON.parse(await readFile(new URL('../data/usenix.json',import.meta.url),'utf8'));
function planRow({id='active-1',version=1,status='active',year=2025,validated=true,digest='digest-1'}={}){return {id,scopeKey:`osdi:${year}:main`,version,status,planDigest:digest,plan:{conferenceId:'osdi',year,track:'main',adapter:{id:'usenix',version:'1.0.0'},entryUrl:`https://www.usenix.org/conference/osdi${String(year).slice(-2)}/technical-sessions`,authorityUrl:`https://www.usenix.org/conference/osdi${String(year).slice(-2)}`,pagination:{kind:'none',terminalRule:'single official edition index'}},latestValidation:validated?{id:'check-'+id,verdict:'pass',planDigest:digest,checkedAt:'2026-11-10T20:00:00Z',observedCount:87,publishedCount:87,coverage:'complete',failures:[],warnings:[]}:null}}
function response(data,status=200){return {ok:status>=200&&status<300,status,json:async()=>structuredClone(data)}}
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}}
async function tick(){await new Promise(resolve=>setImmediate(resolve))}

async function app({plans=[planRow(),planRow({id:'candidate-2',version:2,status:'candidate',validated:false,digest:'digest-2'})],storage=true,model=false,mutation}={}){
  const server={plans:structuredClone(plans)},nodes=new Map(),listeners=new Map(),calls=[],toasts=[],collections=[],activities=[];let renderCount=0;
  const node=id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:'',textContent:'',value:'',values:{conferenceId:'osdi',year:'2025'},reportValidity(){return true}});return nodes.get(id)};
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  class FormValues{constructor(form){this.values=form.values}get(key){return this.values[key]??''}}
  const state={view:'source-plans',candidates:[],papers:[]};
  const context=vm.createContext({state,CONFERENCES:structuredClone(CONFERENCES),YEAR:2026,Date,AbortSignal,Promise,Map,Set,console,FormData:FormValues,
    document:{getElementById:node,addEventListener(type,callback){listeners.set(type,callback)}},esc:escape,url(value){try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)?u.href:'#'}catch{return '#'}},icon:name=>`<svg data-icon="${escape(name)}"></svg>`,
    toast:message=>toasts.push(message),render(){renderCount++},notifyActivity:(...args)=>activities.push(args),applyCollection:(...args)=>collections.push(args),
    async fetch(path,options){const body=options?.body?JSON.parse(options.body):null;calls.push({path,body});
      if(path==='/api/source-plans/status')return response({configured:storage,storageAvailable:storage,modelConfigured:model,missing:storage?(model?[]:['OPENAI_API_KEY','OPENAI_MODEL']):['D1','R2'],adapters:[{id:'usenix',version:'1.0.0'}]});
      if(path==='/api/source-plans')return response({plans:server.plans,storageAvailable:storage});
      if(mutation){const result=await mutation(path,body,server);if(result)return result}
      if(path==='/api/source-plans/validate'){const row=server.plans.find(p=>p.id===body.planId);row.latestValidation={id:'validated-'+row.id,verdict:'pass',planDigest:row.planDigest,checkedAt:'2026-11-10T21:00:00Z',observedCount:87,publishedCount:87,coverage:'complete',failures:[],warnings:[]};return response({validation:row.latestValidation})}
      if(path==='/api/source-plans/promote'){const row=server.plans.find(p=>p.id===body.planId);server.plans.filter(p=>p.scopeKey===row.scopeKey).forEach(p=>p.status=p.id===row.id?'active':'candidate');return response({plan:row})}
      if(path==='/api/source-plans/collect')return response({papers:structuredClone(data.papers.slice(0,2)),candidates:[],coverage:{startYear:2025,endYear:2025,partial:false},warnings:[]});
      if(path==='/api/source-plans/discover'){const row=planRow({id:'discovered-3',version:3,status:'candidate',year:body.year,validated:false,digest:'digest-3'});row.plan.conferenceId=body.conferenceId;server.plans.push(row);return response({plan:row})}
      throw Error('Unexpected test request');
    },
  });
  vm.runInContext(source,context,{filename:'ui/source-plans.js'});await tick();
  const run=code=>vm.runInContext(code,context),json=code=>JSON.parse(run(`JSON.stringify(${code})`));
  const click=(action,id)=>{const button={dataset:{action,id}};return listeners.get('click')({target:{closest(){return button}},preventDefault(){}})};
  return {state,server,node,calls,toasts,collections,activities,run,json,click,get renderCount(){return renderCount}};
}

test('registry loads authoritative server versions once and displays shared storage',async()=>{
  const ui=await app();await ui.run('sourcePlansOnData()');
  assert.equal(ui.calls.filter(c=>c.path==='/api/source-plans').length,1);assert.equal(ui.calls.filter(c=>c.body).length,0);
  const html=ui.run('sourcePlanWorkspace()');assert.match(html,/Shared source registry available/);assert.match(html,/2 versions/);assert.match(html,/Version 1/);assert.match(html,/Version 2/);assert.match(html,/local research server/);
});

test('unconfigured agent discovery makes no model discovery request',async()=>{
  const ui=await app({model:false});await ui.run('SP_discover()');
  assert.equal(ui.calls.filter(c=>c.path==='/api/source-plans/discover').length,0);assert.match(ui.toasts.at(-1),/No discovery request was sent/);
  const html=ui.run('sourcePlanWorkspace()');assert.match(html,/Agent discovery is not connected/);assert.match(html,/Known source adapters remain independent/);
});

test('known source validation and collection do not depend on the model connection',async()=>{
  const ui=await app({model:false});await ui.click('sp-validate','active-1');await ui.click('sp-collect','active-1');
  assert.equal(ui.calls.filter(c=>c.path==='/api/source-plans/validate').length,1);assert.equal(ui.calls.filter(c=>c.path==='/api/source-plans/collect').length,1);
  assert.equal(ui.collections.length,1);assert.equal(ui.collections[0][0].papers.length,2);assert.equal(ui.state.view,'papers');
});

test('activation fails closed unless a passing check binds the exact candidate digest',async()=>{
  const ui=await app();
  assert.equal(ui.run("SP_canActivate(SP_row('candidate-2'))"),false);
  ui.run("SP_row('candidate-2').latestValidation={id:'check-2',verdict:'pass',planDigest:'wrong-digest'}");assert.equal(ui.run("SP_canActivate(SP_row('candidate-2'))"),false);
  await ui.click('sp-promote','candidate-2');assert.equal(ui.calls.filter(c=>c.path==='/api/source-plans/promote').length,0);
  ui.run("SP_row('candidate-2').latestValidation.planDigest='digest-2'");assert.equal(ui.run("SP_canActivate(SP_row('candidate-2'))"),true);
  ui.run("SP_row('candidate-2').status='quarantined'");assert.equal(ui.run("SP_canActivate(SP_row('candidate-2'))"),false);
});

test('validation records a concrete candidate report without automatic promotion',async()=>{
  const ui=await app();await ui.click('sp-validate','candidate-2');
  assert.equal(ui.json("SP_row('candidate-2').status"),'candidate');assert.equal(ui.run("SP_canActivate(SP_row('candidate-2'))"),true);
  assert.equal(ui.calls.filter(c=>c.path==='/api/source-plans/promote').length,0);assert.match(ui.run('sourcePlanWorkspace()'),/Inspect its coverage and exact-version binding/);
});

test('activation uses validation check and expected current active version from preview',async()=>{
  const candidate=planRow({id:'candidate-2',version:2,status:'candidate',digest:'digest-2'}),ui=await app({plans:[planRow(),candidate]});
  const before=ui.run('sourcePlanWorkspace()');assert.match(before,/Activate version 2 for OSDI 2025/);assert.match(before,/Version 1 is currently active/);
  await ui.click('sp-promote','candidate-2');const call=ui.calls.find(c=>c.path==='/api/source-plans/promote');
  assert.deepEqual(call.body,{planId:'candidate-2',checkId:'check-candidate-2',expectedActiveId:'active-1'});assert.equal(ui.json("SP_row('candidate-2').status"),'active');
});

test('stale activation conflict reloads registry and keeps its explicit conflict message',async()=>{
  const candidate=planRow({id:'candidate-2',version:2,status:'candidate',digest:'digest-2'});
  const ui=await app({plans:[planRow(),candidate],mutation:async path=>path==='/api/source-plans/promote'?response({error:'Active pointer changed.'},409):null});
  await ui.click('sp-promote','candidate-2');assert.ok(ui.calls.filter(c=>c.path==='/api/source-plans').length>=2);assert.match(ui.json('SP_state.error'),/active plan or validation changed/);assert.match(ui.toasts.at(-1),/active plan or validation changed/);
});

test('semantic failures quarantine wrong-year or track plans with count discrepancy warnings',async()=>{
  const ui=await app({mutation:async(path,body,server)=>{if(path!=='/api/source-plans/validate')return null;const row=server.plans.find(r=>r.id===body.planId);row.status='quarantined';row.latestValidation={id:'quarantine-1',verdict:'quarantine',planDigest:row.planDigest,checkedAt:'2026-11-10T21:00:00Z',observedCount:109,publishedCount:110,coverage:'partial',failures:['The page belongs to 2024, not the requested 2025 edition.','Workshop entries cannot establish the main accepted track.'],warnings:['Publisher count 110 differs from 109 observed records.']};return response({validation:row.latestValidation})}});
  await ui.click('sp-validate','candidate-2');const html=ui.run('sourcePlanWorkspace()');assert.match(html,/not the requested 2025/);assert.match(html,/Workshop entries/);assert.match(html,/110 differs from 109/);assert.equal(ui.run("SP_canActivate(SP_row('candidate-2'))"),false);
});

test('failed refresh presents dated last success separately from the latest attempt',async()=>{
  const row=planRow();row.lastSuccess={retrievedAt:'2025-07-01T18:00:00Z',paperCount:87,coverage:'Complete official listing at retrieval'};row.lastAttempt={attemptedAt:'2026-11-10T20:00:00Z',status:'unavailable',error:'Official source HTTP 503'};
  const ui=await app({plans:[row]}),html=ui.run('sourcePlanWorkspace()');assert.match(html,/Dated successful snapshot retained/);assert.match(html,/original retrieval/);assert.match(html,/2025/);assert.match(html,/Last attempt/);assert.match(html,/2026/);assert.match(html,/did not change/);
});

test('empty source collection preserves the current talent workspace',async()=>{
  const ui=await app({mutation:async path=>path==='/api/source-plans/collect'?response({papers:[],candidates:[],coverage:{partial:true},warnings:['Source unavailable.']}):null});
  await ui.click('sp-collect','active-1');assert.equal(ui.collections.length,0);assert.match(ui.json('SP_state.message'),/existing talent workspace has been kept/);
});

test('storage unavailability blocks all mutations while allowing honest registry display',async()=>{
  const ui=await app({storage:false,model:true});await ui.click('sp-validate','active-1');await ui.click('sp-collect','active-1');await ui.run('SP_discover()');
  assert.equal(ui.calls.filter(c=>c.body).length,0);assert.match(ui.run('sourcePlanWorkspace()'),/Shared source registry unavailable/);
});

test('discovery produces only a candidate and rejects out-of-range edition years',async()=>{
  const ui=await app({model:true});ui.node('sp-discovery-form').values={conferenceId:'osdi',year:'2027'};await ui.run('SP_discover()');assert.equal(ui.calls.filter(c=>c.path==='/api/source-plans/discover').length,0);
  ui.node('sp-discovery-form').values={conferenceId:'osdi',year:'2025'};await ui.run('SP_discover()');assert.equal(ui.json("SP_row('discovered-3').status"),'candidate');assert.equal(ui.calls.filter(c=>c.path==='/api/source-plans/promote').length,0);assert.match(ui.json('SP_state.message'),/validate it before activation/);
});

test('mutation lock prevents duplicate validation and exposes loading state',async()=>{
  const hold=deferred();let count=0;const ui=await app({mutation:async path=>{if(path==='/api/source-plans/validate'){count++;return hold.promise}return null}});
  const first=ui.click('sp-validate','active-1');await tick();await ui.click('sp-validate','active-1');assert.equal(count,1);assert.match(ui.run('sourcePlanWorkspace()'),/Validating…/);
  hold.resolve(response({validation:{verdict:'pass'}}));await first;assert.equal(ui.json('SP_state.busy'),null);
});

test('filters retain scoped version history and declarative JSON escapes markup',async()=>{
  const row=planRow({id:'other-year',year:2024});row.plan.testValue='<script>alert(1)</script>';
  const ui=await app({plans:[planRow(),row]});ui.run("SP_state.year='2024'");const html=ui.run('sourcePlanWorkspace()');
  assert.match(html,/1 scopes · 1 versions/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>alert/);assert.match(html,/Inspect the declarative extraction plan/);
});
