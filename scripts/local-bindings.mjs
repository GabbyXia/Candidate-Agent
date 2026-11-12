// Local SQLite and filesystem bindings for optional research tools.
import { DatabaseSync } from 'node:sqlite';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export async function createLocalBindings({directory=new URL('../outputs/local/',import.meta.url)}={}){
  await mkdir(directory,{recursive:true});
  const db=new DatabaseSync(fileURLToPath(new URL('source-plans.sqlite',directory)));
  db.exec('CREATE TABLE IF NOT EXISTS local_migrations (name TEXT PRIMARY KEY, digest TEXT NOT NULL)');
  const migrationRoot=new URL('../drizzle/',import.meta.url);
  for(const name of (await readdir(migrationRoot)).filter(name=>name.endsWith('.sql')).sort()){
    const sql=await readFile(new URL(name,migrationRoot),'utf8'),digest=createHash('sha256').update(sql).digest('hex');
    const applied=db.prepare('SELECT digest FROM local_migrations WHERE name = ?').get(name);
    if(applied){if(applied.digest!==digest)throw Error('An applied local migration changed: '+name);continue}
    db.exec('BEGIN');try{db.exec(sql);db.prepare('INSERT INTO local_migrations (name,digest) VALUES (?,?)').run(name,digest);db.exec('COMMIT')}catch(error){db.exec('ROLLBACK');throw error}
  }
  const prepare=(query,values=[])=>({
    bind(...args){return prepare(query,args)},
    _execute(){const statement=db.prepare(query),results=statement.all(...values);const meta=db.prepare('SELECT changes() AS changes,last_insert_rowid() AS last_row_id').get();return {success:true,results,meta:{changes:Number(meta.changes),last_row_id:Number(meta.last_row_id)}}},
    async all(){return this._execute()},
    async first(column){const row=db.prepare(query).get(...values)||null;return column&&row?row[column]:row},
    async run(){return this._execute()},
  });
  const DB={prepare,async batch(statements){db.exec('BEGIN');try{const results=statements.map(statement=>statement._execute());db.exec('COMMIT');return results}catch(error){db.exec('ROLLBACK');throw error}}};
  const objects=new URL('objects/',directory);await mkdir(objects,{recursive:true});
  const objectFile=key=>new URL(createHash('sha256').update(String(key)).digest('hex')+'.json',objects);
  const BUCKET={
    async put(key,value){await writeFile(objectFile(key),typeof value==='string'?value:Buffer.from(value));return {key}},
    async get(key){try{const data=await readFile(objectFile(key));return {key,body:new Response(data).body,async text(){return data.toString('utf8')},async json(){return JSON.parse(data.toString('utf8'))},async arrayBuffer(){return data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength)}}}catch(error){if(error.code==='ENOENT')return null;throw error}},
  };
  return {DB,BUCKET,close(){db.close()}};
}
