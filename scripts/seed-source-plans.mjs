#!/usr/bin/env node
/* Offline, reproducible source-plan validation against downloaded official HTML.
   No model calls, credentials, or generated parser code. Existing rows are never
   mutated: changed plans/content create a new immutable version. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { CONFERENCES } from '../shared/catalog.js';
import { parseUsenixListing,usenixEditionUrl,decodeUsenixEntities } from '../worker/usenix.mjs';
import { parseNetworkingListing } from '../worker/networking.mjs';
import { parseGenericSourceListing,validateSourcePlan,sourcePlanDigest,sourceContentFingerprint } from '../worker/source-discovery.mjs';
import { makeSourcePlanService } from '../worker/source-plans.mjs';
const flags=Object.fromEntries(process.argv.slice(2).map(arg=>{const [key,...value]=arg.replace(/^--/,'').split('=');return [key,value.join('=')]}));
const root=new URL('../',import.meta.url),htmlCache=flags['html-cache']||'/tmp',output=path.resolve(flags.output||new URL('data/source-plans.json',root).pathname),now=new Date().toISOString();
const snapshots=await Promise.all(['usenix','networking'].map(async name=>({name,data:JSON.parse(await fs.readFile(new URL('data/'+name+'.json',root),'utf8'))})));
let versions=[];try{const old=JSON.parse(await fs.readFile(output,'utf8'));versions=Array.isArray(old)?old:old.versions||[];}catch(error){if(error.code!=='ENOENT')throw error}
const plain=html=>decodeUsenixEntities(html.replace(/<!--[^]*?-->/g,' ').replace(/<script\b[^>]*>[^]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[^]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ').trim();
const scopes=[],snapshotEditions=new Map();for(const {name,data}of snapshots)for(const edition of data.coverage)snapshotEditions.set(`${edition.conferenceId}:${edition.year}`,{kind:name,edition,baselinePapers:data.papers.filter(p=>p.conferenceId===edition.conferenceId&&p.year===edition.year).length});
for(const conferenceId of ['osdi','nsdi','fast','security','atc'])for(const year of [2023,2024,2025,2026]){
 const existing=snapshotEditions.get(`${conferenceId}:${year}`);if(existing){scopes.push(existing);continue;}
 const generic=conferenceId==='atc'&&year===2026,sourceUrl=generic?'https://atc.sigops.org/2026/accepted.html':usenixEditionUrl(conferenceId,year);scopes.push({kind:generic?'generic':'usenix',edition:{conferenceId,year,sourceUrl},baselinePapers:null});
}
for(const row of snapshotEditions.values())if(row.kind==='networking')scopes.push(row);
let created=0,reused=0;const summary=[],sourceDocuments=new Map(),createdIds=new Set();
for(const {kind,edition,baselinePapers}of scopes){
 const {conferenceId,year,sourceUrl}=edition,catalog=CONFERENCES.find(c=>c.id===conferenceId);if(!catalog)throw Error('Unknown canonical conference '+conferenceId);
 const filename=kind==='usenix'?`${new URL(sourceUrl).pathname.split('/')[2]}.html`:kind==='generic'?'atc2026-accepted.html':`${conferenceId}${String(year).slice(-2)}${conferenceId==='conext'?(sourceUrl.includes('/program.html')?'-program':'-accepted'):''}.html`;
 const file=path.join(htmlCache,filename),html=await fs.readFile(file,'utf8'),stat=await fs.stat(file),text=plain(html);sourceDocuments.set(sourceUrl,html);
 const headings=[...html.matchAll(/<h[12]\b[^>]*>([^]*?)<\/h[12]>/gi)].map(m=>plain(m[1]));
 const conferenceEvidence=headings.find(h=>h.toLowerCase().includes(catalog.name.toLowerCase()))||text.match(new RegExp('.{0,30}'+catalog.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'.{0,60}','i'))?.[0]||catalog.name;
 const yearEvidence=text.includes(String(year))?String(year):headings.find(h=>h.includes(String(year).slice(-2)))||String(year);
 const acceptedEvidence=kind==='usenix'?'Technical Sessions':kind==='generic'?'The following 135 papers have been accepted':sourceUrl.includes('/program.html')?'CoNEXT 2025 Program':'Accepted Papers';
 if(!text.toLowerCase().includes(acceptedEvidence.toLowerCase()))throw Error('Official accepted/proceedings scope evidence could not be validated: '+conferenceId+' '+year);
 const plan={schemaVersion:1,conferenceId,year,track:'main',adapter:kind==='usenix'?'usenix-v1':kind==='networking'?'networking-v1':'generic-html-v1',entryUrl:sourceUrl,authorityUrl:sourceUrl,extraction:kind==='generic'?{recordSelector:'ul.paperlist > li',titleSelector:'strong',authorsSelector:'em',linkSelector:null,pdfSelector:null,authorFormat:'parentheses',titleFrom:'text',authorsFrom:'text'}:null,pagination:{mode:'single_page',maxPages:1},scopeEvidence:{conference:conferenceEvidence,year:yearEvidence,accepted:acceptedEvidence}};
 const valid=validateSourcePlan(plan,{conferenceId,year,track:'main'},catalog);if(!valid.ok)throw Error(valid.errors.join(' '));
 const parsed=kind==='usenix'?parseUsenixListing(html,conferenceId,year,sourceUrl):kind==='networking'?parseNetworkingListing(html,conferenceId,year,sourceUrl):parseGenericSourceListing(html,plan);
 if(!parsed.papers.length||baselinePapers!==null&&parsed.papers.length!==baselinePapers)throw Error(`Source count differs from the stored complete edition ${conferenceId} ${year}: ${parsed.papers.length} versus ${baselinePapers}`);
 if(parsed.papers.some(p=>!p.title?.trim()||!Array.isArray(p.authors)||!p.authors.length||p.authors.some(a=>!a.name?.trim())))throw Error(`Selected records lack complete title/author metadata: ${conferenceId} ${year}`);
 const authorOccurrences=parsed.papers.reduce((n,p)=>n+p.authors.length,0),digest=await sourcePlanDigest(plan),sourceFingerprint=await sourceContentFingerprint(html),scopeKey=`${conferenceId}:${year}:main`,same=versions.find(v=>v.scopeKey===scopeKey&&v.digest===digest&&v.validation?.sourceFingerprint===sourceFingerprint&&v.validation?.parsedPapers===parsed.papers.length&&v.validation?.authorOccurrences===authorOccurrences);
 if(same){reused++;summary.push({scopeKey,version:same.version,parsedPapers:parsed.papers.length});continue;}
 const version=Math.max(0,...versions.filter(v=>v.scopeKey===scopeKey).map(v=>v.version||0))+1;
 const expectedPapers=parsed.coverage.expectedPapers??edition.expectedPapers??null;
 const warnings=[...parsed.warnings];if(expectedPapers===null)warnings.push('Publisher accepted-paper total is not stated; accepted-census completeness remains unknown.');if(!text.includes(conferenceEvidence)||!text.includes(yearEvidence))warnings.push('Conference/year context is confirmed by the exact trusted catalog source URL; the official fragment omits a standalone heading.');
 const row={id:`source-plan:${scopeKey}:v${version}:${digest.slice(0,12)}`,scopeKey,version,plan,digest,createdAt:now,status:'validated',validation:{ok:true,checkedAt:now,sourceUrl,sourceRetrievedAt:stat.mtime.toISOString(),sourceFingerprint,expectedPapers,parsedPapers:parsed.papers.length,baselinePapers,authorOccurrences,invalidRecords:parsed.coverage.invalidRecords||0,collectionComplete:expectedPapers!==null&&expectedPapers===parsed.papers.length,completenessStatus:expectedPapers===null?'unknown':expectedPapers===parsed.papers.length?'verified_count':'count_mismatch',warnings,authority:{authorityUrl:sourceUrl,entryUrl:sourceUrl,method:'catalog_source_page'}}};
 versions.push(row);createdIds.add(row.id);created++;summary.push({scopeKey,version,parsedPapers:parsed.papers.length,expectedPapers});
}
// Use the production authority, scope, and deterministic-parser validator with
// cached official HTML before a seed can become part of the shipped artifact.
const service=makeSourcePlanService({SOURCE_PLAN_SEEDS:versions},{fetcher:async url=>{if(!sourceDocuments.has(url))throw Error('URL is outside the downloaded official source set.');return new Response(sourceDocuments.get(url),{headers:{'content-type':'text/html'}})}});
for(const item of summary){const row=versions.filter(v=>v.scopeKey===item.scopeKey).sort((a,b)=>b.version-a.version)[0],check=await service.validate(row.id);if(!check.ok)throw Error(`Production source validation failed for ${row.scopeKey}: ${(check.report?.failures||[]).join(' ')}`);if(createdIds.has(row.id)){row.validation.serviceVerdict=check.report.verdict;row.validation.adapterVersion=check.report.adapterVersion;row.validation.contentDigest=check.report.contentDigest;}}
await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output+'.tmp',JSON.stringify(versions,null,2)+'\n');await fs.rename(output+'.tmp',output);console.log(JSON.stringify({output,versions:versions.length,created,reused,scopes:summary}));
