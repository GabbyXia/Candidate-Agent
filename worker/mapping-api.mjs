import {resolveMappingPlan} from './mapping-plan.mjs';
import {makeMappingRunService} from './mapping-runs.mjs';
import {collectWithSourcePlan} from './source-plan-api.mjs';
import {researchAcademicProfile} from './profile-research.mjs';

const mappingApiRates=new Map();
function mappingApiJson(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}})}
function mappingApiAllowed(request){const key=request.headers.get('oai-authenticated-user-id')||request.headers.get('cf-connecting-ip')||'private-site';const now=Date.now(),old=mappingApiRates.get(key);if(mappingApiRates.size>250)for(const [id,entry]of mappingApiRates)if(now-entry.time>60000)mappingApiRates.delete(id);if(old&&now-old.time<60000){if(old.count>=600)return false;old.count++}else mappingApiRates.set(key,{time:now,count:1});return true}
async function mappingApiBody(request){if(!request.headers.get('content-type')?.includes('application/json'))throw Error('Send a JSON request.');const raw=await request.text();if(raw.length>16384)throw Error('Mapping settings exceed the request size limit.');let data;try{data=JSON.parse(raw)}catch{throw Error('Send valid JSON.')}if(!data||typeof data!=='object'||Array.isArray(data))throw Error('Send a JSON object.');return data}
function mappingApiKeys(body,keys){if(Object.keys(body).some(key=>!keys.includes(key)))throw Error('Unsupported mapping-run settings.');}
function mappingService(env,integrations){return makeMappingRunService(env,{
 planRun:input=>resolveMappingPlan(input),
 collectEdition:async(scope,input)=>{
  const result=await collectWithSourcePlan(scope,env,{refresh:input?.refresh!==false,allowDiscovery:true});if(result.papers?.length)return result;
  if(result.discoveryStatus==='connection_required')return {...result,status:'connection_required'};
  // A source-agent attempt can incur API usage. Do not automatically repeat it
  // as though it were only a safe, unauthenticated publisher fetch.
  if(result.repair||result.automaticRepair||result.discoveryStatus)return {...result,status:result.repair?.status==='adapter_required'?'adapter_required':'source_not_connected',error:result.repair?.error||result.error||result.discoveryError||'Source discovery needs review before another attempt.'};
  return result;
 },
 normalizeCollection:integrations.normalizeCollection,
 researchAuthor:async(candidate,papers)=>{
  const byId=new Map(papers.map(p=>[p.id,p]));const anchors=(candidate.paperIds||candidate.papers?.map(p=>p.id)||[]).slice(0,5).map(id=>byId.get(id)).filter(Boolean);
  return researchAcademicProfile({id:candidate.id,name:candidate.name,publishedAffiliation:candidate.affiliation,papers:anchors.map(p=>({id:p.id,title:p.title,url:p.url,coauthors:(p.authors||[]).map(a=>a.name)}))},env);
 },
})}

export async function handleMappingRunApi(request,env={},integrations={}){
 const url=new URL(request.url),path=url.pathname;if(!path.startsWith('/api/mapping-runs'))return null;
 if(path==='/api/mapping-runs/status'&&request.method==='GET'){
  const missing=['OPENAI_API_KEY','OPENAI_RESEARCH_MODEL'].filter(key=>!String(env[key]||'').trim());return mappingApiJson({storageAvailable:Boolean(env.DB&&env.BUCKET),modelConfigured:!missing.length,missing,maxConcurrentTasks:3,execution:'persistent_checkpoints_with_active_browser_driver',planningMethod:'curated_catalog',criteria:['research_alignment','academic_status','graduation_timing'],excelExport:true});
 }
 if(path==='/api/mapping-runs/plan'&&request.method==='POST'){
  try{const input=await mappingApiBody(request),result=resolveMappingPlan(input);return mappingApiJson(result,result.httpStatus||200)}catch(error){return mappingApiJson({ok:false,status:'invalid_input',error:error.message},400)}
 }
 const service=mappingService(env,integrations);
 if(path==='/api/mapping-runs'&&request.method==='GET'){const result=await service.list();return mappingApiJson(result,result.httpStatus|| (result.ok?200:503))}
 if(request.method!=='GET'&&!mappingApiAllowed(request))return mappingApiJson({ok:false,status:'rate_limited',error:'The run is advancing quickly. Wait a moment before another request.'},429);
 if(path==='/api/mapping-runs'&&request.method==='POST'){
  try{const input=await mappingApiBody(request),planned=resolveMappingPlan(input);if(!planned.ok)return mappingApiJson(planned,planned.httpStatus||400);const result=await service.create(input);return mappingApiJson(result,result.httpStatus|| (result.ok?201:503))}catch{return mappingApiJson({ok:false,status:'invalid_input',error:'The mapping run could not be created from these settings.'},400)}
 }
 const match=path.match(/^\/api\/mapping-runs\/([^/]+)(?:\/(advance|pause|resume|retry))?$/);if(!match)return mappingApiJson({ok:false,status:'not_found',error:'Mapping-run route not found.'},404);
 let id;try{id=decodeURIComponent(match[1])}catch{return mappingApiJson({ok:false,status:'invalid_input',error:'Invalid mapping-run ID.'},400)}if(!/^[A-Za-z0-9:_-]{1,200}$/.test(id))return mappingApiJson({ok:false,status:'invalid_input',error:'Invalid mapping-run ID.'},400);
 if(!match[2]&&request.method==='GET'){const result=await service.get(id,{includeResult:url.searchParams.get('includeResult')!=='false'});return mappingApiJson(result,result.httpStatus|| (result.ok?200:404))}
 if(request.method!=='POST'||!match[2])return mappingApiJson({ok:false,status:'not_found',error:'Mapping-run route not found.'},404);
 try{
  const body=await mappingApiBody(request);let result;
  if(match[2]==='advance'){mappingApiKeys(body,['maxTasks']);if(body.maxTasks!=null&&(!Number.isInteger(body.maxTasks)||body.maxTasks<1||body.maxTasks>3))throw Error('Advance one to three independent tasks.');result=await service.advance(id,{maxTasks:body.maxTasks||1})}
  else if(match[2]==='pause'){mappingApiKeys(body,[]);result=await service.pause(id)}
  else{mappingApiKeys(body,['retryUncertain']);if(body.retryUncertain!=null&&typeof body.retryUncertain!=='boolean')throw Error('Retry setting must be boolean.');result=await service.resume(id,{retryUncertain:match[2]==='retry'||body.retryUncertain===true})}
  return mappingApiJson(result,result.httpStatus|| (result.ok?200:409));
 }catch(error){return mappingApiJson({ok:false,status:'invalid_input',error:error.message||'The mapping-run action could not be completed.'},400)}
}
