import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeUsenixEntities,parseUsenixListing,parseUsenixDetail,usenixEditionUrl,fetchUsenixEdition} from '../worker/usenix.mjs';
const title='Basilisk: Using Provenance Invariants to Automate Proofs of Undecidable Protocols';
const url='https://www.usenix.org/conference/osdi25/presentation/zhang-tony';
const article=`<article class="node node-paper"><h2><a href="/conference/osdi25/presentation/zhang-tony">${title}</a></h2><div class="field-name-field-paper-people-text"><div><p>Tony Nuda Zhang and Keshav Singh, <em>University of Michigan;</em> Tej Chajed, <em>University of Wisconsin-Madison;</em> Bryan Parno, <em>Carnegie Mellon University</em></p></div></div><div class="field-name-field-paper-description-long"><p>Distributed protocols are challenging to design correctly.</p></div><div><article class="node node-speaker"><h2>Tony Nuda Zhang</h2></article></div></article>`;
const listing=`<!doctype html><html><article class="node node-session"><h2>Distributed Systems and Data Centers I</h2>${article}</article></html>`;
const detail=`<!doctype html><html><head><meta name="citation_title" content="${title}"><meta name="citation_author" content="Tony Nuda Zhang"><meta name="citation_author_institution" content="University of Michigan"><meta name="citation_author_email" content="not-retained@example.com"><meta name="citation_author" content="Tej Chajed"><meta name="citation_author_institution" content="University of Wisconsin-Madison"><meta name="citation_publication_date" content="2025"><meta name="citation_pdf_url" content="https://www.usenix.org/system/files/osdi25-zhang-tony.pdf"></head><body>${article}</body></html>`;

test('decodes publisher entities and validates official edition identifiers',()=>{
  assert.equal(decodeUsenixEntities('A &amp; B &#x2014; &#233; &uuml;'),'A & B — é ü');
  assert.equal(usenixEditionUrl('nsdi',2026),'https://www.usenix.org/conference/nsdi26/technical-sessions');assert.equal(usenixEditionUrl('security',2026),'https://www.usenix.org/conference/usenixsecurity26/technical-sessions');
  assert.throws(()=>usenixEditionUrl('other',2025));assert.throws(()=>usenixEditionUrl('osdi',1800));assert.throws(()=>usenixEditionUrl('atc',2026),/ACM SIGOPS/);
});

test('parses nested listing articles, research bylines and session labels without truncation',()=>{
  const result=parseUsenixListing(listing,'osdi',2025);
  assert.equal(result.papers.length,1);const p=result.papers[0];assert.equal(p.title,title);assert.equal(p.url,url);assert.equal(p.section,'Distributed Systems and Data Centers I');assert.equal(p.authors.length,4);
  assert.deepEqual(p.authors[0].affiliations,['University of Michigan']);assert.deepEqual(p.authors[1].affiliations,['University of Michigan']);assert.deepEqual(p.authors[2].affiliations,['University of Wisconsin-Madison']);
  assert.equal(p.detailVerified,false);assert.equal(result.coverage.discoveredPresentationLinks,1);
});

test('deduplicates publisher links and excludes foreign-conference and non-paper entries',()=>{
  const keynote='<article class="node node-paper"><h2><a href="/conference/osdi25/presentation/keynote">Keynote</a></h2><div class="field-name-field-presented-by">Speaker</div></article>';
  const foreign=article.replaceAll('/conference/osdi25/','/conference/atc25/');
  const result=parseUsenixListing('<html>'+article+article+keynote+foreign+'</html>','osdi',2025);
  assert.equal(result.papers.length,1);assert.equal(result.coverage.discoveredPresentationLinks,3);assert.equal(result.coverage.discoveredUniquePresentationLinks,2);assert.equal(result.coverage.excludedNonPaperEntries,1);
});

