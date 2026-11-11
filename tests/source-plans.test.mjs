import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {makeSourcePlanService} from '../worker/source-plans.mjs';
import {sourcePlanDigest} from '../worker/source-discovery.mjs';
const migration=fs.readFileSync(new URL('../drizzle/0000_bent_madelyne_pryor.sql',import.meta.url),'utf8');
const data=JSON.parse(fs.readFileSync(new URL('../data/usenix.json',import.meta.url),'utf8'));
const originals=data.papers.filter(p=>p.conferenceId==='osdi'&&p.year===2025);
const basilisk=originals.find(p=>p.id==='usenix:osdi:2025:zhang-tony');
const sourceDate='2026-11-01T00:00:00.000Z';
function d1(provisioned=true){
  const sqlite=new DatabaseSync(':memory:');if(provisioned)sqlite.exec(migration);const calls=[];
  return {sqlite,calls,prepare(sql){calls.push(sql);return {bind(...params){
    const statement=sqlite.prepare(sql);
    return {async first(){return statement.get(...params)||null},async all(){return {results:statement.all(...params)}},async run(){const result=statement.run(...params);return {meta:{changes:Number(result.changes)}}}};
  }}}};
}
function r2(){const values=new Map();return {values,reads:0,async put(key,value){values.set(key,value)},async get(key){this.reads++;const value=values.get(key);return value==null?null:{async text(){return value},async json(){return JSON.parse(value)}}}}}
function plan(fields={}){return {schemaVersion:1,conferenceId:'osdi',year:2025,track:'main',adapter:'usenix-v1',entryUrl:'https://www.usenix.org/conference/osdi25/technical-sessions',authorityUrl:'https://www.usenix.org/conference/osdi25/technical-sessions',extraction:null,pagination:{mode:'single_page',maxPages:1},scopeEvidence:{conference:'OSDI',year:'2025',accepted:'Technical Sessions'},...fields}}
function seed(p=plan()){return {id:'seed:'+p.conferenceId+':'+p.year,version:1,plan:p,validation:{ok:true,checkedAt:sourceDate,parsedPapers:20,expectedPapers:20,collectionComplete:true}}}
function escape(value){return String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;')}
const basiliskAuthors='Tony Nuda Zhang and Keshav Singh, <em>University of Michigan;</em> Tej Chajed, <em>University of Wisconsin-Madison;</em> Manos Kapritsos, <em>University of Michigan;</em> Bryan Parno, <em>Carnegie Mellon University</em><br><strong><em>Awarded Best Paper!</em></strong>';
function html(records=originals.slice(0,20),{year=2025,count=records.length,session='Distributed Systems',authorHtml}={}){return '<html><title>OSDI '+year+' Technical Sessions</title><h1>OSDI '+year+' Technical Sessions</h1>'+(count==null?'':'<p>The following '+count+' papers have been accepted.</p>')+'<article class="node node-session"><h2>'+session+'</h2>'+records.map(p=>'<article class="node node-paper"><h2><a href="'+new URL(p.url).pathname+'">'+escape(p.title)+'</a></h2><div class="field-name-field-paper-people-text">'+(authorHtml??(p.id===basilisk.id?basiliskAuthors:p.authors.map(a=>escape(a.name)+', <em>'+escape(a.affiliations.join('; '))+'</em>').join('; ')))+'</div></article>').join('')+'</article></html>'}
function fixture({seeds=[seed()],snapshot,document=html(),provisioned=true}={}){const DB=d1(provisioned),BUCKET=r2();let content=document,time='2026-11-10T00:00:00Z',calls=0;const env={DB,BUCKET,SOURCE_PLAN_SEEDS:seeds,...(snapshot?{SOURCE_SNAPSHOT:snapshot}:{})};const fetcher=async()=>{calls++;if(content instanceof Error)throw content;return content instanceof Response?content.clone():new Response(content,{headers:{'content-type':'text/html'}})};const service=makeSourcePlanService(env,{fetcher,now:()=>new Date(time)});return {DB,BUCKET,env,service,get calls(){return calls},set content(value){content=value},set time(value){time=value}}}
async function proposed(f,change={scopeEvidence:{conference:'OSDI',year:'2025',accepted:'accepted'}}){const result=await f.service.propose(plan(change),{createdBy:'owner'});assert.equal(result.ok,true,JSON.stringify(result));return result.plan}

test('uses the actual Drizzle schema and lists seed checks without per-plan SQL or seed mutation',async()=>{
  const f=fixture();const p=await proposed(f);assert.equal(p.version,2);const before=f.DB.calls.length;const first=await f.service.list();assert.equal(f.DB.calls.length-before,4);const second=await f.service.list();assert.equal(first.plans.length,2);assert.equal(second.plans.length,2);assert.equal(first.plans[0].latestValidation.verdict,'pass');assert.equal(first.plans[0].latestValidation.coverage,'complete');assert.equal(f.BUCKET.reads,0);assert.ok(f.DB.calls.every(sql=>!/\bCREATE\b|\bALTER\b|\bDROP\b/i.test(sql)));
});

test('appends immutable versions and checks, then promotes only a matching passing check',async()=>{
  const f=fixture();const p=await proposed(f);assert.equal(p.planDigest,await sourcePlanDigest(p.plan));const validation=await f.service.validate(p.id);assert.equal(validation.ok,true);assert.equal(validation.check.verdict,'pass');assert.equal(validation.check.coverage,'complete');assert.equal(validation.check.planDigest,p.planDigest);assert.equal(validation.check.contentDigest.length,64);assert.equal(validation.report.coverage.listingPapers,20);
  const promoted=await f.service.promote(p.id,validation.check.id,'seed:osdi:2025');assert.equal(promoted.ok,true);assert.equal((await f.service.get('osdi:2025:main')).plan.id,p.id);assert.equal(f.DB.sqlite.prepare('SELECT COUNT(*) AS n FROM source_plan_versions').get().n,1);assert.equal(f.DB.sqlite.prepare('SELECT COUNT(*) AS n FROM source_plan_checks').get().n,1);
});

test('optimistic promotion allows only one winner from the same observed active plan',async()=>{
  const f=fixture();const a=await proposed(f),b=await proposed(f,{scopeEvidence:{conference:'OSDI 2025',year:'2025',accepted:'accepted'}});const ca=await f.service.validate(a.id),cb=await f.service.validate(b.id);assert.equal(ca.ok,true);assert.equal(cb.ok,true);
  const outcomes=await Promise.all([f.service.promote(a.id,ca.check.id,'seed:osdi:2025'),f.service.promote(b.id,cb.check.id,'seed:osdi:2025')]);assert.equal(outcomes.filter(v=>v.ok).length,1);assert.equal(outcomes.filter(v=>v.status==='conflict').length,1);
});

test('a stale or altered plan/content digest cannot be promoted',async()=>{
  let f=fixture(),p=await proposed(f),check=await f.service.validate(p.id);f.time='2026-11-12T00:00:01Z';assert.equal((await f.service.promote(p.id,check.check.id,'seed:osdi:2025')).status,'validation_required');
  f=fixture();p=await proposed(f);check=await f.service.validate(p.id);f.DB.sqlite.prepare('UPDATE source_plan_checks SET content_digest = ? WHERE id = ?').run('wrong',check.check.id);assert.equal((await f.service.promote(p.id,check.check.id,'seed:osdi:2025')).status,'validation_required');
  f=fixture();p=await proposed(f);f.DB.sqlite.prepare('UPDATE source_plan_versions SET plan_json = ? WHERE id = ?').run(JSON.stringify(plan()),p.id);const invalid=await f.service.validate(p.id);assert.equal(invalid.ok,false);assert.ok(invalid.report.failures.some(v=>v.includes('immutable digest')));
});

test('an earlier passing check cannot override a newer failed semantic check',async()=>{
  const f=fixture(),p=await proposed(f),first=await f.service.validate(p.id);f.time='2026-11-10T00:01:00Z';f.content=html(undefined,{year:2024});const latest=await f.service.validate(p.id);assert.equal(latest.ok,false);assert.equal(latest.check.verdict,'quarantine');const result=await f.service.promote(p.id,first.check.id,'seed:osdi:2025');assert.equal(result.status,'validation_required');assert.match(result.error,/latest/);
});

test('content changes alone do not quarantine an otherwise equivalent full listing',async()=>{
  const f=fixture(),p=await proposed(f),first=await f.service.validate(p.id);f.content=html()+'<p>Official program metadata updated.</p>';const next=await f.service.validate(p.id);assert.equal(next.ok,true);assert.notEqual(next.check.contentDigest,first.check.contentDigest);assert.equal(next.check.planDigest,first.check.planDigest);
});

test('count mismatches and missing publisher counts are explicit partial or unknown coverage',async()=>{
  const f=fixture(),p=await proposed(f,{scopeEvidence:{conference:'OSDI 2025',year:'2025',accepted:'Technical Sessions'}});f.content=html(undefined,{count:21});let result=await f.service.validate(p.id);assert.equal(result.ok,true);assert.equal(result.check.coverage,'partial');assert.equal(result.report.coverage.collectionComplete,false);assert.equal(result.check.publishedCount,21);
  f.content=html(undefined,{count:null});result=await f.service.validate(p.id);assert.equal(result.ok,true);assert.equal(result.check.coverage,'unknown');assert.equal(result.report.coverage.completenessStatus,'unknown');assert.equal(result.report.coverage.collectionComplete,false);
});

test('wrong-year, workshop, malformed, and submission pages are quarantined',async()=>{
  for(const document of [html(undefined,{year:2024}),html(undefined,{year:2024}).replaceAll('OSDI 2024','OSDI2024'),html(undefined,{session:'Research Workshop'}),html(undefined,{authorHtml:'No structured author byline'}),'<html><title>OSDI2025 Call for Papers</title><h1>Call for Papers</h1></html>']){
    const f=fixture({document}),p=await proposed(f);const checked=await f.service.validate(p.id);assert.equal(checked.ok,false);assert.equal(checked.check.verdict,'quarantine');assert.ok(checked.report.failures.length>0);
  }
});

test('failed and severe-drop refreshes retain the successful R2 pointer and its original date',async()=>{
  const f=fixture();const first=await f.service.collect('osdi:2025:main');assert.equal(first.persisted,true);assert.equal(first.papers.length,20);const before=f.DB.sqlite.prepare('SELECT * FROM source_collection_cache').get();f.time='2026-11-10T01:00:00Z';f.content=html(originals.slice(0,5));const dropped=await f.service.collect('osdi:2025:main');assert.equal(dropped.cacheRetained,true);assert.equal(dropped.papers.length,20);assert.equal(dropped.check.verdict,'drift');assert.equal(dropped.coverage.retrievedAt,before.retrieved_at);assert.equal(f.DB.sqlite.prepare('SELECT object_key FROM source_collection_cache').get().object_key,before.object_key);
  f.time='2026-11-10T02:00:00Z';f.content=Error('upstream secret');const failed=await f.service.collect('osdi:2025:main');assert.equal(failed.papers.length,20);assert.equal(failed.lastSuccess.retrievedAt,before.retrieved_at);assert.equal(failed.lastAttempt.attemptedAt,'2026-11-10T02:00:00.000Z');assert.ok(!JSON.stringify(failed).includes('upstream secret'));assert.equal(f.DB.sqlite.prepare('SELECT object_key FROM source_collection_cache').get().object_key,before.object_key);
});

test('a publisher-count degradation retains the previous complete cache despite parsing every visible record',async()=>{
  const f=fixture();await f.service.collect('osdi:2025:main');const before=f.DB.sqlite.prepare('SELECT * FROM source_collection_cache').get();f.content=html(undefined,{count:21});const result=await f.service.collect('osdi:2025:main');assert.equal(result.cacheRetained,true);assert.equal(result.check.verdict,'pass');assert.equal(result.check.coverage,'partial');assert.equal(f.DB.sqlite.prepare('SELECT object_key FROM source_collection_cache').get().object_key,before.object_key);
});

test('unknown-count bundled snapshots do not falsely become complete or permanently block a valid refresh',async()=>{
  const snapshot={papers:[basilisk],editions:[{conferenceId:'osdi',year:2025,expectedPapers:null,collectionComplete:true,retrievedAt:sourceDate}],retrievedAt:sourceDate};const f=fixture({snapshot,document:html([basilisk],{count:null})});const result=await f.service.collect('osdi:2025:main');assert.equal(result.ok,true);assert.equal(result.persisted,true);assert.equal(result.cacheRetained,false);assert.equal(result.coverage.collectionComplete,false);assert.equal(result.coverage.completenessStatus,'unknown');
});

test('durable refresh preserves exact citation author, institution and PDF evidence with its original detail date',async()=>{
  const snapshot={papers:[basilisk],editions:[{conferenceId:'osdi',year:2025,expectedPapers:null,retrievedAt:sourceDate}],retrievedAt:sourceDate};const f=fixture({snapshot,document:html([basilisk])});const result=await f.service.collect('osdi:2025:main');assert.equal(result.persisted,true);const restored=result.papers[0];assert.equal(restored.detailVerified,true);assert.equal(restored.metadataReusedFromSnapshot,true);assert.deepEqual(restored.authors,basilisk.authors);assert.equal(restored.pdfUrl,basilisk.pdfUrl);assert.equal(restored.detailMetadataRetrievedAt,sourceDate);assert.notEqual(result.coverage.retrievedAt,sourceDate);
  const pointer=f.DB.sqlite.prepare('SELECT object_key FROM source_collection_cache').get().object_key;const stored=JSON.parse(f.BUCKET.values.get(pointer));assert.equal(stored.papers[0].detailMetadataRetrievedAt,sourceDate);assert.deepEqual(stored.papers[0].authors,basilisk.authors);
});

test('a changed source byline prevents citation-author and PDF reuse in the durable cache',async()=>{
  const snapshot={papers:[basilisk],editions:[{conferenceId:'osdi',year:2025,expectedPapers:null,retrievedAt:sourceDate}],retrievedAt:sourceDate};const f=fixture({snapshot,document:html([basilisk],{authorHtml:basiliskAuthors.replace('Tony Nuda Zhang and ','')})});const result=await f.service.collect('osdi:2025:main');assert.equal(result.papers[0].detailVerified,false);assert.equal(result.papers[0].pdfUrl,null);assert.ok(!result.papers[0].authors.some(a=>a.name==='Tony Nuda Zhang'));
});

test('read-only seed collection works without storage, while proposing and promotion report unavailable storage',async()=>{
  const service=makeSourcePlanService({SOURCE_PLAN_SEEDS:[seed()]},{fetcher:async()=>new Response(html()),now:()=>new Date('2026-11-10')});assert.equal((await service.list()).storageAvailable,false);const collected=await service.collect('osdi:2025:main');assert.equal(collected.ok,true);assert.equal(collected.persisted,false);assert.ok(collected.warnings.some(w=>w.includes('without durable')));assert.equal((await service.propose(plan())).status,'storage_unavailable');assert.equal((await service.promote('id','check',null)).status,'storage_unavailable');
  const f=fixture({provisioned:false});const listing=await f.service.list();assert.equal(listing.storageAvailable,false);assert.equal(listing.plans.length,1);assert.equal((await f.service.propose(plan())).status,'storage_unavailable');assert.ok(f.DB.calls.every(sql=>!/\bCREATE\b/i.test(sql)));
});

test('unconnected or invalid scopes never fabricate a plan or papers',async()=>{
  const f=fixture();const missing=await f.service.collect('neurips:2026:main');assert.equal(missing.status,'adapter_missing');assert.deepEqual(missing.papers,[]);assert.equal((await f.service.collect('not-a-conference:2026:main')).status,'invalid_scope');assert.equal(f.calls,0);
});

test('untrusted authorities, unsafe redirects and oversized source bodies are rejected',async()=>{
  const f=fixture();assert.equal((await f.service.propose(plan({authorityUrl:'https://attacker.example/'}))).status,'invalid_plan');assert.equal((await f.service.propose(plan({entryUrl:'https://127.0.0.1/private'}))).status,'invalid_plan');f.content=new Response(null,{status:302,headers:{location:'https://127.0.0.1/private'}});let check=await f.service.validate('seed:osdi:2025');assert.equal(check.ok,false);assert.equal(f.calls,1);
  f.content=new Response('<html>too large</html>',{headers:{'content-length':'2097153'}});check=await f.service.validate('seed:osdi:2025');assert.equal(check.ok,false);
});

test('ATC2026 uses a validated declarative migration plan without generating parser code',async()=>{
  const p=plan({conferenceId:'atc',year:2026,adapter:'generic-html-v1',entryUrl:'https://atc.sigops.org/2026/accepted.html',authorityUrl:'https://atc.sigops.org/2026/accepted.html',extraction:{recordSelector:'ul.paperlist > li',titleSelector:'strong',authorsSelector:'em',linkSelector:null,pdfSelector:null,authorFormat:'parentheses',titleFrom:'text',authorsFrom:'text'},scopeEvidence:{conference:'ATC',year:'2026',accepted:'Accepted Papers'}});
  const document='<html><title>ATC2026 Accepted Papers</title><h1>ATC2026 Accepted Papers</h1><p>The following1 papers have been accepted.</p><ul class="paperlist"><li><strong>SynDebug: A Framework to Debug Logic Bugs in Fault-Tolerant Quantum Computing Programs</strong><br><em>Nick DiBrita (Rice University); Jack Lange (Oak Ridge National Lab); Tirthak Patel (Rice University)</em></li></ul></html>'.replace('following1','following 1');const f=fixture({seeds:[],document}),proposal=await f.service.propose(p);assert.equal(proposal.ok,true);assert.equal(proposal.plan.version,1);const check=await f.service.validate(proposal.plan.id);assert.equal(check.ok,true);assert.equal(check.check.observedCount,1);assert.equal((await f.service.promote(proposal.plan.id,check.check.id,null)).ok,true);const result=await f.service.collect('atc:2026:main');assert.equal(result.papers.length,1);assert.equal(result.papers[0].authors.length,3);assert.equal(result.papers[0].authors[0].name,'Nick DiBrita');assert.equal(result.coverage.collectionComplete,true);
});

test('a new entry must be linked from trusted organizer authority, rather than merely sharing a plausible host',async()=>{
  const p=plan({conferenceId:'atc',year:2026,adapter:'generic-html-v1',entryUrl:'https://atc.sigops.org/2026/alternative-papers.html',authorityUrl:'https://atc.sigops.org/2026/',extraction:{recordSelector:'ul.paperlist > li',titleSelector:'strong',authorsSelector:'em',linkSelector:null,pdfSelector:null,authorFormat:'parentheses',titleFrom:'text'},scopeEvidence:{conference:'ATC',year:'2026',accepted:'Accepted Papers'}});
  const listing='<html><title>ATC2026 Accepted Papers</title><h1>ATC2026 Accepted Papers</h1><p>The following 1 papers have been accepted.</p><ul class="paperlist"><li><strong>SynDebug: A Framework to Debug Logic Bugs in Fault-Tolerant Quantum Computing Programs</strong><em>Nick DiBrita (Rice University); Jack Lange (Oak Ridge National Lab); Tirthak Patel (Rice University)</em></li></ul></html>';
  let linked=true;const calls=[];const DB=d1(),service=makeSourcePlanService({DB,BUCKET:r2()},{now:()=>new Date('2026-11-10'),fetcher:async(url,options)=>{calls.push(url);assert.equal(options.redirect,'manual');if(url===p.authorityUrl)return new Response('<html><h1>ATC2026</h1>'+(linked?'<a href="alternative-papers.html">Accepted Papers</a>':'')+'</html>');return new Response(listing)}});const proposed=await service.propose(p);assert.equal(proposed.ok,true);const valid=await service.validate(proposed.plan.id);assert.equal(valid.ok,true);assert.equal(valid.report.authority.method,'official_link_chain');linked=false;calls.length=0;const rejected=await service.validate(proposed.plan.id);assert.equal(rejected.ok,false);assert.equal(rejected.check.verdict,'quarantine');assert.deepEqual(calls,[p.authorityUrl]);
});
