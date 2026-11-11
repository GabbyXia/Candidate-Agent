import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {DOMAINS,CONFERENCES} from '../shared/catalog.js';

const programCode=(await readFile(new URL('../shared/current-program.js',import.meta.url),'utf8')).replace(/^export /gm,'');
const source=(await readFile(new URL('../ui/runtime.js', import.meta.url), 'utf8')) + '\n' + await readFile(new URL('../ui/mapping-run.js',import.meta.url),'utf8');
const publisher=JSON.parse(await readFile(new URL('../data/usenix.json',import.meta.url),'utf8'));
const technicalDirection='Datacenter networking and congestion control';
function plan(){return {direction:technicalDirection,role:'Networking Researcher',keywords:'datacenter, networking, congestion control',domain:'networking',domains:[{id:'networking',name:'Computer networking',score:12}],conferences:['sigcomm','nsdi','conext','imc'].map(id=>({id,name:CONFERENCES.find(c=>c.id===id).name,rationale:'Curated networking venue aligned with the technical direction.'})),conferenceIds:['sigcomm','nsdi','conext','imc'],startYear:2024,endYear:2026,years:[2024,2025,2026],method:'curated_catalog'}}
function run(status='queued'){return {id:'mapping-1',status,state:status,stage:status==='completed'?'completed':'collecting',direction:technicalDirection,role:'Networking Researcher',keywords:'datacenter, networking',domain:'networking',conferenceIds:['sigcomm','nsdi'],startYear:2024,endYear:2026,criteria:{targetGraduationYear:2027,currentStatuses:['PhD student','Master’s student','Researcher'],minResearchFit:50,includeUnknown:true},createdAt:'2026-11-10T20:00:00Z',updatedAt:'2026-11-10T20:00:00Z'}}
function result(count=3){const papers=structuredClone(publisher.papers.slice(0,2)),authors=publisher.papers.flatMap(p=>p.authors).slice(0,count),candidates=authors.map((a,i)=>({id:'test:author-'+i,name:a.name,affiliation:a.affiliations.join('; '),status:'Unknown',gradYear:null,gradRange:null,fit:i===0?90:i===1?60:20,paperIds:[papers[0].id]}));return {papers,candidates,coverage:{startYear:2024,endYear:2026,completenessLabel:'Official publisher records retained; academic evidence is reviewed separately.'},screening:candidates.map((c,i)=>({candidateId:c.id,outcome:i===0?'matches_criteria':i===1?'needs_review':'outside_criteria',includeInView:i<2,reasons:[],professionalFacts:i===0?{currentStatus:{value:'PhD student'},expectedGraduationYear:{value:2027}}:{}})),stats:{},warnings:['Current academic status remains unknown where no source supports it.']}}
function progress({completed=0,queued=3,failed=0,needsReview=0,stage='profiling'}={}){return {stage,editionsTotal:6,editionsCompleted:6,editionsFailed:0,papersCollected:2,authorsTotal:3,profilesTotal:3,profilesCompleted:completed,profilesQueued:queued,profilesFailed:failed,profilesNeedsReview:needsReview,profilesResearching:0}}
function response(data,status=200){return {ok:status>=200&&status<300,status,json:async()=>structuredClone(data)}}
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}}
async function tick(){await new Promise(resolve=>setImmediate(resolve))}

