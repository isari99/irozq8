import { useState, useRef, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Wifi, WifiOff, Users, RotateCcw, Music2, Play, Square } from "lucide-react";
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

// ─── Songs (confirmed IDs only) ───────────────────────────────────────────────
interface Song { id: string; title: string; artist: string; start: number }
const SONGS: Song[] = [
  { id: "joevqtOJFes", title: "يا طير",          artist: "راشد الماجد",  start: 25 },
  { id: "_nSq4Mtlfno", title: "ندمان",             artist: "نبيل شعيل",    start: 30 },
  { id: "5Gi9Q9P0bVI", title: "يا عمري انا",      artist: "فرقة ميامي",   start: 24 },
  { id: "QUBvVTNRp4Q", title: "بشرة خير",         artist: "حسين الجسمي",  start: 30 },
  { id: "KLJA-srM_yM", title: "نور العين",         artist: "عمرو دياب",    start: 25 },
  { id: "EgmXTmj62ic", title: "تملى معاك",        artist: "عمرو دياب",    start: 35 },
  { id: "a_vfYHbLr7Y", title: "وغلاوتك",          artist: "عمرو دياب",    start: 30 },
  { id: "qzcIKpmEBHo", title: "أخاصمك آه",        artist: "نانسي عجرم",   start: 20 },
  { id: "1nlzrBWh0H8", title: "يا سلام",           artist: "نانسي عجرم",   start: 22 },
  { id: "UFn1-pTQ85s", title: "من نظرة",          artist: "نانسي عجرم",   start: 18 },
  { id: "iOP9PYLICK8", title: "بدنا نولع الجو",   artist: "نانسي عجرم",   start: 18 },
  { id: "jHEYg6VZoOw", title: "يللا",             artist: "نانسي عجرم",   start: 15 },
  { id: "cnxrq_ZOcoY", title: "ابن الجيران",       artist: "نانسي عجرم",   start: 15 },
  { id: "jEGnvYKH18A", title: "لون عيونك",        artist: "نانسي عجرم",   start: 20 },
  { id: "D_hH-bn5dD0", title: "أنا يللي بحبك",    artist: "نانسي عجرم",   start: 22 },
  { id: "WlqefHeYYR0", title: "يا نور العين",      artist: "مطرف المطرف",  start: 32 },
  { id: "z6RC2T3Q7rs", title: "قمرين",             artist: "عمرو دياب",    start: 28 },
  { id: "vZ0OFwpvIv0", title: "شيخ الشباب",       artist: "نانسي عجرم",   start: 20 },
  { id: "dNQMH3WVMNs", title: "قلبي يا قلبي",     artist: "نانسي عجرم",   start: 18 },
  { id: "YRadUqAv7i8", title: "إحساس جديد",       artist: "نانسي عجرم",   start: 22 },
];

// ─── Types ────────────────────────────────────────────────────────────────────
type Phase = "lobby" | "spinning" | "selecting" | "elimination" | "winner";
interface Player { username: string; avatar: string; avatarLoaded: boolean }

const GOLD = "#c8860a";
const GOLD_LIGHT = "#f0b429";
const BROWN_DARK = "#130a02";
const BROWN_MID  = "#261304";
const BROWN_RING = "#3d1f07";
const SELECT_SEC = 20;

function getTwitchAvatar(username: string): string {
  return `https://unavatar.io/twitch/${username}`;
}

