'use strict';

// Public academic research proposals remain separate from publisher metadata
// and recruiter-reviewed facts. The queue runs only while this page is open.
const PR_FIELDS = [
  ['currentAffiliation', 'Current academic affiliation'],
  ['currentStatus', 'Current academic status'],
  ['researchInterests', 'Research interests'],
  ['degree', 'Degree program'],
  ['programStartYear', 'Program start year'],
  ['expectedGraduationYear', 'Source-stated graduation year'],
];
const PR_STATES = new Set(['queued', 'researching', 'needs_review', 'resolved', 'connection_required', 'failed']);
const PR_LABELS = {queued:'Queued',researching:'Researching',needs_review:'Needs review',resolved:'Reviewed',connection_required:'Connection required',failed:'Needs retry'};
let PR_connection = {checked:false,configured:false,missing:[],maxBatchSize:25};
let PR_connectionPromise = null;
let PR_running = false;
let PR_pauseRequested = true;
let PR_activeCandidateId = null;
let PR_loopPromise = null;
let PR_pilotPromise = null;
let PR_pilotLoaded = false;
let PR_pilotData = null;
let PR_pilotSelection = '';
let PR_pilotError = '';

function PR_candidate(id){return state.candidates.find(c=>c.id===id)}
function PR_job(id){return (state.profileQueue||[]).find(j=>j.candidateId===id)}
function PR_now(){return new Date().toISOString()}
function PR_save(){if(typeof persist==='function')persist()}
function PR_redraw(){if(typeof render==='function')render()}
function PR_safeUrl(value){return typeof url==='function'?url(value):'#'}
function PR_error(value){return String(value||'The research request could not be completed.').slice(0,400)}
function PR_value(field){if(!field||field.value==null)return 'Unknown';return Array.isArray(field.value)?field.value.join('; '):String(field.value)}
function PR_date(value){
  if(!value)return 'Date not supplied';const text=String(value).trim();
  if(/^\d{4}$/.test(text))return text;
  const month=text.match(/^(\d{4})[-/](0[1-9]|1[0-2])$/);if(month)return month[1]+'-'+month[2];
  const calendar=text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(calendar){const year=+calendar[1],month=+calendar[2]-1,day=+calendar[3],date=new Date(Date.UTC(year,month,day));if(date.getUTCFullYear()!==year||date.getUTCMonth()!==month||date.getUTCDate()!==day)return 'Date not supplied';return date.toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric',timeZone:'UTC'})}
  const date=new Date(value);return Number.isNaN(date.getTime())?'Date not supplied':date.toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric'});
}
function PR_confidence(value){return ['high','medium','low'].includes(String(value).toLowerCase())?String(value).toLowerCase():'not assessed'}
function PR_excerpt(value){const words=String(value||'').trim().split(/\s+/).filter(Boolean);return words.slice(0,24).join(' ')+(words.length>24?'…':'')}
function PR_hasValue(field){return field?.value!=null&&field.value!==''&&(!Array.isArray(field.value)||field.value.length>0)&&field.basis!=='unknown'}
function PR_fieldSources(research,field){return (field?.sourceIds||[]).map(id=>(research?.sources||[]).find(s=>s.id===id)).filter(s=>s&&PR_safeUrl(s.url)!=='#')}
function PR_canAccept(candidate,key){const research=candidate?.academicResearch,field=research?.academic?.[key];return research?.identity?.status==='matched'&&PR_hasValue(field)&&PR_fieldSources(research,field).length>0}
function PR_needsReview(candidate){return Boolean(candidate.academicResearch&&!candidate.academicResearch.reviewedAt&&PR_job(candidate.id)?.state!=='resolved')}
function PR_statusBadge(status){return `<span class="pr-status pr-status-${esc(status)}">${esc(PR_LABELS[status]||status)}</span>`}
function PR_sourceLinks(research,field){const sources=PR_fieldSources(research,field);return sources.length?sources.map(s=>`<a class="pr-citation" href="${PR_safeUrl(s.url)}" target="_blank" rel="noopener noreferrer">${icon('link')}${esc(s.title||'Academic source')}</a>`).join(''):'<span class="pr-uncited">No supporting citation</span>'}

function normalizeProfileQueue(){
  const rows=Array.isArray(state.profileQueue)?state.profileQueue:[],unique=new Map();let changed=!Array.isArray(state.profileQueue);
  for(const value of rows){if(!value||typeof value.candidateId!=='string')continue;const job=value;
    if(!PR_STATES.has(job.state)){job.state='failed';job.error='The saved queue entry needs to be restarted.';changed=true}
    if(job.state==='researching'&&!(PR_running&&PR_activeCandidateId===job.candidateId)){job.state='failed';job.finishedAt=PR_now();job.error='The page closed or reloaded before this research result was received. Review the existing profile, then retry if needed.';changed=true}
    unique.set(job.candidateId,job);
  }
  state.profileQueue=[...unique.values()];
  for(const c of state.candidates){if(c.academicResearch&&!c.academicResearch.reviewedAt&&!PR_job(c.id)){
    state.profileQueue.push({candidateId:c.id,candidateName:c.name,state:'needs_review',addedAt:c.academicResearch.queriedAt||PR_now(),finishedAt:c.academicResearch.queriedAt||null,origin:c.academicResearch.origin||c.academicResearch.researchMethod||'existing_source_research'});changed=true;
  }}
  if(changed)PR_save();return state.profileQueue;
}

async function PR_checkConnection(force=false){
  if(Boolean(globalThis.TALENT_ATLAS_STATIC))return PR_connection={checked:true,configured:false,missing:[],maxBatchSize:0};
  if(PR_connectionPromise)return PR_connectionPromise;
  if(PR_connection.checked&&!force)return PR_connection;
  PR_connectionPromise=(async()=>{
    try{const response=await atlasFetch('/api/profile-research/status',{signal:AbortSignal.timeout(15000)});const data=await response.json();if(!response.ok)throw Error(data.error||'Connection status is unavailable.');
      PR_connection={checked:true,configured:data.configured===true,missing:Array.isArray(data.missing)?data.missing.map(String):[],maxBatchSize:Math.max(1,Math.min(25,Number(data.maxBatchSize)||25))};
    }catch(error){PR_connection={checked:true,configured:false,missing:[],maxBatchSize:25,error:PR_error(error.message)}}
    finally{PR_connectionPromise=null}
    return PR_connection;
  })();return PR_connectionPromise;
}

async function PR_enqueue(ids){
  if(Boolean(globalThis.TALENT_ATLAS_STATIC)){toast('Live research runs separately. This website displays published research only.');return}
  normalizeProfileQueue();const unique=[...new Set(ids)].filter(id=>PR_candidate(id));
  if(!unique.length){toast('Select at least one author record to research.');return}
  if(unique.length>25){toast('Select 25 or fewer author records for one research batch.');return}
  const connection=await PR_checkConnection(true);
  if(unique.length>connection.maxBatchSize){toast(`This connection supports at most ${connection.maxBatchSize} authors per batch.`);return}
  let added=0;
  for(const id of unique){const c=PR_candidate(id);let job=PR_job(id);if(job&&['queued','researching'].includes(job.state))continue;
    const next={candidateId:id,candidateName:c.name,state:connection.configured?'queued':'connection_required',addedAt:PR_now(),error:connection.configured?null:'Configure the server API key and research model before starting live academic research.'};
    if(job)Object.assign(job,next,{startedAt:null,finishedAt:null});else state.profileQueue.push(next);added++;
  }
  PR_save();PR_redraw();
  if(!connection.configured){toast(connection.error||'Academic research is waiting for the model connection. No model request was sent.');return}
  if(!added&&!PR_running){toast('These authors are already queued. Resume the queue to continue.');return}
  PR_pauseRequested=false;return PR_runQueue();
}

function PR_runQueue(){
  if(PR_running)return PR_loopPromise;
  PR_loopPromise=PR_processQueue();return PR_loopPromise;
}
async function PR_processQueue(){
  if(!PR_connection.configured)return;PR_running=true;PR_pauseRequested=false;PR_redraw();
  try{
    while(!PR_pauseRequested){const job=(state.profileQueue||[]).find(j=>j.state==='queued');if(!job)break;
      const candidate=PR_candidate(job.candidateId);if(!candidate){job.state='failed';job.error='This author is outside the current workspace. Restore the relevant collection before retrying.';job.finishedAt=PR_now();PR_save();continue}
      PR_activeCandidateId=candidate.id;job.state='researching';job.startedAt=PR_now();job.finishedAt=null;job.error=null;PR_save();PR_redraw();
      try{
        const response=await atlasFetch('/api/enrich',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({candidateId:candidate.id,paperIds:(candidate.papers||[]).slice(0,3).map(p=>p.id)}),signal:AbortSignal.timeout(150000)});
        const data=await response.json();
        if(!response.ok||data.ok===false){
          if(data.status==='connection_required'||data.code==='AI_CONNECTION_REQUIRED'||data.code==='PROFILE_RESEARCH_NOT_CONFIGURED'){
            PR_connection={...PR_connection,configured:false};for(const queued of state.profileQueue.filter(j=>j.state==='queued')){queued.state='connection_required';queued.error='The server model connection is unavailable.'}job.state='connection_required';job.error=PR_error(data.error||'The server model connection is unavailable.');PR_pauseRequested=true;
          }else throw Error(data.error||'The model research request could not be completed.');
        }else{
          const research=data.research;
          if(!research||research.candidateId!==candidate.id||!research.academic||!Array.isArray(research.sources)||!['matched','ambiguous','unresolved'].includes(research.identity?.status))throw Error('The server did not return a valid, candidate-specific academic research record.');
          const current=PR_candidate(candidate.id);if(!current)throw Error('The workspace changed before this result arrived. Reload the relevant collection and retry.');
          current.academicResearch={...research,queriedAt:research.queriedAt||PR_now()};job.state='needs_review';job.error=null;
          if(typeof notifyActivity==='function')notifyActivity('Academic profile research returned',`${current.name}: identity ${research.identity.status}; field-level sources require human review.`);
        }
      }catch(error){job.state='failed';job.error=PR_error(error.name==='TimeoutError'?'The request timed out. No completed research result was received.':error.message)}
      finally{job.finishedAt=PR_now();PR_activeCandidateId=null;PR_save();PR_redraw()}
    }
  }finally{PR_running=false;PR_activeCandidateId=null;PR_save();PR_redraw()}
}

