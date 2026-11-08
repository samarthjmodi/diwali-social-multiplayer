import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../engine.mjs';
import { readFile } from 'node:fs/promises';
const cards=JSON.parse(await readFile(new URL('../cards.json',import.meta.url),'utf8'));
function setup(n=20){const r=new Room(cards);r.roster(Array.from({length:n},(_,i)=>'Guest '+(i+1)));r.shuffle();r.players.forEach(p=>p.approved=true);r.lock(true);return r;}
function start(r,game){const t=r.teams[0],p=r.players.find(p=>p.team===t.id);r.start({game,teamId:t.id,playerId:p.id,rehearsal:true});return {t,p};}
test('balances 18, 19 and 20 players and protects locked assignments',()=>{for(const n of [18,19,20]){const r=setup(n);const sizes=r.teams.map(t=>r.players.filter(p=>p.team===t.id).length);assert.equal(sizes.reduce((a,b)=>a+b),n);assert.ok(Math.max(...sizes)-Math.min(...sizes)<=1);assert.throws(()=>r.shuffle(),/locked/);assert.throws(()=>r.move(r.players[0].id,r.teams[0].id),/locked/);}});
test('host can change team count before locking and shuffle attendance evenly',()=>{
  const r=setup(19);r.lock(false);r.teamCount(3);assert.equal(r.teams.length,3);assert.ok(r.players.every(p=>p.team===null));
  r.shuffle();const sizes=r.teams.map(t=>r.players.filter(p=>p.team===t.id).length);assert.deepEqual(sizes,[7,6,6]);r.lock(true);
  assert.throws(()=>r.teamCount(2),/Unlock teams/);r.lock(false);r.teamCount(5);r.shuffle();assert.equal(r.teams.length,5);assert.equal(r.players.filter(p=>p.team).length,19);
  assert.throws(()=>r.teamCount(1),/between 2 and 10/);assert.throws(()=>r.teamCount(11),/between 2 and 10/);
});
test('original decks require review and rehearsal is explicit',()=>{const r=setup();assert.equal(r.cards.filter(c=>!['bidding','skit'].includes(c.game)&&c.status==='approved').length,0);assert.throws(()=>r.start({game:'quiz'}),/No eligible cards/);start(r,'quiz');assert.equal(r.round.rehearsal,true);});
test('private taboo prompt reaches only host and clue giver',()=>{const r=setup();const {t,p}=start(r,'taboo');for(const other of r.players){const v=r.view({role:'player',playerId:other.id});assert.equal(!!v.round.prompt,other.id===p.id);assert.equal(!!v.round.forbidden,other.id===p.id);assert.equal(v.cards,undefined);}assert.equal(r.view({role:'display'}).round.prompt,undefined);assert.ok(r.view({role:'host'}).round.prompt);});
test('reverse charades hides the prompt from the guesser, TV and opposing teams',()=>{const r=setup();const {t,p}=start(r,'charades');for(const other of r.players)assert.equal(!!r.view({role:'player',playerId:other.id}).round.prompt,other.team===t.id&&other.id!==p.id);assert.equal(r.view({role:'display'}).round.prompt,undefined);});
test('pending guest cannot read the roster, scores or round',()=>{const r=setup();start(r,'quiz');const p=r.players[0];p.approved=false;const v=r.view({role:'player',playerId:p.id});assert.equal(v.pending,true);assert.equal(v.round,undefined);assert.equal(v.players,undefined);assert.equal(v.cards,undefined);});
test('quiz accepts one timely captain answer; hides answer and opposing submissions',()=>{const r=setup();start(r,'quiz');r.begin();const t=r.teams[0],captain=t.captain,member=r.players.find(p=>p.team===t.id&&p.id!==captain);assert.throws(()=>r.submit(member.id,'x',r.round.id),/captain/);assert.throws(()=>r.submit(captain,'x','old-round'),/changed/);r.submit(captain,'my answer',r.round.id);assert.throws(()=>r.submit(captain,'second',r.round.id),/already submitted/);const other=r.view({role:'player',playerId:r.teams[1].captain});assert.equal(other.round.answer,undefined);assert.equal(other.round.submissions,undefined);assert.equal(other.round.myAnswer,undefined);assert.equal(r.view({role:'display'}).round.answer,undefined);r.reveal();assert.ok(r.view({role:'display'}).round.answer);r.judge(t.id,true);assert.equal(t.score,3);assert.throws(()=>r.judge(t.id,true),/already/);});
test('server deadline rejects late answers and pause freezes remaining time',()=>{const r=setup();start(r,'quiz');r.begin(1000);r.pause(6000);assert.equal(r.round.remaining,25000);assert.throws(()=>r.submit(r.teams[0].captain,'x',r.round.id,7000),/closed/);r.begin(10000);assert.equal(r.round.deadline,35000);assert.throws(()=>r.submit(r.teams[0].captain,'late',r.round.id,35000),/closed/);assert.equal(r.round.phase,'expired');});
test('guessing points are banked once; expiration blocks late scores',()=>{const r=setup();const {t}=start(r,'taboo');r.begin(1000);r.nextCard(true,2000);r.nextCard(false,3000);assert.equal(t.score,0);assert.throws(()=>r.nextCard(true,61000),/not running/);r.end();assert.equal(t.score,1);assert.throws(()=>r.end(),/already finished/);r.undo();assert.equal(t.score,0);});
test('backup restore strips approvals, creates new room and round IDs, pauses progress',()=>{const r=setup();start(r,'quiz');r.begin();r.submit(r.teams[0].captain,'saved answer',r.round.id);r.score(r.teams[0].id,7);const b=r.backup(),restored=Room.restore(JSON.parse(JSON.stringify(b)));assert.notEqual(restored.code,r.code);assert.notEqual(restored.round.id,r.round.id);assert.ok(restored.players.every(p=>!p.approved));assert.equal(restored.round.phase,'paused');assert.equal(restored.teams[0].score,7);assert.equal(restored.round.submissions[r.teams[0].id].answer,'saved answer');assert.deepEqual(restored.history,[]);});
test('backup restore preserves a host-selected team count',()=>{const r=setup(18);r.lock(false);r.teamCount(3);r.shuffle();r.lock(true);const restored=Room.restore(r.backup());assert.equal(restored.teams.length,3);assert.equal(restored.players.length,18);assert.ok(restored.players.every(p=>restored.teams.some(t=>t.id===p.team)));});
test('revealed partially judged quiz restores without awarding twice',()=>{const r=setup();start(r,'quiz');r.begin();r.submit(r.teams[0].captain,'saved',r.round.id);r.reveal();r.judge(r.teams[0].id,true);const restored=Room.restore(r.backup());assert.equal(restored.round.phase,'revealed');assert.equal(restored.teams[0].score,3);assert.throws(()=>restored.judge(restored.teams[0].id,true),/already/);});
test('malformed backups are rejected before replacing room',()=>{const r=setup();const b=r.backup();b.room.teams[0].score=-100001;assert.throws(()=>Room.restore(b),/Invalid team/);const c=r.backup();c.room.cards[0].status='arbitrary';assert.throws(()=>Room.restore(c),/review status/);});
test('reviewed edits and exclusions survive backup and govern selection',()=>{const r=setup();const c=r.cards.find(c=>c.game==='quiz');r.updateCard(c.id,{...c,prompt:'Our party question?',answer:'A reviewed answer',status:'approved'});r.start({game:'quiz'});assert.equal(r.round.card.id,c.id);const restored=Room.restore(r.backup());assert.equal(restored.cards.find(x=>x.id===c.id).answer,'A reviewed answer');});