async function app({runs=[],advance,route,exportError=false,timerMode='real'}={}){
  const nodes=new Map(),listeners=new Map(),calls=[],toasts=[],collections=[],exports=[],timerDelays=[],modalCalls=[];let renders=0;
  const server={runs:structuredClone(runs),current:runs[0]?{run:structuredClone(runs[0]),progress:progress(),result:result()}:null,advanceCount:0};
  const node=id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:'',textContent:'',value:'',disabled:false,values:{},reportValidity(){return true}});return nodes.get(id)};
  node('mr-request-form').values={direction:technicalDirection,role:'',keywords:'',domain:'auto'};
  node('mr-launch-form').values={conferenceIds:['sigcomm','nsdi','conext','imc'],startYear:'2024',endYear:'2026',targetGraduationYear:'2027',minResearchFit:'50',currentStatuses:['PhD student','Master’s student','Researcher']};
  class FormValues{constructor(form){this.values=form.values}get(key){const value=this.values[key];return Array.isArray(value)?value[0]:value??''}getAll(key){const value=this.values[key];return Array.isArray(value)?value:value?[value]:[]}}
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const state={view:'mapping-run'},context=vm.createContext({state,YEAR:2026,Date,URL,AbortSignal,Promise,Map,Set,console,DOMAINS:structuredClone(DOMAINS),CONFERENCES:structuredClone(CONFERENCES),FormData:FormValues,
    setTimeout(handler,delay){timerDelays.push(delay);if(timerMode==='hold')return {held:true};return globalThis.setTimeout(handler,timerMode==='immediate'?0:delay)},clearTimeout(timer){if(!timer?.held)globalThis.clearTimeout(timer)},
    document:{getElementById:node,addEventListener(type,handler){listeners.set(type,handler)}},esc:escape,icon:name=>`<svg data-icon="${escape(name)}"></svg>`,render(){renders++},toast:message=>toasts.push(message),applyCollection:(...args)=>collections.push(args),
    modal(title,subtitle,body,foot){modalCalls.push({title,subtitle,body,foot});node('overlay-root').innerHTML=title+subtitle+body+foot},
    async downloadMappingWorkbook(...args){exports.push(args);if(exportError)throw Error('Test workbook export failed.')},
    async fetch(path,options){const body=options?.body?JSON.parse(options.body):null;calls.push({path,body});if(route){const custom=await route(path,body,server);if(custom)return custom}
      if(path==='/api/mapping-runs/plan')return response({ok:true,plan:plan()});
      if(path==='/api/mapping-runs'&&body){server.current={run:{...run(),...body},progress:{stage:'collecting',editionsTotal:12,editionsCompleted:0},result:null};server.runs.unshift(server.current.run);return response({ok:true,...server.current})}
      if(path==='/api/mapping-runs')return response({runs:server.runs});
      if(path==='/api/mapping-runs/mapping-1/advance'){server.advanceCount++;const next=advance?await advance(server.advanceCount,body,server):{run:{...run('completed'),updatedAt:'2026-11-10T20:04:00Z'},progress:progress({completed:3,queued:0,needsReview:1,stage:'completed'}),result:result()};if(next instanceof Error)throw next;server.current=next;return response({ok:true,...next})}
      if(path==='/api/mapping-runs/mapping-1')return response({ok:true,...server.current});
      if(path.endsWith('/pause')){server.current={...server.current,run:{...server.current.run,status:'paused',state:'paused',updatedAt:'2026-11-10T20:02:00Z'}};return response({ok:true,...server.current})}
      if(path.endsWith('/resume')||path.endsWith('/retry')){server.current={...server.current,run:{...server.current.run,status:'running',state:'running',stage:'profiling',updatedAt:'2026-11-10T20:03:00Z'}};return response({ok:true,...server.current})}
      throw Error('Unexpected test request '+path);
    },
  });
  vm.runInContext(programCode+'\n'+source,context,{filename:'ui/mapping-run.js'});await tick();
  const evalCode=code=>vm.runInContext(code,context),json=code=>JSON.parse(evalCode(`JSON.stringify(${code})`));
  const click=(action,extra={})=>{const element={dataset:{action,...extra}};return listeners.get('click')({target:{closest(){return element}},preventDefault(){}})};
  return {state,server,node,calls,toasts,collections,exports,timerDelays,modalCalls,run:evalCode,json,click,listeners,get renders(){return renders}};
}

test('one entry point loads saved runs without automatically starting tasks',async()=>{
  const ui=await app({runs:[run('paused')]});assert.equal(ui.calls.filter(c=>c.path.endsWith('/advance')).length,0);const html=ui.run('mappingRunWorkspace()');assert.match(html,/What research talent are you looking for/);assert.match(html,/Saved mapping runs/);assert.match(html,/three-year paper records/);
});

