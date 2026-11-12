'use strict';

// The server owns the shared registry, immutable versions, validation records,
// activation pointers, and source snapshots. Browser state is only a view.
const SP_CURRENT_YEAR = typeof YEAR==='number'?YEAR:new Date().getFullYear();
const SP_state = {plans:[],status:null,loading:false,loaded:false,error:'',message:'',busy:null,conference:'all',year:'all',formConference:'sigcomm',formYear:SP_CURRENT_YEAR};
let SP_loadPromise = null;

function SP_escape(value){return esc(String(value??''))}
function SP_url(value){const safe=typeof url==='function'?url(value):'#';return safe==='#'?'#':safe}
function SP_message(value){return typeof value==='string'?value:String(value?.message||value?.code||'Source validation issue')}
function SP_scope(row){const plan=row?.plan||{};return {conferenceId:plan.conferenceId||row?.conferenceId,year:Number(plan.year||row?.year),track:plan.track||row?.track||'main'}}
function SP_scopeKey(row){const scope=SP_scope(row);return row.scopeKey||`${scope.conferenceId}:${scope.year}:${scope.track}`}
function SP_conference(id){return CONFERENCES.find(c=>c.id===id)}
function SP_name(id){return SP_conference(id)?.name||id||'Unknown conference'}
function SP_date(value){if(!value)return 'Not recorded';const text=String(value);if(/^\d{4}(?:-\d{2}(?:-\d{2})?)?$/.test(text))return text;const date=new Date(value);return Number.isNaN(date.getTime())?'Not recorded':date.toLocaleString('en-US',{year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}
function SP_adapter(row){const adapter=row.plan?.adapter;if(typeof adapter==='string')return adapter+(row.plan?.adapterVersion?' · v'+row.plan.adapterVersion:'');return adapter?.id?(adapter.id+(adapter.version?' · v'+adapter.version:'')):'Adapter not mapped'}
function SP_active(row){return SP_state.plans.filter(p=>SP_scopeKey(p)===SP_scopeKey(row)&&p.status==='active').sort((a,b)=>Number(b.version)-Number(a.version))[0]||null}
function SP_canActivate(row){const check=row?.latestValidation;return row?.status==='candidate'&&check?.verdict==='pass'&&Boolean(check.id&&row.planDigest&&check.planDigest===row.planDigest)}
function SP_storageReady(){return SP_state.status?.storageAvailable===true}
function SP_label(status){return {active:'Active',candidate:'Candidate',quarantined:'Quarantined',pass:'Checks passed',quarantine:'Quarantined',complete:'Complete',partial:'Partial',unknown:'Unknown'}[status]||String(status||'Unknown')}
function SP_badge(status){return `<span class="sp-badge sp-badge-${SP_escape(status)}">${SP_escape(SP_label(status))}</span>`}
function SP_row(id){return SP_state.plans.find(row=>row.id===id)}
function SP_redraw(){if(typeof render==='function')render()}
function SP_disabled(){return Boolean(SP_state.busy)||!SP_storageReady()}

async function SP_fetch(path,body){
  const response=await atlasFetch(path,{...(body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),signal:AbortSignal.timeout(body===undefined?20000:150000)});
  let data;try{data=await response.json()}catch{throw Error('The source-plan service did not return a readable response.')}
  if(!response.ok||data?.ok===false){const error=new Error(String(data?.error||data?.message||'The source-plan request could not be completed.').slice(0,500));error.status=response.status;error.code=data?.code;throw error}
  return data;
}

async function sourcePlansOnData(force=false){
  if(SP_loadPromise)return SP_loadPromise;if(SP_state.loaded&&!force)return;
  SP_state.loading=true;SP_state.error='';
  SP_loadPromise=(async()=>{
    const [status,list]=await Promise.allSettled([SP_fetch('/api/source-plans/status'),SP_fetch('/api/source-plans')]);
    if(status.status==='fulfilled')SP_state.status=status.value;else SP_state.error=String(status.reason?.message||'Source-plan connection status is unavailable.');
    if(list.status==='fulfilled'){SP_state.plans=Array.isArray(list.value.plans)?list.value.plans:[];if(!SP_state.status)SP_state.status={storageAvailable:list.value.storageAvailable===true,modelConfigured:false,missing:[],adapters:[]}}
    else SP_state.error=[SP_state.error,String(list.reason?.message||'The source registry could not be loaded.')].filter(Boolean).join(' ');
    SP_state.loaded=true;SP_state.loading=false;SP_loadPromise=null;SP_redraw();
  })();return SP_loadPromise;
}

function SP_statusPanel(){
  const status=SP_state.status,storage=status?.storageAvailable===true,model=status?.modelConfigured===true;
  return `<section class="sp-service-status"><div><span class="sp-status-light ${storage?'sp-status-light-ready':''}"></span><strong>${storage?'Shared source registry available':status?'Shared source registry unavailable':'Checking the source registry…'}</strong><p>${storage?'Plans, validation checks, versions, and snapshot references are stored by the local research server.':'Durable source-plan storage must be configured before plans can be validated, activated, or collected here.'}</p></div><div><span class="sp-status-light ${model?'sp-status-light-ready':''}"></span><strong>${model?'Agent discovery settings present':'Agent discovery is not connected'}</strong><p>${model?'Settings are present. Provider access is checked when discovery runs; a proposal still requires validation and explicit activation.':'Configure the server API key and research model to discover or repair sources. Known source adapters remain independent of the model.'}</p></div>${status?.missing?.length?`<p class="sp-configuration-note">Server configuration required: ${status.missing.map(SP_escape).join(', ')}. Credentials are never entered in this dashboard.</p>`:''}</section>`;
}

function SP_validation(row){
  const check=row.latestValidation;if(!check)return `<div class="sp-validation sp-validation-pending">${icon('shield')}<div><strong>Not validated</strong><p>Validate the official authority, edition year, accepted-paper track, pagination, counts, and representative records before activation.</p></div></div>`;
  const bound=Boolean(row.planDigest&&check.planDigest===row.planDigest),failures=Array.isArray(check.failures)?check.failures:[],warnings=Array.isArray(check.warnings)?check.warnings:[];
  return `<div class="sp-validation ${check.verdict==='pass'&&bound?'sp-validation-pass':'sp-validation-quarantine'}"><div class="sp-validation-heading"><strong>${check.verdict==='pass'?'Validation checks passed':'Validation quarantined this proposal'}</strong>${SP_badge(check.coverage||'unknown')}</div><dl class="sp-validation-facts"><div><dt>Checked</dt><dd>${SP_escape(SP_date(check.checkedAt))}</dd></div><div><dt>Observed records</dt><dd>${check.observedCount==null?'Not established':SP_escape(check.observedCount)}</dd></div><div><dt>Publisher count</dt><dd>${check.publishedCount==null?'Not stated':SP_escape(check.publishedCount)}</dd></div></dl>${!bound?'<p class="sp-warning">This check does not bind to the current plan digest. Validate this exact version again before activation.</p>':''}${failures.length?`<ul class="sp-failures">${failures.map(value=>`<li>${SP_escape(SP_message(value))}</li>`).join('')}</ul>`:''}${warnings.length?`<ul class="sp-warnings">${warnings.map(value=>`<li>${SP_escape(SP_message(value))}</li>`).join('')}</ul>`:''}<p class="sp-small">A valid plan and complete paper coverage are separate checks. Partial or unknown coverage never means a complete accepted-paper census.</p></div>`;
}

function SP_snapshot(row){
  const success=row.lastSuccess,attempt=row.lastAttempt;if(!success&&!attempt)return '<p class="sp-small">No source collection has been recorded for this plan.</p>';
  const stale=Boolean(success&&(success.stale||row.stale||attempt?.error||/fail|error|stale|unavailable|quarantin/i.test(attempt?.status||'')));
  return `<div class="sp-snapshot ${stale?'sp-snapshot-stale':''}"><strong>${stale?'Dated successful snapshot retained':'Source collection history'}</strong>${success?`<p>${SP_escape(success.paperCount??'Unknown')} paper records · original retrieval ${SP_escape(SP_date(success.retrievedAt))}</p>`:'<p>No successful snapshot is available yet.</p>'}${success?.coverage?`<p class="sp-small">${SP_escape(typeof success.coverage==='string'?success.coverage:success.coverage.completenessLabel||success.coverage.coverage||'Coverage details are retained with the source snapshot.')}</p>`:''}${attempt?`<p class="sp-small">Last attempt: ${SP_escape(SP_date(attempt.attemptedAt))} · ${SP_escape(attempt.status||'Status not recorded')}${attempt.error?' · '+SP_escape(attempt.error):''}</p>`:''}${stale?'<p class="sp-warning">The failed or degraded attempt did not change the successful snapshot’s original retrieval date. Inspect its age before using the records.</p>':''}</div>`;
}

function SP_version(row){
  const plan=row.plan||{},scope=SP_scope(row),active=SP_active(row),pass=SP_canActivate(row),busy=SP_state.busy,disabled=SP_disabled();
  return `<article class="sp-version"><div class="sp-version-heading"><div><h3>Version ${SP_escape(row.version)}</h3><span class="sp-adapter">${SP_escape(SP_adapter(row))}</span></div>${SP_badge(row.status)}</div><div class="sp-source-links"><div><span>Official entry</span><a href="${SP_url(plan.entryUrl)}" target="_blank" rel="noopener noreferrer">${SP_escape(plan.entryUrl||'Not supplied')} ${icon('external')}</a></div><div><span>Authority</span><a href="${SP_url(plan.authorityUrl)}" target="_blank" rel="noopener noreferrer">${SP_escape(plan.authorityUrl||'Not supplied')} ${icon('external')}</a></div></div>${SP_validation(row)}${SP_snapshot(row)}<details class="sp-plan-json"><summary>Inspect the declarative extraction plan</summary><pre>${SP_escape(JSON.stringify(plan,null,2))}</pre><p class="sp-small">Plan digest: ${SP_escape(row.planDigest||'Not supplied')}</p></details>${row.status==='candidate'?`<div class="sp-activation-preview"><strong>Activation preview</strong><p>Activate version ${SP_escape(row.version)} for ${SP_escape(SP_name(scope.conferenceId))} ${scope.year} · main accepted papers. ${active?`Version ${SP_escape(active.version)} is currently active; its plan remains in version history.`:'This scope has no active plan yet.'}</p>${!pass?'<p class="sp-small">Activation requires a passing validation check bound to this exact plan digest.</p>':''}</div>`:''}<div class="sp-plan-actions"><button class="btn" data-action="sp-validate" data-id="${SP_escape(row.id)}" ${disabled?'disabled':''}>${icon('shield')} ${busy?.action==='validate'&&busy.planId===row.id?'Validating…':'Validate source'}</button>${row.status==='candidate'?`<button class="btn primary" data-action="sp-promote" data-id="${SP_escape(row.id)}" ${disabled||!pass?'disabled':''}>${icon('check')} ${busy?.action==='promote'&&busy.planId===row.id?'Activating…':'Activate validated plan'}</button>`:''}${row.status==='active'?`<button class="btn primary" data-action="sp-collect" data-id="${SP_escape(row.id)}" ${disabled?'disabled':''}>${icon('download')} ${busy?.action==='collect'&&busy.planId===row.id?'Collecting…':'Collect with active plan'}</button>`:''}</div></article>`;
}

function sourcePlanWorkspace(){
  if(Boolean(globalThis.TALENT_ATLAS_STATIC))return snapshotSourcesWorkspace();
  const visible=SP_state.plans.filter(row=>{const scope=SP_scope(row);return (SP_state.conference==='all'||scope.conferenceId===SP_state.conference)&&(SP_state.year==='all'||scope.year===Number(SP_state.year))&&scope.track==='main'}),groups=new Map();
  for(const row of visible){const key=SP_scopeKey(row);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row)}
  const scopes=[...groups.values()].sort((a,b)=>SP_name(SP_scope(a[0]).conferenceId).localeCompare(SP_name(SP_scope(b[0]).conferenceId))||SP_scope(b[0]).year-SP_scope(a[0]).year);
  const years=[...new Set(SP_state.plans.map(row=>SP_scope(row).year).filter(Number.isInteger))].sort((a,b)=>b-a),canDiscover=SP_storageReady()&&SP_state.status?.modelConfigured===true&&!SP_state.busy;
  return `<div class="section-content sp-workspace">${SP_statusPanel()}<section class="panel sp-discovery"><div class="table-top"><div><h2 class="table-title">Resolve a conference source</h2><p>Known adapters collect deterministically. Agent discovery proposes missing or changed source plans.</p></div></div><form id="sp-discovery-form" class="sp-discovery-form"><div class="field"><label for="sp-conference">Conference</label><select id="sp-conference" name="conferenceId">${CONFERENCES.map(c=>`<option value="${SP_escape(c.id)}" ${SP_state.formConference===c.id?'selected':''}>${SP_escape(c.name)} · ${SP_escape(c.area)}</option>`).join('')}</select></div><div class="field"><label for="sp-year">Edition year</label><input id="sp-year" name="year" type="number" min="2000" max="${SP_CURRENT_YEAR}" value="${SP_state.formYear}" required></div><div class="sp-track-note">${icon('book')}<span>Main accepted-paper track</span></div><button class="btn primary" data-action="sp-discover" ${canDiscover?'':'disabled'}>${icon('spark')} ${SP_state.busy?.action==='discover'?'Discovering source…':'Discover / repair source'}</button></form><p class="sp-small sp-discovery-note">Discovery never activates a proposal. The exact plan must pass validation, then be activated with the preview below. Source pages are treated as data; plans contain declarative extraction settings.</p></section>${SP_state.error?`<div class="sp-error" role="alert">${SP_escape(SP_state.error)}</div>`:''}${SP_state.message?`<div class="sp-result" role="status">${SP_escape(SP_state.message)}</div>`:''}<div class="sp-registry-heading"><div><h2>Source plan registry <span class="number-pill">${groups.size} scopes · ${visible.length} versions</span></h2><p>Conference / edition year / main track · shared within this local research workspace</p></div><button class="btn" data-action="sp-refresh" ${SP_state.loading||SP_state.busy?'disabled':''}>${icon('refresh')} ${SP_state.loading?'Loading…':'Reload registry'}</button></div><div class="filters sp-registry-filters"><select id="sp-filter-conference" aria-label="Filter source-plan conference"><option value="all">All conferences</option>${CONFERENCES.map(c=>`<option value="${SP_escape(c.id)}" ${SP_state.conference===c.id?'selected':''}>${SP_escape(c.name)}</option>`).join('')}</select><select id="sp-filter-year" aria-label="Filter source-plan year"><option value="all">All edition years</option>${years.map(year=>`<option value="${year}" ${SP_state.year===String(year)?'selected':''}>${year}</option>`).join('')}</select></div>${scopes.length?scopes.map(rows=>{rows.sort((a,b)=>Number(b.version)-Number(a.version));const scope=SP_scope(rows[0]),active=rows.find(row=>row.status==='active');return `<section class="panel sp-scope"><header><div><h2>${SP_escape(SP_name(scope.conferenceId))} <span>${scope.year}</span></h2><p>Main accepted papers · ${rows.length} ${rows.length===1?'version':'versions'}</p></div>${active?`<span class="sp-badge sp-badge-active">Active version ${SP_escape(active.version)}</span>`:'<span class="sp-badge sp-badge-candidate">No active plan</span>'}</header>${rows.map(SP_version).join('')}</section>`}).join(''):`<section class="panel empty"><h3>${SP_state.loading?'Loading source plans…':'No plans in this scope'}</h3><p>${SP_state.loading?'Reading the local research registry.':'Choose another conference or edition year, or propose a missing source when agent discovery is configured.'}</p></section>`}<div class="sp-operating-note">${icon('shield')}<span>Authority, edition year, accepted track, pagination, count discrepancies, and sample records are checked before activation. An unavailable refresh retains dated successful data; it never creates substitute papers.</span></div></div>`;
}

async function SP_mutate(action,row){
  if(Boolean(globalThis.TALENT_ATLAS_STATIC)){toast('Published source plans are available for inspection. New collection runs separately.');return}
  if(SP_state.busy)return;if(!SP_storageReady()){toast('Shared source-plan storage is unavailable. No registry change was made.');return}
  if(action==='promote'&&!SP_canActivate(row)){toast('Validate this exact plan version before activation.');return}
  const scope=SP_scope(row);SP_state.busy={action,planId:row.id};SP_state.error='';SP_state.message='';SP_redraw();
  try{
    if(action==='validate'){const result=await SP_fetch('/api/source-plans/validate',{planId:row.id}),check=result.validation||result.check||result;
      SP_state.message=check.verdict==='pass'?'Validation passed. Inspect its coverage and exact-version binding before activating the plan.':check.verdict==='quarantine'?'The validation report quarantined this proposal. It cannot be activated.':'Validation finished. Review the server report below.';
    }else if(action==='promote'){const active=SP_active(row);await SP_fetch('/api/source-plans/promote',{planId:row.id,checkId:row.latestValidation.id,expectedActiveId:active?.id||null});SP_state.message=`Version ${row.version} was activated for ${SP_name(scope.conferenceId)} ${scope.year} · main.`;
    }else if(action==='collect'){
      if(row.status!=='active')throw Error('Only the active source plan can collect this scope.');const result=await SP_fetch('/api/source-plans/collect',{conferenceId:scope.conferenceId,year:scope.year,track:'main'});const collection=result.collection||result;
      if(!Array.isArray(collection.papers)||!collection.papers.length){SP_state.message='No paper records were returned. Your existing talent workspace has been kept.';}
      else{if(typeof applyCollection!=='function')throw Error('The collection integration is unavailable in this build.');applyCollection(collection,{startYear:scope.year,endYear:scope.year});if(typeof notifyActivity==='function')notifyActivity('Collected with an active source plan',`${SP_name(scope.conferenceId)} ${scope.year}: ${collection.papers.length} paper records; source coverage is attached.`);state.view='papers';toast(`${collection.papers.length} paper records loaded. Inspect source coverage before screening.`)}
    }
    await sourcePlansOnData(true);
  }catch(error){const message=error.status===409?'The active plan or validation changed on the server. Reload the registry and inspect the current version before trying again.':String(error.message||'The source-plan operation failed.');if(error.status===409)await sourcePlansOnData(true);SP_state.error=message;toast(message)}
  finally{SP_state.busy=null;SP_redraw()}
}

async function SP_discover(){
  if(SP_state.busy)return;if(!SP_storageReady()||!SP_state.status?.modelConfigured){toast('Agent discovery requires the approved server model setup and shared source-plan storage. No discovery request was sent.');return}
  const form=document.getElementById('sp-discovery-form');if(!form?.reportValidity())return;
  const data=new FormData(form),conferenceId=String(data.get('conferenceId')||''),year=Number(data.get('year'));
  if(!SP_conference(conferenceId)||!Number.isInteger(year)||year<2000||year>SP_CURRENT_YEAR){toast('Choose a catalog conference and an edition year from 2000 through the current year.');return}
  SP_state.formConference=conferenceId;SP_state.formYear=year;SP_state.busy={action:'discover'};SP_state.error='';SP_state.message='';SP_redraw();
  try{await SP_fetch('/api/source-plans/discover',{conferenceId,year,track:'main'});SP_state.message='The source proposal was saved. Inspect its official authority and extraction plan, then validate it before activation.';await sourcePlansOnData(true)}
  catch(error){SP_state.error=String(error.message||'Source discovery could not be completed.');toast(SP_state.error)}
  finally{SP_state.busy=null;SP_redraw()}
}

document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-action]');if(!button)return;const action=button.dataset.action;
  if(!['open-source-plans','sp-refresh','sp-discover','sp-validate','sp-promote','sp-collect'].includes(action))return;event.preventDefault();
  if(action==='open-source-plans'){state.view='source-plans';SP_redraw();await sourcePlansOnData()}
  else if(action==='sp-refresh')await sourcePlansOnData(true);
  else if(action==='sp-discover')await SP_discover();
  else{const row=SP_row(button.dataset.id);if(!row){toast('Reload the registry to find this plan version.');return}await SP_mutate(action.slice(3),row)}
});
document.addEventListener('change',event=>{
  const element=event.target;
  if(element.id==='sp-filter-conference'){SP_state.conference=element.value;SP_redraw()}
  else if(element.id==='sp-filter-year'){SP_state.year=element.value;SP_redraw()}
  else if(element.id==='sp-conference')SP_state.formConference=element.value;
  else if(element.id==='sp-year')SP_state.formYear=Number(element.value);
});
document.addEventListener('submit',async event=>{if(event.target.id==='sp-discovery-form'){event.preventDefault();await SP_discover()}});

