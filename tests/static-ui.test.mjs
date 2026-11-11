import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const scripts=await Promise.all(['runtime','app','profile-research','source-plans','mapping-run'].map(name=>readFile(new URL('../ui/'+name+'.js',import.meta.url),'utf8')));
const catalog=(await readFile(new URL('../shared/catalog.js',import.meta.url),'utf8')).replace(/^export /gm,'');
const currentProgram=(await readFile(new URL('../shared/current-program.js',import.meta.url),'utf8')).replace(/^export /gm,'');
const publisher=JSON.parse(await readFile(new URL('../data/usenix.json',import.meta.url),'utf8'));
const pilot=JSON.parse(await readFile(new URL('../data/academic-research.json',import.meta.url),'utf8'));
const seeds=JSON.parse(await readFile(new URL('../data/source-plans.json',import.meta.url),'utf8'));
const base='https://gabbyxia.github.io/Candidate-Agent/';

async function application({researchedProfiles=4}={}){
  const paper=publisher.papers.find(p=>p.id===pilot.profiles[0].identity.matchedPaperIds[0]);
  const candidate={id:pilot.profiles[0].candidateId,name:paper.authors[0].name,affiliation:paper.authors[0].affiliations.join('; '),paperIds:[paper.id],sources:[],status:'Unknown',gradYear:null,interests:[],academicResearch:pilot.profiles[0]};
  const bootstrap={papers:[paper],candidates:[candidate],coverage:{startYear:2024,endYear:2026,editions:[],retrievedAt:publisher.retrievedAt},warnings:[]};
  const nodes=new Map(),listeners=new Map(),requests=[],storage=new Map();
  // An old full browser cache must not conceal a newly published snapshot.
  storage.set('talent-atlas-v2',JSON.stringify({version:2,candidates:[{...candidate,name:'Old cached author',academicResearch:{...pilot.profiles[0],queriedAt:'2020-01-01'}}],papers:[paper],saved:[candidate.id]}));
  const node=id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:'',textContent:'',value:'',dataset:{},classList:{add(){},remove(){},toggle(){}},focus(){},click(){}});return nodes.get(id)};
  const files={'bootstrap.json':bootstrap,'profile-pilot.json':pilot,'source-plans.json':{plans:seeds}};
  const context=vm.createContext({console,Date,URL,Response,Request,AbortSignal,Blob,TextEncoder,
    TALENT_ATLAS_STATIC:{researchedProfiles,publishedAt:'2026-11-11T12:00:00Z',artifacts:[{title:'Complete workbook',filename:'research.xlsx',href:'downloads/research.xlsx',type:'XLSX',bytes:2000}]},
    document:{baseURI:base,activeElement:null,getElementById:node,querySelector(){return null},querySelectorAll(){return []},createElement(){return {click(){}}},addEventListener(type,listener){if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(listener)}},
    window:{scrollTo(){}},setTimeout(){return 1},clearTimeout(){},
    localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},
    fetch:async(path,options)=>{requests.push({path,method:options?.method||'GET',cache:options?.cache});assert.ok(path.startsWith(base+'snapshot/'),'static requests must remain under the repository snapshot path');const data=files[new URL(path).pathname.split('/').at(-1)];assert.ok(data,'unexpected snapshot file');return new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}})},
  });
  vm.runInContext(catalog+'\n'+currentProgram+'\n'+scripts.join('\n'),context,{filename:'static-ui'});
  for(let i=0;i<8;i++)await new Promise(resolve=>setImmediate(resolve));
  const run=code=>vm.runInContext(code,context);
  const click=async(action,extra={})=>{const element={dataset:{action,...extra}};for(const listener of listeners.get('click')||[])await listener({target:{closest(){return element}},preventDefault(){}})};
  return {context,requests,node,storage,run,click,candidate};
}

test('static UI loads published data under the project path and refreshes stale cached source data',async()=>{
  const ui=await application();
  assert.equal(ui.run('state.view'),'overview');
  assert.equal(ui.run('state.candidates[0].name'),ui.candidate.name);
  assert.equal(ui.run('state.candidates[0].academicResearch.queriedAt'),pilot.profiles[0].queriedAt);
  assert.equal(ui.run('state.saved[0]'),ui.candidate.id);
  const html=ui.node('app').innerHTML;
  assert.match(html,/Published research snapshot/);
  assert.doesNotMatch(html,/Start a mapping run|data-action="open-mapping-run"|data-action="open-research"/);
  assert.ok(ui.requests.some(request=>new URL(request.path).pathname==='/Candidate-Agent/snapshot/bootstrap.json'));
  for(const request of ui.requests){assert.equal(new URL(request.path).searchParams.get('v'),'2026-11-11T12:00:00Z');assert.equal(request.cache,'no-cache');}
});

test('published research, source plans, and download views contain no live launch controls',async()=>{
  const ui=await application();
  await ui.click('open-profile-research');
  const proposals=ui.run('profileResearchWorkspace()');
  assert.match(proposals,/Published findings|research proposals/);
  assert.doesNotMatch(proposals,/data-action="(?:queue-selected|resume-profile-queue)"/);
  await ui.run('sourcePlansOnData()');
  const plans=ui.run('sourcePlanWorkspace()');
  assert.match(plans,/Published source plans/);
  assert.doesNotMatch(plans,/data-action="sp-(?:validate|promote|collect|discover)"/);
  const downloads=ui.run('snapshotArtifactsPage()');
  assert.ok(downloads.includes(`href="${new URL('downloads/research.xlsx',base).href}"`));
  assert.doesNotMatch(downloads,/href="javascript:/);
});

test('static mutation attempts never reach the network',async()=>{
  const ui=await application(),before=ui.requests.length;
  for(const path of ['/api/enrich','/api/research','/api/mapping-runs','/api/source-plans/collect']){
    const response=await ui.run(`atlasFetch(${JSON.stringify(path)},{method:'POST',body:'{}'})`);
    assert.equal(response.status,405);
    assert.equal((await response.json()).status,'snapshot_only');
  }
  await ui.click('open-research');
  assert.equal(ui.requests.length,before);
});

test('published research coverage labels the full inventory without a student or approval gate',async()=>{
 const ui=await application({researchedProfiles:7});const notice=ui.run('publishedNetworkingNotice()');assert.match(notice,/7 published academic profile-research results/);assert.match(notice,/1 collected author records/);assert.match(notice,/All authors are shown by default/);assert.match(notice,/including unresearched records and unknown academic status/);const dashboard=ui.run('dashboard()');assert.match(dashboard,/All authors <span class="number-pill">1<\/span>/);assert.doesNotMatch(dashboard,/Student leads|Reviewed starts|audit\/review/);assert.equal(ui.run('state.tab'),'all');assert.equal(ui.run('matchList().length'),ui.run('state.candidates.length'));
});