test('catalog plan uses derived role and keywords and defaults to four finite venues',async()=>{
  const ui=await app();await ui.click('mr-plan');assert.equal(ui.json('MR_state.plan.method'),'curated_catalog');assert.deepEqual(ui.json('[...MR_state.selectedConferences]'),['sigcomm','nsdi','conext','imc']);assert.equal(ui.json('MR_state.form.keywords'),'datacenter, networking, congestion control');assert.match(ui.run('mappingRunWorkspace()'),/Catalog-based recommendations/);
});

test('replanning a new direction does not turn previous automatic suggestions into explicit constraints',async()=>{
  let planned=0;const ui=await app({route:async(path,body)=>{if(path!=='/api/mapping-runs/plan'||planned++===0)return null;return response({ok:true,plan:{...plan(),domain:'vision',role:'Vision Researcher',keywords:'computer vision',conferences:[{id:'cvpr',name:'CVPR',rationale:'Curated vision venue'}]}})}});
  await ui.click('mr-plan');ui.node('mr-request-form').values={direction:'Computer vision',role:'Networking Researcher',keywords:'datacenter, networking, congestion control',domain:'auto'};await ui.click('mr-plan');
  const request=ui.calls.filter(call=>call.path==='/api/mapping-runs/plan').at(-1);assert.deepEqual(request.body,{direction:'Computer vision'});assert.equal(ui.json('MR_state.form.role'),'Vision Researcher');assert.equal(ui.json('MR_state.form.domain'),'auto');
  await ui.click('mr-new');assert.equal(ui.json('MR_state.form.direction'),'');assert.equal(ui.json('MR_state.form.keywords'),'');assert.equal(ui.json('MR_state.form.minResearchFit'),0);
});

test('start saves professional scope and advances until backend completed',async()=>{
  const ui=await app();await ui.click('mr-plan');await ui.click('mr-start');
  const created=ui.calls.find(c=>c.path==='/api/mapping-runs'&&c.body);assert.equal(created.body.criteria.includeUnknown,true);assert.equal(created.body.criteria.targetGraduationYear,null);assert.equal(created.body.criteria.dateMode,'current_program_start');assert.equal(created.body.criteria.programStartYearFrom,null);assert.equal(created.body.conferenceIds.length,4);assert.equal(ui.server.advanceCount,1);assert.equal(ui.json('MR_state.run.status'),'completed');assert.match(ui.run('mappingRunWorkspace()'),/backend reports this run complete/);
});

test('connection-required profile stage keeps real source results and stops advancing',async()=>{
  const ui=await app({advance:async()=>({run:run('connection_required'),progress:progress(),result:result()})});await ui.click('mr-plan');await ui.click('mr-start');
  assert.equal(ui.server.advanceCount,1);assert.equal(ui.json('MR_state.result.papers.length'),2);assert.match(ui.run('mappingRunWorkspace()'),/Official paper and author results remain available/);assert.doesNotMatch(ui.run('mappingRunWorkspace()'),/backend reports this run complete/);
});

test('metadata-only connection-required response automatically hydrates real paper results',async()=>{
  const ui=await app({advance:async()=>({run:run('connection_required'),progress:progress()}),route:async(path,body,server)=>path==='/api/mapping-runs/mapping-1'?response({ok:true,...server.current,result:result()}):null});
  await ui.click('mr-plan');await ui.click('mr-start');
  assert.equal(ui.json('MR_state.result.papers.length'),2);assert.equal(ui.calls.filter(c=>c.path==='/api/mapping-runs/mapping-1').length,1);assert.match(ui.run('mappingRunWorkspace()'),/Download Excel/);
});

test('metadata-only profile advances hydrate at stage boundaries and terminal state, not every author',async()=>{
  const ui=await app({advance:async count=>({run:{...run(count===3?'completed':'running'),stage:count===3?'completed':'profiling',updatedAt:`2026-11-10T20:0${count}:00Z`},progress:progress({completed:count,queued:3-count,stage:count===3?'completed':'profiling'})}),route:async(path,body,server)=>path==='/api/mapping-runs/mapping-1'?response({ok:true,...server.current,result:result()}):null});
  await ui.click('mr-plan');await ui.click('mr-start');
  assert.equal(ui.server.advanceCount,3);assert.equal(ui.calls.filter(c=>c.path==='/api/mapping-runs/mapping-1').length,2);assert.equal(ui.json('MR_state.run.status'),'completed');assert.equal(ui.json('MR_state.result.candidates.length'),3);
});

