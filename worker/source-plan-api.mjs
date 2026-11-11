import { CONFERENCES } from '../shared/catalog.js';
import { makeSourcePlanService } from './source-plans.mjs';
import { discoverConferenceSource } from './source-discovery.mjs';

const sourceApiRate=new Map();
function sourceApiJson(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}})}
function sourceModelState(env){const missing=[];if(!String(env.OPENAI_API_KEY||'').trim())missing.push('OPENAI_API_KEY');if(!String(env.OPENAI_SOURCE_MODEL||env.OPENAI_RESEARCH_MODEL||'').trim())missing.push('OPENAI_SOURCE_MODEL or OPENAI_RESEARCH_MODEL');return {modelConfigured:missing.length===0,missing}}
function sourceApiAllowed(request){const key=request.headers.get('oai-authenticated-user-id')||request.headers.get('cf-connecting-ip')||'private-site';const now=Date.now(),row=sourceApiRate.get(key);if(sourceApiRate.size>250)for(const [id,entry]of sourceApiRate)if(now-entry.time>60000)sourceApiRate.delete(id);if(row&&now-row.time<60000){if(row.count>=30)return false;row.count++}else sourceApiRate.set(key,{time:now,count:1});return true}
async function sourceApiBody(request){if(!request.headers.get('content-type')?.includes('application/json'))throw Error('Send a JSON request.');if(Number(request.headers.get('content-length'))>16384)throw Error('Request is too large.');const raw=await request.text();if(raw.length>16384)throw Error('Request is too large.');let data;try{data=JSON.parse(raw)}catch{throw Error('Send valid JSON.')}if(!data||typeof data!=='object'||Array.isArray(data))throw Error('Send a JSON object.');return data}
function sourceApiScope(body){const year=Number(body.year);if(typeof body.conferenceId!=='string'||!CONFERENCES.some(c=>c.id===body.conferenceId)||!Number.isInteger(year)||year<2000||year>new Date().getUTCFullYear()||body.track!=='main')throw Error('Choose a catalog conference, a valid publication year, and the main track.');return {conferenceId:body.conferenceId,year,track:'main'}}
function sourceApiKeys(body,allowed){if(Object.keys(body).some(key=>!allowed.includes(key)))throw Error('This operation received unsupported fields.');}
function sourceApiId(id){return typeof id==='string'&&id.length>0&&id.length<=240&&!/[\u0000-\u001f]/.test(id)}
function sourceRepairNeeded(result){return result?.repairRequired===true||['not_found','plan_missing','source_missing','repair_required','validation_failed','quarantined','quarantine','adapter_required','adapter_missing'].includes(result?.status)||result?.lastAttempt?.repairRequired===true||['quarantine','quarantined','drift','adapter_missing'].includes(result?.check?.verdict)}

// A manual discovery creates a reviewable version. Automatic collection can
// promote a repair only after the same deterministic validation passes.
export async function discoverSourcePlan(scope,env,{service=makeSourcePlanService(env),activate=false}={}){
 const conference=CONFERENCES.find(c=>c.id===scope.conferenceId);if(!conference)return {ok:false,status:'invalid_scope',httpStatus:400,error:'Conference is not in the curated catalog.'};
 if(!env.DB||!env.BUCKET)return {ok:false,status:'storage_unavailable',httpStatus:503,error:'Persistent source-plan storage must be available before a discovery proposal can be recorded.'};
 const discovered=await discoverConferenceSource(scope,conference,env);if(!discovered.ok||!discovered.plan)return discovered;
 const previous=await service.get(scope);const current=previous.plan?.status==='active'?previous.plan.id:null;
 const proposed=await service.propose(discovered.plan,{createdBy:activate?'agent_repair':'agent'});if(!proposed.ok)return proposed;
 const checked=await service.validate(proposed.plan.id);if(!checked.ok||checked.check?.verdict!=='pass')return {...checked,plan:proposed.plan,status:'quarantined',httpStatus:422,error:checked.error||'The discovered source did not pass deterministic validation.'};
 if(!activate)return {ok:true,status:'validated_candidate',httpStatus:200,plan:{...proposed.plan,latestValidation:checked.check},check:checked.check,evidence:discovered.evidence||[]};
 const promoted=await service.promote(proposed.plan.id,checked.check.id,current);return {...promoted,automaticRepair:true,discoveryEvidence:discovered.evidence||[]};
}

export async function collectWithSourcePlan(scope,env,{service=makeSourcePlanService(env),refresh=true,allowDiscovery=true}={}){
 let result=await service.collect(scope,{refresh});
 if(!sourceRepairNeeded(result)||!allowDiscovery)return result;
 if(!sourceModelState(env).modelConfigured)return {...result,discoveryStatus:'connection_required',discoveryError:'A new or changed source needs the configured source-discovery model. The last successful collection, when available, was retained.'};
 const repair=await discoverSourcePlan(scope,env,{service,activate:true});
 if(!repair.ok)return {...result,discoveryStatus:repair.status,repair,error:result.error||repair.error};
 result=await service.collect(scope,{refresh:true});return {...result,automaticRepair:true,repairPlanId:repair.plan?.id};
}