test('pairs ordered author and institution citation metadata and omits emails',()=>{
  const parsed=parseUsenixDetail(detail,'osdi',2025,url);assert.equal(parsed.reason,null);assert.equal(parsed.paper.detailVerified,true);assert.equal(parsed.paper.authors.length,2);
  assert.equal(parsed.paper.authors[0].name,'Tony Nuda Zhang');assert.deepEqual(parsed.paper.authors[0].affiliations,['University of Michigan']);assert.deepEqual(parsed.paper.authors[1].affiliations,['University of Wisconsin-Madison']);assert.equal(parsed.paper.pdfUrl,'https://www.usenix.org/system/files/osdi25-zhang-tony.pdf');assert.ok(!JSON.stringify(parsed).includes('not-retained@example.com'));
});

test('does not invent institution or author metadata for citation gaps',()=>{
  const missing=detail.replace('<meta name="citation_author_institution" content="University of Michigan">','');const parsed=parseUsenixDetail(missing,'osdi',2025,url);
  assert.deepEqual(parsed.paper.authors[0].affiliations,[]);assert.deepEqual(parsed.paper.authors[1].affiliations,['University of Wisconsin-Madison']);
  assert.equal(parseUsenixDetail('<html>Nonpaper talk</html>','osdi',2025,url).paper,null);
  assert.equal(parseUsenixDetail(detail.replace('content="2025"','content="2024"'),'osdi',2025,url).paper,null);
});

test('full edition collection attempts every discovered paper without a first-page cap',async()=>{
  const all='<html>'+Array.from({length:175},(_,i)=>article.replaceAll('zhang-tony','zhang-tony-'+i)).join('')+'</html>';let detailCalls=0;
  const fetcher=async(source)=>{if(source.endsWith('/technical-sessions'))return new Response(all);detailCalls++;return new Response(detail)};
  const result=await fetchUsenixEdition('osdi',2025,{details:true,fetcher});assert.equal(result.papers.length,175);assert.equal(detailCalls,175);assert.equal(result.coverage.detailVerified,175);assert.equal(result.coverage.papersPublishedAfterDetailFilter,175);assert.equal(result.coverage.detailMetadataStatus,'complete');assert.equal(result.coverage.detailUnavailable,0);
});

test('retains official listing byline evidence when a detail page is unavailable',async()=>{
  const fetcher=async(source)=>source.endsWith('/technical-sessions')?new Response(listing):new Response('temporarily unavailable',{status:503});
  const result=await fetchUsenixEdition('osdi',2025,{details:true,fetcher});assert.equal(result.papers.length,1);assert.equal(result.papers[0].detailVerified,false);assert.equal(result.coverage.detailUnavailable,1);assert.ok(result.warnings.some(w=>w.includes('unavailable')));
});

test('listing-only live refresh uses one publisher request and returns every paper',async()=>{
  let calls=0;const result=await fetchUsenixEdition('osdi',2025,{fetcher:async()=>{calls++;return new Response(listing)}});assert.equal(calls,1);assert.equal(result.papers.length,1);assert.equal(result.coverage.detailVerified,0);assert.equal(result.coverage.detailMetadataStatus,'pending');
});

test('missing citation metadata never silently removes an official research paper',async()=>{
  const fetcher=async(source)=>source.endsWith('/technical-sessions')?new Response(listing):new Response('<html>'+article+'</html>');
  const result=await fetchUsenixEdition('osdi',2025,{details:true,fetcher});assert.equal(result.papers.length,1);assert.equal(result.coverage.detailVerified,0);assert.equal(result.coverage.detailCitationMetadataMissing,1);assert.equal(result.coverage.excludedByCitationMetadata,0);assert.equal(result.papers[0].metadataStatus,'publisher_listing_missing_citation');assert.equal(result.papers[0].authors.length,4);
});

test('historical Test-of-Time discussions are excluded from the current accepted-paper edition',()=>{
  const historical='<html><article class="node node-paper"><h2><a href="/conference/usenixsecurity26/presentation/tot-discussion">Stealing Machine Learning Models via Prediction APIs</a></h2><div class="field-name-field-paper-people-text">Originally presented at USENIX Security16. Read the paper.</div></article></html>';
  const result=parseUsenixListing(historical,'security',2026);assert.equal(result.papers.length,0);assert.equal(result.coverage.excludedNonPaperEntries,1);
});
