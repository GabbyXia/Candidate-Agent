/* Only public official conference listings. Publisher affiliations describe the
   paper year; current degree, current employer, and graduation remain unknown. */
import { decodeUsenixEntities } from './usenix.mjs';

export const NETWORKING_CATALOG=Object.freeze({
  sigcomm:{name:'SIGCOMM',title:'ACM SIGCOMM Conference'},
  conext:{name:'CoNEXT',title:'ACM Conference on emerging Networking EXperiments and Technologies'},
  imc:{name:'IMC',title:'ACM Internet Measurement Conference'}
});
const SOURCES=Object.freeze({
  sigcomm:{2024:'https://conferences.sigcomm.org/sigcomm/2024/accepted-papers/',2025:'https://conferences.sigcomm.org/sigcomm/2025/accepted-papers/',2026:'https://conferences.sigcomm.org/sigcomm/2026/accepted/'},
  conext:{2024:'https://conferences.sigcomm.org/co-next/2024/partials/accepted-papers.html',2025:'https://conferences2.sigcomm.org/co-next/2025/partials/accepted-papers.html',2026:'https://conferences2.sigcomm.org/co-next/2026/partials/accepted-papers.html'},
  imc:{2024:'https://conferences.sigcomm.org/imc/2024/accepted-papers/',2025:'https://conferences.sigcomm.org/imc/2025/accepted-papers/',2026:'https://conferences.sigcomm.org/imc/2026/accepted-papers/'}
});
export function networkingEditionUrl(id,year){const url=SOURCES[id]?.[year];if(!url||!Number.isInteger(year))throw new Error('Unsupported networking conference or year.');return url}
export function networkingEditionSources(id,year){const primary=networkingEditionUrl(id,year);return id==='conext'&&year===2025?[primary,'https://conferences2.sigcomm.org/co-next/2025/partials/program.html?updated=191214']:[primary]}
function text(value){return decodeUsenixEntities(String(value||'').replace(/<!--[^]*?-->/g,' ').replace(/<script\b[^>]*>[^]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[^]*?<\/style>/gi,' ').replace(/<br\s*\/?>|<\/p\s*>/gi,' ').replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ').trim()}
function blocks(html,tag){const out=[],stack=[],regex=new RegExp(`<${tag}\\b[^>]*>|<\\/${tag}\\s*>`,'gi');for(const match of html.matchAll(regex)){if(match[0][1]==='/'){const start=stack.pop();if(start!==undefined)out.push({html:html.slice(start,match.index+match[0].length),start})}else stack.push(match.index)}return out.sort((a,b)=>a.start-b.start)}
function names(value){return text(value).replace(/^[,;\s]+|[,;\s]+$/g,'').split(/\s*[,;]\s*|\s+and\s+/).map(name=>name.replace(/^(?:and\s+)/,'').trim()).filter(name=>name&&!/^(?:et al\.?|authors?)$/i.test(name))}
function author(name,affiliations,sourceUrl,year){return {name,affiliations,sourceUrl,affiliationYear:year,evidence:affiliations.length?'publisher_byline':'publisher_author_listing'}}
function stripTrackLabels(html){return html.replace(/<span\b[^>]*class=["'][^"']*\blabel-(?:short|long)\b[^"']*["'][^>]*>[^]*?<\/span>/gi,'')}
/* Parentheses are scanned with nesting, so institutional commas and semicolons
   are never used as author separators. A suffix like '(Daniel) Jang' is a name. */
export function parseNetworkingAuthors(byline,id,sourceUrl,year){
  byline=stripTrackLabels(byline);
  const plain=text(byline);if(id==='imc')return names(plain).map(name=>author(name,[],sourceUrl,year));
  if(id==='conext'&&/<em\b/i.test(byline)){
    const out=[];let cursor=0;for(const match of byline.matchAll(/<em\b[^>]*>([^]*?)<\/em>/gi)){const segment=byline.slice(cursor,match.index);const affiliation=text(match[1]).replace(/^\(|\)$/g,'').trim();cursor=match.index+match[0].length;for(const name of names(segment))out.push(author(name,affiliation?[affiliation]:[],sourceUrl,year))}
    for(const name of names(byline.slice(cursor)))out.push(author(name,[],sourceUrl,year));return out;
  }
  const out=[];let cursor=0,depth=0,start=-1;
  for(let i=0;i<plain.length;i++){
    if(plain[i]==='('){if(depth===0)start=i;depth++}
    else if(plain[i]===')'&&depth){depth--;if(depth===0){
      const suffix=plain.slice(i+1);if(suffix&& !/^[\s,;]/.test(suffix))continue;
      // A parenthesized nickname followed by a surname is not an affiliation.
      if(/^\s+\p{L}/u.test(suffix))continue;
      const affiliation=plain.slice(start+1,i).trim();const preceding=plain.slice(cursor,start).replace(/^[,;\s]+|[,;\s]+$/g,'');
      // A semicolon-delimited author lacking its own institution stays unknown.
      const groups=preceding.split(';');for(const group of groups.slice(0,-1))for(const name of names(group))out.push(author(name,[],sourceUrl,year));
      for(const name of names(groups.at(-1)))out.push(author(name,affiliation?[affiliation]:[],sourceUrl,year));cursor=i+1;
    }}
  }
  for(const name of names(plain.slice(cursor)))out.push(author(name,[],sourceUrl,year));
  return out;
}
function stableId(id,year,title){let hash=2166136261;for(const char of title.normalize('NFC')){hash^=char.codePointAt(0);hash=Math.imul(hash,16777619)}return `publisher:${id}:${year}:${(hash>>>0).toString(16)}`}
function sectionAt(html,start){const headings=[...html.slice(0,start).matchAll(/<h2\b[^>]*>([^]*?)<\/h2>/gi)];const value=text(headings.at(-1)?.[1]);return value&&!/accepted papers/i.test(value)?value:'Main conference'}
export function parseNetworkingListing(html,id,year,sourceUrl=networkingEditionUrl(id,year)){
  networkingEditionUrl(id,year);const papers=[],seen=new Set();const tag=id==='sigcomm'&&year===2026?'tr':'li';let parsedEntries=0;
  // Angular program source includes commented-out old drafts; ignore comments.
  html=html.replace(/<!--[^]*?-->/g,'');
  const program=id==='conext'&&year===2025&&sourceUrl.includes('/program.html');
  for(const block of blocks(html,tag)){
    let titleHtml='',bylineHtml='',section=sectionAt(html,block.start),paperUrl=sourceUrl,pdfUrl=null,abstractSnippet='';
    if(program){
      const title=block.html.match(/<strong\b[^>]*>([^]*?)<\/strong>/i);if(!title||!/label-(?:long|short)/i.test(title[1]))continue;
      titleHtml=title[1].replace(/<span\b[^>]*>[^]*?<\/span>/gi,'');bylineHtml=block.html.slice((title.index||0)+title[0].length).match(/^\s*<\/div>\s*<div[^>]*>([^]*?)<\/div>/i)?.[1]||'';
      const doi=block.html.match(/href=["'](https:\/\/dl\.acm\.org\/doi\/10\.[^"']+)["']/i)?.[1];const pdf=block.html.match(/href=["'](https:\/\/dl\.acm\.org\/doi\/pdf\/10\.[^"']+)["']/i)?.[1];
      if(!doi)continue;paperUrl=decodeUsenixEntities(doi);pdfUrl=pdf?decodeUsenixEntities(pdf):null;
      const abstract=text(block.html.match(/<strong\b[^>]*>Abstract:\s*<\/strong>\s*<p[^>]*>([^]*?)<\/p>/i)?.[1]);abstractSnippet=abstract.length>300?abstract.slice(0,297).replace(/\s+\S*$/,'')+'…':abstract;
      section=/label-short/i.test(title[1])?'Short papers':'Long papers';
    }else if(id==='sigcomm'&&year===2024){
      const title=block.html.match(/<p\b[^>]*class=["'][^"']*font-bold[^"']*["'][^>]*>([^]*?)<\/p>/i);if(!title)continue;
      const track=title[1].match(/<span\b[^>]*>([^]*?)<\/span>/i);if(track)section=text(track[1]);titleHtml=title[1].replace(/<span\b[^>]*>[^]*?<\/span>/gi,'');bylineHtml=block.html.slice((title.index||0)+title[0].length).match(/<p\b[^>]*>([^]*?)<\/p>/i)?.[1]||'';
    }else if(id==='sigcomm'&&year===2025){
      const title=block.html.match(/<span\b[^>]*class=["'][^"']*text-color-primary[^"']*["'][^>]*>([^]*?)<\/span>/i);if(!title)continue;titleHtml=title[1];bylineHtml=block.html.match(/<p\b[^>]*class=["'][^"']*style_italic[^"']*["'][^>]*>([^]*?)<\/p>/i)?.[1]||'';
    }else if(id==='sigcomm'&&year===2026){
      const title=block.html.match(/<b\b[^>]*>([^]*?)<\/b>/i);const byline=block.html.match(/<span\b[^>]*class=(?:["']table-description["']|table-description)[^>]*>([^]*?)<\/span>/i);if(!title||!byline)continue;titleHtml=title[1];bylineHtml=byline[1];
    }else{
      const titleTag=id==='imc'?'strong':year===2026?'u':'b';const title=block.html.match(new RegExp(`<${titleTag}\\b[^>]*>([^]*?)<\\/${titleTag}>`,'i'));if(!title)continue;titleHtml=title[1];bylineHtml=block.html.slice((title.index||0)+title[0].length).replace(/^\s*<br\s*\/?>/i,'').replace(/<\/li>\s*$/i,'');
    }
    const track=bylineHtml.match(/<span\b[^>]*class=["'][^"']*\blabel-(short|long)\b[^"']*["'][^>]*>[^]*?<\/span>/i);if(track&&id==='conext')section=track[1].toLowerCase()==='short'?'Short papers':'Long papers';
    bylineHtml=stripTrackLabels(bylineHtml);
    const title=text(titleHtml),rawByline=text(bylineHtml);if(!title||!rawByline)continue;parsedEntries++;
    const key=title.toLocaleLowerCase().replace(/\s+/g,' ');if(seen.has(key))continue;seen.add(key);
    const authors=parseNetworkingAuthors(bylineHtml,id,sourceUrl,year);
    papers.push({id:stableId(id,year,title),title,conference:NETWORKING_CATALOG[id].name,conferenceId:id,year,url:paperUrl,pdfUrl,abstractSnippet,rawByline,authors,section,sourceUrl,metadataSource:program?'publisher_program':'publisher_listing',metadataStatus:'publisher_listing',detailVerified:false});
  }
  const retrievedAt=new Date().toISOString();const expectedMatch=text(html).match(/(?:following\s+|total(?:\s+of)?\s+)(\d+)\s+papers\s+(?:have been|were|are)\s+accepted/i);const expectedPapers=expectedMatch?Number(expectedMatch[1]):null;
  const warnings=[];if(!papers.length)warnings.push('No accepted-paper entries could be parsed from the configured official listing.');if(expectedPapers!==null&&papers.length!==expectedPapers)warnings.push(`Publisher states ${expectedPapers} accepted papers; ${papers.length} were parsed.`);
  if(id==='imc')warnings.push('The official accepted-paper listing supplies author names without affiliations; affiliations remain unknown.');
  return {papers,coverage:{conferenceId:id,conference:NETWORKING_CATALOG[id].name,year,sourceUrl,sourceType:program?'official_program':'official_accepted_listing',status:papers.length?'available':'unavailable',listingPapers:papers.length,parsedEntries,expectedPapers,duplicatesRemoved:parsedEntries-papers.length,detailVerified:0,detailUnavailable:0,authorsWithoutAffiliation:papers.flatMap(p=>p.authors).filter(a=>!a.affiliations.length).length,completeness:papers.length?(program?'All research-paper entries in the official conference program parsed; accepted-list endpoint unavailable':'All accepted-paper entries on the configured official listing parsed; individual paper metadata is not provided by this adapter'):'No records collected',retrievedAt,sourceRetrievedAt:retrievedAt},warnings};
}
export async function fetchNetworkingEdition(id,year,{fetcher=fetch,timeoutMs=15000}={}){
  const sources=networkingEditionSources(id,year);let lastError;
  for(const sourceUrl of sources){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);try{
    const response=await fetcher(sourceUrl,{headers:{Accept:'text/html'},signal:controller.signal});if(!response.ok)throw new Error(`Official listing unavailable (HTTP ${response.status}).`);
    const finalUrl=response.url||sourceUrl;if(!['conferences.sigcomm.org','conferences2.sigcomm.org'].includes(new URL(finalUrl).hostname))throw new Error('Official source redirected outside supported publishers.');
    const html=await response.text();if(!/accepted\s*(?:papers|paper)|CoNEXT 2025 Program/i.test(text(html)))throw new Error('Official response did not contain a configured paper listing.');
    const result=parseNetworkingListing(html,id,year,sourceUrl);if(!result.papers.length)throw Error('No research papers parsed from the official source.');if(sourceUrl!==sources[0])result.warnings.push('Accepted-paper endpoint was unavailable; all research papers were collected from the official conference program instead.');return result;
  }catch(error){lastError=error}finally{clearTimeout(timer)}}
  const retrievedAt=new Date().toISOString();return {papers:[],coverage:{conferenceId:id,conference:NETWORKING_CATALOG[id].name,year,sourceUrl:sources[0],attemptedSources:sources,status:'unavailable',listingPapers:0,parsedEntries:0,expectedPapers:null,detailVerified:0,detailUnavailable:0,authorsWithoutAffiliation:0,completeness:'Official listing unavailable; no records collected',error:lastError?.name==='AbortError'?'Official listing request timed out.':lastError?.message||'Source unavailable',retrievedAt,sourceRetrievedAt:null},warnings:[`${NETWORKING_CATALOG[id].name} ${year}: official accepted-paper listing unavailable; no substitute data was generated.`]};
}
