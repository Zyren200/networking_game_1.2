// ══════════════════════════════════════════
//  CONSTANTS
// ══════════════════════════════════════════
const MAX_WAVE = 10;
const MAX_TOWERS = 10;
const START_UNLOCKED = new Set(['CableShield','IDS','Router']);
const UNLOCK_WAVE = {Firewall:4, SessionMonitor:5, EncryptGateway:6, Antivirus:7};
const LCOL = {1:'#aaaaaa',2:'#4488ff',3:'#00cc55',4:'#ff8800',5:'#9b59b6',6:'#00cccc',7:'#ff3355'};
const TDEFS = {
  CableShield:   {layer:1,cost:50, dmg:15, range:80, rate:0.8,icon:'🔌',artCls:'l1-art',col:LCOL[1],lbl:'CABLE SHIELD',   sub:'Physical Layer Protection\nLayer 1 – Physical Layer',    locked:false},
  IDS:           {layer:2,cost:75, dmg:20, range:90, rate:1.2,icon:'🔭',artCls:'ids-art',col:LCOL[2],lbl:'IDS',            sub:'Intrusion Detection System\nLayer 2 – Data Link Layer',  locked:false},
  Router:        {layer:3,cost:100,dmg:35, range:110,rate:1.0,icon:'🔀',artCls:'rtr-art',col:LCOL[3],lbl:'ROUTER',         sub:'Packet Routing System\nLayer 3 – Network Layer',         locked:false},
  Firewall:      {layer:4,cost:125,dmg:60, range:95, rate:1.5,icon:'🧱',artCls:'fw-art', col:LCOL[4],lbl:'FIREWALL',       sub:'Traffic Filtering System\nLayer 4 – Transport Layer',    locked:true},
  SessionMonitor:{layer:5,cost:150,dmg:45, range:100,rate:1.3,icon:'👁️',artCls:'l5-art',col:LCOL[5],lbl:'SESSION MON.',   sub:'Session Hijack Detection\nLayer 5 – Session Layer',      locked:true},
  EncryptGateway:{layer:6,cost:175,dmg:55, range:88, rate:1.6,icon:'🔑',artCls:'l6-art',col:LCOL[6],lbl:'ENCRYPT GW',     sub:'Encryption Gateway\nLayer 6 – Presentation Layer',      locked:true},
  Antivirus:     {layer:7,cost:200,dmg:90, range:75, rate:2.0,icon:'🛡️',artCls:'av-art', col:LCOL[7],lbl:'ANTIVIRUS',      sub:'Malware Detection Engine\nLayer 7 – Application Layer',  locked:true}
};
const PDEFS = [
  {n:'Physical',           l:1,hp:40, spd:1.2,col:LCOL[1],icon:'📡',effect:'slow'},
  {n:'Data Link',          l:2,hp:52, spd:1.7,col:LCOL[2],icon:'👻',effect:'stealth'},
  {n:'Network',            l:3,hp:78, spd:1.3,col:LCOL[3],icon:'🌊',effect:'none'},
  {n:'Transport',          l:4,hp:104,spd:1.2,col:LCOL[4],icon:'💣',effect:'none'},
  {n:'Session',            l:5,hp:128,spd:1.0,col:LCOL[5],icon:'🕵️',effect:'disable'},
  {n:'Presentation',       l:6,hp:150,spd:0.85,col:LCOL[6],icon:'🔐',effect:'weaken'},
  {n:'Application',        l:7,hp:176,spd:0.95,col:LCOL[7],icon:'🦠',effect:'heavydmg'}
];
const PDEFS_BY_NAME=Object.fromEntries(PDEFS.map(p=>[p.n,p]));
const WAVE_BLUEPRINTS=[
  {types:['Physical','Physical','Data Link'],count:5,hp:0.78,spawn:2.25},
  {types:['Physical','Data Link','Data Link','Network'],count:6,hp:0.90,spawn:2.10},
  {types:['Data Link','Network','Transport'],count:7,hp:1.02,spawn:2.00},
  {types:['Network','Transport','Session'],count:8,hp:1.14,spawn:1.90},
  {types:['Transport','Session','Presentation'],count:9,hp:1.27,spawn:1.80},
  {types:['Session','Presentation','Application'],count:10,hp:1.41,spawn:1.70},
  {types:['Transport','Session','Presentation','Application'],count:12,hp:1.55,spawn:1.60},
  {types:['Session','Presentation','Application'],count:14,hp:1.70,spawn:1.50},
  {types:['Presentation','Application','Application'],count:16,hp:1.88,spawn:1.40},
  {types:['Presentation','Application','Application','Application'],count:18,hp:2.08,spawn:1.30}
];

// ══════════════════════════════════════════
//  STATE
// ══════════════════════════════════════════
const canvas=document.getElementById('canvas');
const ctx=canvas.getContext('2d');
const mw=document.getElementById('mapwrap');
let S,raf,lastTs,pacAnims=[],ipSeq=10,gamePaused=false,menuOpen=false,menuPausedBeforeOpen=false,logFocus=false,playerName='';
const PLAYER_STORAGE_KEY='towernet.nickname';

function fresh(){
  return{
    phase:'prep',wave:1,timer:30,
    coins:200,hp:100,
    towers:[],packets:[],
    selType:'CableShield',selTower:null,
    placing:false,
    mx:0,my:0,hover:null,
    over:false,
    path:[],srv:{x:0,y:0},
    enemies:[],spawnT:0,spawnIv:2.0,
    wdone:false,
    unlocked:new Set(START_UNLOCKED),
    playerName:''
  };
}

function safeGetStoredName(){
  try{
    return localStorage.getItem(PLAYER_STORAGE_KEY)||'';
  }catch(_err){
    return '';
  }
}

function safeSetStoredName(name){
  try{
    localStorage.setItem(PLAYER_STORAGE_KEY,name);
  }catch(_err){}
}

function normalizeNickname(raw){
  return String(raw||'')
    .replace(/[\r\n\t]+/g,' ')
    .replace(/\s+/g,' ')
    .trim()
    .slice(0,18);
}

function displayNickname(name){
  const clean=normalizeNickname(name);
  return clean?clean.toUpperCase():'GUEST';
}

function escapeHtml(text){
  return String(text).replace(/[&<>"']/g,ch=>({
    '&':'&amp;',
    '<':'&lt;',
    '>':'&gt;',
    '"':'&quot;',
    "'":'&#39;'
  }[ch]));
}

function syncPlayerBadge(){
  const badge=document.getElementById('player-badge');
  const nameEl=document.getElementById('tb-player');
  const overlay=document.getElementById('overlay');
  if(nameEl)nameEl.textContent=displayNickname(playerName);
  if(badge){
    const visible=!!playerName&&!!S&&!S.over&&overlay&&overlay.style.display==='none';
    badge.classList.toggle('visible',visible);
  }
}

function updateLoginPreview(){
  const input=document.getElementById('usernameInput');
  const preview=document.getElementById('namePreview');
  const err=document.getElementById('usernameError');
  if(preview)preview.textContent=displayNickname(input?input.value:'');
  if(err)err.textContent='';
}

