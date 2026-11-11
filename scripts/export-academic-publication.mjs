// Explicitly project a selected local checkpoint; no keys, network or run state
// are read beyond the input file supplied by the operator.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {projectAcademicCheckpoint} from '../worker/published-academic.mjs';

export async function exportAcademicPublication(input,output){
 const bytes=await fs.readFile(input),publication=projectAcademicCheckpoint(JSON.parse(bytes));
 publication.sourceCheckpointSha256=createHash('sha256').update(bytes).digest('hex');
 await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,JSON.stringify(publication,null,2)+'\n');
 return {output,profiles:publication.profiles.length,checkpoint:publication.checkpoint};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);if(args.length!==4||args[0]!=='--input'||args[2]!=='--output')throw Error('Usage: node scripts/export-academic-publication.mjs --input checkpoint.json --output selected-publication.json');
 console.log(JSON.stringify(await exportAcademicPublication(path.resolve(args[1]),path.resolve(args[3]))));
}