test('uncertain work requires explicit retry instead of automatic retry loops',async()=>{
  const ui=await app({runs:[run('needs_retry')]});await ui.run("MR_open('mapping-1')");assert.equal(ui.server.advanceCount,0);assert.match(ui.run('mappingRunWorkspace()'),/Needs explicit retry/);
  await ui.click('mr-retry');assert.equal(ui.calls.filter(c=>c.path.endsWith('/retry')).length,1);assert.equal(ui.server.advanceCount,1);assert.equal(ui.json('MR_state.run.status'),'completed');
});

test('per-author mapping has no 25-candidate UI cap and uses bounded two-task requests',async()=>{
  const all=result(30),ui=await app({advance:async()=>({run:run('completed'),progress:{...progress({completed:30,queued:0,stage:'completed'}),authorsTotal:30,profilesTotal:30},result:all})});await ui.click('mr-plan');await ui.click('mr-start');
  assert.equal(ui.json('MR_state.result.candidates.length'),30);assert.deepEqual(ui.calls.find(c=>c.path.endsWith('/advance')).body,{maxTasks:2});assert.match(ui.run('mappingRunWorkspace()'),/Showing 1–20 of 30 matching authors/);
});

test('an advance failure preserves the last real result and does not invent task completion',async()=>{
  const ui=await app({runs:[run('running')],advance:async()=>new Error('Source request failed.')});await ui.run("MR_open('mapping-1')");await ui.run("MR_pump('mapping-1')");
  assert.equal(ui.json('MR_state.result.papers.length'),2);assert.equal(ui.json('MR_state.run.status'),'running');assert.equal(ui.json('MR_state.progress.profilesCompleted'),0);assert.match(ui.json('MR_state.message'),/No unreceived task result/);
});

test('pause stops after the in-flight request and ignores an older running response',async()=>{
  const hold=deferred();const ui=await app({runs:[run('running')],advance:async()=>hold.promise});await ui.run("MR_open('mapping-1')");const processing=ui.run("MR_pump('mapping-1')");await tick();
  await ui.click('mr-pause');hold.resolve({run:run('running'),progress:progress(),result:result()});await processing;
  assert.equal(ui.server.advanceCount,1);assert.equal(ui.json('MR_state.run.status'),'paused');assert.equal(ui.json('MR_state.pumping'),false);
});

test('stalled backend state stops the browser pump without claiming completion',async()=>{
  const envelope={run:run('running'),progress:progress(),result:result()};const ui=await app({runs:[run('running')],advance:async()=>envelope});await ui.run("MR_open('mapping-1')");await ui.run("MR_pump('mapping-1')");assert.ok(ui.server.advanceCount<=3);assert.equal(ui.json('MR_state.run.status'),'running');assert.match(ui.json('MR_state.message'),/waiting for actionable work/);
});

test('changed direction invalidates the preview and oversized or long-year scopes are rejected',async()=>{
  const ui=await app();await ui.click('mr-plan');ui.run("MR_state.form.direction='A different systems direction'");await ui.click('mr-start');assert.equal(ui.calls.filter(c=>c.path==='/api/mapping-runs'&&c.body).length,0);
  await ui.click('mr-plan');ui.node('mr-launch-form').values.conferenceIds=CONFERENCES.slice(0,9).map(c=>c.id);await ui.click('mr-start');assert.match(ui.json('MR_state.error'),/one and eight/);
  ui.node('mr-launch-form').values.conferenceIds=['sigcomm'];ui.node('mr-launch-form').values.startYear='2020';await ui.click('mr-start');assert.match(ui.json('MR_state.error'),/one to three years/);
});

