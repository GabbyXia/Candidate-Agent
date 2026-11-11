import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { handleApi } from '../worker/api.mjs';

const programCode=(await readFile(new URL('../shared/current-program.js',import.meta.url),'utf8')).replace(/^export /gm,'');
const source = (await readFile(new URL('../ui/runtime.js', import.meta.url), 'utf8')) + '\n' + await readFile(new URL('../ui/app.js', import.meta.url), 'utf8');
const catalog = (await readFile(new URL('../shared/catalog.js', import.meta.url), 'utf8')).replaceAll('export const ', 'const ');

const usenix = JSON.parse(await readFile(new URL('../data/usenix.json', import.meta.url), 'utf8'));
const academicPilot=JSON.parse(await readFile(new URL('../data/academic-research.json',import.meta.url),'utf8'));
const sourcePapers = usenix.papers.slice(0, 3);
const sourceAuthors = [sourcePapers[0].authors[0], sourcePapers[0].authors[1], sourcePapers[1].authors[0]];
function fixture() {
  const papers = structuredClone(sourcePapers);
  const candidates = sourceAuthors.map((author,i)=>({
    id:'test:source-author-'+i,name:author.name,affiliation:author.affiliations.join('; '),
    affiliationLabel:'Publication-time affiliation',status:'Unknown',interests:i===0?['distributed applications']:i===1?['fpga']:['neural networks'],
    gradYear:null,gradRange:null,startYear:null,degree:null,fit:[100,50,75][i],fitReason:'Test harness score only; not a production assessment',
    paperIds:[papers[i===2?1:0].id],sources:[{label:'Official publisher citation metadata',url:author.sourceUrl}],profileUrl:author.sourceUrl,isSample:false,
  }));
  return {papers,candidates,coverage:{startYear:2024,endYear:2026,partial:false,completenessLabel:'Official source metadata test subset',editions:[]},warnings:[]};
}
function academicFixture(){
 const research=structuredClone(academicPilot.profiles[0]);const paper=structuredClone(usenix.papers.find(p=>p.id===research.identity.matchedPaperIds[0]));
 const candidate={...fixture().candidates[0],id:research.candidateId,name:'Yusheng Zheng',affiliation:'UC Santa Cruz',paperIds:[paper.id],academicResearch:research};
 return {papers:[paper],candidates:[candidate],coverage:{startYear:2024,endYear:2026,editions:[]},warnings:[]};
}

// Tests exercise application state and real event handlers with a minimal DOM
// boundary. They do not claim browser-layout or native file-picker verification.
function memoryIndexedDB({initial,failWrites=false}={}){
  const records=new Map(initial?[['current',structuredClone(initial)]]:[]);
  let created=Boolean(initial);
  const db={objectStoreNames:{contains(){return created}},createObjectStore(){created=true},close(){},transaction(){
    const transaction={error:null,objectStore(){return {
      get(key){const request={};setImmediate(()=>{request.result=records.has(key)?structuredClone(records.get(key)):undefined;request.onsuccess?.()});return request},
      put(value,key){setImmediate(()=>{if(failWrites){transaction.error=new Error('Test cache write failed');transaction.onerror?.()}else{records.set(key,structuredClone(value));transaction.oncomplete?.()}})},
    }}};return transaction;
  }};
  return {records,open(){const request={};setImmediate(()=>{request.result=db;if(!created)request.onupgradeneeded?.();request.onsuccess?.()});return request}};
}