async function PR_resume(){
  if(Boolean(globalThis.TALENT_ATLAS_STATIC))return;
  const connection=await PR_checkConnection(true);if(!connection.configured){for(const job of (state.profileQueue||[]).filter(j=>j.state==='queued')){job.state='connection_required';job.error='The server model connection is not configured.'}PR_save();PR_redraw();toast(connection.error||'Configure the server API key and research model to continue.');return}
  for(const job of (state.profileQueue||[]).filter(j=>j.state==='connection_required')){job.state='queued';job.error=null}
  PR_pauseRequested=false;return PR_runQueue();
}

function profileResearchToolbar(){if(Boolean(globalThis.TALENT_ATLAS_STATIC))return `<div class="pr-toolbar"><button class="btn ghost" data-action="open-profile-research">${icon('shield')} Published findings</button></div>`;const count=state.selected?.size||0;return `<div class="pr-toolbar"><button class="btn" data-action="queue-selected" ${!count?'disabled':''}>${icon('spark')} Research selected${count?' ('+count+')':''}</button><button class="btn ghost" data-action="open-profile-research">${icon('activity')} Profile research</button></div>`}

function profileResearchSection(c){
  if(Boolean(globalThis.TALENT_ATLAS_STATIC))return snapshotProfileSection(c);
  const research=c.academicResearch,accepted=c.academicProfile?.fields||{},job=PR_job(c.id),busy=job&&['queued','researching'].includes(job.state);
  return `<section class="drawer-section pr-profile-section"><div class="pr-section-heading"><h3>Academic profile research</h3>${job?PR_statusBadge(job.state):''}</div><p>Research current academic facts from public sources, then review each cited finding.</p>${research?`<div class="pr-identity pr-identity-${esc(research.identity?.status||'unresolved')}"><strong>Identity: ${esc(research.identity?.status||'unresolved')}</strong><span>Confidence: ${esc(PR_confidence(research.identity?.confidence))}</span><p>${esc(research.identity?.rationale||'Compare the cited profile against the author’s papers and coauthors.')}</p></div><p class="pr-origin">${(research.origin==='assistant_agents_public_sources'||research.researchMethod==='assistant_agents_public_sources')?'Researched by assistant agents from public sources':'Source-backed academic research proposal'} · ${PR_date(research.queriedAt)}</p>`:''}${Object.keys(accepted).length?`<div class="pr-reviewed-facts"><h4>Reviewed academic evidence</h4>${PR_FIELDS.filter(([key])=>accepted[key]).map(([key,label])=>`<div class="pr-reviewed-fact"><span>${label}</span><strong>${esc(PR_value(accepted[key]))}</strong>${PR_sourceLinks({sources:c.academicProfile.sources||research?.sources||[]},accepted[key])}</div>`).join('')}</div>`:''}${research?`<button class="btn" data-action="review-profile-research" data-id="${esc(c.id)}">${icon('shield')} ${research.reviewedAt?'Inspect academic evidence':'Review cited findings'}</button>`:''}<button class="btn ${research?'':'primary'}" data-action="queue-profile" data-id="${esc(c.id)}" ${busy?'disabled':''}>${icon('spark')} ${busy?PR_LABELS[job.state]:'Research academic profile'}</button>${c.evidence?'<p class="pr-small">Your manually entered evidence retains priority. Research proposals do not overwrite it.</p>':''}${job?.error?`<p class="pr-error">${esc(job.error)}</p>`:''}</section>`;
}