function bindLoginOverlay(){
  const input=document.getElementById('usernameInput');
  if(!input)return;
  input.addEventListener('input',updateLoginPreview);
  input.addEventListener('keydown',e=>{
    if(e.key==='Enter'){
      e.preventDefault();
      startGame();
    }
  });
}

function renderLoginOverlay(prefill=''){
  closeMenu(false);
  closeHowToPlay();
  menuOpen=false;
  menuPausedBeforeOpen=false;
  gamePaused=false;
  syncPauseButton();
  if(raf){cancelAnimationFrame(raf);raf=null;}
  lastTs=null;
  S=null;
  ipSeq=10;
  pacAnims=[];
  const ov=document.getElementById('overlay');
  if(!ov)return;
  const seed=normalizeNickname(prefill||safeGetStoredName()||playerName);
  ov.setAttribute('role','dialog');
  ov.setAttribute('aria-modal','true');
  ov.setAttribute('aria-labelledby','login-title');
  ov.innerHTML=`
    <div class="ov-box login-box">
      <div class="login-kicker">OPERATOR ACCESS</div>
      <div class="ov-logo" id="login-title">CREATE NICKNAME</div>
      <div class="ov-sub">ENTER SYSTEM</div>
      <div class="login-copy">Bago pumasok sa tower defense, gumawa muna ng nickname para ma-display siya nang maayos sa game HUD.</div>
      <div class="login-form">
        <label class="login-label" for="usernameInput">NICKNAME</label>
        <input class="login-input" id="usernameInput" type="text" maxlength="18" autocomplete="nickname" spellcheck="false" placeholder="e.g. bytewolf">
        <div class="login-preview-row">
          <span class="login-preview-lbl">PREVIEW</span>
          <span class="login-preview" id="namePreview">${escapeHtml(displayNickname(seed))}</span>
        </div>
        <div class="login-error" id="usernameError" aria-live="polite"></div>
        <div class="login-actions">
          <button class="ov-btn login-btn" type="button" onclick="startGame()">ENTER SYSTEM</button>
          <div class="login-tip">Press Enter to continue. 2-18 characters keeps the name neat in-game.</div>
        </div>
      </div>
    </div>`;
  ov.style.display='flex';
  document.body.classList.add('game-ready');
  document.title='TowerNet: Packet-Protocol';
  const input=document.getElementById('usernameInput');
  if(input){
    input.value=seed;
    input.focus({preventScroll:true});
    if(seed)input.select();
  }
  bindLoginOverlay();
  syncPlayerBadge();
  updateLoginPreview();
}

function syncPauseButton(){
  const btn=document.getElementById('pauseBtn');
  if(!btn)return;
  btn.classList.toggle('active',gamePaused);
  btn.setAttribute('aria-pressed',gamePaused?'true':'false');
  btn.innerHTML=gamePaused?'<span>&#9654;</span>RESUME':'<span>&#9208;</span>PAUSE';
}

function syncMenuButton(){
  const btn=document.getElementById('menuBtn');
  if(!btn)return;
  btn.classList.toggle('active',menuOpen);
  btn.setAttribute('aria-pressed',menuOpen?'true':'false');
}

function syncLogButton(){
  const btn=document.getElementById('logBtn');
  if(!btn)return;
  btn.classList.toggle('active',logFocus);
  btn.setAttribute('aria-pressed',logFocus?'true':'false');
}

function ensureMenuOverlay(){
  if(document.getElementById('menu-overlay'))return;
  const app=document.getElementById('app');
  if(!app)return;
  const wrap=document.createElement('div');
  wrap.id='menu-overlay';
  wrap.className='hidden';
  wrap.setAttribute('aria-hidden','true');
  wrap.innerHTML=`
    <div class="ov-box menu-box">
      <div class="ov-logo" style="font-size:30px;line-height:1.1">SYSTEM MENU</div>
      <div class="ov-sub" style="margin-bottom:12px">PAUSED CONTROL PANEL</div>
      <div class="menu-stats" id="menu-stats">WAVE 1 | COINS 200 | INTEGRITY 100%</div>
      <div class="menu-actions">
        <button class="ov-btn menu-btn" type="button" onclick="resumeFromMenu()">RESUME</button>
        <button class="ov-btn menu-btn" type="button" onclick="openHowToPlay()">HOW TO PLAY</button>
        <button class="ov-btn menu-btn" type="button" onclick="restartGame()">REBOOT SYSTEM</button>
        <button class="ov-btn menu-btn" type="button" onclick="toggleLogFocus()">TOGGLE LOG FOCUS</button>
        <button class="ov-btn menu-btn menu-btn-ghost" type="button" onclick="closeMenu()">CLOSE</button>
      </div>
    </div>`;
  wrap.addEventListener('click',()=>closeMenu());
  const box=wrap.querySelector('.menu-box');
  if(box)box.addEventListener('click',e=>e.stopPropagation());
  app.appendChild(wrap);
}

function syncMenuOverlay(){
  ensureMenuOverlay();
  const el=document.getElementById('menu-overlay');
  if(!el)return;
  el.classList.toggle('hidden',!menuOpen);
  el.setAttribute('aria-hidden',menuOpen?'false':'true');
  syncMenuButton();
}

function ensureHowToPlayOverlay(){
  if(document.getElementById('howto-overlay'))return;
  const app=document.getElementById('app');
  if(!app)return;
  const wrap=document.createElement('div');
  wrap.id='howto-overlay';
  wrap.className='hidden';
  wrap.setAttribute('aria-hidden','true');
  wrap.innerHTML=`
    <div class="howto-box">
      <div class="howto-head">
        <div>
          <div class="howto-kicker">TOWERNET GUIDE</div>
          <div class="howto-title">HOW TO PLAY</div>
        </div>
        <button class="howto-close" type="button" onclick="closeHowToPlay()">CLOSE GUIDE</button>
      </div>
      <div class="howto-grid">
        <div class="howto-card">
          <div class="howto-card-title">1. BUILD</div>
          <div class="howto-card-text">Pick a tower from the panel, press Place Tower, then click an open spot on the map. Towers cannot go on the road or inside the server zone.</div>
        </div>
        <div class="howto-card">
          <div class="howto-card-title">2. CONNECT</div>
          <div class="howto-card-text">Copy a tower IP or type it into the connection field, then connect it. Connected towers go ONLINE and start attacking packets.</div>
        </div>
        <div class="howto-card">
          <div class="howto-card-title">3. FIGHT</div>
          <div class="howto-card-text">Tower layers deal bonus damage when they match the packet layer. Big mismatches reduce damage, so layer choice matters.</div>
        </div>
        <div class="howto-card">
          <div class="howto-card-title">4. SURVIVE</div>
          <div class="howto-card-text">Use UPGRADE and SELL anytime you can afford them. The battle keeps moving, so you can react mid-wave and keep the main server alive through all 10 waves.</div>
        </div>
      </div>
      <div class="howto-tip">
        Tip: Pause opens the system menu. From there, you can resume, reopen this guide, or reboot the run.
      </div>
    </div>`;
  wrap.addEventListener('click',()=>closeHowToPlay());
  const box=wrap.querySelector('.howto-box');
  if(box)box.addEventListener('click',e=>e.stopPropagation());
  app.appendChild(wrap);
}

