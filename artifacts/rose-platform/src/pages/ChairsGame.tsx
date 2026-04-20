import { useState, useRef, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Wifi, WifiOff, Users, RotateCcw, Music2, Volume2, VolumeX } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

// ─── YouTube ──────────────────────────────────────────────────────────────────
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

// ─── Twitch photo ─────────────────────────────────────────────────────────────
async function fetchTwitchPhoto(username: string): Promise<string> {
  try {
    const res = await fetch(`https://api.ivr.fi/v2/twitch/user?login=${username}`);
    const data = await res.json();
    const u = Array.isArray(data) ? data[0] : data?.data?.[0];
    const url = u?.profileImageURL ?? u?.logo ?? u?.profile_image_url;
    if (url) return url.replace("{width}", "150").replace("{height}", "150");
  } catch {}
  return `https://unavatar.io/twitch/${username}`;
}

// ─── Songs ────────────────────────────────────────────────────────────────────
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

// ─── Types & constants ────────────────────────────────────────────────────────
type Phase = "lobby" | "spinning" | "selecting" | "elimination" | "winner";
interface Player { username: string; displayName: string; avatar: string }
interface FlyAnim { id: number; player: Player; fx: number; fy: number; tx: number; ty: number }

// Color palette — brown/gold equivalent of XO's dark-purple/neon
const GOLD      = "#f0b429";   // primary accent (like XO's cyan)
const GOLD_D    = "#c8860a";   // darker gold
const GOLD_LT   = "#fde68a";   // light gold highlight
const BG        = "#080402";   // near-black dark brown (like XO's #0a0515)
const SURFACE   = "#160d03";   // card surface
const SURFACE2  = "#221205";   // slightly lighter surface
const BORDER    = "#3d1f07";   // border color
const WHITE     = "#ffffff";
const SELECT_S  = 20;

const WHEEL_SIZE = 440;
const CX       = WHEEL_SIZE / 2;
const CY       = WHEEL_SIZE / 2;
const PLAYER_R = WHEEL_SIZE / 2 - 48;
const CHAIR_R  = WHEEL_SIZE / 2 - 94;

