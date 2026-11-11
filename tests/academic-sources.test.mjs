import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { handleApi } from '../worker/api.mjs';

const root=new URL('../',import.meta.url);
const pilot=JSON.parse(await readFile(new URL('data/academic-research.json',root),'utf8'));
const snapshots=await Promise.all(['usenix','networking'].map(async name=>JSON.parse(await readFile(new URL('data/'+name+'.json',root),'utf8'))));
const papers=snapshots.flatMap(s=>s.papers),paperById=new Map(papers.map(p=>[p.id,p]));
const names=new Map([['author:001aecaf95a500e3','Yusheng Zheng'],['author:00268649c615f475','Zhiqiang Lv'],['author:002a06b74d574ed9','Nimesha Wickramasinghe'],['author:003cc5d1117b64a7','Tianyuan Wu']]);
const primaryHosts=new Set(['yunwei37.com','www.usenix.org','nime-sha256.info','cgi.cse.unsw.edu.au','conferences.sigcomm.org','wutianyuan1.github.io']);
const academicKeys=['currentAffiliation','currentStatus','researchInterests','degree','programStartYear','expectedGraduationYear'];
function keys(record,expected){assert.deepEqual(Object.keys(record).sort(),[...expected].sort())}

test('four-author pilot uses the first canonical IDs from the complete source collection',async()=>{
 keys(pilot,['schemaVersion','selectionMethod','queriedAt','profiles']);assert.equal(pilot.schemaVersion,1);assert.equal(pilot.profiles.length,4);assert.equal(pilot.selectionMethod,'First four canonical author IDs in lexicographic order; no demographic selection');assert.ok(Number.isFinite(Date.parse(pilot.queriedAt)));
 const response=await handleApi(new Request('https://talent.example/api/bootstrap'),{SOURCE_SNAPSHOT:{papers,editions:snapshots.flatMap(s=>s.coverage),warnings:[]}});assert.equal(response.status,200);const collection=await response.json();const firstFour=collection.candidates.map(c=>c.id).sort().slice(0,4);assert.deepEqual(pilot.profiles.map(p=>p.candidateId),firstFour);
});

test('pilot stores only the agreed academic/provenance schema and remains pending human review',()=>{
 for(const profile of pilot.profiles){
  keys(profile,['candidateId','identity','academic','sources','warnings','queriedAt','requiresHumanReview','researchMethod']);keys(profile.identity,['status','confidence','matchedPaperIds','sourceIds','rationale']);keys(profile.academic,academicKeys);
  assert.equal(profile.requiresHumanReview,true);assert.equal(profile.researchMethod,'assistant_agents_public_sources');assert.equal(profile.queriedAt,pilot.queriedAt);assert.ok(Array.isArray(profile.warnings)&&profile.warnings.length);assert.ok(['matched','unresolved'].includes(profile.identity.status));assert.ok(['high','medium','low'].includes(profile.identity.confidence));
  for(const field of Object.values(profile.academic))keys(field,['value','sourceIds','asOf','confidence','basis']);
  for(const source of profile.sources)keys(source,['id','url','title','sourceDate','evidenceExcerpt']);
 }
 const sensitiveKeys=/^(?:ethnicity|race|nationality|citizenship|origin|nativeLanguage|language|gender|sex|age|birthDate|email|phone|contactDetails)$/i;
 const visit=value=>{if(value&&typeof value==='object')for(const [key,child]of Object.entries(value)){assert.ok(!sensitiveKeys.test(key),'Unsupported personal field: '+key);visit(child)}};visit(pilot);
});

test('every source is primary HTTPS evidence and excerpts stay within the per-page quote limit',()=>{
 const wordsByUrl=new Map();
 for(const profile of pilot.profiles){const ids=new Set();for(const source of profile.sources){assert.ok(!ids.has(source.id));ids.add(source.id);const url=new URL(source.url);assert.equal(url.protocol,'https:');assert.ok(primaryHosts.has(url.hostname),source.url);assert.equal(url.username+url.password,'');assert.ok(source.title&&source.evidenceExcerpt);assert.ok(source.sourceDate===null||/^\d{4}-\d{2}-\d{2}$/.test(source.sourceDate));if(source.sourceDate)assert.ok(source.sourceDate<=pilot.queriedAt.slice(0,10));wordsByUrl.set(source.url,(wordsByUrl.get(source.url)||0)+source.evidenceExcerpt.trim().split(/\s+/).length)}assert.ok(profile.identity.sourceIds.length);assert.ok(profile.identity.sourceIds.every(id=>ids.has(id)))}
 for(const [url,count]of wordsByUrl)assert.ok(count<=25,`${url}: ${count} quoted words exceed the limit`);
});

test('identity evidence refers to actual snapshot papers and matching author bylines',()=>{
 for(const profile of pilot.profiles){assert.ok(names.has(profile.candidateId));assert.ok(profile.identity.matchedPaperIds.length);for(const id of profile.identity.matchedPaperIds){const paper=paperById.get(id);assert.ok(paper,'Missing source paper: '+id);assert.ok(paper.authors.some(a=>a.name===names.get(profile.candidateId)),'Paper does not name the reviewed author: '+id)}}
});

test('academic facts have valid source references; unknowns are explicit and undated claims are qualified',()=>{
 for(const profile of pilot.profiles){const sources=new Map(profile.sources.map(s=>[s.id,s]));for(const [key,field]of Object.entries(profile.academic)){
  if(field.value===null){assert.deepEqual(field,{value:null,sourceIds:[],asOf:null,confidence:'unknown',basis:'unknown'});continue}
  assert.equal(field.basis,'source_stated');assert.ok(['high','medium','low'].includes(field.confidence));assert.ok(field.sourceIds.length&&field.sourceIds.every(id=>sources.has(id)));assert.ok(field.asOf===null||field.sourceIds.some(id=>sources.get(id).sourceDate===field.asOf));
  if(['currentAffiliation','currentStatus'].includes(key)&&field.sourceIds.every(id=>sources.get(id).sourceDate===null)){assert.equal(field.confidence,'medium');assert.ok(profile.warnings.some(w=>/update date|update dates|undated/i.test(w)))}
  if(key==='researchInterests')assert.ok(Array.isArray(field.value)&&field.value.every(v=>typeof v==='string'));
  if(['programStartYear','expectedGraduationYear'].includes(key))assert.ok(Number.isInteger(field.value));
 }}
});

test('unresolved author has no namesake-derived academic claims and graduation years are explicitly sourced',()=>{
 const unresolved=pilot.profiles.filter(p=>p.identity.status==='unresolved');assert.equal(unresolved.length,1);assert.equal(unresolved[0].candidateId,'author:00268649c615f475');assert.ok(Object.values(unresolved[0].academic).every(field=>field.value===null));
 const explicit=pilot.profiles.filter(p=>p.academic.expectedGraduationYear.value!==null);assert.equal(explicit.length,2);for(const profile of explicit){const field=profile.academic.expectedGraduationYear;assert.equal(field.value,2027);assert.equal(field.basis,'source_stated');assert.ok(field.sourceIds.some(id=>profile.sources.find(s=>s.id===id)?.evidenceExcerpt.includes('2027')))}
 const nimesha=pilot.profiles.find(p=>p.candidateId==='author:002a06b74d574ed9');assert.equal(nimesha.academic.programStartYear.value,null);assert.equal(nimesha.academic.expectedGraduationYear.value,null);
 const tianyuan=pilot.profiles.find(p=>p.candidateId==='author:003cc5d1117b64a7');assert.equal(tianyuan.academic.expectedGraduationYear.asOf,'2026-09-24');
});
