import test from 'node:test';
import assert from 'node:assert/strict';
import {currentProgramFacts,recoverCitedProgramStart} from '../shared/current-program.js';

// Real accepted-paper IDs and saved source excerpts. Sentence variants below
// are isolated parser controls; they never become published people or papers.
// Identity matching and full-source validation run before this parser.
const examples={
 news:{id:'author:0e4eaecafa8b1aac',paper:'publisher:sigcomm:2024:dc77d800',url:'https://hanchenli.github.io/',year:2025,quote:'[Aug 2025] Starting PhD at UCB!'},
 range:{id:'author:3e77de0c8e391bb6',paper:'usenix:osdi:2024:yu',url:'https://timez-zx.github.io/assets/pdf/ZhangXiao_CV.pdf',year:2024,quote:'Ph.D. in Computer Science Sept. 2024 ‑ Present'},
 month:{id:'author:36534a21978a4937',paper:'usenix:nsdi:2025:kang',url:'https://yuyuankang.github.io/assets/pdf/YuyuanKang-CV.pdf',year:2022,quote:'Ph.D. in Computer Science Aug. 2022 – Apr. 2027 (expected)'},
};
const field=(value,id='bio')=>({value,sourceIds:value==null?[]:[id],asOf:null,confidence:value==null?'unknown':'medium',basis:value==null?'unknown':'source_stated'});
function record(example,{quote=example.quote,year=example.year,status='PhD student',degree='PhD'}={}){
 return {id:example.id,paperIds:[example.paper],academicResearch:{candidateId:example.id,identity:{status:'matched',matchedPaperIds:[example.paper],sourceIds:['bio']},academic:{currentStatus:field(status),degree:field(degree),programStartYear:field(year)},sources:[{id:'bio',url:example.url,evidenceExcerpt:quote}]}};
}
const facts=(candidate,currentYear=2026)=>currentProgramFacts(candidate,{currentYear});
const separators=['-','–','—','‐','‑','‒','−'];

test('literal dated first-enrollment news retains its exact source and year',()=>{
 const candidate=record(examples.news),before=structuredClone(candidate);assert.equal(facts(candidate).programStartYear,2025);assert.equal(facts(candidate).asOf,null);assert.deepEqual(candidate,before);
});
test('bounded date-first enrollment notices accept named months and ISO months',()=>{
 for(const quote of ['2025 Started my PhD at UCB.','[2025-08] Began PhD at UCB.','[August 2025] Starting my Doctor of Philosophy at UCB!','(Sep. 2025) Enrolled in Ph.D. at UCB.'])assert.equal(facts(record(examples.news,{quote})).programStartYear,2025,quote);
 assert.equal(facts(record(examples.news,{quote:'[Sep 2024] Enrolled in MSc at UCB.',year:2024,status:"Master's student",degree:'MSc'})).programStartYear,2024);
});
test('date-first source recovery does not modify a stored null or its provenance',()=>{
 const candidate=record(examples.news,{year:null}),before=structuredClone(candidate),found=recoverCitedProgramStart(candidate,{currentYear:2026});assert.equal(found.value,2025);assert.deepEqual(found.sourceIds,['bio']);assert.equal(found.asOf,null);assert.deepEqual(candidate,before);
});
test('future, conditional and relative start notices cannot borrow a post date',()=>{
 for(const quote of ['[Aug 2025] Will start my PhD at UCB in 2026.','[Aug 2025] Starting PhD next year.','[Aug 2025] Starting PhD in two months.','[Aug 2025] Starting PhD in 2 months.','[Dec 2025] Starting PhD in January.','[Dec 2025] Starting PhD in Jan.','[Dec 2025] Starting PhD tomorrow.','[Aug 2025] Starting PhD after a conditional offer.','[Aug 2025] Starting my deferred PhD.','[Aug 2025] Incoming student starting PhD in 2026.','[Aug 2025] Starting PhD at UCB in 2026.'])assert.equal(facts(record(examples.news,{quote})).programStartYear,null,quote);
});
test('date-first employment, visits, other degrees and program phases stay separate',()=>{
 for(const quote of ['[Aug 2025] Starting PhD internship at UCB.','[Aug 2025] Starting PhD research visit at UCB.','[Aug 2025] Starting PhD scholarship at UCB.','[Aug 2025] Starting PhD project at UCB.','[Aug 2025] Starting PhD applications.','[Aug 2025] Starting PhD thesis.','[Aug 2025] Starting PhD candidacy phase.','[Aug 2025] Starting MSc at UCB.'])assert.equal(facts(record(examples.news,{quote})).programStartYear,null,quote);
});
test('date-first support still requires identity, current student and matching degree',()=>{
 for(const change of [c=>c.academicResearch.identity.status='unresolved',c=>c.academicResearch.identity.matchedPaperIds=[],c=>c.academicResearch.academic.currentStatus.value='Faculty',c=>c.academicResearch.academic.degree.value='MSc']){const candidate=record(examples.news);change(candidate);assert.equal(facts(candidate).programStartYear,null);}
});

