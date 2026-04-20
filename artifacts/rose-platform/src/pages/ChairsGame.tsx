import { useState, useRef, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

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

// ─── Twitch photo ─────────────────────────────────────────────────────────────
async function fetchTwitchPhoto(u: string): Promise<string> {
  try {
    const res  = await fetch(`https://api.ivr.fi/v2/twitch/user?login=${u}`);
    const data = await res.json();
    const obj  = Array.isArray(data) ? data[0] : data?.data?.[0];
    const url  = obj?.profileImageURL ?? obj?.logo ?? obj?.profile_image_url;
    if (url) return url.replace("{width}", "150").replace("{height}", "150");
  } catch {}
  return `https://api.dicebear.com/7.x/pixel-art/svg?seed=${u}`;
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

// Wheel spin durations (seconds) — chosen randomly each round
const WHEEL_DURATIONS = [10, 15, 20];

// ─── Types ────────────────────────────────────────────────────────────────────
type Phase = "lobby" | "spinning" | "selecting" | "elimination" | "winner";
interface Player { username: string; displayName: string; avatar: string }

// ─── Disc geometry ────────────────────────────────────────────────────────────
const SZ       = 600;
const CX       = 300;
const CY       = 300;
const DISC_R   = 222;
const PLAYER_R = 286;
const CHAIR_R  = 130;
const SELECT_S = 20;   // 20-second chair selection timer
const CYAN     = "#00d4ff";

const avatarFallback = (u: string) => `https://api.dicebear.com/7.x/pixel-art/svg?seed=${u}`;

// ─── ChairIcon ────────────────────────────────────────────────────────────────
function ChairIcon() {
  return (
    <svg width="38" height="30" viewBox="0 0 38 30"
      style={{ filter: `drop-shadow(0 0 6px ${CYAN})`, overflow: "visible" }}>
      <rect x="6" y="0" width="26" height="12" rx="4"
        fill="rgba(0,212,255,0.12)" stroke={CYAN} strokeWidth={1.8} />
      <rect x="1" y="9" width="6.5" height="13" rx="3"
        fill="rgba(0,212,255,0.12)" stroke={CYAN} strokeWidth={1.8} />
      <rect x="30.5" y="9" width="6.5" height="13" rx="3"
        fill="rgba(0,212,255,0.12)" stroke={CYAN} strokeWidth={1.8} />
      <rect x="6" y="11" width="26" height="12" rx="4"
        fill="rgba(0,212,255,0.12)" stroke={CYAN} strokeWidth={1.8} />
      <line x1="11" y1="23" x2="11" y2="30" stroke={CYAN} strokeWidth={1.8} strokeLinecap="round" />
      <line x1="27" y1="23" x2="27" y2="30" stroke={CYAN} strokeWidth={1.8} strokeLinecap="round" />
    </svg>
  );
}

// ─── Helper: create fresh player div inside wrapper ───────────────────────────
// YouTube replaces the target div with an iframe; to reuse we always
// inject a brand-new div into the wrapper before creating each player.
const YT_WRAPPER_ID = "cg-yt-wrapper";
function getFreshPlayerDiv(): HTMLDivElement | null {
  const wrapper = document.getElementById(YT_WRAPPER_ID);
  if (!wrapper) return null;
  wrapper.innerHTML = "";                       // remove old iframe if any
  const div = document.createElement("div");
  wrapper.appendChild(div);
  return div;
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function ChairsGame() {
  const [, navigate] = useLocation();
  const { user }     = useAuth();

  const [phase, setPhase]                 = useState<Phase>("lobby");
  const [players, setPlayers]             = useState<Player[]>([]);
  const [chairOccupied, setChairOccupied] = useState<Record<number, Player>>({});
  const [selTimer, setSelTimer]           = useState(SELECT_S);
  const [eliminated, setEliminated]       = useState<Player | null>(null);
  const [winner, setWinner]               = useState<Player | null>(null);
  const [roundNum, setRoundNum]           = useState(1);
  const [volume, setVolume]               = useState(80);
  const [twitchOk, setTwitchOk]          = useState(false);

  // refs to avoid stale closures
  const phaseRef   = useRef<Phase>("lobby");
  const playersRef = useRef<Player[]>([]);
  const chairRef   = useRef<Record<number, Player>>({});
  const volumeRef  = useRef(80);
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

  // sync phase ref
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { playersRef.current = players; }, [players]);
  useEffect(() => { chairRef.current = chairOccupied; }, [chairOccupied]);

  // pre-warm YouTube API
  useEffect(() => {
    loadYT();
    return () => { stopMusic(); clearAllTimers(); };
  }, []);

  // ── YouTube helpers ──────────────────────────────────────────────────────
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

  // Pick the next (non-failed) song index
  const nextSongIdx = (): Song => {
    const available = SONGS.filter(s => !failedIds.current.has(s.ytId));
    const pool = available.length > 0 ? available : SONGS; // fallback: try all
    songIdxRef.current = (songIdxRef.current + 1) % pool.length;
    return pool[songIdxRef.current];
  };

  // Play a song for exactly `durationSec` seconds, then call onStop
  // Uses wrapper-div pattern so each player gets a fresh DOM node
  const playSong = useCallback((durationSec: number, onStop: () => void) => {
    stopMusic();

    const song      = nextSongIdx();
    const playerDiv = getFreshPlayerDiv();
    if (!playerDiv) { onStop(); return; }

    loadYT().then(() => {
      // Check the phase is still spinning (may have changed while API loaded)
      if (phaseRef.current !== "spinning") return;

      ytRef.current = new window.YT.Player(playerDiv, {
        height: "1", width: "1",
        videoId: song.ytId,
        playerVars: {
          autoplay: 1, start: song.start,
          controls: 0, modestbranding: 1, rel: 0, fs: 0,
          iv_load_policy: 3, disablekb: 1, playsinline: 1,
        },
        events: {
          onReady: (e: any) => {
            try {
              e.target.setVolume(volumeRef.current);
              e.target.playVideo();
            } catch {}
            // Stop music exactly when wheel stops
            clipTimerRef.current = setTimeout(() => {
              try { e.target.pauseVideo(); } catch {}
              onStop();
            }, durationSec * 1000);
          },
          onError: () => {
            // Mark this song as bad, try next song immediately
            failedIds.current.add(song.ytId);
            clearTimeout(clipTimerRef.current!);
            clipTimerRef.current = null;
            // Retry with a different song (same duration remaining)
            playSong(durationSec, onStop);
          },
        },
      });
    }).catch(() => onStop());
  }, []);

  // ── Game flow ────────────────────────────────────────────────────────────
  const doEliminate = useCallback(() => {
    clearAllTimers();
    stopMusic();

    const cur  = playersRef.current;
    const occ  = chairRef.current;
    const sat  = new Set(Object.values(occ).map(p => p.username));
    const outs = cur.filter(p => !sat.has(p.username));
    const eli  = outs[Math.floor(Math.random() * outs.length)] ?? null;

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
        startRound(rem);
      }
    }, 3500);
  }, []);

  const startSelecting = useCallback(() => {
    // Music stops before this is called (via onStop in playSong)
    setChairOccupied({}); chairRef.current = {};
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

  // startRound accepts current player list to avoid stale state
  const startRound = useCallback((pl: Player[]) => {
    if (pl.length < 2) return;
    clearAllTimers();
    stopMusic();
    setChairOccupied({}); chairRef.current = {};
    setEliminated(null);
    phaseRef.current = "spinning";
    setPhase("spinning");

    // Pick random wheel duration: 10, 15, or 20 seconds
    const dur = WHEEL_DURATIONS[Math.floor(Math.random() * WHEEL_DURATIONS.length)];

    // Start music — it runs for exactly `dur` seconds, then wheel stops
    playSong(dur, () => {
      if (phaseRef.current === "spinning") startSelecting();
    });
  }, [playSong, startSelecting]);

  const handleStart = () => {
    const pl = playersRef.current;
    if (pl.length < 2) return;
    setRoundNum(1);
    startRound(pl);
  };

  // ── Chat handler ─────────────────────────────────────────────────────────
  const handleChat = useCallback((username: string, text: string) => {
    const msg = text.trim().toLowerCase();
    const ph  = phaseRef.current;

    if (msg === "join" && ph === "lobby") {
      if (playersRef.current.some(p => p.username === username)) return;
      const np: Player = { username, displayName: username, avatar: avatarFallback(username) };
      setPlayers(prev => { const n = [...prev, np]; playersRef.current = n; return n; });
      fetchTwitchPhoto(username).then(url =>
        setPlayers(prev => {
          const n = prev.map(p => p.username === username ? { ...p, avatar: url } : p);
          playersRef.current = n; return n;
        })
      );
      return;
    }

    if (ph === "selecting") {
      const num = parseInt(msg, 10);
      const cur = playersRef.current;
      const occ = chairRef.current;
      const maxChair = cur.length - 1;
      if (isNaN(num) || num < 1 || num > maxChair) return;
      if (occ[num]) return;
      const p = cur.find(x => x.username === username);
      if (!p) return;
      if (Object.values(occ).some(x => x.username === username)) return;

      setChairOccupied(prev => {
        const n = { ...prev, [num]: p };
        chairRef.current = n;
        if (Object.keys(n).length >= maxChair) {
          setTimeout(() => doEliminate(), 400);
        }
        return n;
      });
    }
  }, [doEliminate]);

  // ── Twitch IRC ────────────────────────────────────────────────────────────
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
    clearAllTimers(); stopMusic();
    wsRef.current?.close();
    navigate("/");
  };

  const resetToLobby = () => {
    clearAllTimers(); stopMusic();
    setPlayers([]); playersRef.current = [];
    setChairOccupied({}); chairRef.current = {};
    setEliminated(null); setWinner(null); setRoundNum(1);
    phaseRef.current = "lobby"; setPhase("lobby");
  };

  // ── Derived layout ────────────────────────────────────────────────────────
  const numChairs = Math.max(players.length - 1, 1);

  const chairPositions = Array.from({ length: numChairs }, (_, i) => {
    const a = (i / numChairs) * 2 * Math.PI - Math.PI / 2;
    return { num: i + 1, x: CX + CHAIR_R * Math.cos(a), y: CY + CHAIR_R * Math.sin(a) };
  });

  const playerPositions = players.map((p, i) => {
    const a = (i / players.length) * 2 * Math.PI - Math.PI / 2;
    return { player: p, x: CX + PLAYER_R * Math.cos(a), y: CY + PLAYER_R * Math.sin(a) };
  });

  const isSpinning  = phase === "spinning";
  const isSelecting = phase === "selecting";
  const isGamePhase = phase !== "lobby";

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="gradient-bg min-h-screen w-full flex flex-col overflow-hidden relative"
      dir="rtl" style={{ fontFamily: "'Cairo','Arial',sans-serif" }}>

      {/* ── Hidden YouTube wrapper — always in DOM, never unmounts ── */}
      <div id={YT_WRAPPER_ID} style={{
        position: "fixed", top: -4, left: -4, width: 2, height: 2,
        overflow: "hidden", zIndex: -10, pointerEvents: "none", opacity: 0,
      }} />

      {/* ── LOBBY ─────────────────────────────────────────────────────────── */}
      <AnimatePresence>
      {!isGamePhase && (
        <motion.div key="lobby"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="flex-1 flex flex-col">

          <header className="relative z-20 flex items-center justify-between px-6 py-4
            border-b border-white/5"
            style={{ background: "rgba(5,2,14,0.92)", backdropFilter: "blur(20px)" }}>
            <button onClick={handleBack}
              className="flex items-center gap-2 text-white/40 hover:text-cyan-400 transition-colors font-bold text-sm">
              <ArrowRight size={16} />
              <span>رجوع</span>
            </button>
            <span className="text-xl font-black" style={{ color: CYAN,
              textShadow: `0 0 16px ${CYAN}` }}>
              🪑 الكراسي الموسيقية
            </span>
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${twitchOk ? "bg-cyan-400" : "bg-white/20"}`} />
              <span className="text-xs font-bold"
                style={{ color: twitchOk ? CYAN : "rgba(255,255,255,0.3)" }}>
                {twitchOk ? "متصل" : "جاري..."}
              </span>
            </div>
          </header>

          <div className="flex-1 flex flex-col items-center justify-center gap-8 px-6 py-8">
            {/* Join instruction */}
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="text-center"
              style={{
                background: "rgba(0,212,255,0.06)",
                border: `2px solid ${CYAN}40`,
                borderRadius: 24, padding: "32px 48px",
                boxShadow: `0 0 40px ${CYAN}15`,
              }}>
              <p className="text-4xl font-black" style={{ color: CYAN,
                textShadow: `0 0 20px ${CYAN}` }}>
                اكتب{" "}
                <span style={{
                  background: CYAN, color: "#000", borderRadius: 10,
                  padding: "2px 14px", fontFamily: "monospace", fontSize: "2.2rem",
                }}>join</span>
                {" "}في الشات
              </p>
              <p className="text-base font-bold mt-3"
                style={{ color: "rgba(255,255,255,0.5)" }}>
                Type <span style={{ color: CYAN, fontFamily: "monospace", fontWeight: 900 }}>join</span> in chat to play
              </p>
            </motion.div>

            {/* Players */}
            <div style={{
              background: "rgba(0,0,0,0.35)", border: "1.5px solid rgba(0,212,255,0.2)",
              borderRadius: 20, padding: "20px 28px",
              minWidth: 340, maxWidth: 560, width: "100%",
            }}>
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-black" style={{ color: CYAN }}>اللاعبون</span>
                <span className="text-sm font-bold px-3 py-1 rounded-full"
                  style={{ background: `${CYAN}20`, color: CYAN, border: `1px solid ${CYAN}40` }}>
                  {players.length} لاعب
                </span>
              </div>
              {players.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-6">
                  <span className="text-3xl opacity-30">🪑</span>
                  <p className="text-sm font-bold" style={{ color: "rgba(255,255,255,0.35)" }}>
                    في انتظار اللاعبين...
                  </p>
                </div>
              ) : (
                <div className="flex flex-wrap gap-3 justify-center">
                  {players.map((p, i) => (
                    <motion.div key={p.username}
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: i * 0.04, type: "spring", stiffness: 350, damping: 22 }}
                      className="flex flex-col items-center gap-2">
                      <div style={{
                        width: 52, height: 52, borderRadius: "50%", overflow: "hidden",
                        border: `2.5px solid ${CYAN}`, boxShadow: `0 0 12px ${CYAN}60`,
                      }}>
                        <img src={p.avatar} alt={p.displayName}
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                          onError={e => { (e.target as HTMLImageElement).src = avatarFallback(p.username); }} />
                      </div>
                      <span className="text-xs font-black" style={{
                        color: "#fff", maxWidth: 56, overflow: "hidden",
                        textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        {p.displayName}
                      </span>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>

            {/* Start button */}
            <motion.button
              whileHover={players.length >= 2 ? { scale: 1.04 } : {}}
              whileTap={players.length >= 2 ? { scale: 0.97 } : {}}
              onClick={handleStart}
              disabled={players.length < 2}
              style={{
                padding: "18px 72px", borderRadius: 18, fontSize: 22, fontWeight: 900,
                fontFamily: "'Cairo','Arial',sans-serif",
                background: players.length >= 2
                  ? `linear-gradient(135deg, ${CYAN} 0%, #0099cc 100%)`
                  : "rgba(255,255,255,0.07)",
                color: players.length >= 2 ? "#000" : "rgba(255,255,255,0.25)",
                border: players.length >= 2 ? "none" : `1.5px solid rgba(255,255,255,0.1)`,
                cursor: players.length >= 2 ? "pointer" : "not-allowed",
                boxShadow: players.length >= 2 ? `0 8px 32px ${CYAN}60` : "none",
                transition: "all 0.2s",
              }}>
              {players.length >= 2
                ? `▶ العب الآن — ${players.length} لاعبين`
                : "⌛ انتظر لاعبين..."}
            </motion.button>
          </div>
        </motion.div>
      )}
      </AnimatePresence>

      {/* ── GAME SCREEN ───────────────────────────────────────────────────── */}
      <AnimatePresence>
      {isGamePhase && (
        <motion.div key="game"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="flex-1 flex flex-col items-center justify-center relative">

          {/* Volume slider — top left */}
          <div style={{
            position: "absolute", top: 16, left: 16, zIndex: 30,
            display: "flex", alignItems: "center", gap: 10,
            background: "rgba(8,16,36,0.85)", borderRadius: 24,
            padding: "7px 16px", border: `1px solid ${CYAN}30`,
            boxShadow: "0 2px 16px rgba(0,0,0,0.5)",
          }}>
            <span style={{ color: CYAN, fontSize: 15, fontWeight: 900 }}>♫</span>
            <input type="range" min={0} max={100} value={volume}
              onChange={e => {
                const v = +e.target.value;
                setVolume(v);
                try { ytRef.current?.setVolume(v); } catch {}
              }}
              style={{ width: 100, direction: "ltr", accentColor: CYAN, cursor: "pointer" }} />
          </div>

          {/* Back — top right */}
          <button onClick={handleBack} style={{
            position: "absolute", top: 16, right: 16, zIndex: 30,
            background: "rgba(8,16,36,0.75)", border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 14, padding: "7px 16px",
            color: "rgba(255,255,255,0.45)", fontSize: 12, fontWeight: 800,
            cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
          }}>
            <ArrowRight size={13} />
            <span>رجوع</span>
          </button>

          {/* ── DISC + PLAYERS ─────────────────────────────────────────────── */}
          <div style={{ width: SZ, height: SZ, position: "relative", flexShrink: 0 }}>

            {/* Spinning outer dashed ring */}
            {isSpinning && (
              <>
                <div className="animate-spin-slow" style={{
                  position: "absolute",
                  top: CY - DISC_R - 16, left: CX - DISC_R - 16,
                  width: (DISC_R + 16) * 2, height: (DISC_R + 16) * 2,
                  borderRadius: "50%", border: `2px dashed ${CYAN}55`,
                  pointerEvents: "none",
                }} />
                <div style={{
                  position: "absolute",
                  top: CY - DISC_R - 28, left: CX - DISC_R - 28,
                  width: (DISC_R + 28) * 2, height: (DISC_R + 28) * 2,
                  borderRadius: "50%", border: `1.5px dashed ${CYAN}28`,
                  pointerEvents: "none",
                  animation: "spin-slow 13s linear infinite reverse",
                }} />
              </>
            )}

            {/* Outer glow */}
            <div style={{
              position: "absolute",
              top: CY - DISC_R - 8, left: CX - DISC_R - 8,
              width: (DISC_R + 8) * 2, height: (DISC_R + 8) * 2,
              borderRadius: "50%",
              boxShadow: `0 0 40px ${CYAN}35, 0 0 80px ${CYAN}15`,
              pointerEvents: "none",
            }} />

            {/* SVG */}
            <svg width={SZ} height={SZ} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
              <defs>
                <pattern id="cgDot2" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
                  <circle cx="10" cy="10" r="1" fill={`${CYAN}18`} />
                </pattern>
                <clipPath id="discClip2"><circle cx={CX} cy={CY} r={DISC_R - 2} /></clipPath>
              </defs>

              {/* Disc */}
              <circle cx={CX} cy={CY} r={DISC_R} fill="#0c1628" />
              <rect x={CX-DISC_R} y={CY-DISC_R} width={DISC_R*2} height={DISC_R*2}
                fill="url(#cgDot2)" clipPath="url(#discClip2)" />
              <circle cx={CX} cy={CY} r={DISC_R} fill="none" stroke={CYAN} strokeWidth={3} />

              {/* Center: Spinning */}
              {isSpinning && (
                <g>
                  <text x={CX} y={CY-8} textAnchor="middle" fontSize={72} fill={CYAN}
                    fontFamily="serif" style={{ filter: `drop-shadow(0 0 16px ${CYAN})` }}>♫</text>
                  <text x={CX} y={CY+48} textAnchor="middle" fontSize={18} fontWeight="800"
                    fill={CYAN} fontFamily="Cairo,Arial,sans-serif"
                    style={{ filter: `drop-shadow(0 0 8px ${CYAN})` }}>
                    الموسيقى تعمل...
                  </text>
                  <text x={CX} y={CY-DISC_R+32} textAnchor="middle"
                    fontSize={13} fontWeight="700" fill={`${CYAN}90`}
                    fontFamily="Cairo,Arial,sans-serif">
                    جولة {roundNum}
                  </text>
                </g>
              )}

              {/* Center: Selecting — big countdown */}
              {isSelecting && (
                <>
                  <text x={CX} y={CY+36} textAnchor="middle" fontSize={110} fontWeight="900"
                    fill={selTimer <= 5 ? "#f87171" : CYAN} fontFamily="Cairo,Arial,sans-serif"
                    style={{ filter: `drop-shadow(0 0 22px ${selTimer <= 5 ? "#f87171" : CYAN})` }}>
                    {selTimer}
                  </text>
                  <text x={CX} y={CY+DISC_R-26} textAnchor="middle"
                    fontSize={14} fontWeight="800" fill={CYAN}
                    fontFamily="Cairo,Arial,sans-serif"
                    style={{ filter: `drop-shadow(0 0 6px ${CYAN})` }}>
                    اكتب رقم الكرسي
                  </text>
                </>
              )}

              {/* Center: Elimination */}
              {phase === "elimination" && eliminated && (
                <g>
                  <text x={CX} y={CY-16} textAnchor="middle" fontSize={40} fontWeight="900"
                    fill="#f87171" fontFamily="Cairo,Arial,sans-serif"
                    style={{ filter: "drop-shadow(0 0 10px #f87171)" }}>
                    خرج! ❌
                  </text>
                  <text x={CX} y={CY+32} textAnchor="middle" fontSize={22} fontWeight="700"
                    fill="#fca5a5" fontFamily="Cairo,Arial,sans-serif">
                    {eliminated.displayName}
                  </text>
                </g>
              )}

              {/* Center: Winner */}
              {phase === "winner" && winner && (
                <g>
                  <text x={CX} y={CY-28} textAnchor="middle" fontSize={52}
                    style={{ filter: `drop-shadow(0 0 18px ${CYAN})` }}>🏆</text>
                  <text x={CX} y={CY+18} textAnchor="middle" fontSize={26} fontWeight="900"
                    fill={CYAN} fontFamily="Cairo,Arial,sans-serif"
                    style={{ filter: `drop-shadow(0 0 12px ${CYAN})` }}>
                    الفائز!
                  </text>
                  <text x={CX} y={CY+52} textAnchor="middle" fontSize={20} fontWeight="700"
                    fill="#fff" fontFamily="Cairo,Arial,sans-serif">
                    {winner.displayName}
                  </text>
                </g>
              )}
            </svg>

            {/* ── PLAYERS outside disc ─────────────────────────────────────── */}
            {playerPositions.map(({ player: p, x, y }) => {
              const seated = (isSelecting || phase === "elimination")
                ? Object.values(chairOccupied).some(c => c.username === p.username) : false;
              const isOut  = phase === "elimination" && eliminated?.username === p.username;
              const isWin  = phase === "winner"      && winner?.username     === p.username;
              return (
                <div key={p.username} style={{
                  position: "absolute", left: x - 28, top: y - 38,
                  width: 56, display: "flex", flexDirection: "column",
                  alignItems: "center", gap: 3,
                  opacity: isOut ? 0.2 : 1, transition: "opacity 0.5s",
                }}>
                  <div style={{
                    width: 50, height: 50, borderRadius: "50%", overflow: "hidden",
                    border: `2.5px solid ${isWin ? "#fbbf24" : CYAN}`,
                    boxShadow: `0 0 ${isWin ? 22 : seated ? 16 : 8}px ${isWin ? "#fbbf24" : CYAN}${seated ? "dd" : "70"}`,
                    transition: "box-shadow 0.4s",
                  }}>
                    <img src={p.avatar} alt={p.displayName}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      onError={e => { (e.target as HTMLImageElement).src = avatarFallback(p.username); }} />
                  </div>
                  <span style={{
                    fontSize: 10, fontWeight: 900, color: "#fff",
                    textShadow: "0 1px 5px rgba(0,0,0,1)", maxWidth: 56,
                    overflow: "hidden", textOverflow: "ellipsis",
                    whiteSpace: "nowrap", textAlign: "center",
                  }}>
                    {p.displayName}
                  </span>
                </div>
              );
            })}

            {/* ── CHAIRS inside disc ───────────────────────────────────────── */}
            <AnimatePresence>
            {(isSelecting || phase === "elimination") && chairPositions.map(({ num, x, y }) => {
              const seated = chairOccupied[num];
              return (
                <motion.div key={num}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  transition={{ delay: (num - 1) * 0.05, type: "spring", stiffness: 420, damping: 26 }}
                  style={{
                    position: "absolute", left: x - 22, top: y - 40,
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
                  }}>
                  {seated ? (
                    <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 500, damping: 20 }}
                      style={{
                        width: 40, height: 40, borderRadius: "50%", overflow: "hidden",
                        border: `2.5px solid ${CYAN}`, boxShadow: `0 0 16px ${CYAN}`,
                      }}>
                      <img src={seated.avatar} alt={seated.displayName}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        onError={e => { (e.target as HTMLImageElement).src = avatarFallback(seated.username); }} />
                    </motion.div>
                  ) : (
                    <ChairIcon />
                  )}
                  <div style={{
                    background: "rgba(6,14,32,0.92)", border: `1.5px solid ${CYAN}`,
                    borderRadius: 7, padding: "2px 9px", minWidth: 28, textAlign: "center",
                    boxShadow: `0 0 8px ${CYAN}50`,
                  }}>
                    <span style={{ color: "#fff", fontSize: 12, fontWeight: 900 }}>{num}</span>
                  </div>
                </motion.div>
              );
            })}
            </AnimatePresence>
          </div>

          {/* Winner buttons */}
          {phase === "winner" && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              style={{ display: "flex", gap: 14, marginTop: 24 }}>
              <button onClick={resetToLobby} style={{
                padding: "14px 44px", borderRadius: 16,
                background: `linear-gradient(135deg, ${CYAN}, #0099cc)`,
                color: "#000", fontWeight: 900, fontSize: 16,
                fontFamily: "'Cairo','Arial',sans-serif", border: "none",
                cursor: "pointer", boxShadow: `0 6px 24px ${CYAN}60`,
              }}>
                العب مجدداً
              </button>
              <button onClick={handleBack} style={{
                padding: "14px 28px", borderRadius: 16,
                background: "rgba(255,255,255,0.07)",
                color: "rgba(255,255,255,0.55)",
                border: "1px solid rgba(255,255,255,0.12)",
                fontWeight: 700, fontSize: 14,
                fontFamily: "'Cairo','Arial',sans-serif", cursor: "pointer",
              }}>
                الرئيسية
              </button>
            </motion.div>
          )}
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  );
}
