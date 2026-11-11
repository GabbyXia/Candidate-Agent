import {currentProgramFacts} from '../shared/current-program.js';

const FIELDS=['currentAffiliation','currentStatus','researchInterests','degree','programStartYear'];
const ROLES=new Set(['PhD student','PhD candidate',"Master's student",'Master’s student','Undergraduate student','Postdoctoral researcher','Postdoc','Researcher','Faculty','Professor','Assistant professor','Associate professor','Industry researcher','Research engineer','Engineer','Graduated','Other academic role','Other']);
const CONFIDENCE=new Set(['high','medium','low','unknown']);
const unknown=()=>({value:null,sourceIds:[],asOf:null,confidence:'unknown',basis:'unknown'});
const unique=value=>[...new Set(Array.isArray(value)?value:[])];
function fail(message){throw Error('Academic publication: '+message);}
function text(value,max){return typeof value==='string'&&value.length<=max&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)&&!/(?:sk[-_]|gw[-_])[A-Za-z0-9_-]{16,}|Bearer\s/i.test(value);}
function date(value){return value===null||typeof value==='string'&&Number.isFinite(Date.parse(value));}
function sourceUrl(value){try{if(!text(value,4000))return null;const u=new URL(value),h=u.hostname;if(u.protocol!=='https:'||u.username||u.password||u.port||!h.includes('.')||h.includes(':')||/^[\d.]+$/.test(h)||/\.(?:localhost|local|internal|invalid|test|onion)$/.test(h)||[...u.searchParams.keys()].some(key=>/^(?:api[_-]?key|token|access[_-]?token|authorization|password|signature|x-amz-.+|x-goog-.+)$/i.test(key)))return null;if(u.searchParams.has('key')&&!/publications|bibtexbrowser/i.test(u.pathname))return null;return u.href;}catch{return null;}}

/** A public projection: only cited academic fields and their provenance survive. */
export function projectAcademicResearch(candidateId,paperIds,input){
 if(!text(candidateId,160)||!candidateId||!Array.isArray(paperIds)||!paperIds.length||paperIds.some(id=>!text(id,240)))fail('author and publication anchors are required.');
 if(!input||input.candidateId!==candidateId||!date(input.queriedAt)||input.queriedAt===null)fail('research must identify the same author and its original query date.');
 const sources=[],sourceIds=new Set(),budgets=new Map();
 for(const s of input.sources||[]){
  const url=sourceUrl(s?.url),quote=s?.evidenceExcerpt;
  if(!text(s?.id,160)||!s.id||sourceIds.has(s.id)||!url||!text(s.title,400)||!date(s.sourceDate??null)||!text(quote,4000)||!quote.trim())fail('citation metadata is invalid.');
  const words=quote.trim().split(/\s+/).length,total=(budgets.get(url)||0)+words;if(total>25)fail('source excerpts exceed the per-profile URL limit.');budgets.set(url,total);sourceIds.add(s.id);
  sources.push({id:s.id,url,title:s.title,sourceDate:s.sourceDate??null,evidenceExcerpt:quote});
 }
 const identity=input.identity||{},matchedPaperIds=unique(identity.matchedPaperIds),citations=unique(identity.sourceIds);
 if(!['matched','ambiguous','unresolved'].includes(identity.status)||!CONFIDENCE.has(identity.confidence)||matchedPaperIds.some(id=>!paperIds.includes(id))||citations.some(id=>!sourceIds.has(id)))fail('identity provenance is invalid.');
 if(identity.status==='matched'&&(!matchedPaperIds.length||!citations.length||identity.confidence==='unknown'))fail('matched identity needs cited publication anchors.');
 const academic={};
 for(const name of FIELDS){
  const f=input.academic?.[name];if(identity.status!=='matched'||f?.value===null||f?.value===undefined){academic[name]=unknown();continue;}
  const ids=unique(f.sourceIds);if(f.basis!=='source_stated'||!CONFIDENCE.has(f.confidence)||f.confidence==='unknown'||!ids.length||ids.some(id=>!sourceIds.has(id))||!date(f.asOf??null))fail('academic field has no valid citation.');
  if(name==='researchInterests'){if(!Array.isArray(f.value)||!f.value.length||f.value.length>12||f.value.some(v=>!text(v,120)||!v.trim()))fail('research interests must be short professional topics.');}
  else if(name==='programStartYear'){if(!Number.isInteger(f.value)||f.value<1950||f.value>new Date(input.queriedAt).getUTCFullYear())fail('enrollment year is invalid.');}
  else if(!text(f.value,240)||!f.value.trim()||name==='currentStatus'&&!ROLES.has(f.value))fail('academic field value is invalid.');
  academic[name]={value:f.value,sourceIds:ids,asOf:f.asOf??null,confidence:f.confidence,basis:'source_stated'};
 }
 const research={candidateId,identity:{status:identity.status,confidence:identity.confidence,matchedPaperIds,sourceIds:citations,rationale:identity.status==='matched'?'Cited publication anchors connect this academic profile to the author; facts remain source-cited proposals.':'Author identity is not established; academic facts remain unknown.'},academic,sources,warnings:['Verify currentness at the linked academic sources. Missing facts remain unknown.'],queriedAt:input.queriedAt,requiresHumanReview:true};
 const current=currentProgramFacts({id:candidateId,paperIds,academicResearch:research});
 if(!current.currentDegree)academic.degree=unknown();
 if(current.programStartYear===null)academic.programStartYear=unknown();
 return research;
}

