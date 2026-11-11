import {DOMAINS,CONFERENCES} from '../shared/catalog.js';

const MAPPING_CORE={
 networking:['sigcomm','nsdi','conext','imc'],systems:['osdi','sosp','eurosys','atc'],storage:['fast','osdi','sosp'],security:['security','sp','ccs','ndss'],ai:['aaai','ijcai'],ml:['neurips','icml','iclr'],vision:['cvpr','iccv','eccv'],nlp:['acl','emnlp','naacl'],databases:['sigmod','vldb','icde'],'search-data':['sigir','www','kdd','wsdm'],pl:['pldi','popl','oopsla'],se:['icse','fse','ase'],architecture:['isca','micro','hpca','asplos'],hpc:['sc','ics'],hci:['chi','uist','cscw'],robotics:['icra','iros','rss'],theory:['stoc','focs','soda'],graphics:['siggraph','siggraph-asia'],
};
const MAPPING_ALIASES={
 networking:['network','networking','computer networks','network systems','datacenter','data center network','transport','congestion','routing','tcp','rdma','packet','internet measurement','网络','计算机网络'],
 systems:['operating system','operating systems','distributed system','distributed systems','cloud infrastructure','serverless','kernel','systems','系统','分布式'],
 storage:['storage','file system','file systems','filesystem','persistent memory','ssd','存储'],
 security:['security','privacy','cryptography','cybersecurity','secure computing','安全','隐私'],
 ai:['artificial intelligence','automated reasoning','knowledge representation','planning agents','人工智能'],
 ml:['machine learning','deep learning','foundation models','llm','llms','large language models','reinforcement learning','model training','机器学习','大模型'],
 vision:['computer vision','image recognition','3d perception','video understanding','visual recognition','视觉'],
 nlp:['natural language processing','nlp','computational linguistics','language understanding','text generation','语言处理'],
 databases:['database','databases','query optimization','transactions','data management','数据库'],
 'search-data':['information retrieval','search ranking','retrieval','data mining','recommendation','recommender','rag','检索'],
 pl:['programming language','programming languages','compiler','compilers','type systems','program analysis','编译'],
 se:['software engineering','software testing','developer tools','software maintenance','软件工程'],
 architecture:['computer architecture','microarchitecture','processor','processors','hardware accelerator','cpu design','计算机体系结构'],
 hpc:['high performance computing','supercomputing','hpc','parallel computing','scientific computing','高性能计算'],
 hci:['human computer interaction','hci','user interface','user interfaces','interaction design','人机交互'],
 robotics:['robotics','robot','robots','autonomous robots','robot perception','manipulation','机器人'],
 theory:['algorithms','computation theory','complexity theory','data structures','theoretical computer science','算法'],
 graphics:['computer graphics','rendering','animation','geometric modeling','图形学'],
};
const MAPPING_STATUSES=['PhD student','PhD candidate','Master’s student',"Master's student",'Researcher','Postdoctoral researcher','Faculty','Graduated','Unknown'];
const MAPPING_INPUT_KEYS=['direction','role','keywords','domain','conferenceIds','startYear','endYear','criteria','refresh'];
function mappingNorm(value){return String(value||'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').replace(/\s+/g,' ').trim()}
function mappingPhrase(text,phrase){const p=mappingNorm(phrase);return p&&(' '+text+' ').includes(' '+p+' ')}
function mappingBad(error,extra={}){return {ok:false,status:'invalid_input',httpStatus:400,error,...extra}}
function mappingYear(value){return Number.isInteger(value)?value:Number(value)}