// ─── Chair tile ───────────────────────────────────────────────────────────────
function ChairTile({ num, player }: { num: number; player?: Player }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
      <div style={{
        background: GOLD, color: "#000", fontWeight: 900, fontSize: 10,
        lineHeight: "16px", padding: "0 6px", borderRadius: 8,
        minWidth: 22, textAlign: "center",
      }}>{num}</div>
      <motion.div
        animate={player ? { boxShadow: [`0 0 8px ${GOLD}70`, `0 0 24px ${GOLD}`, `0 0 8px ${GOLD}70`] } : {}}
        transition={{ duration: 0.8, repeat: Infinity }}
        style={{
          width: 60, height: 60, borderRadius: 15, overflow: "hidden",
          border: `2.5px solid ${player ? GOLD : BORDER}`,
          background: player ? "transparent" : SURFACE2,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
        {player ? (
          <motion.img initial={{ scale: 0 }} animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 350, damping: 22 }}
            src={player.avatar} alt={player.displayName}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            onError={e => { (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${player.username}`; }} />
        ) : (
          <span style={{ fontSize: 28 }}>🪑</span>
        )}
      </motion.div>
      {player && (
        <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          style={{ fontSize: 9, color: GOLD, fontWeight: 700,
            maxWidth: 60, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {player.displayName}
        </motion.span>
      )}
    </div>
  );
}

// ─── Wheel ────────────────────────────────────────────────────────────────────
function GameWheel({ spinning, players, chairCount, chairOccupied, showChairs, flyAnims }: {
  spinning: boolean; players: Player[];
  chairCount: number; chairOccupied: Record<number, Player>;
  showChairs: boolean; flyAnims: FlyAnim[];
}) {
  const chairPos = Array.from({ length: chairCount }, (_, i) => {
    const a = (i / chairCount) * 2 * Math.PI - Math.PI / 2;
    return { num: i + 1, x: CX + CHAIR_R * Math.cos(a), y: CY + CHAIR_R * Math.sin(a) };
  });

  return (
    <div style={{ width: WHEEL_SIZE, height: WHEEL_SIZE, position: "relative", flexShrink: 0 }}>

      {/* Outer glow ring */}
      <motion.div
        animate={{ boxShadow: spinning
          ? [`0 0 28px ${GOLD}80, 0 0 56px ${GOLD}40`, `0 0 52px ${GOLD}, 0 0 90px ${GOLD}55`, `0 0 28px ${GOLD}80, 0 0 56px ${GOLD}40`]
          : [`0 0 14px ${GOLD}50, 0 0 30px ${GOLD}20`, `0 0 24px ${GOLD}80, 0 0 48px ${GOLD}35`, `0 0 14px ${GOLD}50, 0 0 30px ${GOLD}20`] }}
        transition={{ duration: 1.8, repeat: Infinity }}
        style={{ position: "absolute", inset: 0, borderRadius: "50%", border: `5px solid ${GOLD}` }} />

      {/* Slow conic halo */}
      <div className={spinning ? "chairs-orbit-slow" : ""}
        style={{ position: "absolute", inset: 8, borderRadius: "50%",
          background: `conic-gradient(transparent,${GOLD}40,transparent,${GOLD}28,transparent,${GOLD}40,transparent)` }} />

      {/* Disc body */}
      <div style={{
        position: "absolute", inset: 14, borderRadius: "50%",
        background: `radial-gradient(circle at 38% 32%, #5c2e0a 0%, #321604 42%, #120800 80%)`,
        boxShadow: `inset 0 0 40px rgba(0,0,0,0.6)`,
        border: `2px solid ${GOLD}60`,
      }}>
        <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: .12, borderRadius: "50%" }}>
          <defs>
            <pattern id="cgd3" x="0" y="0" width="18" height="18" patternUnits="userSpaceOnUse">
              <circle cx="9" cy="9" r="1.5" fill={GOLD} />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#cgd3)" />
        </svg>
        <div style={{ position: "absolute", inset: 22, borderRadius: "50%", border: `1.5px solid ${GOLD}40` }} />
        <div style={{ position: "absolute", inset: 44, borderRadius: "50%", border: `1px solid ${GOLD}28` }} />
      </div>

      {/* Player orbit */}
      <div className={spinning ? "chairs-orbit" : ""} style={{ position: "absolute", inset: 0 }}>
        {players.map((p, i) => {
          const rad = ((i / players.length) * 360 * Math.PI) / 180;
          const px  = CX + PLAYER_R * Math.cos(rad - Math.PI / 2);
          const py  = CY + PLAYER_R * Math.sin(rad - Math.PI / 2);
          const sat = Object.values(chairOccupied).some(x => x.username === p.username);
          return (
            <div key={p.username} style={{ position: "absolute", left: px - 25, top: py - 25, width: 50, height: 50 }}>
              <div className={spinning ? "chairs-counter" : ""} style={{ width: "100%", height: "100%" }}>
                <div style={{
                  width: 50, height: 50, borderRadius: "50%", overflow: "hidden",
                  border: `3px solid ${sat ? GOLD : GOLD_D}`,
                  boxShadow: `0 0 ${sat ? 20 : 10}px ${sat ? GOLD : GOLD_D}`,
                  opacity: showChairs && !sat ? 0.22 : 1,
                  transition: "opacity 0.4s",
                }}>
                  <img src={p.avatar} alt={p.displayName}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    onError={e => { (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${p.username}`; }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Flying seat animations */}
      {flyAnims.map(a => (
        <motion.div key={a.id}
          initial={{ x: a.fx - 25, y: a.fy - 25, scale: 1, opacity: 1 }}
          animate={{ x: a.tx - 25, y: a.ty - 25, scale: 0.8, opacity: 0 }}
          transition={{ duration: 0.55, ease: "easeInOut" }}
          style={{ position: "absolute", left: 0, top: 0, width: 50, height: 50, pointerEvents: "none", zIndex: 20 }}>
          <div style={{ width: 50, height: 50, borderRadius: "50%", overflow: "hidden",
            border: `3px solid ${GOLD}`, boxShadow: `0 0 16px ${GOLD}` }}>
            <img src={a.player.avatar} style={{ width: "100%", height: "100%", objectFit: "cover" }}
              onError={e => { (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${a.player.username}`; }} />
          </div>
        </motion.div>
      ))}

      {/* Center music icon */}
      <AnimatePresence>
        {spinning && (
          <motion.div key="mus" initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center",
              justifyContent: "center", pointerEvents: "none" }}>
            <motion.span animate={{ scale: [1, 1.3, 1], rotate: [0, 12, -12, 0] }}
              transition={{ duration: 0.9, repeat: Infinity }} style={{ fontSize: 46 }}>🎵</motion.span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chairs */}
      <AnimatePresence>
        {showChairs && (
          <motion.div key="chairs" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
            {chairPos.map(({ num, x, y }) => (
              <motion.div key={num}
                initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: (num - 1) * 0.06, type: "spring", stiffness: 350, damping: 22 }}
                style={{ position: "absolute", left: x - 30, top: y - 42 }}>
                <ChairTile num={num} player={chairOccupied[num]} />
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top diamond */}
      <div style={{ position: "absolute", top: 1, left: "50%", transform: "translateX(-50%)" }}>
        <div style={{ width: 14, height: 14, background: GOLD, transform: "rotate(45deg)",
          borderRadius: 3, boxShadow: `0 0 14px ${GOLD}` }} />
      </div>
    </div>
  );
}

// ─── Timer ring ───────────────────────────────────────────────────────────────
function Ring({ sec, total }: { sec: number; total: number }) {
  const r = 24; const circ = 2 * Math.PI * r;
  const warn = sec <= 5;
  return (
    <svg width="62" height="62" viewBox="0 0 62 62">
      <circle cx="31" cy="31" r={r} fill="none" stroke={`${GOLD_D}35`} strokeWidth="4" />
      <circle cx="31" cy="31" r={r} fill="none"
        stroke={warn ? "#f43f5e" : GOLD} strokeWidth="4"
        strokeDasharray={`${circ * (sec / total)} ${circ}`} strokeLinecap="round"
        style={{ transform: "rotate(-90deg)", transformOrigin: "center", transition: "stroke-dasharray 0.85s linear" }} />
      <text x="31" y="36" textAnchor="middle" fontSize="15" fontWeight="900"
        fill={warn ? "#f43f5e" : GOLD}>{sec}</text>
    </svg>
  );
}

// ─── Confetti ─────────────────────────────────────────────────────────────────
const CC = [GOLD, "#e040fb", "#00e5ff", "#22c55e", "#f43f5e", "#fbbf24"];
function Confetti() {
  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 50, overflow: "hidden" }}>
      {Array.from({ length: 70 }).map((_, i) => (
        <motion.div key={i}
          style={{ position: "absolute", borderRadius: 3, width: Math.random() * 10 + 5,
            height: Math.random() * 10 + 5, left: `${Math.random() * 100}%`, top: -16,
            background: CC[i % CC.length] }}
          animate={{ y: ["0vh", "115vh"], rotate: [0, (Math.random() > 0.5 ? 1 : -1) * 720], opacity: [1, 0.8, 0] }}
          transition={{ duration: Math.random() * 2.5 + 1.5, delay: Math.random() * 1.5, ease: "linear" }} />
      ))}
    </div>
  );
}

// ─── Volume Control ───────────────────────────────────────────────────────────
function VolumeControl({ vol, onChange }: { vol: number; onChange: (v: number) => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <button onClick={() => onChange(Math.max(0, vol - 20))}
        style={{ color: GOLD, background: "none", border: "none", cursor: "pointer", padding: 4, lineHeight: 0 }}>
        <VolumeX size={17} />
      </button>
      <div style={{ display: "flex", gap: 3, alignItems: "flex-end" }}>
        {[20, 40, 60, 80, 100].map(s => (
          <motion.div key={s} onClick={() => onChange(s)} animate={{ background: vol >= s ? GOLD : `${GOLD}28` }}
            style={{ width: 6, height: 6 + (s / 100) * 16, borderRadius: 3, cursor: "pointer" }} />
        ))}
      </div>
      <button onClick={() => onChange(Math.min(100, vol + 20))}
        style={{ color: GOLD, background: "none", border: "none", cursor: "pointer", padding: 4, lineHeight: 0 }}>
        <Volume2 size={17} />
      </button>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function ChairsGame() {
  const [, navigate] = useLocation();
  const { user } = useAuth();

  const [phase, setPhase]               = useState<Phase>("lobby");
  const [players, setPlayers]           = useState<Player[]>([]);
  const [roundNum, setRoundNum]         = useState(1);
  const [chairOccupied, setChairOccupied] = useState<Record<number, Player>>({});
  const [eliminated, setEliminated]     = useState<Player | null>(null);
  const [winner, setWinner]             = useState<Player | null>(null);
  const [connected, setConnected]       = useState(false);
  const [currentSong, setCurrentSong]   = useState<Song | null>(null);
  const [showChairs, setShowChairs]     = useState(false);
  const [selTimer, setSelTimer]         = useState(SELECT_S);
  const [cdTimer, setCdTimer]           = useState(5);
  const [volume, setVolume]             = useState(80);
  const [flyAnims, setFlyAnims]         = useState<FlyAnim[]>([]);

  const phaseRef     = useRef<Phase>("lobby");
  const playersRef   = useRef<Player[]>([]);
  const chairRef     = useRef<Record<number, Player>>({});
  const prevChairRef = useRef<Record<number, Player>>({});
  const ytRef        = useRef<any>(null);
  const ytDivRef     = useRef<HTMLDivElement>(null);
  const songIdxRef   = useRef(0);
  const flyIdRef     = useRef(0);
  const selInt       = useRef<ReturnType<typeof setInterval> | null>(null);
  const cdInt        = useRef<ReturnType<typeof setInterval> | null>(null);
  const clipInt      = useRef<ReturnType<typeof setInterval> | null>(null);
  const connRef      = useRef(false);

  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { playersRef.current = players; }, [players]);
  useEffect(() => { chairRef.current = chairOccupied; }, [chairOccupied]);

  const numChairs = Math.max(players.length - 1, 1);
  const clrAll = () => [selInt, cdInt, clipInt].forEach(r => { if (r.current) { clearInterval(r.current); r.current = null; } });

  const changeVolume = useCallback((v: number) => {
    setVolume(v); try { ytRef.current?.setVolume(v); } catch {}
  }, []);

  // Flying seat animation
  useEffect(() => {
    const prev = prevChairRef.current;
    const cur  = playersRef.current;
    const newAnims: FlyAnim[] = [];
    for (const [ns, player] of Object.entries(chairOccupied)) {
      const num = parseInt(ns); if (prev[num]) continue;
      const pi = cur.findIndex(p => p.username === player.username); if (pi < 0) continue;
      const pa = (pi / cur.length) * 2 * Math.PI - Math.PI / 2;
      const ca = ((num - 1) / Math.max(cur.length - 1, 1)) * 2 * Math.PI - Math.PI / 2;
      newAnims.push({ id: ++flyIdRef.current, player,
        fx: CX + PLAYER_R * Math.cos(pa), fy: CY + PLAYER_R * Math.sin(pa),
        tx: CX + CHAIR_R * Math.cos(ca),  ty: CY + CHAIR_R * Math.sin(ca) });
    }
    if (newAnims.length) {
      setFlyAnims(p => [...p, ...newAnims]);
      const ids = new Set(newAnims.map(a => a.id));
      setTimeout(() => setFlyAnims(p => p.filter(a => !ids.has(a.id))), 700);
    }
    prevChairRef.current = { ...chairOccupied };
  }, [chairOccupied]);

  // YouTube
  useEffect(() => {
    loadYT().then(() => {
      if (!ytDivRef.current || ytRef.current) return;
      ytRef.current = new window.YT.Player(ytDivRef.current, {
        width: "1", height: "1",
        playerVars: { autoplay: 0, controls: 0, fs: 0, modestbranding: 1, rel: 0, playsinline: 1 },
        events: { onReady: () => { try { ytRef.current?.setVolume(volume); } catch {} } },
      });
    });
    return () => { clrAll(); try { ytRef.current?.destroy(); } catch {} ytRef.current = null; };
  }, []);

  const playMusic = useCallback(() => {
    const s = [...SONGS].sort(() => Math.random() - 0.5)[songIdxRef.current % SONGS.length];
    songIdxRef.current++;
    setCurrentSong(s);
    try { ytRef.current?.loadVideoById({ videoId: s.id, startSeconds: s.start }); } catch {}
    try { ytRef.current?.setVolume(volume); } catch {}
  }, [volume]);

  const stopMusic = useCallback(() => {
    try { ytRef.current?.pauseVideo(); } catch {}
    setCurrentSong(null);
  }, []);

  const doEliminate = useCallback(() => {
    clrAll();
    const cur = playersRef.current; const occ = chairRef.current;
    const sat = new Set(Object.values(occ).map(p => p.username));
    const out = cur.filter(p => !sat.has(p.username));
    const eli = out[Math.floor(Math.random() * out.length)] ?? null;
    setEliminated(eli);
    phaseRef.current = "elimination"; setPhase("elimination");
    let cd = 5; setCdTimer(cd);
    cdInt.current = setInterval(() => {
      cd--; setCdTimer(cd);
      if (cd <= 0) { clearInterval(cdInt.current!); cdInt.current = null; doNextRound(eli); }
    }, 1000);
  }, []);

  const doNextRound = (eli: Player | null) => {
    clrAll();
    const rem = playersRef.current.filter(p => p.username !== eli?.username);
    playersRef.current = rem; prevChairRef.current = {};
    if (rem.length <= 1) { setWinner(rem[0] ?? null); setPlayers(rem); phaseRef.current = "winner"; setPhase("winner"); }
    else { setPlayers(rem); setRoundNum(r => r + 1); setShowChairs(false); setFlyAnims([]); setTimeout(() => startSpin(rem), 150); }
  };

  const stopSpin = useCallback(() => {
    clrAll(); stopMusic(); setShowChairs(true); prevChairRef.current = {};
    phaseRef.current = "selecting"; setPhase("selecting");
    let t = SELECT_S; setSelTimer(t);
    selInt.current = setInterval(() => {
      t--; setSelTimer(t);
      if (t <= 0) { clearInterval(selInt.current!); selInt.current = null; doEliminate(); }
    }, 1000);
  }, [stopMusic, doEliminate]);

  const startSpin = (pl: Player[]) => {
    if (pl.length < 2) return;
    clrAll();
    setChairOccupied({}); chairRef.current = {};
    setEliminated(null); setShowChairs(false); setFlyAnims([]);
    phaseRef.current = "spinning"; setPhase("spinning");
    playMusic();
    const dur = CLIP_DURATIONS[Math.floor(Math.random() * CLIP_DURATIONS.length)];
    let t = dur;
    clipInt.current = setInterval(() => {
      t--;
      if (t <= 0) { clearInterval(clipInt.current!); clipInt.current = null; stopSpin(); }
    }, 1000);
  };

  const doStartSpin = useCallback((pl?: Player[]) => startSpin(pl ?? playersRef.current), [stopSpin, playMusic]);

  const doRestart = () => {
    clrAll(); stopMusic();
    setPlayers([]); playersRef.current = [];
    setChairOccupied({}); chairRef.current = {}; prevChairRef.current = {};
    setEliminated(null); setWinner(null); setRoundNum(1);
    setShowChairs(false); setCurrentSong(null); setFlyAnims([]);
    phaseRef.current = "lobby"; setPhase("lobby");
  };

  const handleChat = useCallback((username: string, text: string) => {
    const msg = text.trim().toLowerCase();
    const ph  = phaseRef.current; const pl = playersRef.current;

    if (msg === "join" && ph === "lobby") {
      if (pl.some(p => p.username === username)) return;
      const np: Player = { username, displayName: username, avatar: `https://unavatar.io/twitch/${username}` };
      setPlayers(prev => { const n = [...prev, np]; playersRef.current = n; return n; });
      fetchTwitchPhoto(username).then(url =>
        setPlayers(prev => { const n = prev.map(p => p.username === username ? { ...p, avatar: url } : p); playersRef.current = n; return n; })
      );
      return;
    }
    if ((msg === "start game" || msg === "startgame") && ph === "lobby" && pl.length >= 2) { doStartSpin(pl); return; }

    if (ph === "selecting") {
      const num = parseInt(msg, 10);
      const occ = chairRef.current; const cur = playersRef.current;
      if (isNaN(num) || num < 1 || num > cur.length - 1) return;
      if (occ[num]) return;
      const p = cur.find(x => x.username === username); if (!p) return;
      if (Object.values(occ).some(x => x.username === username)) return;
      setChairOccupied(prev => {
        const n = { ...prev, [num]: p }; chairRef.current = n;
        if (Object.keys(n).length >= cur.length - 1) setTimeout(() => doEliminate(), 500);
        return n;
      });
    }
  }, [doStartSpin, doEliminate]);

  // Twitch IRC
  if (!connRef.current && user?.username) {
    connRef.current = true;
    setTimeout(() => {
      const ws = new WebSocket("wss://irc-ws.chat.twitch.tv");
      ws.onopen = () => { ws.send("PASS SCHMOOPIIE"); ws.send(`NICK justinfan${Math.floor(Math.random() * 89999) + 10000}`); ws.send(`JOIN #${user.username.toLowerCase()}`); };
      ws.onmessage = e => {
        for (const line of (e.data as string).split("\r\n").filter(Boolean)) {
          if (line.startsWith("PING")) { ws.send("PONG :tmi.twitch.tv"); continue; }
          if (line.includes("366") || line.includes("ROOMSTATE")) { setConnected(true); continue; }
          const m = line.match(/^(?:@[^ ]+ )?:(\w+)!\w+@\w+\.tmi\.twitch\.tv PRIVMSG #\w+ :(.+)$/);
          if (m) handleChat(m[1], m[2].trim());
        }
      };
      ws.onclose = () => setConnected(false);
    }, 80);
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden relative" dir="rtl"
      style={{ background: BG }}>

      {/* Ambient gold glows */}
      <div style={{ position: "absolute", top: 0, right: 0, width: 400, height: 400, borderRadius: "50%",
        opacity: 0.07, background: `radial-gradient(circle,${GOLD},transparent)`,
        filter: "blur(80px)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", bottom: 0, left: 0, width: 400, height: 400, borderRadius: "50%",
        opacity: 0.04, background: `radial-gradient(circle,${GOLD_D},transparent)`,
        filter: "blur(80px)", pointerEvents: "none" }} />

      {/* Hidden YT */}
      <div style={{ position: "absolute", opacity: 0, pointerEvents: "none", width: 1, height: 1, overflow: "hidden" }}>
        <div ref={ytDivRef} />
      </div>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-5 py-3 flex-shrink-0 z-20"
        style={{ background: BG, borderBottom: `1px solid ${BORDER}` }}>
        <button onClick={() => { clrAll(); stopMusic(); navigate("/"); }}
          className="flex items-center gap-1.5 text-sm transition-all hover:opacity-80"
          style={{ color: GOLD, fontWeight: 700 }}>
          <ArrowRight size={15} /> رجوع
        </button>
        <div className="flex items-center gap-2">
          <span style={{ fontSize: 20 }}>🪑</span>
          <span style={{ fontWeight: 900, fontSize: 17, color: GOLD, textShadow: `0 0 20px ${GOLD}` }}>
            لعبة الكراسي{roundNum > 1 ? ` — ج${roundNum}` : ""}
          </span>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs"
          style={{
            borderColor: connected ? `${GOLD}40` : BORDER,
            background: connected ? `${GOLD}10` : "transparent",
            color: connected ? GOLD : "#6b7280",
          }}>
          {connected ? <Wifi size={11} /> : <WifiOff size={11} />}
          <span style={{ fontWeight: 700 }}>{connected ? user?.username : "غير متصل"}</span>
        </div>
      </header>

      <AnimatePresence mode="wait">

        {/* ══ LOBBY ═══════════════════════════════════════════════════════════ */}
        {phase === "lobby" && (
          <motion.main key="lobby"
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
            className="flex-1 overflow-y-auto flex flex-col items-center px-5 py-8 gap-6">

            {/* Connection pill — like XO's top badge */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
              style={{ border: `1px solid ${connected ? GOLD + "50" : BORDER}`,
                background: connected ? `${GOLD}12` : SURFACE }}>
              {connected ? <Wifi size={12} color={GOLD} /> : <WifiOff size={12} color="#6b7280" />}
              <span style={{ fontWeight: 700, fontSize: 13, color: connected ? GOLD : "#6b7280" }}>
                {connected ? `${user?.username} متصل` : "جاري الاتصال..."}
              </span>
            </div>

            {/* ── MAIN HEADING — matches XO's big "اكتب join في الشات" ── */}
            <div className="text-center">
              <h1 style={{ fontSize: 48, fontWeight: 900, color: WHITE, lineHeight: 1.15,
                textShadow: "0 2px 12px rgba(0,0,0,0.8)" }}>
                اكتب{" "}
                <span style={{ color: GOLD, textShadow: `0 0 24px ${GOLD}, 0 0 48px ${GOLD_D}` }}>join</span>
                {" "}في الشات
              </h1>
              <p style={{ fontSize: 17, color: "rgba(255,255,255,0.7)", fontWeight: 600, marginTop: 8 }}>
                أول لاعبين يكتبون join يدخلون اللعبة 🎵
              </p>
            </div>

            {/* Player count */}
            <div className="w-full max-w-md flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users size={16} color={GOLD} />
                <span style={{ fontWeight: 800, fontSize: 15, color: WHITE }}>اللاعبون المنضمون</span>
              </div>
              <span style={{ fontWeight: 900, fontSize: 14, padding: "4px 14px", borderRadius: 20,
                background: `${GOLD}18`, color: GOLD, border: `1px solid ${GOLD}50` }}>
                {players.length} لاعب
              </span>
            </div>

            {/* Player grid or empty state */}
            {players.length === 0 ? (
              <div className="w-full max-w-md flex flex-col items-center py-12 rounded-2xl"
                style={{ border: `1.5px dashed ${GOLD_D}60`, background: SURFACE }}>
                <span style={{ fontSize: 52 }}>🪑</span>
                <p style={{ color: GOLD, fontWeight: 800, fontSize: 18, marginTop: 10 }}>
                  لم ينضم أحد بعد...
                </p>
                <p style={{ color: "rgba(255,255,255,0.65)", fontWeight: 600, fontSize: 14, marginTop: 6 }}>
                  اطلب من المشاهدين يكتبون join
                </p>
              </div>
            ) : (
              <div className="w-full max-w-md grid grid-cols-3 gap-3">
                {players.map((p, i) => (
                  <motion.div key={p.username}
                    initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.04, type: "spring", stiffness: 300, damping: 22 }}
                    className="flex flex-col items-center gap-2.5 p-3 rounded-2xl"
                    style={{ background: SURFACE2, border: `1.5px solid ${GOLD_D}55`, boxShadow: `0 0 14px ${GOLD_D}14` }}>
                    <div style={{ width: 74, height: 74, borderRadius: "50%", overflow: "hidden",
                      border: `3px solid ${GOLD}`, boxShadow: `0 0 20px ${GOLD}55`, flexShrink: 0 }}>
                      <img src={p.avatar} alt={p.displayName}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        onError={e => { (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${p.username}`; }} />
                    </div>
                    <span style={{ fontWeight: 800, fontSize: 13, color: WHITE, textAlign: "center",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", width: "100%" }}>
                      {p.displayName}
                    </span>
                  </motion.div>
                ))}
              </div>
            )}

            {/* Start button */}
            <div className="w-full max-w-md pb-2">
              <motion.button onClick={() => doStartSpin()} disabled={players.length < 2}
                whileHover={players.length >= 2 ? { scale: 1.02 } : {}}
                whileTap={players.length >= 2 ? { scale: 0.97 } : {}}
                style={{
                  width: "100%", padding: "18px 0", borderRadius: 18,
                  fontWeight: 900, fontSize: 20,
                  background: players.length >= 2
                    ? `linear-gradient(135deg, ${GOLD_LT}, ${GOLD}, #8a5000)`
                    : SURFACE,
                  color: players.length >= 2 ? "#000" : "rgba(255,255,255,0.4)",
                  boxShadow: players.length >= 2 ? `0 0 40px ${GOLD}55, 0 4px 24px rgba(0,0,0,0.5)` : "none",
                  border: `2px solid ${players.length >= 2 ? GOLD : BORDER}`,
                  cursor: players.length >= 2 ? "pointer" : "not-allowed",
                }}>
                {players.length >= 2 ? `▶  ابدأ اللعبة — ${players.length} لاعبين` : "يحتاج لاعبَين على الأقل"}
              </motion.button>
            </div>
          </motion.main>
        )}

        {/* ══ SPINNING ════════════════════════════════════════════════════════ */}
        {phase === "spinning" && (
          <motion.main key="spin"
            initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
            className="flex-1 flex flex-col items-center justify-center gap-4 px-4 py-3">

            <div className="text-center">
              <p style={{ fontWeight: 900, fontSize: 26, color: WHITE }}>الجولة {roundNum}</p>
              <p style={{ fontWeight: 700, fontSize: 15, color: GOLD }}>{players.length} لاعبين — {numChairs} كرسي</p>
            </div>

            <GameWheel spinning={true} players={players}
              chairCount={numChairs} chairOccupied={{}} showChairs={false} flyAnims={[]} />

            {currentSong && (
              <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                className="flex flex-col items-center gap-2.5">
                <div className="flex items-center gap-2 px-5 py-2.5 rounded-full"
                  style={{ background: `${GOLD}14`, border: `1px solid ${GOLD}55` }}>
                  <motion.div animate={{ scale: [1, 1.3, 1] }} transition={{ duration: 0.7, repeat: Infinity }}>
                    <Music2 size={15} color={GOLD} />
                  </motion.div>
                  <span style={{ fontWeight: 800, fontSize: 15, color: WHITE }}>
                    {currentSong.title} — {currentSong.artist}
                  </span>
                </div>
                <VolumeControl vol={volume} onChange={changeVolume} />
              </motion.div>
            )}
          </motion.main>
        )}

        {/* ══ SELECTING ═══════════════════════════════════════════════════════ */}
        {phase === "selecting" && (
          <motion.main key="sel"
            initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="flex-1 overflow-y-auto flex flex-col items-center gap-3 px-4 py-3">

            <div className="flex items-center gap-4">
              <div>
                <h3 style={{ fontWeight: 900, fontSize: 26, color: WHITE }}>🪑 اختر كرسيك!</h3>
                <p style={{ fontWeight: 700, fontSize: 14, color: GOLD, marginTop: 2 }}>
                  اكتب رقم الكرسي في الشات (1 – {numChairs})
                </p>
              </div>
              <Ring sec={selTimer} total={SELECT_S} />
            </div>

            <GameWheel spinning={false} players={players}
              chairCount={numChairs} chairOccupied={chairOccupied} showChairs={true} flyAnims={flyAnims} />

            <div className="w-full max-w-md">
              <p style={{ fontWeight: 700, fontSize: 14, color: WHITE, textAlign: "center", marginBottom: 8 }}>
                لم يختاروا بعد:
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {players.filter(p => !Object.values(chairOccupied).some(x => x.username === p.username)).map(p => (
                  <div key={p.username} className="flex items-center gap-2 px-3 py-1.5 rounded-xl"
                    style={{ background: SURFACE2, border: `1px solid ${GOLD_D}45` }}>
                    <img src={p.avatar} alt={p.displayName}
                      style={{ width: 26, height: 26, borderRadius: "50%", objectFit: "cover", border: `2px solid ${GOLD}` }}
                      onError={e => { (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${p.username}`; }} />
                    <span style={{ fontWeight: 800, fontSize: 13, color: WHITE }}>{p.displayName}</span>
                  </div>
                ))}
              </div>
            </div>

            <motion.button onClick={() => { clrAll(); doEliminate(); }}
              whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
              style={{ padding: "14px 38px", borderRadius: 18, fontWeight: 900, fontSize: 16, color: "#000",
                background: `linear-gradient(135deg, ${GOLD_LT}, ${GOLD})`,
                boxShadow: `0 0 28px ${GOLD}55`, border: "none", cursor: "pointer" }}>
              ❌ انتهى الاختيار
            </motion.button>
          </motion.main>
        )}

        {/* ══ ELIMINATION ═════════════════════════════════════════════════════ */}
        {phase === "elimination" && (
          <motion.main key="elim"
            initial={{ opacity: 0, scale: 0.88 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
            className="flex-1 flex flex-col items-center justify-center gap-6 px-5">

            {eliminated ? (
              <>
                <motion.span animate={{ scale: [1, 1.18, 1] }} transition={{ duration: 1.1, repeat: Infinity }}
                  style={{ fontSize: 64 }}>💥</motion.span>
                <div className="flex flex-col items-center gap-3 text-center">
                  <p style={{ fontWeight: 900, fontSize: 22, color: WHITE }}>تم إقصاء</p>
                  <div style={{ position: "relative" }}>
                    <img src={eliminated.avatar} alt={eliminated.displayName}
                      style={{ width: 120, height: 120, borderRadius: 22, objectFit: "cover",
                        border: "4px solid #f43f5e", boxShadow: "0 0 50px rgba(244,63,94,0.85)" }}
                      onError={e => { (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${eliminated.username}`; }} />
                    <div style={{ position: "absolute", bottom: -10, right: -10, fontSize: 28 }}>❌</div>
                  </div>
                  <h2 style={{ fontWeight: 900, fontSize: 38, color: "#f43f5e", textShadow: "0 0 30px #f43f5e" }}>
                    {eliminated.displayName}
                  </h2>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <Ring sec={cdTimer} total={5} />
                  <p style={{ fontWeight: 700, fontSize: 14, color: WHITE }}>الجولة القادمة تبدأ تلقائياً</p>
                </div>
                <div className="flex flex-wrap justify-center gap-2 max-w-xs">
                  {players.filter(p => p.username !== eliminated.username).map(p => (
                    <div key={p.username} className="flex flex-col items-center gap-1">
                      <img src={p.avatar} alt={p.displayName}
                        style={{ width: 46, height: 46, borderRadius: 13, objectFit: "cover",
                          border: `2.5px solid ${GOLD}`, boxShadow: `0 0 12px ${GOLD}60` }}
                        onError={e => { (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${p.username}`; }} />
                      <span style={{ fontSize: 10, color: GOLD, fontWeight: 700, maxWidth: 46,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {p.displayName}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="text-center">
                <span style={{ fontSize: 60 }}>🤝</span>
                <p style={{ fontWeight: 900, fontSize: 24, color: GOLD, marginTop: 12 }}>الجميع وجدوا كرسياً!</p>
              </div>
            )}
            <motion.button onClick={() => { clrAll(); doNextRound(eliminated); }}
              whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.97 }}
              style={{ padding: "14px 40px", borderRadius: 18, fontWeight: 900, fontSize: 16, color: "#000",
                background: `linear-gradient(135deg, ${GOLD_LT}, ${GOLD})`,
                boxShadow: `0 0 28px ${GOLD}55`, border: "none", cursor: "pointer" }}>
              {(players.length - (eliminated ? 1 : 0)) <= 1 ? "🏆 عرض الفائز" : "▶ الجولة التالية الآن"}
            </motion.button>
          </motion.main>
        )}

        {/* ══ WINNER ══════════════════════════════════════════════════════════ */}
        {phase === "winner" && (
          <motion.main key="win"
            initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
            className="flex-1 flex flex-col items-center justify-center gap-6 px-5">
            <Confetti />

            <motion.span animate={{ y: [0, -22, 0] }} transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              style={{ fontSize: 80 }}>🏆</motion.span>

            {winner && (
              <div className="flex flex-col items-center gap-5 text-center">
                <p style={{ fontWeight: 800, fontSize: 20, color: WHITE }}>
                  الفائز بلعبة الكراسي الموسيقية
                </p>

                {/* Photo with spinning ring — like XO winner */}
                <div style={{ position: "relative" }}>
                  <motion.div animate={{ rotate: 360 }} transition={{ duration: 4.5, repeat: Infinity, ease: "linear" }}
                    style={{ position: "absolute", inset: -8, borderRadius: 28,
                      background: `conic-gradient(${GOLD}, #e040fb, #00e5ff, ${GOLD})`,
                      filter: "blur(5px)" }} />
                  <img src={winner.avatar} alt={winner.displayName}
                    style={{ position: "relative", width: 150, height: 150, borderRadius: 26,
                      objectFit: "cover", border: `4px solid ${GOLD}`,
                      boxShadow: `0 0 60px ${GOLD}90, 0 0 120px ${GOLD_D}50` }}
                    onError={e => { (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${winner.username}`; }} />
                </div>

                <h2 style={{ fontWeight: 900, fontSize: 46, color: GOLD,
                  textShadow: `0 0 36px ${GOLD}, 0 0 72px ${GOLD_D}, 0 2px 8px rgba(0,0,0,0.9)` }}>
                  {winner.displayName}
                </h2>
                <p style={{ fontWeight: 800, fontSize: 17, color: GOLD_LT }}>
                  🎉 بطل لعبة الكراسي الموسيقية 🎉
                </p>
              </div>
            )}

            <div className="flex gap-3">
              <motion.button onClick={doRestart} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.97 }}
                className="flex items-center gap-2"
                style={{ padding: "14px 28px", borderRadius: 18, fontWeight: 800, fontSize: 15, color: "#000",
                  background: `linear-gradient(135deg, ${GOLD_LT}, ${GOLD})`,
                  boxShadow: `0 0 24px ${GOLD}60`, border: "none", cursor: "pointer" }}>
                <RotateCcw size={15} /> العب مجدداً
              </motion.button>
              <motion.button onClick={() => navigate("/")} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.97 }}
                className="flex items-center gap-2"
                style={{ padding: "14px 28px", borderRadius: 18, fontWeight: 800, fontSize: 15, color: GOLD,
                  background: SURFACE2, border: `1.5px solid ${GOLD_D}55`, cursor: "pointer" }}>
                <ArrowRight size={15} /> الرئيسية
              </motion.button>
            </div>
          </motion.main>
        )}

      </AnimatePresence>
    </div>
  );
}