function syncHowToPlayOverlay(){
  ensureHowToPlayOverlay();
  const el=document.getElementById('howto-overlay');
  if(!el)return;
  el.classList.toggle('hidden',!document.body.classList.contains('howto-open'));
  el.setAttribute('aria-hidden',document.body.classList.contains('howto-open')?'false':'true');
}

function speedLabel(spd){
  if(spd>=1.55)return 'FAST';
  if(spd<=1.05)return 'SLOW';
  return 'MED';
}

function packetNote(pkt){
  return {
    Physical:'Weakest opener',
    'Data Link':'Quick and tricky',
    Network:'Stable mid-tier threat',
    Transport:'Heavy pressure packet',
    Session:'Disables towers',
    Presentation:'Reduces dmg',
    Application:'Strongest final threat'
  }[pkt.n]||'';
}

function renderEnemyRoster(){
  const list=document.querySelector('.enemy-list');
  if(!list)return;
  list.innerHTML=PDEFS.map(pkt=>`
      <div class="pkt-card">
        <span class="pkt-art">${pkt.icon}</span>
        <div class="pkt-name" style="color:${pkt.col}">${pkt.n.toUpperCase()}</div>
        <div class="pkt-lyr" style="color:${pkt.col}">LAYER ${pkt.l} · ${pkt.n.toUpperCase()}</div>
        <div class="pkt-stat-row"><span>HP: <b style="color:#c8e0f4">${pkt.hp}</b></span><span>SPD: <b style="color:#c8e0f4">${speedLabel(pkt.spd)}</b></span></div>
        <div class="pkt-stat-row"><span>${packetNote(pkt)}</span><span></span></div>
      </div>`).join('');
}

function openHowToPlay(){
  ensureHowToPlayOverlay();
  if(!menuOpen)openMenu();
  document.body.classList.add('howto-open');
  syncHowToPlayOverlay();
}

function closeHowToPlay(){
  document.body.classList.remove('howto-open');
  syncHowToPlayOverlay();
}

function syncLogFocus(){
  document.body.classList.toggle('log-focus',logFocus);
  syncLogButton();
}

function refreshMenuStats(){
  const el=document.getElementById('menu-stats');
  if(!el||!S)return;
  el.textContent=`OPERATOR ${displayNickname(playerName)} | WAVE ${S.wave}/${MAX_WAVE} | COINS ${S.coins} | INTEGRITY ${Math.max(0,S.hp)}% | TOWERS ${S.towers.length}/${MAX_TOWERS}`;
}

function openMenu(){
  if(!S||S.over||menuOpen)return;
  menuPausedBeforeOpen=gamePaused;
  menuOpen=true;
  setPaused(true,true);
  refreshMenuStats();
  syncMenuOverlay();
}

function closeMenu(restorePause=true){
  closeHowToPlay();
  if(!menuOpen)return;
  menuOpen=false;
  syncMenuOverlay();
  if(restorePause)setPaused(menuPausedBeforeOpen,true);
  menuPausedBeforeOpen=false;
}

function resumeFromMenu(){
  if(!menuOpen)return;
  menuOpen=false;
  syncMenuOverlay();
  setPaused(false,true);
  menuPausedBeforeOpen=false;
}

function toggleMenu(){
  if(menuOpen)closeMenu(true);
  else openMenu();
}

function restartGame(){
  closeMenu(false);
  closeHowToPlay();
  if(raf){cancelAnimationFrame(raf);raf=null;}
  lastTs=null;
  gamePaused=false;
  syncPauseButton();
  S=null;
  playerName=normalizeNickname(playerName||safeGetStoredName());
  renderLoginOverlay(playerName);
}

function toggleLogFocus(){
  logFocus=!logFocus;
  syncLogFocus();
  const clog=document.getElementById('clog');
  const snots=document.getElementById('snots');
  if(logFocus){
    if(clog)clog.scrollTop=0;
    if(snots)snots.scrollTop=0;
    mn('Log focus on','blk');
  }else{
    mn('Log focus off','blk');
  }
}

function toggleMobilePanel(side){
  const left=side==='left';
  document.body.classList.toggle('mobile-left-open',left&&!document.body.classList.contains('mobile-left-open'));
  document.body.classList.toggle('mobile-right-open',!left&&!document.body.classList.contains('mobile-right-open'));
}

function setPaused(next,force=false){
  if(!force&&(!S||S.over))return gamePaused;
  if(gamePaused===next){
    syncPauseButton();
    if(S)updateActionButtons(S.selTower);
    return gamePaused;
  }
  gamePaused=next;
  syncPauseButton();
  const bannerEl=document.getElementById('phase-banner');
  if(bannerEl){
    bannerEl.classList.toggle('paused',gamePaused);
    if(gamePaused)bannerEl.textContent='PAUSED';
    else banner();
  }
  if(S)updateActionButtons(S.selTower);
  return gamePaused;
}

function togglePause(){
  if(!S||S.over)return;
  setPaused(!gamePaused);
}

// ══════════════════════════════════════════
//  RESIZE / PATH
// ══════════════════════════════════════════
function wireTopbarActions(){
  const buttons=document.querySelectorAll('#topbar .tb-right .tb-btn');
  if(buttons[0]&&!buttons[0].dataset.logBound){
    if(!buttons[0].id)buttons[0].id='logBtn';
    buttons[0].addEventListener('click',toggleLogFocus);
    buttons[0].dataset.logBound='1';
  }
  if(buttons[2]&&!buttons[2].dataset.menuBound){
    if(!buttons[2].id)buttons[2].id='menuBtn';
    buttons[2].addEventListener('click',toggleMenu);
    buttons[2].dataset.menuBound='1';
  }
  const sections=document.querySelectorAll('#right .p-sec');
  if(sections[0]&&!sections[0].id)sections[0].id='conn-status-sec';
  if(sections[1]&&!sections[1].id)sections[1].id='conn-log-sec';
  if(sections[2]&&!sections[2].id)sections[2].id='notif-sec';
  ensureMenuOverlay();
  syncMenuOverlay();
  syncLogFocus();
}

function syncTowerLocks(){
  document.querySelectorAll('.tcard').forEach(c=>{
    const key=c.id?.replace('tc-','');
    const def=TDEFS[key];
    if(!def)return;
    const locked=!!def.locked;
    c.classList.toggle('locked',locked);
    let badge=c.querySelector('.lock-badge');
    if(locked){
      if(!badge){
        badge=document.createElement('span');
        badge.className='lock-badge';
        badge.textContent='🔒';
        c.appendChild(badge);
      }
      badge.style.display='block';
    }else if(badge){
      badge.style.display='none';
    }
  });
}

syncTowerLocks();

function resize(){
  // account for pkt-bar height (~115px)
  const barH=document.getElementById('pkt-bar').offsetHeight;
  canvas.width=mw.clientWidth;
  canvas.height=mw.clientHeight;
  makePath(barH);
}
function makePath(barH){
  const W=canvas.width,H=canvas.height,bH=barH||120;
  const playH=H-bH;
  S.srv={x:W-90,y:playH/2};
  S.path=[
    {x:-20,      y:playH*.18},
    {x:W*.22,    y:playH*.18},
    {x:W*.22,    y:playH*.52},
    {x:W*.52,    y:playH*.52},
    {x:W*.52,    y:playH*.80},
    {x:W*.80,    y:playH*.80},
    {x:W*.80,    y:playH*.5},
    {x:W-90,     y:playH*.5}
  ];
}