async function app({year=2026,saved,legacy,bootstrap=fixture(year),fetchFailure=false,indexedDB}={}) {
  const nodes=new Map(),selections=new Map(),listeners=new Map(),downloads=[],fetches=[];
  const storage=new Map(saved?[['talent-atlas-v2',saved]]:[]);
  if(legacy)storage.set('talent-atlas-v1',legacy);
  function node(id){if(!nodes.has(id))nodes.set(id,{innerHTML:'',textContent:'',value:'',dataset:{},classList:{add(){},remove(){},toggle(){}},focus(){},click(){},reportValidity(){return true}});return nodes.get(id)}
  class FixedDate extends Date {constructor(...args){super(...(args.length?args:[`${year}-11-10T12:00:00-08:00`]))}static now(){return new Date(`${year}-11-10T12:00:00-08:00`).getTime()}}
  class TestURL extends URL {static createObjectURL(blob){downloads.push(blob);return 'blob:test-download'}static revokeObjectURL(){}}
  class FormValues {constructor(form){this.values=form.values}get(name){return this.values[name]??''}getAll(name){const value=this.values[name];return Array.isArray(value)?value:value?[value]:[]}}
  const document={activeElement:null,getElementById:node,querySelector(){return null},querySelectorAll(selector){return selections.get(selector)||[]},addEventListener(type,handler){listeners.set(type,handler)},createElement(){return {click(){},href:'',download:''}}};
  const context=vm.createContext({document,window:{scrollTo(){}},Date:FixedDate,URL:TestURL,Blob,FormData:FormValues,console,AbortSignal,...(indexedDB?{indexedDB}:{}),
    setTimeout(){return 1},clearTimeout(){},
    fetch:async(path)=>{fetches.push(path);if(path==='/network-research.json')return {ok:false,json:async()=>({})};if(fetchFailure)throw new Error('Fixture source unavailable');return {ok:true,json:async()=>structuredClone(bootstrap)}},
    localStorage:{getItem(key){return storage.get(key)??null},setItem(key,value){storage.set(key,value)},removeItem(key){storage.delete(key)}},
  });
  vm.runInContext(programCode+'\n'+catalog+'\n'+source,context,{filename:'ui/app.js'});
  for(let i=0;i<5;i++)await new Promise(resolve=>setImmediate(resolve));
  const run=code=>vm.runInContext(code,context),json=code=>JSON.parse(run(`JSON.stringify(${code})`));
  const click=(action,extra={})=>{const target={dataset:{action,...extra}};listeners.get('click')({target:{closest(){return target}},preventDefault(){}})};
  return {run,json,node,storage,downloads,click,listeners,selections,fetches};
}

test('initial workspace loads source-backed papers and keeps academic status unknown',async()=>{
  const ui=await app();
  assert.deepEqual(ui.fetches,['/api/bootstrap','/network-research.json']);
  assert.match(ui.node('app').innerHTML,/Official proceedings/);
  assert.doesNotMatch(ui.node('app').innerHTML,/Sample workspace|synthetic people/);
  assert.equal(ui.json('state.candidates.length'),3);
  assert.ok(ui.json('state.candidates.every(c=>!c.isSample&&c.gradYear===null&&c.status==="Unknown")'));
  assert.equal(ui.json('state.papers.length'),3);
  assert.equal(ui.json('state.loading'),false);
  assert.equal(ui.json('state.tab'),'all');assert.equal(ui.json('matchList().length'),3);assert.ok(ui.node('results').innerHTML.includes(sourceAuthors[0].name));
});

test('full production bootstrap hydrates every paper and thousands of author records into the UI',async()=>{
  const networking=JSON.parse(await readFile(new URL('../data/networking.json',import.meta.url),'utf8'));
  const snapshot={papers:[...usenix.papers,...networking.papers],editions:[...usenix.coverage,...networking.coverage],warnings:[...usenix.warnings,...networking.warnings],retrievedAt:usenix.retrievedAt};
  const data=await (await handleApi(new Request('https://app.test/api/bootstrap'),{SOURCE_SNAPSHOT:snapshot,ACADEMIC_RESEARCH_SNAPSHOT:academicPilot})).json();
  const indexedDB=memoryIndexedDB();const ui=await app({bootstrap:data,indexedDB});
  assert.equal(ui.json('state.papers.length'),snapshot.papers.length);
  assert.equal(ui.json('state.candidates.length'),data.candidates.length);
  assert.ok(ui.json('state.candidates.length')>6000);
  assert.equal(ui.json('state.candidates.length'),6847);assert.equal(ui.json('matchList().length'),6847);assert.equal(ui.json('state.candidates.filter(c=>appDisplayProgram(c).category==="source_stated").length'),2);assert.equal(ui.json('state.candidates.filter(c=>appCurrentProgram(c).category==="source_stated").length'),0);assert.match(ui.node('pipeline').innerHTML,/2024/);assert.match(ui.run('dashboard()'),/Current program starts|Cited program start years/);assert.doesNotMatch(ui.run('dashboard()'),/Student leads|Reviewed starts|audit\/review/);
  assert.ok(ui.json('state.candidates.every(c=>c.papers.length===c.paperIds.length)'));
  assert.ok(ui.json('state.candidates.every(c=>c.status==="Unknown"&&c.gradYear===null)'));
  assert.match(ui.node('landscape').innerHTML,/Author records in the current view aggregated/);
  assert.ok(ui.storage.get('talent-atlas-v2').length<5000);
  ui.click('nav',{view:'papers'});
  assert.match(ui.node('app').innerHTML,/1200/);
});