export function projectAcademicCheckpoint(cohort){
 if(!Array.isArray(cohort?.papers)||!Array.isArray(cohort?.candidates))fail('a saved paper/author checkpoint is required.');
 const meta=cohort.networkCandidates||{},timestamps=[meta.checkpointAt,cohort.updatedAt].filter(value=>typeof value==='string'&&Number.isFinite(Date.parse(value)));
 if(!timestamps.length)fail('saved checkpoint date is required.');
 const checkpointAt=timestamps.sort((a,b)=>Date.parse(a)-Date.parse(b)).at(-1),progress={total:cohort.candidates.length,completed:0,pending:0,in_progress:0,rate_wait:0,uncertain:0,paused:0};
 const aliases={completed:'completed',needs_review:'completed',pending:'pending',in_progress:'in_progress',researching:'in_progress',rate_wait:'rate_wait',rate_limited:'rate_wait',uncertain:'uncertain',paused:'paused'};
 for(const candidate of cohort.candidates){const state=aliases[candidate.mappingResearch?.status];if(!state)fail('every author needs a recorded lookup state.');progress[state]++;}
 const paperSet=new Set(cohort.papers.map(p=>p.id)),ids=new Set(),profiles=[];
 for(const candidate of cohort.candidates){
  if(ids.has(candidate.id)||!candidate.paperIds?.length||candidate.paperIds.some(id=>!paperSet.has(id)))fail('author inventory or publication scope is invalid.');ids.add(candidate.id);
  if(candidate.academicResearch)profiles.push({candidateId:candidate.id,paperIds:[...candidate.paperIds],research:projectAcademicResearch(candidate.id,candidate.paperIds,candidate.academicResearch)});
 }
 return {schemaVersion:1,kind:'academic_profile_snapshot',cohortId:cohort.cohort?.id||'network',checkpoint:{at:checkpointAt,complete:progress.completed===progress.total,papers:cohort.papers.length,authorRecords:progress.total,completedLookups:progress.completed,pendingLookups:progress.pending,inProgress:progress.in_progress,rateLimitedLookups:progress.rate_wait,uncertainLookups:progress.uncertain,pausedLookups:progress.paused,retainedProfiles:profiles.length},profiles};
}

export function academicPublicationCoverage(bootstrap){
 const result={retainedProfiles:0,matchedIdentities:0,currentAffiliations:0,academicStatuses:0,specificStatuses:0,researchInterests:0,currentDegrees:0,currentProgramStarts:0};
 for(const candidate of bootstrap.candidates){
  const r=candidate.academicResearch;if(!r||r.candidateId!==candidate.id)continue;result.retainedProfiles++;
  const sources=new Map((r.sources||[]).filter(s=>sourceUrl(s.url)&&typeof s.evidenceExcerpt==='string'&&s.evidenceExcerpt.trim()).map(s=>[s.id,s])),cited=ids=>Array.isArray(ids)&&ids.length>0&&ids.every(id=>sources.has(id));
  if(r.identity?.status!=='matched'||!r.identity.matchedPaperIds?.some(id=>candidate.paperIds?.includes(id))||!cited(r.identity.sourceIds))continue;result.matchedIdentities++;
  const fact=key=>{const field=r.academic?.[key];return field?.value!=null&&field.basis==='source_stated'&&cited(field.sourceIds)?field.value:null;};
  if(fact('currentAffiliation')!==null)result.currentAffiliations++;
  const status=fact('currentStatus');if(status!==null&&ROLES.has(status)){result.academicStatuses++;if(!['Other','Other academic role'].includes(status))result.specificStatuses++;}
  if(fact('researchInterests')!==null)result.researchInterests++;
  const program=currentProgramFacts(candidate);if(program.currentDegree!==null)result.currentDegrees++;if(program.programStartYear!==null)result.currentProgramStarts++;
 }
 return result;
}

