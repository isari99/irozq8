import { useState, useRef, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Wifi, WifiOff, Users, Music2, RotateCcw } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

// ─── Song bank (subset for spinning music) ───────────────────────────────────
interface SongEntry { youtubeId: string; title: string; artist: string; startSec: number }
const SPIN_SONGS: SongEntry[] = [
  { youtubeId: "QUBvVTNRp4Q", title: "بشرة خير",        artist: "حسين الجسمي",  startSec: 30  },
  { youtubeId: "KLJA-srM_yM", title: "نور العين",        artist: "عمرو دياب",    startSec: 25  },
  { youtubeId: "qzcIKpmEBHo", title: "أخاصمك آه",        artist: "نانسي عجرم",   startSec: 20  },
  { youtubeId: "1nlzrBWh0H8", title: "يا سلام",          artist: "نانسي عجرم",   startSec: 22  },
  { youtubeId: "joevqtOJFes", title: "يا طير",           artist: "راشد الماجد",  startSec: 28  },
  { youtubeId: "EgmXTmj62ic", title: "تملى معاك",        artist: "عمرو دياب",    startSec: 35  },
  { youtubeId: "WlqefHeYYR0", title: "يا نور العين",     artist: "مطرف",          startSec: 32  },
  { youtubeId: "iOP9PYLICK8", title: "بدنا نولع الجو",   artist: "نانسي عجرم",   startSec: 18  },
  { youtubeId: "jHEYg6VZoOw", title: "يللا",             artist: "نانسي عجرم",   startSec: 15  },
  { youtubeId: "5Gi9Q9P0bVI", title: "يا عمري انا",      artist: "فرقة ميامي",   startSec: 24  },
];

// ─── YouTube API ──────────────────────────────────────────────────────────────
declare global {
  interface Window { YT: any; onYouTubeIframeAPIReady?: () => void; _ytReady?: boolean }
}
let _ytPromise: Promise<void> | null = null;
function loadYT(): Promise<void> {
  if (_ytPromise) return _ytPromise;
  _ytPromise = new Promise(res => {
    if (window._ytReady && window.YT?.Player) { res(); return; }
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      window._ytReady = true;
      prev?.();
      res();
    };
    if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
      const s = document.createElement("script");
      s.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(s);
    }
  });
  return _ytPromise;
}

// ─── Neon colors ──────────────────────────────────────────────────────────────
const NEONS = ["#e040fb","#00e5ff","#ffd600","#ff6d00","#22c55e","#f43f5e","#818cf8","#fb923c"];

// ─── Types ────────────────────────────────────────────────────────────────────
type Phase = "lobby" | "spinning" | "selecting" | "elimination" | "winner";

interface Player { username: string; displayName: string; avatar: string }

// ─── Wheel SVG ────────────────────────────────────────────────────────────────
function WheelSVG({ spinning }: { spinning: boolean }) {
  const S = 260; const cx = S / 2; const cy = S / 2; const r = S / 2 - 6;
  const N = 12; const step = (2 * Math.PI) / N;
  const ICONS = ["🎵","⭐","🎶","✨","🎸","💫","🎺","🌟","🎻","🔥","🎷","🎤"];
  return (
    <motion.div
      animate={spinning ? { rotate: 360 } : { rotate: 0 }}
      transition={spinning
        ? { duration: 1.1, repeat: Infinity, ease: "linear" }
        : { duration: 0.5, ease: "easeOut" }}
      style={{ width: S, height: S, willChange: "transform", flexShrink: 0 }}>
      <svg width={S} height={S} viewBox={`0 0 ${S} ${S}`}>
        <defs>
          {NEONS.map((c, i) => (
            <radialGradient key={i} id={`wg${i}`} cx="50%" cy="50%" r="80%">
              <stop offset="0%" stopColor={c} stopOpacity="0.9" />
              <stop offset="100%" stopColor={c} stopOpacity="0.65" />
            </radialGradient>
          ))}
        </defs>
        {Array.from({ length: N }).map((_, i) => {
          const a0 = i * step - Math.PI / 2;
          const a1 = a0 + step;
          const x1 = cx + r * Math.cos(a0), y1 = cy + r * Math.sin(a0);
          const x2 = cx + r * Math.cos(a1), y2 = cy + r * Math.sin(a1);
          const mx = cx + r * 0.62 * Math.cos(a0 + step / 2);
          const my = cy + r * 0.62 * Math.sin(a0 + step / 2);
          return (
            <g key={i}>
              <path d={`M${cx},${cy} L${x1},${y1} A${r},${r} 0 0,1 ${x2},${y2} Z`}
                fill={`url(#wg${i % NEONS.length})`} stroke="#06000f" strokeWidth="2" />
              <text x={mx} y={my} textAnchor="middle" dominantBaseline="middle"
                fontSize="13" style={{ userSelect: "none" }}>{ICONS[i]}</text>
            </g>
          );
        })}
        <circle cx={cx} cy={cy} r="24" fill="#06000f" stroke="#e040fb" strokeWidth="3" />
        <circle cx={cx} cy={cy} r="10" fill="#e040fb" style={{ filter: "drop-shadow(0 0 8px #e040fb)" }} />
      </svg>
    </motion.div>
  );
}

