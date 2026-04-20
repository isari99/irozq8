import { useState, useRef, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { fetchTwitchAvatar, fallbackAvatar as avatarFallback } from "@/lib/twitchUser";

// ─── YouTube API ──────────────────────────────────────────────────────────────
declare global {
  interface Window { YT: any; onYouTubeIframeAPIReady?: () => void; _ytReady?: boolean }
}
let _ytPromise: Promise<void> | null = null;
function loadYT(): Promise<void> {
  if (_ytPromise) return _ytPromise;
  _ytPromise = new Promise(resolve => {
    if (window._ytReady && window.YT?.Player) { resolve(); return; }
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { window._ytReady = true; prev?.(); resolve(); };
    if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
      const s = document.createElement("script");
      s.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(s);
    }
  });
  return _ytPromise;
}

// ─── Song pool ────────────────────────────────────────────────────────────────
interface Song { ytId: string; start: number }
const SONGS: Song[] = [
  { ytId: "joevqtOJFes", start: 25 }, { ytId: "_nSq4Mtlfno", start: 30 },
  { ytId: "5Gi9Q9P0bVI", start: 24 }, { ytId: "QUBvVTNRp4Q", start: 30 },
  { ytId: "KLJA-srM_yM", start: 25 }, { ytId: "EgmXTmj62ic", start: 35 },
  { ytId: "a_vfYHbLr7Y", start: 30 }, { ytId: "qzcIKpmEBHo", start: 20 },
  { ytId: "1nlzrBWh0H8", start: 22 }, { ytId: "UFn1-pTQ85s", start: 18 },
  { ytId: "jHEYg6VZoOw", start: 15 }, { ytId: "WlqefHeYYR0", start: 32 },
  { ytId: "z6RC2T3Q7rs", start: 28 }, { ytId: "D_hH-bn5dD0", start: 22 },
  { ytId: "YRadUqAv7i8", start: 22 }, { ytId: "dNQMH3WVMNs", start: 18 },
  { ytId: "vZ0OFwpvIv0", start: 20 }, { ytId: "BQeTM1N2NjQ", start: 30 },
  { ytId: "GUYKNXvwHaM", start: 28 }, { ytId: "qSil6ttEg30", start: 25 },
];
const WHEEL_DURATIONS = [10, 15, 20]; // seconds, chosen randomly each round

// ─── Types ────────────────────────────────────────────────────────────────────
type Phase = "lobby" | "spinning" | "selecting" | "elimination" | "winner";

interface Player { username: string; displayName: string; avatar: string }

// Animation data for a player gliding from outer ring → chair
interface ClaimAnim {
  chairNum: number;
  player:   Player;
  fromX:    number; fromY: number;  // relative to disc container (top-left of 600×600)
  toX:      number; toY:   number;
}

// ─── Geometry ─────────────────────────────────────────────────────────────────
const SZ       = 680;
const CX       = 340;
const CY       = 340;
const DISC_R   = 252;
const PLAYER_R = 310;   // avatar ring radius (outside disc)
const CHAIR_R  = 148;   // chair ring radius  (inside disc)
const AVA_R    = 25;    // half of 50px avatar (used for centering)
const SELECT_S = 20;
const CYAN     = "#00d4ff";

// pre-compute a player's outer-ring position — rotDeg spins all players together
function playerPos(idx: number, total: number, rotDeg = 0) {
  const a = (idx / total) * 2 * Math.PI - Math.PI / 2 + (rotDeg * Math.PI / 180);
  return { x: CX + PLAYER_R * Math.cos(a), y: CY + PLAYER_R * Math.sin(a) };
}
// pre-compute a chair's position (center)
function chairPos(idx: number, total: number) {   // idx is 0-based
  const a = (idx / total) * 2 * Math.PI - Math.PI / 2;
  return { x: CX + CHAIR_R * Math.cos(a), y: CY + CHAIR_R * Math.sin(a) };
}

// ─── ChairIcon ────────────────────────────────────────────────────────────────
function ChairIcon() {
  return (
    <svg width="38" height="30" viewBox="0 0 38 30"
      style={{ filter: `drop-shadow(0 0 6px ${CYAN})`, overflow: "visible" }}>
      <rect x="6"    y="0"  width="26" height="12" rx="4" fill="rgba(0,212,255,0.12)" stroke={CYAN} strokeWidth={1.8} />
      <rect x="1"    y="9"  width="6.5" height="13" rx="3" fill="rgba(0,212,255,0.12)" stroke={CYAN} strokeWidth={1.8} />
      <rect x="30.5" y="9"  width="6.5" height="13" rx="3" fill="rgba(0,212,255,0.12)" stroke={CYAN} strokeWidth={1.8} />
      <rect x="6"    y="11" width="26" height="12" rx="4" fill="rgba(0,212,255,0.12)" stroke={CYAN} strokeWidth={1.8} />
      <line x1="11" y1="23" x2="11" y2="30" stroke={CYAN} strokeWidth={1.8} strokeLinecap="round" />
      <line x1="27" y1="23" x2="27" y2="30" stroke={CYAN} strokeWidth={1.8} strokeLinecap="round" />
    </svg>
  );
}

