import test,{afterEach,mock} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {researchAcademicProfile} from '../worker/profile-research.mjs';
const snapshot=JSON.parse(fs.readFileSync(new URL('../data/usenix.json',import.meta.url),'utf8'));
const paper=snapshot.papers.find(p=>p.id==='usenix:osdi:2025:zhang-tony');
const candidate={id:'author:profile-test',name:paper.authors[0].name,publishedAffiliation:paper.authors[0].affiliations.join('; '),papers:[paper]};
const configured={OPENAI_API_KEY:'unit-test-key-never-used-live',OPENAI_RESEARCH_MODEL:'configured-research-model'};
const now=()=>new Date('2026-11-10T12:00:00Z');
const profileUrl='https://profile.example.edu/academic-author';
const unknown=()=>({value:null,sourceIds:[],asOf:null,confidence:'unknown',basis:'unknown'});
const fact=(value,date='2026-10-01')=>({value,sourceIds:['S1'],asOf:date,confidence:'high',basis:'source_stated'});
function resultData(){return {candidateId:candidate.id,identity:{status:'matched',confidence:'high',matchedPaperIds:[paper.id],sourceIds:['S1'],rationale:'The academic publications page lists the supplied paper.'},academic:Object.fromEntries(['currentAffiliation','currentStatus','researchInterests','degree','programStartYear','expectedGraduationYear'].map(key=>[key,unknown()])),sources:[{id:'S1',url:profileUrl,title:candidate.name+' academic publications',sourceDate:'2026-10-01',evidenceExcerpt:paper.title}]}}
function provider(data,urls=[profileUrl],annotations=[]){return Response.json({status:'completed',output:[{type:'web_search_call',status:'completed',action:{sources:urls.map(url=>({type:'url',url}))}},{type:'message',content:[{type:'output_text',text:JSON.stringify(data),annotations}]}]})}
const run=(data,options={})=>researchAcademicProfile(candidate,configured,{now,fetcher:async()=>provider(data),...options});
afterEach(()=>mock.restoreAll());

test('connection and model are both required before any HTTP call',async()=>{
  let calls=0;const fetcher=async()=>{calls++;throw Error('No call allowed')};
  for(const env of [{},{OPENAI_API_KEY:configured.OPENAI_API_KEY},{OPENAI_RESEARCH_MODEL:configured.OPENAI_RESEARCH_MODEL}]){
    const result=await researchAcademicProfile(candidate,env,{fetcher,now});assert.equal(result.status,'connection_required');assert.equal(result.httpStatus,503);
  }assert.equal(calls,0);
});

test('only the fixed OpenAI endpoint receives credentials and bounded allowlisted input',async()=>{
  let captured;const many={...candidate,prompt:'EXFILTRATE_THIS',nationality:'NOT_AN_INPUT_FIELD',secret:'candidate-secret',papers:Array.from({length:8},()=>({...paper,coauthors:Array(20).fill(paper.authors[0].name)}))};
  const response=await researchAcademicProfile(many,{...configured,OPENAI_BASE_URL:'https://attacker.example/exfiltrate'},{now,fetcher:async(url,options)=>{captured={url,options,body:JSON.parse(options.body)};return provider(resultData())}});
  assert.equal(response.ok,true);assert.equal(captured.url,'https://api.openai.com/v1/responses');assert.equal(captured.options.redirect,'error');assert.equal(captured.options.headers.Authorization,'Bearer '+configured.OPENAI_API_KEY);
  assert.ok(captured.body.max_tool_calls<=4);assert.ok(captured.body.max_output_tokens<=6000);assert.equal(captured.body.store,false);assert.equal(captured.body.tool_choice,'required');assert.deepEqual(captured.body.tools,[{type:'web_search'}]);assert.ok(captured.body.include.includes('web_search_call.action.sources'));assert.equal(captured.body.text.format.strict,true);assert.equal(captured.body.text.format.schema.additionalProperties,false);
  const input=JSON.parse(captured.body.input[0].content[0].text).candidate;assert.deepEqual(Object.keys(input).sort(),['id','name','papers','publishedAffiliation']);assert.equal(input.papers.length,5);assert.ok(input.papers.every(p=>p.coauthors.length<=10));assert.ok(!captured.options.body.includes('EXFILTRATE_THIS'));assert.ok(!captured.options.body.includes('candidate-secret'));assert.ok(!captured.options.body.includes(configured.OPENAI_API_KEY));
});