function PR_connectionPanel(){return `<div class="pr-connection ${PR_connection.configured?'pr-connection-ready':''}">${icon(PR_connection.configured?'check':'settings')}<div><strong>${PR_connection.configured?'Server model configuration present':PR_connection.checked?'Live academic research is not connected':'Model connection not checked'}</strong><p>${PR_connection.configured?'Configuration is present; provider access is checked when a live request runs. The queue processes one author at a time, and each result awaits review.':'Configure the server API key and research model. API keys are never entered in this dashboard.'}</p>${PR_connection.error?`<p class="pr-error">${esc(PR_connection.error)}</p>`:''}${PR_connection.missing.length?`<p class="pr-small">Server configuration required: ${PR_connection.missing.map(esc).join(', ')}.</p>`:''}</div><button class="btn" data-action="check-profile-connection">${icon('refresh')} Check connection</button></div>`}

function profileResearchWorkspace(){
  if(Boolean(globalThis.TALENT_ATLAS_STATIC))return snapshotProfileWorkspace();
  const queue=state.profileQueue||[],counts=Object.fromEntries([...PR_STATES].map(status=>[status,queue.filter(j=>j.state===status).length]));const proposals=state.candidates.filter(PR_needsReview);
  return `<div class="section-content pr-workspace">${PR_connectionPanel()}<div class="pr-workflow-note">${icon('shield')}<span>Only public academic affiliation, degree status, research interests, and supported academic timelines are researched. Publisher facts, proposed findings, and reviewed evidence remain distinct.</span></div><section class="panel pr-queue"><div class="table-top"><div><h2 class="table-title">Academic research queue <span class="number-pill">${queue.length}</span></h2><p>Up to 25 authors per new batch · one active request · this page must remain open</p></div><div class="pr-queue-actions">${PR_running?`<button class="btn" data-action="pause-profile-queue" ${PR_pauseRequested?'disabled':''}>${icon('clock')}${PR_pauseRequested?'Pausing after current':'Pause after current'}</button>`:`<button class="btn primary" data-action="resume-profile-queue" ${!queue.some(j=>['queued','connection_required'].includes(j.state))?'disabled':''}>${icon('refresh')} Resume queue</button>`}</div></div><div class="pr-queue-counts"><span>${counts.queued} queued</span><span>${counts.researching} researching</span><span>${counts.needs_review} awaiting review</span><span>${counts.resolved} reviewed</span>${counts.connection_required?`<span>${counts.connection_required} need connection</span>`:''}${counts.failed?`<span>${counts.failed} need retry</span>`:''}</div>${queue.length?`<div class="table-scroll"><table class="candidate-table pr-queue-table"><thead><tr><th></th><th>AUTHOR RECORD</th><th>RESEARCH STATE</th><th>LAST UPDATE</th><th></th></tr></thead><tbody>${queue.map(job=>{const c=PR_candidate(job.candidateId);return `<tr><td>${icon(job.state==='researching'?'activity':'file')}</td><td><strong>${esc(c?.name||job.candidateName||job.candidateId)}</strong>${job.error?`<p class="pr-error">${esc(job.error)}</p>`:''}</td><td>${PR_statusBadge(job.state)}</td><td>${PR_date(job.finishedAt||job.startedAt||job.addedAt)}</td><td>${c?.academicResearch?`<button class="btn ghost" data-action="review-profile-research" data-id="${esc(job.candidateId)}">Review sources</button>`:''}${c&&['failed','connection_required','resolved'].includes(job.state)?`<button class="btn ghost" data-action="queue-profile" data-id="${esc(job.candidateId)}">${job.state==='resolved'?'Research again':'Retry'}</button>`:''}</td></tr>`}).join('')}</tbody></table></div>`:'<div class="empty"><h3>Choose the academic profiles to research.</h3><p>Select up to 25 author records in the talent directory, then choose “Research selected”. Existing source proposals appear below without starting a live model request.</p></div>'}</section><section class="pr-review-list"><div class="pr-section-heading"><div><h2>Cited findings awaiting review <span class="number-pill">${proposals.length}</span></h2><p>Accept supported fields only after checking the person and source.</p></div></div>${PR_pilotSelection?`<p class="pr-small">Initial public-source pilot: ${esc(PR_pilotSelection)}</p>`:''}${PR_pilotError?`<p class="pr-error">${esc(PR_pilotError)}</p>`:''}${proposals.length?`<div class="pr-proposal-grid">${proposals.map(c=>`<article class="panel pr-proposal-card"><div class="pr-section-heading"><h3>${esc(c.name)}</h3><span class="pr-status pr-status-${c.academicResearch.identity?.status==='matched'?'needs_review':'failed'}">Identity ${esc(c.academicResearch.identity?.status||'unresolved')}</span></div><p>${esc(c.academicResearch.identity?.rationale||'Check the academic source against the published author record.')}</p><div class="pr-small">${(c.academicResearch.sources||[]).length} sources · ${PR_date(c.academicResearch.queriedAt)}${(c.academicResearch.origin==='assistant_agents_public_sources'||c.academicResearch.researchMethod==='assistant_agents_public_sources')?' · Assistant-agent research':''}</div><button class="btn" data-action="review-profile-research" data-id="${esc(c.id)}">${icon('shield')} Review academic evidence</button></article>`).join('')}</div>`:'<div class="panel empty"><h3>No unreviewed findings in this collection.</h3><p>Completed live research and available public-source pilot proposals will appear here.</p></div>'}</section></div>`;
}

