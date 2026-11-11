import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CONFERENCES } from '../shared/catalog.js';
import { validateSourcePlan,sourcePlanDigest } from '../worker/source-discovery.mjs';
const root=new URL('../',import.meta.url),seeds=JSON.parse(await readFile(new URL('data/source-plans.json',root),'utf8'));
const snapshots=await Promise.all(['usenix','networking'].map(async name=>JSON.parse(await readFile(new URL('data/'+name+'.json',root),'utf8'))));
test('immutable seeds cover every real snapshot edition plus all2023–2026 USENIX scopes and migrated ATC2026',async()=>{
 assert.ok(Array.isArray(seeds));const scopes=new Set(seeds.map(v=>v.scopeKey));assert.equal(scopes.size,29);assert.equal(new Set(seeds.map(v=>v.id)).size,seeds.length);
 for(const id of ['osdi','nsdi','fast','security','atc'])for(const year of [2023,2024,2025,2026])assert.ok(scopes.has(`${id}:${year}:main`));
 for(const edition of snapshots.flatMap(s=>s.coverage)){const key=`${edition.conferenceId}:${edition.year}:main`,row=seeds.filter(v=>v.scopeKey===key).sort((a,b)=>b.version-a.version)[0];assert.ok(row,key);assert.equal(row.validation.parsedPapers,edition.listingPapers);}
 for(const row of seeds){const p=row.plan;assert.equal(row.scopeKey,`${p.conferenceId}:${p.year}:main`);assert.ok(Number.isInteger(row.version)&&row.version>0);assert.equal(row.status,'validated');assert.equal(row.digest,await sourcePlanDigest(p));assert.ok(row.id.includes(':v'+row.version+':'+row.digest.slice(0,12)));assert.equal(validateSourcePlan(p,{conferenceId:p.conferenceId,year:p.year,track:'main'},CONFERENCES.find(c=>c.id===p.conferenceId)).ok,true);assert.equal(row.validation.ok,true);assert.ok(['pass','passed'].includes(row.validation.serviceVerdict));assert.equal(row.validation.contentDigest,row.validation.sourceFingerprint);assert.ok(row.validation.adapterVersion.startsWith(p.adapter+':'));assert.equal(row.validation.sourceUrl,p.entryUrl);assert.equal(row.validation.authority.method,'catalog_source_page');assert.match(row.validation.sourceFingerprint,/^[a-f0-9]{64}$/);assert.ok(Number.isFinite(Date.parse(row.createdAt)));assert.ok(Number.isFinite(Date.parse(row.validation.checkedAt)));assert.ok(row.validation.parsedPapers>0);}
});
test('ATC2026 is a real135-paper generic plan rather than a fabricated USENIX edition',()=>{
 const row=seeds.find(v=>v.scopeKey==='atc:2026:main');assert.equal(row.plan.adapter,'generic-html-v1');assert.equal(row.plan.entryUrl,'https://atc.sigops.org/2026/accepted.html');assert.equal(row.plan.extraction.recordSelector,'ul.paperlist > li');assert.equal(row.validation.expectedPapers,135);assert.equal(row.validation.parsedPapers,135);assert.equal(row.validation.authorOccurrences,946);assert.equal(row.validation.collectionComplete,true);
});
test('a valid extractor does not erase the officialSIGCOMM2026 count discrepancy',()=>{
 const row=seeds.find(v=>v.scopeKey==='sigcomm:2026:main');assert.equal(row.validation.expectedPapers,110);assert.equal(row.validation.parsedPapers,109);assert.equal(row.validation.collectionComplete,false);assert.ok(row.validation.warnings.some(w=>w.includes('110')&&w.includes('109')));
});