test('calendar windows use current year and cohort target advances',async()=>{
  const ui=await app({year:2029,fetchFailure:true});
  assert.deepEqual(ui.json('[YEAR,TARGET,state.startYear,state.endYear]'),[2029,2030,2027,2029]);
  assert.equal(ui.json('state.papers.length'),0);
});

test('legacy synthetic workspace is removed rather than restored as source data',async()=>{
  const ui=await app({legacy:JSON.stringify({version:1,candidates:[{id:'sample-0',name:'Legacy sample',isSample:true}]})});
  assert.equal(ui.storage.has('talent-atlas-v1'),false);
  assert.ok(ui.json('state.candidates.every(c=>!c.id.startsWith("sample-"))'));
  assert.equal(ui.json('state.candidates.length'),3);
});

test('source failure leaves an honest empty workspace without replacement profiles',async()=>{
  const ui=await app({fetchFailure:true});
  assert.equal(ui.json('state.candidates.length'),0);
  assert.equal(ui.json('state.loading'),false);
  assert.match(ui.node('toast').textContent,/source unavailable/);
});

test('normalized persistence stores each paper once and restores candidate references',async()=>{
  const ui=await app();ui.run('persist()');
  const saved=JSON.parse(ui.storage.get('talent-atlas-v2'));
  assert.equal(saved.version,2);assert.equal(saved.papers.length,3);
  assert.ok(saved.candidates.every(c=>Array.isArray(c.paperIds)&&!Object.hasOwn(c,'papers')));
  const restored=await app({saved:JSON.stringify(saved)});
  assert.deepEqual(restored.fetches,['/network-research.json']);
  assert.equal(restored.json('state.candidates[0].papers.length'),1);
  assert.equal(restored.run('state.candidates[0].papers[0]===state.candidates[1].papers[0]'),true);
});

test('IndexedDB stores full metadata while localStorage keeps small preferences',async()=>{
  const indexedDB=memoryIndexedDB(),ui=await app({indexedDB});await ui.run('persistenceQueue');
  const preferences=JSON.parse(ui.storage.get('talent-atlas-v2'));
  assert.equal(preferences.dataInIndexedDB,true);assert.equal(Object.hasOwn(preferences,'papers'),false);assert.equal(Object.hasOwn(preferences,'candidates'),false);
  const cached=indexedDB.records.get('current');assert.equal(cached.papers.length,3);assert.ok(cached.candidates.every(c=>Array.isArray(c.paperIds)&&!Object.hasOwn(c,'papers')));
  const restored=await app({saved:JSON.stringify(preferences),indexedDB,fetchFailure:true});
  assert.deepEqual(restored.fetches,['/network-research.json']);assert.equal(restored.json('state.papers.length'),3);assert.equal(restored.json('state.candidates[0].name'),sourceAuthors[0].name);
});

test('latest evidence survives source refresh and IndexedDB reload without stale overrides',async()=>{
  const indexedDB=memoryIndexedDB(),ui=await app({indexedDB}),form=ui.node('evidence-form');form.dataset.id='test:source-author-0';
  form.values={affiliation:sourceAuthors[0].affiliations.join('; '),status:'PhD student',degree:'PhD',startYear:'2024',programStatement:'PhD student since 2024.',identityConfirmed:'on',sourceUrl:'https://example.edu/cv'};
  ui.run('saveEvidence()');form.values={...form.values,startYear:'2025',programStatement:'PhD student since 2025.'};ui.run('saveEvidence()');
  ui.run(`applyCollection(${JSON.stringify(fixture())})`);await ui.run('persistenceQueue');
  assert.equal(ui.json('state.candidates[0].startYear'),2025);
  const preferences=JSON.parse(ui.storage.get('talent-atlas-v2'));assert.equal(preferences.overrides[0].startYear,2025);
  const restored=await app({saved:JSON.stringify(preferences),indexedDB,fetchFailure:true});
  assert.equal(restored.json('state.candidates[0].startYear'),2025);assert.equal(restored.json('state.candidates[0].evidence.sourceUrl'),'https://example.edu/cv');
});

