import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const source=(await readFile(new URL('../ui/runtime.js', import.meta.url), 'utf8')) + '\n' + await readFile(new URL('../ui/profile-research.js',import.meta.url),'utf8');
const metadata=JSON.parse(await readFile(new URL('../data/usenix.json',import.meta.url),'utf8'));
const authors=metadata.papers.flatMap(p=>p.authors.map(a=>({author:a,paper:p})));
function candidates(count=2){return authors.slice(0,count).map(({author,paper},i)=>({id:'test:author-'+i,name:author.name,affiliation:author.affiliations.join('; '),status:'Unknown',interests:[],gradYear:null,gradRange:null,papers:[structuredClone(paper)],sources:[],isSample:false}))}
function proposal(id,{identity='matched'}={}){const cited={sourceIds:['source-1'],asOf:'2026-11-10',confidence:'high',basis:'source_stated'};return {candidateId:id,identity:{status:identity,confidence:identity==='matched'?'high':'low',matchedPaperIds:[metadata.papers[0].id],sourceIds:['source-1'],rationale:'The academic source lists the same paper and coauthors.'},academic:{currentAffiliation:{...cited,value:'Test university source value'},currentStatus:{...cited,value:'PhD student'},researchInterests:{...cited,value:['Distributed systems']},degree:{...cited,value:'PhD'},programStartYear:{...cited,value:2022},expectedGraduationYear:{...cited,value:2027}},sources:[{id:'source-1',url:'https://example.edu/profile',title:'Academic profile test source',sourceDate:'2026-11-10',evidenceExcerpt:'A short academic source excerpt for the test harness.'}],warnings:[],queriedAt:'2026-11-10T20:00:00Z',requiresHumanReview:true}}
function response(data,status=200){return {ok:status>=200&&status<300,status,json:async()=>structuredClone(data)}}
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}}
async function tick(){await new Promise(resolve=>setImmediate(resolve))}

async function app({records=candidates(),queue=[],configured=true,missing=[],pilot={profiles:[],selectionMethod:''},enrich,acceptResult}={}){
  const nodes=new Map(),selectors=new Map(),listeners=new Map(),calls=[],accepts=[],toasts=[],persisted=[];let renderCount=0;
  const state={candidates:structuredClone(records),profileQueue:structuredClone(queue),selected:new Set(),view:'profile-research'};
  const node=id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:'',textContent:'',dataset:{},focus(){}});return nodes.get(id)};
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const context=vm.createContext({state,Date,AbortSignal,Set,Map,Promise,console,
    document:{getElementById:node,querySelectorAll(selector){return selectors.get(selector)||[]},addEventListener(type,callback){listeners.set(type,callback)}},
    esc:escape,url(value){try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)?u.href:'#'}catch{return '#'}},icon:name=>`<svg data-icon="${escape(name)}"></svg>`,
    toast:message=>toasts.push(message),persist(){persisted.push(structuredClone({queue:state.profileQueue,candidates:state.candidates}))},render(){renderCount++},
    modal(title,subtitle,body,foot){node('overlay-root').innerHTML=title+subtitle+body+foot},profile(id){node('last-profile').textContent=id},notifyActivity(){},
    async applyReviewedAcademicFields(id,fields){accepts.push({id,fields:[...fields]});if(acceptResult?.ok===false)return acceptResult;const c=state.candidates.find(c=>c.id===id);c.academicProfile={fields:Object.fromEntries(fields.map(key=>[key,c.academicResearch.academic[key]])),sources:c.academicResearch.sources,reviewed:true};return {ok:true,acceptedFields:fields,manualPreserved:Boolean(c.evidence)}},
    async fetch(path,options){calls.push({path,body:options?.body?JSON.parse(options.body):null});if(path==='/api/profile-research/status')return response({configured,missing,maxBatchSize:25});if(path==='/api/profile-research/pilot')return response(pilot);if(path==='/api/enrich'){const body=JSON.parse(options.body);return enrich?await enrich(body,calls):response({ok:true,status:'needs_review',research:proposal(body.candidateId)})}throw Error('Unexpected test request')},
  });
  vm.runInContext(source,context,{filename:'ui/profile-research.js'});await tick();
  const run=code=>vm.runInContext(code,context),json=code=>JSON.parse(run(`JSON.stringify(${code})`));
  const click=(action,id)=>{const element={dataset:{action,id}};return listeners.get('click')({target:{closest(){return element}},preventDefault(){}})};
  return {state,run,json,node,selectors,calls,accepts,toasts,persisted,click,get renderCount(){return renderCount}};
}

