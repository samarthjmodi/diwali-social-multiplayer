import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash, timingSafeEqual } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import QRCode from 'qrcode';
import { Room, id, requireThat } from './engine.mjs';
const root=new URL('./public/',import.meta.url);
const sourceCards=JSON.parse(await readFile(new URL('./cards.json',import.meta.url),'utf8'));
export function createApp({password, cards=sourceCards, publicUrl=process.env.PUBLIC_URL||process.env.RENDER_EXTERNAL_URL}={}){
  requireThat(typeof password==='string'&&password.length>=12,'Set HOST_PASSWORD to a unique secret of at least 12 characters.');
  const passwordHash=createHash('sha256').update(password).digest();
  let room=new Room(cards);const sessions=new Map(),rates=new Map();
  function limited(key,max,window=60000){const now=Date.now();let r=rates.get(key);if(!r||r.until<now){r={n:0,until:now+window};rates.set(key,r);}requireThat(++r.n<=max,'Too many requests. Please wait a minute.');}
  function origin(req){return publicUrl?new URL(publicUrl).origin:`http://${req.headers.host}`;}
  function sameOrigin(req){return req.headers.origin===origin(req);}
  function session(token){const s=sessions.get(token);requireThat(s&&s.expires>Date.now(),'Session expired. Please join or sign in again.');return s;}
  function issue(role,playerId=null){const token=id()+id();sessions.set(token,{role,playerId,expires:Date.now()+86400000,createdAt:Date.now()});return token;}
  function bearer(req){return session((req.headers.authorization||'').replace(/^Bearer /,''));}
  function host(req){const s=bearer(req);requireThat(s.role==='host','Host access required.');return s;}
  function revoke(token){sessions.delete(token);for(const ws of wss.clients)if(ws.token===token){ws.send(JSON.stringify({type:'expired',message:'Your session was removed. Please join again.'}));ws.close(4001);}}
  function playerSessionsClear(){for(const [token,s] of sessions)if(s.role!=='host')revoke(token);room.players.forEach(p=>p.approved=false);}
  function snapshot(s){const v=room.view(s);if(v.pending)return v;const online=new Set([...wss.clients].filter(w=>w.readyState===WebSocket.OPEN&&sessions.has(w.token)).map(w=>sessions.get(w.token).playerId));v.players=v.players.map(p=>({...p,online:online.has(p.id)}));if(s.role==='host')v.pending=[...sessions.entries()].filter(([,x])=>x.role==='player'&&room.players.some(p=>p.id===x.playerId&&!p.approved)).map(([requestId,x])=>({requestId,playerId:x.playerId,name:room.player(x.playerId).name,createdAt:x.createdAt}));return v;}
  function broadcast(){room.sequence++;for(const ws of wss.clients){if(ws.readyState!==WebSocket.OPEN||!ws.token)continue;try{ws.send(JSON.stringify({type:'state',state:snapshot(session(ws.token))}));}catch{ws.close(4001);}}}
  async function body(req){let data='',size=0;for await(const chunk of req){size+=chunk.length;requireThat(size<=1024*1024,'Request too large.');data+=chunk;}try{return JSON.parse(data||'{}');}catch{throw new Error('Invalid JSON.');}}
  function json(res,status,value){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));}
  const server=http.createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Content-Security-Policy',"default-src 'self'; connect-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    try{
      const url=new URL(req.url,'http://localhost'),path=url.pathname;
      if(path==='/healthz')return json(res,200,{ok:true});
      if(path.startsWith('/api/')){
        limited('http:'+req.socket.remoteAddress,240);
        if(req.method==='POST')requireThat(sameOrigin(req),'This request must come from the game website.');
        if(path==='/api/login'&&req.method==='POST'){
          limited('login:'+req.socket.remoteAddress,10);const data=await body(req);
          const candidate=createHash('sha256').update(typeof data.password==='string'?data.password:'').digest();
          requireThat(timingSafeEqual(passwordHash,candidate),'Incorrect host password.');return json(res,200,{token:issue('host')});
        }
        if(path==='/api/roster'&&req.method==='POST'){
          const data=await body(req);requireThat(data.code===room.code,'Room code not found.');
          return json(res,200,{players:room.players.map(p=>({id:p.id,name:p.name,claimed:p.approved}))});
        }
        if(path==='/api/join'&&req.method==='POST'){
          const data=await body(req);requireThat(data.code===room.code,'Room code not found.');
          if(data.role==='display')return json(res,200,{token:issue('display')});
          const p=room.player(data.playerId);requireThat(!p.approved,'That player already has an approved device. Ask the host to release it.');
          requireThat(![...sessions.values()].some(s=>s.playerId===p.id),'A join request for that player is already waiting. Ask the host to approve or reject it.');
          const token=issue('player',p.id);json(res,200,{token});broadcast();return;
        }
        if(path==='/api/backup'&&req.method==='GET'){host(req);res.setHeader('Content-Disposition','attachment; filename="diwali.backup.json"');return json(res,200,room.backup());}
        if(path==='/api/restore'&&req.method==='POST'){host(req);const replacement=Room.restore(await body(req));playerSessionsClear();room=replacement;json(res,200,{ok:true});broadcast();return;}
        if(path==='/api/qr'&&req.method==='GET'){host(req);const target=origin(req)+'/?code='+room.code;return json(res,200,{url:target,image:await QRCode.toDataURL(target,{width:220,margin:2})});}
        if(path==='/api/logout'&&req.method==='POST'){const token=(req.headers.authorization||'').replace(/^Bearer /,'');revoke(token);json(res,200,{ok:true});broadcast();return;}
        return json(res,404,{error:'Not found.'});
      }
      if(req.method!=='GET')return json(res,405,{error:'Method not allowed.'});
      const files={'/':'index.html','/host':'index.html','/display':'index.html','/app.js':'app.js','/style.css':'style.css','/favicon.svg':'favicon.svg'};
      if(!Object.hasOwn(files,path))return json(res,404,{error:'Not found.'});
      const filename=files[path],content=await readFile(new URL(filename,root));
      res.writeHead(200,{'Content-Type':filename.endsWith('.js')?'text/javascript':filename.endsWith('.css')?'text/css':filename.endsWith('.svg')?'image/svg+xml':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(content);
    }catch(error){if(!res.headersSent)json(res,400,{error:error.message});else res.end();}
  });
  const wss=new WebSocketServer({noServer:true,maxPayload:65536,perMessageDeflate:false});
  server.on('upgrade',(req,socket,head)=>{
    try{requireThat(req.url==='/ws'&&sameOrigin(req),'Invalid WebSocket origin.');limited('upgrade:'+req.socket.remoteAddress,120);requireThat(wss.clients.size<150,'Room is full.');wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws));}catch{socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');socket.destroy();}
  });
  function action(s,m){
    if(m.action==='submit'){requireThat(s.role==='player','Players only.');room.submit(s.playerId,m.answer,m.roundId);return;}
    requireThat(s.role==='host','Host access required.');
    switch(m.action){
      case 'roster':room.roster(m.names);playerSessionsClear();break;
      case 'teamCount':room.teamCount(m.count);break;
      case 'shuffle':room.shuffle();break;
      case 'move':room.move(m.playerId,m.teamId);break;
      case 'lock':room.lock(m.value);break;
      case 'rename':room.rename(m.teamId,m.name);break;
      case 'captain':room.captain(m.teamId,m.playerId);break;
      case 'approve':{const pending=session(m.requestId);requireThat(pending.role==='player','Invalid join request.');room.player(pending.playerId).approved=true;break;}
      case 'reject':{const pending=session(m.requestId);requireThat(pending.role==='player','Invalid join request.');revoke(m.requestId);break;}
      case 'release':{const p=room.player(m.playerId);p.approved=false;for(const [token,x] of sessions)if(x.playerId===p.id)revoke(token);break;}
      case 'score':room.score(m.teamId,m.delta);break;
      case 'undo':room.undo();break;
      case 'start':room.start(m);break;
      case 'begin':room.begin();break;
      case 'pause':room.pause();break;
      case 'correct':room.nextCard(true);break;
      case 'skip':room.nextCard(false);break;
      case 'reveal':room.reveal();break;
      case 'judge':room.judge(m.teamId,!!m.correct);break;
      case 'end':room.end(!!m.success);break;
      case 'card':room.updateCard(m.cardId,m.fields);break;
      case 'resetDeck':room.idle();room.used=[];break;
      case 'resetScores':room.idle();room.teams.forEach(t=>t.score=0);room.history=[];room.round=null;break;
      default:throw new Error('Unknown action.');
    }
  }
  wss.on('connection',ws=>{
    ws.alive=true;const authTimeout=setTimeout(()=>{if(!ws.token)ws.close(4001);},5000);authTimeout.unref();
    ws.on('pong',()=>ws.alive=true);
    ws.on('message',data=>{
      try{limited(ws,50,1000);const m=JSON.parse(data.toString());requireThat(m&&typeof m==='object','Invalid message.');
        if(!ws.token){requireThat(m.action==='auth','Sign in first.');session(m.token);ws.token=m.token;clearTimeout(authTimeout);broadcast();return;}
        action(session(ws.token),m);ws.send(JSON.stringify({type:'ack',requestId:m.requestId||null}));broadcast();
      }catch(error){ws.send(JSON.stringify({type:ws.token?'error':'expired',message:error.message}));if(!ws.token)ws.close(4001);}
    });
    ws.on('close',()=>{clearTimeout(authTimeout);rates.delete(ws);broadcast();});ws.on('error',()=>{});
  });
  const clock=setInterval(()=>{if(room.expire())broadcast();},100);clock.unref();
  const maintenance=setInterval(()=>{
    for(const [key,r] of rates)if(r.until<Date.now())rates.delete(key);
    for(const [token,s] of sessions)if(s.expires<Date.now())revoke(token);
    for(const ws of wss.clients){if(!ws.alive){ws.terminate();continue;}ws.alive=false;ws.ping();}
  },30000);maintenance.unref();
  return {server,wss,get room(){return room;},close:async()=>{clearInterval(clock);clearInterval(maintenance);for(const ws of wss.clients)ws.terminate();wss.close();await new Promise(resolve=>server.close(resolve));}};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const app=createApp({password:process.env.HOST_PASSWORD});
  const port=Number(process.env.PORT||3000),bind=process.env.BIND_HOST||(process.env.RENDER?'0.0.0.0':'127.0.0.1');
  app.server.listen(port,bind,()=>console.log(`Diwali Social ready at http://${bind}:${port} — /host for host controls`));
  const shutdown=async()=>{await app.close();process.exit(0);};process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
}