test('cache write failure preserves recruiter evidence in small local preferences',async()=>{
  const indexedDB=memoryIndexedDB({failWrites:true}),ui=await app({indexedDB}),form=ui.node('evidence-form');form.dataset.id='test:source-author-0';
  form.values={affiliation:sourceAuthors[0].affiliations.join('; '),status:'PhD student',degree:'PhD',startYear:'2024',programStatement:'PhD student since 2024.',identityConfirmed:'on',sourceUrl:'https://example.edu/cv'};
  ui.run('saveEvidence()');await ui.run('persistenceQueue');
  const preferences=JSON.parse(ui.storage.get('talent-atlas-v2'));assert.equal(preferences.overrides[0].startYear,2024);
  const restored=await app({saved:JSON.stringify(preferences),indexedDB});assert.deepEqual(restored.fetches,['/api/bootstrap','/network-research.json']);assert.equal(restored.json('state.candidates[0].startYear'),2024);
});

test('current-program cohort never uses legacy graduation ranges or publication dates',async()=>{
 const ui=await app();assert.equal(ui.run('target({gradYear:2027,gradRange:[2026,2027]})'),false);assert.equal(ui.run('rangeText({gradYear:2027,startYear:2022,degree:"PhD"})'),'Unknown');ui.run("state.programStart='cited'");assert.equal(ui.json('matchList().length'),0);assert.doesNotMatch(ui.run('dashboard()'),/Estimated graduation|EST. GRADUATION/);
});

test('search combines affiliation, expertise, status, conference and alignment filters',async()=>{
  const ui=await app();ui.click('tab',{tab:'all'});
  ui.run("state.query='university of chicago'");assert.deepEqual(ui.json('matchList().map(c=>c.name)'),[sourceAuthors[2].name]);
  ui.run("state.query='';state.conf='OSDI';state.status='Unknown';state.minFit=85");assert.deepEqual(ui.json('matchList().map(c=>c.name)'),[sourceAuthors[0].name]);
  ui.run("resetFilters(false);state.tab='all';state.programStart='unknown'");assert.equal(ui.json('matchList().length'),3);
});

test('sort actions reverse direction and alignment metric applies its threshold',async()=>{
  const ui=await app();ui.click('tab',{tab:'all'});ui.click('sort',{sort:'name'});const ascending=ui.json('matchList().map(c=>c.name)');
  ui.click('sort',{sort:'name'});assert.deepEqual(ui.json('matchList().map(c=>c.name)'),[...ascending].reverse());
  ui.click('metric',{metric:'fit'});assert.equal(ui.json('state.minFit'),85);assert.deepEqual(ui.json('matchList().map(c=>c.id)'),['test:source-author-0']);
});

test('shortlist actions survive reload with normalized paper storage',async()=>{
  const ui=await app();ui.click('bookmark',{id:'test:source-author-1'});ui.click('nav',{view:'shortlist'});
  assert.deepEqual(ui.json('matchList().map(c=>c.id)'),['test:source-author-1']);
  const restored=await app({saved:ui.storage.get('talent-atlas-v2')});
  assert.equal(restored.json('state.saved.includes("test:source-author-1")'),true);
});

test('refresh preserves recruiter evidence for matching candidate identities',async()=>{
  const ui=await app();
  ui.run("state.candidates[0].evidence={sourceUrl:'https://example.edu/profile',addedAt:'2026-11-10'};state.candidates[0].status='PhD student';state.candidates[0].gradYear=2027;state.candidates[0].gradRange=[2027,2028]");
  const data=JSON.stringify(fixture());ui.run(`applyCollection(${data})`);
  assert.equal(ui.json('state.candidates[0].status'),'PhD student');assert.deepEqual(ui.json('state.candidates[0].gradRange'),[2027,2028]);
});

