// Seeds a 3000-message board (12 members, reactions, replies) and prints JSON with tokens for bench.mjs.
// Usage: node scripts/perf/perf-seed.js > /tmp/perf.json   (needs backend/.env and a migrated DB)
const path=require('path').resolve(__dirname,'../../')+'/';
require(path+'node_modules/dotenv').config({path:path+'.env'});
const {PrismaClient}=require(path+'node_modules/@prisma/client');
const jwt=require(path+'node_modules/jsonwebtoken');
(async()=>{
  const p=new PrismaClient();
  const users=[];
  for(let i=0;i<12;i++){users.push(await p.user.upsert({where:{email:`perf${i}@demo.test`},update:{},create:{name:i===0?'Perf Admin':`Perf User ${i}`,email:`perf${i}@demo.test`}}));}
  const board=await p.board.create({data:{name:'Perf Board',code:'PERF'+Date.now().toString(36).toUpperCase().slice(-5),createdBy:users[0].id}});
  for(let i=0;i<users.length;i++) await p.boardMembership.create({data:{userId:users[i].id,boardId:board.id,role:i===0?'ADMIN':'MEMBER'}});
  const N=3000, now=Date.now(); const ids=[]; const rows=[];
  const words='roadmap sprint deploy review bug fix standup design api database cache latency feedback release'.split(' ');
  for(let i=0;i<N;i++){
    const u=users[i%users.length]; const id=require('crypto').randomUUID(); ids.push(id);
    rows.push({id,content:Array.from({length:4+(i%14)},(_,k)=>words[(i*7+k*3)%words.length]).join(' ')+` #${i}`,visibility:i%17===0?'ADMIN_ONLY':'EVERYONE',createdById:u.id,boardId:board.id,anonymous:i%9===0,createdAt:new Date(now-(N-i)*60000),parentId:i>10&&i%6===0?ids[i-5]:null});
  }
  await p.comment.createMany({data:rows});
  const reacts=[]; for(let i=0;i<N;i+=3){for(let k=0;k<1+(i%4);k++){reacts.push({commentId:ids[i],userId:users[(i+k)%users.length].id,emoji:['👍','❤️','😂','🎉'][k%4]});}}
  await p.reaction.createMany({data:reacts,skipDuplicates:true});
  const tok=(u)=>jwt.sign({userId:u.id},process.env.JWT_SECRET,{expiresIn:'2h'});
  console.log(JSON.stringify({code:board.code,boardId:board.id,admin:tok(users[0]),member:tok(users[1]),ids:ids.slice(-60),comments:N,reactions:reacts.length}));
  await p.$disconnect();
})();
