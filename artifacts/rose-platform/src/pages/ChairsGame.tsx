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

// ─── Types ────────────────────────────────────────────────────────────────────
type Phase = "lobby" | "spinning" | "selecting" | "elimination" | "winner";
interface Player { username: string; displayName: string; avatar: string }
interface FlyAnim { id: number; player: Player; fx: number; fy: number; tx: number; ty: number }

// ─── Light theme palette ──────────────────────────────────────────────────────
const AMB    = "#f59e0b";   // amber — primary accent
const AMB_D  = "#b45309";   // dark amber
const AMB_L  = "#fef3c7";   // light amber
const BG     = "#fffbf0";   // warm white page background
const CARD   = "#ffffff";   // card white
const CARD2  = "#fff8e7";   // slightly warm card
const BRDR   = "#fde68a";   // warm border
const TXT    = "#1c1917";   // stone-900
const TXT_M  = "#78716c";   // stone-500
const RED    = "#ef4444";
const GREEN  = "#16a34a";
const SELECT_S = 20;

// ─── Wheel geometry ───────────────────────────────────────────────────────────
const TOTAL    = 520;       // full canvas size (includes chairs)
const CX       = TOTAL / 2; // 260
const CY       = TOTAL / 2;
const DISC_R   = 140;       // visible wheel disc radius
const PLAYER_R = 158;       // player avatar orbit (just outside disc)
const CHAIR_R  = 222;       // chair positions (outside player orbit)

// ─── Confetti ─────────────────────────────────────────────────────────────────
const CC = [AMB, "#f97316", "#22c55e", "#3b82f6", "#ec4899", "#8b5cf6"];
function Confetti() {
  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 50, overflow: "hidden" }}>
      {Array.from({ length: 60 }).map((_, i) => (
        <motion.div key={i}
          style={{ position: "absolute", borderRadius: 3,
            width: Math.random() * 10 + 5, height: Math.random() * 10 + 5,
            left: `${Math.random() * 100}%`, top: -16,
            background: CC[i % CC.length] }}
          animate={{ y: ["0vh", "110vh"], rotate: [0, (Math.random() > .5 ? 1 : -1) * 720], opacity: [1, 0.9, 0] }}
          transition={{ duration: Math.random() * 2.5 + 1.5, delay: Math.random() * 1.5, ease: "linear" }} />
      ))}
    </div>
  );
}

// ─── Timer ring ───────────────────────────────────────────────────────────────
function Ring({ sec, total }: { sec: number; total: number }) {
  const r = 22; const circ = 2 * Math.PI * r;
  const warn = sec <= 5;
  return (
    <svg width="56" height="56" viewBox="0 0 56 56">
      <circle cx="28" cy="28" r={r} fill="none" stroke={`${AMB}30`} strokeWidth="4" />
      <circle cx="28" cy="28" r={r} fill="none"
        stroke={warn ? RED : AMB} strokeWidth="4"
        strokeDasharray={`${circ * (sec / total)} ${circ}`} strokeLinecap="round"
        style={{ transform: "rotate(-90deg)", transformOrigin: "center", transition: "stroke-dasharray 0.85s linear" }} />
      <text x="28" y="33" textAnchor="middle" fontSize="14" fontWeight="900"
        fill={warn ? RED : AMB_D}>{sec}</text>
    </svg>
  );
}