test('bidding selects only the five approved categories, records rising bids and scores exactly once',()=>{
 const r=setup();assert.equal(r.cards.filter(c=>c.game==='bidding'&&c.status==='approved').length,5);
 r.start({game:'bidding',cardId:'bidding-1'});assert.equal(r.round.phase,'bidding');assert.equal(r.round.duration,60);
 assert.throws(()=>r.begin(),/not ready/);assert.throws(()=>r.closeBidding(),/winning bid/);
 const a=r.teams[0],b=r.teams[1];r.bid(a.id,3);r.bid(b.id,12);assert.throws(()=>r.bid(a.id,12),/exceed/);assert.throws(()=>r.bid(a.id,2.5),/exceed/);
 r.closeBidding();assert.throws(()=>r.bid(a.id,13),/closed/);assert.throws(()=>r.end(true),/start/);
 r.begin(1000);assert.equal(r.round.deadline,61000);r.end(true);assert.equal(a.score,0);assert.equal(b.score,120);assert.throws(()=>r.end(true),/finished/);
 r.start({game:'bidding',cardId:'bidding-2'});r.bid(a.id,7);r.closeBidding();r.begin(1000);r.expire(61000);r.end(false);assert.equal(a.score,-35);assert.equal(r.round.points,-35);r.undo();assert.equal(a.score,0);
});
test('bidding is public and backup restores bidding, ready and paused challenges with negative scores',()=>{
 const r=setup();r.score(r.teams[0].id,-40);r.start({game:'bidding'});
 assert.ok(r.view({role:'display'}).round.prompt);assert.equal(Room.restore(r.backup()).round.phase,'bidding');
 r.bid(r.teams[0].id,6);let restored=Room.restore(r.backup());assert.equal(restored.round.bid,6);assert.equal(restored.teams[0].score,-40);
 r.closeBidding();assert.equal(Room.restore(r.backup()).round.phase,'ready');r.begin();restored=Room.restore(r.backup());assert.equal(restored.round.phase,'paused');assert.equal(restored.round.bid,6);
 restored.begin();restored.end(false);assert.equal(restored.teams[0].score,-70);
 const bad=r.backup();bad.room.round.bid=12;assert.throws(()=>Room.restore(bad),/mismatch/);
});