// ══════════════════════════════════════════
//  TOWER TYPE SELECT
// ══════════════════════════════════════════
function selType(t){
  const def=TDEFS[t];
  if(def?.locked){
    mn('🔒 Tower not yet unlocked!','dmg');
    return;
  }
  S.selType=t;S.selTower=null;S.placing=false;
  document.querySelectorAll('.tcard').forEach(c=>c.classList.remove('sel'));
  document.getElementById('tc-'+t).classList.add('sel');
  refreshSel(null);
}

function activatePlace(){
  if(!S||S.over){mn('System not ready.','dmg');return;}
  const d=TDEFS[S.selType];
  if(d?.locked){
    mn('🔒 Not unlocked!','dmg');
    return;
  }
  if(gamePaused){mn('Game paused. Resume to place towers.','dmg');return;}
  if(S.towers.length>=MAX_TOWERS){mn(`Tower limit reached (${MAX_TOWERS}/${MAX_TOWERS}).`,'dmg');return;}
  if(S.coins<d.cost){mn('Not enough coins!','dmg');return;}
  S.placing=true;
  document.getElementById('phase-banner').textContent='CLICK MAP TO PLACE '+d.lbl;
}

const MAX_TOWER_LEVEL=3;

function towerBaseCost(t){
  return t?.baseCost ?? t?.def?.cost ?? t?.cost ?? 0;
}

function towerLevel(t){
  return Math.max(1, t?.level || 1);
}

function towerStats(source, level=1){
  const base=source?.def || source;
  const lv=Math.max(1, level || 1);
  return {
    level:lv,
    dmg:Math.round(base.dmg*(1+(lv-1)*0.45)),
    range:base.range*(1+(lv-1)*0.15),
    rate:Math.max(0.45, +(base.rate*Math.pow(0.85, lv-1)).toFixed(2))
  };
}

function towerUpgradeCost(t){
  const lv=towerLevel(t);
  if(lv>=MAX_TOWER_LEVEL)return null;
  const base=towerBaseCost(t);
  return Math.round(base*(lv===1?1:1.5));
}

function towerSellValue(t){
  return Math.round((t?.invested ?? towerBaseCost(t))*0.7);
}

function updateActionButtons(tower){
  const canAct=!!tower && !!S && !gamePaused && !S.over;
  const upgBtn=document.getElementById('upg-btn');
  const sellBtn=document.getElementById('sell-btn');
  const upgCost=document.getElementById('upg-cost');
  const sellValue=document.getElementById('sell-value');
  if(!upgBtn||!sellBtn||!upgCost||!sellValue)return;
  if(!tower){
    upgCost.textContent='SELECT';
    sellValue.textContent='SELECT';
    upgBtn.disabled=true;
    sellBtn.disabled=true;
    return;
  }
  const cost=towerUpgradeCost(tower);
  const sell=towerSellValue(tower);
  upgCost.textContent=cost===null?'MAX':`COST ${cost}`;
  sellValue.textContent=`VALUE ${sell}`;
  upgBtn.disabled=!canAct||cost===null;
  sellBtn.disabled=!canAct;
}

// ══════════════════════════════════════════
//  SEL PANEL REFRESH
// ══════════════════════════════════════════
function refreshSel(tower){
  const d=tower?tower.def:TDEFS[S.selType];
  const lv=tower?towerLevel(tower):1;
  const stats=towerStats(d, lv);
  const art=document.getElementById('sti-art');
  art.className='sti-art '+d.artCls;art.textContent=d.icon;
  document.getElementById('sti-name').textContent=tower?`${d.lbl} LV${lv}`:d.lbl;
  document.getElementById('sti-sub').innerHTML=tower
    ? `${d.sub.replace('\n','<br>')}<br>Level ${lv}/${MAX_TOWER_LEVEL}`
    : d.sub.replace('\n','<br>');
  document.getElementById('sti-ip').textContent=tower?tower.ip:'—';
  document.getElementById('sti-dmg').textContent=stats.dmg;
  document.getElementById('sti-range').textContent=(stats.range/30).toFixed(1);
  document.getElementById('sti-rate').textContent=stats.rate+'s';
  document.getElementById('meta-level').textContent=tower?`L${lv}/${MAX_TOWER_LEVEL}`:'L1/3';
  document.getElementById('meta-upg').textContent=tower?(towerUpgradeCost(tower)===null?'MAX':`COST ${towerUpgradeCost(tower)}`):'SELECT';
  document.getElementById('meta-sell').textContent=tower?`VALUE ${towerSellValue(tower)}`:'SELECT';
  updateActionButtons(tower);
  const on=tower&&tower.online;
  document.getElementById('sti-dot').className='sdot '+(on?'on':'off');
  document.getElementById('sti-stxt').className='stxt '+(on?'on':'off');
  document.getElementById('sti-stxt').textContent=on?'ONLINE':'OFFLINE';
}

function copyIP(){
  const v=document.getElementById('sti-ip').textContent;
  if(v==='—')return;
  document.getElementById('ip-input').value=v;
  navigator.clipboard?.writeText(v);
}

// ══════════════════════════════════════════
function upgradeTower(){
  if(gamePaused){mn('Game paused. Resume to upgrade towers.','dmg');return;}
  if(!S||S.over){mn('System not ready.','dmg');return;}
  const t=S.selTower;
  if(!t||!S.towers.includes(t)){mn('Select a tower first.','dmg');return;}
  const cost=towerUpgradeCost(t);
  if(cost===null){mn('Tower is already at max level.','dmg');return;}
  if(S.coins<cost){mn('Not enough coins!','dmg');return;}
  S.coins-=cost;
  t.level=towerLevel(t)+1;
  t.invested=(t.invested ?? towerBaseCost(t))+cost;
  refreshSel(t);
  refreshTList();
  updCoins();
  addLog('ok',ts(),`${t.def.lbl} upgraded to LV ${t.level}`);
  addSN('grn','⬆',`${t.def.lbl} upgraded`,`Level ${t.level}/${MAX_TOWER_LEVEL}`);
}

function sellTower(){
  if(gamePaused){mn('Game paused. Resume to sell towers.','dmg');return;}
  if(!S||S.over){mn('System not ready.','dmg');return;}
  const t=S.selTower;
  if(!t||!S.towers.includes(t)){mn('Select a tower first.','dmg');return;}
  const value=towerSellValue(t);
  S.coins+=value;
  S.towers=S.towers.filter(x=>x!==t);
  S.selTower=null;
  S.placing=false;
  refreshSel(null);
  refreshTList();
  updCoins();
  addLog('ok',ts(),`${t.def.lbl} sold for ${value} coins`);
  addSN('yel','💰',`${t.def.lbl} sold`,`+${value} coins refunded`);
}

