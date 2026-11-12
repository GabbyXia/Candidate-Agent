/* Current enrollment only. Degree credentials and publication dates never
 * establish when a person's current program began. All findings need review. */
function cpUrl(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null}catch{return null}}
function cpNormalize(value){return String(value||'').normalize('NFKC').toLowerCase().replace(/[.]/g,'').replace(/\s+/g,' ').trim()}
function cpDegreeKind(value){const s=cpNormalize(value);if(/^(?:phd|dphil|scd|edd|doctorate)$/.test(s))return 'phd';if(/^(?:master[’']?s|msc|ms|ma|meng)$/.test(s))return 'master';if(/^(?:bachelor[’']?s|bsc|bs|ba|beng)$/.test(s))return 'bachelor';return null}
function cpRoleKind(value){const s=cpNormalize(value);if(/^(?:phd student|phd candidate)$/.test(s))return 'phd';if(/^master[’']?s student$/.test(s))return 'master';if(s==='undergraduate student')return 'bachelor';return null}
function cpParserView(value){
 return String(value||'').normalize('NFKC').toLowerCase().replace(/\bph\.\s*d\.?/g,'phd').replace(/\b([bm])\.\s*(sc|eng|s|a|e)\.?/g,'$1$2').replace(/\b(sc|ed)\.\s*d\.?/g,'$1d')
  // These periods belong to dates or an adviser's name, not sentence boundaries.
  .replace(/\b(jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\.(?=\s*(?:19|20)\d{2}\b)/g,'$1 ')
  .replace(/\b(?:advisor|adviser|supervisor)\s*:?\s*[^;!?\n)]{1,100}/g,span=>span.replace(/\b(prof|dr)\.(?=\s+\p{L})/gu,'$1').replace(/\b([a-z])\.(?=\s+\p{L})/gu,'$1'))
  .replace(/\b(autumn|fall|spring|summer|winter)(?=(?:19|20)\d{2}\b)/g,'$1 ');
}
// Literal source-language education entries only. This translates degree words,
// never person origin, identity, role seniority, dates by duration or numeric ends.
function cpNativeOngoingEducationStart(year,kind,text){
 const label=kind==='phd'?'博士生':kind==='master'?'硕士生':null;if(!label)return false;
 const other=kind==='phd'?/硕士生|碩士生|本科生|学士|學士/u:/博士生|本科生|学士|學士/u;if(other.test(text))return false;
 return text.split(/[;!?。\n]+/u).some(clause=>{
  if(/博士后|博士後|毕业|畢業|已完成|已结束|已結束|往届|往屆|曾经|曾經|曾任|拟|擬|申请|申請|计划|計劃|将于|將於|即将|即將|准备|準備|未来|未來|入职|入職|任职|任職|工作|实习|實習|访问|訪問|访学|訪學|交换|交換|项目|項目|课题|課題|论文|論文|奖学金|獎學金|获奖|獲獎|会议|會議|论坛|論壇|讲座|講座|活动|活動|指导|指導|培养|培養|招生|招收/u.test(clause)||/\b(?:former|previous|graduated|incoming|prospective|will|future|planned|planning|offer(?:ed)?|deferred|applications?|thesis|dissertation|candidacy|internship|visit|project|paper|award)\b/iu.test(clause))return false;
  const ranges=[...clause.matchAll(/\b(19\d{2}|20\d{2})(?:[./](?:0?[1-9]|1[0-2]))?\s*(?:[-‐‑‒–—−]{1,2}\s*)?至今/gu)];
  if(ranges.length!==1||Number(ranges[0][1])!==year)return false;
  const range=ranges[0],prefix=clause.slice(0,range.index).trim();
  if(prefix&&!/^(?:学术经历|教育经历|教育背景)\s*[:：]?$/u.test(prefix))return false;
  const after=clause.slice(range.index+range[0].length),roles=[...after.matchAll(new RegExp(label+'(?!\\s*(?:导师|導師|指导教师|指導教師|指导老师|指導老師))(?=$|[\\s,，。;；:：（(])','gu'))];
  if(roles.length!==1||roles[0].index>140||/\b(?:19|20)\d{2}\b/u.test(after))return false;
  if(/导师|導師|老师|老師/u.test(after.slice(0,roles[0].index)))return false;
  return true;
 });
}
function cpYearSupported(year,kind,sources,currentYear,contextSources=sources,allowAdmission=true){
 const labels={phd:/\b(?:phd|dphil|doctoral|doctorate|doctor of philosophy|scd|edd)\b/g,master:/\b(?:master[’']?s?|msc|ms|ma|meng)\b/g,bachelor:/\b(?:bachelor[’']?s?|undergraduate|bsc|bs|ba|be|beng)\b/g};
 return sources.some(source=>{
  const text=cpParserView(source.evidenceExcerpt);if(cpNativeOngoingEducationStart(year,kind,text))return true;
  const clauses=text.split(/[;!?\n]+|\.(?:\s+|(?=\D)|$)/);return clauses.some((clause,index)=>{if(![...clause.matchAll(labels[kind])].length&&/\b(?:program|programme|degree|enrollment|enrolment|advisor|adviser|supervisor)\b/.test(clause)&&!Object.entries(labels).filter(([k])=>k!==kind).some(([,re])=>[...clause.matchAll(re)].length)){const previous=clauses[index-1]||'';if((/\b(?:student|candidate|enrolled)\b/.test(previous)||/\b(?:advisor|adviser|supervisor)\b/.test(clause)&&!/\b(?:awarded|completed|graduated)\b/.test(previous))&&[...previous.matchAll(labels[kind])].length&&!Object.entries(labels).filter(([k])=>k!==kind).some(([,re])=>[...previous.matchAll(re)].length))clause=previous+' '+clause;}
   const years=[...clause.matchAll(new RegExp('\\b'+year+'\\b','g'))];if(!years.length)return false;
   const ranges=[...clause.matchAll(/\b(19\d{2}|20\d{2})(?:[./]\d{1,2})?\s*(?:[-‐‑‒–—−]{1,2}|to|through|until)\s*(?:expected\s*)?(?:(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(?=(?:19|20)\d{2}\b))?(19\d{2}|20\d{2}|present|current|ongoing|now)\b/g)];
   const current=[...clause.matchAll(labels[kind])];if(!current.length)return false;const other=Object.entries(labels).filter(([k])=>k!==kind).flatMap(([,re])=>[...clause.matchAll(re)]);
   const cues=[...clause.matchAll(/\b(?:since|start(?:ed|ing)?|began|begin|enroll(?:ed|ment)?|commenced|entered|first[- ]year)\b/g)];
   const admissions=allowAdmission?[...clause.matchAll(/\badmitted\s+(?:(?:in|for)\s+)?(?:autumn|fall|spring|summer|winter)\s+(19\d{2}|20\d{2})\b/g)]:[];
   const events=[...clause.matchAll(/\b(?:intern(?:ship|ed|ing)?|employ(?:ment|ed)?|job|position|assistantship|research assistant|research visit|postdoc(?:toral)?|award|prize|honou?r|scholarship|project|paper|publication|submission|conference|workshop|consortium)\b/g)],locations=[...clause.matchAll(/\b(?:lab(?:oratory)?|research group)\b/g)],programs=[...current];
   const latest=(matches,before)=>Math.max(-Infinity,...matches.filter(m=>m.index<before&&before-m.index<=140).map(m=>m.index));
   for(const marker of clause.matchAll(/\b(?:program(?:me)?|degree|studies|study|enrollment|enrolment)\b/g))if(marker[0]==='degree'||latest(events,marker.index)<=latest(programs,marker.index))programs.push(marker);
   return years.some(y=>{
    const distance=matches=>Math.min(Infinity,...matches.map(m=>Math.abs(m.index-y.index)));if(distance(current)>140||distance(current)>=distance(other))return false;
    // A range must start at this exact occurrence, not merely share its year
    // with a different program elsewhere in the same sentence.
    const ownRange=ranges.find(r=>r.index===y.index&&Number(r[1])===year),rangeStart=Boolean(ownRange),rangeEnd=ranges.some(r=>/^\d{4}$/.test(r[2])&&r.index+r[0].lastIndexOf(r[2])===y.index&&Number(r[1])!==year);if(rangeEnd&&!rangeStart)return false;
    // Month-bearing numeric ends establish this range only when their year is
    // strictly future. Current/past expected months never imply continued
    // enrollment, and a program-phase interval is not first enrollment.
    const monthEndedRange=ownRange&&/^\d{4}$/.test(ownRange[2])&&/\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(?:19|20)\d{2}\b$/.test(ownRange[0]);
    if(monthEndedRange&&(Number(ownRange[2])<=currentYear||/\b(?:applications?|applying|thesis|dissertation|proposal|defen[cs]e|viva|qualifying|candidacy|exams?)\b/.test(clause)))return false;
    if(ownRange&&/^\d{4}$/.test(ownRange[2])&&Number(ownRange[2])<currentYear&&!/\bexpected\b/.test(ownRange[0]))return false;
    const nearestDegree=current.reduce((best,match)=>Math.abs(match.index-y.index)<Math.abs(best.index-y.index)?match:best,current[0]),eventBeforeDateFirstDegree=nearestDegree.index>y.index&&events.some(event=>event.index>=y.index&&event.index<nearestDegree.index);
    if(/\b(?:(?:completed|finished|earned|awarded|received)\s+(?:(?:a|an|the)\s+)?|(?:former|previous)\s+)$/.test(clause.slice(0,nearestDegree.index)))return false;
    if(rangeStart&&!eventBeforeDateFirstDegree&&latest([...events,...locations],y.index)<=latest(programs,y.index))return true;
    // A short dated enrollment notice can put its literal year before the
    // enrollment verb: "[Aug 2025] Starting PhD at UCB!". Only a date prefix,
    // optional first-person subject, explicit start cue and following degree
    // qualify. A post date cannot stand in for a different/future start year.
    const datePrefix=clause.slice(0,y.index);
    const datePrefixOnly=/^\s*[\[(]?\s*(?:(?:in|on)\s+)?(?:(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+)?$/.test(datePrefix);
    const dateFirstCue=cues.find(cue=>cue.index>y.index&&cue.index-y.index<=40&&/^[\s\[\](){}.,:;/–—\-0-9]*(?:i\s+)?$/.test(clause.slice(y.index+y[0].length,cue.index)));
    if(datePrefixOnly&&dateFirstCue&&!eventBeforeDateFirstDegree&&!events.length&&!/\b(?:will|incoming|prospective|offer(?:ed)?|defer(?:red)?|future|plan(?:ned|ning)?|soon|tomorrow|visiting|exchange|guest|applications?|applying|thesis|dissertation|proposal|defen[cs]e|viva|qualifying|candidacy|exams?|next\s+(?:year|term|semester|month|week|day|fall|autumn|spring|summer|winter)|in\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(?:days?|weeks?|months?|years?))\b/.test(clause)){
     const followingDegree=current.find(degree=>degree.index>=dateFirstCue.index+dateFirstCue[0].length&&degree.index-dateFirstCue.index<=100);
     const later=clause.slice(dateFirstCue.index+dateFirstCue[0].length),explicitLaterDate=/\b(?:19|20)\d{2}\b|\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|spring|summer|fall|autumn|winter)\b/.test(later);
     if(followingDegree&&!explicitLaterDate&&!locations.some(location=>location.index>=dateFirstCue.index&&location.index<followingDegree.index))return true;
    }
    const admission=admissions.find(a=>a.index+a[0].lastIndexOf(a[1])===y.index&&Number(a[1])===year);
    if(admission&&nearestDegree.index<admission.index&&/\b(?:student|candidate|program|programme|degree|studies)\b/.test(clause.slice(nearestDegree.index,admission.index))&&!/\b(?:offer(?:ed)?|conditional|deferred|declined|incoming|prospective|future)\b/.test(clause)&&latest([...events,...locations],admission.index)<=latest(programs,admission.index)){
     // A cohort term cannot overrule a different explicitly stated program start.
     const alternatives=[...new Set(contextSources.flatMap(s=>[...cpParserView(s.evidenceExcerpt).matchAll(/\b(?:19|20)\d{2}\b/g)].map(m=>Number(m[0]))))].filter(other=>other!==year&&other<=currentYear);
     if(!alternatives.some(other=>cpYearSupported(other,kind,contextSources,currentYear,contextSources,false)))return true;
    }
    return cues.some(cue=>{
     if(cue.index>y.index||y.index-cue.index>=140)return false;const start=cue.index+cue[0].length,between=clause.slice(start,y.index);if(/\b(?:19|20)\d{2}\b/.test(between))return false;
     // "Started an internship" dates the job, even when the same clause calls
     // its author a PhD student. An earlier job does not veto a later explicit
     // degree-enrollment statement or a degree range.
     if(events.some(event=>event.index>=start&&event.index<y.index))return false;
     const afterCue=programs.filter(program=>program.index>=start&&program.index<y.index);if(locations.some(location=>location.index>=start&&location.index<y.index)&&!afterCue.length)return false;
     const eventBefore=latest([...events,...locations],cue.index),programBefore=latest(programs,y.index);return eventBefore<=programBefore;
    });
   });
  });
 });
}
export function currentProgramFacts(candidate,{currentYear=new Date().getUTCFullYear()}={}){
 const research=candidate?.academicResearch,identity=research?.identity,matched=identity?.status==='matched'&&Array.isArray(identity.matchedPaperIds)&&identity.matchedPaperIds.some(id=>(candidate.paperIds||[]).includes(id));
 const unknown={category:'unknown',currentDegree:null,programStartYear:null,basis:'unknown',confidence:'unknown',sourceIds:[],sources:[],requiresHumanReview:true};
 if(!matched)return {...unknown,reason:'Current program requires an identity-matched academic source.'};
 const sources=new Map((research.sources||[]).filter(s=>s?.id&&cpUrl(s.url)).map(s=>[s.id,s]));
 const fact=name=>{const f=research.academic?.[name];if(!f||f.value==null||f.basis!=='source_stated'||!Array.isArray(f.sourceIds)||!f.sourceIds.length||f.sourceIds.some(id=>!sources.has(id)))return null;return {...f,sources:f.sourceIds.map(id=>sources.get(id))}};
 const status=fact('currentStatus'),roleKind=cpRoleKind(status?.value),degree=fact('degree'),start=fact('programStartYear');
 if(!roleKind){const known=status?.value&&!/^(?:Unknown|Other|Other academic role)$/i.test(status.value);return {...unknown,category:known?'not_currently_studying':'unknown',reason:known?'No current student program is established for this source-stated professional role.':'Current student enrollment is not established.'};}
 if(!degree||cpDegreeKind(degree.value)!==roleKind)return {...unknown,reason:'A cited degree matching the current student program is required.'};
 const base={...unknown,currentDegree:degree.value,reason:'Current program start year is not explicitly supported.'};
 if(!start||!Number.isInteger(start.value)||start.value<1950||start.value>currentYear||!cpYearSupported(start.value,roleKind,start.sources,currentYear,[...status.sources,...degree.sources,...start.sources]))return base;
 return {category:'source_stated',currentDegree:degree.value,programStartYear:start.value,basis:'source_stated_current_program',confidence:start.confidence||'unknown',asOf:start.asOf??null,sourceIds:[...start.sourceIds],sources:start.sources,requiresHumanReview:true,reason:'A cited source explicitly identifies the start of the current student degree program.'};
}

// Recover only an explicit, unique enrollment year already present in a cited
// current-degree excerpt. No source text or original lookup record is changed.
export function recoverCitedProgramStart(candidate,{currentYear=new Date().getUTCFullYear()}={}){
 const research=candidate?.academicResearch;if(!research||research.candidateId!==candidate.id||research.academic?.programStartYear?.value!=null)return null;
 const known=currentProgramFacts(candidate,{currentYear});if(!known.currentDegree)return null;
 const degree=research.academic?.degree,status=research.academic?.currentStatus;if(![degree?.confidence,status?.confidence].every(value=>['low','medium','high'].includes(value)))return null;
 const ids=degree?.sourceIds||[],available=new Map((research.sources||[]).filter(source=>cpUrl(source.url)&&typeof source.evidenceExcerpt==='string'&&source.evidenceExcerpt.trim()).map(source=>[source.id,source])),sources=[...available.values()].filter(source=>ids.includes(source.id));
 if(!sources.length||!Array.isArray(research.identity?.sourceIds)||!research.identity.sourceIds.length)return null;
 if(!research.identity.sourceIds.every(id=>available.has(id)))return null;
 const years=[...new Set(sources.flatMap(source=>[...String(source.evidenceExcerpt||'').matchAll(/\b(?:19|20)\d{2}\b/g)].map(match=>Number(match[0]))))].filter(year=>year>=1950&&year<=currentYear),supported=[];
 const trial=(year,sourceIds)=>{const field={value:year,sourceIds,asOf:null,confidence:'low',basis:'source_stated'};return currentProgramFacts({...candidate,academicResearch:{...research,academic:{...research.academic,programStartYear:field}}},{currentYear}).programStartYear===year;};
 for(const year of years)if(trial(year,sources.map(source=>source.id)))supported.push(year);
 if(supported.length!==1)return null;
 const year=supported[0],sourceIds=sources.filter(source=>trial(year,[source.id])).map(source=>source.id);if(!sourceIds.length)return null;
 const confidence=[degree?.confidence,status?.confidence].includes('low')?'low':'medium';
 return {value:year,sourceIds,asOf:null,confidence,basis:'source_stated'};
}