export function projectAcademicPublication(publication){
 if(publication?.schemaVersion!==1||publication.kind!=='academic_profile_snapshot'||!Array.isArray(publication.profiles)||!publication.checkpoint||!text(publication.cohortId,64)||!/^[a-z][a-z0-9_-]*$/.test(publication.cohortId))fail('unsupported public snapshot.');
 const checkpoint=publication.checkpoint,counts=['authorRecords','completedLookups','pendingLookups','inProgress','rateLimitedLookups','uncertainLookups','pausedLookups','retainedProfiles','papers'];
 if(counts.some(key=>!Number.isSafeInteger(checkpoint[key])||checkpoint[key]<0)||!date(checkpoint.at)||checkpoint.at===null||checkpoint.retainedProfiles!==publication.profiles.length||checkpoint.retainedProfiles>checkpoint.completedLookups||['completedLookups','pendingLookups','inProgress','rateLimitedLookups','uncertainLookups','pausedLookups'].reduce((sum,key)=>sum+checkpoint[key],0)!==checkpoint.authorRecords)fail('public coverage counts do not reconcile.');
 if(checkpoint.complete!==(checkpoint.completedLookups===checkpoint.authorRecords))fail('lookup completion flag contradicts the coverage counts.');
 const projected={schemaVersion:1,kind:'academic_profile_snapshot',cohortId:publication.cohortId,checkpoint:{at:checkpoint.at,complete:checkpoint.complete,...Object.fromEntries(counts.map(key=>[key,checkpoint[key]]))},profiles:publication.profiles.map(entry=>({candidateId:entry.candidateId,paperIds:[...(entry.paperIds||[])],research:projectAcademicResearch(entry.candidateId,entry.paperIds,entry.research)}))};
 if(typeof publication.sourceCheckpointSha256==='string'&&/^[a-f0-9]{64}$/.test(publication.sourceCheckpointSha256))projected.sourceCheckpointSha256=publication.sourceCheckpointSha256;
 return projected;
}

/** Link only selected, professional projections to known author/paper records. */
export function mergeAcademicPublication(bootstrap,input){
 const publication=projectAcademicPublication(input),checkpoint=publication.checkpoint;
 const candidates=new Map(bootstrap.candidates.map(c=>[c.id,c])),allPapers=new Set(bootstrap.papers.map(p=>p.id)),seen=new Set();let linked=0,updated=0;
 for(const entry of publication.profiles){
  if(seen.has(entry.candidateId))fail('duplicate author profile.');seen.add(entry.candidateId);
  const candidate=candidates.get(entry.candidateId);if(!candidate||!Array.isArray(entry.paperIds)||entry.paperIds.some(id=>!allPapers.has(id))||!entry.paperIds.some(id=>candidate.paperIds?.includes(id)))fail('profile does not match an author and publication in this snapshot.');
  const research=projectAcademicResearch(entry.candidateId,entry.paperIds,entry.research);
  if(research.identity.matchedPaperIds.some(id=>!candidate.paperIds?.includes(id)))fail('identity anchor belongs to a different author group.');
  linked++;const existing=candidate.academicResearch,existingTime=Date.parse(existing?.queriedAt),incomingTime=Date.parse(research.queriedAt);
  if(existing&&(!Number.isFinite(existingTime)||existingTime>=incomingTime))continue;
  candidate.academicResearch=research;updated++;
 }
 return {cohortId:publication.cohortId,checkpointAt:checkpoint.at,complete:checkpoint.complete===true,sourcePapers:checkpoint.papers,researchGroups:checkpoint.authorRecords,completedLookups:checkpoint.completedLookups,retainedProfiles:checkpoint.retainedProfiles,pendingLookups:checkpoint.pendingLookups,inProgress:checkpoint.inProgress,rateLimitedLookups:checkpoint.rateLimitedLookups,uncertainLookups:checkpoint.uncertainLookups,pausedLookups:checkpoint.pausedLookups,linkedProfiles:linked,updatedProfiles:updated};
}