test('source coverage presents listing counters and unavailable details explicitly',async()=>{
  const ui=await app();ui.run("state.coverage={completenessLabel:'Official proceedings',editions:[{conference:'SIGCOMM',year:2025,status:'partial',listingPapers:88,detailVerified:80,detailUnavailable:8,partial:true,completeness:'Listing complete; detail coverage partial',sourceUrl:'https://conferences.sigcomm.org/sigcomm/2025/accepted-papers/'}],warnings:[]};coverageModal()");
  const html=ui.node('overlay-root').innerHTML;assert.match(html,/88 listed papers/);assert.match(html,/80 citation records/);assert.match(html,/8 details unavailable/);assert.match(html,/partial/);
});

test('manual current enrollment requires a cited quoted start and never computes graduation',async()=>{
 const ui=await app(),form=ui.node('evidence-form');form.dataset.id='test:source-author-0';form.values={affiliation:'Fixture University',status:'PhD student',degree:'PhD',startYear:'2022',programStatement:'PhD student since 2022.',identityConfirmed:'on',sourceUrl:'https://example.edu/cv'};ui.run('saveEvidence()');assert.equal(ui.run('appCurrentProgram(state.candidates[0]).programStartYear'),2022);assert.equal(ui.json('state.candidates[0].gradRange'),null);const before=ui.json('state.candidates[0]');form.values={...form.values,startYear:'2017',programStatement:'Bachelor 2017–2021; PhD 2024–present.'};ui.run('saveEvidence()');assert.deepEqual(ui.json('state.candidates[0]'),before);
});

test('manual current-year edits preserve old graduation data without displaying it',async()=>{
 const ui=await app(),form=ui.node('evidence-form');form.dataset.id='test:source-author-0';ui.run('state.candidates[0].gradYear=2030;state.candidates[0].gradRange=[2030,2031]');form.values={affiliation:'Fixture University',status:'PhD student',degree:'PhD',startYear:'2024',programStatement:'PhD student since 2024.',identityConfirmed:'on',sourceUrl:'https://example.edu/cv'};ui.run('saveEvidence()');assert.equal(ui.json('state.candidates[0].gradYear'),2030);assert.equal(ui.run('rangeText(state.candidates[0])'),'2024');assert.doesNotMatch(ui.node('overlay-root').innerHTML,/Estimated graduation|2030|2031/);
});

test('finite catalog covers CS domains with valid many-to-many venue mappings',async()=>{
  const ui=await app(),domains=ui.json('DOMAINS'),conferences=ui.json('CONFERENCES'),ids=new Set(domains.map(d=>d.id));
  assert.equal(domains.length,18);assert.ok(conferences.length>=40);
  assert.equal(new Set(conferences.map(c=>c.id)).size,conferences.length);
  for(const c of conferences){assert.ok(c.domains.length);assert.ok(c.domains.every(id=>ids.has(id)));assert.equal(new URL(c.url).protocol,'https:');assert.ok(['ready','planned'].includes(c.connectorStatus))}
  assert.ok(conferences.find(c=>c.id==='nsdi').domains.includes('networking'));
  assert.ok(conferences.find(c=>c.id==='asplos').domains.length>=3);
});

test('domain conference controls enable only implemented source adapters',async()=>{
  const ui=await app(),conferences=ui.json('CONFERENCES');
  const html=ui.run("scopeOptions('networking',['sigcomm','nsdi','conext','imc'])");
  const inputs=[...html.matchAll(/<input[^>]*value="([^"]+)"[^>]*>/g)];
  assert.ok(inputs.length>=4);
  for(const [tag,id]of inputs){const conference=conferences.find(c=>c.id===id);assert.ok(conference.domains.includes('networking'));assert.equal(tag.includes('disabled'),conference.connectorStatus!=='ready')}
  const ml=ui.run("scopeOptions('ml',[])");assert.ok([...ml.matchAll(/<input[^>]*>/g)].every(([tag])=>tag.includes('disabled')));
});

test('paper library retains the full real snapshot independently of candidate count',async()=>{
  const ui=await app();
  ui.run(`applyCollection(${JSON.stringify({...fixture(),papers:usenix.papers})})`);
  assert.ok(usenix.papers.length>100);
  assert.equal(ui.json('state.papers.length'),usenix.papers.length);
  assert.equal(ui.json('uniquePapers()'),usenix.papers.length);
  assert.equal(ui.json('paperMatches().length'),usenix.papers.length);
  assert.equal(ui.json('state.candidates.length'),3);
  assert.match(ui.run('papersPage()'),new RegExp('of '+usenix.papers.length+' papers'));
});