test('array screening outcomes aggregate all records and display source-backed professional facts',async()=>{
  const ui=await app({runs:[run('connection_required')]});await ui.run("MR_open('mapping-1')");assert.deepEqual(ui.json('MR_screening()'),{matched:1,review:1,excluded:1});
  assert.equal(ui.run('MR_candidateFacts(MR_state.result.candidates[0]).status'),'PhD student');assert.equal(ui.run('MR_candidateFacts(MR_state.result.candidates[0]).programStart'),'Unknown');assert.match(ui.run('MR_resultsView()'),/needs review/);
});

test('canonical nested metadata and task counters show planned authors and uncertain attempts',async()=>{
  const ui=await app();const canonical={id:'mapping-1',state:'needs_retry',status:'needs_retry',stage:'profiling',revision:4,input:{direction:technicalDirection,role:'Networking Researcher',keywords:'networking',startYear:2024,endYear:2026,criteria:{targetGraduationYear:2027}},plan:{domain:'networking',conferenceIds:['sigcomm','nsdi']},updatedAt:'2026-11-10T20:04:00Z'};
  const nested={collection:{total:6,pending:0,leased:0,completed:5,failed:1},profiles:{total:25,planned:30,pending:20,leased:1,completed:1,failed:0,uncertain:1,paused:2,pilotReused:0},candidateCount:30,screening:{matchesCriteria:1,needsReview:25,outsideCriteria:4}};
  ui.run('MR_accept('+JSON.stringify({run:canonical,progress:nested,result:result(30)})+')');const counts=ui.json('MR_counts()');
  assert.equal(ui.json('MR_state.run.direction'),technicalDirection);assert.equal(counts.editionsTotal,6);assert.equal(counts.editionsCompleted,6);assert.equal(counts.editionsFailed,1);assert.equal(counts.profileTotal,30);assert.equal(counts.queued,20);assert.equal(counts.researching,1);assert.equal(counts.needsReview,25);assert.equal(counts.uncertain,1);assert.equal(counts.paused,2);
  const html=ui.run('MR_progressView()');assert.match(html,/1 uncertain attempts require explicit retry/);assert.match(html,/2 paused tasks/);
});

test('lightweight updates merge cited profile research and screening without a full-result fetch',async()=>{
  const ui=await app();ui.run('MR_accept('+JSON.stringify({run:{...run('running'),revision:1},progress:progress(),result:result()})+')');
  const candidate={...result().candidates[0],academicResearch:{identity:{status:'matched'},academic:{currentStatus:{value:'PhD student',basis:'source_stated',sourceIds:['profile']}},sources:[{id:'profile',url:'https://example.edu/profile'}]}},screened={candidateId:candidate.id,outcome:'matches_criteria',professionalFacts:{identityStatus:'matched',currentStatus:'PhD student',expectedGraduationYear:2027,researchFit:90,requiresHumanReview:true,sources:['https://example.edu/profile']}};
  ui.run('MR_accept('+JSON.stringify({run:{...run('running'),revision:2},progress:progress({completed:1,queued:2}),updates:{candidates:[candidate],stats:{matchesCriteria:1,needsReview:1,outsideCriteria:1},screening:[screened]}})+')');
  assert.equal(ui.json('MR_state.result.candidates[0].academicResearch.identity.status'),'matched');assert.equal(ui.run('MR_candidateFacts(MR_state.result.candidates[0]).status'),'PhD student');assert.equal(ui.run('MR_candidateFacts(MR_state.result.candidates[0]).programStart'),'Unknown');assert.deepEqual(ui.json('MR_screening()'),{matched:1,review:1,excluded:1});assert.equal(ui.calls.filter(call=>call.path==='/api/mapping-runs/mapping-1').length,0);
  assert.equal(ui.run('MR_accept('+JSON.stringify({run:{...run('running'),revision:1}})+')'),false);
});

