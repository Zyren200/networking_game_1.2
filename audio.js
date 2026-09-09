/* ══════════════════════════════════════════════════════════════════════════
   TOWERNET — PROCEDURAL AUDIO ENGINE
   ──────────────────────────────────────────────────────────────────────────
   Every sound (music + SFX) is synthesized at runtime with the Web Audio
   API. There are no external audio files, so there is nothing that can be
   "missing" or unlicensed — this module either works, or it quietly does
   nothing and the game keeps running exactly as before.

   Public API (window.GameAudio):
     unlock()                 — call from a user-gesture handler to start audio
     playSfx(name)             — fire a one-shot effect by name (safe no-op if unknown/unavailable)
     startMusic() / stopMusic()
     setMusicVolume(0..1) / setSfxVolume(0..1)
     setMuted(bool) / toggleMute() -> returns new muted state
     getState() -> {available, muted, musicVol, sfxVol}
   ══════════════════════════════════════════════════════════════════════════ */
(function(){
  'use strict';

  const STORE_KEY='towernet.audio.v1';
  const DEFAULTS={musicVol:0.35,sfxVol:0.55,muted:false};

  function loadPrefs(){
    try{
      const raw=localStorage.getItem(STORE_KEY);
      if(!raw)return {...DEFAULTS};
      const parsed=JSON.parse(raw);
      return {
        musicVol:clamp01(typeof parsed.musicVol==='number'?parsed.musicVol:DEFAULTS.musicVol),
        sfxVol:clamp01(typeof parsed.sfxVol==='number'?parsed.sfxVol:DEFAULTS.sfxVol),
        muted:!!parsed.muted
      };
    }catch(_e){return {...DEFAULTS};}
  }
  function savePrefs(){
    try{localStorage.setItem(STORE_KEY,JSON.stringify({musicVol,sfxVol,muted}));}catch(_e){}
  }
  function clamp01(v){return Math.max(0,Math.min(1,v));}

  let {musicVol,sfxVol,muted}=loadPrefs();

  let ctx=null;
  let masterGain=null,musicGain=null,sfxGain=null;
  let available=false;
  let unlocked=false;

  function safe(fn){
    return function(...args){
      try{return fn.apply(null,args);}catch(_e){/* audio must never break gameplay */}
    };
  }

  function buildGraph(){
    const Ctor=window.AudioContext||window.webkitAudioContext;
    if(!Ctor)return false;
    ctx=new Ctor();
    masterGain=ctx.createGain();
    musicGain=ctx.createGain();
    sfxGain=ctx.createGain();
    musicGain.gain.value=musicVol;
    sfxGain.gain.value=sfxVol;
    masterGain.gain.value=muted?0:1;
    musicGain.connect(masterGain);
    sfxGain.connect(masterGain);
    masterGain.connect(ctx.destination);
    return true;
  }

  const unlock=safe(function(){
    if(unlocked)return;
    unlocked=true;
    if(!ctx){
      available=buildGraph();
    }
    if(ctx&&ctx.state==='suspended'){
      ctx.resume().catch(()=>{});
    }
  });

  // ── low-level tone helpers ────────────────────────────────────────────
  function osc(type,freq,t0,dur,gainNode,peak){
    const o=ctx.createOscillator();
    const g=ctx.createGain();
    o.type=type;
    o.frequency.setValueAtTime(freq,t0);
    g.gain.setValueAtTime(0,t0);
    g.gain.linearRampToValueAtTime(peak,t0+Math.min(0.012,dur*0.25));
    g.gain.exponentialRampToValueAtTime(0.0001,t0+dur);
    o.connect(g);g.connect(gainNode);
    o.start(t0);o.stop(t0+dur+0.02);
    return {osc:o,gain:g};
  }
  function sweep(type,f0,f1,t0,dur,gainNode,peak){
    const o=ctx.createOscillator();
    const g=ctx.createGain();
    o.type=type;
    o.frequency.setValueAtTime(f0,t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(20,f1),t0+dur);
    g.gain.setValueAtTime(0,t0);
    g.gain.linearRampToValueAtTime(peak,t0+Math.min(0.01,dur*0.2));
    g.gain.exponentialRampToValueAtTime(0.0001,t0+dur);
    o.connect(g);g.connect(gainNode);
    o.start(t0);o.stop(t0+dur+0.02);
  }
  function noiseBurst(t0,dur,gainNode,peak,filterFreq){
    const bufSize=Math.max(1,Math.floor(ctx.sampleRate*dur));
    const buf=ctx.createBuffer(1,bufSize,ctx.sampleRate);
    const data=buf.getChannelData(0);
    for(let i=0;i<bufSize;i++)data[i]=(Math.random()*2-1)*(1-i/bufSize);
    const src=ctx.createBufferSource();
    src.buffer=buf;
    const g=ctx.createGain();
    g.gain.setValueAtTime(peak,t0);
    g.gain.exponentialRampToValueAtTime(0.0001,t0+dur);
    let node=src;
    if(filterFreq){
      const f=ctx.createBiquadFilter();
      f.type='bandpass';f.frequency.value=filterFreq;f.Q.value=0.9;
      src.connect(f);f.connect(g);
    }else{
      src.connect(g);
    }
    g.connect(gainNode);
    src.start(t0);
  }

  // ── SFX library ──────────────────────────────────────────────────────
  const SFX={
    uiClick(t){ noiseBurst(t,0.035,sfxGain,0.18,3200); },
    denied(t){
      osc('square',220,t,0.09,sfxGain,0.16);
      osc('square',160,t+0.07,0.11,sfxGain,0.16);
    },
    breach(t){
      osc('sawtooth',300,t,0.16,sfxGain,0.20);
      osc('sawtooth',210,t+0.11,0.20,sfxGain,0.20);
      noiseBurst(t,0.12,sfxGain,0.12,900);
    },
    confirm(t){
      osc('sine',520,t,0.09,sfxGain,0.18);
      osc('sine',720,t+0.06,0.12,sfxGain,0.18);
    },
    unlock(t){
      osc('triangle',440,t,0.10,sfxGain,0.16);
      osc('triangle',660,t+0.08,0.10,sfxGain,0.16);
      osc('triangle',880,t+0.16,0.14,sfxGain,0.18);
    },
    towerPlace(t){
      noiseBurst(t,0.06,sfxGain,0.22,1400);
      osc('sine',150,t,0.12,sfxGain,0.22);
    },
    towerConnect(t){
      osc('square',500,t,0.07,sfxGain,0.14);
      osc('square',780,t+0.06,0.10,sfxGain,0.16);
      osc('square',1040,t+0.13,0.12,sfxGain,0.14);
    },
    towerShoot(t){
      sweep('sawtooth',900,220,t,0.06,sfxGain,0.07);
    },
    enemyKill(t){
      sweep('square',700,120,t,0.10,sfxGain,0.16);
      noiseBurst(t,0.05,sfxGain,0.10,2200);
    },
    upgrade(t){
      sweep('triangle',300,900,t,0.16,sfxGain,0.18);
    },
    sell(t){
      osc('square',900,t,0.06,sfxGain,0.14);
      osc('square',1200,t+0.05,0.06,sfxGain,0.14);
      osc('square',1500,t+0.10,0.09,sfxGain,0.14);
    },
    heal(t){
      osc('sine',392,t,0.22,sfxGain,0.14);
      osc('sine',494,t+0.08,0.22,sfxGain,0.14);
      osc('sine',587,t+0.16,0.28,sfxGain,0.16);
    },
    waveStart(t){
      osc('triangle',220,t,0.14,sfxGain,0.16);
      osc('triangle',330,t+0.12,0.14,sfxGain,0.16);
      osc('triangle',440,t+0.24,0.20,sfxGain,0.18);
    },
    waveClear(t){
      osc('triangle',523,t,0.12,sfxGain,0.18);
      osc('triangle',659,t+0.10,0.12,sfxGain,0.18);
      osc('triangle',784,t+0.20,0.12,sfxGain,0.18);
      osc('triangle',1046,t+0.30,0.22,sfxGain,0.20);
    },
    lowHp(t){
      osc('square',480,t,0.14,sfxGain,0.14);
      osc('square',360,t+0.16,0.18,sfxGain,0.14);
    },
    pause(t){
      osc('sine',440,t,0.08,sfxGain,0.12);
      osc('sine',330,t+0.07,0.10,sfxGain,0.12);
    },
    resume(t){
      osc('sine',330,t,0.08,sfxGain,0.12);
      osc('sine',440,t+0.07,0.10,sfxGain,0.12);
    },
    victory(t){
      [523,659,784,1046,1318].forEach((f,i)=>osc('triangle',f,t+i*0.11,0.22,sfxGain,0.18));
    },
    defeat(t){
      sweep('sawtooth',260,60,t,0.9,sfxGain,0.18);
      osc('sine',80,t+0.55,0.5,sfxGain,0.14);
    }
  };

  const playSfx=safe(function(name){
    if(!available||muted)return;
    unlock();
    if(!ctx||ctx.state!=='running')return;
    const fn=SFX[name];
    if(!fn)return;
    fn(ctx.currentTime);
  });

  // simple throttle helper for very frequent effects (tower fire)
  let lastShotAt=0;
  const playThrottled=safe(function(name,minGapMs){
    const now=performance.now();
    if(now-lastShotAt<minGapMs)return;
    lastShotAt=now;
    playSfx(name);
  });

  // ── procedural background music (loop) ──────────────────────────────
  const BPM=98;
  const STEP=60/BPM/4; // 16th note length in seconds
  const BAR_STEPS=16;
  // simple 4-chord minor progression, one root per bar (A C G F — cyberpunk-ish)
  const BASS_ROOTS=[110.00,130.81,98.00,87.31]; // A2, C3, G2, F2
  const ARP_INTERVALS=[0,3,7,10]; // minor7-ish color tones (semitones)

  let musicTimer=null;
  let musicPlaying=false;
  let nextNoteTime=0;
  let currentStep=0;
  let currentBar=0;
  const LOOKAHEAD_MS=25;
  const SCHEDULE_AHEAD=0.14;

  function midiToFreq(base,semitones){return base*Math.pow(2,semitones/12);}

  function scheduleBassStep(t,step,bar){
    if(step%4===0){
      const root=BASS_ROOTS[bar%BASS_ROOTS.length];
      osc('triangle',root,t,STEP*3.6,musicGain,0.10);
    }
  }
  function scheduleArpStep(t,step,bar){
    // arpeggiate on off-beats for a light, non-fatiguing texture
    if(step%2===1){
      const root=BASS_ROOTS[bar%BASS_ROOTS.length]*2; // one octave up
      const iv=ARP_INTERVALS[(Math.floor(step/2))%ARP_INTERVALS.length];
      const f=midiToFreq(root,iv);
      osc('sine',f,t,STEP*0.9,musicGain,0.045);
    }
  }
  function scheduleHat(t,step){
    if(step%2===0){
      noiseBurst(t,0.03,musicGain,0.03,7000);
    }
  }

  function musicScheduler(){
    if(!ctx)return;
    while(nextNoteTime<ctx.currentTime+SCHEDULE_AHEAD){
      scheduleBassStep(nextNoteTime,currentStep,currentBar);
      scheduleArpStep(nextNoteTime,currentStep,currentBar);
      scheduleHat(nextNoteTime,currentStep);
      nextNoteTime+=STEP;
      currentStep++;
      if(currentStep>=BAR_STEPS){
        currentStep=0;
        currentBar=(currentBar+1)%BASS_ROOTS.length;
      }
    }
  }

  const startMusic=safe(function(){
    if(!available||musicPlaying)return;
    unlock();
    if(!ctx)return;
    musicPlaying=true;
    currentStep=0;currentBar=0;
    nextNoteTime=ctx.currentTime+0.05;
    if(musicTimer)clearInterval(musicTimer);
    musicTimer=setInterval(musicScheduler,LOOKAHEAD_MS);
  });
  const stopMusic=safe(function(){
    musicPlaying=false;
    if(musicTimer){clearInterval(musicTimer);musicTimer=null;}
  });

  // ── public controls ──────────────────────────────────────────────────
  const setMusicVolume=safe(function(v){
    musicVol=clamp01(v);
    if(musicGain)musicGain.gain.setTargetAtTime(musicVol,ctx.currentTime,0.05);
    savePrefs();
  });
  const setSfxVolume=safe(function(v){
    sfxVol=clamp01(v);
    if(sfxGain)sfxGain.gain.setTargetAtTime(sfxVol,ctx.currentTime,0.05);
    savePrefs();
  });
  const setMuted=safe(function(m){
    muted=!!m;
    if(masterGain&&ctx)masterGain.gain.setTargetAtTime(muted?0:1,ctx.currentTime,0.04);
    savePrefs();
  });
  const toggleMute=safe(function(){
    setMuted(!muted);
    return muted;
  });
  function getState(){
    return {available,muted,musicVol,sfxVol};
  }

  window.GameAudio={
    unlock,
    playSfx,
    playThrottled,
    startMusic,
    stopMusic,
    setMusicVolume,
    setSfxVolume,
    setMuted,
    toggleMute,
    getState
  };

  // best-effort early unlock on first user gesture anywhere on the page,
  // as a safety net in addition to the explicit calls wired into the UI
  ['pointerdown','keydown','touchstart'].forEach(evt=>{
    window.addEventListener(evt,function once(){
      unlock();
      window.removeEventListener(evt,once);
    },{once:true,passive:true});
  });
})();