export async function handleSourcePlanApi(request,env={},integrations={}){
 const pathname=new URL(request.url).pathname;if(!pathname.startsWith('/api/source-plans'))return null;
 const service=makeSourcePlanService(env),model=sourceModelState(env);
 if(pathname==='/api/source-plans/status'&&request.method==='GET')return sourceApiJson({configured:Boolean(env.DB&&env.BUCKET),storageAvailable:Boolean(env.DB&&env.BUCKET),modelConfigured:model.modelConfigured,missing:model.missing,adapters:['usenix-v1','networking-v1','generic-html-v1'],discoveryMode:'on_missing_plan_or_parser_drift',promotion:'validated_version_with_optimistic_concurrency'});
 if(pathname==='/api/source-plans'&&request.method==='GET'){
  const result=await service.list();const query=new URL(request.url).searchParams;let plans=result.plans||[];if(query.has('conferenceId'))plans=plans.filter(row=>row.plan?.conferenceId===query.get('conferenceId'));if(query.has('year'))plans=plans.filter(row=>row.plan?.year===Number(query.get('year')));return sourceApiJson({...result,plans,modelConfigured:model.modelConfigured},result.httpStatus||200);
 }
 if(request.method!=='POST')return sourceApiJson({ok:false,status:'not_found',error:'Source-plan route not found.'},404);
 if(!sourceApiAllowed(request))return sourceApiJson({ok:false,status:'rate_limited',error:'Wait a minute before another source-plan request.'},429);
 let body;try{body=await sourceApiBody(request)}catch(error){return sourceApiJson({ok:false,status:'invalid_request',error:error.message},400)}
 try{
  if(pathname==='/api/source-plans/discover'){
   sourceApiKeys(body,['conferenceId','year','track']);const scope=sourceApiScope(body);const result=await discoverSourcePlan(scope,env,{service});return sourceApiJson(result,result.httpStatus|| (result.ok?200:502));
  }
  if(pathname==='/api/source-plans/validate'){
   sourceApiKeys(body,['planId']);if(!sourceApiId(body.planId))throw Error('Choose a saved source-plan version.');const result=await service.validate(body.planId);return sourceApiJson(result,result.httpStatus|| (result.ok?200:422));
  }
  if(pathname==='/api/source-plans/promote'){
   sourceApiKeys(body,['planId','checkId','expectedActiveId']);if(!sourceApiId(body.planId)||!sourceApiId(body.checkId)||(body.expectedActiveId!==null&&!sourceApiId(body.expectedActiveId)))throw Error('Supply the validated plan, its check, and the expected active version.');const result=await service.promote(body.planId,body.checkId,body.expectedActiveId);return sourceApiJson(result,result.httpStatus|| (result.ok?200:409));
  }
  if(pathname==='/api/source-plans/collect'){
   sourceApiKeys(body,['conferenceId','year','track','refresh','allowDiscovery','role','keywords']);const scope=sourceApiScope(body);if(body.refresh!=null&&typeof body.refresh!=='boolean'||body.allowDiscovery!=null&&typeof body.allowDiscovery!=='boolean')throw Error('Refresh and discovery flags must be boolean.');if(body.keywords!=null&&(typeof body.keywords!=='string'||body.keywords.length>500)||body.role!=null&&(typeof body.role!=='string'||body.role.length>200))throw Error('Research alignment fields are too long.');
   const collected=await collectWithSourcePlan(scope,env,{service,refresh:body.refresh!==false,allowDiscovery:body.allowDiscovery!==false});
   if(collected.papers?.length&&typeof integrations.normalizeCollection==='function'){
    const normalized=integrations.normalizeCollection(collected.papers,[collected.coverage],{keywords:body.keywords||'network, systems, distributed',role:body.role||'Research Scientist',warnings:collected.warnings||[],snapshotDate:collected.coverage?.retrievedAt||collected.lastSuccess?.retrievedAt});
    return sourceApiJson({...normalized,sourcePlan:{status:collected.status,automaticRepair:collected.automaticRepair||false,repairPlanId:collected.repairPlanId||null,cacheRetained:collected.cacheRetained||false,lastSuccess:collected.lastSuccess||null,lastAttempt:collected.lastAttempt||null,discoveryStatus:collected.discoveryStatus||null},warnings:[...normalized.warnings,...(collected.discoveryError?[collected.discoveryError]:[])]});
   }
   return sourceApiJson(collected,collected.httpStatus|| (collected.ok?200:422));
  }
 }catch(error){return sourceApiJson({ok:false,status:'invalid_request',error:error.message},400)}
 return sourceApiJson({ok:false,status:'not_found',error:'Source-plan route not found.'},404);
}
