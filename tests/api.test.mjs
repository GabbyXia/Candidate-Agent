import test, {afterEach,mock} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {handleApi} from '../worker/api.mjs';
const usenix=JSON.parse(fs.readFileSync(new URL('../data/usenix.json',import.meta.url),'utf8'));
const networking=JSON.parse(fs.readFileSync(new URL('../data/networking.json',import.meta.url),'utf8'));
const snapshot={papers:[...usenix.papers,...networking.papers],editions:[...usenix.coverage,...networking.coverage],retrievedAt:[usenix.retrievedAt,networking.retrievedAt].sort().at(-1)};
const env={SOURCE_SNAPSHOT:snapshot};
const academicPilot=JSON.parse(fs.readFileSync(new URL('../data/academic-research.json',import.meta.url),'utf8'));
const basilisk=usenix.papers.find(p=>p.id==='usenix:osdi:2025:zhang-tony');
assert.ok(basilisk,'Real publisher-sourced Basilisk record exists');
let sequence=0;
const defaults={role:'Systems Researcher',domain:'systems',keywords:'distributed,proofs',conferences:['osdi'],startYear:2025,endYear:2025,refresh:false};
const req=(body=defaults,headers={})=>new Request('https://app.test/api/research',{method:'POST',headers:{'content-type':'application/json','oai-authenticated-user-id':'api-test-'+(++sequence),...headers},body:JSON.stringify(body)});
const bootstrap=source=>handleApi(new Request('https://app.test/api/bootstrap'),source||env);
function fixture(papers){const keys=[...new Set(papers.map(p=>p.conferenceId+':'+p.year))];return {SOURCE_SNAPSHOT:{papers,editions:keys.map(key=>{const [conferenceId,y]=key.split(':');const year=Number(y),records=papers.filter(p=>p.conferenceId===conferenceId&&p.year===year);return {conferenceId,year,status:'complete',listingPapers:records.length,sourceUrl:records[0].sourceUrl,retrievedAt:usenix.retrievedAt}}),retrievedAt:usenix.retrievedAt}}}
function esc(value){return String(value).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;')}
const byline='Tony Nuda Zhang and Keshav Singh, <em>University of Michigan;</em> Tej Chajed, <em>University of Wisconsin-Madison;</em> Manos Kapritsos, <em>University of Michigan;</em> Bryan Parno, <em>Carnegie Mellon University</em><br><strong><em>Awarded Best Paper!</em></strong>';
function publisherHtml(paper=basilisk,authors=byline){return '<!doctype html><html><article class="node node-session"><h2>Distributed Systems and Data Centers I</h2><article class="node node-paper"><h2><a href="'+new URL(paper.url).pathname+'">'+esc(paper.title)+'</a></h2><div class="field-name-field-paper-people-text">'+authors+'</div><div class="field-name-field-paper-description-long"><p>'+esc(paper.abstractSnippet)+'</p></div></article></article></html>'}
afterEach(()=>mock.restoreAll());

test('academic research routes expose cited proposals without applying them as facts',async()=>{
 const source={...env,ACADEMIC_RESEARCH_SNAPSHOT:academicPilot};
 const pilot=await(await handleApi(new Request('https://app.test/api/profile-research/pilot'),source)).json();assert.equal(pilot.profiles.length,4);
 const data=await(await bootstrap(source)).json();assert.equal(data.candidates.filter(c=>c.academicResearch).length,4);assert.ok(data.candidates.every(c=>c.status==='Unknown'&&c.gradYear===null));
 const status=await(await handleApi(new Request('https://app.test/api/profile-research/status'),source)).json();assert.equal(status.configured,false);assert.equal(status.maxBatchSize,25);assert.deepEqual(status.missing,['OPENAI_API_KEY','OPENAI_RESEARCH_MODEL']);
});

test('academic endpoint accepts canonical IDs rather than arbitrary prompts or personal trait filters',async()=>{
 const called=mock.method(globalThis,'fetch',async()=>{throw Error('Invalid requests must not call a model')});
 const configured={...env,OPENAI_API_KEY:'test-placeholder',OPENAI_RESEARCH_MODEL:'test-research-model'};
 for(const body of [{candidateId:academicPilot.profiles[0].candidateId,prompt:'Research something else'},{candidateId:academicPilot.profiles[0].candidateId,nationality:'Chinese'},{candidateId:'name-only'},{candidateId:academicPilot.profiles[0].candidateId,paperIds:Array(4).fill('id')}]){
  const request=new Request('https://app.test/api/enrich',{method:'POST',headers:{'Content-Type':'application/json','oai-authenticated-user-id':'profile-validation-'+(++sequence)},body:JSON.stringify(body)});assert.equal((await handleApi(request,configured)).status,400);
 }
 assert.equal(called.mock.callCount(),0);
});

test('bootstrap retains every real canonical paper and all author occurrences, without candidate caps',async()=>{
  const response=await bootstrap();assert.equal(response.status,200);const result=await response.json();
  assert.equal(result.papers.length,snapshot.papers.length);assert.ok(result.papers.length>1000);assert.ok(result.candidates.length>100);
  assert.equal(result.coverage.authorOccurrences,snapshot.papers.reduce((n,p)=>n+p.authors.length,0));
  assert.equal(result.coverage.candidatesReturned,result.candidates.length);assert.ok(result.candidates.every(c=>c.status==='Unknown'&&c.gradYear===null&&c.degree===null&&!c.isSample));
  const ids=new Set(result.papers.map(p=>p.id));assert.ok(result.candidates.every(c=>c.paperIds.every(id=>ids.has(id))));
});

test('cached conference/year selection performs no network fetch and returns the full edition',async()=>{
  const fetch=mock.method(globalThis,'fetch',async()=>{throw Error('Snapshot selection must not fetch')});
  const result=await (await handleApi(req(),env)).json();const expected=usenix.papers.filter(p=>p.conferenceId==='osdi'&&p.year===2025);
  assert.equal(result.papers.length,expected.length);assert.ok(result.candidates.length>100);assert.equal(fetch.mock.callCount(),0);
  assert.equal(result.coverage.collectionComplete,true);assert.equal(result.coverage.partial,false);assert.equal(result.coverage.metadataComplete,false);
  assert.ok(result.candidates.some(c=>c.affiliation==='Not published'));assert.ok(result.candidates.every(c=>c.gradYear===null));
});

test('conservative identity combines exact name+affiliation and preserves unmatched affiliation-free occurrences',async()=>{
  const result=await (await bootstrap()).json();
  const unknownOccurrences=snapshot.papers.flatMap(p=>p.authors).filter(a=>!a.affiliations.length&&!/^(?:anonymous(?:\s+authors?)?|unknown)$/i.test(a.name)).length;
  assert.equal(result.candidates.filter(c=>c.affiliation==='Not published').length,unknownOccurrences);
  const knownOccurrences=snapshot.papers.flatMap(p=>p.authors).filter(a=>a.affiliations.length);assert.ok(result.candidates.length<snapshot.papers.reduce((n,p)=>n+p.authors.length,0));assert.ok(knownOccurrences.length>0);
  assert.ok(result.candidates.every(c=>c.identityNote.includes('Provisional identity')||c.identityNote.includes('retained separately')));
  assert.ok(result.candidates.filter(c=>c.affiliation!=='Not published').every(c=>c.affiliationLabel.includes('current status unverified')));
});

test('unidentified publisher author labels remain in the paper but are not candidate profiles',async()=>{
  const paper=networking.papers.find(p=>p.id==='publisher:imc:2025:30e4bfe0');assert.ok(paper);assert.ok(paper.authors.some(a=>/^anonymous(?:\s+authors?)?$/i.test(a.name)));
  const result=await(await bootstrap(fixture([paper]))).json();assert.equal(result.papers.length,1);assert.equal(result.coverage.authorOccurrences,paper.authors.length);assert.ok(result.coverage.unresolvedAuthorOccurrences>0);assert.ok(result.candidates.every(c=>!/^anonymous(?:\s+authors?)?$/i.test(c.name)));assert.ok(result.papers[0].rawByline.toLowerCase().includes('anonymous'));
});

test('lexical fit uses complete words and does not match RAG within storage',async()=>{
  const paper=usenix.papers.find(p=>/storage/i.test(p.title)&&!/(^|\W)rag(\W|$)/i.test(p.title+' '+p.section));assert.ok(paper);
  const source=fixture([paper]);const body={...defaults,conferences:[paper.conferenceId],startYear:paper.year,endYear:paper.year,keywords:'RAG'};
  const result=await (await handleApi(req(body),source)).json();assert.ok(result.candidates.length>0);assert.ok(result.candidates.every(c=>c.fit===0));assert.ok(result.candidates.every(c=>c.fitReason.includes('0 of 1')));
  body.keywords='storage';const matching=await (await handleApi(req(body),source)).json();assert.ok(matching.candidates.every(c=>c.fit===100));
});

test('profile identities remain stable when role and keyword alignment change',async()=>{
  const source=fixture([basilisk]);const first=await(await handleApi(req(),source)).json();const second=await(await handleApi(req({...defaults,role:'Different research role',keywords:'proofs'}),source)).json();
  assert.deepEqual(first.candidates.map(c=>c.id).sort(),second.candidates.map(c=>c.id).sort());assert.ok(second.candidates.every(c=>c.fit===100));
});

test('refresh reuses checked citation metadata only when id, URL, title and byline agree',async()=>{
  const fetch=mock.method(globalThis,'fetch',async()=>new Response(publisherHtml()));
  const result=await(await handleApi(req({...defaults,refresh:true}),fixture([basilisk]))).json();assert.equal(fetch.mock.callCount(),1);
  assert.equal(result.papers.length,1);assert.equal(result.papers[0].detailVerified,true);assert.equal(result.papers[0].metadataReusedFromSnapshot,true);assert.deepEqual(result.papers[0].authors,basilisk.authors);
  assert.equal(result.coverage.editions[0].cachedCitationRecordsReused,1);assert.equal(result.coverage.editions[0].status,'refreshed_official_listing');assert.equal(result.coverage.partial,false);
});

test('an updated publisher byline prevents stale citation-author reuse',async()=>{
  mock.method(globalThis,'fetch',async()=>new Response(publisherHtml(basilisk,byline.replace('Tony Nuda Zhang and ',''))));
  const result=await(await handleApi(req({...defaults,refresh:true}),fixture([basilisk]))).json();assert.equal(result.papers[0].detailVerified,false);assert.equal(result.coverage.editions[0].cachedCitationRecordsReused,0);
  assert.ok(!result.papers[0].authors.some(a=>a.name==='Tony Nuda Zhang'));assert.equal(result.coverage.editions[0].detailMetadataPending,1);
});

test('a changed publisher title prevents stale citation metadata reuse',async()=>{
  const changed={...basilisk,title:usenix.papers.find(p=>p.id!==basilisk.id).title};
  mock.method(globalThis,'fetch',async()=>new Response(publisherHtml(changed)));
  const result=await(await handleApi(req({...defaults,refresh:true}),fixture([basilisk]))).json();assert.equal(result.papers[0].detailVerified,false);assert.equal(result.papers[0].title,changed.title);
});

test('source failure returns dated cache with an explicit freshness failure',async()=>{
  mock.method(globalThis,'fetch',async()=>{throw Error('transport internals must not leak')});
  const result=await(await handleApi(req({...defaults,refresh:true}),fixture([basilisk]))).json();assert.equal(result.papers.length,1);assert.equal(result.coverage.editions[0].status,'cached_after_source_failure');assert.equal(result.coverage.editions[0].sourceRetrievedAt,usenix.retrievedAt);assert.equal(result.coverage.collectionComplete,false);assert.equal(result.coverage.partial,true);assert.ok(result.warnings.some(w=>w.includes('dated publisher snapshot')));assert.ok(!JSON.stringify(result).includes('transport internals'));
});

test('unavailable official source without cache creates no paper or candidate records',async()=>{
  mock.method(globalThis,'fetch',async()=>new Response('<html>Unavailable</html>',{status:503}));
  const result=await(await handleApi(req(),{SOURCE_SNAPSHOT:{papers:[],editions:[]}})).json();assert.deepEqual(result.papers,[]);assert.deepEqual(result.candidates,[]);assert.equal(result.coverage.editions[0].status,'unavailable');assert.equal(result.coverage.partial,true);
});

test('ATC migration in2026 is explicit and does not fetch a fictitious USENIX edition',async()=>{
  const fetch=mock.method(globalThis,'fetch',async()=>{throw Error('Unsupported source must not fetch')});
  const result=await(await handleApi(req({...defaults,conferences:['atc'],startYear:2026,endYear:2026}),env)).json();assert.equal(fetch.mock.callCount(),0);assert.equal(result.papers.length,0);assert.equal(result.coverage.editions[0].status,'unsupported');assert.match(result.coverage.editions[0].sourceUrl,/atc.sigops.org/);assert.ok(result.warnings.some(w=>w.includes('migration')));
});

test('catalog provides general CS domains while mapped unconnected adapters return a clear400',async()=>{
  const catalog=await(await handleApi(new Request('https://app.test/api/catalog'))).json();assert.ok(catalog.domains.length>=18);assert.ok(catalog.conferences.length>=50);assert.ok(catalog.conferences.some(c=>c.id==='neurips'));
  const response=await handleApi(req({...defaults,conferences:['neurips']}),env);assert.equal(response.status,400);assert.equal((await response.json()).code,'SOURCE_NOT_CONNECTED');
});

test('validates windows, request shape, source selection, domain and refresh type',async()=>{
  for(const fields of [{conferences:[]},{conferences:Array.from({length:9},(_,i)=>'source'+i)},{startYear:2020,endYear:2025},{startYear:2026,endYear:2025},{endYear:2099},{domain:'unknown'},{keywords:'a'.repeat(501)},{refresh:'true'}])assert.equal((await handleApi(req({...defaults,...fields}),env)).status,400,JSON.stringify(fields));
  for(const body of [null,[],1,'text'])assert.equal((await handleApi(req(body),env)).status,400);
  assert.equal((await handleApi(new Request('https://app.test/api/research',{method:'POST',headers:{'oai-authenticated-user-id':'no-content-type'},body:'{}'}),env)).status,400);
  assert.equal((await handleApi(new Request('https://app.test/api/research',{method:'POST',headers:{'content-type':'application/json','oai-authenticated-user-id':'oversize'},body:' '.repeat(16385)}),env)).status,400);
});

test('publisher stated count discrepancy remains visible and never invents a missing paper',async()=>{
  const result=await(await bootstrap()).json();const edition=result.coverage.editions.find(e=>e.conferenceId==='sigcomm'&&e.year===2026);assert.equal(edition.listingPapers,109);assert.equal(edition.expectedPapers,110);assert.equal(edition.partial,true);assert.equal(result.coverage.collectionComplete,false);assert.ok(result.warnings.some(w=>w.includes('110 accepted papers')&&w.includes('109 parsed')));
});

test('AI enrichment remains explicitly disconnected and obsolete import route is absent',async()=>{
  const status=await(await handleApi(new Request('https://app.test/api/status'))).json();assert.equal(status.aiConfigured,false);assert.ok(status.sources.every(s=>s.status==='official_adapter'));
  const enrich=await handleApi(new Request('https://app.test/api/enrich',{method:'POST'}));assert.equal(enrich.status,503);assert.equal((await enrich.json()).code,'AI_CONNECTION_REQUIRED');assert.equal((await handleApi(new Request('https://app.test/api/import',{method:'POST'}))).status,404);
  assert.equal(await handleApi(new Request('https://app.test/')),null);assert.equal((await bootstrap({SOURCE_SNAPSHOT:{papers:[],editions:[]}})).status,503);
});

test('repeated research runs are bounded per visitor',async()=>{
  const make=()=>req(defaults,{'oai-authenticated-user-id':'only-rate-limit-test'});
  for(let i=0;i<4;i++)assert.equal((await handleApi(make(),fixture([basilisk]))).status,200);
  assert.equal((await handleApi(make(),fixture([basilisk]))).status,429);
});
