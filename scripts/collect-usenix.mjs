#!/usr/bin/env node
/* Collect every paper on selected official publisher listings. Reruns reuse
   public-HTML cache in /private/tmp; data contains no scraped email addresses. */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fetchUsenixEdition } from '../worker/usenix.mjs';
const flags=Object.fromEntries(process.argv.slice(2).map(arg=>{const [key,...value]=arg.replace(/^--/,'').split('=');return [key,value.join('=')]}));
const conferences=(flags.conferences||'osdi,nsdi').split(',');
const years=(flags.years||'2024,2025,2026').split(',').map(Number);
const cacheDir=flags.cache||'/private/tmp/talent-atlas-usenix-cache';
const listingCache=flags['listing-cache'];
const output=path.resolve(flags.output||'data/usenix.json');
await fs.mkdir(cacheDir,{recursive:true});await fs.mkdir(path.dirname(output),{recursive:true});
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let network=0,cacheHits=0;const origins=new Map();
async function cachedFetch(url,opts={}){
  const u=new URL(url);if(u.protocol!=='https:'||u.hostname!=='www.usenix.org')throw new Error('Only the official USENIX publisher is supported.');
  const filename=path.join(cacheDir,crypto.createHash('sha256').update(url).digest('hex')+'.html');
  try{const text=await fs.readFile(filename,'utf8');cacheHits++;return new Response(text,{headers:{'content-type':'text/html'}})}catch{}
  if(listingCache&&u.pathname.endsWith('/technical-sessions')){
    const slug=u.pathname.split('/')[2];try{const text=await fs.readFile(path.join(listingCache,slug+'.html'),'utf8');if(!text.includes('node-paper'))throw Error('Empty listing');await fs.writeFile(filename,text);cacheHits++;return new Response(text,{headers:{'content-type':'text/html'}})}catch{}
  }
  let last;
  for(let attempt=0;attempt<3;attempt++){
    await wait(180+attempt*700);
    try{network++;const response=await fetch(url,{...opts,headers:{Accept:'text/html','User-Agent':'TalentAtlas/1.0 public academic metadata research'}});
      if(response.status===429||response.status>=500){last=Error('Publisher temporarily unavailable ('+response.status+')');continue}
      if(!response.ok)return response;
      const text=await response.text();if(!/<html\b|<!doctype html/i.test(text))throw Error('Unexpected publisher response');
      await fs.writeFile(filename,text);origins.set(url,new Date().toISOString());return new Response(text,{headers:{'content-type':'text/html'}});
    }catch(error){last=error;if(opts.signal?.aborted)break}
  }
  throw last||Error('Source unavailable');
}
const snapshot={schemaVersion:1,source:'Official USENIX technical-session listings and publisher citation metadata',isSample:false,window:{startYear:Math.min(...years),endYear:Math.max(...years)},retrievedAt:new Date().toISOString(),papers:[],coverage:[],warnings:[],methodology:{collection:'Every research-paper entry on each selected official technical-session listing is attempted; no paper or author page cap.',affiliations:'Affiliations as published for the paper year. These do not verify current affiliation or employment.',identity:'Author occurrences are preserved per paper. Any cross-paper name and affiliation matching remains provisional.',graduation:'Current degree, program start date, and expected graduation are unknown unless separately verified from current public academic evidence.',abstracts:'At most 300 characters of publisher description are retained per paper.',emails:'No citation_author_email metadata is retained.'}};
for(const conf of conferences)for(const year of years){
  console.log('Collecting '+conf.toUpperCase()+' '+year+'…');let progressAt=0;
  try{const edition=await fetchUsenixEdition(conf,year,{details:true,fetcher:cachedFetch,concurrency:3,onProgress:({completed,total})=>{if(completed-progressAt>=25||completed===total){console.log('  '+completed+'/'+total+' detail pages');progressAt=completed}}});
    snapshot.papers.push(...edition.papers);snapshot.coverage.push(edition.coverage);snapshot.warnings.push(...edition.warnings);
    console.log('  verified='+edition.coverage.detailVerified+' unavailable='+edition.coverage.detailUnavailable+' excluded='+edition.coverage.excludedByCitationMetadata);
  }catch(error){snapshot.coverage.push({conferenceId:conf,year,status:'unavailable',error:error.message});snapshot.warnings.push(conf+' '+year+' listing could not be collected.');console.error(conf,year,error.message)}
  snapshot.retrievedAt=new Date().toISOString();snapshot.totalPapers=snapshot.papers.length;snapshot.authorOccurrences=snapshot.papers.reduce((n,p)=>n+p.authors.length,0);snapshot.detailVerified=snapshot.papers.filter(p=>p.detailVerified).length;
  const temp=output+'.tmp';await fs.writeFile(temp,JSON.stringify(snapshot));await fs.rename(temp,output);
}
snapshot.collectionComplete=snapshot.coverage.every(c=>c.detailUnavailable===0&&c.listingPapers===c.papersPublishedAfterDetailFilter);
snapshot.metadataComplete=snapshot.detailVerified===snapshot.totalPapers;
snapshot.unknownAuthorAffiliations=snapshot.papers.flatMap(p=>p.authors).filter(a=>!a.affiliations.length).length;
snapshot.unknownCurrentStatus=snapshot.authorOccurrences;snapshot.unknownGraduationYear=snapshot.authorOccurrences;
snapshot.networkRequests=network;snapshot.cacheHits=cacheHits;await fs.writeFile(output,JSON.stringify(snapshot));
console.log(JSON.stringify({output,papers:snapshot.totalPapers,authorOccurrences:snapshot.authorOccurrences,detailVerified:snapshot.detailVerified,collectionComplete:snapshot.collectionComplete,networkRequests:network,cacheHits}));