test('unconfigured connection queues honestly and sends no model request',async()=>{
  const ui=await app({configured:false,missing:['OPENAI_API_KEY','OPENAI_MODEL']});
  await ui.run("PR_enqueue(['test:author-0'])");
  assert.equal(ui.state.profileQueue[0].state,'connection_required');assert.equal(ui.state.candidates[0].academicResearch,undefined);
  assert.equal(ui.calls.filter(c=>c.path==='/api/enrich').length,0);
  assert.match(ui.run('profileResearchWorkspace()'),/Live academic research is not connected/);
  assert.match(ui.run('profileResearchWorkspace()'),/API keys are never entered/);
});

test('one enqueue is bounded to 25 records before any live research starts',async()=>{
  const ui=await app({records:candidates(26)});await ui.run('PR_enqueue(state.candidates.map(c=>c.id))');
  assert.equal(ui.state.profileQueue.length,0);assert.equal(ui.calls.filter(c=>c.path==='/api/enrich').length,0);assert.match(ui.toasts.at(-1),/25 or fewer/);
});

test('serial queue sends only canonical identity and at most three paper anchors',async()=>{
  let active=0,maxActive=0;
  const ui=await app({enrich:async body=>{active++;maxActive=Math.max(maxActive,active);await tick();active--;return response({ok:true,research:proposal(body.candidateId)})}});
  await ui.run('PR_enqueue(state.candidates.map(c=>c.id))');
  assert.equal(maxActive,1);assert.ok(ui.state.profileQueue.every(j=>j.state==='needs_review'));
  for(const call of ui.calls.filter(c=>c.path==='/api/enrich')){assert.deepEqual(Object.keys(call.body).sort(),['candidateId','paperIds']);assert.ok(call.body.paperIds.length<=3)}
  assert.ok(ui.state.candidates.every(c=>c.status==='Unknown'&&c.gradYear===null&&c.academicResearch));
});

test('pause waits for current request and leaves remaining authors queued',async()=>{
  const first=deferred();let count=0;
  const ui=await app({enrich:async body=>{if(count++===0)return first.promise;return response({ok:true,research:proposal(body.candidateId)})}});
  const running=ui.run('PR_enqueue(state.candidates.map(c=>c.id))');await tick();
  assert.equal(ui.state.profileQueue[0].state,'researching');await ui.click('pause-profile-queue');
  first.resolve(response({ok:true,research:proposal('test:author-0')}));await running;
  assert.deepEqual(ui.json('state.profileQueue.map(j=>j.state)'),['needs_review','queued']);
  await ui.run('PR_resume()');assert.ok(ui.state.profileQueue.every(j=>j.state==='needs_review'));
});

test('enqueueing while another author runs preserves in-flight job state',async()=>{
  const first=deferred();let count=0;
  const ui=await app({enrich:async body=>{if(count++===0)return first.promise;return response({ok:true,research:proposal(body.candidateId)})}});
  const initial=ui.run("PR_enqueue(['test:author-0'])");await tick();const second=ui.run("PR_enqueue(['test:author-1'])");await tick();
  first.resolve(response({ok:true,research:proposal('test:author-0')}));await Promise.all([initial,second]);
  assert.deepEqual(ui.json('state.profileQueue.map(j=>j.state)'),['needs_review','needs_review']);
});

test('reloaded in-flight jobs are marked interrupted without fake completion',async()=>{
  const ui=await app({queue:[{candidateId:'test:author-0',state:'researching',addedAt:'2026-11-10T20:00:00Z'}]});
  assert.equal(ui.state.profileQueue[0].state,'failed');assert.match(ui.state.profileQueue[0].error,/page closed or reloaded/);assert.equal(ui.calls.filter(c=>c.path==='/api/enrich').length,0);
});

