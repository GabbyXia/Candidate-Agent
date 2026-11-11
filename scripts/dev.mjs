import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
try{process.loadEnvFile(fileURLToPath(new URL('../.env',import.meta.url)))}catch(error){if(error.code!=='ENOENT')throw error}
import { handleApi } from '../worker/api.mjs';
import { createLocalBindings } from './local-bindings.mjs';
const root = new URL('../ui/', import.meta.url);
const snapshots = await Promise.all(['usenix','networking'].map(async name=>JSON.parse(await readFile(new URL('../data/'+name+'.json',import.meta.url),'utf8'))));
const sourceSnapshot = {papers:snapshots.flatMap(s=>s.papers),editions:snapshots.flatMap(s=>s.editions||(Array.isArray(s.coverage)?s.coverage:s.coverage?.editions)||[]),warnings:snapshots.flatMap(s=>s.warnings||[]),retrievedAt:snapshots.map(s=>s.retrievedAt||s.collectedAt||s.coverage?.retrievedAt).filter(Boolean).sort().at(-1)};
const academicSnapshot = JSON.parse(await readFile(new URL('../data/academic-research.json',import.meta.url),'utf8'));
const sourcePlanSeeds = JSON.parse(await readFile(new URL('../data/source-plans.json',import.meta.url),'utf8'));
const localBindings = await createLocalBindings();
const server = createServer(async(req,res)=>{
  try {
    let body='';for await(const chunk of req){body+=chunk;if(body.length>2097152){res.writeHead(413);res.end('Request too large');return}}
    const request = new Request('http://localhost:4173'+req.url,{method:req.method,headers:req.headers,...(['GET','HEAD'].includes(req.method)?{}:{body})});
    const api = await handleApi(request,{...process.env,...localBindings,SOURCE_SNAPSHOT:sourceSnapshot,ACADEMIC_RESEARCH_SNAPSHOT:academicSnapshot,SOURCE_PLAN_SEEDS:sourcePlanSeeds});
    if(api){res.writeHead(api.status,Object.fromEntries(api.headers));res.end(await api.text());return}
    const path=new URL(request.url).pathname;
    if(path==='/runtime.js'){res.writeHead(200,{'Content-Type':'application/javascript; charset=utf-8'});res.end(await readFile(new URL('runtime.js',root),'utf8'));return}
    if(path==='/catalog.js'){res.writeHead(200,{'Content-Type':'application/javascript; charset=utf-8'});res.end((await readFile(new URL('../shared/catalog.js',import.meta.url),'utf8')).replace(/^export /gm,''));return}
    if(path==='/current-program.js'){res.writeHead(200,{'Content-Type':'application/javascript; charset=utf-8'});res.end((await readFile(new URL('../shared/current-program.js',import.meta.url),'utf8')).replace(/^export /gm,''));return}
    const files={'/':['index.html','text/html'],'/index.html':['index.html','text/html'],'/app.css':['app.css','text/css'],'/app.js':['app.js','application/javascript'],'/profile-research.js':['profile-research.js','application/javascript'],'/profile-research.css':['profile-research.css','text/css'],'/source-plans.js':['source-plans.js','application/javascript'],'/source-plans.css':['source-plans.css','text/css'],'/mapping-run.js':['mapping-run.js','application/javascript'],'/mapping-export.js':['mapping-export.js','application/javascript'],'/mapping-run.css':['mapping-run.css','text/css']};
    if(!files[path]){res.writeHead(404);res.end('Not found');return}
    const [file,type]=files[path];res.writeHead(200,{'Content-Type':type+'; charset=utf-8','Cache-Control':'no-cache'});res.end(await readFile(new URL(file,root)));
  }catch{res.writeHead(500);res.end('Unable to complete the request.')}
});
server.listen(4173,'127.0.0.1',()=>console.log('Local: http://localhost:4173'));
server.on('close',()=>localBindings.close());
