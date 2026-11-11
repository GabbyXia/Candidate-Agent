import { readFile, writeFile, mkdir, rm, copyFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const dist = new URL('dist/', root);
await rm(dist, { recursive: true, force: true });
await mkdir(new URL('server/', dist), { recursive: true });
await mkdir(new URL('.openai/', dist), { recursive: true });
const assets = {};
for (const [name,type] of [['index.html','text/html; charset=utf-8'],['app.css','text/css; charset=utf-8'],['app.js','application/javascript; charset=utf-8'],['profile-research.css','text/css; charset=utf-8'],['profile-research.js','application/javascript; charset=utf-8'],['source-plans.css','text/css; charset=utf-8'],['source-plans.js','application/javascript; charset=utf-8'],['mapping-run.css','text/css; charset=utf-8'],['mapping-export.js','application/javascript; charset=utf-8'],['mapping-run.js','application/javascript; charset=utf-8']]) {
  assets['/'+name] = { type, content: await readFile(new URL('ui/'+name, root),'utf8') };
}
const catalog = await readFile(new URL('shared/catalog.js',root),'utf8');
assets['/runtime.js'] = { type: 'application/javascript; charset=utf-8', content: await readFile(new URL('ui/runtime.js',root),'utf8') };
assets['/catalog.js'] = { type: 'application/javascript; charset=utf-8', content: catalog.replace(/^export /gm,'') };
assets['/current-program.js'] = { type: 'application/javascript; charset=utf-8', content: (await readFile(new URL('shared/current-program.js',root),'utf8')).replace(/^export /gm,'') };
const snapshots = await Promise.all(['usenix','networking'].map(async name=>JSON.parse(await readFile(new URL('data/'+name+'.json',root),'utf8'))));
const sourceSnapshot = {papers:snapshots.flatMap(s=>s.papers),editions:snapshots.flatMap(s=>s.editions||(Array.isArray(s.coverage)?s.coverage:s.coverage?.editions)||[]),warnings:snapshots.flatMap(s=>s.warnings||[]),retrievedAt:snapshots.map(s=>s.retrievedAt||s.collectedAt||s.coverage?.retrievedAt).filter(Boolean).sort().at(-1)};
const academicSnapshot = JSON.parse(await readFile(new URL('data/academic-research.json',root),'utf8'));
const sourcePlanSeeds = JSON.parse(await readFile(new URL('data/source-plans.json',root),'utf8'));
const stripModule = source => source.replace(/^import .*;?\n/gm,'').replace(/^export /gm,'');
const modules = await Promise.all(['worker/usenix.mjs','worker/networking.mjs','worker/profile-research.mjs','worker/source-discovery.mjs','worker/source-plans.mjs','worker/source-plan-api.mjs','worker/mapping-plan.mjs','worker/mapping-runs.mjs','worker/mapping-api.mjs','worker/api.mjs'].map(async path=>stripModule(await readFile(new URL(path,root),'utf8'))));
const worker = await readFile(new URL('worker/index.js',root),'utf8');
await writeFile(new URL('server/index.js',dist),`const ASSETS = ${JSON.stringify(assets)};\nconst SOURCE_SNAPSHOT = ${JSON.stringify(sourceSnapshot)};\nconst ACADEMIC_RESEARCH_SNAPSHOT = ${JSON.stringify(academicSnapshot)};\nconst SOURCE_PLAN_SEEDS = ${JSON.stringify(sourcePlanSeeds)};\n${stripModule(catalog)}\n${modules.join('\n')}\n${worker}`);
await copyFile(new URL('.openai/hosting.json',root),new URL('.openai/hosting.json',dist));
console.log('Built Talent Atlas Worker with embedded UI assets.');