// ─── Pointer ──────────────────────────────────────────────────────────────────
function Pointer() {
  return (
    <div className="absolute -top-1 left-1/2 -translate-x-1/2 z-10" style={{ filter: "drop-shadow(0 0 6px #e040fb)" }}>
      <div style={{ width:0, height:0,
        borderLeft:"10px solid transparent", borderRight:"10px solid transparent",
        borderTop:"26px solid #e040fb" }} />
    </div>
  );
}

// ─── Chair tile ───────────────────────────────────────────────────────────────
function ChairTile({ num, player }: { num: number; player: Player | null }) {
  const color = NEONS[(num - 1) % NEONS.length];
  return (
    <motion.div
      initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
      transition={{ delay: num * 0.06, type: "spring", stiffness: 300 }}
      className="flex flex-col items-center gap-1.5">
      <div className="relative w-[72px] h-[72px] rounded-2xl border-2 flex items-center justify-center overflow-hidden"
        style={{
          borderColor: player ? color : `${color}30`,
          background: player ? `${color}18` : "rgba(255,255,255,0.03)",
          boxShadow: player ? `0 0 18px ${color}40` : "none",
          transition: "all 0.3s",
        }}>
        {player
          ? <img src={player.avatar} alt={player.displayName}
              className="w-full h-full object-cover"
              onError={e => { (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${player.username}`; }} />
          : <span className="text-3xl opacity-20">🪑</span>}
        <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black"
          style={{ background: color, color: "#000" }}>{num}</div>
      </div>
      <span className="text-[11px] font-bold truncate max-w-[72px] text-center leading-tight"
        style={{ color: player ? color : "rgba(255,255,255,0.2)" }}>
        {player ? player.displayName : `كرسي ${num}`}
      </span>
    </motion.div>
  );
}

// ─── Player row card (lobby / XO style) ──────────────────────────────────────
function PlayerRow({ player, index, color }: { player: Player; index: number; color: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.06 }}
      className="flex items-center gap-3 px-4 py-2.5 rounded-xl border"
      style={{ background: `${color}08`, borderColor: `${color}25` }}>
      <div className="w-9 h-9 rounded-xl overflow-hidden border border-white/10 flex-shrink-0"
        style={{ boxShadow: `0 0 10px ${color}30` }}>
        <img src={player.avatar} alt={player.displayName}
          className="w-full h-full object-cover"
          onError={e => { (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${player.username}`; }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-bold text-sm text-white/90 truncate">{player.displayName}</p>
        <p className="text-[10px] text-purple-400/40 truncate">@{player.username}</p>
      </div>
      <div className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
    </motion.div>
  );
}

// ─── Confetti ─────────────────────────────────────────────────────────────────
function Confetti() {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-50">
      {Array.from({ length: 48 }).map((_, i) => (
        <motion.div key={i}
          className="absolute rounded-sm"
          style={{
            width: Math.random() * 8 + 6, height: Math.random() * 8 + 6,
            left: `${Math.random() * 100}%`, top: -20,
            background: NEONS[i % NEONS.length],
          }}
          animate={{ y: ["0vh","115vh"], rotate: [0, (Math.random()>0.5?1:-1)*360*2], opacity:[1,0.7,0] }}
          transition={{ duration: Math.random()*2+1.5, delay: Math.random()*1.2, ease:"linear" }} />
      ))}
    </div>
  );
}

// ─── NowPlaying chip ──────────────────────────────────────────────────────────
function NowPlaying({ song }: { song: SongEntry | null }) {
  if (!song) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-2 px-3 py-1.5 rounded-full"
      style={{ background: "rgba(224,64,251,0.12)", border: "1px solid rgba(224,64,251,0.3)" }}>
      <motion.div animate={{ scale: [1,1.3,1] }} transition={{ duration: 0.6, repeat: Infinity }}>
        <Music2 size={12} className="text-pink-400" />
      </motion.div>
      <span className="text-xs font-bold text-pink-300/80 truncate max-w-[160px]">
        {song.title} — {song.artist}
      </span>
    </motion.div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function ChairsGame() {
  const [, navigate] = useLocation();
  const { user } = useAuth();

  const [phase, setPhase]         = useState<Phase>("lobby");
  const [players, setPlayers]     = useState<Player[]>([]);
  const [roundNum, setRoundNum]   = useState(1);
  const [chairOccupied, setChairOccupied] = useState<Record<number,Player>>({});
  const [eliminated, setEliminated] = useState<Player | null>(null);
  const [winner, setWinner]       = useState<Player | null>(null);
  const [twitchConnected, setTwitchConnected] = useState(false);
  const [currentSong, setCurrentSong] = useState<SongEntry | null>(null);

  // refs
  const phaseRef        = useRef<Phase>("lobby");
  const playersRef      = useRef<Player[]>([]);
  const chairRef        = useRef<Record<number,Player>>({});
  const wsRef           = useRef<WebSocket | null>(null);
  const connectedRef    = useRef(false);
  const ytPlayerRef     = useRef<any>(null);
  const ytContainerRef  = useRef<HTMLDivElement>(null);
  const songIdxRef      = useRef(0);

  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { playersRef.current = players; }, [players]);
  useEffect(() => { chairRef.current = chairOccupied; }, [chairOccupied]);

  const currentChairs = Math.max(players.length - 1, 1);

  // ── YouTube setup ────────────────────────────────────────────────────────
  useEffect(() => {
    loadYT().then(() => {
      if (!ytContainerRef.current || ytPlayerRef.current) return;
      ytPlayerRef.current = new window.YT.Player(ytContainerRef.current, {
        width: "1", height: "1",
        playerVars: { autoplay: 0, controls: 0, fs: 0, modestbranding: 1, rel: 0 },
        events: { onReady: () => {} },
      });
    });
    return () => {
      try { ytPlayerRef.current?.destroy(); } catch {}
      ytPlayerRef.current = null;
    };
  }, []);

  const playSong = useCallback(() => {
    const songs = [...SPIN_SONGS].sort(() => Math.random() - 0.5);
    const song  = songs[songIdxRef.current % songs.length];
    songIdxRef.current++;
    setCurrentSong(song);
    try {
      const p = ytPlayerRef.current;
      if (!p) return;
      if (p.loadVideoById) {
        p.loadVideoById({ videoId: song.youtubeId, startSeconds: song.startSec });
      }
    } catch {}
  }, []);

  const stopSongAudio = useCallback(() => {
    try { ytPlayerRef.current?.pauseVideo?.(); } catch {}
    setCurrentSong(null);
  }, []);

  // ── Twitch IRC ────────────────────────────────────────────────────────────
  const connectTwitch = useCallback((channel: string) => {
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
    const ch = channel.toLowerCase().replace(/^#/, "");
    const ws = new WebSocket("wss://irc-ws.chat.twitch.tv");
    wsRef.current = ws;
    ws.onopen = () => {
      ws.send("PASS SCHMOOPIIE");
      ws.send(`NICK justinfan${Math.floor(Math.random() * 89999) + 10000}`);
      ws.send(`JOIN #${ch}`);
    };
    ws.onmessage = e => {
      const lines = (e.data as string).split("\r\n").filter(Boolean);
      for (const line of lines) {
        if (line.startsWith("PING")) { ws.send("PONG :tmi.twitch.tv"); continue; }
        if (line.includes("366") || line.includes("ROOMSTATE")) { setTwitchConnected(true); continue; }
        const m = line.match(/^(?:@[^ ]+ )?:(\w+)!\w+@\w+\.tmi\.twitch\.tv PRIVMSG #\w+ :(.+)$/);
        if (m) handleChat(m[1], m[2].trim());
      }
    };
    ws.onclose = () => setTwitchConnected(false);
  }, []);

  if (!connectedRef.current && user?.username) {
    connectedRef.current = true;
    setTimeout(() => connectTwitch(user.username), 80);
  }

  // ── Chat handler ──────────────────────────────────────────────────────────
  const handleChat = useCallback((username: string, text: string) => {
    const msg = text.trim().toLowerCase();
    const ph  = phaseRef.current;
    const pl  = playersRef.current;

    if (msg === "join" && ph === "lobby") {
      if (pl.some(p => p.username === username)) return;
      const np: Player = {
        username,
        displayName: username,
        avatar: `https://unavatar.io/twitch/${username}`,
      };
      setPlayers(prev => { const n = [...prev, np]; playersRef.current = n; return n; });
      return;
    }

    if (ph === "selecting") {
      const num = parseInt(msg, 10);
      const cur = playersRef.current;
      const occ = chairRef.current;
      const max = cur.length - 1;
      if (isNaN(num) || num < 1 || num > max) return;
      if (occ[num]) return;
      const p = cur.find(x => x.username === username);
      if (!p) return;
      if (Object.values(occ).some(x => x.username === username)) return;
      setChairOccupied(prev => {
        const n = { ...prev, [num]: p };
        chairRef.current = n;
        return n;
      });
    }
  }, []);

  // ── Controls ──────────────────────────────────────────────────────────────
  const doStartSpin = () => {
    const empty: Record<number,Player> = {};
    setChairOccupied(empty); chairRef.current = empty;
    setPhase("spinning"); phaseRef.current = "spinning";
    playSong();
  };

  const doStopSpin = () => {
    stopSongAudio();
    setPhase("selecting"); phaseRef.current = "selecting";
  };

  const doFinishSelecting = () => {
    const cur = playersRef.current;
    const occ = chairRef.current;
    const seated = new Set(Object.values(occ).map(p => p.username));
    const out = cur.filter(p => !seated.has(p.username));
    const eli = out.length > 0 ? out[Math.floor(Math.random() * out.length)] : null;
    setEliminated(eli);
    setPhase("elimination"); phaseRef.current = "elimination";
  };

  const doNextRound = () => {
    const cur = playersRef.current;
    const remaining = cur.filter(p => p.username !== eliminated?.username);
    if (remaining.length <= 1) {
      setWinner(remaining[0] ?? null);
      setPhase("winner"); phaseRef.current = "winner";
    } else {
      setPlayers(remaining); playersRef.current = remaining;
      setRoundNum(r => r + 1);
      setEliminated(null);
      const empty: Record<number,Player> = {};
      setChairOccupied(empty); chairRef.current = empty;
      setPhase("spinning"); phaseRef.current = "spinning";
      playSong();
    }
  };

  const doRestart = () => {
    stopSongAudio();
    setPlayers([]); playersRef.current = [];
    setChairOccupied({}); chairRef.current = {};
    setEliminated(null); setWinner(null); setRoundNum(1);
    setPhase("lobby"); phaseRef.current = "lobby";
  };

  // ─── Header ───────────────────────────────────────────────────────────────
  const Header = () => (
    <header className="flex items-center justify-between px-5 py-3 border-b border-purple-500/20 flex-shrink-0 z-10"
      style={{ background: "rgba(10,5,20,0.92)", backdropFilter: "blur(16px)" }}>
      <button onClick={() => { stopSongAudio(); navigate("/"); }}
        className="flex items-center gap-2 text-purple-400/60 hover:text-purple-300 transition-colors text-sm">
        <ArrowRight size={15} /><span>رجوع</span>
      </button>
      <div className="flex items-center gap-2">
        <span className="text-lg">🪑</span>
        <span className="font-black text-base" style={{ color:"#e040fb", textShadow:"0 0 16px #e040fb80" }}>
          لعبة الكراسي
        </span>
        {roundNum > 1 && (
          <span className="text-xs text-purple-400/40 mr-1">— ج{roundNum}</span>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        {twitchConnected
          ? <Wifi size={13} className="text-green-400" />
          : <WifiOff size={13} className="text-red-400/60" />}
        <span className="text-xs" style={{ color: twitchConnected ? "#4ade80" : "rgba(255,100,100,0.5)" }}>
          {twitchConnected ? user?.username : "غير متصل"}
        </span>
      </div>
    </header>
  );

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="h-screen gradient-bg relative overflow-hidden flex flex-col" dir="rtl">
      {/* Background glows */}
      <div className="absolute top-0 right-0 w-80 h-80 rounded-full opacity-8 pointer-events-none"
        style={{ background:"radial-gradient(circle,#e040fb,transparent)", filter:"blur(80px)" }} />
      <div className="absolute bottom-0 left-0 w-80 h-80 rounded-full opacity-8 pointer-events-none"
        style={{ background:"radial-gradient(circle,#7c3aed,transparent)", filter:"blur(80px)" }} />

      {/* Hidden YouTube player */}
      <div style={{ position:"absolute", opacity:0, pointerEvents:"none", width:1, height:1, overflow:"hidden" }}>
        <div ref={ytContainerRef} />
      </div>

      <Header />

      <AnimatePresence mode="wait">

        {/* ══ LOBBY ══════════════════════════════════════════════════════════ */}
        {phase === "lobby" && (
          <motion.main key="lobby"
            initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-16 }}
            className="flex-1 overflow-y-auto flex flex-col items-center py-6 px-5 gap-5">

            {/* Instruction banner */}
            <div className="w-full max-w-md rounded-2xl border border-purple-500/20 p-4 text-center"
              style={{ background:"rgba(224,64,251,0.06)" }}>
              <p className="text-lg font-black text-white/90 mb-1">اكتب <span style={{color:"#e040fb"}}>join</span> في الشات</p>
              <p className="text-sm text-purple-400/50">للانضمام إلى لعبة الكراسي الموسيقية 🎵</p>
            </div>

            {/* Player list */}
            <div className="w-full max-w-md">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Users size={14} className="text-purple-400" />
                  <span className="text-sm font-bold text-purple-300/80">
                    اللاعبون المنضمون
                  </span>
                </div>
                <span className="text-xs font-black px-2 py-0.5 rounded-full"
                  style={{ background:"rgba(224,64,251,0.15)", color:"#e040fb" }}>
                  {players.length}
                </span>
              </div>

              <div className="flex flex-col gap-2">
                {players.length === 0 ? (
                  <div className="text-center py-10 border border-dashed border-purple-500/15 rounded-2xl">
                    <span className="text-4xl opacity-30 block mb-2">🪑</span>
                    <p className="text-purple-400/30 text-sm">لم ينضم أحد بعد...</p>
                  </div>
                ) : (
                  players.map((p, i) => (
                    <PlayerRow key={p.username} player={p} index={i} color={NEONS[i % NEONS.length]} />
                  ))
                )}
              </div>
            </div>

            {/* Start button */}
            <div className="w-full max-w-md">
              <motion.button
                onClick={doStartSpin}
                disabled={players.length < 2}
                whileHover={players.length >= 2 ? { scale:1.03 } : {}}
                whileTap={players.length >= 2 ? { scale:0.97 } : {}}
                className="w-full py-4 rounded-2xl font-black text-lg transition-all"
                style={{
                  background: players.length >= 2
                    ? "linear-gradient(135deg,#e040fb,#9c27b0)"
                    : "rgba(255,255,255,0.04)",
                  color: players.length >= 2 ? "#fff" : "rgba(255,255,255,0.18)",
                  boxShadow: players.length >= 2 ? "0 0 32px #e040fb40" : "none",
                  border:"1px solid rgba(255,255,255,0.07)",
                  cursor: players.length >= 2 ? "pointer" : "not-allowed",
                }}>
                {players.length >= 2
                  ? `🚀 ابدأ اللعبة — ${players.length} لاعبين`
                  : `يلزم ${Math.max(2-players.length,0)} لاعب إضافي`}
              </motion.button>
            </div>
          </motion.main>
        )}

        {/* ══ SPINNING ═══════════════════════════════════════════════════════ */}
        {phase === "spinning" && (
          <motion.main key="spinning"
            initial={{ opacity:0, scale:0.95 }} animate={{ opacity:1, scale:1 }} exit={{ opacity:0 }}
            className="flex-1 flex flex-col items-center justify-center gap-5 px-5 py-4">

            <div className="text-center">
              <p className="text-xl font-black text-white/80">الجولة {roundNum}</p>
              <p className="text-purple-400/40 text-sm">{players.length} لاعبين — {currentChairs} كرسي</p>
            </div>

            {/* Wheel + glow ring */}
            <div className="relative flex items-center justify-center">
              <motion.div className="absolute rounded-full"
                animate={{ opacity:[0.15,0.35,0.15], rotate:360 }}
                transition={{ opacity:{duration:1.2,repeat:Infinity}, rotate:{duration:4,repeat:Infinity,ease:"linear"} }}
                style={{
                  inset:-14, borderRadius:"50%",
                  background:"conic-gradient(#e040fb,#00e5ff,#ffd600,#ff6d00,#22c55e,#e040fb)",
                  filter:"blur(10px)",
                }} />
              <div className="relative">
                <Pointer />
                <WheelSVG spinning={true} />
              </div>
            </div>

            {/* Now playing */}
            <NowPlaying song={currentSong} />

            {/* Players row */}
            <div className="flex flex-wrap justify-center gap-2 max-w-xs">
              {players.map((p, i) => (
                <div key={p.username} className="flex flex-col items-center gap-1">
                  <div className="w-9 h-9 rounded-xl overflow-hidden border border-white/10"
                    style={{ boxShadow:`0 0 10px ${NEONS[i%NEONS.length]}50` }}>
                    <img src={p.avatar} alt={p.displayName} className="w-full h-full object-cover"
                      onError={e=>{(e.target as HTMLImageElement).src=`https://api.dicebear.com/7.x/pixel-art/svg?seed=${p.username}`;}} />
                  </div>
                  <span className="text-[9px] text-white/40 truncate max-w-[36px] text-center">{p.displayName}</span>
                </div>
              ))}
            </div>

            <motion.button onClick={doStopSpin}
              whileHover={{ scale:1.05 }} whileTap={{ scale:0.97 }}
              animate={{ boxShadow:["0 0 18px #e040fb50","0 0 40px #e040fb","0 0 18px #e040fb50"] }}
              transition={{ duration:1.3, repeat:Infinity }}
              className="px-10 py-4 rounded-2xl font-black text-lg text-white"
              style={{ background:"linear-gradient(135deg,#e040fb,#9c27b0)", border:"1px solid #e040fb80" }}>
              ⏹ أوقف العجلة
            </motion.button>
          </motion.main>
        )}

        {/* ══ SELECTING ══════════════════════════════════════════════════════ */}
        {phase === "selecting" && (
          <motion.main key="selecting"
            initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }}
            className="flex-1 overflow-y-auto flex flex-col items-center gap-5 px-5 py-5">

            <div className="text-center">
              <h3 className="text-2xl font-black text-white/90">اختر كرسيك! 🪑</h3>
              <p className="text-sm text-purple-400/50 mt-1">
                اكتب رقم الكرسي في الشات (1 إلى {currentChairs})
              </p>
            </div>

            {/* Chairs grid */}
            <div className="flex flex-wrap justify-center gap-4 max-w-lg w-full">
              {Array.from({ length: currentChairs }).map((_, i) => (
                <ChairTile key={i+1} num={i+1} player={chairOccupied[i+1] ?? null} />
              ))}
            </div>

            {/* Unseated */}
            <div className="w-full max-w-md">
              <p className="text-xs text-purple-400/40 text-center mb-2">لم يختاروا بعد</p>
              <div className="flex flex-wrap justify-center gap-2">
                {players
                  .filter(p => !Object.values(chairOccupied).some(op => op.username === p.username))
                  .map(p => (
                    <div key={p.username} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-purple-500/15"
                      style={{ background:"rgba(224,64,251,0.05)" }}>
                      <img src={p.avatar} alt={p.displayName}
                        className="w-5 h-5 rounded-full object-cover"
                        onError={e=>{(e.target as HTMLImageElement).src=`https://api.dicebear.com/7.x/pixel-art/svg?seed=${p.username}`;}} />
                      <span className="text-xs text-white/60 font-bold">{p.displayName}</span>
                    </div>
                  ))}
              </div>
            </div>

            <motion.button onClick={doFinishSelecting}
              whileHover={{ scale:1.04 }} whileTap={{ scale:0.97 }}
              className="px-8 py-3 rounded-xl font-black text-sm text-white"
              style={{ background:"linear-gradient(135deg,#f43f5e,#be123c)", boxShadow:"0 0 22px #f43f5e50" }}>
              ❌ انتهى الاختيار — كشف المحذوف
            </motion.button>
          </motion.main>
        )}

        {/* ══ ELIMINATION ════════════════════════════════════════════════════ */}
        {phase === "elimination" && (
          <motion.main key="elim"
            initial={{ opacity:0, scale:0.9 }} animate={{ opacity:1, scale:1 }} exit={{ opacity:0 }}
            className="flex-1 flex flex-col items-center justify-center gap-7 px-5 py-8">

            {eliminated ? (
              <>
                <motion.div animate={{ scale:[1,1.12,1] }} transition={{ duration:1.4, repeat:Infinity }}
                  className="text-6xl">💥</motion.div>
                <div className="flex flex-col items-center gap-3 text-center">
                  <p className="text-purple-300/60 text-lg font-bold">تم إقصاء</p>
                  <div className="relative">
                    <img src={eliminated.avatar} alt={eliminated.displayName}
                      className="w-24 h-24 rounded-2xl object-cover border-4 border-red-500"
                      style={{ boxShadow:"0 0 32px #f43f5e" }}
                      onError={e=>{(e.target as HTMLImageElement).src=`https://api.dicebear.com/7.x/pixel-art/svg?seed=${eliminated.username}`;}} />
                    <div className="absolute -bottom-2 -right-2 text-2xl">❌</div>
                  </div>
                  <h3 className="text-3xl font-black" style={{ color:"#f43f5e", textShadow:"0 0 20px #f43f5e" }}>
                    {eliminated.displayName}
                  </h3>
                </div>

                <div className="text-center">
                  <p className="text-purple-300/40 text-sm mb-3">المتبقون ({players.length-1} لاعب)</p>
                  <div className="flex flex-wrap justify-center gap-2">
                    {players.filter(p=>p.username!==eliminated.username).map((p,i)=>(
                      <div key={p.username} className="flex flex-col items-center gap-1">
                        <img src={p.avatar} alt={p.displayName}
                          className="w-10 h-10 rounded-xl border-2 object-cover"
                          style={{ borderColor:NEONS[i%NEONS.length], boxShadow:`0 0 10px ${NEONS[i%NEONS.length]}50` }}
                          onError={e=>{(e.target as HTMLImageElement).src=`https://api.dicebear.com/7.x/pixel-art/svg?seed=${p.username}`;}} />
                        <span className="text-[10px] text-white/50 truncate max-w-[40px] text-center">{p.displayName}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center">
                <span className="text-5xl block mb-3">🤝</span>
                <p className="text-white/50 text-lg">جميع اللاعبين وجدوا كرسياً!</p>
              </div>
            )}

            <motion.button onClick={doNextRound}
              whileHover={{ scale:1.05 }} whileTap={{ scale:0.97 }}
              className="px-10 py-4 rounded-2xl font-black text-lg text-white"
              style={{ background:"linear-gradient(135deg,#e040fb,#9c27b0)", boxShadow:"0 0 28px #e040fb50" }}>
              {(players.length-(eliminated?1:0))<=1 ? "🏆 عرض الفائز" : "▶ الجولة التالية"}
            </motion.button>
          </motion.main>
        )}

        {/* ══ WINNER ═════════════════════════════════════════════════════════ */}
        {phase === "winner" && (
          <motion.main key="winner"
            initial={{ opacity:0, scale:0.8 }} animate={{ opacity:1, scale:1 }} exit={{ opacity:0 }}
            className="flex-1 flex flex-col items-center justify-center gap-7 px-5 py-8">
            <Confetti />
            <motion.div animate={{ y:[0,-18,0] }} transition={{ duration:2, repeat:Infinity, ease:"easeInOut" }}
              className="text-7xl">🏆</motion.div>
            <div className="flex flex-col items-center gap-4 text-center">
              <p className="text-2xl text-yellow-400/80 font-bold">الفائز</p>
              {winner && (
                <>
                  <div className="relative">
                    <motion.div animate={{ rotate:360 }} transition={{ duration:6, repeat:Infinity, ease:"linear" }}
                      className="absolute rounded-2xl"
                      style={{ inset:-5, background:"conic-gradient(#ffd600,#e040fb,#00e5ff,#ffd600)", filter:"blur(2px)" }} />
                    <img src={winner.avatar} alt={winner.displayName}
                      className="relative w-28 h-28 rounded-2xl border-4 border-yellow-400 object-cover"
                      style={{ boxShadow:"0 0 50px #ffd60070" }}
                      onError={e=>{(e.target as HTMLImageElement).src=`https://api.dicebear.com/7.x/pixel-art/svg?seed=${winner.username}`;}} />
                  </div>
                  <h2 className="text-4xl font-black" style={{ color:"#ffd600", textShadow:"0 0 30px #ffd600,0 0 60px #ffd60060" }}>
                    {winner.displayName}
                  </h2>
                  <p className="text-yellow-400/50 text-sm">🎉 بطل لعبة الكراسي الموسيقية 🎉</p>
                </>
              )}
            </div>
            <div className="flex gap-3">
              <motion.button onClick={doRestart}
                whileHover={{ scale:1.05 }} whileTap={{ scale:0.97 }}
                className="flex items-center gap-2 px-7 py-3 rounded-xl font-bold text-sm text-white border border-purple-500/30"
                style={{ background:"rgba(224,64,251,0.12)" }}>
                <RotateCcw size={14} /> العب مجدداً
              </motion.button>
              <motion.button onClick={()=>navigate("/")}
                whileHover={{ scale:1.05 }} whileTap={{ scale:0.97 }}
                className="flex items-center gap-2 px-7 py-3 rounded-xl font-bold text-sm text-white border border-purple-500/30"
                style={{ background:"rgba(0,229,255,0.08)" }}>
                <ArrowRight size={14} /> الرئيسية
              </motion.button>
            </div>
          </motion.main>
        )}

      </AnimatePresence>
    </div>
  );
}