sourcePlansOnData();


function snapshotSourcesWorkspace(){
 const plans=SP_state.plans.filter(row=>{const scope=SP_scope(row);return (SP_state.conference==='all'||scope.conferenceId===SP_state.conference)&&(SP_state.year==='all'||scope.year===Number(SP_state.year))});
 const years=[...new Set(SP_state.plans.map(row=>SP_scope(row).year))].sort((a,b)=>b-a);
 return `<div class="section-content sp-workspace"><div class="pr-workflow-note snapshot-findings-note">${icon('link')}<div><strong>The publisher sources behind the collection.</strong><p>Inspect the published extraction plans and their recorded validation. New discovery, validation, and collection run in the research workspace. Coverage and validation are separate checks.</p></div></div><div class="sp-registry-heading"><div><h2>Published source plans <span class="number-pill">${plans.length}</span></h2><p>Official authorities · edition scope · original check dates</p></div></div><div class="filters sp-registry-filters"><select id="sp-filter-conference" aria-label="Filter source-plan conference"><option value="all">All conferences</option>${CONFERENCES.map(c=>`<option value="${SP_escape(c.id)}" ${SP_state.conference===c.id?'selected':''}>${SP_escape(c.name)}</option>`).join('')}</select><select id="sp-filter-year" aria-label="Filter source-plan year"><option value="all">All edition years</option>${years.map(year=>`<option value="${year}" ${SP_state.year===String(year)?'selected':''}>${year}</option>`).join('')}</select></div>${SP_state.error?`<p class="sp-error">${SP_escape(SP_state.error)}</p>`:''}<div class="snapshot-source-grid">${plans.map(row=>{const scope=SP_scope(row),plan=row.plan||{},check=row.validation||row.latestValidation||{};return `<article class="panel snapshot-source"><div class="pr-section-heading"><h3>${SP_escape(SP_name(scope.conferenceId))} ${scope.year}</h3><span class="sp-badge sp-badge-${check.ok||check.verdict==='pass'?'pass':'unknown'}">${check.ok||check.verdict==='pass'?'Validated plan':'Check not established'}</span></div><span class="sp-small">Version ${SP_escape(row.version)} · ${SP_escape(SP_adapter(row))}</span><div class="sp-source-links"><div><span>Official publisher entry</span><a href="${SP_url(plan.entryUrl)}" target="_blank" rel="noopener noreferrer">${SP_escape(plan.entryUrl)} ${icon('external')}</a></div></div><p class="sp-small">Checked ${SP_escape(SP_date(check.checkedAt))} · ${SP_escape(check.parsedPapers??check.observedCount??'Unknown')} parsed records</p><p class="sp-small">Accepted-paper census: ${SP_escape(check.completenessStatus||check.coverage||'unknown')}${check.expectedPapers!=null?' · Publisher states '+SP_escape(check.expectedPapers):''}</p>${check.warnings?.length?`<ul class="sp-warnings">${check.warnings.map(warning=>`<li>${SP_escape(SP_message(warning))}</li>`).join('')}</ul>`:''}<details><summary>Inspect plan and recorded validation</summary><pre>${SP_escape(JSON.stringify(row,null,2))}</pre></details></article>`}).join('')}</div>${plans.length?'':`<section class="panel empty"><h3>${SP_state.loading?'Loading published source plans…':'No published plans in this scope.'}</h3><p>Choose another conference or edition year.</p></section>`}</div>`;
}