test('broad direction has no default fit exclusion and a cited current affiliation supersedes old publication metadata',async()=>{
  const ui=await app({runs:[run('connection_required')]});assert.equal(ui.json('MR_state.form.minResearchFit'),0);await ui.run("MR_open('mapping-1')");
  ui.run("MR_state.result.candidates[0].academicResearch={identity:{status:'matched'},academic:{currentAffiliation:{value:'Current source-backed institution',basis:'source_stated',sourceIds:['profile-source']}},sources:[{id:'profile-source',url:'https://example.edu/profile'}]}");
  assert.equal(ui.run('MR_candidateFacts(MR_state.result.candidates[0]).affiliation'),'Current source-backed institution');assert.equal(ui.run('MR_candidateFacts(MR_state.result.candidates[0]).affiliationProposed'),true);assert.match(ui.run('MR_resultsView()'),/Current affiliation proposal/);
});

test('dashboard handoff and Excel export retain every result rather than the ten-row preview',async()=>{
  const all=result(30),ui=await app({runs:[run('completed')]});ui.server.current.result=all;await ui.run("MR_open('mapping-1')");await ui.click('mr-excel');assert.equal(ui.exports[0][0].candidates.length,30);assert.equal(ui.exports[0][1].id,'mapping-1');await ui.click('mr-dashboard');assert.equal(ui.collections[0][0].candidates.length,30);assert.equal(ui.state.view,'overview');
});

test('workbook failure leaves the saved mapping available without a success claim',async()=>{
  const ui=await app({runs:[run('completed')],exportError:true});await ui.run("MR_open('mapping-1')");await ui.click('mr-excel');assert.match(ui.json('MR_state.error'),/workbook export failed/);assert.equal(ui.toasts.includes('The mapping workbook is ready.'),false);assert.equal(ui.json('MR_state.result.papers.length'),2);
});

test('saved-run fetch failure keeps the previous selected run and source records',async()=>{
  const ui=await app({runs:[run('paused')],route:async path=>path.endsWith('/missing')?response({error:'Saved run unavailable.'},503):null});await ui.run("MR_open('mapping-1')");await ui.run("MR_open('missing')");assert.equal(ui.json('MR_state.run.id'),'mapping-1');assert.equal(ui.json('MR_state.result.papers.length'),2);assert.match(ui.json('MR_state.error'),/unavailable/);
});

test('plan and result rendering escape source text instead of injecting markup',async()=>{
  const ui=await app({runs:[{...run('paused'),direction:'<img src=x onerror=alert(1)>'}]});await ui.run("MR_open('mapping-1')");ui.run("MR_state.result.candidates[0].name='<script>alert(1)</script>'");const html=ui.run('mappingRunWorkspace()');assert.doesNotMatch(html,/<img src=x|<script>alert/);assert.match(html,/&lt;script&gt;/);
});

test('result outcomes combine with name, current affiliation, and expertise search without dropping data',async()=>{
  const all=result(45);all.screening.forEach((row,index)=>row.outcome=['matches_criteria','needs_review','outside_criteria'][index%3]);all.candidates[43].interests=['Deterministic simulation pipelines'];
  const ui=await app({runs:[run('completed')]});ui.server.current.result=all;await ui.run("MR_open('mapping-1')");
  assert.deepEqual(ui.json('MR_screening()'),{matched:15,review:15,excluded:15});await ui.click('mr-result-outcome',{outcome:'needs_review'});assert.equal(ui.json('MR_resultRows().length'),15);
  ui.listeners.get('input')({target:{id:'mr-result-search',value:'deterministic simulation'}});assert.deepEqual(ui.json('MR_resultRows().map(row=>row.candidate.id)'),['test:author-43']);
  ui.run("MR_state.resultQuery='';MR_setOutcome('all');MR_state.resultQuery=MR_state.result.candidates[1].name");assert.ok(ui.json('MR_resultRows().every(row=>row.candidate.name.includes(MR_state.resultQuery))'));
  ui.run("MR_state.resultQuery='ETH Zurich'");assert.ok(ui.json('MR_resultRows().every(row=>row.evidence.affiliation.includes("ETH Zurich"))'));assert.equal(ui.json('MR_state.result.candidates.length'),45);
});