test('paper pagination clamps a stale page after the collection shrinks',async()=>{
  const ui=await app();ui.run('state.paperPage=99');
  const html=ui.run('papersPage()');assert.equal(ui.json('state.paperPage'),1);assert.match(html,/1–3 of 3 papers/);
});

test('paper search and detail preserve complete publisher author evidence',async()=>{
  const ui=await app();ui.run(`state.paperQuery=${JSON.stringify(sourcePapers[2].authors[0].name)}`);
  assert.deepEqual(ui.json('paperMatches().map(p=>p.id)'),[sourcePapers[2].id]);
  ui.run(`paperModal(${JSON.stringify(sourcePapers[0].id)})`);const html=ui.node('overlay-root').innerHTML;
  for(const author of sourcePapers[0].authors)assert.ok(html.includes(author.name));
  assert.ok(html.includes(sourcePapers[0].pdfUrl));assert.match(html,/publication-time affiliations/);
});

test('source JSON export retains author affiliations and source provenance',async()=>{
  const ui=await app();ui.run('exportSource()');
  const exported=JSON.parse(await ui.downloads[0].text());
  assert.deepEqual(exported.papers[0].authors,sourcePapers[0].authors);
  assert.equal(exported.papers[0].url,sourcePapers[0].url);
  assert.equal(exported.papers[0].rawByline,sourcePapers[0].rawByline);
  assert.ok(exported.coverage);
});

test('paper CSV export preserves leading formula text while preventing execution',async()=>{
  const ui=await app();ui.run(`state.papers[0].title='=HYPERLINK("https://example.test")';exportPapers()`);
  const csv=await ui.downloads[0].text();
  assert.match(csv,/"'=HYPERLINK\(""https:\/\/example\.test""\)"/);
  assert.ok(csv.includes(sourcePapers[0].url));
});

test('CSV export honors selected authors and neutralizes formula-like cells',async()=>{
  const ui=await app();ui.run(`state.candidates[0].name='=HYPERLINK("https://example.test")';state.candidates[0].affiliation='+SUM(1,2)';state.selected.add('test:source-author-0');exportCSV(true)`);
  assert.equal(ui.downloads.length,1);const csv=await ui.downloads[0].text();
  assert.match(csv,/"'=HYPERLINK\(""https:\/\/example\.test""\)"/);assert.match(csv,/"'\+SUM\(1,2\)"/);assert.match(csv,/Official proceedings/);assert.equal(csv.split('\r\n').length,2);
});

test('profile text escapes markup and source links reject executable protocols',async()=>{
  const ui=await app();assert.equal(ui.run("url('javascript:alert(1)')"),'#');assert.equal(ui.run("esc('<script>')"),'&lt;script&gt;');
  ui.run("state.candidates[0].name='<script>alert(1)</script>';profile('test:source-author-0')");assert.doesNotMatch(ui.node('overlay-root').innerHTML,/<script>alert/);
});

test('academic proposals do not affect filters until cited fields are reviewed',async()=>{
 const ui=await app({bootstrap:academicFixture()});
 assert.equal(ui.run('target(state.candidates[0])'),false);assert.equal(ui.json('state.candidates[0].status'),'Unknown');
 const result=ui.json("applyReviewedAcademicFields(state.candidates[0].id,['currentAffiliation','currentStatus','degree','programStartYear','researchInterests'])");assert.equal(result.ok,true);
 assert.equal(ui.json('state.candidates[0].affiliation'),'UC Santa Cruz');
 assert.equal(ui.run('displayAffiliation(state.candidates[0])'),'University of California, Santa Cruz');
 assert.equal(ui.json('state.candidates[0].status'),'PhD student');assert.equal(ui.run('target(state.candidates[0])'),true);assert.equal(ui.json('state.candidates[0].startYear'),2024);
 assert.ok(ui.json('state.candidates[0].academicProfile.sources.every(s=>s.id===s.url)'));
 assert.equal(ui.json('state.candidates[0].fit'),100);
});