function openProfileResearchReview(id){
  const c=PR_candidate(id),research=c?.academicResearch;if(!research){toast('No academic research proposal is available for this author yet.');return}
  const identity=research.identity||{},matched=identity.status==='matched';
  modal('Review the academic evidence.',`${esc(c.name)} · proposed findings require your review`,`<div class="pr-identity pr-identity-${esc(identity.status||'unresolved')}"><strong>Identity ${esc(identity.status||'unresolved')}</strong><span>Confidence: ${esc(PR_confidence(identity.confidence))}</span><p>${esc(identity.rationale||'No identity rationale was supplied.')}</p>${!matched?'<p><b>These findings cannot be accepted until the author’s identity is matched to the academic profile.</b> Compare paper titles, coauthors, institutional pages, and stable researcher identifiers.</p>':''}</div>${c.evidence?'<div class="info-box pr-manual-note">Manually entered evidence keeps priority. Accepting a proposal does not replace your manual academic facts.</div>':''}<form id="pr-review-form" data-id="${esc(id)}" class="pr-field-review">${PR_FIELDS.map(([key,label])=>{const field=research.academic?.[key],supported=PR_canAccept(c,key);return `<div class="pr-field ${supported?'':'pr-field-disabled'}"><label class="pr-field-check"><input type="checkbox" name="pr-review-field" value="${key}" ${supported?'checked':'disabled'}><span>${label}</span></label><strong class="pr-field-value">${esc(PR_value(field))}</strong><p class="pr-field-meta">${esc(field?.basis||'unknown')} · confidence ${esc(PR_confidence(field?.confidence))} · ${field?.asOf?'as of '+esc(PR_date(field.asOf)):'source date not supplied'}</p><div class="pr-field-citations">${PR_sourceLinks(research,field)}</div>${!supported?`<p class="pr-small">${!matched?'Identity needs resolution.':!PR_hasValue(field)?'No source-supported value was found.':'A supporting source URL is required.'}</p>`:''}</div>`}).join('')}</form>${research.warnings?.length?`<div class="notice">${research.warnings.map(esc).join('<br>')}</div>`:''}<div class="drawer-section pr-review-sources"><h3>Inspect the original sources</h3>${(research.sources||[]).map(source=>`<article class="pr-source"><a href="${PR_safeUrl(source.url)}" target="_blank" rel="noopener noreferrer">${icon('external')}${esc(source.title||'Academic source')}</a><small>${source.sourceDate?'Source date '+esc(PR_date(source.sourceDate)):'Source date not supplied'}</small>${source.evidenceExcerpt?`<p>${esc(PR_excerpt(source.evidenceExcerpt))}</p>`:''}</article>`).join('')}</div><div id="pr-review-error" class="pr-error" role="alert"></div>`,`<button class="btn" data-action="profile" data-id="${esc(id)}">Back to profile</button><button class="btn primary" data-action="accept-profile-fields" data-id="${esc(id)}" ${PR_FIELDS.some(([key])=>PR_canAccept(c,key))?'':'disabled'}>${icon('check')} Accept selected fields</button>`);
}

