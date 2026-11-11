import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNetworkingListing, parseNetworkingAuthors, fetchNetworkingEdition, networkingEditionUrl } from '../worker/networking.mjs';

test('SIGCOMM2024 preserves track and explicitly grouped publisher affiliations',()=>{
 const html='<h1>List of Accepted Papers</h1><ul><li><p class="font-bold mb-0">In-Network Address Caching for Virtual Networks<span>Research Track</span></p><p class="text-base">Lior Zeno (Technion); Ang Chen (University of Michigan); Mark Silberstein (Technion)</p></li></ul>';
 const {papers,coverage}=parseNetworkingListing(html,'sigcomm',2024);assert.equal(papers.length,1);assert.equal(papers[0].title,'In-Network Address Caching for Virtual Networks');assert.equal(papers[0].section,'Research Track');assert.deepEqual(papers[0].authors[1].affiliations,['University of Michigan']);assert.equal(coverage.expectedPapers,null);assert.equal(papers[0].url,papers[0].sourceUrl);assert.equal(papers[0].pdfUrl,null);
});
test('SIGCOMM2025 handles shared institutions and nested punctuation without invented data',()=>{
 const {papers}=parseNetworkingListing('<h1>Accepted Papers</h1><h2>Full papers</h2><li><p><span class="text-color-primary">MixNet: A Runtime Reconfigurable Optical-Electrical Fabric</span></p><p class="style_italic">Xudong Liao, Yijun Sun (Hong Kong University of Science and Technology); Han Tian (The University of Science and Technology of China)</p></li>','sigcomm',2025);assert.equal(papers[0].authors.length,3);assert.equal(papers[0].section,'Full papers');assert.deepEqual(papers[0].authors[0].affiliations,papers[0].authors[1].affiliations);
});
test('SIGCOMM2026 table and unknown affiliations',()=>{
 const {papers}=parseNetworkingListing('<h1>Accepted Papers</h1><table><tr><td><b>VeriLucid: A Verification-aware Data-plane Programming Language</b><br><span class=table-description>John Sonchack, Pamela Zave, Jennifer Rexford (Princeton University)</span></td></tr></table>','sigcomm',2026);assert.equal(papers[0].authors.length,3);assert.deepEqual(papers[0].authors[2].affiliations,['Princeton University']);assert.deepEqual(parseNetworkingAuthors('A. Author; B. Author','sigcomm','https://conferences.sigcomm.org/',2026).map(a=>a.affiliations),[[],[]]);
});
test('CoNEXT author institution markup and Unicode entities',()=>{
 const {papers}=parseNetworkingListing('<h2>CoNEXT 2024 Accepted Papers</h2><ol><li><b>NetConfEval: Can LLMs Facilitate Network Configuration?</b><br>Changjie Wang <em>(KTH Royal Institute of Technology)</em> Dejan Kosti&#263; <em>(KTH / RISE)</em><br></li></ol>','conext',2024);assert.equal(papers[0].authors[1].name,'Dejan Kostić');assert.deepEqual(papers[0].authors[1].affiliations,['KTH / RISE']);
 const modern=parseNetworkingListing('<h2>Accepted Papers</h2><li style="margin:1em"><u>UniProxy</u><br>Jinhao Liu (University of Science and Technology of China), Jiangping Han (University of Science and Technology of China)</li>','conext',2026);assert.equal(modern.papers[0].authors.length,2);
});
test('CoNEXT2024 paper-track badge stays in section and never becomes an author',()=>{
 const html='<h2>CoNEXT 2024 Accepted Papers</h2><li><b>NR-Scope: A Practical 5G Standalone Telemetry Tool</b><br>Haoran Wan <em>(Princeton University)</em> Xuyang Cao <em>(Princeton University)</em> Alexander Marder <em>(Johns Hopkins University)</em> Kyle Jamieson <em>(Princeton University)</em><span class="label label-primary label-short">Short</span><br></li>';
 const {papers}=parseNetworkingListing(html,'conext',2024);assert.deepEqual(papers[0].authors.map(a=>a.name),['Haoran Wan','Xuyang Cao','Alexander Marder','Kyle Jamieson']);assert.equal(papers[0].section,'Short papers');assert.ok(!papers[0].rawByline.includes('Short'));assert.equal(parseNetworkingAuthors('Siddhant <em>(Example University)</em>','conext','https://conferences.sigcomm.org/',2024)[0].name,'Siddhant');
});
test('IMC retains published initials, nicknames, and missing affiliations',()=>{
 const {papers}=parseNetworkingListing('<h1>Accepted Papers</h1><h2>Cycle 2</h2><li><strong>Replication: I Tag, You Tag, Everybody Tags!</strong><br>HyunSeok (Daniel) Jang, Hazem Ibrahim, Rohail Asim</li>','imc',2026);assert.equal(papers[0].authors[0].name,'HyunSeok (Daniel) Jang');assert.ok(papers[0].authors.every(a=>a.affiliations.length===0));assert.equal(papers[0].section,'Cycle 2');
});
test('complete listing has no fixed paper cap and stable IDs',()=>{
 const html='<h1>Accepted Papers</h1>'+Array.from({length:301},(_,i)=>`<li><strong>Paper ${i}</strong><br>Author ${i}</li>`).join('');const first=parseNetworkingListing(html,'imc',2026);const second=parseNetworkingListing(html,'imc',2026);assert.equal(first.papers.length,301);assert.equal(first.papers[300].id,second.papers[300].id);
});
test('unavailable source produces zero records and coverage, unsupported input cannot fetch',async()=>{
 let calls=0;const result=await fetchNetworkingEdition('conext',2025,{fetcher:async()=>{calls++;return new Response('unavailable',{status:503})}});assert.equal(result.papers.length,0);assert.equal(result.coverage.status,'unavailable');assert.equal(calls,2);assert.throws(()=>networkingEditionUrl('https://example.com',2026),/Unsupported/);await assert.rejects(()=>fetchNetworkingEdition('imc',2027,{fetcher:()=>{throw Error('must not run')}}),/Unsupported/);
});
test('CoNEXT2025 uses configured official program fallback with actual paper links',async()=>{
 const html='<h2>CoNEXT 2025 Program</h2><li><div><strong>FAT-INT: Frequency-Aware and Item-Wise In-band Network Telemetry <span class="label-long">Long</span></strong></div><div>Heewon Kim; Chanbin Bae; Junkyu Hong (Korea University)</div><a href="https://dl.acm.org/doi/10.1145/3749218">ACM DL</a><a href="https://dl.acm.org/doi/pdf/10.1145/3749218">PDF</a><strong>Abstract:</strong><p>In-band network telemetry investigates the real-time state of networks.</p></li>';
 const result=await fetchNetworkingEdition('conext',2025,{fetcher:async url=>url.includes('/program.html')?new Response(html):new Response('',{status:503})});assert.equal(result.papers.length,1);assert.equal(result.papers[0].url,'https://dl.acm.org/doi/10.1145/3749218');assert.equal(result.coverage.sourceType,'official_program');assert.deepEqual(result.papers[0].authors[0].affiliations,[]);assert.deepEqual(result.papers[0].authors[2].affiliations,['Korea University']);assert.ok(result.papers[0].abstractSnippet);assert.ok(result.warnings.some(w=>w.includes('program instead')));
});