//  CANVAS EVENTS
// ══════════════════════════════════════════
function canvasPoint(e){
  const r=canvas.getBoundingClientRect();
  return{x:e.clientX-r.left,y:e.clientY-r.top};
}
function updateCanvasHover(x,y){
  S.mx=x;S.my=y;
  S.hover=S.towers.find(t=>dst(t.x,t.y,x,y)<22)||null;
  if(S.hover){refreshSel(S.hover);S.selTower=S.hover;}
}
canvas.addEventListener('pointermove',e=>{
  if(!S||S.over||gamePaused)return;
  const p=canvasPoint(e);
  updateCanvasHover(p.x,p.y);
});
canvas.addEventListener('pointerdown',e=>{
  if(!S||S.over||gamePaused)return;
  e.preventDefault();
  const {x,y}=canvasPoint(e);
  updateCanvasHover(x,y);
  if(S.hover){S.selTower=S.hover;refreshSel(S.hover);return;}
  if(!S.placing)return;
  if(S.towers.length>=MAX_TOWERS){mn(`Tower limit reached (${MAX_TOWERS}/${MAX_TOWERS}).`,'dmg');S.placing=false;banner();return;}
  if(onPath(x,y)){mn('Cannot place on path!','dmg');return;}
  const d=TDEFS[S.selType];
  if(d?.locked){mn('🔒 Not unlocked!','dmg');S.placing=false;banner();return;}
  if(S.coins<d.cost){mn('Not enough coins!','dmg');return;}
  S.coins-=d.cost;
  const t={x,y,def:d,ip:'192.168.1.'+ipSeq++,online:false,cd:0,lhit:null,id:Math.random(),level:1,baseCost:d.cost,invested:d.cost,disabled:0,weakened:0};
  S.towers.push(t);S.selTower=t;
  S.placing=false;
  refreshSel(t);refreshTList();updCoins();
  banner();
  addLog('info',ts(),'Tower '+d.lbl+' placed at '+t.ip);
});

// ══════════════════════════════════════════
//  PATH HELPERS
// ══════════════════════════════════════════
function onPath(x,y){
  for(let i=0;i<S.path.length-1;i++){
    const a=S.path[i],b=S.path[i+1];
    if(d2seg(x,y,a.x,a.y,b.x,b.y)<30)return true;
  }
  return dst(x,y,S.srv.x,S.srv.y)<65;
}
function d2seg(px,py,ax,ay,bx,by){
  const dx=bx-ax,dy=by-ay,t=Math.max(0,Math.min(1,((px-ax)*dx+(py-ay)*dy)/(dx*dx+dy*dy)));
  return Math.hypot(px-(ax+t*dx),py-(ay+t*dy));
}
function dst(ax,ay,bx,by){return Math.hypot(ax-bx,ay-by);}

// ══════════════════════════════════════════
//  CONNECT
function doConnect(){
  if(gamePaused){mn('Game paused. Resume to connect towers.','dmg');return;}
  const v=document.getElementById('ip-input').value.trim();
  const t=S.towers.find(x=>x.ip===v);
  if(!t){
    showCS('err','✗ '+v+' — not found in network');
    addLog('err',ts(),'Connection Failed: unknown IP');
    addSN('red','✉️','Connection Failed',v+' is not registered');
    return;
  }
  if(t.online){showCS('ok','✓ '+v+' already ONLINE');return;}
  showCSAnim(t);
  addLog('info',ts(),'Sending packet to '+v);
  addLog('info',ts(),'Verifying IP address...');
  addLog('info',ts(),'Establishing connection...');
  pacAnims.push({x:t.x,y:t.y,tx:S.srv.x,ty:S.srv.y,p:0,col:t.def.col,done:false,
    cb:()=>{
      t.online=true;
      refreshSel(S.selTower===t?t:S.selTower);
      refreshTList();
      showCS('ok','✓ Connection Successful!');
      addLog('ok',ts(),'Connection Successful!',true);
      addLog('info',ts(),v+' is now ONLINE');
      addSN('grn','✅',t.def.lbl+' Online',v+' connected to server');
    }
  });
  document.getElementById('ip-input').value='';
}

function showCSAnim(t){
  const b=document.getElementById('cs-box');
  b.innerHTML=`<div class="cs-anim">
    <div class="cs-node" style="border-color:${t.def.col};background:${t.def.col}22">${t.def.icon}</div>
    <div class="cs-arrows"><div class="arr"></div><div class="arr"></div><div class="arr"></div></div>
    <span class="cs-envelope">✉️</span>
    <div class="cs-arrows"><div class="arr"></div><div class="arr"></div><div class="arr"></div></div>
    <div class="cs-node" style="border-color:#00ff80;background:#00ff8022">🖥️</div>
  </div>
  <div class="cs-msg" style="margin-top:8px;text-align:center">Sending packet...</div>`;
}
function showCS(type,msg){
  const b=document.getElementById('cs-box');
  const col=type==='ok'?'#00ff80':type==='err'?'#ff2244':'#ffd700';
  b.innerHTML=`<div class="cs-idle" style="color:${col}">${msg}</div>`;
  setTimeout(()=>{b.innerHTML='<div class="cs-idle">Ready to connect.</div>';},3500);
}

// ═════════════════════════════════════════════════════════════════════════════
//  LOG / NOTIFICATIONS
// ═════════════════════════════════════════════════════════════════════════════
function ts(){const d=new Date();return`[${h(d.getHours())}:${h(d.getMinutes())}:${h(d.getSeconds())}]`;}
function h(n){return String(n).padStart(2,'0');}
function addLog(type,time,txt,bold=false){
  const l=document.getElementById('clog');
  const d=document.createElement('div');d.className='clog-row';
  const tc=type==='ok'?'ok':type==='err'?'err':'info';
  d.innerHTML=`<span class="clog-time">${time}</span><span class="clog-dot ${tc}"></span><span class="clog-txt ${tc}" ${bold?'style="font-weight:700"':''}>${txt}</span>`;
  l.prepend(d);while(l.children.length>25)l.lastChild.remove();
}
function addSN(type,icon,title,sub){
  const c=document.getElementById('snots');
  const d=document.createElement('div');d.className='sn-card '+type;
  const tc=type==='red'?'red':type==='grn'?'grn':'yel';
  d.innerHTML=`<div class="sn-icon">${icon}</div><div class="sn-body"><div class="sn-title ${tc}">${title}</div><div class="sn-sub">${sub}</div><div class="sn-time">${ts().slice(1,-1)}</div></div>`;
  c.prepend(d);while(c.children.length>8)c.lastChild.remove();
}
function mn(msg,type){
  const el=document.getElementById('map-notifs');
  const d=document.createElement('div');d.className='mn '+type;
  d.innerHTML=`<span>${type==='dmg'?'✉️':'✅'}</span>${msg}`;
  el.appendChild(d);setTimeout(()=>d.remove(),2200);
}