test('reviewed academic findings preserve manual evidence and survive source refresh',async()=>{
 const data=academicFixture(),ui=await app({bootstrap:data});
 ui.run("state.candidates[0].evidence={sourceUrl:'https://example.edu/manual',addedAt:'2026-11-10'};state.candidates[0].affiliation='Recruiter-entered institution';state.candidates[0].gradYear=2030;state.candidates[0].gradRange=[2030,2030]");
 const result=ui.json("applyReviewedAcademicFields(state.candidates[0].id,['currentAffiliation','programStartYear'])");assert.equal(result.ok,true);assert.equal(result.manualPreserved,true);
 assert.equal(ui.run('displayAffiliation(state.candidates[0])'),'Recruiter-entered institution');assert.equal(ui.json('state.candidates[0].gradYear'),2030);
 ui.run('applyCollection('+JSON.stringify(data)+')');assert.equal(ui.json('state.candidates[0].academicProfile.fields.programStartYear.value'),2024);assert.equal(ui.json('state.candidates[0].gradYear'),2030);
});

test('ambiguous identity, unsupported fields, and missing citations cannot enter academic filters',async()=>{
 const ui=await app({bootstrap:academicFixture()});
 ui.run("state.candidates[0].academicResearch.identity.status='ambiguous'");assert.equal(ui.json("applyReviewedAcademicFields(state.candidates[0].id,['expectedGraduationYear'])").ok,false);
 ui.run("state.candidates[0].academicResearch.identity.status='matched'");assert.equal(ui.json("applyReviewedAcademicFields(state.candidates[0].id,['nationality'])").ok,false);
 ui.run('state.candidates[0].academicResearch.academic.programStartYear.sourceIds=[]');assert.equal(ui.json("applyReviewedAcademicFields(state.candidates[0].id,['currentStatus','programStartYear'])").ok,false);
 assert.equal(ui.run('Boolean(state.candidates[0].academicProfile)'),false);assert.equal(ui.json('state.candidates[0].status'),'Unknown');assert.equal(ui.json('state.candidates[0].gradYear'),null);
});

test('active table and cited-year filter show unreviewed current-program evidence without accepting it',async()=>{
 const ui=await app({bootstrap:academicFixture()});assert.match(ui.run('table(state.candidates)'),/CURRENT PROGRAM START/);assert.doesNotMatch(ui.run('table(state.candidates)'),/EST. GRADUATION|NEXT YEAR/);assert.equal(ui.run('appProgramText(state.candidates[0])'),'2024 · unreviewed');assert.equal(ui.run('appCurrentProgram(state.candidates[0]).programStartYear'),null);ui.run("state.programStart='cited'");assert.equal(ui.json('matchList().length'),1);assert.equal(ui.json('state.candidates[0].startYear'),null);assert.equal(ui.json('state.candidates[0].gradYear'),null);
});

test('faculty, unknown and unresearched authors remain visible in the initial all-author view',async()=>{
 const data=fixture();data.candidates[0].status='Faculty';data.candidates[1].status='Unknown';data.candidates[2].status='Researcher';const ui=await app({bootstrap:data});assert.equal(ui.json('state.tab'),'all');assert.equal(ui.json('state.programStart'),'all');assert.equal(ui.json('state.status'),'all');assert.equal(ui.json('matchList().length'),3);ui.click('tab',{tab:'saved'});ui.click('reset-filters');assert.equal(ui.json('state.tab'),'all');assert.equal(ui.json('matchList().length'),3);
});

test('program-start metric and chart clicks use cited display dates without accepting proposal facts',async()=>{
 const data=academicFixture(),ui=await app({bootstrap:data});assert.equal(ui.run('appDisplayProgram(state.candidates[0]).programStartYear'),2024);assert.equal(ui.run('appCurrentProgram(state.candidates[0]).programStartYear'),null);assert.match(ui.node('pipeline').innerHTML,/2024/);ui.click('metric',{metric:'programStart'});assert.equal(ui.json('state.tab'),'all');assert.equal(ui.json('state.programStart'),'cited');assert.equal(ui.json('matchList().length'),1);ui.click('year',{year:'2024'});assert.equal(ui.json('state.tab'),'all');assert.equal(ui.json('state.programStart'),'2024');assert.equal(ui.json('matchList().length'),1);assert.equal(ui.json('state.candidates[0].status'),'Unknown');assert.equal(ui.json('state.candidates[0].startYear'),null);assert.equal(ui.run('Boolean(state.candidates[0].academicProfile)'),false);
});
