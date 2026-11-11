import test,{afterEach,mock} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {handleApi} from '../worker/api.mjs';
import {createLocalBindings} from '../scripts/local-bindings.mjs';
const usenix=JSON.parse(await readFile(new URL('../data/usenix.json',import.meta.url),'utf8'));
const seeds=JSON.parse(await readFile(new URL('../data/source-plans.json',import.meta.url),'utf8'));
const pilot=JSON.parse(await readFile(new URL('../data/academic-research.json',import.meta.url),'utf8'));
const input={direction:'Operating and distributed systems',domain:'systems',conferenceIds:['osdi'],startYear:2025,endYear:2025,refresh:false,criteria:{targetGraduationYear:2027,minResearchFit:0,currentStatuses:['PhD student'],includeUnknown:true}};
async function call(path,body,env={}){const response=await handleApi(new Request('https://app.test'+path,{method:body?'POST':'GET',...(body?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})}),env);return {http:response.status,data:await response.json()}}
afterEach(()=>mock.restoreAll());
test('the complete domain plan is usable without model or storage credentials',async()=>{
 const fetch=mock.method(globalThis,'fetch',async()=>{throw Error('Planning must not call a model')});const out=await call('/api/mapping-runs/plan',{direction:'Network protocols and datacenter congestion'});assert.equal(out.http,200);assert.equal(out.data.plan.domain,'networking');assert.deepEqual(out.data.plan.conferenceIds,['sigcomm','nsdi','conext','imc']);assert.equal(fetch.mock.callCount(),0);
 const status=await call('/api/mapping-runs/status');assert.equal(status.data.storageAvailable,false);assert.equal(status.data.modelConfigured,false);
 assert.equal((await call('/api/mapping-runs',input)).http,503);
});
test('a source-discovery attempt requiring adapter work is not automatically billed again as a fetch retry',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'mapping-source-failure-')),bindings=await createLocalBindings({directory:pathToFileURL(folder+'/')});
 try{
  const env={...bindings,SOURCE_PLAN_SEEDS:[],SOURCE_SNAPSHOT:{papers:[],editions:[]},OPENAI_API_KEY:'unit-test-key',OPENAI_RESEARCH_MODEL:'unit-test-model'};let modelCalls=0;const sourceUrl='https://www.usenix.org/conference/osdi25/technical-sessions';
  mock.method(globalThis,'fetch',async url=>{assert.equal(String(url),'https://api.openai.com/v1/responses');modelCalls++;return Response.json({status:'completed',output:[{type:'web_search_call',status:'completed',action:{type:'search',sources:[{url:sourceUrl}]}},{type:'message',content:[{type:'output_text',text:JSON.stringify({status:'adapter_required',plan:null,evidence:[{url:sourceUrl,title:'Official source',excerpt:'OSDI 2025 technical sessions'}]})}]}]})});
  const created=await call('/api/mapping-runs',{...input,refresh:true},env);assert.equal(created.http,201);const id=created.data.run.id;
  const out=await call('/api/mapping-runs/'+encodeURIComponent(id)+'/advance',{maxTasks:1},env);assert.equal(out.data.run.state,'failed');await call('/api/mapping-runs/'+encodeURIComponent(id)+'/advance',{maxTasks:1},env);assert.equal(modelCalls,1);
  const saved=await call('/api/mapping-runs/'+encodeURIComponent(id),undefined,env);assert.equal(saved.data.result.papers.length,0);assert.equal(saved.data.result.coverage.editions[0].status,'adapter_required');assert.match(saved.data.result.warnings.join(' '),/adapter/i);
 }finally{bindings.close();await rm(folder,{recursive:true,force:true})}
});
test('real source papers flow through durable run tasks into an exportable author result when model setup is absent',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'mapping-api-')),bindings=await createLocalBindings({directory:pathToFileURL(folder+'/')});
 try{
  const env={...bindings,SOURCE_PLAN_SEEDS:seeds,SOURCE_SNAPSHOT:{papers:usenix.papers,editions:usenix.coverage,retrievedAt:usenix.retrievedAt},ACADEMIC_RESEARCH_SNAPSHOT:pilot};
  const fetch=mock.method(globalThis,'fetch',async()=>{throw Error('Cached collection and missing model must not fetch')});
  const made=await call('/api/mapping-runs',input,env);assert.equal(made.http,201);const id=made.data.run.id;let current=made.data;
  for(let step=0;step<40&&['queued','running'].includes(current.run.state);step++){const advanced=await call('/api/mapping-runs/'+encodeURIComponent(id)+'/advance',{maxTasks:2},env);assert.equal(advanced.http,200);current=advanced.data}
  assert.equal(current.run.state,'connection_required');assert.equal(current.run.stage,'profiling');
  const saved=(await call('/api/mapping-runs/'+encodeURIComponent(id),undefined,env)).data;
  assert.equal(saved.result.papers.length,53);assert.ok(saved.result.candidates.length>100);assert.equal(saved.result.screening.length,saved.result.candidates.length);assert.equal(saved.progress.profiles.total,saved.result.candidates.length);assert.equal(fetch.mock.callCount(),0);
  const listed=await call('/api/mapping-runs',undefined,env);assert.ok(listed.data.runs.some(run=>run.id===id));
  const paused=await call('/api/mapping-runs/'+encodeURIComponent(id)+'/pause',{},env);assert.equal(paused.data.run.state,'paused');
  assert.equal((await call('/api/mapping-runs/'+encodeURIComponent(id)+'/advance',{maxTasks:4},env)).http,400);
  const bad=await call('/api/mapping-runs',{...input,criteria:{nationality:'Chinese'}},env);assert.equal(bad.http,400);assert.equal(fetch.mock.callCount(),0);
 }finally{bindings.close();await rm(folder,{recursive:true,force:true})}
});
