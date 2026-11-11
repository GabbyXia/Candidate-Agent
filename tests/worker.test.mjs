import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source=await readFile(new URL('../dist/server/index.js',import.meta.url),'utf8');
const {default:worker}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
test('serves the application and embedded assets with appropriate content types',async()=>{
 for(const [path,type,text]of [['/','text/html','Talent Atlas'],['/app.css','text/css','.sidebar'],['/app.js','application/javascript','function render()'],['/profile-research.js','application/javascript','profileResearchWorkspace'],['/profile-research.css','text/css','.pr-'],['/source-plans.js','application/javascript','sourcePlanWorkspace'],['/source-plans.css','text/css','.sp-'],['/mapping-run.js','application/javascript','mappingRunWorkspace'],['/mapping-run.css','text/css','.mr-'],['/mapping-export.js','application/javascript','buildMappingWorkbook']]){
  const response=await worker.fetch(new Request('https://example.test'+path));assert.equal(response.status,200);assert.ok(response.headers.get('content-type').includes(type));assert.ok((await response.text()).includes(text));
 }
});
test('does not serve a page for unknown routes or allow arbitrary mutations',async()=>{
 assert.equal((await worker.fetch(new Request('https://example.test/secrets'))).status,404);
 assert.equal((await worker.fetch(new Request('https://example.test/',{method:'POST'}))).status,405);
});
test('routes configuration state to the API rather than the HTML shell',async()=>{
 const r=await worker.fetch(new Request('https://example.test/api/status'));assert.equal(r.status,200);assert.equal((await r.json()).aiConfigured,false);
});
test('deployed artifact opens with the entire real official-proceedings snapshot',async()=>{
 const snapshots=await Promise.all(['usenix','networking'].map(async name=>JSON.parse(await readFile(new URL('../data/'+name+'.json',import.meta.url),'utf8'))));
 const expected=snapshots.flatMap(s=>s.papers);
 const response=await worker.fetch(new Request('https://example.test/api/bootstrap'));
 assert.equal(response.status,200);const data=await response.json();
 assert.equal(data.papers.length,expected.length);
 assert.deepEqual(new Set(data.papers.map(p=>p.id)),new Set(expected.map(p=>p.id)));
 assert.equal(data.coverage.editions.length,15);
 assert.ok(data.candidates.length>100);
 assert.ok(data.candidates.every(c=>!c.isSample&&c.status==='Unknown'&&c.gradYear===null));
 assert.equal(data.candidates.filter(c=>c.academicResearch).length,4);
 assert.ok(data.candidates.filter(c=>c.academicResearch).every(c=>c.academicResearch.requiresHumanReview));
 assert.ok(data.papers.every(p=>p.url.startsWith('https://')&&p.sourceUrl.startsWith('https://')));
 assert.ok(data.coverage.editions.some(e=>e.conferenceId==='sigcomm'&&e.year===2026&&e.expectedPapers===110&&e.listingPapers===109));
});
test('deployed academic research routes expose real proposals and honest model setup state',async()=>{
 const pilot=await(await worker.fetch(new Request('https://example.test/api/profile-research/pilot'))).json();assert.equal(pilot.profiles.length,4);assert.match(pilot.selectionMethod,/canonical author IDs/);
 const status=await(await worker.fetch(new Request('https://example.test/api/profile-research/status'))).json();assert.equal(status.configured,false);assert.equal(status.maxBatchSize,25);
 const response=await worker.fetch(new Request('https://example.test/api/enrich',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({candidateId:pilot.profiles[0].candidateId})}));assert.equal(response.status,503);assert.equal((await response.json()).status,'connection_required');
});
test('deployed artifact includes every validated source plan and shared-storage declarations',async()=>{
 const sourcePlans=await(await worker.fetch(new Request('https://example.test/api/source-plans'))).json();assert.equal(sourcePlans.plans.length,29);assert.ok(sourcePlans.plans.every(row=>row.status==='active'&&row.latestValidation.verdict==='pass'));
 const atc=sourcePlans.plans.find(row=>row.plan.conferenceId==='atc'&&row.plan.year===2026);assert.equal(atc.plan.adapter,'generic-html-v1');assert.equal(atc.latestValidation.observedCount,135);
 const configuration=JSON.parse(await readFile(new URL('../.openai/hosting.json',import.meta.url),'utf8'));assert.equal(configuration.d1,'DB');assert.equal(configuration.r2,'BUCKET');
 const status=await(await worker.fetch(new Request('https://example.test/api/source-plans/status'))).json();assert.equal(status.modelConfigured,false);assert.equal(sourcePlans.storageAvailable,false);
});
test('the primary entry point is an end-to-end mapping run with an offline-capable conference plan',async()=>{
 const html=await(await worker.fetch(new Request('https://example.test/'))).text();assert.match(html,/data-default-view="mapping-run"/);assert.match(html,/mapping-export\.js/);
 const plan=await(await worker.fetch(new Request('https://example.test/api/mapping-runs/plan',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({direction:'Datacenter networking and transport'})}))).json();assert.equal(plan.ok,true);assert.deepEqual(plan.plan.conferenceIds,['sigcomm','nsdi','conext','imc']);assert.equal(plan.plan.editions.length,12);
 const status=await(await worker.fetch(new Request('https://example.test/api/mapping-runs/status'))).json();assert.equal(status.execution,'persistent_checkpoints_with_active_browser_driver');assert.equal(status.excelExport,true);
});