test('skit assigns private team briefs with five roles and runs shared preparation',()=>{
 const r=setup();assert.equal(r.cards.filter(c=>c.game==='skit'&&c.status==='approved').length,5);r.start({game:'skit'});
 assert.equal(r.round.duration,900);assert.equal(new Set(Object.values(r.round.assignments)).size,r.teams.length);
 for(const p of r.players){const v=r.view({role:'player',playerId:p.id});assert.equal(v.round.assignment.id,r.round.assignments[p.team]);assert.equal(v.round.assignment.roles.length,5);assert.equal(v.round.assignments,undefined);assert.ok(v.round.assignment.brief);}
 const tv=r.view({role:'display'});assert.equal(tv.round.assignment,undefined);assert.equal(tv.round.assignments,undefined);for(const id of Object.values(r.round.assignments)){assert.ok(!JSON.stringify(tv).includes(r.cards.find(c=>c.id===id).prompt));}
 assert.equal(Object.keys(r.view({role:'host'}).round.assignments).length,4);r.begin(1000);assert.equal(r.round.deadline,901000);r.pause(61000);assert.equal(r.round.remaining,840000);r.begin(1000000);r.expire(1840000);assert.equal(r.round.phase,'expired');
});
test('skits validate assignments and score each performance once before moving to next team',()=>{
 const r=setup();const used=r.used.length;assert.throws(()=>r.start({game:'skit',assignments:{}}),/every team/);assert.equal(r.used.length,used);r.start({game:'skit'});
 assert.throws(()=>r.performSkit(r.teams[0].id),/preparation/);r.finishSkitPrep();assert.equal(r.round.phase,'awaiting');
 for(const [i,t] of r.teams.entries()){r.performSkit(t.id);assert.equal(r.round.duration,180);assert.throws(()=>r.scoreSkit(t.id,10),/timer/);r.begin();assert.throws(()=>r.scoreSkit(t.id,101),/0 to 100/);assert.throws(()=>r.scoreSkit(t.id,-5),/0 to 100/);r.scoreSkit(t.id,20+i);assert.equal(t.score,20+i);assert.throws(()=>r.scoreSkit(t.id,20),/timer/);if(i<r.teams.length-1)assert.throws(()=>r.performSkit(t.id),/already performed/);}
 assert.equal(r.round.phase,'ended');assert.equal(Object.keys(r.round.skitScores).length,4);
});
test('skit backups preserve roles, private assignments and partially scored performances',()=>{
 const r=setup();r.start({game:'skit'});let restored=Room.restore(r.backup());assert.equal(restored.round.phase,'ready');assert.equal(restored.round.duration,900);assert.ok(restored.cards.find(c=>c.game==='skit').brief);assert.equal(restored.cards.find(c=>c.game==='skit').roles.length,5);
 r.begin();restored=Room.restore(r.backup());assert.equal(restored.round.phase,'paused');r.finishSkitPrep();restored=Room.restore(r.backup());assert.equal(restored.round.phase,'awaiting');const t=r.teams[0];r.performSkit(t.id);r.begin();r.scoreSkit(t.id,60);restored=Room.restore(r.backup());assert.equal(restored.round.skitScores[t.id],60);assert.equal(restored.team(t.id).score,60);assert.throws(()=>restored.performSkit(t.id),/already performed/);
 const bad=r.backup();bad.room.round.assignments[t.id]='bidding-1';assert.throws(()=>Room.restore(bad),/assignments/);
});
