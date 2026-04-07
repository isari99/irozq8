import { useState, useRef, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Wifi, WifiOff, Play, RotateCcw, Users } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Player {
  username: string;
  displayName: string;
  avatar: string;
  position: number;
  color: string;
}
type Phase = "joining" | "playing" | "finished";

// ─── Constants ────────────────────────────────────────────────────────────────
const PLAYER_COLORS = [
  "#e040fb","#00e5ff","#ffd600","#ff6d00",
  "#22c55e","#f43f5e","#a78bfa","#fb923c",
];
const MAX_PLAYERS = 8;

const LADDERS: Record<number, number> = {
  2: 38, 7: 14, 17: 47, 19: 42, 30: 58, 39: 64, 46: 76, 60: 85,
};
const SNAKES: Record<number, number> = {
  15: 3, 25: 6, 44: 20, 57: 36, 65: 17, 76: 52, 88: 62, 95: 73, 99: 40,
};

const SNAKE_SVG_COLORS = [
  "#FFD600","#22C55E","#3B82F6","#EC4899",
  "#F97316","#8B5CF6","#EF4444","#06B6D4","#84CC16",
];

const CELL_BG = ["#FFFFFF","#EF5350","#42A5F5","#66BB6A","#FFA726"];

const DICE_DOTS: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [[28, 28], [72, 72]],
  3: [[28, 28], [50, 50], [72, 72]],
  4: [[28, 28], [72, 28], [28, 72], [72, 72]],
  5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]],
  6: [[28, 22], [72, 22], [28, 50], [72, 50], [28, 78], [72, 78]],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const toArabic = (n: number) =>
  n.toString().replace(/\d/g, d => "٠١٢٣٤٥٦٧٨٩"[+d]);

function getCellGridPos(n: number) {
  const idx = n - 1;
  const boardRow = Math.floor(idx / 10);
  const col = boardRow % 2 === 0 ? idx % 10 : 9 - (idx % 10);
  const displayRow = 9 - boardRow;
  return { col, displayRow, boardRow };
}

function getCellCenter(n: number) {
  const { col, displayRow } = getCellGridPos(n);
  return { x: col + 0.5, y: displayRow + 0.5 };
}

function cellBg(col: number, boardRow: number) {
  return CELL_BG[(col + boardRow * 3) % 5];
}

// ─── DiceFace ─────────────────────────────────────────────────────────────────
function DiceFace({ value, size = 86, color = "#e040fb" }: { value: number; size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      <rect x="4" y="4" width="92" height="92" rx="16" fill="rgba(10,4,26,0.97)" />
      <rect x="4" y="4" width="92" height="92" rx="16" fill="none" stroke={color} strokeWidth="2.5"
        style={{ filter: `drop-shadow(0 0 10px ${color})` }} />
      {(DICE_DOTS[value] ?? []).map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r="9" fill={color}
          style={{ filter: `drop-shadow(0 0 5px ${color}90)` }} />
      ))}
    </svg>
  );
}