export function resolveMappingPlan(input,{now=new Date()}={}){
 if(!input||typeof input!=='object'||Array.isArray(input))return mappingBad('Enter a computer science direction.');
 if(Object.keys(input).some(k=>!MAPPING_INPUT_KEYS.includes(k)))return mappingBad('Use domain, research, publication-window, and academic screening settings only.');
 if(typeof input.direction!=='string'||!input.direction.trim()||input.direction.length>500)return mappingBad('Describe the research direction in 1–500 characters.');
 if(input.role!=null&&(typeof input.role!=='string'||input.role.length>200)||input.keywords!=null&&(typeof input.keywords!=='string'||input.keywords.length>500))return mappingBad('Role or research terms exceed their supported length.');
 const date=new Date(now),year=date.getUTCFullYear();const startYear=input.startYear==null?year-2:mappingYear(input.startYear),endYear=input.endYear==null?year:mappingYear(input.endYear);
 if(!Number.isInteger(startYear)||!Number.isInteger(endYear)||startYear<2000||endYear>year||endYear<startYear||endYear-startYear>2)return mappingBad('Choose a publication window of up to three years ending no later than the current year.');
 if(input.domain!=null&&input.domain!==''&&!DOMAINS.some(d=>d.id===input.domain))return mappingBad('Choose a domain from the computer science catalog.');
 if(input.refresh!=null&&typeof input.refresh!=='boolean')return mappingBad('Refresh must be true or false.');
 const criteria=input.criteria||{};
 if(typeof criteria!=='object'||Array.isArray(criteria)||Object.keys(criteria).some(k=>!['targetGraduationYear','currentStatuses','minResearchFit','includeUnknown'].includes(k)))return mappingBad('Screening supports academic status, graduation timing, and research alignment only.');
 const target=criteria.targetGraduationYear===null?null:criteria.targetGraduationYear==null?year+1:mappingYear(criteria.targetGraduationYear),minimum=criteria.minResearchFit==null?0:Number(criteria.minResearchFit),statuses=criteria.currentStatuses||[];
 if(target!==null&&(!Number.isInteger(target)||target<year-1||target>year+10)||!Number.isFinite(minimum)||minimum<0||minimum>100||!Array.isArray(statuses)||statuses.some(s=>!MAPPING_STATUSES.includes(s))||criteria.includeUnknown!=null&&typeof criteria.includeUnknown!=='boolean')return mappingBad('Choose valid academic status, graduation year, and alignment settings.');
 const text=mappingNorm(input.direction+' '+(input.keywords||''));
 const ranked=DOMAINS.map(domain=>{const aliases=[...(MAPPING_ALIASES[domain.id]||[]),...(domain.keywords||[])];const matched=[...new Set(aliases.filter(alias=>mappingPhrase(text,alias)))];let score=matched.reduce((sum,alias)=>sum+Math.min(4,mappingNorm(alias).split(' ').length+1),0);if(input.domain===domain.id)score+=1000;return {...domain,score,matched}}).sort((a,b)=>b.score-a.score);
 if(!ranked[0]?.score)return mappingBad('Choose a CS domain to clarify this direction. The catalog did not find a reliable domain match.',{status:'needs_domain_choice',domains:DOMAINS.map(({id,name})=>({id,name}))});
 const primary=ranked[0],domains=ranked.filter(d=>d.id===primary.id||!input.domain&&d.score>=Math.max(4,primary.score*.7)).slice(0,2);
 const recommended=[...new Set(domains.flatMap(domain=>MAPPING_CORE[domain.id]||CONFERENCES.filter(c=>c.domains[0]===domain.id).map(c=>c.id)))].filter(id=>CONFERENCES.some(c=>c.id===id)).slice(0,8);
 let ids=recommended;
 if(input.conferenceIds!=null){if(!Array.isArray(input.conferenceIds)||!input.conferenceIds.length||input.conferenceIds.length>8||new Set(input.conferenceIds).size!==input.conferenceIds.length||input.conferenceIds.some(id=>!CONFERENCES.some(c=>c.id===id)))return mappingBad('Choose one to eight distinct conferences from the catalog.');ids=input.conferenceIds}
 if(!ids.length)return mappingBad('No conferences are mapped for the selected domain.');
 let terms=(input.keywords||'').split(/[,;\n]/).map(s=>s.trim()).filter(Boolean);
 if(!terms.length){terms=[...new Set(domains.flatMap(d=>d.matched).filter(term=>mappingNorm(term)!==mappingNorm(primary.name)))].slice(0,8);if(!terms.length)terms=(MAPPING_ALIASES[primary.id]||primary.keywords||[]).slice(0,4)}
 const keywords=terms.slice(0,12).join(', ').slice(0,500),years=Array.from({length:endYear-startYear+1},(_,i)=>startYear+i),editions=[],skippedEditions=[];
 for(const id of ids)for(const editionYear of years){const c=CONFERENCES.find(c=>c.id===id);if(id==='iccv'&&editionYear%2===0||id==='eccv'&&editionYear%2===1){skippedEditions.push({conferenceId:id,year:editionYear,reason:'No regular main-conference edition in this biennial year.'});continue}editions.push({conferenceId:id,year:editionYear,track:'main'})}
 const conferences=ids.map((id,index)=>{const c=CONFERENCES.find(c=>c.id===id),domain=domains.find(d=>c.domains.includes(d.id))||primary;return {id,name:c.name,full:c.full,officialUrl:c.url,rank:index+1,rationale:`Curated ${domain.name.toLowerCase()} venue; relevant to ${domain.matched.slice(0,3).join(', ')||domain.name.toLowerCase()}.`,sourceReady:c.connectorStatus==='ready',selectionMethod:'curated_domain_catalog'}});
 return {ok:true,status:'planned',httpStatus:200,plan:{direction:input.direction.trim(),role:input.role?.trim()||primary.name+' Researcher',keywords,domain:primary.id,domains:domains.map(d=>({id:d.id,name:d.name,score:d.score,matchedTerms:d.matched})),conferences,conferenceIds:ids,startYear,endYear,years,editions,skippedEditions,criteria:{targetGraduationYear:target,currentStatuses:[...new Set(statuses)],minResearchFit:minimum,includeUnknown:criteria.includeUnknown!==false},refresh:input.refresh!==false,method:'curated_catalog',catalogReference:'https://csrankings.org/',explanation:'Recommendations use a maintained CS-domain catalog, not an automated quality ranking. Every collected paper and author remains available; screening outcomes support review.'}};
}