test('twenty-row result pagination reaches every author and Excel still receives all filtered-out records',async()=>{
  const ui=await app({runs:[run('completed')]});ui.server.current.result=result(45);await ui.run("MR_open('mapping-1')");
  ui.run('MR_state.resultPage=2');let html=ui.run('MR_resultTable()');assert.match(html,/Showing 21–40 of 45/);assert.equal([...html.matchAll(/class="name-btn mr-author-button"/g)].length,20);
  await ui.click('mr-result-page',{page:'99'});assert.equal(ui.json('MR_state.resultPage'),3);assert.match(ui.node('mr-result-rows').innerHTML,/Showing 41–45 of 45/);
  ui.run("MR_setOutcome('matches_criteria');MR_state.resultQuery=MR_state.result.candidates[0].name");await ui.click('mr-excel');assert.equal(ui.exports[0][0].candidates.length,45);assert.equal(ui.exports[0][0].screening.length,45);assert.equal(ui.exports[0][0].papers.length,2);
});

test('filters and page survive metadata updates but reset for a new run scope',async()=>{
  const ui=await app();ui.run('MR_accept('+JSON.stringify({run:{...run('running'),revision:1},progress:progress(),result:result(45)})+')');ui.run("MR_state.resultOutcome='outside_criteria';MR_state.resultQuery='systems';MR_state.resultPage=2");
  ui.run('MR_accept('+JSON.stringify({run:{...run('running'),revision:2},progress:progress({completed:1,queued:2}),updates:{candidates:[],screening:[],stats:{}}})+')');assert.deepEqual(ui.json('[MR_state.resultOutcome,MR_state.resultQuery,MR_state.resultPage]'),['outside_criteria','systems',2]);
  ui.run('MR_accept('+JSON.stringify({run:{...run('running'),revision:3,conferenceIds:['cvpr']},progress:progress(),result:result(45)})+')');assert.deepEqual(ui.json('[MR_state.resultOutcome,MR_state.resultQuery,MR_state.resultPage]'),['all','',1]);
});

test('read-only profile modal shows cited proposals, original dates and identity anchors without approving facts',async()=>{
  const ui=await app({runs:[run('completed')]});await ui.run("MR_open('mapping-1')");const candidate=ui.json('MR_state.result.candidates[0]'),common={basis:'source_stated',sourceIds:['profile'],asOf:'2026-09-24',confidence:'high'};
  const research={identity:{status:'matched',rationale:'The profile links the same published paper. <script>unsafe</script>',matchedPaperIds:[publisher.papers[0].id]},academic:{currentAffiliation:{...common,value:'Current academic source institution'},currentStatus:{...common,value:'PhD student'},degree:{...common,value:'PhD'},programStartYear:{...common,value:2022},expectedGraduationYear:{...common,value:2027},researchInterests:{...common,value:['Distributed systems']}},sources:[{id:'profile',url:'https://example.edu/profile',title:'University profile',sourceDate:'2026-09-24'}],queriedAt:'2026-11-10T20:00:00Z'};
  ui.run('MR_state.result.candidates[0].academicResearch='+JSON.stringify(research));const before=ui.json('MR_state.result.candidates[0]');await ui.click('mr-profile',{id:candidate.id});const html=ui.node('overlay-root').innerHTML;
  assert.match(html,/Current academic source institution/);assert.match(html,/Source-stated proposal/);assert.match(html,/2026-09-24/);assert.match(html,/Distributed systems/);assert.match(html,/https:\/\/example.edu\/profile/);assert.match(html,/Publication identity anchors/);assert.doesNotMatch(html,/<script>|Accept selected/);assert.deepEqual(ui.json('MR_state.result.candidates[0]'),before);assert.equal(ui.collections.length,0);
});

