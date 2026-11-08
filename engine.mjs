import { randomBytes, randomInt } from 'node:crypto';
export const GAMES = ['charades','taboo','five','quiz'];
export const id = () => randomBytes(16).toString('hex');
export function requireThat(ok, message) { if (!ok) throw new Error(message); }
const clone = value => structuredClone(value);
const text = (v,max=100) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const code = () => randomBytes(4).toString('hex').toUpperCase();
export class Room {
  constructor(cards) {
    this.cards=clone(cards); this.code=code(); this.players=[];
    this.teams=['Team Pataka','The Ladoo League','Chai Champions','Rangoli Rebels'].map(name=>({id:id(),name,score:0,captain:null}));
    this.locked=false; this.round=null; this.used=[]; this.history=[]; this.sequence=0;
  }
  idle() {requireThat(!this.round || this.round.phase==='ended','Finish the current round first.');}
  roster(names) {
    this.idle(); requireThat(!this.locked,'Unlock teams before replacing the roster.');
    requireThat(Array.isArray(names)&&names.length>=4&&names.length<=40,'Enter between 4 and 40 player names.');
    requireThat(names.every(n=>text(n,40)),'Each name must contain 1–40 characters.');
    names=names.map(n=>n.trim()); requireThat(new Set(names.map(n=>n.toLowerCase())).size===names.length,'Names must be unique; add a surname or initial.');
    this.players=names.map(name=>({id:id(),name,team:null,approved:false}));
    this.teams.forEach(t=>t.captain=null);this.round=null;
  }
  shuffle() {
    this.idle();requireThat(!this.locked,'Teams are locked.');requireThat(this.players.length>=4,'Add the roster first.');
    const list=[...this.players]; for(let i=list.length-1;i>0;i--){const j=randomInt(i+1);[list[i],list[j]]=[list[j],list[i]];}
    list.forEach((p,i)=>p.team=this.teams[i%4].id);this.teams.forEach(t=>t.captain=this.players.find(p=>p.team===t.id)?.id||null);
  }
  move(playerId,teamId) {
    this.idle();requireThat(!this.locked,'Teams are locked.');const p=this.player(playerId);this.team(teamId);const old=p.team;p.team=teamId;
    if(old){const t=this.team(old);if(t.captain===p.id)t.captain=this.players.find(x=>x.team===old)?.id||null;}
    const t=this.team(teamId);if(!t.captain)t.captain=p.id;
  }
  player(playerId){const p=this.players.find(p=>p.id===playerId);requireThat(p,'Player not found.');return p;}
  team(teamId){const t=this.teams.find(t=>t.id===teamId);requireThat(t,'Team not found.');return t;}
  lock(value){this.idle();if(value)requireThat(this.players.length>=4&&this.players.every(p=>p.team)&&this.teams.every(t=>this.players.some(p=>p.team===t.id)),'Assign players to all four teams first.');this.locked=!!value;}
  captain(teamId,playerId){this.idle();const t=this.team(teamId);requireThat(this.player(playerId).team===t.id,'Captain must belong to this team.');t.captain=playerId;}
  rename(teamId,name){requireThat(text(name,40),'Use 1–40 characters for the team name.');this.team(teamId).name=name.trim();}
  score(teamId,delta,reason='Host adjustment'){
    requireThat(Number.isInteger(delta)&&Math.abs(delta)<=100,'Score adjustment must be an integer between -100 and 100.');
    const t=this.team(teamId),before=t.score;t.score=Math.max(0,t.score+delta);
    this.history.push({teamId,before,after:t.score,reason,at:Date.now()});if(this.history.length>500)this.history.shift();
  }
  undo(){const h=this.history.pop();requireThat(h,'No score changes to undo.');this.team(h.teamId).score=h.before;}
  updateCard(cardId,fields){this.idle();const c=this.cards.find(c=>c.id===cardId);requireThat(c,'Card not found.');
    requireThat(['pending','approved','excluded'].includes(fields.status),'Choose a review status.');
    requireThat(text(fields.prompt,500),'Prompt must contain 1–500 characters.');
    requireThat(typeof fields.answer==='string'&&fields.answer.length<=300,'Answer is too long.');
    if(c.game==='quiz')requireThat(text(fields.answer,300),'Quiz cards need an answer.');
    requireThat(Array.isArray(fields.forbidden)&&fields.forbidden.length<=8&&fields.forbidden.every(w=>text(w,50)),'Use up to eight forbidden words.');
    if(c.game==='taboo')requireThat(fields.forbidden.length>=1,'Forbidden Words needs at least one banned word.');
    Object.assign(c,{prompt:fields.prompt.trim(),answer:fields.answer.trim(),forbidden:fields.forbidden.map(w=>w.trim()),status:fields.status});
  }
  draw(game,rehearsal){const pool=this.cards.filter(c=>c.game===game&&(c.status==='approved'||(rehearsal&&c.status==='pending')));
    requireThat(pool.length,'No eligible cards. Review and approve cards, or enable rehearsal.');
    const fresh=pool.filter(c=>!this.used.includes(c.id));requireThat(fresh.length,'This deck is exhausted. Reset used cards between rounds to replay.');
    const c=fresh[randomInt(fresh.length)];this.used.push(c.id);return clone(c);
  }
  start({game,teamId,playerId,duration=60,rehearsal=false}){
    this.idle();requireThat(this.locked,'Lock your teams before starting.');requireThat(GAMES.includes(game),'Unknown game.');
    requireThat([30,45,60,90].includes(duration),'Choose a supported turn length.');
    if(game!=='quiz'){const t=this.team(teamId),p=this.player(playerId);requireThat(p.team===t.id&&p.approved,'Choose an approved player from the active team.');}
    const card=this.draw(game,!!rehearsal);
    this.round={id:id(),game,teamId:game==='quiz'?null:teamId,playerId:game==='quiz'?null:playerId,card,phase:'ready',duration:game==='five'?5:game==='quiz'?30:duration,remaining:null,deadline:null,rehearsal:!!rehearsal,points:0,submissions:{},judged:[],log:[]};
  }
  roundRequired(){requireThat(this.round,'No round selected.');return this.round;}
  begin(now=Date.now()){const r=this.roundRequired();requireThat(['ready','paused'].includes(r.phase),'Round is not ready to start.');r.deadline=now+(r.remaining??r.duration*1000);r.remaining=null;r.phase='active';}
  expire(now=Date.now()){const r=this.round;if(r?.phase==='active'&&now>=r.deadline){r.phase='expired';r.deadline=null;r.remaining=0;return true;}return false;}
  pause(now=Date.now()){this.expire(now);const r=this.roundRequired();requireThat(r.phase==='active','Only a running round can be paused.');r.remaining=Math.max(0,r.deadline-now);r.deadline=null;r.phase='paused';}
  nextCard(correct,now=Date.now()){
    this.expire(now);const r=this.roundRequired();requireThat(['charades','taboo'].includes(r.game)&&r.phase==='active','The guessing turn is not running.');
    r.log.push({prompt:r.card.prompt,correct:!!correct});if(correct)r.points++;
    try{r.card=this.draw(r.game,r.rehearsal);}catch{r.phase='expired';r.deadline=null;r.remaining=0;}
  }
  submit(playerId,answer,roundId,now=Date.now()){
    this.expire(now);const r=this.roundRequired(),p=this.player(playerId);requireThat(r.id===roundId,'That question has already changed.');
    requireThat(p.approved&&r.game==='quiz'&&r.phase==='active','Answers are closed.');
    const t=this.team(p.team);requireThat(t.captain===p.id,'Only your team captain can submit.');
    requireThat(!Object.hasOwn(r.submissions,t.id),'Your team already submitted.');requireThat(text(answer,300),'Enter an answer of 1–300 characters.');
    r.submissions[t.id]={answer:answer.trim(),playerId,at:now};
  }
  reveal(){const r=this.roundRequired();requireThat(r.game==='quiz'&&['active','paused','expired'].includes(r.phase),'No quiz answer to reveal.');r.phase='revealed';r.deadline=null;}
  judge(teamId,correct){const r=this.roundRequired();requireThat(r.game==='quiz'&&r.phase==='revealed','Reveal the quiz answer first.');
    this.team(teamId);requireThat(!r.judged.includes(teamId),'This team has already been judged.');
    if(correct)requireThat(Object.hasOwn(r.submissions,teamId),'This team did not submit an answer.');
    r.judged.push(teamId);if(correct)this.score(teamId,3,'Quiz answer');
  }
  end(success=false){const r=this.roundRequired();requireThat(r.phase!=='ended','This round is already finished.');
    if(r.game==='quiz')requireThat(r.phase==='revealed','Reveal and judge before finishing the quiz round.');
    if(r.game==='five')requireThat(['active','expired','paused'].includes(r.phase),'Start the five-second clock first.');
    if(['charades','taboo'].includes(r.game))this.score(r.teamId,r.points,'Guessing turn');
    if(r.game==='five'&&success)this.score(r.teamId,3,'Five-second challenge');
    r.phase='ended';r.deadline=null;
  }
  view(session){
    this.expire();const host=session.role==='host',p=session.role==='player'?this.players.find(p=>p.id===session.playerId):null;
    if(session.role==='player'&&!p?.approved)return {role:'player',pending:true,name:p?.name||'',serverTime:Date.now()};
    const result={role:session.role,playerId:p?.id||null,code:this.code,locked:this.locked,players:clone(this.players),teams:clone(this.teams),serverTime:Date.now(),sequence:this.sequence,round:null};
    if(host){result.history=clone(this.history);result.cards=clone(this.cards);result.used=[...this.used];}
    if(!this.round)return result;
    const r=this.round,v={id:r.id,game:r.game,phase:r.phase,teamId:r.teamId,playerId:r.playerId,deadline:r.deadline,duration:r.duration,remaining:r.remaining,rehearsal:r.rehearsal,points:r.points};
    const privateAllowed=host||(p&&p.team===r.teamId&&(r.game==='taboo'?p.id===r.playerId:r.game==='charades'?p.id!==r.playerId:false));
    const publicPrompt=['five','quiz'].includes(r.game);
    if((privateAllowed||publicPrompt)&&r.phase!=='paused')v.prompt=r.card.prompt;
    if(r.game==='taboo'&&privateAllowed&&r.phase!=='paused')v.forbidden=r.card.forbidden;
    if(r.game==='quiz'&&(host||['revealed','ended'].includes(r.phase)))v.answer=r.card.answer;
    if(host){v.submissions=clone(r.submissions);v.judged=[...r.judged];v.log=clone(r.log);}
    else if(p&&r.game==='quiz'){v.submitted=Object.hasOwn(r.submissions,p.team);if(v.submitted)v.myAnswer=r.submissions[p.team].answer;}
    result.round=v;return result;
  }
  backup(){return {format:'diwali-social',version:1,savedAt:new Date().toISOString(),room:{players:clone(this.players).map(p=>({...p,approved:false})),teams:clone(this.teams),locked:this.locked,used:[...this.used],history:clone(this.history),round:clone(this.round),cards:clone(this.cards)}};}
  static restore(input){
    requireThat(input?.format==='diwali-social'&&input.version===1&&input.room,'Unsupported backup format.');
    const b=input.room;requireThat(Array.isArray(b.cards)&&b.cards.length>0&&b.cards.length<=2000,'Invalid card bank.');
    const restored=new Room([]);const ids=new Set();
    for(const c of b.cards){requireThat(c&&text(c.id,80)&&!ids.has(c.id)&&GAMES.includes(c.game),'Invalid or duplicate card.');ids.add(c.id);restored.cards.push({id:c.id,game:c.game});restored.updateCard(c.id,c);}
    requireThat(Array.isArray(b.teams)&&b.teams.length===4,'Backup needs four teams.');
    requireThat(b.teams.every(t=>t&&text(t.id,80)&&text(t.name,40)&&Number.isInteger(t.score)&&t.score>=0&&t.score<=100000),'Invalid team data.');
    requireThat(new Set(b.teams.map(t=>t.id)).size===4,'Duplicate team IDs.');
    restored.teams=b.teams.map(t=>({id:t.id,name:t.name,score:t.score,captain:t.captain}));
    requireThat(Array.isArray(b.players)&&b.players.length<=40,'Invalid roster.');
    requireThat(b.players.every(p=>p&&text(p.id,80)&&text(p.name,40)&&(p.team===null||restored.teams.some(t=>t.id===p.team))),'Invalid player data.');
    requireThat(new Set(b.players.map(p=>p.id)).size===b.players.length&&new Set(b.players.map(p=>p.name.toLowerCase())).size===b.players.length,'Duplicate players.');
    restored.players=b.players.map(p=>({id:p.id,name:p.name,team:p.team,approved:false}));
    for(const t of restored.teams)requireThat(t.captain===null||restored.players.some(p=>p.id===t.captain&&p.team===t.id),'Invalid captain.');
    requireThat(Array.isArray(b.used)&&b.used.every(v=>ids.has(v)),'Invalid used cards.');restored.used=[...new Set(b.used)];
    // Completed score history is useful for audit, but never restore arbitrary undo values.
    restored.history=[];restored.lock(!!b.locked);
    if(b.round&&b.round.phase!=='ended'){
      const r=b.round;requireThat(GAMES.includes(r.game)&&ids.has(r.card?.id),'Invalid saved round.');
      requireThat([5,30,45,60,90].includes(r.duration)&&Number.isInteger(r.points)&&r.points>=0&&r.points<=2000,'Invalid saved timer or points.');
      if(r.game!=='quiz')requireThat(restored.players.some(p=>p.id===r.playerId&&p.team===r.teamId),'Invalid saved round player.');
      const card=restored.cards.find(c=>c.id===r.card.id);requireThat(card.game===r.game,'Card does not match game.');
      const remaining=r.phase==='active'?Math.max(0,r.deadline-Date.parse(input.savedAt)):r.remaining??r.duration*1000;
      requireThat(Number.isFinite(remaining)&&remaining>=0&&remaining<=r.duration*1000,'Invalid remaining time.');
      const submissions={};for(const [teamId,s] of Object.entries(r.submissions||{})){requireThat(restored.teams.some(t=>t.id===teamId)&&text(s.answer,300)&&restored.players.some(p=>p.id===s.playerId&&p.team===teamId)&&Number.isFinite(s.at),'Invalid saved answer.');submissions[teamId]={answer:s.answer,playerId:s.playerId,at:s.at};}
      requireThat(Array.isArray(r.judged)&&r.judged.every(t=>restored.teams.some(x=>x.id===t)),'Invalid judging state.');
      restored.round={id:id(),game:r.game,card:clone(card),teamId:r.teamId,playerId:r.playerId,duration:r.duration,points:r.points,rehearsal:!!r.rehearsal,phase:r.phase==='revealed'?'revealed':'paused',deadline:null,remaining,submissions,judged:[...new Set(r.judged)],log:[]};
    }
    return restored;
  }
}
