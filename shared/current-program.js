/* Current enrollment only. Degree credentials and publication dates never
 * establish when a person's current program began. All findings need review. */
function cpUrl(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null}catch{return null}}
function cpNormalize(value){return String(value||'').normalize('NFKC').toLowerCase().replace(/[.]/g,'').replace(/\s+/g,' ').trim()}
function cpDegreeKind(value){const s=cpNormalize(value);if(/^(?:phd|dphil|scd|edd|doctorate)$/.test(s))return 'phd';if(/^(?:master[’']?s|msc|ms|ma|meng)$/.test(s))return 'master';if(/^(?:bachelor[’']?s|bsc|bs|ba|beng)$/.test(s))return 'bachelor';return null}
function cpRoleKind(value){const s=cpNormalize(value);if(/^(?:phd student|phd candidate)$/.test(s))return 'phd';if(/^master[’']?s student$/.test(s))return 'master';if(s==='undergraduate student')return 'bachelor';return null}
function cpYearSupported(year,kind,sources){
 const labels={phd:/\b(?:phd|dphil|doctoral|doctorate|doctor of philosophy|scd|edd)\b/g,master:/\b(?:master[’']?s?|msc|ms|ma|meng)\b/g,bachelor:/\b(?:bachelor[’']?s?|undergraduate|bsc|bs|ba|be|beng)\b/g};
 return sources.some(source=>{
  const text=String(source.evidenceExcerpt||'').normalize('NFKC').toLowerCase().replace(/\bph\.\s*d\.?/g,'phd').replace(/\b([bm])\.\s*(sc|eng|s|a|e)\.?/g,'$1$2').replace(/\b(sc|ed)\.\s*d\.?/g,'$1d');
  const clauses=text.split(/[;!?\n]+|\.(?:\s+|(?=\D)|$)/);return clauses.some((clause,index)=>{if(![...clause.matchAll(labels[kind])].length&&/\b(?:program|programme|degree|enrollment|enrolment|advisor|adviser|supervisor)\b/.test(clause)&&!Object.entries(labels).filter(([k])=>k!==kind).some(([,re])=>[...clause.matchAll(re)].length)){const previous=clauses[index-1]||'';if((/\b(?:student|candidate|enrolled)\b/.test(previous)||/\b(?:advisor|adviser|supervisor)\b/.test(clause)&&!/\b(?:awarded|completed|graduated)\b/.test(previous))&&[...previous.matchAll(labels[kind])].length&&!Object.entries(labels).filter(([k])=>k!==kind).some(([,re])=>[...previous.matchAll(re)].length))clause=previous+' '+clause;}
   const years=[...clause.matchAll(new RegExp('\\b'+year+'\\b','g'))];if(!years.length)return false;
   const ranges=[...clause.matchAll(/\b(19\d{2}|20\d{2})(?:[./]\d{1,2})?\s*(?:[-–—]{1,2}|to|through|until)\s*(?:expected\s*)?(19\d{2}|20\d{2}|present|current|ongoing|now)\b/g)];
   const current=[...clause.matchAll(labels[kind])];if(!current.length)return false;const other=Object.entries(labels).filter(([k])=>k!==kind).flatMap(([,re])=>[...clause.matchAll(re)]);
   const cues=[...clause.matchAll(/\b(?:since|start(?:ed|ing)?|began|begin|enroll(?:ed|ment)?|commenced|entered|first[- ]year)\b/g)];
   const events=[...clause.matchAll(/\b(?:intern(?:ship|ed|ing)?|employ(?:ment|ed)?|job|position|assistantship|research assistant|research visit|postdoc(?:toral)?|award|prize|honou?r|scholarship|project)\b/g)],locations=[...clause.matchAll(/\b(?:lab(?:oratory)?|research group)\b/g)],programs=[...current];
   const latest=(matches,before)=>Math.max(-Infinity,...matches.filter(m=>m.index<before&&before-m.index<=140).map(m=>m.index));
   for(const marker of clause.matchAll(/\b(?:program(?:me)?|degree|studies|study|enrollment|enrolment)\b/g))if(marker[0]==='degree'||latest(events,marker.index)<=latest(programs,marker.index))programs.push(marker);
   return years.some(y=>{
    const distance=matches=>Math.min(Infinity,...matches.map(m=>Math.abs(m.index-y.index)));if(distance(current)>140||distance(current)>=distance(other))return false;
    // A range must start at this exact occurrence, not merely share its year
    // with a different program elsewhere in the same sentence.
    const rangeStart=ranges.some(r=>r.index===y.index&&Number(r[1])===year),rangeEnd=ranges.some(r=>/^\d{4}$/.test(r[2])&&r.index+r[0].lastIndexOf(r[2])===y.index&&Number(r[1])!==year);if(rangeEnd&&!rangeStart)return false;
    const nearestDegree=current.reduce((best,match)=>Math.abs(match.index-y.index)<Math.abs(best.index-y.index)?match:best,current[0]),eventBeforeDateFirstDegree=nearestDegree.index>y.index&&events.some(event=>event.index>=y.index&&event.index<nearestDegree.index);
    if(rangeStart&&!eventBeforeDateFirstDegree&&latest([...events,...locations],y.index)<=latest(programs,y.index))return true;
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
 if(!start||!Number.isInteger(start.value)||start.value<1950||start.value>currentYear||!cpYearSupported(start.value,roleKind,start.sources))return base;
 return {category:'source_stated',currentDegree:degree.value,programStartYear:start.value,basis:'source_stated_current_program',confidence:start.confidence||'unknown',asOf:start.asOf??null,sourceIds:[...start.sourceIds],sources:start.sources,requiresHumanReview:true,reason:'A cited source explicitly identifies the start of the current student degree program.'};
}
