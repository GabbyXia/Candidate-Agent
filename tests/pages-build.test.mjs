import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, writeFile, rm, symlink, cp } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { buildPages } from '../scripts/build-pages.mjs';

const projectRoot = new URL('../', import.meta.url);
const publishedAt = '2026-11-11T20:00:00.000Z';
const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
async function tree(directory, prefix = '') {
  const names = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const name = prefix + entry.name;
    names.push(name);
    if (entry.isDirectory()) names.push(...await tree(resolve(directory, entry.name), name + '/'));
  }
  return names;
}
function zipFile(bytes, filename) {
  let offset = 0;
  while (bytes.readUInt32LE(offset) === 0x04034b50) {
    const length = bytes.readUInt32LE(offset + 18), nameLength = bytes.readUInt16LE(offset + 26), extraLength = bytes.readUInt16LE(offset + 28);
    const name = bytes.subarray(offset + 30, offset + 30 + nameLength).toString();
    const start = offset + 30 + nameLength + extraLength;
    if (name === filename) return bytes.subarray(start, start + length).toString();
    offset = start + length;
  }
  throw Error('Missing workbook entry ' + filename);
}
function workbookRows(bytes, filename) {
  const decode = value => value.replace(/&(amp|lt|gt|quot|apos);/g, (_, name) => ({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"})[name]);
  const strings = [...zipFile(bytes, 'xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map(match => [...match[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(text => decode(text[1])).join(''));
  return [...zipFile(bytes, filename).matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)].map(row => Object.fromEntries([...row[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)].map(cell => {
    const column = cell[1].match(/\br="([A-Z]+)\d+"/)[1], value = cell[2].match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? '';
    return [column, /\bt="s"/.test(cell[1]) ? strings[Number(value)] : decode(value)];
  })));
}

test('Pages build retains the complete dated research snapshot and works below a repository path without network access', async () => {
  const temporary = await mkdtemp(resolve(tmpdir(), 'talent-atlas-pages-'));
  const output = resolve(temporary, 'site');
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw Error('The static build must never make a network request.'); };
  try {
    const result = await buildPages({ outputDir: output, publishedAt });
    const bootstrap = await readJson(resolve(output, 'snapshot/bootstrap.json'));
    assert.equal(bootstrap.papers.length, 1200);
    assert.equal(bootstrap.candidates.length, 6847);
    assert.equal(bootstrap.coverage.authorOccurrences, 8869);
    assert.equal(bootstrap.coverage.editions.length, 15);
    const pilot = await readJson(new URL('data/academic-research.json', projectRoot));
    const selected = await readJson(new URL('data/published/network-academic-profiles.json', projectRoot));
    const expectedProfileIds = new Set([...pilot.profiles.map(profile=>profile.candidateId),...selected.profiles.map(profile=>profile.candidateId)]);
    const proposals = bootstrap.candidates.filter(candidate => candidate.academicResearch);
    assert.equal(proposals.length, expectedProfileIds.size);
    assert.equal(result.researchedProfiles, expectedProfileIds.size);
    assert.equal(bootstrap.publication.researchedProfiles, expectedProfileIds.size);
    assert.equal(result.researchCheckpoints[0].completedLookups,selected.checkpoint.completedLookups);
    assert.equal(result.researchCheckpoints[0].researchGroups,6847);
    assert.equal(result.researchCheckpoints[0].complete,selected.checkpoint.complete);
    for (const candidate of proposals) {
      assert.ok(expectedProfileIds.has(candidate.id));
      assert.equal(candidate.academicResearch.candidateId,candidate.id);
      assert.equal(candidate.academicProfile, undefined);
    }
    assert.equal(result.publishedAt, publishedAt);
    assert.equal(bootstrap.publication.mode, 'static_snapshot');
    assert.equal(bootstrap.publication.sourceRetrievedAt, bootstrap.coverage.retrievedAt);
    assert.notEqual(bootstrap.coverage.retrievedAt, publishedAt);

    const html = await readFile(resolve(output, 'index.html'), 'utf8');
    assert.match(html, /data-default-view="overview"/);
    assert.ok(html.indexOf('snapshot-config.js') < html.indexOf('runtime.js'));
    assert.ok(html.indexOf('current-program.js') < html.indexOf('app.js'));
    assert.doesNotMatch(html, /(?:src|href)=["']\/(?!\/)/);
    const base = 'https://gabbyxia.github.io/Candidate-Agent/';
    for (const [, href] of html.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
      if (!href.startsWith('./')) continue;
      const address = new URL(href, base);
      assert.equal(address.pathname.startsWith('/Candidate-Agent/'), true);
      const content = await readFile(resolve(output, address.pathname.slice('/Candidate-Agent/'.length)));
      assert.ok(content.length > 0);
      if (/\.(?:js|css)$/.test(address.pathname)) assert.equal(address.searchParams.get('v'), createHash('sha256').update(content).digest('hex').slice(0, 16));
    }
    const context = { window: {} };
    vm.runInNewContext(await readFile(resolve(output, 'snapshot-config.js'), 'utf8'), context);
    assert.equal(context.window.TALENT_ATLAS_STATIC.publishedAt, publishedAt);
    assert.match(context.window.TALENT_ATLAS_STATIC.snapshotVersion, /^[a-f0-9]{16}$/);
    assert.equal(bootstrap.criteria.dateMode, 'current_program_start');
    assert.equal(result.artifacts.length >= 4, true);
    for (const artifact of result.artifacts) {
      const address = new URL(artifact.href, base), content = await readFile(resolve(output, address.pathname.slice('/Candidate-Agent/'.length)));
      assert.equal(address.pathname.startsWith('/Candidate-Agent/downloads/'), true);
      assert.equal(content.length, artifact.bytes);
      assert.equal(address.searchParams.get('v'), createHash('sha256').update(content).digest('hex').slice(0, 16));
    }
    const workbook = await readFile(resolve(output, 'downloads/talent-atlas-research.xlsx'));
    assert.equal(workbook.readUInt32LE(0), 0x04034b50);
    assert.match(zipFile(workbook, 'xl/workbook.xml'), /name="Candidates"/);
    assert.match(zipFile(workbook, 'xl/worksheets/sheet2.xml'), /dimension ref="A1:AB6848"/);
    const candidateRows = workbookRows(workbook, 'xl/worksheets/sheet2.xml'), headers = Object.values(candidateRows[0]);
    assert.ok(headers.includes('Source-stated current program start year'));
    assert.doesNotMatch(headers.join(' | '), /graduat|Estimated/i);
    const supportedRows = candidateRows.slice(1).filter(row => row.K === 'source_stated_current_program');
    const expectedStarts=new Map(proposals.filter(c=>Number.isInteger(c.academicResearch.academic.programStartYear?.value)).map(c=>[c.id,c.academicResearch.academic.programStartYear.value]));
    assert.equal(supportedRows.length, expectedStarts.size);
    assert.equal(supportedRows.length,result.factCoverage.currentProgramStarts);
    assert.ok(supportedRows.length>=20);
    for (const row of supportedRows) assert.equal(row.I, String(expectedStarts.get(row.A)));
    assert.match(zipFile(workbook, 'xl/worksheets/sheet5.xml'), /dimension ref="A1:N1201"/);
    const files = await tree(output);
    assert.ok(files.includes('.nojekyll'));
    assert.ok(files.includes('snapshot/catalog.json'));
    assert.ok(files.includes('snapshot/source-plans.json'));
    assert.ok(!files.some(name => /(^|\/)(?:\.env(?:\.|$)|\.git|\.openai|outputs|server|worker|node_modules)(?:\/|$)/.test(name)));
    assert.ok(!files.some(name => name.endsWith('.mjs')));
  } finally {
    globalThis.fetch = originalFetch;
    await rm(temporary, { recursive: true, force: true });
  }
});

test('Pages build refuses destructive output paths and nonempty unrelated directories', async () => {
  const temporary = await mkdtemp(resolve(tmpdir(), 'talent-atlas-pages-output-'));
  try {
    await writeFile(resolve(temporary, 'keep.txt'), 'keep this file');
    await assert.rejects(buildPages({ outputDir: temporary, publishedAt }), /nonempty output directory/);
    assert.equal(await readFile(resolve(temporary, 'keep.txt'), 'utf8'), 'keep this file');
    await assert.rejects(buildPages({ outputDir: new URL('ui', projectRoot).pathname, publishedAt }), /source files/);
    await assert.rejects(buildPages({ outputDir: new URL('.', projectRoot).pathname, publishedAt }), /source files/);
  } finally { await rm(temporary, { recursive: true, force: true }); }
});

test('Only explicitly published artifacts can enter the public output, with path and symlink escapes rejected', async () => {
  const temporary = await mkdtemp(resolve(tmpdir(), 'talent-atlas-pages-publish-'));
  const published = resolve(temporary, 'data/published');
  await mkdir(published, { recursive: true });
  try {
    await writeFile(resolve(temporary, 'private.json'), '{"private":"must not publish"}');
    await writeFile(resolve(published, 'manifest.json'), JSON.stringify({ artifacts: [{ file: '../../private.json' }] }));
    await assert.rejects(buildPages({ sourceRoot: temporary, outputDir: resolve(temporary, 'site'), publishedAt }), /inside data\/published/);
    await symlink(resolve(temporary, 'private.json'), resolve(published, 'escaped.json'));
    await writeFile(resolve(published, 'manifest.json'), JSON.stringify({ artifacts: [{ file: 'escaped.json' }] }));
    await assert.rejects(buildPages({ sourceRoot: temporary, outputDir: resolve(temporary, 'site'), publishedAt }), /regular files inside data\/published/);
    await writeFile(resolve(published, 'manifest.json'), JSON.stringify({ artifacts: [{ file: '.env' }] }));
    await assert.rejects(buildPages({ sourceRoot: temporary, outputDir: resolve(temporary, 'site'), publishedAt }), /JSON, XLSX, CSV, or PDF/);
  } finally { await rm(temporary, { recursive: true, force: true }); }
});

test('academic download bytes are projected as strictly as the bootstrap data',async()=>{
 const temporary=await mkdtemp(resolve(tmpdir(),'talent-public-profile-')),root=resolve(temporary,'source'),output=resolve(temporary,'site'),sentinel='do-not-publish-private-sentinel';
 try{
  await mkdir(root,{recursive:true});for(const name of ['data','ui','shared'])await cp(new URL(name,projectRoot),resolve(root,name),{recursive:true});
  const file=resolve(root,'data/published/network-academic-profiles.json'),input=await readJson(file);input.privateNotes=sentinel;input.profiles[0].research.privateNotes=sentinel;input.profiles[0].research.sources[0]&&(input.profiles[0].research.sources[0].privateNotes=sentinel);await writeFile(file,JSON.stringify(input));
  const result=await buildPages({sourceRoot:root,outputDir:output,publishedAt}),artifact=result.artifacts.find(a=>a.filename==='network-academic-profiles.json'),target=new URL(artifact.href,'https://gabbyxia.github.io/Candidate-Agent/');
  assert(!String(await readFile(resolve(output,target.pathname.slice('/Candidate-Agent/'.length)))).includes(sentinel));assert(!String(await readFile(resolve(output,'snapshot/bootstrap.json'))).includes(sentinel));
  const pilotDownload=result.artifacts.find(a=>a.filename==='academic-research.json');assert.match(pilotDownload.description,/^4 original/);
 }finally{await rm(temporary,{recursive:true,force:true});}
});