test('unresolved identity proposals are not attributed as the author’s academic facts',async()=>{
  const ui=await app({runs:[run('completed')]});await ui.run("MR_open('mapping-1')");ui.run("MR_state.result.screening[0].professionalFacts={identityStatus:'unresolved'};MR_state.result.candidates[0].academicResearch={identity:{status:'unresolved',rationale:'Namesake remains unresolved'},academic:{currentStatus:{value:'PhD student',basis:'source_stated',sourceIds:['profile']},expectedGraduationYear:{value:2031,basis:'source_stated',sourceIds:['profile']}},sources:[{id:'profile',url:'https://example.edu/profile',title:'Possible namesake page'}]}");
  await ui.click('mr-profile',{id:'test:author-0'});const html=ui.node('overlay-root').innerHTML;assert.match(html,/Academic status<\/span><strong>Unknown/);assert.match(html,/Unresolved identity claims are not attributed/);assert.doesNotMatch(html,/<strong>2031<\/strong>/);
});

test('legacy backend graduation estimates never become current-program start facts',async()=>{
 const ui=await app({runs:[run('completed')]});await ui.run("MR_open('mapping-1')");ui.run("MR_state.result.screening[0].professionalFacts={identityStatus:'matched',degree:'PhD',programStartYear:2021,expectedGraduationYear:2028,graduationRange:[2026,2027],graduationBasis:'assumed_degree_duration',sources:['https://example.edu/cv']}");await ui.click('mr-profile',{id:'test:author-0'});const html=ui.node('overlay-root').innerHTML;assert.doesNotMatch(html,/Planning estimate|<strong>2028<\/strong>/);assert.equal(ui.run('MR_candidateFacts(MR_state.result.candidates[0]).programStart'),'Unknown');
});

test('a source-cited ongoing degree start is displayed without copying it into accepted or forecast fields',async()=>{
 const ui=await app({runs:[run('completed')]});await ui.run("MR_open('mapping-1')");ui.run("{const c=MR_state.result.candidates[0],field=value=>({value,basis:'source_stated',sourceIds:['cv']});c.academicResearch={candidateId:c.id,identity:{status:'matched',matchedPaperIds:c.paperIds,sourceIds:['cv']},academic:{currentStatus:field('PhD student'),degree:field('PhD'),programStartYear:field(2024)},sources:[{id:'cv',url:'https://example.edu/cv',evidenceExcerpt:'PhD student since 2024.'}]}}");await ui.click('mr-profile',{id:'test:author-0'});assert.match(ui.node('overlay-root').innerHTML,/Source-stated current program start year/);assert.match(ui.node('overlay-root').innerHTML,/<strong>2024<\/strong>/);assert.equal(ui.run('MR_candidateFacts(MR_state.result.candidates[0]).programStart'),'2024');assert.equal(ui.json('MR_state.result.candidates[0].gradRange'),null);
});

test('scheduled source retry backoff is honored before unchanged-progress stopping',async()=>{
  const ui=await app({timerMode:'immediate',advance:async count=>count<3?{run:run('running'),progress:{stage:'collecting',editionsTotal:6,editionsCompleted:0},advanced:false,retryAfterMs:count===1?4000:8000}:{run:run('completed'),progress:progress({completed:3,queued:0,stage:'completed'}),result:result()}});
  await ui.click('mr-plan');await ui.click('mr-start');assert.deepEqual(ui.timerDelays,[4000,8000]);assert.equal(ui.server.advanceCount,3);assert.equal(ui.json('MR_state.run.status'),'completed');assert.equal(ui.json('MR_state.waitUntil'),null);
  const future=new Date(Date.now()+4000).toISOString(),delay=ui.run('MR_retryDelay('+JSON.stringify({progress:{nextRetryAt:future}})+')');assert.ok(delay>3500&&delay<=4000);
});

test('pause cancels a source retry delay without advancing another task',async()=>{
  const ui=await app({runs:[run('running')],timerMode:'hold',advance:async()=>({run:run('running'),progress:{stage:'collecting',editionsTotal:6,editionsCompleted:0},retryAfterMs:8000})});await ui.run("MR_open('mapping-1')");const processing=ui.run("MR_pump('mapping-1')");await tick();assert.ok(ui.json('MR_state.waitUntil'));await ui.click('mr-pause');await processing;assert.equal(ui.server.advanceCount,1);assert.equal(ui.json('MR_state.run.status'),'paused');assert.equal(ui.json('MR_state.waitUntil'),null);
});