test('validated profile evidence uses genuine provider citation metadata and requires human review',async()=>{
  const data=resultData();data.academic.currentAffiliation=fact(candidate.publishedAffiliation);const result=await run(data);
  assert.equal(result.ok,true);assert.equal(result.status,'completed');assert.equal(result.research.requiresHumanReview,true);assert.equal(result.research.identity.status,'matched');assert.equal(result.research.academic.currentAffiliation.value,candidate.publishedAffiliation);assert.equal(result.research.queriedAt,now().toISOString());assert.equal(result.research.sources[0].url,profileUrl);
});

test('url_citation annotations are accepted as provider provenance when web-search sources are omitted',async()=>{
  const result=await run(resultData(),{fetcher:async()=>provider(resultData(),[],[{type:'url_citation',url:profileUrl,title:'Academic publications'}])});assert.equal(result.ok,true);
});

test('official paper plus an unrelated namesake CV cannot establish a matched personal profile',async()=>{
  const data=resultData();data.sources=[{...data.sources[0],id:'paper',url:paper.url,title:paper.title,evidenceExcerpt:paper.title},{...data.sources[0],id:'cv',evidenceExcerpt:candidate.name+' academic CV'}];data.identity.sourceIds=['paper','cv'];
  const result=await run(data,{fetcher:async()=>provider(data,[paper.url,profileUrl])});assert.equal(result.ok,false);assert.equal(result.status,'needs_review');assert.match(result.error,/beyond the publisher-paper/);
});

test('a model cannot assert an unrelated supplied paper ID or unsupported identity anchor',async()=>{
  let data=resultData();data.identity.matchedPaperIds=['not-a-supplied-paper'];assert.equal((await run(data)).status,'needs_review');
  data=resultData();data.sources[0].evidenceExcerpt=candidate.name+' academic page with no publication anchor';assert.equal((await run(data)).status,'needs_review');
});

test('ambiguous identity stays ambiguous and all academic fields are cleared',async()=>{
  const data=resultData();data.identity.status='ambiguous';data.identity.confidence='low';data.academic.currentAffiliation=fact(candidate.publishedAffiliation);
  const result=await run(data);assert.equal(result.status,'needs_review');assert.equal(result.research.identity.status,'ambiguous');assert.ok(Object.values(result.research.academic).every(field=>field.value===null));assert.ok(result.research.warnings.some(w=>w.includes('ambiguous')));
});

test('unresolved identity with null unknown fields is a valid honest result',async()=>{
  const data=resultData();data.identity={status:'unresolved',confidence:'unknown',matchedPaperIds:[],sourceIds:[],rationale:'No distinct academic profile was established.'};data.sources=[];
  const result=await run(data,{fetcher:async()=>provider(data,[])});assert.equal(result.ok,true);assert.equal(result.status,'needs_review');assert.ok(Object.values(result.research.academic).every(field=>field.value===null));
});

test('unexpected demographic fields are rejected at every response level',async()=>{
  for(const change of [data=>{data.ethnicity='not permitted'},data=>{data.academic.nationality=fact('not permitted')},data=>{data.academic.degree.gender='not permitted'},data=>{data.sources[0].religion='not permitted'}]){
    const data=resultData();change(data);const result=await run(data);assert.equal(result.ok,false);assert.equal(result.status,'needs_review');assert.equal(result.research,undefined);
  }
  const data=resultData();data.identity.rationale='Nationality inferred from the name.';assert.equal((await run(data)).status,'needs_review');
});