// ═════════════════════════════════════════════════════════════════════════════
//  UI UPDATES
// ═════════════════════════════════════════════════════════════════════════════
function updCoins(){document.getElementById('tb-coins').textContent=S.coins;}
function updHP(){
  const p=Math.max(0,S.hp);
  document.getElementById('tb-hppct').textContent=p+'%';
  document.getElementById('hpfill').style.width=p+'%';
  const fill=document.getElementById('hpfill');
  fill.style.background=p>50?'linear-gradient(90deg,#00aa44,#00ff80)':p>25?'linear-gradient(90deg,#aa8800,#ffcc00)':'linear-gradient(90deg,#aa0022,#ff2244)';
}
function banner(){
  const el=document.getElementById('phase-banner');
  el.classList.remove('paused');
  if(S.placing&&!S.over){
    const d=TDEFS[S.selType];
    el.textContent='CLICK MAP TO PLACE '+d.lbl;
    return;
  }
  el.textContent=
    S.phase==='prep'?`PREP PHASE — ${Math.ceil(S.timer)}s`:`WAVE ${S.wave} — INCOMING!`;
}
function refreshTList(){
  const l=document.getElementById('tlist');l.innerHTML='';
  document.getElementById('tcount').textContent=S.towers.length;
  S.towers.forEach(t=>{
    const d=document.createElement('div');d.className='trow';
    d.innerHTML=`<div class="trow-icon ${t.def.artCls}">${t.def.icon}</div><span class="trow-name">${t.def.lbl} LV${towerLevel(t)}</span><span class="trow-ip">${t.ip}</span><span class="trow-s ${t.online?'on':'off'}">LV${towerLevel(t)} ${t.online?'ONLINE':'OFFLINE'}</span>`;
    d.onclick=()=>{S.selTower=t;refreshSel(t);};
    l.appendChild(d);
  });
}

// ═════════════════════════════════════════════════════════════════════════════
//  WAVE LOGIC
// ═════════════════════════════════════════════════════════════════════════════
function checkUnlocks(){
  for(const [key,wave] of Object.entries(UNLOCK_WAVE)){
    if(S.wave>=wave&&TDEFS[key].locked){
      TDEFS[key].locked=false;
      S.unlocked.add(key);
      syncTowerLocks();
      mn('🔓 Unlocked: '+TDEFS[key].lbl,'blk');
      addSN('yel','🔓','Tower Unlocked',TDEFS[key].lbl+' is now available');
    }
  }
}

function buildWave(w){
  const idx=Math.max(0,Math.min(MAX_WAVE,w)-1);
  const bp=WAVE_BLUEPRINTS[idx]||WAVE_BLUEPRINTS[WAVE_BLUEPRINTS.length-1];
  S.spawnIv=bp.spawn;
  const arr=[];
  for(let i=0;i<bp.count;i++){
    const pd=PDEFS_BY_NAME[bp.types[i%bp.types.length]];
    const mix=1+(i/Math.max(1,bp.count-1))*0.08;
    const hp=Math.max(1,Math.round(pd.hp*bp.hp*mix));
    arr.push({...pd,hp,maxhp:hp,delay:i*S.spawnIv,spawned:false});
  }
  return arr;
}
function spawnP(def){
  const p=S.path;
  return{
    n:def.n,l:def.l,hp:def.hp,mhp:def.maxhp,spd:def.spd,col:def.col,icon:def.icon,
    effect:def.effect||'none',
    pi:0,t:0,x:p[0].x,y:p[0].y,dead:false,id:Math.random()
  };
}
function movePkts(dt){
  for(const p of S.packets){
    if(p.pi>=S.path.length-1){
      const breachPower=[0,10,11,12,13,14,16,18][p.l]||10;
      const dmg=Math.max(5,Math.round(breachPower*(p.hp/p.mhp)+5));
      S.hp=Math.max(0,S.hp-dmg);
      mn(`${p.n} breached! -${dmg}%`,'dmg');
      addSN('red','✉️',p.n+' breached!',`-${dmg}% Server Integrity`);
      p.dead=true;updHP();
      if(S.hp<=0)endGame(false);
      continue;
    }
    const a=S.path[p.pi],b=S.path[p.pi+1];
    const sl=Math.hypot(b.x-a.x,b.y-a.y)||1;
    p.t+=p.spd*dt*60/sl;
    if(p.t>=1){p.t=0;p.pi++;}
    else{p.x=a.x+(b.x-a.x)*p.t;p.y=a.y+(b.y-a.y)*p.t;}
  }
  S.packets=S.packets.filter(p=>!p.dead);
}
function attackPkts(dt){
  for(const t of S.towers){
    if(!t.online)continue;
    if(t.disabled>0){t.disabled-=dt;continue;}
    t.cd-=dt;if(t.cd>0)continue;
    const stats=towerStats(t.def,towerLevel(t));
    const eff=t.weakened>0?0.6:1;
    const tgt=S.packets.find(p=>dst(t.x,t.y,p.x,p.y)<=stats.range&&p.hp>0);
    if(!tgt)continue;
    const ld=Math.abs(t.def.layer-tgt.l);
    const lm=[1,.75,.5,.35,.2,.1,.05][Math.min(ld,6)];
    const em=t.def.layer>tgt.l?1.25:t.def.layer<tgt.l?.75:1;
    const dmg=stats.dmg*lm*em*eff;
    tgt.hp-=dmg;t.lhit={x:tgt.x,y:tgt.y,timer:.25};t.cd=stats.rate;
    if(tgt.effect==='slow'&&Math.random()<.3){
      S.towers.forEach(tw=>{if(dst(tw.x,tw.y,tgt.x,tgt.y)<80)tw.cd+=0.5;});
    }
    if(tgt.effect==='disable'&&Math.random()<.2){
      const near=S.towers.find(tw=>dst(tw.x,tw.y,tgt.x,tgt.y)<90&&tw!==t);
      if(near)near.disabled=3;
    }
    if(tgt.effect==='weaken'&&Math.random()<.25){
      t.weakened=4;
    }
    if(tgt.hp<=0){
      tgt.dead=true;S.coins+=12;updCoins();
      addSN('grn','✅',t.def.lbl+' blocked!',tgt.n+' eliminated');
    }
  }
  S.towers.forEach(t=>{if(t.weakened>0)t.weakened-=dt;});
}