// ─── Chair Tile ───────────────────────────────────────────────────────────────
function ChairTile({ num, player, size = 52 }: { num: number; player?: Player; size?: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
      {/* Number badge — ABOVE chair */}
      <div style={{
        background: player ? AMB : AMB_D, color: CARD,
        fontWeight: 900, fontSize: 13, lineHeight: "20px",
        padding: "0 8px", borderRadius: 10, minWidth: 24, textAlign: "center",
        boxShadow: `0 2px 6px ${AMB}50`,
      }}>{num}</div>

      {/* Chair tile */}
      <motion.div
        animate={player
          ? { boxShadow: [`0 0 0px ${AMB}40`, `0 0 14px ${AMB}90`, `0 0 0px ${AMB}40`] }
          : { boxShadow: ["0 2px 8px rgba(0,0,0,0.08)", "0 2px 8px rgba(0,0,0,0.08)"] }}
        transition={{ duration: 0.75, repeat: Infinity }}
        style={{
          width: size, height: size, borderRadius: 14, overflow: "hidden",
          border: `2.5px solid ${player ? AMB : BRDR}`,
          background: player ? AMB_L : CARD,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
        {player ? (
          <motion.img initial={{ scale: 0 }} animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 400, damping: 22 }}
            src={player.avatar} alt={player.displayName}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            onError={e => { (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${player.username}`; }} />
        ) : (
          <span style={{ fontSize: size * 0.52 }}>🪑</span>
        )}
      </motion.div>

      {/* Name under chair if occupied */}
      {player && (
        <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          style={{ fontSize: 9, color: AMB_D, fontWeight: 800,
            maxWidth: size + 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {player.displayName}
        </motion.span>
      )}
    </div>
  );
}

// ─── Game Wheel ───────────────────────────────────────────────────────────────
function GameWheel({ spinning, players, chairCount, chairOccupied, flyAnims }: {
  spinning: boolean;
  players: Player[];
  chairCount: number;
  chairOccupied: Record<number, Player>;
  flyAnims: FlyAnim[];
}) {
  const chairPos = Array.from({ length: chairCount }, (_, i) => {
    const a = (i / chairCount) * 2 * Math.PI - Math.PI / 2;
    return { num: i + 1, x: CX + CHAIR_R * Math.cos(a), y: CY + CHAIR_R * Math.sin(a) };
  });

  return (
    <div style={{ width: TOTAL, height: TOTAL, position: "relative", flexShrink: 0, maxWidth: "100%" }}>

      {/* Disc shadow ring */}
      <div style={{
        position: "absolute",
        left: CX - DISC_R - 12, top: CY - DISC_R - 12,
        width: (DISC_R + 12) * 2, height: (DISC_R + 12) * 2,
        borderRadius: "50%",
        boxShadow: spinning
          ? `0 0 0 5px ${AMB}, 0 0 32px ${AMB}80, 0 8px 32px rgba(0,0,0,0.15)`
          : `0 0 0 4px ${BRDR}, 0 6px 24px rgba(0,0,0,0.10)`,
        transition: "box-shadow 0.5s",
        background: "transparent",
      }} />

      {/* Outer spinning ring */}
      <motion.div
        animate={{ rotate: spinning ? 360 : 0 }}
        transition={spinning ? { duration: 3, repeat: Infinity, ease: "linear" } : { duration: 0.4 }}
        style={{
          position: "absolute",
          left: CX - DISC_R - 8, top: CY - DISC_R - 8,
          width: (DISC_R + 8) * 2, height: (DISC_R + 8) * 2,
          borderRadius: "50%",
          background: spinning
            ? `conic-gradient(${AMB}, #f97316, #fbbf24, ${AMB}, #f97316, #fbbf24, ${AMB})`
            : `conic-gradient(${BRDR}, #fde68a, ${BRDR})`,
          filter: "blur(0px)",
        }} />

      {/* Disc body — light warm white */}
      <div style={{
        position: "absolute",
        left: CX - DISC_R, top: CY - DISC_R,
        width: DISC_R * 2, height: DISC_R * 2,
        borderRadius: "50%",
        background: `radial-gradient(circle at 38% 32%, #fffef8 0%, #fff8e1 60%, #fef3c7 100%)`,
        boxShadow: "inset 0 2px 12px rgba(245,158,11,0.12), inset 0 -2px 8px rgba(0,0,0,0.06)",
        border: `3px solid ${CARD}`,
        zIndex: 2,
      }}>
        {/* Inner decorative rings */}
        <div style={{ position: "absolute", inset: 18, borderRadius: "50%",
          border: `1.5px solid ${AMB}30` }} />
        <div style={{ position: "absolute", inset: 38, borderRadius: "50%",
          border: `1px solid ${AMB}20` }} />
        {/* Dot grid */}
        <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%",
          borderRadius: "50%", opacity: 0.12 }}>
          <defs>
            <pattern id="cgL" x="0" y="0" width="16" height="16" patternUnits="userSpaceOnUse">
              <circle cx="8" cy="8" r="1.5" fill={AMB_D} />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#cgL)" />
        </svg>
      </div>

      {/* Player orbit */}
      <div className={spinning ? "chairs-orbit" : ""}
        style={{ position: "absolute", inset: 0, zIndex: 3 }}>
        {players.map((p, i) => {
          const rad = (i / players.length) * 2 * Math.PI - Math.PI / 2;
          const px  = CX + PLAYER_R * Math.cos(rad);
          const py  = CY + PLAYER_R * Math.sin(rad);
          const sat = Object.values(chairOccupied).some(x => x.username === p.username);
          return (
            <div key={p.username} style={{ position: "absolute", left: px - 22, top: py - 22,
              width: 44, height: 44 }}>
              <div className={spinning ? "chairs-counter" : ""}
                style={{ width: "100%", height: "100%" }}>
                <div style={{
                  width: 44, height: 44, borderRadius: "50%", overflow: "hidden",
                  border: `3px solid ${sat ? AMB : AMB_D}`,
                  boxShadow: `0 0 ${sat ? 12 : 6}px ${sat ? AMB : AMB_D}80`,
                  opacity: !spinning && sat ? 0.25 : 1,
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

      {/* Center: spinning music icon */}
      <div style={{ position: "absolute", left: CX - 28, top: CY - 28, width: 56, height: 56,
        zIndex: 4, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {spinning ? (
          <motion.span animate={{ scale: [1, 1.3, 1], rotate: [0, 15, -15, 0] }}
            transition={{ duration: 0.85, repeat: Infinity }}
            style={{ fontSize: 36 }}>🎵</motion.span>
        ) : (
          <span style={{ fontSize: 30 }}>🪑</span>
        )}
      </div>

      {/* Chairs — arranged OUTSIDE the wheel */}
      {chairPos.map(({ num, x, y }) => (
        <motion.div key={num}
          initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: (num - 1) * 0.05, type: "spring", stiffness: 360, damping: 22 }}
          style={{ position: "absolute", left: x - 32, top: y - 48, zIndex: 5 }}>
          <ChairTile num={num} player={chairOccupied[num]} size={50} />
        </motion.div>
      ))}

      {/* Flying avatar animations */}
      {flyAnims.map(a => (
        <motion.div key={a.id}
          initial={{ x: a.fx - 22, y: a.fy - 22, scale: 1, opacity: 1 }}
          animate={{ x: a.tx - 32, y: a.ty - 38, scale: 0.8, opacity: 0 }}
          transition={{ duration: 0.5, ease: "easeInOut" }}
          style={{ position: "absolute", left: 0, top: 0, width: 44, height: 44,
            pointerEvents: "none", zIndex: 20 }}>
          <div style={{ width: 44, height: 44, borderRadius: "50%", overflow: "hidden",
            border: `3px solid ${AMB}`, boxShadow: `0 0 12px ${AMB}` }}>
            <img src={a.player.avatar}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
              onError={e => { (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${a.player.username}`; }} />
          </div>
        </motion.div>
      ))}

      {/* Top pointer diamond */}
      <div style={{ position: "absolute", top: CY - DISC_R - 18, left: CX - 7, zIndex: 6 }}>
        <div style={{ width: 14, height: 14, background: AMB, transform: "rotate(45deg)",
          borderRadius: 3, boxShadow: `0 2px 8px ${AMB}80` }} />
      </div>
    </div>
  );
}

// ─── Volume bar ───────────────────────────────────────────────────────────────
function VolumeBar({ vol, onChange }: { vol: number; onChange: (v: number) => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <button onClick={() => onChange(Math.max(0, vol - 20))}
        style={{ color: AMB_D, background: "none", border: "none", cursor: "pointer", padding: 2, lineHeight: 0 }}>
        <VolumeX size={15} />
      </button>
      <div style={{ display: "flex", gap: 3, alignItems: "flex-end" }}>
        {[20, 40, 60, 80, 100].map(s => (
          <motion.div key={s} onClick={() => onChange(s)}
            animate={{ background: vol >= s ? AMB : BRDR }}
            style={{ width: 5, height: 5 + (s / 100) * 14, borderRadius: 3, cursor: "pointer" }} />
        ))}
      </div>
      <button onClick={() => onChange(Math.min(100, vol + 20))}
        style={{ color: AMB_D, background: "none", border: "none", cursor: "pointer", padding: 2, lineHeight: 0 }}>
        <Volume2 size={15} />
      </button>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function ChairsGame() {
  const [, navigate] = useLocation();
  const { user } = useAuth();

  const [phase, setPhase]                 = useState<Phase>("lobby");
  const [players, setPlayers]             = useState<Player[]>([]);
  const [roundNum, setRoundNum]           = useState(1);
  const [chairOccupied, setChairOccupied] = useState<Record<number, Player>>({});
  const [eliminated, setEliminated]       = useState<Player | null>(null);
  const [winner, setWinner]               = useState<Player | null>(null);
  const [connected, setConnected]         = useState(false);
  const [currentSong, setCurrentSong]     = useState<Song | null>(null);
  const [selTimer, setSelTimer]           = useState(SELECT_S);
  const [cdTimer, setCdTimer]             = useState(5);
  const [volume, setVolume]               = useState(80);
  const [flyAnims, setFlyAnims]           = useState<FlyAnim[]>([]);

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
  const clrAll    = () => [selInt, cdInt, clipInt].forEach(r => { if (r.current) { clearInterval(r.current); r.current = null; } });

  const changeVolume = useCallback((v: number) => {
    setVolume(v); try { ytRef.current?.setVolume(v); } catch {}
  }, []);

  // Flying seat animation
  useEffect(() => {
    const prev = prevChairRef.current; const cur = playersRef.current;
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
      setTimeout(() => setFlyAnims(p => p.filter(a => !ids.has(a.id))), 650);
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
    if (rem.length <= 1) {
      setWinner(rem[0] ?? null); setPlayers(rem);
      phaseRef.current = "winner"; setPhase("winner");
    } else {
      setPlayers(rem); setRoundNum(r => r + 1);
      setFlyAnims([]);
      setTimeout(() => startSpin(rem), 150);
    }
  };

  const stopSpin = useCallback(() => {
    clrAll(); stopMusic(); prevChairRef.current = {};
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
    setEliminated(null); setFlyAnims([]);
    phaseRef.current = "spinning"; setPhase("spinning");
    playMusic();
    const dur = CLIP_DURATIONS[Math.floor(Math.random() * CLIP_DURATIONS.length)];
    let t = dur;
    clipInt.current = setInterval(() => {
      t--;
      if (t <= 0) { clearInterval(clipInt.current!); clipInt.current = null; stopSpin(); }
    }, 1000);
  };

  const doStartSpin = useCallback((pl?: Player[]) => startSpin(pl ?? playersRef.current), []);

  const doRestart = () => {
    clrAll(); stopMusic();
    setPlayers([]); playersRef.current = [];
    setChairOccupied({}); chairRef.current = {}; prevChairRef.current = {};
    setEliminated(null); setWinner(null); setRoundNum(1);
    setCurrentSong(null); setFlyAnims([]);
    phaseRef.current = "lobby"; setPhase("lobby");
  };

  const handleChat = useCallback((username: string, text: string) => {
    const msg = text.trim().toLowerCase();
    const ph  = phaseRef.current;
    const pl  = playersRef.current;

    if (msg === "join" && ph === "lobby") {
      if (pl.some(p => p.username === username)) return;
      const np: Player = { username, displayName: username, avatar: `https://unavatar.io/twitch/${username}` };
      setPlayers(prev => { const n = [...prev, np]; playersRef.current = n; return n; });
      fetchTwitchPhoto(username).then(url =>
        setPlayers(prev => { const n = prev.map(p => p.username === username ? { ...p, avatar: url } : p); playersRef.current = n; return n; })
      );
      return;
    }

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
  }, [doEliminate]);

  // Twitch IRC
  if (!connRef.current && user?.username) {
    connRef.current = true;
    setTimeout(() => {
      const ws = new WebSocket("wss://irc-ws.chat.twitch.tv");
      ws.onopen  = () => { ws.send("PASS SCHMOOPIIE"); ws.send(`NICK justinfan${Math.floor(Math.random() * 89999) + 10000}`); ws.send(`JOIN #${user.username.toLowerCase()}`); };
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

  const isPlaying = phase !== "lobby";

  return (
    <div className="h-screen flex flex-col overflow-hidden" dir="rtl"
      style={{ background: BG, fontFamily: "'Cairo','Inter',sans-serif" }}>

      {/* Hidden YT */}
      <div style={{ position: "absolute", opacity: 0, pointerEvents: "none", width: 1, height: 1, overflow: "hidden" }}>
        <div ref={ytDivRef} />
      </div>

      {/* ── Header ────────────────────────────────────────────────────────────── */}
      <header style={{ background: CARD, borderBottom: `2px solid ${BRDR}`,
        boxShadow: "0 2px 12px rgba(245,158,11,0.10)" }}
        className="flex items-center justify-between px-5 py-3 flex-shrink-0 z-20">
        <button onClick={() => { clrAll(); stopMusic(); navigate("/"); }}
          className="flex items-center gap-1.5 transition-opacity hover:opacity-70"
          style={{ color: AMB_D, fontWeight: 700, fontSize: 14 }}>
          <ArrowRight size={15} /> رجوع
        </button>
        <div className="flex items-center gap-2">
          <span style={{ fontSize: 20 }}>🪑</span>
          <span style={{ fontWeight: 900, fontSize: 17, color: AMB_D }}>
            لعبة الكراسي{roundNum > 1 ? ` — الجولة ${roundNum}` : ""}
          </span>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full"
          style={{
            border: `1.5px solid ${connected ? AMB : "#e5e7eb"}`,
            background: connected ? AMB_L : "#f9fafb",
            color: connected ? AMB_D : TXT_M,
          }}>
          {connected ? <Wifi size={11} /> : <WifiOff size={11} />}
          <span style={{ fontWeight: 700, fontSize: 11 }}>
            {connected ? user?.username : "غير متصل"}
          </span>
        </div>
      </header>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* LOBBY                                                                  */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {!isPlaying && (
        <main className="flex-1 overflow-y-auto flex flex-col items-center px-4 py-6 gap-5">

          {/* Big join instruction */}
          <div className="text-center">
            <h1 style={{ fontSize: 42, fontWeight: 900, color: TXT, lineHeight: 1.2 }}>
              اكتب{" "}
              <span style={{ color: AMB, background: AMB_L, padding: "2px 14px", borderRadius: 12,
                border: `2px solid ${BRDR}` }}>
                join
              </span>{" "}
              في الشات
            </h1>
            <p style={{ fontSize: 16, color: TXT_M, fontWeight: 600, marginTop: 10 }}>
              join in chat to join the musical chairs game 🎵
            </p>
          </div>

          {/* Player count */}
          <div className="w-full max-w-md flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users size={16} color={AMB} />
              <span style={{ fontWeight: 800, fontSize: 15, color: TXT }}>players joined</span>
            </div>
            <span style={{ fontWeight: 900, fontSize: 14, padding: "4px 14px", borderRadius: 20,
              background: AMB_L, color: AMB_D, border: `1.5px solid ${BRDR}` }}>
              {players.length} لاعب
            </span>
          </div>

          {/* Empty state or player grid */}
          {players.length === 0 ? (
            <div className="w-full max-w-md flex flex-col items-center py-12 rounded-2xl"
              style={{ border: `2px dashed ${BRDR}`, background: CARD }}>
              <motion.span animate={{ y: [0, -8, 0] }} transition={{ duration: 2, repeat: Infinity }}
                style={{ fontSize: 52 }}>🪑</motion.span>
              <p style={{ color: AMB_D, fontWeight: 800, fontSize: 18, marginTop: 12 }}>
                waiting for players...
              </p>
              <p style={{ color: TXT_M, fontWeight: 600, fontSize: 14, marginTop: 6 }}>
                اطلب من المشاهدين يكتبون join
              </p>
            </div>
          ) : (
            <div className="w-full max-w-md grid grid-cols-3 gap-3">
              {players.map((p, i) => (
                <motion.div key={p.username}
                  initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.04, type: "spring", stiffness: 300, damping: 22 }}
                  className="flex flex-col items-center gap-2 p-3 rounded-2xl"
                  style={{ background: CARD, border: `2px solid ${BRDR}`,
                    boxShadow: "0 2px 12px rgba(245,158,11,0.10)" }}>
                  <div style={{ width: 68, height: 68, borderRadius: "50%", overflow: "hidden",
                    border: `3px solid ${AMB}`, boxShadow: `0 0 14px ${AMB}50` }}>
                    <img src={p.avatar} alt={p.displayName}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      onError={e => { (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${p.username}`; }} />
                  </div>
                  <span style={{ fontWeight: 800, fontSize: 13, color: TXT, textAlign: "center",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", width: "100%" }}>
                    {p.displayName}
                  </span>
                </motion.div>
              ))}
            </div>
          )}

          {/* Start button */}
          <div className="w-full max-w-md">
            <motion.button
              onClick={() => doStartSpin()}
              disabled={players.length < 2}
              whileHover={players.length >= 2 ? { scale: 1.02, y: -2 } : {}}
              whileTap={players.length >= 2 ? { scale: 0.97 } : {}}
              style={{
                width: "100%", padding: "18px 0", borderRadius: 18,
                fontWeight: 900, fontSize: 20,
                background: players.length >= 2
                  ? `linear-gradient(135deg, #fbbf24, ${AMB}, ${AMB_D})`
                  : "#f3f4f6",
                color: players.length >= 2 ? CARD : "#9ca3af",
                boxShadow: players.length >= 2
                  ? `0 6px 28px ${AMB}60, 0 2px 8px rgba(0,0,0,0.12)`
                  : "none",
                border: `2px solid ${players.length >= 2 ? AMB : "#e5e7eb"}`,
                cursor: players.length >= 2 ? "pointer" : "not-allowed",
              }}>
              {players.length >= 2
                ? `▶  Play Now — ${players.length} لاعبين`
                : "waiting for players..."}
            </motion.button>
          </div>
        </main>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* PLAY SCREEN — single screen, wheel always visible                     */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {isPlaying && (
        <main className="flex-1 overflow-y-auto flex flex-col items-center px-4 py-3 gap-3">

          {/* ── Status bar (changes by phase, no transitions) ── */}
          <div className="w-full max-w-xl">

            {/* SPINNING */}
            {phase === "spinning" && (
              <div className="flex items-center justify-between px-4 py-3 rounded-2xl"
                style={{ background: CARD, border: `2px solid ${BRDR}`,
                  boxShadow: "0 2px 12px rgba(245,158,11,0.12)" }}>
                <div>
                  <p style={{ fontWeight: 900, fontSize: 18, color: TXT }}>
                    🎵 الجولة {roundNum} — العجلة تدور!
                  </p>
                  <p style={{ fontWeight: 600, fontSize: 13, color: TXT_M, marginTop: 2 }}>
                    {players.length} لاعبين — {numChairs} كراسي
                  </p>
                </div>
                {currentSong && (
                  <div className="flex flex-col items-end gap-1.5">
                    <div className="flex items-center gap-1.5">
                      <motion.div animate={{ scale: [1, 1.3, 1] }} transition={{ duration: 0.7, repeat: Infinity }}>
                        <Music2 size={14} color={AMB} />
                      </motion.div>
                      <span style={{ fontWeight: 700, fontSize: 13, color: AMB_D }}>
                        {currentSong.title}
                      </span>
                    </div>
                    <VolumeBar vol={volume} onChange={changeVolume} />
                  </div>
                )}
              </div>
            )}

            {/* SELECTING */}
            {phase === "selecting" && (
              <div className="flex items-center justify-between px-4 py-3 rounded-2xl"
                style={{ background: CARD, border: `2px solid ${AMB}`,
                  boxShadow: `0 4px 20px ${AMB}30` }}>
                <div>
                  <p style={{ fontWeight: 900, fontSize: 18, color: TXT }}>
                    🪑 اختر كرسيك!
                  </p>
                  <p style={{ fontWeight: 600, fontSize: 13, color: TXT_M, marginTop: 2 }}>
                    اكتب رقم الكرسي في الشات (1–{numChairs})
                  </p>
                </div>
                <Ring sec={selTimer} total={SELECT_S} />
              </div>
            )}

            {/* ELIMINATION */}
            {phase === "elimination" && eliminated && (
              <motion.div initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                className="flex items-center gap-4 px-4 py-3 rounded-2xl"
                style={{ background: "#fef2f2", border: `2px solid ${RED}60`,
                  boxShadow: `0 4px 20px ${RED}25` }}>
                <motion.span animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 0.9, repeat: Infinity }}
                  style={{ fontSize: 36 }}>💥</motion.span>
                <div className="flex items-center gap-3 flex-1">
                  <img src={eliminated.avatar} alt={eliminated.displayName}
                    style={{ width: 56, height: 56, borderRadius: 14, objectFit: "cover",
                      border: `3px solid ${RED}`, boxShadow: `0 0 18px ${RED}60` }}
                    onError={e => { (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${eliminated.username}`; }} />
                  <div>
                    <p style={{ fontWeight: 900, fontSize: 18, color: RED }}>
                      {eliminated.displayName}
                    </p>
                    <p style={{ fontWeight: 600, fontSize: 13, color: TXT_M }}>
                      تم إقصاؤه! الجولة التالية تبدأ تلقائياً
                    </p>
                  </div>
                </div>
                <Ring sec={cdTimer} total={5} />
              </motion.div>
            )}

            {/* WINNER */}
            {phase === "winner" && winner && (
              <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                className="flex items-center gap-4 px-4 py-4 rounded-2xl"
                style={{ background: "#f0fdf4", border: `2px solid ${GREEN}60`,
                  boxShadow: `0 4px 24px ${GREEN}30` }}>
                <Confetti />
                <motion.span animate={{ y: [0, -10, 0] }} transition={{ duration: 1.5, repeat: Infinity }}
                  style={{ fontSize: 42 }}>🏆</motion.span>
                <div className="flex items-center gap-3 flex-1">
                  <div style={{ position: "relative" }}>
                    <motion.div animate={{ rotate: 360 }} transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                      style={{ position: "absolute", inset: -4, borderRadius: "50%",
                        background: `conic-gradient(${AMB},#22c55e,#3b82f6,${AMB})`, filter: "blur(3px)" }} />
                    <img src={winner.avatar} alt={winner.displayName}
                      style={{ position: "relative", width: 64, height: 64, borderRadius: "50%",
                        objectFit: "cover", border: `3px solid ${AMB}` }}
                      onError={e => { (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${winner.username}`; }} />
                  </div>
                  <div>
                    <p style={{ fontWeight: 900, fontSize: 22, color: GREEN }}>
                      {winner.displayName}
                    </p>
                    <p style={{ fontWeight: 700, fontSize: 13, color: TXT_M }}>
                      🎉 الفائز بلعبة الكراسي الموسيقية!
                    </p>
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <motion.button onClick={doRestart} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.96 }}
                    className="flex items-center gap-1.5"
                    style={{ padding: "10px 18px", borderRadius: 14, fontWeight: 800, fontSize: 14,
                      background: `linear-gradient(135deg, #fbbf24, ${AMB})`, color: CARD,
                      boxShadow: `0 4px 14px ${AMB}50`, border: "none", cursor: "pointer" }}>
                    <RotateCcw size={13} /> العب مجدداً
                  </motion.button>
                  <motion.button onClick={() => navigate("/")} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.96 }}
                    className="flex items-center gap-1.5 justify-center"
                    style={{ padding: "8px 18px", borderRadius: 14, fontWeight: 700, fontSize: 13,
                      background: CARD, color: TXT_M, border: `1.5px solid ${BRDR}`, cursor: "pointer" }}>
                    <ArrowRight size={13} /> الرئيسية
                  </motion.button>
                </div>
              </motion.div>
            )}
          </div>

          {/* ── Wheel — always visible during play ── */}
          <div style={{ display: "flex", justifyContent: "center", width: "100%",
            maxWidth: TOTAL, margin: "0 auto" }}>
            <GameWheel
              spinning={phase === "spinning"}
              players={players}
              chairCount={numChairs}
              chairOccupied={chairOccupied}
              flyAnims={flyAnims}
            />
          </div>

          {/* ── Unseated players (selecting phase) ── */}
          {phase === "selecting" && (
            <div className="w-full max-w-xl">
              <div className="flex flex-wrap justify-center gap-2 mb-3">
                {players.filter(p => !Object.values(chairOccupied).some(x => x.username === p.username)).map(p => (
                  <div key={p.username} className="flex items-center gap-2 px-3 py-1.5 rounded-xl"
                    style={{ background: CARD, border: `1.5px solid ${BRDR}`,
                      boxShadow: "0 1px 6px rgba(0,0,0,0.06)" }}>
                    <img src={p.avatar} alt={p.displayName}
                      style={{ width: 26, height: 26, borderRadius: "50%", objectFit: "cover",
                        border: `2px solid ${AMB}` }}
                      onError={e => { (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${p.username}`; }} />
                    <span style={{ fontWeight: 700, fontSize: 13, color: TXT }}>{p.displayName}</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-center">
                <motion.button onClick={() => { clrAll(); doEliminate(); }}
                  whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
                  style={{ padding: "12px 32px", borderRadius: 16, fontWeight: 900, fontSize: 15,
                    background: `linear-gradient(135deg, #fbbf24, ${AMB}, ${AMB_D})`,
                    color: CARD, boxShadow: `0 4px 18px ${AMB}50`, border: "none", cursor: "pointer" }}>
                  ❌ انتهى الاختيار — تحديد الخاسر
                </motion.button>
              </div>
            </div>
          )}

          {/* ── Remaining players during elimination ── */}
          {phase === "elimination" && (
            <div className="flex flex-wrap justify-center gap-2 max-w-sm">
              {players.filter(p => p.username !== eliminated?.username).map(p => (
                <div key={p.username} className="flex flex-col items-center gap-1">
                  <img src={p.avatar} alt={p.displayName}
                    style={{ width: 44, height: 44, borderRadius: 12, objectFit: "cover",
                      border: `2.5px solid ${AMB}`, boxShadow: `0 0 10px ${AMB}40` }}
                    onError={e => { (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${p.username}`; }} />
                  <span style={{ fontSize: 10, color: AMB_D, fontWeight: 700, maxWidth: 44,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {p.displayName}
                  </span>
                </div>
              ))}
            </div>
          )}

        </main>
      )}
    </div>
  );
}