// ─── Board ────────────────────────────────────────────────────────────────────
function GameBoard({ players }: { players: Player[] }) {
  const drawSnake = (from: number, to: number, colorIdx: number) => {
    const color = SNAKE_SVG_COLORS[colorIdx % SNAKE_SVG_COLORS.length];
    const a = getCellCenter(from);
    const b = getCellCenter(to);
    const perpX = -(b.y - a.y) * 0.45;
    const perpY = (b.x - a.x) * 0.45;
    const d = `M ${a.x} ${a.y} C ${a.x + perpX} ${a.y + perpY} ${b.x - perpX} ${b.y - perpY} ${b.x} ${b.y}`;
    const hx = a.x + perpX * 0.15, hy = a.y + perpY * 0.15;
    const angle = Math.atan2(a.y - hy, a.x - hx) * 180 / Math.PI;
    return (
      <g key={`snk-${from}`}>
        <path d={d} stroke="rgba(0,0,0,0.25)" strokeWidth="0.26" fill="none" strokeLinecap="round" transform="translate(0.03,0.03)" />
        <path d={d} stroke={color} strokeWidth="0.22" fill="none" strokeLinecap="round" />
        <path d={d} stroke="rgba(255,255,255,0.30)" strokeWidth="0.07" fill="none" strokeLinecap="round" />
        <ellipse cx={a.x} cy={a.y} rx="0.25" ry="0.19" fill={color} transform={`rotate(${angle}, ${a.x}, ${a.y})`} />
        <ellipse cx={a.x - 0.05} cy={a.y - 0.06} rx="0.10" ry="0.07" fill="rgba(255,255,255,0.35)" transform={`rotate(${angle}, ${a.x}, ${a.y})`} />
        <circle cx={a.x + 0.09} cy={a.y - 0.08} r="0.055" fill="white" />
        <circle cx={a.x - 0.09} cy={a.y - 0.08} r="0.055" fill="white" />
        <circle cx={a.x + 0.10} cy={a.y - 0.07} r="0.028" fill="#111" />
        <circle cx={a.x - 0.08} cy={a.y - 0.07} r="0.028" fill="#111" />
        <path d={`M ${a.x} ${a.y + 0.14} l -0.06 0.09 M ${a.x} ${a.y + 0.14} l 0.06 0.09`}
          stroke="#ff2244" strokeWidth="0.04" strokeLinecap="round" fill="none" />
        <circle cx={b.x} cy={b.y} r="0.06" fill={color} opacity="0.7" />
      </g>
    );
  };

  const drawLadder = (from: number, to: number) => {
    const a = getCellCenter(from);
    const b = getCellCenter(to);
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = (-dy / len) * 0.115, ny = (dx / len) * 0.115;
    const rungs = [0.12, 0.23, 0.35, 0.47, 0.59, 0.71, 0.83, 0.95];
    return (
      <g key={`ldr-${from}`}>
        <line x1={a.x+nx+0.02} y1={a.y+ny+0.02} x2={b.x+nx+0.02} y2={b.y+ny+0.02} stroke="rgba(0,0,0,0.3)" strokeWidth="0.12" strokeLinecap="round" />
        <line x1={a.x-nx+0.02} y1={a.y-ny+0.02} x2={b.x-nx+0.02} y2={b.y-ny+0.02} stroke="rgba(0,0,0,0.3)" strokeWidth="0.12" strokeLinecap="round" />
        <line x1={a.x+nx} y1={a.y+ny} x2={b.x+nx} y2={b.y+ny} stroke="#d4a849" strokeWidth="0.10" strokeLinecap="round" />
        <line x1={a.x-nx} y1={a.y-ny} x2={b.x-nx} y2={b.y-ny} stroke="#d4a849" strokeWidth="0.10" strokeLinecap="round" />
        <line x1={a.x+nx} y1={a.y+ny} x2={b.x+nx} y2={b.y+ny} stroke="rgba(255,255,255,0.4)" strokeWidth="0.03" strokeLinecap="round" />
        {rungs.map((t, i) => {
          const x1 = (a.x + nx) + (b.x - a.x) * t;
          const y1 = (a.y + ny) + (b.y - a.y) * t;
          const x2 = (a.x - nx) + (b.x - a.x) * t;
          const y2 = (a.y - ny) + (b.y - a.y) * t;
          return (
            <g key={i}>
              <line x1={x1+0.01} y1={y1+0.01} x2={x2+0.01} y2={y2+0.01} stroke="rgba(0,0,0,0.25)" strokeWidth="0.09" strokeLinecap="round" />
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#c89840" strokeWidth="0.085" strokeLinecap="round" />
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(255,255,255,0.30)" strokeWidth="0.03" strokeLinecap="round" />
            </g>
          );
        })}
        <circle cx={a.x} cy={a.y} r="0.09" fill="#c89840" />
        <circle cx={b.x} cy={b.y} r="0.09" fill="#c89840" />
      </g>
    );
  };

  const snakeEntries = Object.entries(SNAKES) as unknown as [number, number][];
  const ladderEntries = Object.entries(LADDERS) as unknown as [number, number][];

  return (
    <div className="relative w-full h-full" style={{ minWidth: 0, minHeight: 0 }}>
      <div style={{
        position: "absolute", inset: "-11px",
        background: "linear-gradient(135deg, #f5dca0, #e8c870, #f5dca0)",
        borderRadius: "12px",
        boxShadow: "0 6px 32px rgba(0,0,0,0.4), inset 0 0 0 3px rgba(255,255,255,0.15)",
        zIndex: 0,
      }} />
      <div style={{ position: "absolute", inset: "-3px", background: "#1a1008", borderRadius: "5px", zIndex: 1 }} />
      <div style={{
        position: "absolute", inset: 0,
        display: "grid",
        gridTemplate: "repeat(10, 1fr) / repeat(10, 1fr)",
        zIndex: 2,
        borderRight: "1px solid #222",
        borderBottom: "1px solid #222",
      }}>
        {Array.from({ length: 100 }, (_, i) => {
          const num = i + 1;
          const { col, displayRow, boardRow } = getCellGridPos(num);
          const playersHere = players.filter(p => p.position === num);
          const bg = cellBg(col, boardRow);
          const isGoal = num === 100;
          return (
            <div key={num} className="relative overflow-hidden select-none"
              style={{
                gridColumn: col + 1, gridRow: displayRow + 1,
                background: bg,
                borderLeft: "1px solid rgba(0,0,0,0.35)",
                borderTop: "1px solid rgba(0,0,0,0.35)",
              }}>
              <span className="absolute font-black leading-none"
                style={{ top: "2px", left: "3px", fontSize: "clamp(5px,1.3cqw,13px)", color: "#111", textShadow: "0 0 3px rgba(255,255,255,0.5)", zIndex: 10 }}>
                {toArabic(num)}
              </span>
              {isGoal && (
                <div className="absolute inset-0 flex items-center justify-center" style={{ zIndex: 5 }}>
                  <motion.span style={{ fontSize: "clamp(10px,2.5cqw,28px)", filter: "drop-shadow(0 0 4px gold)" }}
                    animate={{ scale: [1, 1.18, 1], y: [0, -2, 0] }}
                    transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}>🏆</motion.span>
                </div>
              )}
              {playersHere.length > 0 && (
                <div className="absolute inset-0 flex items-center justify-center flex-wrap gap-[1px] p-[2px]" style={{ zIndex: 20 }}>
                  {playersHere.map(p => {
                    const s = playersHere.length === 1 ? "70%" : playersHere.length <= 4 ? "45%" : "32%";
                    return (
                      <motion.div key={p.username}
                        initial={{ scale: 0, y: -6 }} animate={{ scale: 1, y: 0 }}
                        transition={{ type: "spring", stiffness: 500, damping: 20 }}
                        style={{ width: s, paddingBottom: s, position: "relative", borderRadius: "50%", overflow: "hidden", border: `2px solid ${p.color}`, boxShadow: `0 0 8px ${p.color}`, flexShrink: 0 }}>
                        <img src={p.avatar} alt={p.displayName}
                          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
                          onError={e => { (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${p.username}`; }} />
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", zIndex: 30, pointerEvents: "none" }}
        viewBox="0 0 10 10" preserveAspectRatio="xMidYMid meet">
        {ladderEntries.map(([from, to]) => drawLadder(+from, +to))}
        {snakeEntries.map(([from, to], i) => drawSnake(+from, +to, i))}
      </svg>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function SnakesGame() {
  const [, navigate] = useLocation();
  const { user } = useAuth();

  const [phase, setPhase]                       = useState<Phase>("joining");
  const [players, setPlayers]                   = useState<Player[]>([]);
  const [currentPlayerIdx, setCurrentPlayerIdx] = useState(0);
  const [diceValue, setDiceValue]               = useState<number | null>(null);
  const [isRolling, setIsRolling]               = useState(false);
  const [isAnimating, setIsAnimating]           = useState(false);
  const [lastAction, setLastAction]             = useState<string | null>(null);
  const [winner, setWinner]                     = useState<Player | null>(null);
  const [joinMsg, setJoinMsg]                   = useState("");
  const [twitchConnected, setTwitchConnected]   = useState(false);

  const phaseRef      = useRef<Phase>("joining");
  const playersRef    = useRef<Player[]>([]);
  const currentIdxRef = useRef(0);
  const isAnimRef     = useRef(false);
  const wsRef         = useRef<WebSocket | null>(null);
  const connectedRef  = useRef(false);

  useEffect(() => { phaseRef.current = phase; }, [phase]);

  // ── Twitch IRC ─────────────────────────────────────────────────────────────
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
        const m = line.match(/^(?:@[^ ]+ )?:(\w+)![\w.@]+\.tmi\.twitch\.tv PRIVMSG #\w+ :(.+)$/);
        if (m) handleChatMsg(m[1], m[2].trim());
      }
    };
    ws.onclose = () => setTwitchConnected(false);
  }, []);

  if (!connectedRef.current && user?.username) {
    connectedRef.current = true;
    setTimeout(() => connectTwitch(user.username), 80);
  }

  const startRollRef = useRef<() => void>(() => {});

  // ── Chat Handler ──────────────────────────────────────────────────────────
  const handleChatMsg = useCallback((username: string, text: string) => {
    const msg = text.trim().toLowerCase();
    const ph  = phaseRef.current;

    if (msg === "join" && ph === "joining") {
      if (playersRef.current.some(p => p.username === username)) return;
      if (playersRef.current.length >= MAX_PLAYERS) return;
      const color = PLAYER_COLORS[playersRef.current.length % PLAYER_COLORS.length];
      const p: Player = {
        username, displayName: username,
        avatar: `https://unavatar.io/twitch/${username}`,
        position: 0, color,
      };
      const next = [...playersRef.current, p];
      playersRef.current = next;
      setPlayers(next);
      setJoinMsg(`${username} انضم!`);
      setTimeout(() => setJoinMsg(""), 2500);
      return;
    }

    const isRollCmd = ["roll","رول","ارم","ارمِ","ارمي"].includes(msg);
    if (isRollCmd && ph === "playing" && !isAnimRef.current) {
      const cur = playersRef.current[currentIdxRef.current];
      if (!cur || cur.username !== username) return;
      startRollRef.current();
    }
  }, []);

  // ── Game Logic ─────────────────────────────────────────────────────────────
  const endTurn = useCallback((pidx: number) => {
    const nextIdx = (pidx + 1) % playersRef.current.length;
    setCurrentPlayerIdx(nextIdx);
    currentIdxRef.current = nextIdx;
    isAnimRef.current = false;
    setIsAnimating(false);
    setLastAction(null);
  }, []);

  const triggerWin = useCallback((pidx: number) => {
    const w = playersRef.current[pidx];
    setWinner(w);
    setPhase("finished");
    phaseRef.current = "finished";
    isAnimRef.current = false;
    setIsAnimating(false);
  }, []);

  const handleSpecial = useCallback((pidx: number, pos: number) => {
    if (pos >= 100) { triggerWin(pidx); return; }
    if (LADDERS[pos] !== undefined) {
      const dest = LADDERS[pos];
      setLastAction(`🪜 صعد سلم! ← المربع ${toArabic(dest)}`);
      setTimeout(() => {
        setPlayers(prev => {
          const next = prev.map((p, i) => i === pidx ? { ...p, position: dest } : p);
          playersRef.current = next;
          return next;
        });
        setTimeout(() => endTurn(pidx), 850);
      }, 600);
    } else if (SNAKES[pos] !== undefined) {
      const dest = SNAKES[pos];
      setLastAction(`🐍 ابتلعه ثعبان! ← المربع ${toArabic(dest)}`);
      setTimeout(() => {
        setPlayers(prev => {
          const next = prev.map((p, i) => i === pidx ? { ...p, position: dest } : p);
          playersRef.current = next;
          return next;
        });
        setTimeout(() => endTurn(pidx), 850);
      }, 600);
    } else {
      setTimeout(() => endTurn(pidx), 500);
    }
  }, [endTurn, triggerWin]);

  const startMove = useCallback((pidx: number, steps: number) => {
    let pos = playersRef.current[pidx]?.position ?? 0;
    let step = 0;
    const tick = () => {
      if (step >= steps) { handleSpecial(pidx, pos); return; }
      step++;
      pos = Math.min(pos + 1, 100);
      setPlayers(prev => {
        const next = prev.map((p, i) => i === pidx ? { ...p, position: pos } : p);
        playersRef.current = next;
        return next;
      });
      if (pos >= 100) { setTimeout(() => triggerWin(pidx), 400); return; }
      setTimeout(tick, 220);
    };
    setTimeout(tick, 150);
  }, [handleSpecial, triggerWin]);

  const doRoll = useCallback(() => {
    if (isAnimRef.current) return;
    const roll = Math.floor(Math.random() * 6) + 1;
    const pidx = currentIdxRef.current;
    setIsRolling(true);
    setIsAnimating(true);
    isAnimRef.current = true;
    setLastAction(null);
    let count = 0;
    const interval = setInterval(() => {
      setDiceValue(Math.floor(Math.random() * 6) + 1);
      count++;
      if (count >= 10) {
        clearInterval(interval);
        setDiceValue(roll);
        setIsRolling(false);
        setTimeout(() => startMove(pidx, roll), 450);
      }
    }, 100);
  }, [startMove]);

  useEffect(() => { startRollRef.current = doRoll; }, [doRoll]);

  // ── Controls ───────────────────────────────────────────────────────────────
  const handleStartGame = () => {
    if (playersRef.current.length < 2) return;
    setPhase("playing"); phaseRef.current = "playing";
    setCurrentPlayerIdx(0); currentIdxRef.current = 0;
    setDiceValue(null); setLastAction(null);
    setIsAnimating(false); isAnimRef.current = false;
  };

  const handleRematch = () => {
    const reset = playersRef.current.map(p => ({ ...p, position: 0 }));
    playersRef.current = reset; setPlayers(reset);
    setWinner(null); setCurrentPlayerIdx(0); currentIdxRef.current = 0;
    setDiceValue(null); setLastAction(null);
    setIsAnimating(false); isAnimRef.current = false;
    setPhase("playing"); phaseRef.current = "playing";
  };

  const handleNewGame = () => {
    setPhase("joining"); phaseRef.current = "joining";
    setPlayers([]); playersRef.current = [];
    setWinner(null); setCurrentPlayerIdx(0); currentIdxRef.current = 0;
    setDiceValue(null); setLastAction(null);
    setIsAnimating(false); isAnimRef.current = false;
  };

  const currentPlayer = players[currentPlayerIdx] ?? null;

  // ── BRIGHT background ──────────────────────────────────────────────────────
  const BG = "linear-gradient(135deg, #2a1660 0%, #1e0f40 40%, #250d50 100%)";
  const HEADER_BG = "rgba(28, 12, 55, 0.97)";

  return (
    <div className="h-screen flex flex-col overflow-hidden" dir="rtl"
      style={{ background: BG, fontFamily: "'Cairo', sans-serif" }}>

      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-5 py-3 border-b border-purple-400/30 flex-shrink-0 z-10"
        style={{ background: HEADER_BG, backdropFilter: "blur(16px)" }}>
        <button onClick={() => navigate("/")}
          className="flex items-center gap-1.5 text-purple-200/70 hover:text-pink-300 transition-colors text-sm font-bold">
          <ArrowRight size={16} /> العودة
        </button>
        <div className="flex items-center gap-2">
          <span className="text-2xl">🐍</span>
          <h1 className="text-xl font-black" style={{ color: "#e040fb", textShadow: "0 0 20px #e040fb80" }}>
            السلم والثعبان
          </h1>
          <span className="text-2xl">🪜</span>
        </div>
        <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-bold ${
          twitchConnected
            ? "border-purple-400/50 bg-purple-500/15 text-purple-200"
            : "border-purple-500/20 text-purple-400/40"
        }`}>
          {twitchConnected ? <Wifi size={11} /> : <WifiOff size={11} />}
          {twitchConnected ? `#${user?.username}` : "جارٍ الاتصال..."}
        </div>
      </header>

      {/* ── BODY ───────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden flex">
        <AnimatePresence mode="wait">

          {/* ══ JOINING ══ */}
          {phase === "joining" && (
            <motion.div key="joining"
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
              className="flex-1 flex flex-col items-center justify-center p-6 gap-6 overflow-y-auto">

              <div className="text-center space-y-3">
                <div className={`inline-flex items-center gap-2 px-5 py-2 rounded-full border text-sm font-bold ${
                  twitchConnected
                    ? "border-green-400/50 bg-green-500/15 text-green-300"
                    : "border-purple-500/20 text-purple-400/40"
                }`}>
                  {twitchConnected
                    ? <><Wifi size={13} /> #{user?.username} متصل</>
                    : <><WifiOff size={13} /> جارٍ الاتصال...</>}
                </div>

                <h2 className="text-5xl font-black text-white">
                  اكتب <span style={{ color: "#00e5ff", textShadow: "0 0 20px #00e5ff" }}>join</span> في الشات
                </h2>
                <p className="text-purple-200/50 text-lg">يمكن حتى {MAX_PLAYERS} لاعبين الانضمام</p>
              </div>

              <AnimatePresence>
                {joinMsg && (
                  <motion.div key={joinMsg}
                    initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    className="px-6 py-2.5 rounded-xl text-center font-bold text-green-300 border border-green-400/40 bg-green-500/15">
                    ✅ {joinMsg}
                  </motion.div>
                )}
              </AnimatePresence>

              {players.length > 0 && (
                <div className="w-full max-w-2xl">
                  <p className="text-sm text-purple-200/50 mb-3 text-center flex items-center justify-center gap-1 font-bold">
                    <Users size={13} /> {players.length} لاعب
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {players.map(p => (
                      <motion.div key={p.username}
                        initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
                        className="flex flex-col items-center gap-2 p-4 rounded-2xl border"
                        style={{ borderColor: p.color + "60", background: p.color + "15" }}>
                        <div className="w-14 h-14 rounded-full overflow-hidden border-2"
                          style={{ borderColor: p.color, boxShadow: `0 0 14px ${p.color}50` }}>
                          <img src={p.avatar} alt={p.displayName} className="w-full h-full object-cover"
                            onError={e => { (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${p.username}`; }} />
                        </div>
                        <p className="text-sm font-bold truncate w-full text-center" style={{ color: p.color }}>
                          {p.displayName}
                        </p>
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}

              <motion.button onClick={handleStartGame} disabled={players.length < 2}
                whileHover={players.length >= 2 ? { scale: 1.04 } : {}}
                whileTap={players.length >= 2 ? { scale: 0.97 } : {}}
                className="flex items-center gap-3 px-10 py-4 rounded-2xl text-xl font-black text-white disabled:opacity-30"
                style={{
                  background: "linear-gradient(135deg, #e040fb, #9c27b0)",
                  boxShadow: players.length >= 2 ? "0 0 40px rgba(224,64,251,0.55)" : "none",
                }}>
                <Play size={22} fill="white" /> ابدأ اللعبة ({players.length})
              </motion.button>
            </motion.div>
          )}

          {/* ══ PLAYING ══ */}
          {phase === "playing" && (
            <motion.div key="playing"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex-1 flex overflow-hidden"
              style={{ padding: "14px", gap: "14px" }}>

              {/* ── RIGHT SIDEBAR (first in RTL = visual right) ── */}
              <div style={{ width: "210px", flexShrink: 0 }}
                className="flex flex-col gap-0 overflow-y-auto overflow-x-hidden">

                {/* ══ CURRENT PLAYER ══ */}
                {currentPlayer && (
                  <motion.div
                    key={currentPlayer.username}
                    initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }}
                    transition={{ type: "spring", stiffness: 320, damping: 26 }}
                    className="rounded-t-2xl p-4 flex-shrink-0"
                    style={{
                      border: `2px solid ${currentPlayer.color}`,
                      borderBottom: "none",
                      background: `linear-gradient(135deg, ${currentPlayer.color}22, ${currentPlayer.color}0e)`,
                      boxShadow: `0 0 28px ${currentPlayer.color}40, inset 0 0 20px ${currentPlayer.color}08`,
                    }}>
                    <div className="flex items-center justify-center gap-1.5 mb-3">
                      <motion.div animate={{ opacity: [0.5, 1, 0.5] }} transition={{ repeat: Infinity, duration: 1.2 }}
                        className="w-2 h-2 rounded-full" style={{ background: currentPlayer.color }} />
                      <span className="text-xs font-black tracking-wider" style={{ color: currentPlayer.color }}>
                        الدور على
                      </span>
                      <motion.div animate={{ opacity: [0.5, 1, 0.5] }} transition={{ repeat: Infinity, duration: 1.2, delay: 0.6 }}
                        className="w-2 h-2 rounded-full" style={{ background: currentPlayer.color }} />
                    </div>
                    <div className="flex flex-col items-center gap-2.5">
                      <div className="w-16 h-16 rounded-full overflow-hidden flex-shrink-0"
                        style={{ border: `3px solid ${currentPlayer.color}`, boxShadow: `0 0 24px ${currentPlayer.color}70` }}>
                        <img src={currentPlayer.avatar} alt={currentPlayer.displayName}
                          className="w-full h-full object-cover"
                          onError={e => { (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${currentPlayer.username}`; }} />
                      </div>
                      <div className="text-center">
                        <p className="font-black text-base leading-tight truncate max-w-[160px]"
                          style={{ color: currentPlayer.color, textShadow: `0 0 16px ${currentPlayer.color}60` }}>
                          {currentPlayer.displayName}
                        </p>
                        <p className="text-xs mt-0.5 font-bold"
                          style={{ color: currentPlayer.color + "80" }}>
                          {currentPlayer.position === 0 ? "لم يبدأ بعد" : `المربع ${toArabic(currentPlayer.position)}`}
                        </p>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* ══ DICE — directly below current player ══ */}
                <div className="rounded-b-2xl p-4 flex-shrink-0 flex flex-col items-center gap-2"
                  style={{
                    border: `2px solid ${currentPlayer?.color ?? "rgba(139,92,246,0.4)"}`,
                    borderTop: `1px solid ${currentPlayer?.color ?? "rgba(139,92,246,0.15)"}50`,
                    background: "rgba(20,8,45,0.92)",
                    boxShadow: currentPlayer ? `0 4px 20px ${currentPlayer.color}20` : "none",
                  }}>
                  <motion.div
                    animate={isRolling ? { rotate: [-14, 14, -9, 9, -4, 4, 0] } : {}}
                    transition={{ duration: 0.14 }}>
                    {diceValue !== null
                      ? <DiceFace value={diceValue} size={72} color={currentPlayer?.color ?? "#e040fb"} />
                      : (
                        <div className="w-[72px] h-[72px] rounded-2xl flex items-center justify-center"
                          style={{ border: `2px dashed ${currentPlayer?.color ?? "rgba(139,92,246,0.3)"}50` }}>
                          <span style={{ fontSize: "32px", opacity: 0.4 }}>🎲</span>
                        </div>
                      )
                    }
                  </motion.div>

                  <AnimatePresence mode="wait">
                    {diceValue !== null && !isRolling && (
                      <motion.p key={`d-${diceValue}`}
                        initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                        className="text-base font-black"
                        style={{ color: currentPlayer?.color ?? "#e040fb" }}>
                        رمية {toArabic(diceValue)}
                      </motion.p>
                    )}
                  </AnimatePresence>

                  {!isAnimating && currentPlayer ? (
                    <motion.div animate={{ opacity: [0.6, 1, 0.6] }} transition={{ repeat: Infinity, duration: 1.5 }}
                      className="text-center text-[11px] font-bold py-2 px-3 rounded-xl w-full"
                      style={{ background: currentPlayer.color + "18", color: currentPlayer.color + "ee" }}>
                      اكتب <span className="text-white font-black">roll</span> أو <span className="text-white font-black">رول</span>
                    </motion.div>
                  ) : isAnimating && (
                    <p className="text-[10px] text-purple-300/50 font-bold">جارٍ الحركة...</p>
                  )}
                </div>

                {/* ── Snake/Ladder action ── */}
                <AnimatePresence>
                  {lastAction && (
                    <motion.div key={lastAction}
                      initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                      className="rounded-xl border px-3 py-2 text-center font-black text-[11px] flex-shrink-0 mt-2"
                      style={{
                        borderColor: lastAction.includes("سلم") ? "rgba(34,197,94,0.6)" : "rgba(239,68,68,0.6)",
                        background: lastAction.includes("سلم") ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.13)",
                        color: lastAction.includes("سلم") ? "#4ade80" : "#f87171",
                      }}>
                      {lastAction}
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* ── Players list ── */}
                <div className="rounded-xl overflow-hidden flex-shrink-0 mt-2"
                  style={{ border: "1px solid rgba(167,139,250,0.25)", background: "rgba(20,8,45,0.80)" }}>
                  {players.map((p, idx) => {
                    const isCur = idx === currentPlayerIdx;
                    return (
                      <div key={p.username}
                        className="flex items-center gap-2 px-2.5 py-1.5"
                        style={{
                          background: isCur ? p.color + "18" : "transparent",
                          borderBottom: idx < players.length - 1 ? "1px solid rgba(167,139,250,0.10)" : "none",
                        }}>
                        <div className="w-6 h-6 rounded-full overflow-hidden border flex-shrink-0"
                          style={{ borderColor: isCur ? p.color : p.color + "50" }}>
                          <img src={p.avatar} alt={p.displayName} className="w-full h-full object-cover"
                            onError={e => { (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${p.username}`; }} />
                        </div>
                        <span className="flex-1 text-[11px] font-bold truncate"
                          style={{ color: isCur ? p.color : p.color + "80" }}>
                          {p.displayName}
                        </span>
                        <span className="text-[9px] font-bold flex-shrink-0"
                          style={{ color: isCur ? p.color + "cc" : "rgba(167,139,250,0.35)" }}>
                          {p.position === 0 ? "—" : toArabic(p.position)}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <button onClick={handleNewGame}
                  className="flex items-center justify-center gap-1 py-1.5 rounded-xl text-purple-300/30 hover:text-purple-200/50 text-[9px] border border-purple-400/15 hover:border-purple-400/25 transition-all flex-shrink-0 mt-2">
                  <RotateCcw size={8} /> لعبة جديدة
                </button>
              </div>

              {/* ── BOARD (fills remaining space) ── */}
              <div className="flex-1 flex items-center justify-center overflow-hidden"
                style={{
                  background: "rgba(255,255,255,0.03)",
                  borderRadius: "16px",
                  border: "1px solid rgba(167,139,250,0.15)",
                }}>
                <div style={{ height: "88%", aspectRatio: "1", containerType: "inline-size" }}>
                  <GameBoard players={players} />
                </div>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>

      {/* ── WIN SCREEN ────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {phase === "finished" && winner && (
          <motion.div key="win-overlay"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{
              position: "fixed", inset: 0, zIndex: 100,
              background: "radial-gradient(ellipse at 50% 40%, #2a0d50 0%, #1a0840 60%, #0d0530 100%)",
              display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
              gap: "28px", padding: "32px", textAlign: "center", direction: "rtl",
            }}>
            {[...Array(12)].map((_, i) => (
              <motion.div key={i} style={{
                position: "absolute",
                width: Math.random() * 8 + 4, height: Math.random() * 8 + 4,
                borderRadius: "50%",
                background: [winner.color, "#e040fb", "#00e5ff", "#ffd600"][i % 4],
                left: `${(i * 37 + 11) % 95}%`, top: `${(i * 53 + 7) % 90}%`,
                filter: "blur(1px)",
              }}
                animate={{ y: [0, -30, 0, 20, 0], opacity: [0.2, 0.8, 0.3, 0.9, 0.2], scale: [1, 1.4, 0.8, 1.2, 1] }}
                transition={{ duration: 3 + (i % 4), repeat: Infinity, delay: i * 0.25 }} />
            ))}

            <motion.div initial={{ scale: 0, y: -60, rotate: -20 }} animate={{ scale: 1, y: 0, rotate: 0 }}
              transition={{ type: "spring", stiffness: 220, damping: 16, delay: 0.1 }}
              style={{ fontSize: "96px", lineHeight: 1, filter: "drop-shadow(0 0 30px gold)", zIndex: 10 }}>
              🏆
            </motion.div>

            <div style={{ position: "relative", width: 200, height: 200, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10 }}>
              {[1, 2, 3].map(ring => (
                <motion.div key={ring} style={{
                  position: "absolute", width: 76 + ring * 42, height: 76 + ring * 42,
                  borderRadius: "50%", border: `2px solid ${winner.color}`,
                }}
                  animate={{ scale: [1, 1.07, 1], opacity: [0.35 / ring, 0.7 / ring, 0.35 / ring] }}
                  transition={{ repeat: Infinity, duration: 1.8 + ring * 0.4, delay: ring * 0.18 }} />
              ))}
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 280, damping: 18, delay: 0.3 }}
                style={{
                  width: 120, height: 120, borderRadius: "50%", overflow: "hidden",
                  border: `4px solid ${winner.color}`,
                  boxShadow: `0 0 40px ${winner.color}80`,
                  zIndex: 10, position: "relative",
                }}>
                <img src={winner.avatar} alt={winner.displayName}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  onError={e => { (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${winner.username}`; }} />
              </motion.div>
            </div>

            <motion.div style={{ zIndex: 10 }}
              initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.45, type: "spring" }}>
              <p style={{ fontSize: "14px", color: "rgba(200,180,255,0.6)", fontWeight: 700, marginBottom: "8px" }}>
                الفائز بالجولة
              </p>
              <h1 style={{
                fontSize: "clamp(36px,6vw,64px)", fontWeight: 900,
                color: winner.color, textShadow: `0 0 40px ${winner.color}, 0 0 80px ${winner.color}50`,
                lineHeight: 1.1, marginBottom: "10px",
              }}>
                {winner.displayName}
              </h1>
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }}
                style={{ fontSize: "24px", fontWeight: 700, color: "rgba(255,255,255,0.5)" }}>
                🎉 مبروك عليك الفوز!
              </motion.p>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.85 }}
              style={{ display: "flex", gap: "14px", zIndex: 10 }}>
              <motion.button onClick={() => navigate("/")} whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
                style={{ display: "flex", alignItems: "center", gap: "8px", padding: "14px 28px", borderRadius: "16px", fontWeight: 900, fontSize: "15px", border: "1px solid rgba(167,139,250,0.4)", color: "rgba(216,201,255,0.9)", background: "rgba(139,92,246,0.12)", cursor: "pointer" }}>
                <ArrowRight size={17} /> الرئيسية
              </motion.button>
              <motion.button onClick={handleRematch} whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
                style={{ display: "flex", alignItems: "center", gap: "8px", padding: "14px 28px", borderRadius: "16px", fontWeight: 900, fontSize: "15px", border: "1px solid rgba(167,139,250,0.4)", color: "rgba(216,201,255,0.9)", background: "rgba(139,92,246,0.12)", cursor: "pointer" }}>
                <RotateCcw size={17} /> إعادة اللعبة
              </motion.button>
              <motion.button onClick={handleNewGame} whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
                style={{ display: "flex", alignItems: "center", gap: "8px", padding: "14px 28px", borderRadius: "16px", fontWeight: 900, fontSize: "15px", background: "linear-gradient(135deg, #e040fb, #9c27b0)", boxShadow: "0 0 28px rgba(224,64,251,0.5)", color: "white", cursor: "pointer" }}>
                <Play size={17} fill="white" /> جولة جديدة
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