async function PR_accept(id){
  const c=PR_candidate(id);if(!c)return;const keys=[...document.querySelectorAll('input[name="pr-review-field"]:checked')].map(el=>el.value).filter(key=>PR_FIELDS.some(([name])=>name===key)&&PR_canAccept(c,key));
  if(!keys.length){const error=document.getElementById('pr-review-error');if(error)error.textContent='Select at least one supported field with a matched identity and an academic source.';return}
  if(typeof applyReviewedAcademicFields!=='function'){toast('The academic review service is unavailable in this build.');return}
  try{const result=await applyReviewedAcademicFields(id,keys);if(result?.ok===false)throw Error(result.error||'The selected evidence could not be accepted.');
    c.academicResearch.reviewedAt=PR_now();c.academicResearch.reviewedFields=result?.acceptedFields||keys;const job=PR_job(id);if(job){job.state='resolved';job.finishedAt=PR_now();job.error=null}PR_save();PR_redraw();profile(id);toast(result?.manualPreserved?'Review saved. Your manual academic evidence retained priority.':'Selected academic fields accepted.');
  }catch(error){const el=document.getElementById('pr-review-error');if(el)el.textContent=PR_error(error.message)}
}

function PR_attachPilotProfiles(data){
  PR_pilotSelection=String(data.selectionMethod||'');let added=0;
  for(const research of Array.isArray(data.profiles)?data.profiles:[]){const c=PR_candidate(research?.candidateId);if(!c||c.academicResearch||c.academicProfile)continue;if(!research.academic||!Array.isArray(research.sources)||!['matched','ambiguous','unresolved'].includes(research.identity?.status))continue;
    c.academicResearch={...research,origin:'assistant_agents_public_sources'};const job=PR_job(c.id);
    if(!job)state.profileQueue.push({candidateId:c.id,candidateName:c.name,state:'needs_review',addedAt:research.queriedAt||PR_now(),finishedAt:research.queriedAt||null,origin:'assistant_agents_public_sources'});
    else if(!['queued','researching'].includes(job.state))Object.assign(job,{state:'needs_review',finishedAt:research.queriedAt||null,error:null,origin:'assistant_agents_public_sources'});
    added++;
  }
  if(added){PR_save();PR_redraw()}
}

