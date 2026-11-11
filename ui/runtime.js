'use strict';

// GitHub Pages serves exported files. Keep API access explicit so this build
// cannot accidentally send research requests to the site's public origin.
function atlasFetch(input,options={}){
  if(!globalThis.TALENT_ATLAS_STATIC)return fetch(input,options);
  const path=typeof input==='string'?input:input.url;
  const method=String(options.method||input?.method||'GET').toUpperCase();
  const json=(data,status=200)=>Promise.resolve(new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}}));
  if(method!=='GET'&&method!=='HEAD')return json({ok:false,status:'snapshot_only',error:'This is a published research snapshot. Run new research separately and publish the updated results.'},405);
  const files={'/api/bootstrap':'bootstrap.json','/api/catalog':'catalog.json','/api/profile-research/pilot':'profile-pilot.json','/api/source-plans':'source-plans.json'};
  if(files[path])return fetch(new URL('snapshot/'+files[path],document.baseURI).href,options);
  if(path==='/api/profile-research/status')return json({configured:false,missing:[],maxBatchSize:0,snapshot:true});
  if(path==='/api/source-plans/status')return json({storageAvailable:false,modelConfigured:false,missing:[],adapters:[],snapshot:true});
  if(path==='/api/status')return json({aiConfigured:false,aiStatus:'snapshot_only',sources:[],snapshot:true});
  if(path==='/api/mapping-runs')return json({runs:[],snapshot:true});
  return json({ok:false,status:'snapshot_only',error:'This operation is not available in the published snapshot.'},404);
}
