import test from 'node:test';
import assert from 'node:assert/strict';
import {currentProgramFacts,recoverCitedProgramStart} from '../shared/current-program.js';

// Replayed source excerpts from the saved 2026-11-11 checkpoint. All three
// original programStartYear fields were already null; parsing does not fill them.
const replay=[
 {id:'author:0eead28dc62bf24b',paper:'publisher:imc:2025:22374a8a',source:'src-cv',url:'https://danielja.ng/danieljang_cv.pdf',status:'PhD student',year:2025,excerpt:'Ph.D. in Computer Science (Advisor: Fabián E. Bustamante) September 2025 - Present'},
 {id:'author:1b18ff830bf25a43',paper:'publisher:sigcomm:2026:bad4d385',source:'src-resume',url:'https://aygong.com/docu/resume.pdf',status:'PhD student',year:2024,excerpt:'Doctor of Philosophy, Networking Systems Sep. 2024 – Present'},
 {id:'author:1383642496310fb2',paper:'publisher:imc:2026:3264b20',source:'cap-profile',url:'https://cap.stanford.edu/profiles/frdActionServlet',status:'PhD candidate',year:2023,excerpt:'Ph.D. Student in Computer Science, admitted Autumn 2023'},
];
function candidate(excerpt,year,{example=replay[0],status=example.status,degree='PhD'}={}){
 const field=value=>({value,sourceIds:value===null?[]:[example.source],asOf:null,confidence:value===null?'unknown':'medium',basis:value===null?'unknown':'source_stated'});
 return {id:example.id,paperIds:[example.paper],academicResearch:{candidateId:example.id,identity:{status:'matched',matchedPaperIds:[example.paper],sourceIds:[example.source]},academic:{currentStatus:field(status),degree:field(degree),programStartYear:field(year)},sources:[{id:example.source,url:example.url,evidenceExcerpt:excerpt}]}};
}
const facts=c=>currentProgramFacts(c,{currentYear:2026});

for(const example of replay)test('cached exact excerpt supports the current start for '+example.id,()=>{
 const stored=candidate(example.excerpt,null,{example}),before=structuredClone(stored);
 assert.equal(facts(stored).programStartYear,null);
 const proposal=structuredClone(stored);proposal.academicResearch.academic.programStartYear={value:example.year,sourceIds:[example.source],asOf:null,confidence:'medium',basis:'source_stated'};
 const proposalBefore=structuredClone(proposal),result=facts(proposal);
 assert.equal(result.category,'source_stated');assert.equal(result.programStartYear,example.year);
 assert.equal(result.sources[0].evidenceExcerpt,example.excerpt);
 assert.deepEqual(stored,before);assert.deepEqual(proposal,proposalBefore);
});

test('recognized dotted months and adviser initials do not split a current degree range',()=>{
 for(const month of ['Jan.','Feb.','Mar.','Apr.','Jun.','Jul.','Aug.','Sep.','Sept.','Oct.','Nov.','Dec.'])assert.equal(facts(candidate('PhD student '+month+'2024–Present',2024)).programStartYear,2024,month);
 for(const label of ['Advisor','Adviser','Supervisor'])assert.equal(facts(candidate('Ph.D. student ('+label+': Fabián E. Bustamante) September 2025–Present',2025)).programStartYear,2025,label);
 for(const title of ['Prof.','Dr.'])assert.equal(facts(candidate('Ph.D. student (Adviser: '+title+' Fabián E. Bustamante) September 2025–Present',2025)).programStartYear,2025,title);
});

test('adviser abbreviations do not erase a real sentence boundary before employment',()=>{
 for(const title of ['Prof.','Dr.'])assert.equal(facts(candidate('PhD student (Advisor: '+title+' Fabián E. Bustamante). Internship started in 2024.',2024)).programStartYear,null,title);
 assert.equal(facts(candidate('PhD student (Adviser: Dr. Fabián E. Bustamante) since 2021. Paper submitted in 2024.',2024)).programStartYear,null);
});

test('term admissions require the cited current student degree, not an offer or historical credential',()=>{
 for(const term of ['Autumn 2023','Autumn2023','Fall 2023','Spring 2023'])assert.equal(facts(candidate('PhD student admitted '+term,2023)).programStartYear,2023,term);
 for(const excerpt of ['PhD student offered admission Autumn 2023','PhD student admitted Autumn 2023 with a conditional offer','Incoming PhD student admitted Autumn 2023','Prospective PhD student admitted Autumn 2023','Former PhD student admitted Autumn 2023','Master’s student admitted Autumn 2023'])assert.equal(facts(candidate(excerpt,2023)).programStartYear,null,excerpt);
 assert.equal(facts(candidate(replay[2].excerpt,2023,{status:'Faculty'})).programStartYear,null);
 assert.equal(facts(candidate(replay[2].excerpt,2023,{degree:null})).programStartYear,null);
});

