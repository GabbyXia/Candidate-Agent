#!/usr/bin/env node
/* Offline verification never converts missing publisher data into a fact. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DOMAINS, CONFERENCES } from '../shared/catalog.js';
import { usenixEditionUrl } from '../worker/usenix.mjs';
import { networkingEditionSources } from '../worker/networking.mjs';

const root=new URL('../',import.meta.url);
const allowedHosts=new Set(['www.usenix.org','conferences.sigcomm.org','conferences2.sigcomm.org','dl.acm.org']);
const records=await Promise.all(['usenix','networking'].map(async name=>[name,JSON.parse(await readFile(new URL('data/'+name+'.json',root),'utf8'))]));
const paperIds=new Set(),canonicalPaperUrls=new Set(),editionIds=new Set();
const report={ok:true,offline:true,catalog:{domains:DOMAINS.length,venues:CONFERENCES.length,implementedAdapters:CONFERENCES.filter(c=>c.connectorStatus==='ready').length},papers:0,authorOccurrences:0,unknownPublisherAffiliations:0,usenixCitationVerified:0,usenixCitationMetadataMissing:0,editionCount:0,editions:[],discrepancies:[],limits:{paperCap:null,candidateCap:null,storedCountsMatchCoverage:true},snapshots:[]};
function officialUrl(value,label){
  assert.equal(typeof value,'string',label+': URL missing');const url=new URL(value);
  assert.equal(url.protocol,'https:',label+': only HTTPS is allowed');assert.ok(allowedHosts.has(url.hostname),label+': unrecognized publisher host '+url.hostname);assert.equal(url.username+url.password,'',label+': credentials in URL');return url;
}
function unknown(value){return value==null||value===''||/^(?:unknown|unverified|not verified|not assessed)$/i.test(String(value))}
function noAcademicFiction(record,label){
  assert.notEqual(record.isSample,true,label+': sample record found');
  for(const field of ['currentAffiliation','currentStatus','degree','startYear','gradYear','graduationYear','expectedGraduationYear','graduationDate'])if(Object.hasOwn(record,field))assert.ok(unknown(record[field]),label+': unsupported academic field '+field);
}
for(const [kind,snapshot] of records){
  assert.equal(snapshot.isSample,false,kind+': snapshot must explicitly identify real source data');assert.equal(snapshot.schemaVersion,1,kind+': unsupported schema');assert.ok(Array.isArray(snapshot.papers)&&Array.isArray(snapshot.coverage),kind+': papers/coverage arrays required');assert.ok(Number.isFinite(Date.parse(snapshot.retrievedAt)),kind+': retrieval timestamp required');
  const authors=snapshot.papers.reduce((sum,p)=>sum+p.authors.length,0);
  assert.equal(snapshot.totalPapers,snapshot.papers.length,kind+': paper summary differs from records');assert.equal(snapshot.authorOccurrences,authors,kind+': author summary differs from records');assert.equal(snapshot.unknownCurrentStatus,authors,kind+': current status must remain unknown');assert.equal(snapshot.unknownGraduationYear,authors,kind+': graduation must remain unknown');
  let affiliationUnknown=0;
  for(const paper of snapshot.papers){
    assert.ok(paper.id&&!paperIds.has(paper.id),kind+': duplicate or missing paper ID '+paper.id);paperIds.add(paper.id);
    assert.ok(paper.title?.trim()&&paper.rawByline?.trim(),paper.id+': title/byline missing');assert.ok(Array.isArray(paper.authors)&&paper.authors.length,paper.id+': author list missing');assert.ok(Number.isInteger(paper.year)&&paper.year>=snapshot.window.startYear&&paper.year<=snapshot.window.endYear,paper.id+': outside declared window');noAcademicFiction(paper,paper.id);
    const source=officialUrl(paper.sourceUrl,paper.id+' source'),url=officialUrl(paper.url,paper.id+' paper');assert.equal(source.hash,'',paper.id+': invented source fragment');assert.equal(url.hash,'',paper.id+': invented paper fragment');if(paper.pdfUrl)officialUrl(paper.pdfUrl,paper.id+' PDF');
    // Listing URLs are legitimately shared. Only individual presentation/DOI
    // URLs serve as canonical-paper uniqueness keys.
    if(/\/presentation\//.test(url.pathname)||url.hostname==='dl.acm.org'&&/^\/doi\/10\./.test(url.pathname)){
      const canonical=url.origin+url.pathname;assert.ok(!canonicalPaperUrls.has(canonical),'Duplicate canonical paper URL: '+canonical);canonicalPaperUrls.add(canonical);
    }
    if(kind==='usenix')assert.equal(url.hostname,'www.usenix.org',paper.id+': non-USENIX paper URL');
    for(const author of paper.authors){
      assert.ok(typeof author.name==='string'&&author.name.trim(),paper.id+': missing author name');assert.ok(Array.isArray(author.affiliations)&&author.affiliations.every(a=>typeof a==='string'&&a.trim()),paper.id+': invalid affiliations');assert.equal(author.affiliationYear,paper.year,paper.id+': affiliation year mismatch');officialUrl(author.sourceUrl,paper.id+' author');assert.ok(['publisher_citation_metadata','publisher_byline','publisher_author_listing'].includes(author.evidence),paper.id+': unrecognized author evidence');noAcademicFiction(author,paper.id+' author');if(!author.affiliations.length)affiliationUnknown++;
    }
  }
  assert.equal(snapshot.unknownAuthorAffiliations,affiliationUnknown,kind+': unknown affiliation summary differs from records');
  for(const edition of snapshot.coverage){
    const key=edition.conferenceId+':'+edition.year;assert.ok(!editionIds.has(key),'Duplicate coverage edition '+key);editionIds.add(key);officialUrl(edition.sourceUrl,key+' listing');assert.ok(Number.isFinite(Date.parse(edition.retrievedAt)),key+': retrieval timestamp missing');
    const papers=snapshot.papers.filter(p=>p.conferenceId===edition.conferenceId&&p.year===edition.year),paperAuthors=papers.flatMap(p=>p.authors),excluded=edition.excludedByCitationMetadata||0;
    assert.equal(edition.listingPapers,papers.length+excluded,key+': records do not account for listing count');assert.equal(edition.authorsWithoutAffiliation,paperAuthors.filter(a=>!a.affiliations.length).length,key+': affiliation count inconsistent');
    let verified=0,metadataMissing=0;
    if(kind==='usenix'){
      assert.equal(edition.sourceUrl,usenixEditionUrl(edition.conferenceId,edition.year),key+': unexpected official source');verified=papers.filter(p=>p.detailVerified===true).length;metadataMissing=papers.filter(p=>p.metadataStatus==='publisher_listing_missing_citation').length;const unavailable=edition.detailUnavailable||0;
      assert.equal(edition.detailVerified,verified,key+': verified-detail count inconsistent');assert.equal(edition.detailCitationMetadataMissing||0,metadataMissing,key+': missing citation metadata unaccounted');assert.equal(edition.listingPapers,verified+metadataMissing+unavailable+excluded,key+': detail outcomes do not account for every listed paper');assert.equal(edition.detailChecked,verified+metadataMissing+excluded,key+': checked-detail count inconsistent');assert.equal(papers.filter(p=>!p.detailVerified).length,metadataMissing+unavailable,key+': retained detail gaps are not tagged');report.usenixCitationVerified+=verified;report.usenixCitationMetadataMissing+=metadataMissing;
    }else{
      assert.ok(networkingEditionSources(edition.conferenceId,edition.year).includes(edition.sourceUrl),key+': unexpected networking source');assert.equal(edition.parsedEntries-(edition.duplicatesRemoved||0),papers.length,key+': parsed entries do not account for records');assert.equal(edition.detailVerified,0,key+': listing adapter cannot claim verified detail metadata');
    }
    const expected=edition.expectedPapers??null;
    if(expected!==null&&expected!==papers.length){assert.ok(snapshot.warnings.some(w=>w.includes(String(expected))&&w.includes(String(papers.length))),key+': publisher discrepancy is not disclosed');report.discrepancies.push({edition:key,expectedPapers:expected,listedPapers:papers.length,sourceUrl:edition.sourceUrl})}
    report.editions.push({id:key,papers:papers.length,authorOccurrences:paperAuthors.length,expectedPapers:expected,citationVerified:verified,citationMetadataMissing:metadataMissing,sourceType:edition.sourceType||'official_technical_sessions',sourceUrl:edition.sourceUrl});
  }
  assert.equal(snapshot.papers.filter(p=>!snapshot.coverage.some(c=>c.conferenceId===p.conferenceId&&c.year===p.year)).length,0,kind+': paper without edition coverage');
  if(kind==='networking'&&report.discrepancies.length)assert.equal(snapshot.collectionComplete,false,'Publisher discrepancy must prevent a complete-census claim');
  report.papers+=snapshot.papers.length;report.authorOccurrences+=authors;report.unknownPublisherAffiliations+=affiliationUnknown;report.snapshots.push({id:kind,papers:snapshot.papers.length,authorOccurrences:authors,editions:snapshot.coverage.length,retrievedAt:snapshot.retrievedAt,collectionComplete:snapshot.collectionComplete});
}
report.editionCount=editionIds.size;report.uniquePaperIds=paperIds.size;report.uniqueIndividualPaperUrls=canonicalPaperUrls.size;console.log(JSON.stringify(report));
