// Times the main API endpoints. Usage: node scripts/perf/bench.mjs /tmp/perf.json   (backend on :5001)
import fs from 'fs';
const d=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const B='http://localhost:5001';
const H=(t)=>({'Content-Type':'application/json',Authorization:'Bearer '+t});
async function t(name,fn,n=15){
  const xs=[];let size=0;
  for(let i=0;i<n;i++){const s=performance.now();const r=await fn(i);const b=await r.arrayBuffer();size=b.byteLength;xs.push(performance.now()-s);if(!r.ok&&i==0)console.log(name,'HTTP',r.status);}
  xs.sort((a,b)=>a-b);
  console.log(name.padEnd(34),'p50',xs[Math.floor(n/2)].toFixed(0).padStart(4),'ms  p95',xs[Math.floor(n*0.95)].toFixed(0).padStart(4),'ms  ',(size/1024).toFixed(1)+'KB');
}
const g=(p,tok)=>fetch(B+p,{headers:H(tok)});
await g('/api/boards',d.member);
await t('GET /api/boards (list)',()=>g('/api/boards',d.member));
await t('GET board by code',()=>g('/api/boards/by-code/'+d.code,d.member));
await t('GET comments by-code (50, member)',()=>g(`/api/comments/by-code/${d.code}?limit=50`,d.member));
await t('GET comments by-code (100, admin)',()=>g(`/api/comments/by-code/${d.code}?limit=100`,d.admin));
await t('GET comments older page (before)',()=>g(`/api/comments/${d.boardId}?limit=50&before=${encodeURIComponent(new Date(Date.now()-1500*60000).toISOString())}`,d.member));
await t('GET reactions (50 ids)',()=>g(`/api/boards/${d.boardId}/reactions?ids=${d.ids.slice(0,50).join(',')}`,d.member));
await t('GET reads',()=>g(`/api/boards/${d.boardId}/reads`,d.member));
await t('GET search "roadmap"',()=>g(`/api/boards/${d.boardId}/search?q=roadmap`,d.member));
await t('GET search "deploy review" (rare)',()=>g(`/api/boards/${d.boardId}/search?q=%23299`,d.member));
await t('POST message',(i)=>fetch(B+'/api/comments',{method:'POST',headers:H(d.member),body:JSON.stringify({content:'bench '+i+' '+Date.now(),visibility:'EVERYONE',boardId:d.boardId})}),12);
await t('PUT read',()=>fetch(B+`/api/boards/${d.boardId}/read`,{method:'PUT',headers:H(d.member)}));