test('the actual nonbreaking range dash retains a literal start without quote edits',()=>{
 assert.ok(examples.range.quote.includes('\u2011'));assert.ok(examples.range.quote.normalize('NFKC').includes('\u2010'));const candidate=record(examples.range),before=structuredClone(candidate);assert.equal(facts(candidate).programStartYear,2024);assert.deepEqual(candidate,before);
});
test('a paper-title citation cannot establish the separate education range',()=>{
 const candidate=record(examples.range);candidate.academicResearch.sources.push({id:'paper',url:examples.range.url,evidenceExcerpt:'Beaver: Practical Partial Snapshots for Distributed Cloud Services'});candidate.academicResearch.academic.degree.sourceIds=['paper'];candidate.academicResearch.academic.programStartYear.sourceIds=['paper'];assert.equal(facts(candidate).programStartYear,null);
});
test('all supported range separators retain the first year of an ongoing degree',()=>{
 for(const separator of separators){const quote='Ph.D. in Computer Science Sept. 2024 '+separator+' Present',candidate=record(examples.range,{quote}),before=structuredClone(candidate);assert.equal(facts(candidate).programStartYear,2024,separator);assert.deepEqual(candidate,before);}
});
test('closed degrees, completed credentials and range ends never become starts',()=>{
 for(const separator of separators)for(const [quote,year]of [['Ph.D. in Computer Science 2019 '+separator+' 2023',2019],['Ph.D. in Computer Science 2021 '+separator+' 2024',2024],['Completed Ph.D. in Computer Science 2024 '+separator+' Present',2024]])assert.equal(facts(record(examples.range,{quote,year})).programStartYear,null,quote);
});
test('other-degree, internship and award ranges stay separate for every dash',()=>{
 for(const separator of separators)for(const quote of ['M.Sc. in Computer Science Sept. 2024 '+separator+' Present','Ph.D. student internship Sept. 2024 '+separator+' Present','Ph.D. student scholarship Sept. 2024 '+separator+' Present'])assert.equal(facts(record(examples.range,{quote})).programStartYear,null,quote);
});
test('range parsing still requires supported cited IDs and matching enrollment',()=>{
 for(const change of [c=>c.academicResearch.identity.status='unresolved',c=>c.academicResearch.identity.matchedPaperIds=[],c=>c.academicResearch.academic.currentStatus.value='Faculty',c=>c.academicResearch.academic.degree.value='MSc',c=>c.academicResearch.academic.programStartYear.sourceIds=['missing']]){const candidate=record(examples.range);change(candidate);assert.equal(facts(candidate).programStartYear,null);}
});
test('cached range recovery preserves the original missing field and exact source',()=>{
 const candidate=record(examples.range,{year:null}),before=structuredClone(candidate),found=recoverCitedProgramStart(candidate,{currentYear:2026});assert.equal(found.value,2024);assert.deepEqual(found.sourceIds,['bio']);assert.deepEqual(candidate,before);
});

test('the actual future month-ended degree range supports only its first year',()=>{
 const candidate=record(examples.month),before=structuredClone(candidate);assert.equal(facts(candidate).programStartYear,2022);assert.equal(facts(candidate).asOf,null);assert.deepEqual(candidate,before);
});
test('named future endpoint months work across supported separators',()=>{
 for(const separator of separators)for(const month of ['Apr.','April','September']){const quote='Ph.D. in Computer Science Aug. 2022 '+separator+' '+month+' 2027 (expected)';assert.equal(facts(record(examples.month,{quote})).programStartYear,2022,quote);}
});
test('the future endpoint year is never an enrollment start',()=>{
 assert.equal(facts(record(examples.month,{year:2027})).programStartYear,null);assert.equal(facts(record(examples.month,{year:2027}),2028).programStartYear,null);
});
test('closed or completed month-ended credentials remain unknown',()=>{
 for(const quote of ['Ph.D. in Computer Science Aug. 2022 – Apr. 2025 (expected)','Ph.D. in Computer Science Aug. 2022 – April 2025','Completed Ph.D. in Computer Science Aug. 2022 – Apr. 2027 (expected)'])assert.equal(facts(record(examples.month,{quote})).programStartYear,null,quote);
});
test('a current-year expected endpoint does not establish continued enrollment',()=>{
 for(const month of ['May','December'])assert.equal(facts(record(examples.month,{quote:'Ph.D. in Computer Science Aug. 2022 – '+month+' 2026 (expected)'})).programStartYear,null,month);
 const candidate=record(examples.month,{quote:'Ph.D. in Computer Science Aug. 2022 – May 2026 (expected)'});candidate.academicResearch.sources.push({id:'ongoing',url:examples.month.url,evidenceExcerpt:'PhD student since 2022.'});candidate.academicResearch.academic.programStartYear.sourceIds.push('ongoing');assert.equal(facts(candidate).programStartYear,2022);
});
test('month-ended thesis, application and candidacy intervals are excluded',()=>{
 for(const quote of ['PhD thesis 2025 – Apr. 2027','PhD applications 2025 – Apr. 2027','PhD candidacy phase 2025 – Apr. 2027'])assert.equal(facts(record(examples.month,{quote,year:2025})).programStartYear,null,quote);
});
test('month-ended event ranges and unproved current programs are excluded',()=>{
 for(const quote of ['MSc in Computer Science Aug. 2022 – Apr. 2027','PhD student internship 2022 – Apr. 2027','PhD student research visit 2022 – Apr. 2027','PhD student project 2022 – Apr. 2027','PhD student scholarship 2022 – Apr. 2027'])assert.equal(facts(record(examples.month,{quote})).programStartYear,null,quote);
 for(const change of [c=>c.academicResearch.identity.status='unresolved',c=>c.academicResearch.identity.matchedPaperIds=[],c=>c.academicResearch.academic.currentStatus.value='Researcher',c=>c.academicResearch.academic.degree.value='MSc',c=>c.academicResearch.academic.programStartYear.sourceIds=['missing']]){const candidate=record(examples.month);change(candidate);assert.equal(facts(candidate).programStartYear,null);}
});
test('future month-ended recovery is a pure citation-derived operation',()=>{
 const candidate=record(examples.month,{year:null}),before=structuredClone(candidate),found=recoverCitedProgramStart(candidate,{currentYear:2026});assert.equal(found.value,2022);assert.deepEqual(found.sourceIds,['bio']);assert.equal(found.asOf,null);assert.equal(found.basis,'source_stated');assert.deepEqual(candidate,before);
});