test('source research stays a proposal and preserves manual and reviewed facts',async()=>{
  const records=candidates();records[0].status='Manual academic status';records[0].evidence={sourceUrl:'https://example.edu/manual'};records[0].academicProfile={fields:{currentStatus:{value:'Previous reviewed value'}}};
  const ui=await app({records});await ui.run("PR_enqueue(['test:author-0'])");
  assert.equal(ui.state.candidates[0].status,'Manual academic status');assert.equal(ui.state.candidates[0].academicProfile.fields.currentStatus.value,'Previous reviewed value');
  assert.equal(ui.state.candidates[0].academicResearch.academic.currentStatus.value,'PhD student');assert.equal(ui.run('PR_needsReview(state.candidates[0])'),true);
});

test('ambiguous identity disables field acceptance despite populated source claims',async()=>{
  const records=candidates();records[0].academicResearch=proposal(records[0].id,{identity:'ambiguous'});
  const ui=await app({records});ui.run("openProfileResearchReview('test:author-0')");
  const html=ui.node('overlay-root').innerHTML;assert.match(html,/cannot be accepted until/);assert.equal([...html.matchAll(/name="pr-review-field"[^>]*disabled/g)].length,6);
  ui.selectors.set('input[name="pr-review-field"]:checked',[{value:'currentStatus'}]);await ui.run("PR_accept('test:author-0')");assert.equal(ui.accepts.length,0);
});

test('acceptance requires a non-null field with an actual source URL',async()=>{
  const records=candidates(),research=proposal(records[0].id);research.academic.expectedGraduationYear.value=null;research.academic.programStartYear.sourceIds=['missing-source'];records[0].academicResearch=research;
  const ui=await app({records});assert.equal(ui.run("PR_canAccept(state.candidates[0],'expectedGraduationYear')"),false);assert.equal(ui.run("PR_canAccept(state.candidates[0],'programStartYear')"),false);assert.equal(ui.run("PR_canAccept(state.candidates[0],'currentStatus')"),true);
});

test('review submits only eligible fields to root helper and records human review',async()=>{
  const records=candidates();records[0].academicResearch=proposal(records[0].id);records[0].evidence={sourceUrl:'https://example.edu/manual'};
  const ui=await app({records});ui.selectors.set('input[name="pr-review-field"]:checked',[{value:'expectedGraduationYear'},{value:'currentStatus'},{value:'unrecognizedField'}]);
  await ui.run("PR_accept('test:author-0')");assert.deepEqual(ui.accepts[0].fields,['expectedGraduationYear','currentStatus']);assert.equal(ui.state.profileQueue[0].state,'resolved');assert.ok(ui.state.candidates[0].academicResearch.reviewedAt);assert.match(ui.toasts.at(-1),/manual academic evidence retained priority/);
});

test('rejected root review leaves proposal unresolved and displays the reason',async()=>{
  const records=candidates();records[0].academicResearch=proposal(records[0].id);
  const ui=await app({records,acceptResult:{ok:false,error:'The academic source could not be validated.'}});ui.selectors.set('input[name="pr-review-field"]:checked',[{value:'currentStatus'}]);
  await ui.run("PR_accept('test:author-0')");assert.equal(ui.state.profileQueue[0].state,'needs_review');assert.equal(ui.state.candidates[0].academicResearch.reviewedAt,undefined);assert.match(ui.node('pr-review-error').textContent,/could not be validated/);
});

test('pilot attaches source proposals once and never replaces existing research or accepted evidence',async()=>{
  const records=candidates(3);records[1].academicResearch=proposal(records[1].id,{identity:'unresolved'});records[2].academicProfile={fields:{currentStatus:{value:'Previously reviewed'}}};
  const pilot={profiles:records.map(c=>proposal(c.id)),selectionMethod:'Lexicographic canonical author IDs; no model requests.'};
  const ui=await app({records,pilot});await ui.run('profileResearchOnData()');await ui.run('profileResearchOnData()');
  assert.equal(ui.calls.filter(c=>c.path==='/api/profile-research/pilot').length,1);assert.equal(ui.calls.filter(c=>c.path==='/api/enrich').length,0);
  assert.equal(ui.state.candidates[0].academicResearch.origin,'assistant_agents_public_sources');assert.equal(ui.state.candidates[1].academicResearch.identity.status,'unresolved');assert.equal(ui.state.candidates[2].academicResearch,undefined);
  assert.match(ui.run('profileResearchSection(state.candidates[0])'),/Researched by assistant agents from public sources/);
});