// ═════════════════════════════════════════════════════════════════════════════
//  DRAW
// ═════════════════════════════════════════════════════════════════════════════
function draw(){
  const W=canvas.width,H=canvas.height;
  ctx.clearRect(0,0,W,H);
  // background grid
  ctx.fillStyle='#050e1a';ctx.fillRect(0,0,W,H);
  ctx.strokeStyle='#091525';ctx.lineWidth=1;
  for(let x=0;x<W;x+=44){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
  for(let y=0;y<H;y+=44){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}

  // subtle tree dots as ambience
  if(!draw._trees){
    draw._trees=[];const W2=canvas.width,H2=canvas.height;
    for(let i=0;i<60;i++){
      let tx,ty;do{tx=Math.random()*W2;ty=Math.random()*H2;}while(onPath(tx,ty)||dst(tx,ty,S.srv.x,S.srv.y)<80);
      draw._trees.push({x:tx,y:ty,r:5+Math.random()*8,shade:Math.random()>.5});
    }
  }
  for(const tr of draw._trees){
    ctx.fillStyle=tr.shade?'#0a2210':'#081a0c';
    ctx.beginPath();ctx.arc(tr.x,tr.y,tr.r,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#0d2a14';ctx.lineWidth=.5;ctx.stroke();
  }

  // PATH — wide dark green road
  ctx.strokeStyle='#07200f';ctx.lineWidth=44;ctx.lineCap='round';ctx.lineJoin='round';
  ctx.beginPath();S.path.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.stroke();
  // path edge highlight
  ctx.strokeStyle='#0d3a1a';ctx.lineWidth=40;
  ctx.beginPath();S.path.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.stroke();
  // dashed center line
  ctx.strokeStyle='#ff4444';ctx.lineWidth=2;ctx.setLineDash([10,8]);
  ctx.beginPath();S.path.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.stroke();
  ctx.setLineDash([]);
  // path arrows
  for(let i=0;i<S.path.length-1;i++){
    const a=S.path[i],b=S.path[i+1];
    const mx=(a.x+b.x)/2,my=(a.y+b.y)/2,ang=Math.atan2(b.y-a.y,b.x-a.x);
    ctx.save();ctx.translate(mx,my);ctx.rotate(ang);
    ctx.fillStyle='#ff666655';ctx.beginPath();ctx.moveTo(10,0);ctx.lineTo(-6,-6);ctx.lineTo(-6,6);ctx.closePath();ctx.fill();
    ctx.restore();
  }

  // MAIN SERVER — styled box
  const sp=S.srv;
  ctx.save();
  ctx.shadowColor='#00aaff';ctx.shadowBlur=30;
  ctx.fillStyle='#071e35';ctx.strokeStyle='#0088cc';ctx.lineWidth=2;
  roundRect(ctx,sp.x-46,sp.y-38,92,76,10);ctx.fill();ctx.stroke();
  // inner glow
  ctx.shadowBlur=0;
  ctx.fillStyle='#0a2840';
  roundRect(ctx,sp.x-40,sp.y-30,80,60,7);ctx.fill();
  ctx.restore();
  // server label
  ctx.font='bold 11px Orbitron,monospace';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#00aaff';
  ctx.fillText('MAIN SERVER',sp.x,sp.y-16);
  ctx.font='9px Share Tech Mono,monospace';ctx.fillStyle='#5a8aaa';
  ctx.fillText('IP: 192.168.1.100',sp.x,sp.y-2);
  ctx.font='9px Share Tech Mono,monospace';ctx.fillStyle='#00ff80';
  ctx.fillText('INTEGRITY',sp.x,sp.y+12);
  // small hp bar on server
  const bw=70,bx=sp.x-35,by=sp.y+22;
  ctx.fillStyle='#0a1e2e';ctx.fillRect(bx,by,bw,6);
  const fc=S.hp>50?'#00ff80':S.hp>25?'#ffcc00':'#ff2244';
  ctx.fillStyle=fc;ctx.fillRect(bx,by,bw*(S.hp/100),6);
  ctx.font='bold 10px Orbitron,monospace';ctx.fillStyle=fc;
  ctx.fillText(S.hp+'%',sp.x,sp.y+37);

  // TOWERS
  for(const t of S.towers){
    const lvl=towerLevel(t);
    const stats=towerStats(t.def,lvl);
    if((S.hover===t||S.selTower===t)&&t.online){
      ctx.strokeStyle=t.def.col+'44';ctx.lineWidth=1.5;ctx.setLineDash([5,5]);
      ctx.beginPath();ctx.arc(t.x,t.y,stats.range,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);
    }
    if(t.lhit&&t.lhit.timer>0){
      ctx.strokeStyle=t.def.col;ctx.lineWidth=2;ctx.globalAlpha=Math.min(1,t.lhit.timer*4);
      ctx.beginPath();ctx.moveTo(t.x,t.y);ctx.lineTo(t.lhit.x,t.lhit.y);ctx.stroke();ctx.globalAlpha=1;
    }
    const flash=t.disabled>0&&Math.floor(Date.now()/200)%2===0;
    if(flash)ctx.globalAlpha=.4;
    // glow
    if(t.online){ctx.save();ctx.shadowColor=t.def.col;ctx.shadowBlur=18;}
    ctx.fillStyle=t.online?(t.weakened>0?t.def.col+'22':t.def.col+'44'):'#0d1a1e';
    ctx.strokeStyle=t.online?t.def.col:'#1a3a4a';ctx.lineWidth=2;
    ctx.beginPath();ctx.arc(t.x,t.y,20,0,Math.PI*2);ctx.fill();ctx.stroke();
    if(t.online)ctx.restore();
    ctx.font='18px serif';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText(t.def.icon,t.x,t.y);
    // level badge
    ctx.font='bold 8px Share Tech Mono,monospace';ctx.textAlign='center';ctx.textBaseline='top';
    ctx.fillStyle=t.online?'#ffd700':'#4a7aaa';
    ctx.fillText('L'+lvl,t.x,t.y-23);
    // status badge
    ctx.fillStyle=t.online?'#00ff80':'#ff2244';
    ctx.beginPath();ctx.arc(t.x+13,t.y-13,5,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#000';ctx.lineWidth=1;ctx.stroke();
    // tower label
    ctx.font='bold 8px Orbitron,monospace';ctx.textAlign='center';ctx.textBaseline='top';
    ctx.fillStyle=t.online?t.def.col:'#4a7aaa';
    ctx.fillText(t.def.lbl,t.x,t.y+22);
    // IP
    ctx.font='7px Share Tech Mono,monospace';ctx.fillStyle='#3a5a6a';
    ctx.fillText(t.ip,t.x,t.y+32);
    ctx.textBaseline='middle';
    if(flash)ctx.globalAlpha=1;
  }

  // PLACEMENT GHOST
  if(S.placing&&!S.over){
    const d=TDEFS[S.selType];
    const bad=onPath(S.mx,S.my);
    ctx.globalAlpha=.5;
    ctx.fillStyle=bad?'#ff224433':d.col+'33';ctx.strokeStyle=bad?'#ff2244':d.col;ctx.lineWidth=2;
    ctx.beginPath();ctx.arc(S.mx,S.my,20,0,Math.PI*2);ctx.fill();ctx.stroke();
    ctx.font='18px serif';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText(d.icon,S.mx,S.my);ctx.globalAlpha=1;
  }

  // ENEMY PACKETS
  for(const p of S.packets){
    const r=p.l>=6?13:12;
    if(p.l>=6){ctx.save();ctx.shadowColor='#ff2244';ctx.shadowBlur=12;}
    ctx.fillStyle=p.col+'44';ctx.strokeStyle=p.col;ctx.lineWidth=p.l>=6?2:1.5;
    ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.fill();ctx.stroke();
    if(p.l>=6)ctx.restore();
    ctx.font=`${p.l>=6?15:13}px serif`;ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText(p.icon,p.x,p.y);
    // hp bar
    const bw2=r*2+8;
    ctx.fillStyle='#060f1a';ctx.fillRect(p.x-bw2/2,p.y-r-11,bw2,6);
    ctx.fillStyle=p.col;ctx.fillRect(p.x-bw2/2,p.y-r-11,bw2*(p.hp/p.mhp),6);
    ctx.strokeStyle=p.col+'66';ctx.lineWidth=.5;ctx.strokeRect(p.x-bw2/2,p.y-r-11,bw2,6);
  }

  // CONNECT PACKET ANIMS
  for(const a of pacAnims){
    const px=a.x+(a.tx-a.x)*a.p,py=a.y+(a.ty-a.y)*a.p;
    ctx.save();ctx.shadowColor=a.col||'#00ff80';ctx.shadowBlur=12;
    ctx.fillStyle=a.col||'#00ff80';ctx.beginPath();ctx.arc(px,py,7,0,Math.PI*2);ctx.fill();
    ctx.restore();
    ctx.strokeStyle=(a.col||'#00ff80')+'55';ctx.lineWidth=1.5;ctx.setLineDash([5,5]);
    ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(px,py);ctx.stroke();ctx.setLineDash([]);
    ctx.font='14px serif';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText('✉️',px,py);
  }
}

function roundRect(ctx,x,y,w,h,r){
  ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);
  ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);ctx.lineTo(x+r,y+h);
  ctx.quadraticCurveTo(x,y+h,x,y+h-r);ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);
  ctx.closePath();
}

