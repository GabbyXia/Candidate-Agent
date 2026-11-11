import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, writeFile, rm, symlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import vm from 'node:vm';
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
    const proposals = bootstrap.candidates.filter(candidate => candidate.academicResearch);
    assert.equal(proposals.length, 4);
    for (const candidate of proposals) {
      assert.deepEqual(candidate.academicResearch, pilot.profiles.find(profile => profile.candidateId === candidate.id));
      assert.equal(candidate.academicProfile, undefined);
    }
    assert.equal(result.publishedAt, publishedAt);
    assert.equal(bootstrap.publication.mode, 'static_snapshot');
    assert.equal(bootstrap.publication.sourceRetrievedAt, bootstrap.coverage.retrievedAt);
    assert.notEqual(bootstrap.coverage.retrievedAt, publishedAt);

    const html = await readFile(resolve(output, 'index.html'), 'utf8');
    assert.match(html, /data-default-view="overview"/);
    assert.ok(html.indexOf('snapshot-config.js') < html.indexOf('runtime.js'));
    assert.doesNotMatch(html, /(?:src|href)=["']\/(?!\/)/);
    const base = 'https://gabbyxia.github.io/Candidate-Agent/';
    for (const [, href] of html.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
      if (!href.startsWith('./')) continue;
      assert.equal(new URL(href, base).pathname.startsWith('/Candidate-Agent/'), true);
      assert.ok((await readFile(resolve(output, href))).length > 0);
    }
    const context = { window: {} };
    vm.runInNewContext(await readFile(resolve(output, 'snapshot-config.js'), 'utf8'), context);
    assert.equal(context.window.TALENT_ATLAS_STATIC.publishedAt, publishedAt);
    assert.equal(result.artifacts.length >= 4, true);
    for (const artifact of result.artifacts) {
      assert.equal(new URL(artifact.href, base).pathname.startsWith('/Candidate-Agent/downloads/'), true);
      assert.equal((await readFile(resolve(output, artifact.href))).length, artifact.bytes);
    }
    const workbook = await readFile(resolve(output, 'downloads/talent-atlas-research.xlsx'));
    assert.equal(workbook.readUInt32LE(0), 0x04034b50);
    assert.match(zipFile(workbook, 'xl/workbook.xml'), /name="Candidates"/);
    assert.match(zipFile(workbook, 'xl/worksheets/sheet2.xml'), /dimension ref="A1:AB6848"/);
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