async function profileResearchOnData(){
  normalizeProfileQueue();if(!state.candidates.length)return PR_pilotPromise;
  if(PR_pilotData){PR_attachPilotProfiles(PR_pilotData);return PR_pilotPromise}
  if(PR_pilotLoaded)return PR_pilotPromise;
  PR_pilotLoaded=true;
  PR_pilotPromise=(async()=>{
    try{const response=await atlasFetch('/api/profile-research/pilot',{signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('The public-source research pilot is unavailable.');PR_pilotData=await response.json();PR_attachPilotProfiles(PR_pilotData);
    }catch(error){PR_pilotError=PR_error(error.message)}
  })();return PR_pilotPromise;
}

document.addEventListener('click',async event=>{
  const el=event.target.closest('[data-action]');if(!el)return;const action=el.dataset.action,id=el.dataset.id;
  if(!['queue-profile','queue-selected','open-profile-research','review-profile-research','accept-profile-fields','check-profile-connection','pause-profile-queue','resume-profile-queue'].includes(action))return;
  event.preventDefault();
  if(action==='queue-profile')await PR_enqueue([id]);
  else if(action==='queue-selected')await PR_enqueue([...(state.selected||[])]);
  else if(action==='open-profile-research'){state.view='profile-research';PR_redraw();await PR_checkConnection();PR_redraw()}
  else if(action==='review-profile-research')openProfileResearchReview(id);
  else if(action==='accept-profile-fields')await PR_accept(id);
  else if(action==='check-profile-connection'){await PR_checkConnection(true);PR_redraw();toast(PR_connection.configured?'Server model configuration is present.':PR_connection.error||'Live research requires the approved server model setup.')}
  else if(action==='pause-profile-queue'){PR_pauseRequested=true;PR_redraw();toast(PR_running?'The queue will pause after the current author finishes.':'The queue is paused.')}
  else if(action==='resume-profile-queue')await PR_resume();
});

normalizeProfileQueue();
profileResearchOnData();
PR_redraw();


function snapshotProfileSection(c){
 const research=c.academicResearch,accepted=c.academicProfile?.fields||{};
 if(!research&&!Object.keys(accepted).length)return `<section class="drawer-section pr-profile-section"><h3>Academic profile evidence</h3><p>No academic profile research was published for this author. Publication metadata does not establish their current status or graduation date.</p></section>`;
 return `<section class="drawer-section pr-profile-section"><div class="pr-section-heading"><h3>Published academic evidence</h3>${research?`<span class="pr-status pr-status-needs_review">Identity ${esc(research.identity?.status||'unresolved')}</span>`:''}</div>${research?`<p class="pr-origin">Source-backed research proposal · researched ${esc(PR_date(research.queriedAt))}</p><p>${esc(research.identity?.rationale||'Compare each source against the publication identity.')}</p>`:''}${Object.keys(accepted).length?`<div class="pr-reviewed-facts"><h4>Evidence reviewed in this browser</h4>${PR_FIELDS.filter(([key])=>accepted[key]).map(([key,label])=>`<div class="pr-reviewed-fact"><span>${label}</span><strong>${esc(PR_value(accepted[key]))}</strong>${PR_sourceLinks({sources:c.academicProfile.sources||research?.sources||[]},accepted[key])}</div>`).join('')}</div>`:''}${research?`<button class="btn" data-action="review-profile-research" data-id="${esc(c.id)}">${icon('shield')} Inspect cited findings</button>`:''}<p class="pr-small">Published source dates remain visible. Reviews and manual evidence stay in this browser.</p></section>`;
}
function snapshotProfileWorkspace(){
 const proposals=state.candidates.filter(c=>c.academicResearch);
 return `<div class="section-content pr-workspace"><div class="pr-workflow-note snapshot-findings-note">${icon('shield')}<div><strong>Published findings, with their original sources.</strong><p>These are research proposals from the published snapshot. Check identity, citations, and source dates before accepting a field. Your reviews are saved in this browser. New AI research runs separately.</p></div></div>${PR_pilotSelection?`<p class="pr-small">Published pilot selection: ${esc(PR_pilotSelection)}</p>`:''}${PR_pilotError?`<p class="pr-error">${esc(PR_pilotError)}</p>`:''}<section class="pr-review-list"><div class="pr-section-heading"><div><h2>Academic research proposals <span class="number-pill">${proposals.length}</span></h2><p>Cited public academic evidence · review required</p></div></div>${proposals.length?`<div class="pr-proposal-grid">${proposals.map(c=>`<article class="panel pr-proposal-card"><div class="pr-section-heading"><h3>${esc(c.name)}</h3><span class="pr-status pr-status-${c.academicResearch.identity?.status==='matched'?'needs_review':'failed'}">Identity ${esc(c.academicResearch.identity?.status||'unresolved')}</span></div><p>${esc(c.academicResearch.identity?.rationale||'Check the academic sources against the published author record.')}</p><div class="pr-small">${(c.academicResearch.sources||[]).length} sources · researched ${esc(PR_date(c.academicResearch.queriedAt))}${c.academicProfile?' · Reviewed locally':' · Unreviewed proposal'}</div><button class="btn" data-action="review-profile-research" data-id="${esc(c.id)}">${icon('shield')} Inspect academic evidence</button></article>`).join('')}</div>`:`<div class="panel empty"><h3>${state.loading?'Loading published evidence…':'No academic proposals in this collection.'}</h3><p>Browse the published paper records or download the available research artifacts.</p></div>`}</section></div>`;
}