// ═════════════════════════════════════════════════════════════════════════════
//  GAME LOOP
// ═════════════════════════════════════════════════════════════════════════════
function loop(ts2){
  if(!lastTs)lastTs=ts2;
  const dt=Math.min((ts2-lastTs)/1000,.1);lastTs=ts2;
  if(gamePaused){
    draw();raf=requestAnimationFrame(loop);
    return;
  }
  if(!S.over){
    // packet anims
    for(const a of pacAnims){a.p=Math.min(1,a.p+dt*1.4);if(a.p>=1){a.cb&&a.cb();a.done=true;}}
    pacAnims=pacAnims.filter(a=>!a.done);
    S.towers.forEach(t=>{if(t.lhit)t.lhit.timer-=dt;});

    if(S.phase==='prep'){
      S.timer-=dt;
      const s=Math.ceil(S.timer);
      document.getElementById('tb-timer').textContent='00:'+h(s);
      document.getElementById('t-inner').textContent=s;
      const circ=120*(S.timer/30);
      document.getElementById('rprog').style.strokeDashoffset=120-circ;
      if(S.timer<=0)beginWave();
    }
    if(S.phase==='wave'){
      S.spawnT+=dt;
      S.enemies.filter(e=>!e.spawned&&e.delay<=S.spawnT).forEach(e=>{e.spawned=true;S.packets.push(spawnP(e));});
      movePkts(dt);attackPkts(dt);
      if(S.enemies.every(e=>e.spawned)&&S.packets.length===0&&!S.wdone){
        S.wdone=true;
        if(S.wave>=MAX_WAVE)endGame(true);else showWaveDone();
      }
    }
  }
  draw();raf=requestAnimationFrame(loop);
}

function beginWave(){
  S.phase='wave';S.enemies=buildWave(S.wave);S.spawnT=0;S.wdone=false;
  document.getElementById('tb-timer').textContent='WAVE';
  document.getElementById('t-inner').textContent='▶';
  document.getElementById('rprog').style.strokeDashoffset=120;
  banner();
  addSN('red','⚠️','Wave '+S.wave+' incoming!',S.enemies.length+' packets detected');
}
function showWaveDone(){
  const bonus=70+S.wave*25;S.coins+=bonus;updCoins();
  document.getElementById('wd-sub').textContent=`Wave ${S.wave} cleared! +${bonus} coins.`;
  document.getElementById('wave-done').style.display='flex';
}
function doNextWave(){
  document.getElementById('wave-done').style.display='none';
  setPaused(false,true);
  S.wave++;S.phase='prep';S.timer=28;S.wdone=false;
  document.getElementById('tb-wave').textContent=S.wave+' / '+MAX_WAVE;
  checkUnlocks();
  banner();addSN('grn','🔔','Prep Phase','Configure towers for Wave '+S.wave);
}
function endGame(win){
  closeMenu(false);
  logFocus=false;
  syncLogFocus();
  setPaused(false,true);
  S.over=true;
  const ov=document.getElementById('overlay');
  ov.innerHTML=`<div class="ov-box"><div class="ov-logo" style="color:${win?'#00ff80':'#ff2244'}">${win?'✓ SECURED':'✗ BREACHED'}</div><div class="ov-sub">${win?'NETWORK DEFENDED':'SERVER COMPROMISED'}</div><div class="ov-desc">${win?'All 10 OSI waves defeated!<br>Network fully secured.':'The main server was compromised.<br>Try again!'}<br><br><span style="font-family:Share Tech Mono,monospace;font-size:11px;color:#4a7aaa">Operator: ${escapeHtml(displayNickname(playerName))}<br>Wave: ${S.wave}/${MAX_WAVE} | Towers: ${S.towers.length} | Integrity: ${Math.max(0,S.hp)}%</span></div><button class="ov-btn" onclick="restartGame()">↺ REBOOT SYSTEM</button></div>`;
  ov.style.display='flex';
}

// ═════════════════════════════════════════════════════════════════════════════
//  INIT
// ═════════════════════════════════════════════════════════════════════════════
function startGame(){
  closeMenu(false);
  logFocus=false;
  syncLogFocus();
  const input=document.getElementById('usernameInput');
  const err=document.getElementById('usernameError');
  const nextName=normalizeNickname(input?input.value:playerName||safeGetStoredName());
  if(nextName.length<2){
    if(err)err.textContent='Kailangan ng nickname na 2 characters pataas.';
    if(input){
      input.focus({preventScroll:true});
      input.select();
    }
    return;
  }
  playerName=nextName;
  safeSetStoredName(playerName);
  if(err)err.textContent='';
  document.getElementById('overlay').style.display='none';
  document.getElementById('wave-done').style.display='none';
  document.getElementById('clog').innerHTML='';
  document.getElementById('snots').innerHTML='';
  document.getElementById('tlist').innerHTML='';
  Object.keys(TDEFS).forEach(k=>{TDEFS[k].locked=!START_UNLOCKED.has(k);});
  S=fresh();S.playerName=playerName;ipSeq=10;pacAnims=[];
  setPaused(false,true);
  syncTowerLocks();
  resize();updCoins();updHP();
  document.getElementById('tb-wave').textContent='1 / '+MAX_WAVE;
  document.getElementById('tb-timer').textContent='00:30';
  document.getElementById('tcount').textContent='0';
  document.getElementById('rprog').style.strokeDashoffset=0;
  selType('CableShield');banner();
  syncPlayerBadge();
  document.title=`TowerNet: ${displayNickname(playerName)} | Packet-Protocol`;
  if(raf)cancelAnimationFrame(raf);
  lastTs=null;raf=requestAnimationFrame(loop);
  addSN('grn','🟢','System Online','TowerNet initialized');
}
window.addEventListener('resize',()=>{if(S){const b=document.getElementById('pkt-bar').offsetHeight;canvas.width=mw.clientWidth;canvas.height=mw.clientHeight;makePath(b);}});
window.selType=selType;window.activatePlace=activatePlace;window.doConnect=doConnect;
window.copyIP=copyIP;window.upgradeTower=upgradeTower;window.sellTower=sellTower;window.startGame=startGame;window.doNextWave=doNextWave;window.togglePause=togglePause;window.toggleMobilePanel=toggleMobilePanel;
window.toggleMenu=toggleMenu;window.toggleLogFocus=toggleLogFocus;window.restartGame=restartGame;window.resumeFromMenu=resumeFromMenu;window.closeMenu=closeMenu;
window.openHowToPlay=openHowToPlay;window.closeHowToPlay=closeHowToPlay;window.showHowToPlay=openHowToPlay;
wireTopbarActions();
renderEnemyRoster();
renderLoginOverlay(safeGetStoredName());