// ─── Wheel Component ──────────────────────────────────────────────────────────
function GameWheel({
  spinning,
  players,
  chairCount,
  chairOccupied,
  showChairs,
}: {
  spinning: boolean;
  players: Player[];
  chairCount: number;
  chairOccupied: Record<number, Player>;
  showChairs: boolean;
}) {
  const SIZE = Math.min(window.innerWidth - 40, 380);
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const playerOrbitR = SIZE / 2 - 38;
  const chairOrbitR  = SIZE / 2 - 70;

  // Chair positions inside wheel
  const chairPositions = Array.from({ length: chairCount }, (_, i) => {
    const angle = (i / chairCount) * 2 * Math.PI - Math.PI / 2;
    return {
      num: i + 1,
      x: cx + chairOrbitR * Math.cos(angle),
      y: cy + chairOrbitR * Math.sin(angle),
    };
  });

  return (
    <div style={{ width: SIZE, height: SIZE, position: "relative", flexShrink: 0 }}>

      {/* Glow pulse */}
      <motion.div className="absolute rounded-full"
        animate={{ boxShadow: spinning
          ? [`0 0 40px ${GOLD}60, 0 0 80px ${GOLD}30`, `0 0 60px ${GOLD}90, 0 0 120px ${GOLD}50`, `0 0 40px ${GOLD}60, 0 0 80px ${GOLD}30`]
          : `0 0 20px ${GOLD}30`
        }}
        transition={{ duration: 1.4, repeat: Infinity }}
        style={{ inset: 0, borderRadius: "50%", border: `5px solid ${GOLD}` }} />

      {/* Outer decorative ring (slow orbit) */}
      <div className={spinning ? "chairs-orbit-slow" : ""}
        style={{ position: "absolute", inset: 8, borderRadius: "50%",
          background: `conic-gradient(transparent,${GOLD}18,transparent,${GOLD}12,transparent,${GOLD}18,transparent)` }} />

      {/* Main disc */}
      <div style={{
        position: "absolute", inset: 12, borderRadius: "50%",
        background: `radial-gradient(circle at 38% 32%, ${BROWN_RING}, ${BROWN_DARK} 68%)`,
        boxShadow: `inset 0 0 60px rgba(0,0,0,0.85)`,
        border: `2px solid ${GOLD}22`,
      }}>
        {/* Inner dot-pattern */}
        <svg style={{ position:"absolute", inset:0, width:"100%", height:"100%", opacity:0.07, borderRadius:"50%" }}>
          <defs>
            <pattern id="cg-dots" x="0" y="0" width="18" height="18" patternUnits="userSpaceOnUse">
              <circle cx="9" cy="9" r="1.5" fill={GOLD} />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#cg-dots)" />
        </svg>
        {/* Inner ring lines */}
        <div style={{ position:"absolute", inset:16, borderRadius:"50%", border:`1px solid ${GOLD}20` }} />
        <div style={{ position:"absolute", inset:30, borderRadius:"50%", border:`1px solid ${GOLD}12` }} />
      </div>

      {/* Orbiting player ring */}
      <div className={spinning ? "chairs-orbit" : ""}
        style={{ position: "absolute", inset: 0 }}>
        {players.map((p, i) => {
          const angle = (i / players.length) * 360;
          const rad   = (angle * Math.PI) / 180;
          const px = cx + playerOrbitR * Math.cos(rad - Math.PI / 2);
          const py = cy + playerOrbitR * Math.sin(rad - Math.PI / 2);
          const isSeated = Object.values(chairOccupied).some(x => x.username === p.username);
          return (
            <div key={p.username}
              style={{ position: "absolute", left: px - 22, top: py - 22, width: 44, height: 44 }}>
              <div className={spinning ? "chairs-counter" : ""}
                style={{ width: "100%", height: "100%" }}>
                <div style={{
                  width: 44, height: 44, borderRadius: "50%", overflow: "hidden",
                  border: `3px solid ${isSeated ? GOLD_LIGHT : GOLD}`,
                  boxShadow: isSeated ? `0 0 16px ${GOLD}` : `0 0 8px ${GOLD}50`,
                  opacity: (!showChairs || isSeated) ? 1 : 0.4,
                  transition: "all 0.3s",
                }}>
                  <img src={p.avatar} alt={p.username}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    onError={e => {
                      (e.target as HTMLImageElement).src =
                        `https://api.dicebear.com/7.x/pixel-art/svg?seed=${p.username}`;
                    }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Center: music icon while spinning */}
      <AnimatePresence>
        {spinning && (
          <motion.div key="music" initial={{ opacity:0, scale:0.5 }} animate={{ opacity:1, scale:1 }}
            exit={{ opacity:0, scale:0.5 }}
            style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
            <motion.div animate={{ scale:[1,1.25,1], rotate:[0,12,-12,0] }}
              transition={{ duration:0.8, repeat:Infinity }}
              style={{ fontSize:38 }}>🎵</motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Center: chairs when selecting */}
      <AnimatePresence>
        {showChairs && !spinning && (
          <motion.div key="chairs" initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
            style={{ position:"absolute", inset:0 }}>
            {chairPositions.map(({ num, x, y }) => {
              const player = chairOccupied[num];
              return (
                <motion.div key={num}
                  initial={{ scale:0, opacity:0 }}
                  animate={{ scale:1, opacity:1 }}
                  transition={{ delay: num * 0.08, type:"spring", stiffness:350 }}
                  style={{ position:"absolute", left:x-24, top:y-24, width:48, textAlign:"center" }}>
                  <div style={{
                    width:48, height:48, borderRadius:14, overflow:"hidden",
                    border:`2.5px solid ${player ? GOLD_LIGHT : GOLD + "40"}`,
                    background: player ? `${GOLD}18` : `${BROWN_MID}cc`,
                    boxShadow: player ? `0 0 16px ${GOLD}70` : "none",
                    display:"flex", alignItems:"center", justifyContent:"center",
                    transition:"all 0.3s",
                  }}>
                    {player
                      ? <img src={player.avatar} alt={player.username}
                          style={{ width:"100%", height:"100%", objectFit:"cover" }}
                          onError={e=>{(e.target as HTMLImageElement).src=`https://api.dicebear.com/7.x/pixel-art/svg?seed=${player.username}`;}} />
                      : <span style={{ fontWeight:900, fontSize:16, color: GOLD_LIGHT }}>{num}</span>}
                  </div>
                  {player && (
                    <div style={{ fontSize:8, color:GOLD, marginTop:2, fontWeight:700,
                      whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", maxWidth:48 }}>
                      {player.username}
                    </div>
                  )}
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top ornament */}
      <div style={{ position:"absolute", top:2, left:"50%", transform:"translateX(-50%)" }}>
        <div style={{ width:12, height:12, background:GOLD, transform:"rotate(45deg)", boxShadow:`0 0 10px ${GOLD}` }} />
      </div>
    </div>
  );
}

// ─── Confetti ─────────────────────────────────────────────────────────────────
const C_COLORS = [GOLD, "#e040fb", "#00e5ff", "#22c55e", "#f43f5e", "#fbbf24"];
function Confetti() {
  return (
    <div style={{ position:"fixed", inset:0, pointerEvents:"none", zIndex:50, overflow:"hidden" }}>
      {Array.from({length:60}).map((_,i)=>(
        <motion.div key={i} style={{
          position:"absolute", borderRadius:2,
          width: Math.random()*8+5, height: Math.random()*8+5,
          left:`${Math.random()*100}%`, top:-14,
          background:C_COLORS[i%C_COLORS.length],
        }}
          animate={{y:["0vh","115vh"], rotate:[0,(Math.random()>0.5?1:-1)*720], opacity:[1,0.8,0]}}
          transition={{duration:Math.random()*2.5+1.5, delay:Math.random()*1.5, ease:"linear"}} />
      ))}
    </div>
  );
}

// ─── Selection timer ring ─────────────────────────────────────────────────────
function TimerRing({ sec, total }: { sec:number; total:number }) {
  const r = 20; const circ = 2*Math.PI*r;
  const dash = circ*(sec/total);
  const urgent = sec <= 5;
  return (
    <svg width="52" height="52" viewBox="0 0 52 52">
      <circle cx="26" cy="26" r={r} fill="none" stroke={`${GOLD}20`} strokeWidth="3.5"/>
      <circle cx="26" cy="26" r={r} fill="none"
        stroke={urgent ? "#f43f5e" : GOLD} strokeWidth="3.5"
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        style={{transform:"rotate(-90deg)",transformOrigin:"center",transition:"stroke-dasharray 0.9s linear"}}/>
      <text x="26" y="31" textAnchor="middle" fontSize="13" fontWeight="900"
        fill={urgent ? "#f43f5e" : GOLD}>{sec}</text>
    </svg>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function ChairsGame() {
  const [, navigate] = useLocation();
  const { user } = useAuth();

  const [phase, setPhase]               = useState<Phase>("lobby");
  const [players, setPlayers]           = useState<Player[]>([]);
  const [roundNum, setRoundNum]         = useState(1);
  const [chairOccupied, setChairOccupied] = useState<Record<number,Player>>({});
  const [eliminated, setEliminated]     = useState<Player|null>(null);
  const [winner, setWinner]             = useState<Player|null>(null);
  const [connected, setConnected]       = useState(false);
  const [currentSong, setCurrentSong]   = useState<Song|null>(null);
  const [showChairs, setShowChairs]     = useState(false);
  const [selTimer, setSelTimer]         = useState(SELECT_SEC);
  const [cdTimer, setCdTimer]           = useState(5);
  const [spinning, setSpinning]         = useState(false);

  const phaseRef   = useRef<Phase>("lobby");
  const playersRef = useRef<Player[]>([]);
  const chairRef   = useRef<Record<number,Player>>({});
  const ytRef      = useRef<any>(null);
  const ytDivRef   = useRef<HTMLDivElement>(null);
  const songIdxRef = useRef(0);
  const selRef     = useRef<ReturnType<typeof setInterval>|null>(null);
  const cdRef      = useRef<ReturnType<typeof setInterval>|null>(null);
  const connRef    = useRef(false);

  useEffect(()=>{ phaseRef.current=phase; },[phase]);
  useEffect(()=>{ playersRef.current=players; },[players]);
  useEffect(()=>{ chairRef.current=chairOccupied; },[chairOccupied]);

  const numChairs = Math.max(players.length-1,1);

  const clearIntervals = () => {
    if (selRef.current) { clearInterval(selRef.current); selRef.current=null; }
    if (cdRef.current)  { clearInterval(cdRef.current);  cdRef.current=null; }
  };

  // ── YouTube setup ────────────────────────────────────────────────────────
  useEffect(()=>{
    loadYT().then(()=>{
      if (!ytDivRef.current || ytRef.current) return;
      ytRef.current = new window.YT.Player(ytDivRef.current, {
        width:"1", height:"1",
        playerVars:{ autoplay:0, controls:0, fs:0, modestbranding:1, rel:0, playsinline:1 },
        events:{ onReady:()=>{} },
      });
    });
    return ()=>{ clearIntervals(); try{ytRef.current?.destroy();}catch{} ytRef.current=null; };
  },[]);

  // ── Play music ────────────────────────────────────────────────────────────
  const playMusic = useCallback(()=>{
    const shuffled=[...SONGS].sort(()=>Math.random()-0.5);
    const song=shuffled[songIdxRef.current%shuffled.length];
    songIdxRef.current++;
    setCurrentSong(song);
    try{ ytRef.current?.loadVideoById?.({videoId:song.id, startSeconds:song.start}); }catch{}
  },[]);

  const stopMusic = useCallback(()=>{
    try{ ytRef.current?.pauseVideo?.(); }catch{}
    setCurrentSong(null);
  },[]);

  // ── Start spin ────────────────────────────────────────────────────────────
  const doStartSpin = useCallback((pl?:Player[])=>{
    const cur = pl ?? playersRef.current;
    if (cur.length<2) return;
    clearIntervals();
    const empty:Record<number,Player>={};
    setChairOccupied(empty); chairRef.current=empty;
    setEliminated(null);
    setShowChairs(false);
    setSpinning(true);
    phaseRef.current="spinning"; setPhase("spinning");
    playMusic();
  },[playMusic]);

  // ── Stop spin → show chairs ───────────────────────────────────────────────
  const doStopSpin = useCallback(()=>{
    clearIntervals();
    stopMusic();
    setSpinning(false);
    setShowChairs(true);
    phaseRef.current="selecting"; setPhase("selecting");

    let t=SELECT_SEC; setSelTimer(t);
    selRef.current=setInterval(()=>{
      t-=1; setSelTimer(t);
      if(t<=0){ clearInterval(selRef.current!); selRef.current=null; doEliminate(); }
    },1000);
  },[stopMusic]);

  // ── Eliminate ─────────────────────────────────────────────────────────────
  const doEliminate = useCallback(()=>{
    clearIntervals();
    const cur=playersRef.current;
    const occ=chairRef.current;
    const seated=new Set(Object.values(occ).map(p=>p.username));
    const out=cur.filter(p=>!seated.has(p.username));
    const eli=out.length>0?out[Math.floor(Math.random()*out.length)]:null;
    setEliminated(eli);
    setSpinning(false);
    phaseRef.current="elimination"; setPhase("elimination");

    let cd=5; setCdTimer(cd);
    cdRef.current=setInterval(()=>{
      cd-=1; setCdTimer(cd);
      if(cd<=0){ clearInterval(cdRef.current!); cdRef.current=null; doNextRound(eli); }
    },1000);
  },[]);

  // ── Next round ────────────────────────────────────────────────────────────
  const doNextRound = useCallback((eli:Player|null)=>{
    clearIntervals();
    const cur=playersRef.current;
    const remaining=cur.filter(p=>p.username!==eli?.username);
    playersRef.current=remaining;
    if(remaining.length<=1){
      setWinner(remaining[0]??null);
      setPlayers(remaining);
      phaseRef.current="winner"; setPhase("winner");
    } else {
      setPlayers(remaining);
      setRoundNum(r=>r+1);
      setTimeout(()=>doStartSpin(remaining),200);
    }
  },[doStartSpin]);

  // ── Restart ───────────────────────────────────────────────────────────────
  const doRestart = ()=>{
    clearIntervals(); stopMusic();
    setPlayers([]); playersRef.current=[];
    setChairOccupied({}); chairRef.current={};
    setEliminated(null); setWinner(null); setRoundNum(1);
    setShowChairs(false); setSpinning(false);
    phaseRef.current="lobby"; setPhase("lobby");
  };

  // ── Chat logic ────────────────────────────────────────────────────────────
  const handleChat = useCallback((username:string, text:string)=>{
    const msg=text.trim().toLowerCase();
    const ph=phaseRef.current;
    const pl=playersRef.current;

    if(msg==="join" && ph==="lobby"){
      if(pl.some(p=>p.username===username)) return;
      const np:Player={ username, avatar:getTwitchAvatar(username), avatarLoaded:false };
      setPlayers(prev=>{ const n=[...prev,np]; playersRef.current=n; return n; });
      return;
    }
    if((msg==="start game"||msg==="startgame") && ph==="lobby"){
      if(pl.length>=2) doStartSpin(pl);
      return;
    }
    if(ph==="selecting"){
      const num=parseInt(msg,10);
      const occ=chairRef.current;
      const cur=playersRef.current;
      const max=cur.length-1;
      if(isNaN(num)||num<1||num>max) return;
      if(occ[num]) return;
      const p=cur.find(x=>x.username===username);
      if(!p) return;
      if(Object.values(occ).some(x=>x.username===username)) return;
      setChairOccupied(prev=>{
        const n={...prev,[num]:p}; chairRef.current=n;
        if(Object.keys(n).length>=cur.length-1){
          setTimeout(()=>doEliminate(),600);
        }
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
      ws.onopen=()=>{
        ws.send("PASS SCHMOOPIIE");
        ws.send(`NICK justinfan${Math.floor(Math.random()*89999)+10000}`);
        ws.send(`JOIN #${ch}`);
      };
      ws.onmessage=e=>{
        const lines=(e.data as string).split("\r\n").filter(Boolean);
        for(const line of lines){
          if(line.startsWith("PING")){ ws.send("PONG :tmi.twitch.tv"); continue; }
          if(line.includes("366")||line.includes("ROOMSTATE")){ setConnected(true); continue; }
          const m=line.match(/^(?:@[^ ]+ )?:(\w+)!\w+@\w+\.tmi\.twitch\.tv PRIVMSG #\w+ :(.+)$/);
          if(m) handleChat(m[1],m[2].trim());
        }
      };
      ws.onclose=()=>setConnected(false);
    },80);
  }

  // ─── Shared header ─────────────────────────────────────────────────────────
  const Header = ()=>(
    <header style={{ background:`${BROWN_DARK}f5`, backdropFilter:"blur(16px)",
      borderBottom:`1px solid ${GOLD}20` }}
      className="flex items-center justify-between px-5 py-3 flex-shrink-0 z-20">
      <button onClick={()=>{ clearIntervals(); stopMusic(); navigate("/"); }}
        className="flex items-center gap-1.5 text-sm transition-opacity opacity-50 hover:opacity-100"
        style={{ color:GOLD }}>
        <ArrowRight size={14}/><span>رجوع</span>
      </button>
      <div className="flex items-center gap-2">
        <span style={{fontSize:18}}>🪑</span>
        <span className="font-black text-base" style={{color:GOLD,textShadow:`0 0 16px ${GOLD}80`}}>
          لعبة الكراسي{roundNum>1?` — ج${roundNum}`:""}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        {connected?<Wifi size={12} className="text-green-400"/>:<WifiOff size={12} style={{color:"rgba(255,80,80,0.5)"}}/>}
        <span className="text-xs" style={{color:connected?"#4ade80":"rgba(255,80,80,0.5)"}}>
          {connected?user?.username:"غير متصل"}
        </span>
      </div>
    </header>
  );

  return (
    <div className="h-screen flex flex-col overflow-hidden relative" dir="rtl"
      style={{background:`radial-gradient(ellipse at 30% 20%, #241104 0%, ${BROWN_DARK} 65%)`}}>

      {/* bg glow */}
      <div style={{position:"absolute",inset:0,pointerEvents:"none"}}>
        <div style={{position:"absolute",top:0,right:0,width:320,height:320,borderRadius:"50%",opacity:.09,
          background:`radial-gradient(circle,${GOLD},transparent)`,filter:"blur(80px)"}}/>
        <div style={{position:"absolute",bottom:0,left:0,width:320,height:320,borderRadius:"50%",opacity:.05,
          background:`radial-gradient(circle,${GOLD},transparent)`,filter:"blur(80px)"}}/>
      </div>

      {/* Hidden YouTube */}
      <div style={{position:"absolute",opacity:0,pointerEvents:"none",width:1,height:1,overflow:"hidden"}}>
        <div ref={ytDivRef}/>
      </div>

      <Header/>

      <AnimatePresence mode="wait">

        {/* ══ LOBBY ══════════════════════════════════════════════════════════ */}
        {phase==="lobby" && (
          <motion.main key="lobby"
            initial={{opacity:0,y:16}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-16}}
            className="flex-1 overflow-y-auto flex flex-col items-center py-6 px-5 gap-5">

            {/* join banner */}
            <div className="w-full max-w-md rounded-2xl p-5 text-center"
              style={{background:`${BROWN_MID}90`,border:`1.5px solid ${GOLD}40`,boxShadow:`0 0 30px ${GOLD}22`}}>
              <p className="text-3xl font-black mb-2" style={{color:GOLD,letterSpacing:1}}>
                اكتب <span style={{textDecoration:"underline",textUnderlineOffset:4}}>join</span> في الشات
              </p>
              <p className="text-sm text-white/40">للانضمام إلى لعبة الكراسي الموسيقية 🎵</p>
            </div>

            {/* Player count bar */}
            <div className="w-full max-w-md flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users size={15} style={{color:GOLD}}/>
                <span className="font-bold text-sm" style={{color:GOLD}}>اللاعبون</span>
              </div>
              <span className="text-xs font-black px-3 py-1 rounded-full"
                style={{background:`${GOLD}18`,color:GOLD,border:`1px solid ${GOLD}30`}}>
                {players.length} لاعب
              </span>
            </div>

            {/* Player cards */}
            <div className="w-full max-w-md">
              {players.length===0 ? (
                <div className="text-center py-14 rounded-2xl border border-dashed"
                  style={{borderColor:`${GOLD}18`}}>
                  <span className="text-5xl opacity-20 block mb-3">🪑</span>
                  <p className="text-sm opacity-30" style={{color:GOLD}}>لم ينضم أحد بعد...</p>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-3">
                  {players.map((p,i)=>(
                    <motion.div key={p.username}
                      initial={{opacity:0,scale:0.8}} animate={{opacity:1,scale:1}}
                      transition={{delay:i*0.04}}
                      className="flex flex-col items-center gap-2 p-3 rounded-2xl"
                      style={{background:`${BROWN_MID}80`,border:`1.5px solid ${GOLD}25`,
                        boxShadow:`0 0 12px ${GOLD}12`}}>
                      <div style={{width:60,height:60,borderRadius:"50%",overflow:"hidden",
                        border:`3px solid ${GOLD}`,boxShadow:`0 0 14px ${GOLD}50`,flexShrink:0}}>
                        <img src={p.avatar} alt={p.username}
                          style={{width:"100%",height:"100%",objectFit:"cover"}}
                          onError={e=>{(e.target as HTMLImageElement).src=
                            `https://api.dicebear.com/7.x/pixel-art/svg?seed=${p.username}`;}}/>
                      </div>
                      <span className="text-xs font-bold text-center truncate w-full" style={{color:GOLD}}>
                        {p.username}
                      </span>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>

            {/* Start btn */}
            <div className="w-full max-w-md">
              <motion.button
                onClick={()=>doStartSpin()}
                disabled={players.length<2}
                whileHover={players.length>=2?{scale:1.03}:{}}
                whileTap={players.length>=2?{scale:0.97}:{}}
                className="w-full py-5 rounded-2xl font-black text-lg text-black"
                style={{
                  background:players.length>=2?`linear-gradient(135deg,${GOLD_LIGHT},${GOLD},#8a5500)`:"rgba(255,255,255,0.05)",
                  color:players.length>=2?"#000":"rgba(255,255,255,0.2)",
                  boxShadow:players.length>=2?`0 0 36px ${GOLD}50`:"none",
                  border:`1px solid ${players.length>=2?GOLD:"rgba(255,255,255,0.06)"}`,
                  cursor:players.length>=2?"pointer":"not-allowed",
                  fontSize:18,
                }}>
                {players.length>=2?`▶ ابدأ اللعبة (${players.length} لاعبين)`:`يلزم لاعبين أو أكثر`}
              </motion.button>
            </div>
          </motion.main>
        )}

        {/* ══ SPINNING ═══════════════════════════════════════════════════════ */}
        {phase==="spinning" && (
          <motion.main key="spinning"
            initial={{opacity:0,scale:0.95}} animate={{opacity:1,scale:1}} exit={{opacity:0}}
            className="flex-1 flex flex-col items-center justify-center gap-5 px-4 py-4">

            <div className="text-center">
              <p className="text-xl font-black text-white/70">الجولة {roundNum}</p>
              <p className="text-sm opacity-40" style={{color:GOLD}}>{players.length} لاعبين</p>
            </div>

            <GameWheel spinning={true} players={players}
              chairCount={numChairs} chairOccupied={{}} showChairs={false}/>

            {/* Now playing */}
            {currentSong && (
              <motion.div initial={{opacity:0,y:6}} animate={{opacity:1,y:0}}
                className="flex items-center gap-2 px-4 py-2 rounded-full"
                style={{background:`${GOLD}12`,border:`1px solid ${GOLD}35`}}>
                <motion.div animate={{scale:[1,1.3,1]}} transition={{duration:0.7,repeat:Infinity}}>
                  <Music2 size={13} style={{color:GOLD}}/>
                </motion.div>
                <span className="text-sm font-bold" style={{color:GOLD}}>
                  {currentSong.title} — {currentSong.artist}
                </span>
              </motion.div>
            )}

            {/* Stop btn */}
            <motion.button onClick={doStopSpin}
              whileHover={{scale:1.06}} whileTap={{scale:0.96}}
              animate={{boxShadow:[`0 0 20px ${GOLD}50`,`0 0 45px ${GOLD}80`,`0 0 20px ${GOLD}50`]}}
              transition={{duration:1.3,repeat:Infinity}}
              className="flex items-center gap-3 px-10 py-4 rounded-2xl font-black text-lg text-black"
              style={{background:`linear-gradient(135deg,${GOLD_LIGHT},${GOLD},#8a5500)`}}>
              <Square size={18}/> أوقف العجلة
            </motion.button>
          </motion.main>
        )}

        {/* ══ SELECTING ══════════════════════════════════════════════════════ */}
        {phase==="selecting" && (
          <motion.main key="selecting"
            initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} exit={{opacity:0}}
            className="flex-1 overflow-y-auto flex flex-col items-center gap-4 px-4 py-4">

            {/* Header */}
            <div className="text-center flex items-center gap-3">
              <div>
                <h3 className="text-xl font-black text-white/90">اختر كرسيك!</h3>
                <p className="text-xs opacity-40 text-white mt-0.5">
                  اكتب رقم الكرسي في الشات (1 – {numChairs})
                </p>
              </div>
              <TimerRing sec={selTimer} total={SELECT_SEC}/>
            </div>

            <GameWheel spinning={false} players={players}
              chairCount={numChairs} chairOccupied={chairOccupied} showChairs={true}/>

            {/* Unseated */}
            <div className="w-full max-w-md">
              <p className="text-xs opacity-30 text-white text-center mb-2">لم يختاروا بعد:</p>
              <div className="flex flex-wrap justify-center gap-2">
                {players
                  .filter(p=>!Object.values(chairOccupied).some(x=>x.username===p.username))
                  .map(p=>(
                    <div key={p.username} className="flex items-center gap-2 px-3 py-1.5 rounded-xl"
                      style={{background:`${GOLD}08`,border:`1px solid ${GOLD}20`}}>
                      <img src={p.avatar} alt={p.username}
                        style={{width:24,height:24,borderRadius:"50%",objectFit:"cover",border:`1.5px solid ${GOLD}40`}}
                        onError={e=>{(e.target as HTMLImageElement).src=`https://api.dicebear.com/7.x/pixel-art/svg?seed=${p.username}`;}}/>
                      <span className="text-xs font-bold" style={{color:GOLD}}>{p.username}</span>
                    </div>
                  ))}
              </div>
            </div>

            <motion.button onClick={doEliminate}
              whileHover={{scale:1.04}} whileTap={{scale:0.97}}
              className="px-8 py-3.5 rounded-2xl font-black text-sm text-black"
              style={{background:`linear-gradient(135deg,${GOLD_LIGHT},${GOLD})`,boxShadow:`0 0 20px ${GOLD}50`}}>
              ❌ انتهى الاختيار
            </motion.button>
          </motion.main>
        )}

        {/* ══ ELIMINATION ════════════════════════════════════════════════════ */}
        {phase==="elimination" && (
          <motion.main key="elim"
            initial={{opacity:0,scale:0.88}} animate={{opacity:1,scale:1}} exit={{opacity:0}}
            className="flex-1 flex flex-col items-center justify-center gap-7 px-5">

            {eliminated ? (
              <>
                <motion.span animate={{scale:[1,1.2,1]}} transition={{duration:1.1,repeat:Infinity}}
                  style={{fontSize:60}}>💥</motion.span>
                <div className="flex flex-col items-center gap-3 text-center">
                  <p className="text-xl font-bold text-white/50">تم إقصاء</p>
                  <div className="relative">
                    <img src={eliminated.avatar} alt={eliminated.username}
                      style={{width:110,height:110,borderRadius:20,objectFit:"cover",
                        border:"4px solid #f43f5e",boxShadow:"0 0 40px rgba(244,63,94,0.75)"}}
                      onError={e=>{(e.target as HTMLImageElement).src=`https://api.dicebear.com/7.x/pixel-art/svg?seed=${eliminated.username}`;}}/>
                    <div style={{position:"absolute",bottom:-8,right:-8,fontSize:26}}>❌</div>
                  </div>
                  <h2 className="text-3xl font-black" style={{color:"#f43f5e",textShadow:"0 0 24px #f43f5e"}}>
                    {eliminated.username}
                  </h2>
                </div>

                <div className="flex flex-col items-center gap-1.5">
                  <TimerRing sec={cdTimer} total={5}/>
                  <p className="text-xs opacity-30 text-white">الجولة القادمة تبدأ تلقائياً</p>
                </div>

                <div className="flex flex-wrap justify-center gap-2">
                  {players.filter(p=>p.username!==eliminated.username).map((p,i)=>(
                    <div key={p.username} className="flex flex-col items-center gap-1">
                      <img src={p.avatar} alt={p.username}
                        style={{width:42,height:42,borderRadius:12,objectFit:"cover",
                          border:`2px solid ${GOLD}`,boxShadow:`0 0 10px ${GOLD}50`}}
                        onError={e=>{(e.target as HTMLImageElement).src=`https://api.dicebear.com/7.x/pixel-art/svg?seed=${p.username}`;}}/>
                      <span style={{fontSize:9,color:GOLD,fontWeight:700,maxWidth:42,
                        overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                        {p.username}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="text-center">
                <span style={{fontSize:48}} className="block mb-3">🤝</span>
                <p style={{color:GOLD}} className="text-xl font-bold">الجميع وجدوا كرسياً!</p>
              </div>
            )}

            <motion.button onClick={()=>{clearIntervals();doNextRound(eliminated);}}
              whileHover={{scale:1.05}} whileTap={{scale:0.97}}
              className="px-9 py-3.5 rounded-2xl font-black text-sm text-black"
              style={{background:`linear-gradient(135deg,${GOLD_LIGHT},${GOLD})`,boxShadow:`0 0 22px ${GOLD}55`}}>
              {(players.length-(eliminated?1:0))<=1?"🏆 عرض الفائز":"▶ الجولة التالية الآن"}
            </motion.button>
          </motion.main>
        )}

        {/* ══ WINNER ═════════════════════════════════════════════════════════ */}
        {phase==="winner" && (
          <motion.main key="winner"
            initial={{opacity:0,scale:0.8}} animate={{opacity:1,scale:1}} exit={{opacity:0}}
            className="flex-1 flex flex-col items-center justify-center gap-6 px-5">
            <Confetti/>
            <motion.span animate={{y:[0,-22,0]}} transition={{duration:2,repeat:Infinity,ease:"easeInOut"}}
              style={{fontSize:72}}>🏆</motion.span>
            {winner&&(
              <div className="flex flex-col items-center gap-4 text-center">
                <p className="text-2xl font-bold text-white/50">الفائز</p>
                <div style={{position:"relative"}}>
                  <motion.div animate={{rotate:360}} transition={{duration:6,repeat:Infinity,ease:"linear"}}
                    style={{position:"absolute",inset:-6,borderRadius:24,
                      background:`conic-gradient(${GOLD},#e040fb,#00e5ff,${GOLD})`,filter:"blur(4px)"}}/>
                  <img src={winner.avatar} alt={winner.username}
                    style={{position:"relative",width:130,height:130,borderRadius:24,objectFit:"cover",
                      border:`4px solid ${GOLD}`,boxShadow:`0 0 50px ${GOLD}80`}}
                    onError={e=>{(e.target as HTMLImageElement).src=`https://api.dicebear.com/7.x/pixel-art/svg?seed=${winner.username}`;}}/>
                </div>
                <h2 className="text-4xl font-black"
                  style={{color:GOLD_LIGHT,textShadow:`0 0 30px ${GOLD},0 0 60px ${GOLD}70`}}>
                  {winner.username}
                </h2>
                <p style={{color:GOLD,opacity:0.5}} className="text-sm">🎉 بطل الكراسي الموسيقية 🎉</p>
              </div>
            )}
            <div className="flex gap-3 mt-2">
              <motion.button onClick={doRestart} whileHover={{scale:1.05}} whileTap={{scale:0.97}}
                className="flex items-center gap-2 px-7 py-3 rounded-xl font-bold text-sm text-black"
                style={{background:`linear-gradient(135deg,${GOLD_LIGHT},${GOLD})`,boxShadow:`0 0 18px ${GOLD}50`}}>
                <RotateCcw size={14}/> العب مجدداً
              </motion.button>
              <motion.button onClick={()=>navigate("/")} whileHover={{scale:1.05}} whileTap={{scale:0.97}}
                className="flex items-center gap-2 px-7 py-3 rounded-xl font-bold text-sm border"
                style={{color:GOLD,borderColor:`${GOLD}30`,background:`${GOLD}08`}}>
                <ArrowRight size={14}/> الرئيسية
              </motion.button>
            </div>
          </motion.main>
        )}

      </AnimatePresence>
    </div>
  );
}