test('cached pilot findings attach after a collection change without refetching',async()=>{
  const records=candidates(3),pilot={profiles:[proposal(records[2].id)],selectionMethod:'Canonical author IDs'};
  const ui=await app({records:records.slice(0,2),pilot});assert.equal(ui.state.candidates.length,2);
  ui.state.candidates.push(records[2]);await ui.run('profileResearchOnData()');
  assert.equal(ui.calls.filter(c=>c.path==='/api/profile-research/pilot').length,1);assert.equal(ui.state.candidates[2].academicResearch.origin,'assistant_agents_public_sources');assert.equal(ui.state.profileQueue[0].state,'needs_review');
});

test('bootstrap pilot origin and configured status are labeled without claiming provider verification',async()=>{
  const records=candidates();records[0].academicResearch={...proposal(records[0].id),researchMethod:'assistant_agents_public_sources'};
  const ui=await app({records});await ui.run('PR_checkConnection()');
  assert.match(ui.run('profileResearchSection(state.candidates[0])'),/Researched by assistant agents from public sources/);
  assert.match(ui.run('PR_connectionPanel()'),/Server model configuration present/);assert.match(ui.run('PR_connectionPanel()'),/provider access is checked when a live request runs/);
});

test('mismatched or malformed server research never becomes a completed proposal',async()=>{
  const ui=await app({enrich:async()=>response({ok:true,research:proposal('different-author')})});await ui.run("PR_enqueue(['test:author-0'])");
  assert.equal(ui.state.profileQueue[0].state,'failed');assert.equal(ui.state.candidates[0].academicResearch,undefined);assert.match(ui.state.profileQueue[0].error,/candidate-specific/);
});

test('server connection loss stops the queue and does not mark other authors complete',async()=>{
  const ui=await app({enrich:async()=>response({ok:false,status:'connection_required',error:'Server model configuration is missing.'},503)});
  await ui.run('PR_enqueue(state.candidates.map(c=>c.id))');assert.deepEqual(ui.json('state.profileQueue.map(j=>j.state)'),['connection_required','connection_required']);assert.equal(ui.calls.filter(c=>c.path==='/api/enrich').length,1);
});

test('source values and excerpts escape markup and unsafe citation links cannot be accepted',async()=>{
  const records=candidates(),research=proposal(records[0].id);research.academic.currentAffiliation.value='<img src=x onerror=alert(1)>';research.sources[0].url='javascript:alert(1)';research.sources[0].evidenceExcerpt=Array.from({length:60},(_,i)=>'word'+i).join(' ');records[0].academicResearch=research;
  const ui=await app({records});ui.run("openProfileResearchReview('test:author-0')");const html=ui.node('overlay-root').innerHTML;
  assert.doesNotMatch(html,/<img src=x/);assert.match(html,/&lt;img/);assert.equal(ui.run("PR_canAccept(state.candidates[0],'currentAffiliation')"),false);assert.equal(ui.run("PR_excerpt('one two three').split(' ').length"),3);assert.equal(ui.run(`PR_excerpt(${JSON.stringify(research.sources[0].evidenceExcerpt)}).split(' ').length`),24);
});

test('date-only source evidence preserves its calendar day in Los Angeles',async()=>{
  const previous=process.env.TZ;process.env.TZ='America/Los_Angeles';
  try{const ui=await app();
    assert.equal(ui.run("PR_date('2026-09-24')"),'Sep 24, 2026');
    assert.equal(ui.run("PR_date('2026-09-24T00:30:00Z')"),'Sep 23, 2026');
    assert.equal(ui.run("PR_date('2026')"),'2026');assert.equal(ui.run("PR_date('2026-09')"),'2026-09');assert.equal(ui.run("PR_date('2026/09')"),'2026-09');
    assert.equal(ui.run("PR_date('2026-02-31')"),'Date not supplied');
  }finally{if(previous===undefined)delete process.env.TZ;else process.env.TZ=previous}
});
