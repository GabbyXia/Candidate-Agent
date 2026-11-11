import test,{afterEach,mock} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {handleApi} from '../worker/api.mjs';
import {collectWithSourcePlan,discoverSourcePlan} from '../worker/source-plan-api.mjs';
import {createLocalBindings} from '../scripts/local-bindings.mjs';
const seeds=JSON.parse(await readFile(new URL('../data/source-plans.json',import.meta.url),'utf8'));
const atc=seeds.find(s=>s.plan.conferenceId==='atc'&&s.plan.year===2026);
const scope={conferenceId:'atc',year:2026,track:'main'};
afterEach(()=>mock.restoreAll());
function modelResponse(){return Response.json({status:'completed',output:[{type:'web_search_call',status:'completed',action:{sources:[{url:atc.plan.entryUrl}]}},{type:'message',content:[{type:'output_text',text:JSON.stringify({status:'plan_proposed',plan:atc.plan,evidence:[{url:atc.plan.entryUrl,title:'ATC 2026 accepted papers',excerpt:'The following 135 papers have been accepted'}]})}]}]})}
function serviceStub(){const calls=[];let collectCount=0;return {calls,async get(){return {ok:true,plan:{...atc,status:'active'}}},async propose(plan){calls.push('propose');return {ok:true,plan:{id:'candidate:atc:v2',plan,planDigest:'digest',status:'candidate'}}},async validate(){calls.push('validate');return {ok:true,check:{id:'check:atc',verdict:'pass',planDigest:'digest'}}},async promote(id,check,expected){calls.push({promote:[id,check,expected]});return {ok:true,plan:{id,status:'active'}}},async collect(){collectCount++;return collectCount===1?{ok:false,status:'adapter_missing',papers:[]}:{ok:true,status:'collected',papers:[{id:'checked-real-record'}]}}}}

test('manual source discovery validates a candidate without silently activating it',async()=>{
 const service=serviceStub();mock.method(globalThis,'fetch',async url=>{assert.equal(url,'https://api.openai.com/v1/responses');return modelResponse()});
 const result=await discoverSourcePlan(scope,{DB:{},BUCKET:{},OPENAI_API_KEY:'test-key',OPENAI_SOURCE_MODEL:'test-model'},{service});
 assert.equal(result.ok,true);assert.equal(result.status,'validated_candidate');assert.deepEqual(service.calls,['propose','validate']);assert.equal(result.plan.latestValidation.planDigest,result.plan.planDigest);
});
test('missing plans can be repaired during collection only after validation and concurrency-safe activation',async()=>{
 const service=serviceStub();let modelCalls=0;mock.method(globalThis,'fetch',async()=>{modelCalls++;return modelResponse()});
 const result=await collectWithSourcePlan(scope,{DB:{},BUCKET:{},OPENAI_API_KEY:'test-key',OPENAI_SOURCE_MODEL:'test-model'},{service});
 assert.equal(result.ok,true);assert.equal(result.automaticRepair,true);assert.equal(modelCalls,1);assert.deepEqual(service.calls[2],{promote:['candidate:atc:v2','check:atc',atc.id]});
});
test('unknown model connection preserves a failed or missing source result without fabricated output',async()=>{
 let modelCalls=0;mock.method(globalThis,'fetch',async()=>{modelCalls++;throw Error('must not call')});
 const result=await collectWithSourcePlan(scope,{DB:{},BUCKET:{}},{service:serviceStub()});assert.equal(result.discoveryStatus,'connection_required');assert.deepEqual(result.papers,[]);assert.equal(modelCalls,0);
});
test('ordinary count uncertainty does not spend a model call or change source plans',async()=>{
 const fetch=mock.method(globalThis,'fetch',async()=>{throw Error('must not call')});const result=await collectWithSourcePlan(scope,{DB:{},BUCKET:{},OPENAI_API_KEY:'test-key',OPENAI_SOURCE_MODEL:'test-model'},{service:{async collect(){return {ok:true,status:'collected',papers:[{id:'existing'}],check:{verdict:'pass',coverage:'unknown'}}}}});assert.equal(result.status,'collected');assert.equal(fetch.mock.callCount(),0);
});
test('quarantined discovered plans never replace the existing active plan',async()=>{
 const service=serviceStub();service.validate=async()=>({ok:false,check:{id:'failed',verdict:'quarantine'},error:'Wrong year'});mock.method(globalThis,'fetch',async()=>modelResponse());
 const result=await discoverSourcePlan(scope,{DB:{},BUCKET:{},OPENAI_API_KEY:'test-key',OPENAI_SOURCE_MODEL:'test-model'},{service,activate:true});assert.equal(result.status,'quarantined');assert.ok(!service.calls.some(call=>call.promote));
});

test('HTTP routes use the real migrated SQL/cache bindings and retain source dates on cached reads',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'source-plan-api-')),bindings=await createLocalBindings({directory:pathToFileURL(directory+'/')});
 try{
  const plan={...atc.plan,scopeEvidence:{...atc.plan.scopeEvidence,accepted:'accepted'}};const env={...bindings,SOURCE_PLAN_SEEDS:[{id:'test-atc',version:1,plan,validation:{ok:true,parsedPapers:2,expectedPapers:2,collectionComplete:true}}]};
  const html='<html><h1>ATC 2026 Accepted Papers</h1><p>The following 2 papers have been accepted.</p><ul class="paperlist"><li><strong>SynDebug: A Framework to Debug Logic Bugs in Fault-Tolerant Quantum Computing Programs</strong><em>Nick DiBrita (Rice University); Jack Lange (Oak Ridge National Lab); Tirthak Patel (Rice University)</em></li><li><strong>UniSketch: A Unified Sketch for Efficient General Flow Spread Measurement</strong><em>He Huang, Yifan Han (Soochow University); Chen Lou (University of Science and Technology of China)</em></li></ul></html>';
  let fetches=0;mock.method(globalThis,'fetch',async url=>{assert.equal(String(url),atc.plan.entryUrl);fetches++;return new Response(html)});
  const request=body=>new Request('https://app.test/api/source-plans/collect',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const first=await(await handleApi(request(scope),env)).json();assert.equal(first.papers.length,2);assert.ok(first.candidates.length>0);assert.equal(first.coverage.collectionComplete,true);assert.equal(first.sourcePlan.status,'collected');
  const second=await(await handleApi(request({...scope,refresh:false}),env)).json();assert.equal(second.papers.length,2);assert.equal(second.sourcePlan.cacheRetained,true);assert.equal(first.sourcePlan.lastSuccess.retrievedAt,second.sourcePlan.lastSuccess.retrievedAt);assert.equal(fetches,1);
  const list=await(await handleApi(new Request('https://app.test/api/source-plans'),env)).json();assert.equal(list.storageAvailable,true);assert.equal(list.plans[0].latestValidation.verdict,'pass');assert.equal(list.plans[0].latestValidation.coverage,'complete');
  assert.equal((await handleApi(request({...scope,entryUrl:'https://other.example/'}),env)).status,400);
 }finally{bindings.close();await rm(directory,{recursive:true,force:true})}
});
