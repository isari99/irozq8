import { useState, useRef, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Wifi, WifiOff, Users, RotateCcw, Music2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

// ─── YouTube API ──────────────────────────────────────────────────────────────
declare global {
  interface Window { YT: any; onYouTubeIframeAPIReady?: () => void; _ytReady?: boolean }
}
let _ytP: Promise<void> | null = null;
function loadYT(): Promise<void> {
  if (_ytP) return _ytP;
  _ytP = new Promise(res => {
    if (window._ytReady && window.YT?.Player) { res(); return; }
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { window._ytReady = true; prev?.(); res(); };
    if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
      const s = document.createElement("script"); s.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(s);
    }
  });
  return _ytP;
}

// ─── Twitch real profile photo ─────────────────────────────────────────────
async function fetchTwitchPhoto(username: string): Promise<string> {
  try {
    const res = await fetch(`https://api.ivr.fi/v2/twitch/user?login=${username}`);
    const data = await res.json();
    const user = Array.isArray(data) ? data[0] : data?.data?.[0];
    const url = user?.profileImageURL ?? user?.logo ?? user?.profile_image_url;
    if (url) return url.replace("{width}", "150").replace("{height}", "150");
  } catch {}
  return `https://unavatar.io/twitch/${username}`;
}

// ─── Songs (confirmed IDs) ────────────────────────────────────────────────────
interface Song { id: string; title: string; artist: string; start: number }
const SONGS: Song[] = [
  { id: "joevqtOJFes", title: "يا طير",        artist: "راشد الماجد", start: 25 },
  { id: "_nSq4Mtlfno", title: "ندمان",           artist: "نبيل شعيل",   start: 30 },
  { id: "5Gi9Q9P0bVI", title: "يا عمري انا",    artist: "فرقة ميامي",  start: 24 },
  { id: "QUBvVTNRp4Q", title: "بشرة خير",       artist: "حسين الجسمي", start: 30 },
  { id: "KLJA-srM_yM", title: "نور العين",       artist: "عمرو دياب",   start: 25 },
  { id: "EgmXTmj62ic", title: "تملى معاك",      artist: "عمرو دياب",   start: 35 },
  { id: "a_vfYHbLr7Y", title: "وغلاوتك",        artist: "عمرو دياب",   start: 30 },
  { id: "qzcIKpmEBHo", title: "أخاصمك آه",      artist: "نانسي عجرم",  start: 20 },
  { id: "1nlzrBWh0H8", title: "يا سلام",         artist: "نانسي عجرم",  start: 22 },
  { id: "UFn1-pTQ85s", title: "من نظرة",        artist: "نانسي عجرم",  start: 18 },
  { id: "iOP9PYLICK8", title: "بدنا نولع الجو", artist: "نانسي عجرم",  start: 18 },
  { id: "jHEYg6VZoOw", title: "يللا",           artist: "نانسي عجرم",  start: 15 },
  { id: "WlqefHeYYR0", title: "يا نور العين",    artist: "مطرف المطرف", start: 32 },
  { id: "z6RC2T3Q7rs", title: "قمرين",           artist: "عمرو دياب",   start: 28 },
  { id: "D_hH-bn5dD0", title: "أنا يللي بحبك",  artist: "نانسي عجرم",  start: 22 },
  { id: "YRadUqAv7i8", title: "إحساس جديد",     artist: "نانسي عجرم",  start: 22 },
  { id: "dNQMH3WVMNs", title: "قلبي يا قلبي",   artist: "نانسي عجرم",  start: 18 },
  { id: "vZ0OFwpvIv0", title: "شيخ الشباب",     artist: "نانسي عجرم",  start: 20 },
];
const CLIP_DURATIONS = [10, 15, 20, 22] as const;

// ─── Types ────────────────────────────────────────────────────────────────────
type Phase = "lobby" | "spinning" | "selecting" | "elimination" | "winner";
interface Player { username: string; displayName: string; avatar: string }

const GOLD      = "#c8860a";
const GOLD_LT   = "#f0b429";
const BROWN_D   = "#0f0802";
const BROWN_M   = "#1e1004";
const BROWN_R   = "#2e1606";
const SELECT_S  = 20;

// ─── Wheel ───────────────────────────────────────────────────────────────────
const WHEEL_SIZE = 360;
const CX = WHEEL_SIZE / 2;
const CY = WHEEL_SIZE / 2;
const PLAYER_R = WHEEL_SIZE / 2 - 42;
const CHAIR_R  = WHEEL_SIZE / 2 - 82;