test('an unsupported source URL or missing field citation is rejected rather than accepted',async()=>{
  let data=resultData();data.sources[0].url='https://unconsulted.example.edu/profile';let result=await run(data);assert.equal(result.ok,false);assert.equal(result.research,undefined);assert.ok(!JSON.stringify(result).includes('unconsulted.example.edu'));
  data=resultData();data.academic.degree=fact('PhD');data.academic.degree.sourceIds=['missing'];assert.equal((await run(data)).status,'needs_review');
});

test('HTTP, credential-bearing and private citation URLs are rejected',async()=>{
  for(const url of ['http://profile.example.edu/author','https://name:password@profile.example.edu/author','https://127.0.0.1/private','https://10.0.0.1/private','https://service.internal/private']){
    const data=resultData();data.sources[0].url=url;const result=await run(data,{fetcher:async()=>provider(data,[url])});assert.equal(result.ok,false,url);
  }
});

test('undated current claims are marked unverified and confidence cannot remain high',async()=>{
  const data=resultData();data.sources[0].sourceDate=null;data.academic.currentAffiliation=fact(candidate.publishedAffiliation,null);data.academic.currentStatus=fact('PhD student',null);
  const result=await run(data);assert.equal(result.research.academic.currentAffiliation.confidence,'medium');assert.equal(result.research.academic.currentStatus.confidence,'medium');assert.ok(result.research.warnings.some(w=>w.includes('undated')));
});

test('old sources do not become high-confidence current academic claims',async()=>{
  const data=resultData();data.sources[0].sourceDate='2022-01-01';data.academic.currentAffiliation=fact(candidate.publishedAffiliation,'2022-01-01');data.academic.currentStatus=fact('PhD student','2022-01-01');
  const result=await run(data);assert.equal(result.research.academic.currentAffiliation.value,null);assert.equal(result.research.academic.currentStatus.value,null);assert.ok(result.research.warnings.some(w=>w.includes('older than two years')));
});

test('query time cannot replace an undated source date, and impossible dates are rejected',async()=>{
  let data=resultData();data.sources[0].sourceDate=null;data.academic.currentAffiliation=fact(candidate.publishedAffiliation,'2026-11-10');assert.equal((await run(data)).status,'needs_review');
  for(const date of ['2027-01-01','2026-02-31']){data=resultData();data.sources[0].sourceDate=date;assert.equal((await run(data)).status,'needs_review');}
});

test('degree years require explicit excerpt evidence and cannot conflict',async()=>{
  const data=resultData();data.academic.programStartYear=fact(2021);assert.equal((await run(data)).status,'needs_review');
  data.sources[0].evidenceExcerpt=paper.title.split(' ').slice(0,8).join(' ')+'; program began2021; graduation expected2027.';assert.equal((await run(data)).ok,true);
  data.academic.expectedGraduationYear=fact(2020);data.sources[0].evidenceExcerpt+='2020';assert.equal((await run(data)).status,'needs_review');
});

test('no web-search call or incomplete structured output produces no accepted facts',async()=>{
  const data=resultData();let result=await run(data,{fetcher:async()=>Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(data),annotations:[{type:'url_citation',url:profileUrl}]}]}]})});assert.equal(result.status,'needs_review');
  result=await run(data,{fetcher:async()=>Response.json({status:'incomplete',output:[]})});assert.equal(result.status,'needs_review');
  result=await run(data,{fetcher:async()=>Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:'not JSON'}]}]})});assert.equal(result.status,'needs_review');
});

