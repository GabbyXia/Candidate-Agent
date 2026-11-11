/* Official-proceedings API. No synthetic candidates, publication-index sampling,
   inferred student status, or publication-date graduation guesses. */
import { DOMAINS, CONFERENCES } from '../shared/catalog.js';
import { USENIX_CATALOG, fetchUsenixEdition, usenixEditionUrl } from './usenix.mjs';
import { NETWORKING_CATALOG, fetchNetworkingEdition, networkingEditionUrl } from './networking.mjs';
import { researchAcademicProfile } from './profile-research.mjs';
import { handleSourcePlanApi, collectWithSourcePlan } from './source-plan-api.mjs';
import { handleMappingRunApi } from './mapping-api.mjs';
const researchRate=new Map();
const academicResearchRate=new Map();
function profileResearchConfiguration(env){const missing=['OPENAI_API_KEY','OPENAI_RESEARCH_MODEL'].filter(key=>typeof env[key]!=='string'||!env[key].trim());return {configured:missing.length===0,missing,maxBatchSize:25,concurrency:1,fields:['currentAffiliation','currentStatus','researchInterests','degree','programStartYear','expectedGraduationYear']}}
function academicPilot(env){const data=env.ACADEMIC_RESEARCH_SNAPSHOT??(typeof ACADEMIC_RESEARCH_SNAPSHOT!=='undefined'?ACADEMIC_RESEARCH_SNAPSHOT:null);return data&&Array.isArray(data.profiles)?data:{profiles:[],selectionMethod:'No profile research has been collected.'}}
function attachAcademicPilot(collection,env){const now=Date.now(),maximumAge=30*86400000;const proposals=new Map(academicPilot(env).profiles.filter(p=>{const queried=Date.parse(p.queriedAt);return Number.isFinite(queried)&&queried<=now&&now-queried<=maximumAge}).map(p=>[p.candidateId,p]));for(const candidate of collection.candidates){if(proposals.has(candidate.id))candidate.academicResearch=proposals.get(candidate.id)}return collection}
function academicRateAllowed(request){const key=request.headers.get('oai-authenticated-user-id')||request.headers.get('cf-connecting-ip')||'local';const now=Date.now(),row=academicResearchRate.get(key);if(row&&now-row.time<60000){if(row.count>=20)return false;row.count++}else academicResearchRate.set(key,{time:now,count:1});return true}
function academicAnchors(candidate,papers){const byId=new Map(papers.map(p=>[p.id,p]));return {id:candidate.id,name:candidate.name,publishedAffiliation:candidate.affiliation,papers:candidate.paperIds.slice(0,5).map(id=>byId.get(id)).filter(Boolean).map(p=>({id:p.id,title:p.title,year:p.year,url:p.url,coauthors:p.authors.map(a=>a.name)}))}}
async function resolveAcademicCandidate(body,snapshot,env={}){
 let collection=researchCollection(snapshot.papers,snapshot.editions),candidate=collection.candidates.find(c=>c.id===body.candidateId);if(candidate)return academicAnchors(candidate,collection.papers);
 const anchor=body.paperIds?.[0];const parts=typeof anchor==='string'?anchor.match(/^(?:usenix|publisher):([a-z]+):(20\d\d):[a-zA-Z0-9-]+$/):null;if(!parts)return null;
 const id=parts[1],year=+parts[2];if(!CONFERENCES.some(c=>c.id===id)||(!env.DB||!env.BUCKET)&&CONFERENCES.find(c=>c.id===id)?.connectorStatus!=='ready'||year>new Date().getUTCFullYear())return null;
 const edition=await researchEdition(id,year,snapshot,true,env);collection=researchCollection(edition.papers,[edition.coverage]);candidate=collection.candidates.find(c=>c.id===body.candidateId);return candidate?academicAnchors(candidate,collection.papers):null;
}
function researchJson(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}})}
function researchNormalize(value){return String(value||'').normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim()}
function researchHash(value){let a=2166136261,b=2246822519;for(let i=0;i<value.length;i++){const code=value.charCodeAt(i);a=Math.imul(a^code,16777619);b=Math.imul(b^code,3266489917)}return (a>>>0).toString(16).padStart(8,'0')+(b>>>0).toString(16).padStart(8,'0')}
function researchSafeUrl(value){try{const u=new URL(value);return u.protocol==='https:'?u.href:null}catch{return null}}
function researchSnapshot(env){let data=env.SOURCE_SNAPSHOT??(typeof SOURCE_SNAPSHOT!=='undefined'?SOURCE_SNAPSHOT:null);if(typeof data==='string'){try{data=JSON.parse(data)}catch{data=null}}return {papers:Array.isArray(data?.papers)?data.papers:[],editions:Array.isArray(data?.editions)?data.editions:Array.isArray(data?.coverage)?data.coverage:[],warnings:Array.isArray(data?.warnings)?data.warnings:[],retrievedAt:data?.retrievedAt||null}}
function researchAllowed(request){const key=request.headers.get('oai-authenticated-user-id')||request.headers.get('cf-connecting-ip')||'local';const now=Date.now();if(researchRate.size>250){for(const [id,row]of researchRate)if(now-row.time>=60000)researchRate.delete(id);if(researchRate.size>250)researchRate.clear()}const row=researchRate.get(key);if(row&&now-row.time<60000){if(row.count>=4)return false;row.count++}else researchRate.set(key,{time:now,count:1});return true}
async function researchReadBody(request){if(!request.headers.get('content-type')?.includes('application/json'))throw Error('Send a JSON request.');if(Number(request.headers.get('content-length'))>16384)throw Error('Request is too large.');const raw=await request.text();if(raw.length>16384)throw Error('Request is too large.');let body;try{body=JSON.parse(raw)}catch{throw Error('Request must contain valid JSON.')}if(!body||typeof body!=='object'||Array.isArray(body))throw Error('Request must be a JSON object.');return body}
function researchKeywords(value){return [...new Set(String(value||'').split(/[,;\n]/).map(researchNormalize).filter(Boolean))].map(term=>({term,pattern:new RegExp('(^|[^\\p{L}\\p{N}_])'+term.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/\s+/g,'\\s+')+'(?=$|[^\\p{L}\\p{N}_])','iu')}))}
function researchBylineIdentity(value){return researchNormalize(String(value||'').replace(/Awarded (?:Best|Distinguished) Paper!?/gi,''))}
function researchTitleIdentity(value){return researchNormalize(value).replace(/[{}]/g,'')}
function researchPaperIdentity(paper){return `${paper.conferenceId}:${paper.year}:${paper.id}`}
function researchEditionKey(edition){return `${edition.conferenceId}:${edition.year}`}
function researchEditionState(edition,papers,snapshotDate){
  const names=USENIX_CATALOG[edition.conferenceId]||NETWORKING_CATALOG[edition.conferenceId];const status=edition.status||'complete';const listingPapers=edition.listingPapers??papers.length;
  const unavailable=['unavailable','unsupported','cached_after_source_failure'].includes(status);const discrepancy=edition.expectedPapers!=null&&edition.expectedPapers!==listingPapers;
  const collectionComplete=!unavailable&&!discrepancy&&listingPapers===papers.length&&edition.collectionComplete!==false&&edition.coverage!=='unknown';
  const detailVerified=papers.filter(p=>p.detailVerified).length;const missing=papers.filter(p=>p.metadataStatus==='publisher_listing_missing_citation').length;
  const authorsWithoutAffiliation=papers.reduce((n,p)=>n+(p.authors||[]).filter(a=>!a.affiliations?.length).length,0);
  return {...edition,completeness:discrepancy?`Publisher states ${edition.expectedPapers} accepted papers; the official listing provides ${listingPapers} parsed paper entries. Completeness remains unresolved.`:edition.completeness,conference:names?.name||edition.conference||edition.conferenceId,status,listingPapers,papersPublishedAfterDetailFilter:papers.length,detailVerified,detailCitationMetadataMissing:missing,detailMetadataPending:Math.max(0,papers.length-detailVerified-missing),authorsWithoutAffiliation,collectionComplete,metadataComplete:papers.length>0&&detailVerified===papers.length&&authorsWithoutAffiliation===0,partial:!collectionComplete,sourceRetrievedAt:edition.sourceRetrievedAt||edition.retrievedAt||snapshotDate||null};
}
function researchCollection(papers,editions,{keywords='',role='',snapshotDate=null,warnings=[]}={}){
  // Keep canonical papers once; every author occurrence stays attached to its paper.
  const unique=new Map();for(const p of papers){if(p?.id&&p.title&&Array.isArray(p.authors))unique.set(researchPaperIdentity(p),p)}papers=[...unique.values()];
  const phrases=researchKeywords(keywords),byAuthor=new Map();let occurrences=0,unresolvedAuthorOccurrences=0;
  for(const paper of papers){for(const [index,author]of paper.authors.entries()){
    const name=String(author?.name||'').trim();if(!name)continue;occurrences++;if(/^(?:anonymous(?:\s+authors?)?|unknown)$/i.test(name)){unresolvedAuthorOccurrences++;continue;}
    const affiliations=[...new Set((Array.isArray(author.affiliations)?author.affiliations:[]).map(a=>String(a).trim()).filter(Boolean))];
    const identity=researchNormalize(name)+'|'+(affiliations.length?affiliations.map(researchNormalize).sort().join('|'):`unmerged:${paper.id}:${index}`);const id='author:'+researchHash(identity);
    let c=byAuthor.get(id);if(!c){c={id,name,affiliation:affiliations.join('; ')||'Not published',affiliationLabel:affiliations.length?`Published affiliation · ${paper.year} · current status unverified`:`No affiliation in publisher metadata · ${paper.year}`,identityNote:affiliations.length?'Provisional identity: exact normalized name and publication affiliation. Namesakes can still match; changed affiliations may produce separate profiles.':'No published affiliation: this author occurrence is retained separately and is not merged across papers.',status:'Unknown',interests:[],interestsLabel:'Topics from collected publications; current research interests are not verified',gradYear:null,gradRange:null,confidence:'Unverified',fit:0,fitReason:'',paperIds:[],sources:[],profileUrl:researchSafeUrl(author.sourceUrl)||researchSafeUrl(paper.url),degree:null,startYear:null,verified:false,isSample:false,latestPublicationYear:paper.year};byAuthor.set(id,c)}
    if(paper.year>c.latestPublicationYear){c.latestPublicationYear=paper.year;c.affiliation=affiliations.join('; ')||'Not published';c.affiliationLabel=affiliations.length?`Published affiliation · ${paper.year} · current status unverified`:`No affiliation in publisher metadata · ${paper.year}`;c.profileUrl=researchSafeUrl(author.sourceUrl)||researchSafeUrl(paper.url)||c.profileUrl}
    if(!c.paperIds.includes(paper.id))c.paperIds.push(paper.id);
    const source=researchSafeUrl(author.sourceUrl)||researchSafeUrl(paper.url);if(source&&!c.sources.some(s=>s.url===source))c.sources.push({label:`${paper.conference} ${paper.year} · publisher author record`,url:source});
  }}
  const paperById=new Map(papers.map(p=>[p.id,p]));const candidates=[...byAuthor.values()];
  for(const c of candidates){const publications=c.paperIds.map(id=>paperById.get(id)).filter(Boolean);const content=publications.map(p=>p.title+' '+(p.section||'')).join('\n');const matched=phrases.filter(({pattern})=>pattern.test(content)).map(({term})=>term);c.fit=phrases.length?Math.round(matched.length/phrases.length*100):0;c.fitReason=phrases.length?`${matched.length} of ${phrases.length} supplied research phrases match complete words in collected paper titles or session labels. This lexical research alignment does not assess hiring suitability or availability.`:'No research keywords supplied; research fit has not been assessed.';c.interests=matched.length?matched:[...new Set(publications.map(p=>p.section).filter(Boolean))].slice(0,6);if(matched.length)c.interestsLabel='Matched research phrases in collected paper titles and session labels';}
  candidates.sort((a,b)=>b.fit-a.fit||b.paperIds.length-a.paperIds.length||a.name.localeCompare(b.name));
  const normalizedEditions=editions.map(e=>researchEditionState(e,papers.filter(p=>p.conferenceId===e.conferenceId&&p.year===e.year),snapshotDate));
  const years=normalizedEditions.map(e=>e.year);const collectionComplete=normalizedEditions.length>0&&normalizedEditions.every(e=>e.collectionComplete);const metadataComplete=normalizedEditions.length>0&&normalizedEditions.every(e=>e.metadataComplete);const dates=normalizedEditions.map(e=>e.sourceRetrievedAt).filter(d=>d&&!Number.isNaN(Date.parse(d))).sort();
  const notices=[...warnings];for(const e of normalizedEditions)if(e.expectedPapers!=null&&e.expectedPapers!==e.listingPapers)notices.push(`${e.conference} ${e.year}: publisher states ${e.expectedPapers} accepted papers, but the official listing provides ${e.listingPapers} parsed entries. No missing paper was invented.`);if(candidates.length)notices.push('Author identities are provisional matches of name and published affiliation. Published affiliations describe the paper year, not verified current employment or academic status.');notices.push('Degree status, program start year, and graduation remain unknown until supported by a current academic source. Paper dates are not used to guess graduation.');
  return {papers,candidates,coverage:{startYear:years.length?Math.min(...years):null,endYear:years.length?Math.max(...years):null,editions:normalizedEditions,papersImported:papers.length,authorOccurrences:occurrences,unresolvedAuthorOccurrences,candidatesReturned:candidates.length,collectionComplete,metadataComplete,partial:!collectionComplete,completenessLabel:collectionComplete?`All ${papers.length} collected papers retained from ${normalizedEditions.length} official conference editions. Published metadata and current profile verification are tracked separately.`:`${papers.length} papers collected across ${normalizedEditions.length} requested official editions. Edition completeness and source limits are reported explicitly; no substitute data was generated.`,retrievedAt:dates.at(-1)||snapshotDate||null,fitMethod:'Whole-word lexical matching of supplied research phrases in titles and session labels',aiUsed:false,role},warnings:[...new Set(notices)]};
}
function researchCachedEdition(snapshot,id,year){const papers=snapshot.papers.filter(p=>p.conferenceId===id&&p.year===year);const edition=snapshot.editions.find(e=>e.conferenceId===id&&e.year===year);return edition?{papers,coverage:edition}:papers.length?{papers,coverage:{conferenceId:id,year,listingPapers:papers.length,status:'complete',retrievedAt:snapshot.retrievedAt,completeness:'All records retained from the bundled official-publisher snapshot.'}}:null}
function researchUnsupported(id,year){return id==='atc'&&year>=2026}
function researchSourceUrl(id,year){try{return Object.hasOwn(USENIX_CATALOG,id)?usenixEditionUrl(id,year):networkingEditionUrl(id,year)}catch{return CONFERENCES.find(c=>c.id===id)?.sourcePages?.[year]||CONFERENCES.find(c=>c.id===id)?.url||null}}
async function researchEdition(id,year,snapshot,refresh,env={}){
  const cached=researchCachedEdition(snapshot,id,year),conference=CONFERENCES.find(c=>c.id===id);const sourceUrl=researchSourceUrl(id,year);
  if(env.DB&&env.BUCKET){
    const result=await collectWithSourcePlan({conferenceId:id,year,track:'main'},env,{refresh,allowDiscovery:false});
    if(result.papers?.length)return {papers:result.papers,coverage:{...result.coverage,sourcePlanStatus:result.status,cacheRetained:result.cacheRetained||false,lastAttempt:result.lastAttempt||null},warnings:[...(result.warnings||[]),...(result.discoveryError?[result.discoveryError]:[])]};
    return {papers:[],coverage:{conferenceId:id,conference:conference.name,year,sourceUrl,status:result.status==='plan_missing'?'source_discovery_required':result.status||'unavailable',listingPapers:0,collectionComplete:false,partial:true,sourceRetrievedAt:null,completeness:result.error||'No validated source plan is active. Resolve the official source in Source plans.'},warnings:[result.error||`${conference.name} ${year}: a validated source plan is required before collection.`]};
  }
  if(researchUnsupported(id,year))return {papers:[],coverage:{conferenceId:id,conference:conference.name,year,sourceUrl,status:'unsupported',listingPapers:0,completeness:'ATC moved from USENIX to ACM SIGOPS in 2026. The ACM source is mapped; its parser is not implemented.'},warnings:[`ATC ${year}: source migration requires an ACM SIGOPS parser; no USENIX edition was fabricated.`]};
  if(cached&&!refresh)return {...cached,warnings:[]};
  const attemptTime=new Date().toISOString();let result;
  try{result=Object.hasOwn(USENIX_CATALOG,id)?await fetchUsenixEdition(id,year,{details:false}):await fetchNetworkingEdition(id,year,{timeoutMs:10000});if(!result.papers.length||result.coverage.status==='unavailable')throw Error('Official listing did not provide accepted-paper records.');}
  catch{
    if(cached?.papers.length)return {papers:cached.papers,coverage:{...cached.coverage,status:'cached_after_source_failure',refreshAttemptAt:attemptTime,sourceRetrievedAt:cached.coverage.sourceRetrievedAt||cached.coverage.retrievedAt||snapshot.retrievedAt,completeness:'Official refresh failed. The dated publisher snapshot is shown; no new records were generated.'},warnings:[`${conference.name} ${year}: official refresh failed; retained the dated publisher snapshot.`]};
    return {papers:[],coverage:{conferenceId:id,conference:conference.name,year,sourceUrl,status:'unavailable',listingPapers:0,sourceRetrievedAt:null,retrievedAt:null,refreshAttemptAt:attemptTime,completeness:'Official source unavailable. No paper or author records were generated.'},warnings:[`${conference.name} ${year}: official source unavailable; no substitute records were generated.`]};
  }
  const checkedById=new Map((cached?.papers||[]).map(p=>[p.id,p]));let reused=0;
  result.papers=result.papers.map(p=>{const old=checkedById.get(p.id);if(!old||old.url!==p.url||researchTitleIdentity(old.title)!==researchTitleIdentity(p.title)||researchBylineIdentity(old.rawByline)!==researchBylineIdentity(p.rawByline))return p;
    if(old.detailVerified){reused++;return {...p,authors:old.authors,pdfUrl:old.pdfUrl||p.pdfUrl,abstractSnippet:p.abstractSnippet||old.abstractSnippet,metadataSource:old.metadataSource,metadataStatus:old.metadataStatus,detailVerified:true,metadataReusedFromSnapshot:true,detailMetadataRetrievedAt:old.detailMetadataRetrievedAt||snapshot.retrievedAt};}
    if(old.metadataStatus==='publisher_listing_missing_citation')return {...p,metadataStatus:old.metadataStatus,detailChecked:true,detailMetadataRetrievedAt:snapshot.retrievedAt};return p;
  });
  result.coverage={...result.coverage,status:'refreshed_official_listing',refreshAttemptAt:attemptTime,sourceRetrievedAt:result.coverage.retrievedAt||attemptTime,cachedCitationRecordsReused:reused,completeness:'The full official listing was refreshed. Exact id, URL, title and author-byline matches reuse checked publisher citation metadata; remaining paper details are not individually verified.'};
  return result;
}
export async function handleApi(request,env={}){
  const path=new URL(request.url).pathname;if(!path.startsWith('/api/'))return null;
  const mappingResponse=await handleMappingRunApi(request,env,{normalizeCollection:(papers,editions,options)=>attachAcademicPilot(researchCollection(papers,editions,options),env)});if(mappingResponse)return mappingResponse;
  const sourcePlanResponse=await handleSourcePlanApi(request,env,{normalizeCollection:(papers,editions,options)=>attachAcademicPilot(researchCollection(papers,editions,options),env)});if(sourcePlanResponse)return sourcePlanResponse;
  if(path==='/api/catalog'&&request.method==='GET')return researchJson({domains:DOMAINS,conferences:CONFERENCES});
  if(path==='/api/status'&&request.method==='GET'){const configuration=profileResearchConfiguration(env);return researchJson({aiConfigured:configuration.configured,aiStatus:configuration.configured?'configured_unverified':'connection_required',profileResearch:configuration,sources:CONFERENCES.filter(c=>c.connectorStatus==='ready').map(c=>({name:c.name,id:c.id,status:'official_adapter',url:c.url})),message:configuration.configured?'Academic profile research is configured. Every finding requires source review.':'Official proceedings collection is active. Academic profile research needs a server model connection.'})}
  if(path==='/api/profile-research/status'&&request.method==='GET')return researchJson(profileResearchConfiguration(env));
  if(path==='/api/profile-research/pilot'&&request.method==='GET')return researchJson(academicPilot(env));
  if(path==='/api/enrich'&&request.method==='POST'){
    if(!profileResearchConfiguration(env).configured)return researchJson({ok:false,status:'connection_required',error:'Academic profile agents need the OpenAI Developers connection and server-side OPENAI_API_KEY plus OPENAI_RESEARCH_MODEL. No model request was made.',code:'AI_CONNECTION_REQUIRED'},503);
    if(!academicRateAllowed(request))return researchJson({ok:false,status:'failed',error:'Please wait a minute before another academic profile request.'},429);
    let body;try{body=await researchReadBody(request)}catch(e){return researchJson({ok:false,status:'failed',error:e.message},400)}
    if(Object.keys(body).some(k=>!['candidateId','paperIds'].includes(k))||typeof body.candidateId!=='string'||!/^author:[a-f0-9]{16}$/.test(body.candidateId)||(body.paperIds!=null&&(!Array.isArray(body.paperIds)||body.paperIds.length>3||body.paperIds.some(p=>typeof p!=='string'||p.length>200))))return researchJson({ok:false,status:'failed',error:'Send a canonical candidate ID and up to three official paper IDs.'},400);
    const candidate=await resolveAcademicCandidate(body,researchSnapshot(env),env);if(!candidate)return researchJson({ok:false,status:'needs_review',error:'The author could not be resolved against official paper records. Refresh the source collection and review identity before retrying.'},404);
    const result=await researchAcademicProfile(candidate,env);return researchJson(result,result.httpStatus|| (result.ok?200:502));
  }
  const snapshot=researchSnapshot(env);
  if(path==='/api/bootstrap'&&request.method==='GET'){
    if(!snapshot.papers.length)return researchJson({error:'The official publisher snapshot is not available in this deployment.'},503);
    return researchJson(attachAcademicPilot(researchCollection(snapshot.papers,snapshot.editions,{keywords:'network, networking, congestion, routing, transport, datacenter',role:'Network & Distributed Systems Researcher',snapshotDate:snapshot.retrievedAt,warnings:snapshot.warnings}),env));
  }
  if(path!=='/api/research'||request.method!=='POST')return researchJson({error:'API route not found.'},404);
  if(!researchAllowed(request))return researchJson({error:'Please wait a minute before starting another research run.'},429);
  let body;try{body=await researchReadBody(request)}catch(e){return researchJson({error:e.message},400)}
  const startYear=Number(body.startYear),endYear=Number(body.endYear),currentYear=new Date().getUTCFullYear();const ids=Array.isArray(body.conferences)?[...new Set(body.conferences)]:[];
  if(!Number.isInteger(startYear)||!Number.isInteger(endYear)||startYear<2000||endYear>currentYear||endYear<startYear||endYear-startYear>2)return researchJson({error:'Choose one to three publication years ending no later than the current year.'},400);
  if(!ids.length||ids.length>8||ids.some(id=>typeof id!=='string'))return researchJson({error:'Select one to eight conferences.'},400);
  const unsupported=ids.filter(id=>!CONFERENCES.some(c=>c.id===id)||(!env.DB||!env.BUCKET)&&CONFERENCES.find(c=>c.id===id)?.connectorStatus!=='ready');if(unsupported.length)return researchJson({error:'An official source adapter is not connected for: '+unsupported.map(id=>CONFERENCES.find(c=>c.id===id)?.name||id).join(', ')+'. Resolve and validate its source in Source plans before collection.',code:'SOURCE_NOT_CONNECTED'},400);
  if(body.domain!=null&&!DOMAINS.some(d=>d.id===body.domain))return researchJson({error:'Choose a supported research domain.'},400);
  if(typeof body.keywords!=='string'||body.keywords.length>500||(body.role!=null&&(typeof body.role!=='string'||body.role.length>200)))return researchJson({error:'Provide research keywords up to 500 characters and a role up to 200 characters.'},400);
  if(body.refresh!=null&&typeof body.refresh!=='boolean')return researchJson({error:'Refresh must be true or false.'},400);
  const requests=[];for(const id of ids)for(let year=startYear;year<=endYear;year++)requests.push({id,year});const results=[];
  // At most24 publisher requests, four at once, each source timeout at most10s.
  for(let offset=0;offset<requests.length;offset+=4)results.push(...await Promise.all(requests.slice(offset,offset+4).map(({id,year})=>researchEdition(id,year,snapshot,body.refresh===true,env))));
  const papers=results.flatMap(r=>r.papers);const editions=results.map(r=>r.coverage);const warnings=results.flatMap(r=>r.warnings||[]);
  const response=attachAcademicPilot(researchCollection(papers,editions,{keywords:body.keywords,role:body.role||'',snapshotDate:snapshot.retrievedAt,warnings}),env);response.coverage.startYear=startYear;response.coverage.endYear=endYear;response.coverage.domain=body.domain||null;return researchJson(response);
}