function GameWheel({ spinning, players, chairCount, chairOccupied, showChairs }: {
  spinning: boolean;
  players: Player[];
  chairCount: number;
  chairOccupied: Record<number, Player>;
  showChairs: boolean;
}) {
  const chairPos = Array.from({ length: chairCount }, (_, i) => {
    const a = (i / chairCount) * 2 * Math.PI - Math.PI / 2;
    return { num: i + 1, x: CX + CHAIR_R * Math.cos(a), y: CY + CHAIR_R * Math.sin(a) };
  });

  return (
    <div style={{ width: WHEEL_SIZE, height: WHEEL_SIZE, position: "relative", flexShrink: 0 }}>
      {/* Outer glow ring */}
      <motion.div style={{ position:"absolute", inset:0, borderRadius:"50%",
        border:`5px solid ${GOLD}` }}
        animate={{ boxShadow: spinning
          ? [`0 0 35px ${GOLD}60,0 0 70px ${GOLD}25`, `0 0 55px ${GOLD}90,0 0 110px ${GOLD}45`, `0 0 35px ${GOLD}60,0 0 70px ${GOLD}25`]
          : `0 0 16px ${GOLD}30` }}
        transition={{ duration: 1.5, repeat: Infinity }} />

      {/* Slow-rotating outer halo */}
      <div className={spinning ? "chairs-orbit-slow" : ""}
        style={{ position:"absolute", inset:8, borderRadius:"50%",
          background:`conic-gradient(transparent,${GOLD}15,transparent,${GOLD}10,transparent,${GOLD}15,transparent)` }}/>

      {/* Main disc body */}
      <div style={{ position:"absolute", inset:14, borderRadius:"50%",
        background:`radial-gradient(circle at 38% 32%, ${BROWN_R}, ${BROWN_D} 70%)`,
        boxShadow:`inset 0 0 80px rgba(0,0,0,.9)`, border:`2px solid ${GOLD}18` }}>
        {/* dot pattern */}
        <svg style={{position:"absolute",inset:0,width:"100%",height:"100%",opacity:.06,borderRadius:"50%"}}>
          <defs>
            <pattern id="cgd" x="0" y="0" width="18" height="18" patternUnits="userSpaceOnUse">
              <circle cx="9" cy="9" r="1.5" fill={GOLD}/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#cgd)"/>
        </svg>
        <div style={{position:"absolute",inset:18,borderRadius:"50%",border:`1px solid ${GOLD}18`}}/>
        <div style={{position:"absolute",inset:36,borderRadius:"50%",border:`1px solid ${GOLD}10`}}/>
      </div>

      {/* Orbiting player photos */}
      <div className={spinning ? "chairs-orbit" : ""}
        style={{ position:"absolute", inset:0 }}>
        {players.map((p, i) => {
          const a   = (i / players.length) * 360;
          const rad = (a * Math.PI) / 180;
          const px  = CX + PLAYER_R * Math.cos(rad - Math.PI / 2);
          const py  = CY + PLAYER_R * Math.sin(rad - Math.PI / 2);
          const sat = Object.values(chairOccupied).some(x => x.username === p.username);
          return (
            <div key={p.username}
              style={{ position:"absolute", left:px-24, top:py-24, width:48, height:48 }}>
              <div className={spinning ? "chairs-counter" : ""}
                style={{ width:"100%", height:"100%" }}>
                <div style={{
                  width:48, height:48, borderRadius:"50%", overflow:"hidden",
                  border:`3px solid ${sat ? GOLD_LT : GOLD}`,
                  boxShadow:`0 0 ${sat?18:8}px ${GOLD}${sat?"90":"50"}`,
                  opacity:showChairs && !sat ? 0.35 : 1,
                  transition:"all .3s",
                }}>
                  <img src={p.avatar} alt={p.displayName}
                    style={{width:"100%",height:"100%",objectFit:"cover"}}
                    onError={e=>{(e.target as HTMLImageElement).src=
                      `https://api.dicebear.com/7.x/pixel-art/svg?seed=${p.username}`;}}/>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Center: music icon while spinning */}
      <AnimatePresence>
        {spinning && (
          <motion.div key="mus"
            initial={{opacity:0,scale:.5}} animate={{opacity:1,scale:1}} exit={{opacity:0,scale:.5}}
            style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",
              pointerEvents:"none"}}>
            <motion.span animate={{scale:[1,1.3,1],rotate:[0,15,-15,0]}}
              transition={{duration:.9,repeat:Infinity}}
              style={{fontSize:40}}>🎵</motion.span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chairs when selecting */}
      <AnimatePresence>
        {showChairs && (
          <motion.div key="ch" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
            style={{position:"absolute",inset:0,pointerEvents:"none"}}>
            {chairPos.map(({num, x, y}) => {
              const player = chairOccupied[num];
              return (
                <motion.div key={num}
                  initial={{scale:0,opacity:0}} animate={{scale:1,opacity:1}}
                  transition={{delay:num*.07,type:"spring",stiffness:320,damping:18}}
                  style={{position:"absolute",left:x-26,top:y-26,width:52,textAlign:"center"}}>
                  <motion.div
                    animate={player ? {scale:[1,1.18,1],boxShadow:[`0 0 12px ${GOLD}50`,`0 0 28px ${GOLD}`,`0 0 12px ${GOLD}50`]} : {}}
                    transition={{duration:.6}}
                    style={{
                      width:52,height:52,borderRadius:15,overflow:"hidden",
                      border:`2.5px solid ${player ? GOLD_LT : GOLD+"45"}`,
                      background: player ? `${GOLD}20` : `${BROWN_M}ee`,
                      display:"flex",alignItems:"center",justifyContent:"center",
                      position:"relative",
                    }}>
                    {player
                      ? <img src={player.avatar} alt={player.displayName}
                          style={{width:"100%",height:"100%",objectFit:"cover"}}
                          onError={e=>{(e.target as HTMLImageElement).src=
                            `https://api.dicebear.com/7.x/pixel-art/svg?seed=${player.username}`;}}/>
                      : <span style={{fontWeight:900,fontSize:18,color:GOLD_LT}}>{num}</span>}
                  </motion.div>
                  {player && (
                    <motion.div initial={{opacity:0,y:3}} animate={{opacity:1,y:0}}
                      style={{fontSize:8,color:GOLD,marginTop:2,fontWeight:700,
                        overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:52}}>
                      {player.displayName}
                    </motion.div>
                  )}
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top diamond */}
      <div style={{position:"absolute",top:2,left:"50%",transform:"translateX(-50%)"}}>
        <div style={{width:13,height:13,background:GOLD,transform:"rotate(45deg)",
          boxShadow:`0 0 10px ${GOLD}`,borderRadius:2}}/>
      </div>
    </div>
  );
}

// ─── Countdown ring ────────────────────────────────────────────────────────────
function Ring({ sec, total, big }: { sec:number; total:number; big?:boolean }) {
  const sz = big ? 70 : 52;
  const r  = big ? 28 : 20;
  const circ = 2*Math.PI*r;
  const dash = circ*(sec/total);
  const warn = sec <= 5;
  return (
    <svg width={sz} height={sz} viewBox={`0 0 ${sz} ${sz}`}>
      <circle cx={sz/2} cy={sz/2} r={r} fill="none" stroke={`${GOLD}20`} strokeWidth={big?4:3.5}/>
      <circle cx={sz/2} cy={sz/2} r={r} fill="none"
        stroke={warn?"#f43f5e":GOLD} strokeWidth={big?4:3.5}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        style={{transform:"rotate(-90deg)",transformOrigin:"center",transition:"stroke-dasharray 0.9s linear"}}/>
      <text x={sz/2} y={sz/2+5} textAnchor="middle" fontSize={big?18:13} fontWeight="900"
        fill={warn?"#f43f5e":GOLD}>{sec}</text>
    </svg>
  );
}

// ─── Confetti ─────────────────────────────────────────────────────────────────
const CC = [GOLD,"#e040fb","#00e5ff","#22c55e","#f43f5e","#fbbf24"];
function Confetti() {
  return (
    <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:50,overflow:"hidden"}}>
      {Array.from({length:64}).map((_,i)=>(
        <motion.div key={i} style={{
          position:"absolute",borderRadius:2,
          width:Math.random()*9+5, height:Math.random()*9+5,
          left:`${Math.random()*100}%`, top:-14,
          background:CC[i%CC.length],
        }}
          animate={{y:["0vh","115vh"],rotate:[0,(Math.random()>.5?1:-1)*720],opacity:[1,.8,0]}}
          transition={{duration:Math.random()*2.5+1.5,delay:Math.random()*1.5,ease:"linear"}}/>
      ))}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function ChairsGame() {
  const [, navigate] = useLocation();
  const { user } = useAuth();

  const [phase, setPhase]             = useState<Phase>("lobby");
  const [players, setPlayers]         = useState<Player[]>([]);
  const [roundNum, setRoundNum]       = useState(1);
  const [chairOccupied, setChairOccupied] = useState<Record<number,Player>>({});
  const [eliminated, setEliminated]   = useState<Player|null>(null);
  const [winner, setWinner]           = useState<Player|null>(null);
  const [connected, setConnected]     = useState(false);
  const [currentSong, setCurrentSong] = useState<Song|null>(null);
  const [showChairs, setShowChairs]   = useState(false);
  const [selTimer, setSelTimer]       = useState(SELECT_S);
  const [cdTimer, setCdTimer]         = useState(5);
  const [clipTimer, setClipTimer]     = useState(0);
  const [clipTotal, setClipTotal]     = useState(15);

  const phaseRef   = useRef<Phase>("lobby");
  const playersRef = useRef<Player[]>([]);
  const chairRef   = useRef<Record<number,Player>>({});
  const ytRef      = useRef<any>(null);
  const ytDivRef   = useRef<HTMLDivElement>(null);
  const songIdxRef = useRef(0);
  const selInt     = useRef<ReturnType<typeof setInterval>|null>(null);
  const cdInt      = useRef<ReturnType<typeof setInterval>|null>(null);
  const clipInt    = useRef<ReturnType<typeof setInterval>|null>(null);
  const connRef    = useRef(false);
  const doEliminateRef = useRef<()=>void>(()=>{});

  useEffect(()=>{ phaseRef.current=phase; },[phase]);
  useEffect(()=>{ playersRef.current=players; },[players]);
  useEffect(()=>{ chairRef.current=chairOccupied; },[chairOccupied]);

  const numChairs = Math.max(players.length-1,1);

  const clrAll = ()=>{
    [selInt,cdInt,clipInt].forEach(r=>{ if(r.current){clearInterval(r.current);r.current=null;} });
  };

  // ── YouTube ──────────────────────────────────────────────────────────────
  useEffect(()=>{
    loadYT().then(()=>{
      if(!ytDivRef.current||ytRef.current) return;
      ytRef.current=new window.YT.Player(ytDivRef.current,{
        width:"1",height:"1",
        playerVars:{autoplay:0,controls:0,fs:0,modestbranding:1,rel:0,playsinline:1},
        events:{onReady:()=>{}},
      });
    });
    return ()=>{ clrAll(); try{ytRef.current?.destroy();}catch{} ytRef.current=null; };
  },[]);

  const playMusic = useCallback(()=>{
    const s=[...SONGS].sort(()=>Math.random()-.5)[songIdxRef.current%SONGS.length];
    songIdxRef.current++;
    setCurrentSong(s);
    try{ ytRef.current?.loadVideoById?.({videoId:s.id,startSeconds:s.start}); }catch{}
  },[]);

  const stopMusic = useCallback(()=>{
    try{ ytRef.current?.pauseVideo?.(); }catch{}
    setCurrentSong(null);
  },[]);

  // ── doEliminate (stable ref so doNextRound can call it) ────────────────
  const doEliminate = useCallback(()=>{
    clrAll();
    const cur=playersRef.current; const occ=chairRef.current;
    const sat=new Set(Object.values(occ).map(p=>p.username));
    const out=cur.filter(p=>!sat.has(p.username));
    const eli=out.length>0?out[Math.floor(Math.random()*out.length)]:null;
    setEliminated(eli);
    phaseRef.current="elimination"; setPhase("elimination");
    let cd=5; setCdTimer(cd);
    cdInt.current=setInterval(()=>{
      cd-=1; setCdTimer(cd);
      if(cd<=0){ clearInterval(cdInt.current!); cdInt.current=null; doEliminateRef.current && doNextRoundInternal(eli); }
    },1000);
  },[]);

  useEffect(()=>{ doEliminateRef.current=doEliminate; },[doEliminate]);

  // split out so the cd timer can call it
  const doNextRoundInternal = (eli:Player|null)=>{
    clrAll();
    const cur=playersRef.current;
    const rem=cur.filter(p=>p.username!==eli?.username);
    playersRef.current=rem;
    if(rem.length<=1){
      setWinner(rem[0]??null); setPlayers(rem);
      phaseRef.current="winner"; setPhase("winner");
    } else {
      setPlayers(rem); setRoundNum(r=>r+1);
      setShowChairs(false);
      setTimeout(()=>doStartSpinInternal(rem),150);
    }
  };

  const doStartSpinInternal = (pl:Player[])=>{
    if(pl.length<2) return;
    clrAll();
    const empty:Record<number,Player>={};
    setChairOccupied(empty); chairRef.current=empty;
    setEliminated(null); setShowChairs(false);
    phaseRef.current="spinning"; setPhase("spinning");
    playMusic();
    const dur=CLIP_DURATIONS[Math.floor(Math.random()*CLIP_DURATIONS.length)];
    setClipTotal(dur); setClipTimer(dur);
    let t=dur;
    clipInt.current=setInterval(()=>{
      t-=1; setClipTimer(t);
      if(t<=0){ clearInterval(clipInt.current!); clipInt.current=null; stopSpin(); }
    },1000);
  };

  const stopSpin = ()=>{
    clrAll(); stopMusic();
    setShowChairs(true);
    phaseRef.current="selecting"; setPhase("selecting");
    let t=SELECT_S; setSelTimer(t);
    selInt.current=setInterval(()=>{
      t-=1; setSelTimer(t);
      if(t<=0){ clearInterval(selInt.current!); selInt.current=null; doEliminate(); }
    },1000);
  };

  const doStartSpin = useCallback((pl?:Player[])=>{
    doStartSpinInternal(pl??playersRef.current);
  },[playMusic,stopMusic,doEliminate]);

  const doRestart = ()=>{
    clrAll(); stopMusic();
    setPlayers([]); playersRef.current=[];
    setChairOccupied({}); chairRef.current={};
    setEliminated(null); setWinner(null); setRoundNum(1);
    setShowChairs(false); setCurrentSong(null);
    phaseRef.current="lobby"; setPhase("lobby");
  };

  // ── Chat ─────────────────────────────────────────────────────────────────
  const handleChat = useCallback((username:string, text:string)=>{
    const msg=text.trim().toLowerCase();
    const ph=phaseRef.current; const pl=playersRef.current;

    if(msg==="join"&&ph==="lobby"){
      if(pl.some(p=>p.username===username)) return;
      // Async fetch real Twitch photo
      const np:Player={ username, displayName:username, avatar:`https://unavatar.io/twitch/${username}` };
      setPlayers(prev=>{ const n=[...prev,np]; playersRef.current=n; return n; });
      fetchTwitchPhoto(username).then(url=>{
        setPlayers(prev=>{
          const n=prev.map(p=>p.username===username?{...p,avatar:url}:p);
          playersRef.current=n; return n;
        });
      });
      return;
    }

    if((msg==="start game"||msg==="startgame")&&ph==="lobby"&&pl.length>=2){
      doStartSpin(pl); return;
    }

    if(ph==="selecting"){
      const num=parseInt(msg,10);
      const occ=chairRef.current; const cur=playersRef.current;
      if(isNaN(num)||num<1||num>cur.length-1) return;
      if(occ[num]) return;
      const p=cur.find(x=>x.username===username); if(!p) return;
      if(Object.values(occ).some(x=>x.username===username)) return;
      setChairOccupied(prev=>{
        const n={...prev,[num]:p}; chairRef.current=n;
        if(Object.keys(n).length>=cur.length-1) setTimeout(()=>doEliminate(),500);
        return n;
      });
    }
  },[doStartSpin,doEliminate]);

  // ── Twitch IRC ────────────────────────────────────────────────────────────
  if(!connRef.current && user?.username){
    connRef.current=true;
    setTimeout(()=>{
      const ch=user.username.toLowerCase();
      const ws=new WebSocket("wss://irc-ws.chat.twitch.tv");
      ws.onopen=()=>{ ws.send("PASS SCHMOOPIIE"); ws.send(`NICK justinfan${Math.floor(Math.random()*89999)+10000}`); ws.send(`JOIN #${ch}`); };
      ws.onmessage=e=>{
        for(const line of (e.data as string).split("\r\n").filter(Boolean)){
          if(line.startsWith("PING")){ ws.send("PONG :tmi.twitch.tv"); continue; }
          if(line.includes("366")||line.includes("ROOMSTATE")){ setConnected(true); continue; }
          const m=line.match(/^(?:@[^ ]+ )?:(\w+)!\w+@\w+\.tmi\.twitch\.tv PRIVMSG #\w+ :(.+)$/);
          if(m) handleChat(m[1],m[2].trim());
        }
      };
      ws.onclose=()=>setConnected(false);
    },80);
  }

  // ── Header ────────────────────────────────────────────────────────────────
  const Header = ()=>(
    <header style={{background:`${BROWN_D}f5`,backdropFilter:"blur(16px)",
      borderBottom:`1px solid ${GOLD}20`}}
      className="flex items-center justify-between px-5 py-3.5 flex-shrink-0 z-20">
      <button onClick={()=>{ clrAll(); stopMusic(); navigate("/"); }}
        className="flex items-center gap-1.5 text-sm opacity-50 hover:opacity-100 transition-opacity"
        style={{color:GOLD}}>
        <ArrowRight size={14}/><span>رجوع</span>
      </button>
      <div className="flex items-center gap-2">
        <span style={{fontSize:20}}>🪑</span>
        <span className="font-black text-lg" style={{color:GOLD,textShadow:`0 0 18px ${GOLD}80`}}>
          لعبة الكراسي{roundNum>1?` — ج${roundNum}`:""}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        {connected?<Wifi size={12} className="text-green-400"/>:<WifiOff size={12} style={{color:"rgba(255,80,80,.5)"}}/>}
        <span className="text-xs" style={{color:connected?"#4ade80":"rgba(255,80,80,.5)"}}>
          {connected?user?.username:"غير متصل"}
        </span>
      </div>
    </header>
  );

  return (
    <div className="h-screen flex flex-col overflow-hidden relative" dir="rtl"
      style={{background:`radial-gradient(ellipse at 30% 20%, #221003 0%, ${BROWN_D} 65%)`}}>

      {/* bg glows */}
      <div style={{position:"absolute",top:0,right:0,width:350,height:350,borderRadius:"50%",opacity:.08,
        background:`radial-gradient(circle,${GOLD},transparent)`,filter:"blur(80px)",pointerEvents:"none"}}/>
      <div style={{position:"absolute",bottom:0,left:0,width:350,height:350,borderRadius:"50%",opacity:.04,
        background:`radial-gradient(circle,${GOLD},transparent)`,filter:"blur(80px)",pointerEvents:"none"}}/>

      {/* Hidden YouTube */}
      <div style={{position:"absolute",opacity:0,pointerEvents:"none",width:1,height:1,overflow:"hidden"}}>
        <div ref={ytDivRef}/>
      </div>

      <Header/>

      <AnimatePresence mode="wait">

        {/* ══ LOBBY ══════════════════════════════════════════════════════════ */}
        {phase==="lobby" && (
          <motion.main key="lobby"
            initial={{opacity:0,y:18}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-18}}
            className="flex-1 overflow-y-auto flex flex-col items-center py-6 px-5 gap-6">

            {/* Join card */}
            <div className="w-full max-w-md rounded-3xl p-6 text-center"
              style={{background:`${BROWN_R}90`,border:`2px solid ${GOLD}45`,boxShadow:`0 0 40px ${GOLD}20`}}>
              <p className="text-3xl font-black mb-2" style={{color:GOLD,letterSpacing:1}}>
                اكتب <span style={{background:`${GOLD}25`,padding:"0 8px",borderRadius:8}}>join</span> في الشات
              </p>
              <p className="text-base text-white/40">للانضمام إلى لعبة الكراسي الموسيقية 🎵</p>
            </div>

            {/* Player count */}
            <div className="w-full max-w-md flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users size={16} style={{color:GOLD}}/>
                <span className="font-bold text-base" style={{color:GOLD}}>اللاعبون المنضمون</span>
              </div>
              <span className="font-black text-sm px-3 py-1 rounded-full"
                style={{background:`${GOLD}18`,color:GOLD,border:`1px solid ${GOLD}35`}}>
                {players.length} لاعب
              </span>
            </div>

            {/* Player grid */}
            {players.length===0 ? (
              <div className="w-full max-w-md text-center py-16 rounded-3xl border border-dashed"
                style={{borderColor:`${GOLD}18`}}>
                <span className="text-6xl opacity-15 block mb-3">🪑</span>
                <p className="text-base opacity-30" style={{color:GOLD}}>لم ينضم أحد بعد...</p>
              </div>
            ) : (
              <div className="w-full max-w-md grid grid-cols-3 gap-4">
                {players.map((p,i)=>(
                  <motion.div key={p.username}
                    initial={{opacity:0,scale:.7}} animate={{opacity:1,scale:1}}
                    transition={{delay:i*.04,type:"spring",stiffness:280}}
                    className="flex flex-col items-center gap-2.5 p-4 rounded-3xl"
                    style={{background:`${BROWN_M}90`,border:`1.5px solid ${GOLD}30`,
                      boxShadow:`0 0 16px ${GOLD}12`}}>
                    <div style={{width:72,height:72,borderRadius:"50%",overflow:"hidden",
                      border:`3.5px solid ${GOLD}`,boxShadow:`0 0 20px ${GOLD}55`,flexShrink:0}}>
                      <img src={p.avatar} alt={p.displayName}
                        style={{width:"100%",height:"100%",objectFit:"cover"}}
                        onError={e=>{(e.target as HTMLImageElement).src=
                          `https://api.dicebear.com/7.x/pixel-art/svg?seed=${p.username}`;}}/>
                    </div>
                    <span className="text-xs font-bold text-center truncate w-full" style={{color:GOLD_LT}}>
                      {p.displayName}
                    </span>
                  </motion.div>
                ))}
              </div>
            )}

            {/* Start button */}
            <div className="w-full max-w-md pb-4">
              <motion.button
                onClick={()=>doStartSpin()}
                disabled={players.length<2}
                whileHover={players.length>=2?{scale:1.03}:{}}
                whileTap={players.length>=2?{scale:0.97}:{}}
                className="w-full py-5 rounded-2xl font-black text-xl text-black"
                style={{
                  background:players.length>=2?`linear-gradient(135deg,${GOLD_LT},${GOLD},#7a4800)`:"rgba(255,255,255,0.04)",
                  color:players.length>=2?"#000":"rgba(255,255,255,0.18)",
                  boxShadow:players.length>=2?`0 0 40px ${GOLD}50`:"none",
                  border:`1.5px solid ${players.length>=2?GOLD:"rgba(255,255,255,0.06)"}`,
                  cursor:players.length>=2?"pointer":"not-allowed",
                }}>
                {players.length>=2?`▶  ابدأ اللعبة — ${players.length} لاعبين`:"يحتاج لاعبَين على الأقل"}
              </motion.button>
            </div>
          </motion.main>
        )}

        {/* ══ SPINNING ═══════════════════════════════════════════════════════ */}
        {phase==="spinning" && (
          <motion.main key="spin"
            initial={{opacity:0,scale:.94}} animate={{opacity:1,scale:1}} exit={{opacity:0}}
            className="flex-1 flex flex-col items-center justify-center gap-5 px-4 py-4">

            <div className="text-center">
              <p className="text-2xl font-black text-white/75">الجولة {roundNum}</p>
              <p className="text-sm opacity-40" style={{color:GOLD}}>{players.length} لاعبين — {numChairs} كرسي</p>
            </div>

            <div className="relative flex items-center justify-center">
              <GameWheel spinning={true} players={players}
                chairCount={numChairs} chairOccupied={{}} showChairs={false}/>
              {/* Countdown badge */}
              <div style={{position:"absolute",top:-8,left:-8}}>
                <Ring sec={clipTimer} total={clipTotal} big/>
              </div>
            </div>

            {/* Now playing */}
            {currentSong && (
              <motion.div initial={{opacity:0,y:6}} animate={{opacity:1,y:0}}
                className="flex items-center gap-2 px-5 py-2.5 rounded-full"
                style={{background:`${GOLD}12`,border:`1px solid ${GOLD}35`}}>
                <motion.div animate={{scale:[1,1.3,1]}} transition={{duration:.7,repeat:Infinity}}>
                  <Music2 size={14} style={{color:GOLD}}/>
                </motion.div>
                <span className="text-sm font-bold" style={{color:GOLD_LT}}>
                  {currentSong.title} — {currentSong.artist}
                </span>
              </motion.div>
            )}
          </motion.main>
        )}

        {/* ══ SELECTING ══════════════════════════════════════════════════════ */}
        {phase==="selecting" && (
          <motion.main key="sel"
            initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} exit={{opacity:0}}
            className="flex-1 overflow-y-auto flex flex-col items-center gap-4 px-4 py-4">

            <div className="flex items-center gap-3 text-center">
              <div>
                <h3 className="text-2xl font-black text-white/90">اختر كرسيك! 🪑</h3>
                <p className="text-sm opacity-40 text-white mt-0.5">
                  اكتب رقم الكرسي في الشات (1 – {numChairs})
                </p>
              </div>
              <Ring sec={selTimer} total={SELECT_S} big/>
            </div>

            <GameWheel spinning={false} players={players}
              chairCount={numChairs} chairOccupied={chairOccupied} showChairs={true}/>

            {/* Who hasn't chosen */}
            <div className="w-full max-w-md">
              <p className="text-xs text-white/25 text-center mb-2">لم يختاروا بعد</p>
              <div className="flex flex-wrap justify-center gap-2">
                {players
                  .filter(p=>!Object.values(chairOccupied).some(x=>x.username===p.username))
                  .map(p=>(
                    <div key={p.username} className="flex items-center gap-2 px-3 py-1.5 rounded-xl"
                      style={{background:`${GOLD}08`,border:`1px solid ${GOLD}25`}}>
                      <img src={p.avatar} alt={p.displayName}
                        style={{width:26,height:26,borderRadius:"50%",objectFit:"cover",
                          border:`1.5px solid ${GOLD}50`}}
                        onError={e=>{(e.target as HTMLImageElement).src=
                          `https://api.dicebear.com/7.x/pixel-art/svg?seed=${p.username}`;}}/>
                      <span className="text-sm font-bold" style={{color:GOLD}}>{p.displayName}</span>
                    </div>
                  ))}
              </div>
            </div>

            <motion.button onClick={()=>{clrAll();doEliminate();}}
              whileHover={{scale:1.04}} whileTap={{scale:0.97}}
              className="px-9 py-4 rounded-2xl font-black text-base text-black"
              style={{background:`linear-gradient(135deg,${GOLD_LT},${GOLD})`,boxShadow:`0 0 24px ${GOLD}55`}}>
              ❌ انتهى الاختيار
            </motion.button>
          </motion.main>
        )}

        {/* ══ ELIMINATION ════════════════════════════════════════════════════ */}
        {phase==="elimination" && (
          <motion.main key="elim"
            initial={{opacity:0,scale:.88}} animate={{opacity:1,scale:1}} exit={{opacity:0}}
            className="flex-1 flex flex-col items-center justify-center gap-7 px-5">

            {eliminated ? (
              <>
                <motion.span animate={{scale:[1,1.18,1]}} transition={{duration:1.1,repeat:Infinity}}
                  style={{fontSize:60}}>💥</motion.span>
                <div className="flex flex-col items-center gap-4 text-center">
                  <p className="text-2xl font-bold text-white/45">تم إقصاء</p>
                  <div style={{position:"relative"}}>
                    <img src={eliminated.avatar} alt={eliminated.displayName}
                      style={{width:120,height:120,borderRadius:22,objectFit:"cover",
                        border:"4px solid #f43f5e",boxShadow:"0 0 45px rgba(244,63,94,.75)"}}
                      onError={e=>{(e.target as HTMLImageElement).src=
                        `https://api.dicebear.com/7.x/pixel-art/svg?seed=${eliminated.username}`;}}/>
                    <div style={{position:"absolute",bottom:-10,right:-10,fontSize:28}}>❌</div>
                  </div>
                  <h2 className="text-4xl font-black" style={{color:"#f43f5e",textShadow:"0 0 28px #f43f5e"}}>
                    {eliminated.displayName}
                  </h2>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <Ring sec={cdTimer} total={5} big/>
                  <p className="text-sm opacity-30 text-white">الجولة القادمة تبدأ تلقائياً</p>
                </div>
                <div className="flex flex-wrap justify-center gap-2 max-w-xs">
                  {players.filter(p=>p.username!==eliminated.username).map(p=>(
                    <div key={p.username} className="flex flex-col items-center gap-1">
                      <img src={p.avatar} alt={p.displayName}
                        style={{width:46,height:46,borderRadius:13,objectFit:"cover",
                          border:`2.5px solid ${GOLD}`,boxShadow:`0 0 10px ${GOLD}55`}}
                        onError={e=>{(e.target as HTMLImageElement).src=
                          `https://api.dicebear.com/7.x/pixel-art/svg?seed=${p.username}`;}}/>
                      <span style={{fontSize:9,color:GOLD,fontWeight:700,maxWidth:46,
                        overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                        {p.displayName}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="text-center">
                <span style={{fontSize:56}} className="block mb-3">🤝</span>
                <p style={{color:GOLD}} className="text-2xl font-bold">الجميع وجدوا كرسياً!</p>
              </div>
            )}

            <motion.button onClick={()=>{clrAll();doNextRoundInternal(eliminated);}}
              whileHover={{scale:1.05}} whileTap={{scale:0.97}}
              className="px-10 py-4 rounded-2xl font-black text-base text-black"
              style={{background:`linear-gradient(135deg,${GOLD_LT},${GOLD})`,boxShadow:`0 0 24px ${GOLD}55`}}>
              {(players.length-(eliminated?1:0))<=1?"🏆 عرض الفائز":"▶ الجولة التالية الآن"}
            </motion.button>
          </motion.main>
        )}

        {/* ══ WINNER ═════════════════════════════════════════════════════════ */}
        {phase==="winner" && (
          <motion.main key="win"
            initial={{opacity:0,scale:.8}} animate={{opacity:1,scale:1}} exit={{opacity:0}}
            className="flex-1 flex flex-col items-center justify-center gap-6 px-5">
            <Confetti/>
            <motion.span animate={{y:[0,-24,0]}} transition={{duration:2,repeat:Infinity,ease:"easeInOut"}}
              style={{fontSize:80}}>🏆</motion.span>
            {winner&&(
              <div className="flex flex-col items-center gap-5 text-center">
                <p className="text-2xl font-bold text-white/40">الفائز بلعبة الكراسي الموسيقية</p>
                <div style={{position:"relative"}}>
                  <motion.div animate={{rotate:360}} transition={{duration:6,repeat:Infinity,ease:"linear"}}
                    style={{position:"absolute",inset:-7,borderRadius:26,
                      background:`conic-gradient(${GOLD},#e040fb,#00e5ff,${GOLD})`,filter:"blur(4px)"}}/>
                  <img src={winner.avatar} alt={winner.displayName}
                    style={{position:"relative",width:140,height:140,borderRadius:26,objectFit:"cover",
                      border:`4px solid ${GOLD}`,boxShadow:`0 0 55px ${GOLD}80`}}
                    onError={e=>{(e.target as HTMLImageElement).src=
                      `https://api.dicebear.com/7.x/pixel-art/svg?seed=${winner.username}`;}}/>
                </div>
                <h2 className="text-4xl font-black"
                  style={{color:GOLD_LT,textShadow:`0 0 32px ${GOLD},0 0 64px ${GOLD}70`}}>
                  {winner.displayName}
                </h2>
                <p style={{color:GOLD,opacity:.5}} className="text-base">
                  🎉 بطل لعبة الكراسي الموسيقية 🎉
                </p>
              </div>
            )}
            <div className="flex gap-3 mt-2">
              <motion.button onClick={doRestart} whileHover={{scale:1.05}} whileTap={{scale:0.97}}
                className="flex items-center gap-2 px-8 py-3.5 rounded-2xl font-bold text-sm text-black"
                style={{background:`linear-gradient(135deg,${GOLD_LT},${GOLD})`,boxShadow:`0 0 20px ${GOLD}55`}}>
                <RotateCcw size={15}/> العب مجدداً
              </motion.button>
              <motion.button onClick={()=>navigate("/")} whileHover={{scale:1.05}} whileTap={{scale:0.97}}
                className="flex items-center gap-2 px-8 py-3.5 rounded-2xl font-bold text-sm border"
                style={{color:GOLD,borderColor:`${GOLD}30`,background:`${GOLD}08`}}>
                <ArrowRight size={15}/> الرئيسية
              </motion.button>
            </div>
          </motion.main>
        )}

      </AnimatePresence>
    </div>
  );
}