// ─── Wrapper-div YouTube helper ───────────────────────────────────────────────
// YouTube replaces the target element with an <iframe>.
// We always inject a fresh div into a permanent wrapper so the next round works.
const YT_WRAPPER_ID = "cg-yt-wrapper";
function getFreshPlayerDiv(): HTMLDivElement | null {
  const w = document.getElementById(YT_WRAPPER_ID);
  if (!w) return null;
  w.innerHTML = "";
  const d = document.createElement("div");
  w.appendChild(d);
  return d;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function ChairsGame() {
  const [, navigate] = useLocation();
  const { user }     = useAuth();

  const [phase, setPhase]                 = useState<Phase>("lobby");
  const [players, setPlayers]             = useState<Player[]>([]);
  const [chairOccupied, setChairOccupied] = useState<Record<number, Player>>({});
  const [claimAnims, setClaimAnims]       = useState<ClaimAnim[]>([]);
  const [selTimer, setSelTimer]           = useState(SELECT_S);
  const [eliminated, setEliminated]       = useState<Player | null>(null);
  const [winner, setWinner]               = useState<Player | null>(null);
  const [roundNum, setRoundNum]           = useState(1);
  const [volume, setVolume]               = useState(80);
  const [twitchOk, setTwitchOk]          = useState(false);
  const [rotAngle, setRotAngle]           = useState(0);

  // RAF rotation
  const rotRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  // stale-closure refs
  const phaseRef    = useRef<Phase>("lobby");
  const playersRef  = useRef<Player[]>([]);
  const chairRef    = useRef<Record<number, Player>>({});
  const volumeRef   = useRef(80);
  volumeRef.current = volume;

  // YouTube
  const ytRef      = useRef<any>(null);
  const songIdxRef = useRef(Math.floor(Math.random() * SONGS.length));
  const failedIds  = useRef<Set<string>>(new Set());

  // timers
  const clipTimerRef = useRef<ReturnType<typeof setTimeout>  | null>(null);
  const selTimerRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const cdTimerRef   = useRef<ReturnType<typeof setTimeout>  | null>(null);

  // Twitch
  const wsRef   = useRef<WebSocket | null>(null);
  const connRef = useRef(false);

  useEffect(() => { phaseRef.current   = phase;         }, [phase]);
  useEffect(() => { playersRef.current = players;       }, [players]);
  useEffect(() => { chairRef.current   = chairOccupied; }, [chairOccupied]);

  // RAF: spin the wheel while music plays
  useEffect(() => {
    if (phase !== "spinning") {
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
      return;
    }
    const SPEED = 0.65; // degrees per frame ≈ 39°/s @ 60fps (slow & smooth)
    const step = () => {
      rotRef.current = (rotRef.current + SPEED) % 360;
      setRotAngle(rotRef.current);
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => { if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; } };
  }, [phase]);

  // pre-warm YouTube API on mount
  useEffect(() => {
    loadYT();
    return () => { stopMusic(); clearAllTimers(); };
  }, []);

  // ── YouTube ────────────────────────────────────────────────────────────────
  const stopMusic = () => {
    if (clipTimerRef.current) { clearTimeout(clipTimerRef.current); clipTimerRef.current = null; }
    if (ytRef.current) {
      try { ytRef.current.pauseVideo(); } catch {}
      try { ytRef.current.destroy();    } catch {}
      ytRef.current = null;
    }
  };

  const clearAllTimers = () => {
    if (clipTimerRef.current) { clearTimeout(clipTimerRef.current);  clipTimerRef.current = null; }
    if (selTimerRef.current)  { clearInterval(selTimerRef.current);  selTimerRef.current  = null; }
    if (cdTimerRef.current)   { clearTimeout(cdTimerRef.current);    cdTimerRef.current   = null; }
  };

  const nextSong = (): Song => {
    const pool = SONGS.filter(s => !failedIds.current.has(s.ytId));
    const src  = pool.length > 0 ? pool : SONGS;
    songIdxRef.current = (songIdxRef.current + 1) % src.length;
    return src[songIdxRef.current];
  };

  // Play one song for `durationSec` seconds, call onStop when done
  const playSong = useCallback((durationSec: number, onStop: () => void) => {
    stopMusic();
    const song = nextSong();
    const div  = getFreshPlayerDiv();
    if (!div) { onStop(); return; }

    loadYT().then(() => {
      if (phaseRef.current !== "spinning") return;
      ytRef.current = new window.YT.Player(div, {
        height: "1", width: "1",
        videoId: song.ytId,
        playerVars: { autoplay: 1, start: song.start, controls: 0,
          modestbranding: 1, rel: 0, fs: 0, iv_load_policy: 3, disablekb: 1, playsinline: 1 },
        events: {
          onReady: (e: any) => {
            try { e.target.setVolume(volumeRef.current); e.target.playVideo(); } catch {}
            clipTimerRef.current = setTimeout(() => {
              try { e.target.pauseVideo(); } catch {}
              onStop();
            }, durationSec * 1000);
          },
          onError: () => {
            failedIds.current.add(song.ytId);
            clearTimeout(clipTimerRef.current!); clipTimerRef.current = null;
            playSong(durationSec, onStop);      // retry with different song
          },
        },
      });
    }).catch(() => onStop());
  }, []);

  // ── Game flow ──────────────────────────────────────────────────────────────
  const doEliminate = useCallback(() => {
    clearAllTimers();
    stopMusic();

    const cur = playersRef.current;
    const sat = new Set(Object.values(chairRef.current).map(p => p.username));
    const out = cur.filter(p => !sat.has(p.username));
    const eli = out[Math.floor(Math.random() * out.length)] ?? null;

    setEliminated(eli);
    phaseRef.current = "elimination";
    setPhase("elimination");

    cdTimerRef.current = setTimeout(() => {
      const rem = playersRef.current.filter(p => p.username !== eli?.username);
      playersRef.current = rem;
      setPlayers(rem);

      if (rem.length <= 1) {
        setWinner(rem[0] ?? null);
        phaseRef.current = "winner";
        setPhase("winner");
      } else {
        setRoundNum(r => r + 1);
        startRound(rem);           // ← auto-start next round
      }
    }, 3500);
  }, []);

  const startSelecting = useCallback(() => {
    setChairOccupied({}); chairRef.current = {};
    setClaimAnims([]);
    phaseRef.current = "selecting";
    setPhase("selecting");

    let t = SELECT_S;
    setSelTimer(t);
    selTimerRef.current = setInterval(() => {
      t--;
      setSelTimer(t);
      if (t <= 0) {
        clearInterval(selTimerRef.current!); selTimerRef.current = null;
        doEliminate();
      }
    }, 1000);
  }, [doEliminate]);

  const startRound = useCallback((pl: Player[]) => {
    if (pl.length < 2) return;
    clearAllTimers();
    stopMusic();
    setChairOccupied({}); chairRef.current = {};
    setClaimAnims([]);
    setEliminated(null);
    phaseRef.current = "spinning";
    setPhase("spinning");

    const dur = WHEEL_DURATIONS[Math.floor(Math.random() * WHEEL_DURATIONS.length)];
    playSong(dur, () => {
      if (phaseRef.current === "spinning") startSelecting();
    });
  }, [playSong, startSelecting]);

  const handleStart = () => {
    if (playersRef.current.length < 2) return;
    setRoundNum(1);
    startRound(playersRef.current);
  };

  // ── Chat handler ───────────────────────────────────────────────────────────
  const handleChat = useCallback((username: string, text: string) => {
    const msg = text.trim().toLowerCase();
    const ph  = phaseRef.current;

    // ── Join lobby ──
    if (msg === "join" && ph === "lobby") {
      if (playersRef.current.some(p => p.username === username)) return;
      const np: Player = { username, displayName: username, avatar: avatarFallback(username) };
      setPlayers(prev => { const n = [...prev, np]; playersRef.current = n; return n; });
      fetchTwitchAvatar(username).then(avatar =>
        setPlayers(prev => {
          const n = prev.map(p => p.username === username ? { ...p, avatar } : p);
          playersRef.current = n; return n;
        })
      );
      return;
    }

    // ── Claim a chair during selecting phase ──
    if (ph === "selecting") {
      const num = parseInt(msg, 10);
      const cur = playersRef.current;
      const occ = chairRef.current;
      const numChairs = cur.length - 1;

      if (isNaN(num) || num < 1 || num > numChairs) return;
      if (occ[num]) return;                                                      // chair taken
      const pIdx = cur.findIndex(x => x.username === username);
      if (pIdx < 0) return;                                                      // not a player
      if (Object.values(occ).some(x => x.username === username)) return;        // already seated

      const p = cur[pIdx];

      // Compute animation: outer-ring position → chair position (relative to disc container)
      // Use rotRef.current (not state) to get the exact stopped angle for this event
      const from = playerPos(pIdx, cur.length, rotRef.current);
      const to   = chairPos(num - 1, numChairs);
      const anim: ClaimAnim = {
        chairNum: num, player: p,
        fromX: from.x - AVA_R, fromY: from.y - AVA_R,
        toX:   to.x   - AVA_R, toY:   to.y   - AVA_R,
      };

      setClaimAnims(prev => [...prev, anim]);

      setChairOccupied(prev => {
        const n = { ...prev, [num]: p };
        chairRef.current = n;
        // All chairs filled → trigger elimination after animation settles
        if (Object.keys(n).length >= numChairs) {
          setTimeout(() => doEliminate(), 900);
        }
        return n;
      });
    }
  }, [doEliminate]);

  // ── Twitch IRC ─────────────────────────────────────────────────────────────
  const connectTwitch = useCallback((channel: string) => {
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
    const ws = new WebSocket("wss://irc-ws.chat.twitch.tv");
    wsRef.current = ws;
    ws.onopen = () => {
      ws.send("PASS SCHMOOPIIE");
      ws.send(`NICK justinfan${Math.floor(Math.random() * 89999) + 10001}`);
      ws.send(`JOIN #${channel.toLowerCase()}`);
    };
    ws.onmessage = e => {
      for (const line of (e.data as string).split("\r\n").filter(Boolean)) {
        if (line.startsWith("PING")) { ws.send("PONG :tmi.twitch.tv"); continue; }
        if (line.includes("366") || line.includes("ROOMSTATE")) { setTwitchOk(true); continue; }
        const m = line.match(/^(?:@[^ ]+ )?:(\w+)!\w+@\w+\.tmi\.twitch\.tv PRIVMSG #\w+ :(.+)$/);
        if (m) handleChat(m[1], m[2].trim());
      }
    };
    ws.onclose = () => setTwitchOk(false);
  }, [handleChat]);

  useEffect(() => {
    if (!connRef.current && user?.username) {
      connRef.current = true;
      setTimeout(() => connectTwitch(user.username), 100);
    }
    return () => { wsRef.current?.close(); };
  }, [user?.username]);

  const handleBack = () => {
    clearAllTimers(); stopMusic(); wsRef.current?.close(); navigate("/");
  };
  const resetToLobby = () => {
    clearAllTimers(); stopMusic();
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    rotRef.current = 0; setRotAngle(0);
    setPlayers([]); playersRef.current = [];
    setChairOccupied({}); chairRef.current = {};
    setClaimAnims([]); setEliminated(null); setWinner(null); setRoundNum(1);
    phaseRef.current = "lobby"; setPhase("lobby");
  };

  // ── Derived geometry ───────────────────────────────────────────────────────
  const numChairs = Math.max(players.length - 1, 1);

  const chairPositions = Array.from({ length: numChairs }, (_, i) => ({
    num: i + 1, ...chairPos(i, numChairs),
  }));

  const playerPositions = players.map((p, i) => ({
    player: p, ...playerPos(i, players.length, rotAngle),
  }));

  const isSpinning  = phase === "spinning";
  const isSelecting = phase === "selecting";
  const isGamePhase = phase !== "lobby";

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="gradient-bg min-h-screen w-full flex flex-col items-center overflow-hidden"
      dir="rtl" style={{ fontFamily: "'Cairo','Arial',sans-serif" }}>

      {/* Permanent YouTube wrapper — never unmounts */}
      <div id={YT_WRAPPER_ID} style={{
        position: "fixed", top: -4, left: -4, width: 2, height: 2,
        overflow: "hidden", zIndex: -99, pointerEvents: "none", opacity: 0,
      }} />

      {/* ── LOBBY ─────────────────────────────────────────────────────────── */}
      <AnimatePresence>
      {!isGamePhase && (
        <motion.div key="lobby" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="w-full flex-1 flex flex-col">

          <header className="flex items-center justify-between px-6 py-4 border-b border-white/5"
            style={{ background: "rgba(5,2,14,0.92)", backdropFilter: "blur(20px)" }}>
            <button onClick={handleBack}
              className="flex items-center gap-2 text-white/40 hover:text-cyan-400 transition-colors text-sm font-bold">
              <ArrowRight size={16}/><span>رجوع</span>
            </button>
            <span className="text-xl font-black" style={{ color: CYAN, textShadow: `0 0 16px ${CYAN}` }}>
              🪑 الكراسي الموسيقية
            </span>
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${twitchOk ? "bg-cyan-400" : "bg-white/20"}`}/>
              <span className="text-xs font-bold" style={{ color: twitchOk ? CYAN : "rgba(255,255,255,0.3)" }}>
                {twitchOk ? "متصل" : "جاري..."}
              </span>
            </div>
          </header>

          <div className="flex-1 flex flex-col items-center justify-center gap-8 px-6 py-8">
            {/* Join card */}
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.1 }} className="text-center"
              style={{ background: "rgba(0,212,255,0.06)", border: `2px solid ${CYAN}40`,
                borderRadius: 24, padding: "32px 48px", boxShadow: `0 0 40px ${CYAN}15` }}>
              <p className="text-4xl font-black" style={{ color: CYAN, textShadow: `0 0 20px ${CYAN}` }}>
                اكتب{" "}
                <span style={{ background: CYAN, color: "#000", borderRadius: 10,
                  padding: "2px 14px", fontFamily: "monospace", fontSize: "2.2rem" }}>join</span>
                {" "}في الشات
              </p>
              <p className="text-base font-bold mt-3" style={{ color: "rgba(255,255,255,0.5)" }}>
                Type <span style={{ color: CYAN, fontFamily: "monospace", fontWeight: 900 }}>join</span> in chat to play
              </p>
            </motion.div>

            {/* Players grid */}
            <div style={{ background: "rgba(0,0,0,0.35)", border: "1.5px solid rgba(0,212,255,0.2)",
              borderRadius: 20, padding: "20px 28px", minWidth: 340, maxWidth: 560, width: "100%" }}>
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-black" style={{ color: CYAN }}>اللاعبون</span>
                <span className="text-sm font-bold px-3 py-1 rounded-full"
                  style={{ background: `${CYAN}20`, color: CYAN, border: `1px solid ${CYAN}40` }}>
                  {players.length} لاعب
                </span>
              </div>
              {players.length === 0
                ? <div className="flex flex-col items-center gap-2 py-6">
                    <span className="text-3xl opacity-30">🪑</span>
                    <p className="text-sm font-bold" style={{ color: "rgba(255,255,255,0.35)" }}>في انتظار اللاعبين...</p>
                  </div>
                : <div className="flex flex-wrap gap-3 justify-center">
                    {players.map((p, i) => (
                      <motion.div key={p.username}
                        initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                        transition={{ delay: i * 0.04, type: "spring", stiffness: 350, damping: 22 }}
                        className="flex flex-col items-center gap-2">
                        <div style={{ width: 52, height: 52, borderRadius: "50%", overflow: "hidden",
                          border: `2.5px solid ${CYAN}`, boxShadow: `0 0 12px ${CYAN}60` }}>
                          <img src={p.avatar} alt={p.displayName}
                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                            onError={e => { (e.target as HTMLImageElement).src = avatarFallback(p.username); }}/>
                        </div>
                        <span className="text-xs font-black" style={{ color: "#fff", maxWidth: 56,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {p.displayName}
                        </span>
                      </motion.div>
                    ))}
                  </div>
              }
            </div>

            {/* Start button */}
            <motion.button
              whileHover={players.length >= 2 ? { scale: 1.04 } : {}}
              whileTap={players.length >= 2 ? { scale: 0.97 } : {}}
              onClick={handleStart} disabled={players.length < 2}
              style={{
                padding: "18px 72px", borderRadius: 18, fontSize: 22, fontWeight: 900,
                fontFamily: "'Cairo','Arial',sans-serif",
                background: players.length >= 2 ? `linear-gradient(135deg,${CYAN},#0099cc)` : "rgba(255,255,255,0.07)",
                color: players.length >= 2 ? "#000" : "rgba(255,255,255,0.25)",
                border: players.length >= 2 ? "none" : "1.5px solid rgba(255,255,255,0.1)",
                cursor: players.length >= 2 ? "pointer" : "not-allowed",
                boxShadow: players.length >= 2 ? `0 8px 32px ${CYAN}60` : "none", transition: "all 0.2s",
              }}>
              {players.length >= 2 ? `▶ العب الآن — ${players.length} لاعبين` : "⌛ انتظر لاعبين..."}
            </motion.button>
          </div>
        </motion.div>
      )}
      </AnimatePresence>

      {/* ── GAME ──────────────────────────────────────────────────────────── */}
      <AnimatePresence>
      {isGamePhase && (
        <motion.div key="game" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="flex-1 w-full flex flex-col items-center justify-center relative"
          style={{ paddingTop: 64, paddingBottom: 32 }}>

          {/* Top bar */}
          <div style={{
            position: "absolute", top: 0, left: 0, right: 0, height: 56,
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "0 20px",
            background: "rgba(5,2,14,0.92)", borderBottom: "1px solid rgba(0,212,255,0.32)",
            backdropFilter: "blur(16px)", zIndex: 30,
          }}>
            {/* Volume */}
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ color: CYAN, fontSize: 14, fontWeight: 900 }}>♫</span>
              <input type="range" min={0} max={100} value={volume}
                onChange={e => {
                  const v = +e.target.value; setVolume(v);
                  try { ytRef.current?.setVolume(v); } catch {}
                }}
                style={{ width: 100, direction: "ltr", accentColor: CYAN, cursor: "pointer" }}/>
            </div>

            {/* Round + phase */}
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {isSpinning && (
                <span className="text-sm font-black" style={{ color: CYAN }}>
                  جولة {roundNum} • الأغنية تعمل 🎵
                </span>
              )}
              {isSelecting && (
                <span className="text-sm font-black" style={{ color: "#fbbf24" }}>
                  جولة {roundNum} • اختر كرسيك في الشات
                </span>
              )}
              {phase === "elimination" && (
                <span className="text-sm font-black" style={{ color: "#f87171" }}>
                  جولة {roundNum} • خرج من اللعبة ❌
                </span>
              )}
              {phase === "winner" && (
                <span className="text-sm font-black" style={{ color: "#fbbf24" }}>
                  🏆 الفائز
                </span>
              )}
            </div>

            {/* Back */}
            <button onClick={handleBack} style={{
              background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.28)",
              borderRadius: 12, padding: "6px 14px", color: "#ffffff",
              fontSize: 13, fontWeight: 800, cursor: "pointer",
              display: "flex", alignItems: "center", gap: 5,
            }}>
              <ArrowRight size={12}/><span>رجوع</span>
            </button>
          </div>

          {/* ── DISC CONTAINER ────────────────────────────────────────────── */}
          <div style={{ position: "relative", width: SZ, height: SZ, flexShrink: 0 }}>

            {/* Outer spinning rings — always visible, animate only while music plays */}
            <div className={isSpinning ? "animate-spin-slow" : ""} style={{
              position: "absolute",
              top:  CY - DISC_R - 16, left: CX - DISC_R - 16,
              width: (DISC_R + 16) * 2, height: (DISC_R + 16) * 2,
              borderRadius: "50%", border: `2px dashed ${CYAN}${isSpinning ? "bb" : "55"}`,
              pointerEvents: "none", transition: "border-color 0.8s",
            }}/>
            <div style={{
              position: "absolute",
              top:  CY - DISC_R - 28, left: CX - DISC_R - 28,
              width: (DISC_R + 28) * 2, height: (DISC_R + 28) * 2,
              borderRadius: "50%", border: `1.5px dashed ${CYAN}${isSpinning ? "77" : "33"}`,
              pointerEvents: "none", transition: "border-color 0.8s",
              animation: isSpinning ? "spin-slow 13s linear infinite reverse" : "none",
            }}/>

            {/* Glow halo — always visible */}
            <div style={{
              position: "absolute",
              top:  CY - DISC_R - 8, left: CX - DISC_R - 8,
              width: (DISC_R + 8) * 2, height: (DISC_R + 8) * 2,
              borderRadius: "50%",
              boxShadow: `0 0 52px ${CYAN}66, 0 0 100px ${CYAN}30`,
              pointerEvents: "none",
            }}/>

            {/* SVG disc */}
            <svg width={SZ} height={SZ} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
              <defs>
                <pattern id="cg-dot" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
                  <circle cx="10" cy="10" r="1" fill={`${CYAN}18`}/>
                </pattern>
                <clipPath id="cg-clip"><circle cx={CX} cy={CY} r={DISC_R - 2}/></clipPath>
              </defs>

              {/* Rotating disc body — clean circle, no dividers */}
              <g transform={`rotate(${rotAngle}, ${CX}, ${CY})`}>
                <circle cx={CX} cy={CY} r={DISC_R} fill="#0c1628"/>
                <rect x={CX-DISC_R} y={CY-DISC_R} width={DISC_R*2} height={DISC_R*2}
                  fill="url(#cg-dot)" clipPath="url(#cg-clip)"/>
                {/* Subtle inner glow arc to hint rotation without hard lines */}
                <circle cx={CX} cy={CY} r={DISC_R - 18}
                  fill="none" stroke={`${CYAN}1a`} strokeWidth={18}/>
              </g>
              {/* Static outer border — doesn't rotate */}
              <circle cx={CX} cy={CY} r={DISC_R} fill="none" stroke={CYAN} strokeWidth={3}/>

              {/* Center: Spinning */}
              {isSpinning && (
                <g>
                  <text x={CX} y={CY - 8} textAnchor="middle" fontSize={72} fill={CYAN}
                    fontFamily="serif" style={{ filter: `drop-shadow(0 0 16px ${CYAN})` }}>♫</text>
                  <text x={CX} y={CY + 48} textAnchor="middle" fontSize={18} fontWeight="800"
                    fill={CYAN} fontFamily="Cairo,Arial,sans-serif"
                    style={{ filter: `drop-shadow(0 0 8px ${CYAN})` }}>
                    الموسيقى تعمل...
                  </text>
                </g>
              )}

              {/* Center: Selecting — instruction (timer is outside) */}
              {isSelecting && (
                <text x={CX} y={CY + 8} textAnchor="middle" fontSize={20} fontWeight="800"
                  fill={CYAN} fontFamily="Cairo,Arial,sans-serif"
                  style={{ filter: `drop-shadow(0 0 8px ${CYAN})` }}>
                  اكتب رقم الكرسي في الشات
                </text>
              )}

              {/* Center: Elimination */}
              {phase === "elimination" && eliminated && (
                <g>
                  <text x={CX} y={CY - 16} textAnchor="middle" fontSize={40} fontWeight="900"
                    fill="#f87171" fontFamily="Cairo,Arial,sans-serif"
                    style={{ filter: "drop-shadow(0 0 10px #f87171)" }}>خرج! ❌</text>
                  <text x={CX} y={CY + 32} textAnchor="middle" fontSize={22} fontWeight="700"
                    fill="#fca5a5" fontFamily="Cairo,Arial,sans-serif">
                    {eliminated.displayName}
                  </text>
                </g>
              )}

              {/* Center: Winner */}
              {phase === "winner" && winner && (
                <g>
                  <text x={CX} y={CY - 28} textAnchor="middle" fontSize={52}
                    style={{ filter: `drop-shadow(0 0 18px ${CYAN})` }}>🏆</text>
                  <text x={CX} y={CY + 16} textAnchor="middle" fontSize={26} fontWeight="900"
                    fill={CYAN} fontFamily="Cairo,Arial,sans-serif"
                    style={{ filter: `drop-shadow(0 0 12px ${CYAN})` }}>الفائز!</text>
                  <text x={CX} y={CY + 52} textAnchor="middle" fontSize={20} fontWeight="700"
                    fill="#fff" fontFamily="Cairo,Arial,sans-serif">{winner.displayName}</text>
                </g>
              )}
            </svg>

            {/* ── PLAYERS — outer ring ────────────────────────────────────── */}
            {playerPositions.map(({ player: p, x, y }) => {
              const hasClaimed = claimAnims.some(c => c.player.username === p.username);
              const isOut      = phase === "elimination" && eliminated?.username === p.username;
              const isWin      = phase === "winner"      && winner?.username     === p.username;
              return (
                <div key={p.username} style={{
                  position: "absolute", left: x - AVA_R - 3, top: y - AVA_R - 13,
                  width: 56, display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
                  opacity: isOut ? 0.15 : hasClaimed ? 0.3 : 1,
                  transition: "opacity 0.5s",
                }}>
                  <div
                    className={isSpinning && !hasClaimed && !isOut ? "cg-spin-glow" : ""}
                    style={{
                      width: 50, height: 50, borderRadius: "50%", overflow: "hidden",
                      border: `2.5px solid ${isWin ? "#fbbf24" : CYAN}`,
                      ...(isSpinning && !hasClaimed && !isOut
                        ? {}
                        : { boxShadow: `0 0 ${isWin ? 22 : 8}px ${isWin ? "#fbbf24" : CYAN}70` }),
                    }}>
                    <img src={p.avatar} alt={p.displayName}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      onError={e => { (e.target as HTMLImageElement).src = avatarFallback(p.username); }}/>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#ffffff",
                    textShadow: "0 1px 6px rgba(0,0,0,1), 0 0 12px rgba(0,0,0,0.9)", maxWidth: 56,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "center",
                    letterSpacing: "0.01em" }}>
                    {p.displayName}
                  </span>
                </div>
              );
            })}

            {/* ── CHAIRS — inside disc ────────────────────────────────────── */}
            <AnimatePresence>
            {(isSelecting || phase === "elimination") && chairPositions.map(({ num, x, y }) => {
              const claimed = claimAnims.some(c => c.chairNum === num);
              return (
                <motion.div key={`chair-${num}`}
                  initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  transition={{ delay: (num - 1) * 0.06, type: "spring", stiffness: 420, damping: 26 }}
                  style={{ position: "absolute", left: x - 22, top: y - 40,
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                  {/* Show chair icon only if not yet claimed (avatar flies in via ClaimAnim) */}
                  {!claimed && <ChairIcon/>}
                  {/* Number badge — always visible */}
                  <div style={{
                    background: "rgba(6,14,32,0.92)", border: `1.5px solid ${CYAN}`,
                    borderRadius: 7, padding: "2px 9px", minWidth: 28, textAlign: "center",
                    boxShadow: `0 0 8px ${CYAN}50`,
                  }}>
                    <span style={{ color: "#ffffff", fontSize: 13, fontWeight: 900, letterSpacing: "0.02em" }}>{num}</span>
                  </div>
                </motion.div>
              );
            })}
            </AnimatePresence>

            {/* ── CLAIM ANIMATIONS — avatar glides from outer ring to chair ─ */}
            <AnimatePresence>
            {claimAnims.map(claim => (
              <motion.div key={`anim-${claim.player.username}`}
                initial={{ left: claim.fromX, top: claim.fromY, scale: 1 }}
                animate={{ left: claim.toX,   top: claim.toY,   scale: 1 }}
                transition={{ duration: 0.65, type: "spring", stiffness: 260, damping: 24 }}
                style={{
                  position: "absolute", width: 50, height: 50,
                  borderRadius: "50%", overflow: "hidden", zIndex: 20,
                  border: `2.5px solid ${CYAN}`, boxShadow: `0 0 18px ${CYAN}`,
                }}>
                <img src={claim.player.avatar} alt={claim.player.displayName}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  onError={e => { (e.target as HTMLImageElement).src = avatarFallback(claim.player.username); }}/>
              </motion.div>
            ))}
            </AnimatePresence>
          </div>

          {/* ── TIMER — outside disc, below ─────────────────────────────── */}
          <AnimatePresence>
          {isSelecting && (
            <motion.div
              key="sel-timer"
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}
              style={{
                marginTop: 24,
                display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
              }}>
              {/* Big countdown number */}
              <motion.span
                key={selTimer}
                initial={{ scale: 1.3 }} animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 400, damping: 20 }}
                style={{
                  fontSize: 72, fontWeight: 900, lineHeight: 1,
                  color: selTimer <= 5 ? "#f87171" : CYAN,
                  fontFamily: "'Cairo','Arial',sans-serif",
                  textShadow: `0 0 28px ${selTimer <= 5 ? "#f87171" : CYAN}`,
                  filter: `drop-shadow(0 0 12px ${selTimer <= 5 ? "#f87171bb" : `${CYAN}bb`})`,
                }}>
                {selTimer}
              </motion.span>
              <span style={{ fontSize: 15, fontWeight: 700, color: "rgba(255,255,255,0.92)" }}>
                ثانية — اكتب رقم الكرسي في الشات
              </span>

              {/* Progress bar */}
              <div style={{
                width: 280, height: 8, borderRadius: 8,
                background: "rgba(255,255,255,0.2)", overflow: "hidden",
                border: "1px solid rgba(255,255,255,0.1)",
              }}>
                <motion.div
                  animate={{ width: `${(selTimer / SELECT_S) * 100}%` }}
                  transition={{ duration: 0.8 }}
                  style={{
                    height: "100%", borderRadius: 6,
                    background: selTimer <= 5
                      ? "linear-gradient(90deg,#ef4444,#f87171)"
                      : `linear-gradient(90deg,${CYAN},#0099cc)`,
                  }}/>
              </div>
            </motion.div>
          )}
          </AnimatePresence>

          {/* ── WINNER BUTTONS ──────────────────────────────────────────── */}
          {phase === "winner" && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              style={{ display: "flex", gap: 14, marginTop: 24 }}>
              <button onClick={resetToLobby} style={{
                padding: "14px 44px", borderRadius: 16,
                background: `linear-gradient(135deg,${CYAN},#0099cc)`,
                color: "#000", fontWeight: 900, fontSize: 16,
                fontFamily: "'Cairo','Arial',sans-serif", border: "none",
                cursor: "pointer", boxShadow: `0 6px 24px ${CYAN}60`,
              }}>العب مجدداً</button>
              <button onClick={handleBack} style={{
                padding: "14px 28px", borderRadius: 16,
                background: "rgba(255,255,255,0.1)",
                color: "#ffffff",
                border: "1px solid rgba(255,255,255,0.28)",
                fontWeight: 700, fontSize: 14,
                fontFamily: "'Cairo','Arial',sans-serif", cursor: "pointer",
              }}>الرئيسية</button>
            </motion.div>
          )}
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  );
}