test('provider refusals, errors and rate limits expose no raw response or key',async()=>{
  const refusal=await run(resultData(),{fetcher:async()=>Response.json({status:'completed',output:[{type:'message',content:[{type:'refusal',refusal:'raw private details'}]}]})});assert.equal(refusal.status,'needs_review');assert.ok(!JSON.stringify(refusal).includes('raw private details'));
  for(const status of [401,403,429,500]){const result=await run(resultData(),{fetcher:async()=>new Response(configured.OPENAI_API_KEY+' upstream detail',{status})});assert.equal(result.status,status===429?'upstream_rate_limited':'upstream_error');assert.ok(!JSON.stringify(result).includes(configured.OPENAI_API_KEY));}
  const thrown=await run(resultData(),{fetcher:async()=>{throw Error('secret transport details')}});assert.equal(thrown.status,'upstream_error');assert.ok(!JSON.stringify(thrown).includes('secret transport'));
});

test('90-second abort deadline returns timeout without accepting partial facts',async()=>{
  let expire,timeout;mock.method(globalThis,'setTimeout',(fn,ms)=>{expire=fn;timeout=ms;return 1});mock.method(globalThis,'clearTimeout',()=>{});
  const pending=researchAcademicProfile(candidate,configured,{now,fetcher:async(_url,{signal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject({name:'AbortError'})))});assert.equal(timeout,90000);expire();const result=await pending;assert.equal(result.status,'timeout');assert.equal(result.httpStatus,504);assert.equal(result.research,undefined);
});

test('no canonical paper anchor means no provider request',async()=>{
  let called=false;const result=await researchAcademicProfile({...candidate,papers:[]},configured,{now,fetcher:async()=>{called=true}});assert.equal(result.status,'invalid_candidate');assert.equal(called,false);
});

test('academic status accepts canonical PhD candidate but rejects demographic biography qualifiers',async()=>{
  let data=resultData();data.academic.currentStatus=fact('PhD candidate');assert.equal((await run(data)).ok,true);
  data=resultData();data.academic.currentStatus=fact('Chinese PhD candidate');const result=await run(data);assert.equal(result.status,'needs_review');assert.equal(result.research,undefined);
  data=resultData();data.academic.degree=fact('Chinese PhD');assert.equal((await run(data)).status,'needs_review');
});

test('completed provider open_page and find_in_page actions prove actual CV consultation',async()=>{
  for(const type of ['open_page','find_in_page']){
    const data=resultData(),cv=profileUrl+'/cv.pdf';data.sources[0].url=cv;
    const result=await run(data,{fetcher:async()=>Response.json({status:'completed',output:[{type:'web_search_call',status:'completed',action:{type,url:cv,...(type==='find_in_page'?{pattern:'publications'}:{})}},{type:'message',content:[{type:'output_text',text:JSON.stringify(data),annotations:[]}]}]})});
    assert.equal(result.ok,true,type);assert.equal(result.research.sources[0].url,cv);
  }
});

test('unfinished or failed page actions, query URLs and non-URL action text are not citation proof',async()=>{
  const cases=[
    {status:'failed',action:{type:'open_page',url:profileUrl}},
    {status:'in_progress',action:{type:'find_in_page',url:profileUrl,pattern:'publications'}},
    {status:'searching',action:{type:'open_page',url:profileUrl}},
    {status:'completed',action:{type:'search',url:profileUrl,query:profileUrl}},
    {status:'completed',action:{type:'open_page',query:profileUrl}},
    {status:'completed',action:{type:'open_page',url:'not a URL'}},
    {status:'completed',action:{type:'find_in_page',url:'http://profile.example.edu/academic-author',pattern:profileUrl}},
    {status:'completed',action:{type:'other',url:profileUrl}}
  ];
  for(const item of cases){const data=resultData(),result=await run(data,{fetcher:async()=>Response.json({status:'completed',output:[{type:'web_search_call',...item},{type:'message',content:[{type:'output_text',text:JSON.stringify(data),annotations:[]}]}]})});assert.equal(result.ok,false,JSON.stringify(item));assert.equal(result.research,undefined);}
});
