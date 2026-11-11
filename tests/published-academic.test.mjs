import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {currentProgramFacts} from '../shared/current-program.js';
import {projectAcademicResearch,mergeAcademicPublication,projectAcademicPublication} from '../worker/published-academic.mjs';

const publication=JSON.parse(await fs.readFile(new URL('../data/published/network-academic-profiles.json',import.meta.url),'utf8'));
const pilot=JSON.parse(await fs.readFile(new URL('../data/academic-research.json',import.meta.url),'utf8')).profiles;
const example=publication.profiles.find(p=>p.research.identity.status==='matched'&&p.research.academic.currentStatus.value==='Faculty');
function fixture(entry=example){return {candidates:[{id:entry.candidateId,paperIds:[...entry.paperIds],name:'Existing publisher record',status:'Unknown',startYear:null,academicProfile:{reviewed:true},evidence:{sourceUrl:'https://existing.edu/profile'}}],papers:entry.paperIds.map(id=>({id}))};}
function one(entry=example){return {schemaVersion:1,kind:'academic_profile_snapshot',cohortId:'test',checkpoint:{at:'2026-11-11T11:02:57Z',complete:true,papers:entry.paperIds.length,authorRecords:1,completedLookups:1,pendingLookups:0,inProgress:0,rateLimitedLookups:0,uncertainLookups:0,pausedLookups:0,retainedProfiles:1},profiles:[entry]};}

test('selected public checkpoint retains professional citations and exact partial coverage',()=>{
 assert.equal(publication.profiles.length,publication.checkpoint.retainedProfiles);assert(publication.profiles.length>=843);assert(publication.checkpoint.completedLookups>=953);assert.equal(publication.checkpoint.authorRecords,5433);assert.equal(publication.checkpoint.complete,publication.checkpoint.completedLookups===5433);
 const seen=new Set();for(const entry of publication.profiles){assert(!seen.has(entry.candidateId));seen.add(entry.candidateId);assert.deepEqual(Object.keys(entry).sort(),['candidateId','paperIds','research']);assert.deepEqual(Object.keys(entry.research.academic).sort(),['currentAffiliation','currentStatus','degree','programStartYear','researchInterests']);projectAcademicResearch(entry.candidateId,entry.paperIds,entry.research);}
 const serialized=JSON.stringify(publication);for(const name of ['mappingResearch','screening','gradRange','expectedGraduationYear','verifiedPerson','providerDiagnostics','chineseNameCheck'])assert(!serialized.includes('"'+name+'"'));
 const starts=publication.profiles.filter(entry=>currentProgramFacts({id:entry.candidateId,paperIds:entry.paperIds,academicResearch:entry.research}).programStartYear!==null);assert(starts.length>=19);
});
test('professional projection discards unrelated fields and never publishes namesake academic claims',()=>{
 const input=structuredClone(example.research);input.privateNotes='private';input.screening={decision:'private'};input.chineseNameCheck={label:'private'};input.identity.rationale='private text';input.academic.expectedGraduationYear={value:2027};input.sources[0].privateNotes='private';
 let result=projectAcademicResearch(example.candidateId,example.paperIds,input);assert(!JSON.stringify(result).includes('private'));assert.equal(result.academic.currentStatus.value,'Faculty');assert.equal(result.academic.degree.value,null);assert.equal(result.academic.programStartYear.value,null);
 input.identity.status='ambiguous';result=projectAcademicResearch(example.candidateId,example.paperIds,input);assert(Object.values(result.academic).every(field=>field.value===null));
});
test('citationless or credential-bearing sources are rejected before publication',()=>{
 for(const mutate of [r=>r.sources[0].url='https://secret@profile.edu/cv',r=>r.sources[0].url='https://profile.edu/cv?api_key=not-public',r=>r.sources[0].evidenceExcerpt='',r=>r.academic.currentStatus.sourceIds=['missing']]){const input=structuredClone(example.research);mutate(input);assert.throws(()=>projectAcademicResearch(example.candidateId,example.paperIds,input),/Academic publication/);}
});
test('whole-document projection removes private additions before downloadable JSON is serialized',()=>{
 const input=one(structuredClone(example)),sentinel='private-publication-sentinel';input.privateNotes=sentinel;input.checkpoint.privateNotes=sentinel;input.profiles[0].privateNotes=sentinel;input.profiles[0].research.privateNotes=sentinel;input.profiles[0].research.sources[0].privateNotes=sentinel;
 const projected=projectAcademicPublication(input);assert(!JSON.stringify(projected).includes(sentinel));assert.equal(projected.profiles[0].research.academic.currentStatus.value,'Faculty');assert.equal(projected.checkpoint.completedLookups,1);
});
test('merge is anchored to the same author and papers and does not accept or overwrite manual facts',()=>{
 const target=fixture(),before=structuredClone(target.candidates[0]);const result=mergeAcademicPublication(target,one());assert.equal(result.updatedProfiles,1);assert.equal(target.candidates[0].academicResearch.academic.currentStatus.value,'Faculty');assert.equal(target.candidates[0].status,'Unknown');assert.equal(target.candidates[0].startYear,null);assert.deepEqual(target.candidates[0].evidence,before.evidence);assert.deepEqual(target.candidates[0].academicProfile,before.academicProfile);
 for(const mutate of [p=>p.profiles[0].candidateId='different-author',p=>p.profiles[0].paperIds=['different-paper']]){const input=one(structuredClone(example));mutate(input);assert.throws(()=>mergeAcademicPublication(fixture(),input),/Academic publication/);}
});
test('older and repeated imports retain newer published or local research',()=>{
 const target=fixture();mergeAcademicPublication(target,one());assert.equal(mergeAcademicPublication(target,one()).updatedProfiles,0);const previous=structuredClone(target.candidates[0].academicResearch);target.candidates[0].academicResearch.queriedAt='2026-11-12T00:00:00Z';assert.equal(mergeAcademicPublication(target,one()).updatedProfiles,0);assert.equal(target.candidates[0].academicResearch.queriedAt,'2026-11-12T00:00:00Z');assert.equal(target.candidates[0].academicResearch.academic.currentStatus.value,previous.academic.currentStatus.value);
});
