import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {mergeAcademicPublication,projectAcademicResearch} from '../worker/published-academic.mjs';
import {buildPages} from '../scripts/build-pages.mjs';
const root=new URL('../',import.meta.url),publication=JSON.parse(await fs.readFile(new URL('../data/published/network-academic-profiles.json',import.meta.url))),pilot=JSON.parse(await fs.readFile(new URL('../data/academic-research.json',import.meta.url)));
const actual=publication.profiles.find(p=>p.research.identity.status==='matched'&&p.research.academic.currentStatus.value!=null);
const unknown=()=>({value:null,sourceIds:[],asOf:null,confidence:'unknown',basis:'unknown'});
function one(entry=actual){return {schemaVersion:1,kind:'academic_profile_snapshot',cohortId:'real-cited-seed-regression',checkpoint:{at:entry.research.queriedAt,complete:true,papers:entry.paperIds.length,authorRecords:1,completedLookups:1,pendingLookups:0,inProgress:0,rateLimitedLookups:0,uncertainLookups:0,pausedLookups:0,retainedProfiles:1},profiles:[entry]};}
function fixture(){const seed=structuredClone(actual.research);seed.academic.currentStatus=unknown();return {seed,target:{candidates:[{id:actual.candidateId,paperIds:[...actual.paperIds],academicResearch:structuredClone(seed)}],papers:actual.paperIds.map(id=>({id}))},options:{seedProfilePolicy:'replace_unchanged_equal',seedProfiles:new Map([[actual.candidateId,seed]])}};}
test('an explicit selected snapshot may replace only an unchanged same-query seed; default precedence remains unchanged',()=>{
 const f=fixture(),before=structuredClone(f.seed);assert.equal(mergeAcademicPublication(f.target,one()).updatedProfiles,0);assert.equal(f.target.candidates[0].academicResearch.academic.currentStatus.value,null);
 assert.equal(mergeAcademicPublication(f.target,one(),f.options).updatedProfiles,1);assert.equal(f.target.candidates[0].academicResearch.academic.currentStatus.value,actual.research.academic.currentStatus.value);assert.deepEqual(f.seed,before);
 assert.equal(mergeAcademicPublication(f.target,one(),f.options).updatedProfiles,0);
});
test('same-query policy preserves newer, undated, edited, reviewed and manually supplied records',()=>{
 for(const mutate of [c=>c.academicResearch.queriedAt=new Date(Date.parse(actual.research.queriedAt)+1000).toISOString(),c=>c.academicResearch.queriedAt=null,c=>c.academicResearch.warnings=[...(c.academicResearch.warnings||[]),'Existing local annotation'],c=>c.academicProfile={reviewed:true},c=>c.evidence={sourceUrl:actual.research.sources[0].url},c=>c.academicResearch.reviewedAt='2026-11-11']){
  const f=fixture();mutate(f.target.candidates[0]);const before=structuredClone(f.target);assert.equal(mergeAcademicPublication(f.target,one(),f.options).updatedProfiles,0);assert.deepEqual(f.target,before);
 }
 const f=fixture();f.seed.requiresHumanReview=false;f.target.candidates[0].academicResearch=structuredClone(f.seed);assert.equal(mergeAcademicPublication(f.target,one(),f.options).updatedProfiles,0);
});
test('an already-projected identical seed never reports a spurious update on repeated explicit imports',()=>{
 const research=projectAcademicResearch(actual.candidateId,actual.paperIds,actual.research),target={papers:actual.paperIds.map(id=>({id})),candidates:[{id:actual.candidateId,paperIds:[...actual.paperIds],academicResearch:structuredClone(research)}]},before=structuredClone(target),options={seedProfilePolicy:'replace_unchanged_equal',seedProfiles:new Map([[actual.candidateId,structuredClone(research)]])};
 assert.equal(mergeAcademicPublication(target,one(),options).updatedProfiles,0);assert.equal(mergeAcademicPublication(target,one(),options).updatedProfiles,0);assert.deepEqual(target,before);
});
test('seed precedence cannot waive identity, paper scope or explicit policy validation',()=>{
 const f=fixture(),other=structuredClone(actual);other.candidateId='author:not-in-the-corpus';assert.throws(()=>mergeAcademicPublication(f.target,one(other),f.options),/Academic publication/);
 const wrong=structuredClone(actual);wrong.paperIds=['not-a-provided-paper'];assert.throws(()=>mergeAcademicPublication(f.target,one(wrong),f.options),/Academic publication/);
 assert.throws(()=>mergeAcademicPublication(f.target,one(),{seedProfilePolicy:'replace_everything',seedProfiles:f.options.seedProfiles}),/seed profile policy/);
 assert.throws(()=>mergeAcademicPublication(f.target,one(),{seedProfilePolicy:'replace_unchanged_equal'}),/seed profile records/);
});
test('the builder applies explicit final-seed precedence and preserves all four dated pilot archive bytes',async t=>{
 const temporary=await fs.mkdtemp(path.join(tmpdir(),'final-seed-build-')),source=path.join(temporary,'source');t.after(()=>fs.rm(temporary,{recursive:true,force:true}));await fs.mkdir(source);for(const name of ['data','ui','shared'])await fs.cp(new URL(name,root),path.join(source,name),{recursive:true});
 const archive=structuredClone(pilot),record=archive.profiles.find(p=>p.identity?.status==='matched'&&p.academic?.currentStatus?.value!=null);assert(record);const ids=[...record.identity.matchedPaperIds],research=projectAcademicResearch(record.candidateId,ids,record),entry={candidateId:record.candidateId,paperIds:ids,research};assert(research.academic.currentStatus.value);
 record.academic.currentStatus=unknown();const archiveBytes=Buffer.from(JSON.stringify(archive,null,2)+'\n');await fs.writeFile(path.join(source,'data/academic-research.json'),archiveBytes);
 await fs.writeFile(path.join(source,'data/published/final.json'),JSON.stringify(one(entry)));const config={artifacts:[{file:'final.json',kind:'academic_profiles'}]};await fs.writeFile(path.join(source,'data/published/manifest.json'),JSON.stringify(config));
 const first=path.join(temporary,'default');await buildPages({sourceRoot:source,outputDir:first,publishedAt:'2026-11-11T20:00:00Z'});const old=JSON.parse(await fs.readFile(path.join(first,'snapshot/bootstrap.json'))).candidates.find(c=>c.id===record.candidateId);assert.equal(old.academicResearch.academic.currentStatus.value,null);
 config.artifacts[0].seedProfilePolicy='replace_unchanged_equal';await fs.writeFile(path.join(source,'data/published/manifest.json'),JSON.stringify(config));const next=path.join(temporary,'final');await buildPages({sourceRoot:source,outputDir:next,publishedAt:'2026-11-11T20:00:00Z'});const snapshot=JSON.parse(await fs.readFile(path.join(next,'snapshot/bootstrap.json'))),updated=snapshot.candidates.find(c=>c.id===record.candidateId);assert.equal(snapshot.candidates.length,6847);assert.equal(snapshot.papers.length,1200);assert.equal(updated.academicResearch.academic.currentStatus.value,research.academic.currentStatus.value);assert.equal(updated.academicResearch.queriedAt,record.queriedAt);
 assert.deepEqual(await fs.readFile(path.join(next,'downloads/academic-research.json')),archiveBytes);assert.deepEqual(await fs.readFile(path.join(next,'snapshot/profile-pilot.json')),archiveBytes);assert.deepEqual(await fs.readFile(path.join(source,'data/academic-research.json')),archiveBytes);
});
test('only an explicitly selected academic snapshot may request seed precedence',async t=>{
 const temporary=await fs.mkdtemp(path.join(tmpdir(),'invalid-seed-policy-')),published=path.join(temporary,'source/data/published');t.after(()=>fs.rm(temporary,{recursive:true,force:true}));await fs.mkdir(published,{recursive:true});await fs.writeFile(path.join(published,'report.json'),'{}');
 for(const artifact of [{file:'report.json',kind:'download',seedProfilePolicy:'replace_unchanged_equal'},{file:'report.json',kind:'academic_profiles',seedProfilePolicy:'replace_everything'}]){await fs.writeFile(path.join(published,'manifest.json'),JSON.stringify({artifacts:[artifact]}));await assert.rejects(buildPages({sourceRoot:path.join(temporary,'source'),outputDir:path.join(temporary,'out')}),/Seed profile policy/);}
});