test('an admission term cannot override a different explicit current-program start',()=>{
 for(const excerpt of ['PhD student admitted Autumn 2023 but began the program in 2024','PhD student admitted Autumn 2023, deferred enrollment until 2024'])assert.equal(facts(candidate(excerpt,2023)).programStartYear,null,excerpt);
 const c=candidate('PhD student admitted Autumn 2023',2023),r=c.academicResearch;
 r.sources.push({id:'actual-start',url:'https://danielja.ng/',evidenceExcerpt:'PhD student started the program in 2024.'});
 r.academic.degree.sourceIds.push('actual-start');
 assert.equal(facts(c).programStartYear,null);
});

test('unrelated employment does not veto an explicitly stated current admission term',()=>{
 assert.equal(facts(candidate('PhD student admitted Autumn 2023; internship started 2024.',2023)).programStartYear,2023);
 assert.equal(facts(candidate('PhD student admitted Autumn 2023, internship started 2024.',2023)).programStartYear,2023);
});

test('closed prior degrees and range-end years do not establish a current start',()=>{
 for(const excerpt of ['PhD 2019–2023.','Completed PhD 2019–Present.','MSc 2021–2023. PhD student Sep. 2024–Present.'])assert.equal(facts(candidate(excerpt,excerpt.startsWith('MSc')?2021:2019)).programStartYear,null,excerpt);
 assert.equal(facts(candidate('MSc 2021–2023. PhD student Sep. 2024–Present.',2024)).programStartYear,2024);
 assert.equal(facts(candidate('PhD student 2021–2025.',2025)).programStartYear,null);
 assert.equal(currentProgramFacts(candidate('PhD student 2024–Expected 2027.',2027),{currentYear:2028}).programStartYear,null);
 assert.equal(facts(candidate('PhD student 2024–Expected 2027.',2024)).programStartYear,2024);
});

test('employment, awards and publication dates stay separate from current program starts',()=>{
 for(const excerpt of ['PhD student since 2021, internship 2024.','PhD student started an internship in 2024.','PhD student started a paper submission in 2024.','PhD student awarded a scholarship in 2024.'])assert.equal(facts(candidate(excerpt,2024)).programStartYear,null,excerpt);
 assert.equal(facts(candidate('PhD student since 2021, internship 2024.',2021)).programStartYear,2021);
 assert.equal(facts(candidate('Internship started 2024. PhD student enrolled in 2023.',2023)).programStartYear,2023);
});

test('a date for a different program cannot supply the current degree year',()=>{
 assert.equal(facts(candidate('Master’s student since 2024. PhD student since 2021.',2024)).programStartYear,null);
 assert.equal(facts(candidate('PhD student since 2021; Master’s student admitted Autumn 2024.',2024)).programStartYear,null);
});

test('matched publication identity and complete cited status, degree and start remain prerequisites',()=>{
 for(const change of [c=>c.academicResearch.identity.status='unresolved',c=>c.academicResearch.identity.matchedPaperIds=[],c=>c.academicResearch.academic.currentStatus.sourceIds=['missing'],c=>c.academicResearch.academic.degree.sourceIds=['missing'],c=>c.academicResearch.academic.programStartYear.sourceIds=['missing']]){const c=candidate(replay[2].excerpt,2023);change(c);assert.equal(facts(c).programStartYear,null);}
});

for(const example of replay)test('recover a unique cited year without rewriting raw research for '+example.id,()=>{
 const original=candidate(example.excerpt,null,{example}),before=structuredClone(original),field=recoverCitedProgramStart(original,{currentYear:2026});assert.equal(field?.value,example.year);assert.equal(field?.basis,'source_stated');assert.deepEqual(original,before);
 const corrected=structuredClone(original);corrected.academicResearch.academic.programStartYear=field;assert.equal(facts(corrected).programStartYear,example.year);
});
test('source recovery does not guess a missing, completed, unrelated or ambiguous program year',()=>{
 for(const excerpt of ['PhD student researching distributed systems.','PhD 2018–2021.','PhD student internship began 2024.','MSc 2023–present; PhD student.','PhD 2023–present and PhD 2024–present.']){const value=candidate(excerpt,null);assert.equal(recoverCitedProgramStart(value,{currentYear:2026}),null,excerpt);}
 const value=candidate(replay[0].excerpt,null);value.academicResearch.identity.status='ambiguous';assert.equal(recoverCitedProgramStart(value,{currentYear:2026}),null);
});
