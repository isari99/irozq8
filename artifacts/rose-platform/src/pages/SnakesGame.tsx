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
  "#e040fb", "#00e5ff", "#ffd600", "#ff6d00",
  "#22c55e", "#f43f5e", "#a78bfa", "#fb923c",
];
const MAX_PLAYERS = 8;

const LADDERS: Record<number, number> = {
  4: 14, 9: 31, 20: 38, 28: 84, 40: 59, 51: 67, 63: 81, 71: 91,
};
const SNAKES: Record<number, number> = {
  17: 7, 54: 34, 62: 19, 64: 60, 87: 24, 93: 73, 95: 56, 99: 78,
};

const LADDER_END_SET = new Set(Object.values(LADDERS));
const SNAKE_END_SET = new Set(Object.values(SNAKES));

const DICE_DOTS: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [[28, 28], [72, 72]],
  3: [[28, 28], [50, 50], [72, 72]],
  4: [[28, 28], [72, 28], [28, 72], [72, 72]],
  5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]],
  6: [[28, 22], [72, 22], [28, 50], [72, 50], [28, 78], [72, 78]],
};

// ─── Board Helpers ────────────────────────────────────────────────────────────
function getCellGridPos(n: number) {
  const idx = n - 1;
  const boardRow = Math.floor(idx / 10);
  const col = boardRow % 2 === 0 ? idx % 10 : 9 - (idx % 10);
  const displayRow = 9 - boardRow;
  return { col, displayRow };
}

function getCellCenter(n: number) {
  const { col, displayRow } = getCellGridPos(n);
  return { x: col + 0.5, y: displayRow + 0.5 };
}

// ─── Cell row colour stripes ──────────────────────────────────────────────────
const ROW_BG = [
  "rgba(224,64,251,0.18)",  // row 0 (bottom) - pink
  "rgba(0,100,200,0.22)",   // row 1 - blue
  "rgba(200,80,0,0.20)",    // row 2 - orange
  "rgba(0,180,100,0.18)",   // row 3 - green
  "rgba(180,0,200,0.20)",   // row 4 - violet
  "rgba(0,160,220,0.20)",   // row 5 - cyan
  "rgba(220,160,0,0.20)",   // row 6 - gold
  "rgba(200,20,60,0.20)",   // row 7 - red
  "rgba(100,0,220,0.22)",   // row 8 - purple
  "rgba(0,200,200,0.20)",   // row 9 (top) - teal
];
const DARK_FACTOR = "rgba(0,0,0,0.30)";

// ─── DiceFace ─────────────────────────────────────────────────────────────────
function DiceFace({ value, size = 88, color = "#e040fb" }: { value: number; size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      <rect x="4" y="4" width="92" height="92" rx="18" fill="rgba(10,4,26,0.97)" />
      <rect x="4" y="4" width="92" height="92" rx="18" fill="none" stroke={color} strokeWidth="2.5"
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
  const LADDER_CLR = "#ffd600";
  const SNAKE_CLR  = "#ef4444";

  return (
    <div className="relative w-full h-full">

      {/* Wooden frame */}
      <div className="absolute rounded-2xl pointer-events-none z-20"
        style={{
          inset: "-10px",
          background:
            "linear-gradient(135deg, #6b3a0a 0%, #c8871a 20%, #f0b040 35%, #c8871a 50%, #8b5e1a 65%, #d4a017 80%, #6b3a0a 100%)",
          boxShadow: "0 0 0 2px rgba(0,0,0,0.5), 0 12px 40px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,210,100,0.4)",
          borderRadius: "20px",
        }} />
      <div className="absolute rounded-xl pointer-events-none z-10"
        style={{ inset: "-4px", background: "rgba(4,2,12,0.95)" }} />

      {/* Cell grid */}
      <div className="absolute inset-0 rounded-xl overflow-hidden"
        style={{ display: "grid", gridTemplate: "repeat(10, 1fr) / repeat(10, 1fr)" }}>

        {Array.from({ length: 100 }, (_, i) => {
          const num = i + 1;
          const { col, displayRow } = getCellGridPos(num);
          const boardRow = 9 - displayRow;
          const playersHere = players.filter(p => p.position === num);

          const isLadderStart = LADDERS[num] !== undefined;
          const isSnakeStart  = SNAKES[num]  !== undefined;
          const isLadderEnd   = LADDER_END_SET.has(num);
          const isSnakeEnd    = SNAKE_END_SET.has(num);
          const isGoal        = num === 100;

          let bg = ROW_BG[boardRow];
          if ((col + boardRow) % 2 === 1) bg = `linear-gradient(rgba(0,0,0,0.25), rgba(0,0,0,0.25)), ${bg.startsWith("rgba") ? bg : bg}`;
          if (isLadderStart) bg = "rgba(34,197,94,0.28)";
          if (isSnakeStart)  bg = "rgba(239,68,68,0.28)";
          if (isGoal)        bg = "rgba(255,215,0,0.30)";

          let borderC = "rgba(255,255,255,0.07)";
          if (isLadderStart) borderC = "rgba(250,204,21,0.55)";
          if (isSnakeStart)  borderC = "rgba(239,68,68,0.55)";
          if (isGoal)        borderC = "rgba(255,215,0,0.80)";

          return (
            <div key={num} className="relative border overflow-hidden select-none"
              style={{ gridColumn: col + 1, gridRow: displayRow + 1, background: bg, borderColor: borderC }}>

              {/* Cell number */}
              <span className="absolute bottom-0 right-[1px] text-[5.5px] sm:text-[7px] font-black leading-none z-10"
                style={{ color: isLadderStart ? LADDER_CLR : isSnakeStart ? SNAKE_CLR : isGoal ? "#ffd600" : "rgba(200,160,255,0.40)" }}>
                {num}
              </span>

              {/* Goal star */}
              {isGoal && (
                <div className="absolute inset-0 flex items-center justify-center z-10">
                  <motion.span className="text-base sm:text-lg"
                    animate={{ rotate: [0, 360] }} transition={{ duration: 4, repeat: Infinity, ease: "linear" }}>
                    ⭐
                  </motion.span>
                </div>
              )}

              {/* Players */}
              {playersHere.length > 0 && (
                <div className="absolute inset-0 flex items-center justify-center flex-wrap gap-[1px] p-[1px] z-30">
                  {playersHere.map(p => {
                    const s = playersHere.length === 1 ? "66%" : playersHere.length <= 4 ? "44%" : "30%";
                    return (
                      <motion.div key={p.username}
                        initial={{ scale: 0, y: -6 }} animate={{ scale: 1, y: 0 }}
                        transition={{ type: "spring", stiffness: 500, damping: 20 }}
                        className="relative rounded-full overflow-hidden border-2 flex-shrink-0"
                        style={{ width: s, paddingBottom: s, borderColor: p.color, boxShadow: `0 0 8px ${p.color}90` }}>
                        <img src={p.avatar} alt={p.displayName}
                          className="absolute inset-0 w-full h-full object-cover"
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

      {/* SVG overlay — snakes & ladders */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none rounded-xl z-20"
        viewBox="0 0 10 10" preserveAspectRatio="xMidYMid meet">

        {/* ── Ladders ── */}
        {Object.entries(LADDERS).map(([fromStr, to]) => {
          const from = parseInt(fromStr);
          const a = getCellCenter(from);
          const b = getCellCenter(to);
          const dx = b.x - a.x, dy = b.y - a.y;
          const len = Math.sqrt(dx * dx + dy * dy) || 1;
          const nx = (-dy / len) * 0.10, ny = (dx / len) * 0.10;
          const rungs = [0.18, 0.32, 0.48, 0.64, 0.80];
          return (
            <g key={`ldr-${from}`} opacity="0.88">
              {/* Rails */}
              <line x1={a.x + nx} y1={a.y + ny} x2={b.x + nx} y2={b.y + ny}
                stroke={LADDER_CLR} strokeWidth="0.085" strokeLinecap="round" />
              <line x1={a.x - nx} y1={a.y - ny} x2={b.x - nx} y2={b.y - ny}
                stroke={LADDER_CLR} strokeWidth="0.085" strokeLinecap="round" />
              {/* Rungs */}
              {rungs.map((t, i) => {
                const x1 = (a.x + nx) + (b.x + nx - a.x - nx) * t;
                const y1 = (a.y + ny) + (b.y + ny - a.y - ny) * t;
                const x2 = (a.x - nx) + (b.x - nx - a.x + nx) * t;
                const y2 = (a.y - ny) + (b.y - ny - a.y + ny) * t;
                return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
                  stroke={LADDER_CLR} strokeWidth="0.060" strokeLinecap="round" />;
              })}
              {/* Cap circles */}
              <circle cx={b.x} cy={b.y} r="0.12" fill={LADDER_CLR} />
              <circle cx={a.x} cy={a.y} r="0.09" fill={LADDER_CLR} opacity="0.7" />
            </g>
          );
        })}

        {/* ── Snakes ── */}
        {Object.entries(SNAKES).map(([fromStr, to]) => {
          const from = parseInt(fromStr);
          const a = getCellCenter(from);
          const b = getCellCenter(to);
          const perpX = -(b.y - a.y) * 0.42;
          const perpY = (b.x - a.x) * 0.42;
          return (
            <g key={`snk-${from}`} opacity="0.90">
              {/* Body */}
              <path
                d={`M ${a.x} ${a.y} C ${a.x + perpX} ${a.y + perpY} ${b.x - perpX} ${b.y - perpY} ${b.x} ${b.y}`}
                stroke={SNAKE_CLR} strokeWidth="0.12" fill="none" strokeLinecap="round"
                style={{ filter: `drop-shadow(0 0 2px ${SNAKE_CLR}80)` }} />
              {/* Head */}
              <ellipse cx={a.x} cy={a.y} rx="0.17" ry="0.13" fill={SNAKE_CLR} />
              <circle cx={a.x + 0.07} cy={a.y - 0.06} r="0.04" fill="white" />
              <circle cx={a.x - 0.07} cy={a.y - 0.06} r="0.04" fill="white" />
              <circle cx={a.x + 0.07} cy={a.y - 0.06} r="0.02" fill="#111" />
              <circle cx={a.x - 0.07} cy={a.y - 0.06} r="0.02" fill="#111" />
              {/* Tail */}
              <circle cx={b.x} cy={b.y} r="0.07" fill={SNAKE_CLR} opacity="0.65" />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function SnakesGame() {
  const [, navigate] = useLocation();
  const { user } = useAuth();

  const [phase, setPhase]                   = useState<Phase>("joining");
  const [players, setPlayers]               = useState<Player[]>([]);
  const [currentPlayerIdx, setCurrentPlayerIdx] = useState(0);
  const [diceValue, setDiceValue]           = useState<number | null>(null);
  const [isRolling, setIsRolling]           = useState(false);
  const [isAnimating, setIsAnimating]       = useState(false);
  const [lastAction, setLastAction]         = useState<string | null>(null);
  const [winner, setWinner]                 = useState<Player | null>(null);
  const [joinMsg, setJoinMsg]               = useState("");
  const [twitchConnected, setTwitchConnected] = useState(false);

  // Refs for stable access inside callbacks
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
        const m = line.match(/^(?:@[^ ]+ )?:(\w+)!\w+@\w+\.tmi\.twitch\.tv PRIVMSG #\w+ :(.+)$/);
        if (m) handleChatMsg(m[1], m[2].trim());
      }
    };
    ws.onclose = () => setTwitchConnected(false);
  }, []);

  if (!connectedRef.current && user?.username) {
    connectedRef.current = true;
    setTimeout(() => connectTwitch(user.username), 80);
  }

  // ── Roll ref (avoid stale in handleChatMsg) ────────────────────────────────
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

    if (msg === "roll" && ph === "playing" && !isAnimRef.current) {
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
      setLastAction(`🪜 صعد سلم! ← المربع ${dest}`);
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
      setLastAction(`🐍 ابتلعه ثعبان! ← المربع ${dest}`);
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
      setTimeout(tick, 230);
    };
    setTimeout(tick, 150);
  }, [handleSpecial, triggerWin]);

  // Build the roll function, update ref every render
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
    setPhase("playing");
    phaseRef.current = "playing";
    setCurrentPlayerIdx(0);
    currentIdxRef.current = 0;
    setDiceValue(null);
    setLastAction(null);
    setIsAnimating(false);
    isAnimRef.current = false;
  };

  const handleRematch = () => {
    const reset = playersRef.current.map(p => ({ ...p, position: 0 }));
    playersRef.current = reset;
    setPlayers(reset);
    setWinner(null);
    setCurrentPlayerIdx(0);
    currentIdxRef.current = 0;
    setDiceValue(null);
    setLastAction(null);
    setIsAnimating(false);
    isAnimRef.current = false;
    setPhase("playing");
    phaseRef.current = "playing";
  };

  const handleNewGame = () => {
    setPhase("joining");
    phaseRef.current = "joining";
    setPlayers([]);
    playersRef.current = [];
    setWinner(null);
    setCurrentPlayerIdx(0);
    currentIdxRef.current = 0;
    setDiceValue(null);
    setLastAction(null);
    setIsAnimating(false);
    isAnimRef.current = false;
  };

  const currentPlayer = players[currentPlayerIdx] ?? null;

  return (
    <div className="h-screen gradient-bg flex flex-col overflow-hidden" dir="rtl">
      {/* Glows */}
      <div className="absolute top-0 right-0 w-96 h-96 rounded-full opacity-8 pointer-events-none"
        style={{ background: "radial-gradient(circle, #e040fb, transparent)", filter: "blur(80px)" }} />
      <div className="absolute bottom-0 left-0 w-96 h-96 rounded-full opacity-8 pointer-events-none"
        style={{ background: "radial-gradient(circle, #00e5ff, transparent)", filter: "blur(80px)" }} />

      {/* ── HEADER ──────────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-5 py-2.5 border-b border-purple-500/20 flex-shrink-0 z-10"
        style={{ background: "rgba(10,5,20,0.92)", backdropFilter: "blur(16px)" }}>
        <button onClick={() => navigate("/")}
          className="flex items-center gap-1.5 text-purple-300/60 hover:text-pink-400 transition-colors text-sm">
          <ArrowRight size={16} /> العودة
        </button>
        <div className="flex items-center gap-2">
          <span className="text-2xl">🐍</span>
          <h1 className="text-xl font-black neon-text-pink">السلم والثعبان</h1>
          <span className="text-2xl">🪜</span>
        </div>
        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs ${
          twitchConnected ? "border-purple-500/40 bg-purple-500/10 text-purple-300" : "border-gray-700 text-gray-600"
        }`}>
          {twitchConnected ? <Wifi size={11} /> : <WifiOff size={11} />}
          {twitchConnected ? `#${user?.username}` : "جارٍ الاتصال..."}
        </div>
      </header>

      {/* ── BODY ────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden flex">
        <AnimatePresence mode="wait">

          {/* ── JOINING ── */}
          {phase === "joining" && (
            <motion.div key="joining"
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
              className="flex-1 flex flex-col items-center justify-center p-6 gap-6 overflow-y-auto z-10">

              <div className="text-center space-y-3">
                <div className={`inline-flex items-center gap-2 px-5 py-2 rounded-full border text-sm ${
                  twitchConnected ? "border-green-500/40 bg-green-500/10 text-green-300" : "border-gray-700 text-gray-500"
                }`}>
                  {twitchConnected ? <><Wifi size={13} /> #{user?.username} متصل</> : <><WifiOff size={13} /> جارٍ الاتصال...</>}
                </div>
                <h2 className="text-5xl font-black text-white">
                  اكتب <span className="neon-text-cyan">join</span> في الشات
                </h2>
                <p className="text-purple-300/50 text-lg">يمكن حتى {MAX_PLAYERS} لاعبين الانضمام</p>
              </div>

              {/* Join flash */}
              <AnimatePresence>
                {joinMsg && (
                  <motion.div key={joinMsg}
                    initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    className="px-6 py-2.5 rounded-xl text-center font-bold text-green-400 border border-green-500/30 bg-green-500/10">
                    ✅ {joinMsg}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Players grid */}
              {players.length > 0 && (
                <div className="w-full max-w-2xl">
                  <p className="text-sm text-purple-400/50 mb-3 text-center flex items-center justify-center gap-1">
                    <Users size={13} /> {players.length} لاعب
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {players.map(p => (
                      <motion.div key={p.username}
                        initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
                        className="flex flex-col items-center gap-2 p-4 rounded-2xl border"
                        style={{ borderColor: p.color + "50", background: p.color + "10" }}>
                        <div className="w-14 h-14 rounded-2xl overflow-hidden border-2 flex-shrink-0"
                          style={{ borderColor: p.color, boxShadow: `0 0 10px ${p.color}40` }}>
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

              <motion.button
                onClick={handleStartGame}
                disabled={players.length < 2}
                whileHover={players.length >= 2 ? { scale: 1.04 } : {}}
                whileTap={players.length >= 2 ? { scale: 0.97 } : {}}
                className="flex items-center gap-3 px-10 py-4 rounded-2xl text-xl font-black disabled:opacity-30"
                style={{
                  background: "linear-gradient(135deg, #e040fb, #9c27b0)",
                  boxShadow: players.length >= 2 ? "0 0 35px rgba(224,64,251,0.5)" : "none",
                }}>
                <Play size={22} fill="white" /> ابدأ اللعبة ({players.length})
              </motion.button>
            </motion.div>
          )}

          {/* ── PLAYING ── */}
          {phase === "playing" && (
            <motion.div key="playing"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex-1 flex gap-3 p-3 overflow-hidden z-10">

              {/* Board — square, fills full height */}
              <div className="flex-shrink-0 h-full" style={{ aspectRatio: "1", padding: "10px" }}>
                <GameBoard players={players} />
              </div>

              {/* Sidebar */}
              <div className="flex-1 min-w-0 flex flex-col gap-3 overflow-y-auto">

                {/* Current turn card */}
                {currentPlayer && (
                  <motion.div layout
                    className="rounded-2xl border p-4"
                    style={{
                      borderColor: currentPlayer.color + "60",
                      background: currentPlayer.color + "0d",
                      boxShadow: `0 0 28px ${currentPlayer.color}22`,
                    }}>
                    <p className="text-xs text-purple-400/50 mb-2 text-center font-bold">الدور على</p>
                    <div className="flex items-center gap-3">
                      <div className="w-14 h-14 rounded-2xl overflow-hidden border-2 flex-shrink-0"
                        style={{ borderColor: currentPlayer.color, boxShadow: `0 0 12px ${currentPlayer.color}50` }}>
                        <img src={currentPlayer.avatar} alt={currentPlayer.displayName}
                          className="w-full h-full object-cover"
                          onError={e => { (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${currentPlayer.username}`; }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xl font-black truncate"
                          style={{ color: currentPlayer.color }}>{currentPlayer.displayName}</p>
                        <p className="text-xs text-purple-400/50">
                          {currentPlayer.position === 0 ? "لم يبدأ بعد" : `المربع ${currentPlayer.position}`}
                        </p>
                      </div>
                    </div>
                    {!isAnimating && (
                      <motion.p
                        animate={{ opacity: [0.5, 1, 0.5] }} transition={{ repeat: Infinity, duration: 1.5 }}
                        className="text-center text-sm mt-3 font-bold"
                        style={{ color: currentPlayer.color + "cc" }}>
                        اكتب <span className="font-black text-white">roll</span> في الشات
                      </motion.p>
                    )}
                    {isAnimating && (
                      <p className="text-center text-xs mt-2 text-purple-400/50">جارٍ الحركة...</p>
                    )}
                  </motion.div>
                )}

                {/* Dice */}
                {diceValue !== null && (
                  <div className="flex flex-col items-center gap-1">
                    <motion.div
                      animate={isRolling ? { rotate: [-15, 15, -10, 10, -5, 5, 0] } : { rotate: 0 }}
                      transition={{ duration: 0.15 }}>
                      <DiceFace value={diceValue} size={84} color={currentPlayer?.color ?? "#e040fb"} />
                    </motion.div>
                    {!isRolling && (
                      <p className="text-xs font-bold" style={{ color: currentPlayer?.color ?? "#e040fb" }}>
                        رمية: {diceValue}
                      </p>
                    )}
                  </div>
                )}

                {/* Action banner (snake/ladder) */}
                <AnimatePresence>
                  {lastAction && (
                    <motion.div key={lastAction}
                      initial={{ opacity: 0, scale: 0.85, y: 8 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      className="rounded-2xl border p-3 text-center font-black text-base"
                      style={{
                        borderColor: lastAction.includes("سلم") ? "rgba(34,197,94,0.5)" : "rgba(239,68,68,0.5)",
                        background: lastAction.includes("سلم") ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.10)",
                        color: lastAction.includes("سلم") ? "#22c55e" : "#ef4444",
                        boxShadow: lastAction.includes("سلم") ? "0 0 20px rgba(34,197,94,0.2)" : "0 0 20px rgba(239,68,68,0.2)",
                      }}>
                      {lastAction}
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Players list */}
                <div className="flex-1 rounded-2xl border border-purple-500/20 overflow-hidden flex flex-col min-h-0"
                  style={{ background: "rgba(10,4,24,0.80)" }}>
                  <div className="px-3 py-2 border-b border-purple-500/15 flex-shrink-0 flex items-center gap-2">
                    <Users size={12} className="text-purple-400/50" />
                    <span className="text-xs font-bold text-purple-400/50">اللاعبون</span>
                    <span className="text-xs text-purple-500/40 mr-auto">{players.length}</span>
                  </div>
                  <div className="overflow-y-auto flex-1 divide-y divide-purple-500/10">
                    {players.map((p, idx) => (
                      <motion.div key={p.username} layout
                        className="flex items-center gap-2 px-3 py-2.5 transition-colors"
                        style={{ background: idx === currentPlayerIdx && !isAnimating ? p.color + "0e" : "transparent" }}>
                        <div className="w-7 h-7 rounded-lg overflow-hidden border flex-shrink-0"
                          style={{ borderColor: p.color + "60" }}>
                          <img src={p.avatar} alt={p.displayName} className="w-full h-full object-cover"
                            onError={e => { (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${p.username}`; }} />
                        </div>
                        <span className="flex-1 text-sm font-bold truncate" style={{ color: p.color }}>
                          {p.displayName}
                        </span>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {idx === currentPlayerIdx && !isAnimating && (
                            <motion.span
                              animate={{ opacity: [0.5, 1, 0.5] }} transition={{ repeat: Infinity, duration: 1.2 }}
                              className="text-[10px] font-black" style={{ color: p.color }}>◀ دوره</motion.span>
                          )}
                          <span className="text-[10px] text-purple-400/45 font-bold min-w-[32px] text-right">
                            {p.position === 0 ? "—" : `#${p.position}`}
                          </span>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>

                {/* Reset positions */}
                <button onClick={handleNewGame}
                  className="flex items-center justify-center gap-1.5 py-2 rounded-xl text-purple-400/30 hover:text-purple-300/50 text-xs border border-purple-500/10 transition-all">
                  <RotateCcw size={11} /> لعبة جديدة بلاعبين جدد
                </button>
              </div>
            </motion.div>
          )}

          {/* ── FINISHED ── */}
          {phase === "finished" && winner && (
            <motion.div key="finished"
              initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
              className="flex-1 flex flex-col items-center justify-center p-6 gap-7 text-center z-10 overflow-y-auto">

              {/* Rings + Avatar */}
              <div className="relative flex items-center justify-center" style={{ width: 280, height: 280 }}>
                {[1, 2, 3].map(ring => (
                  <motion.div key={ring}
                    className="absolute rounded-full border"
                    style={{
                      width: 110 + ring * 55, height: 110 + ring * 55,
                      borderColor: winner.color + Math.max(50 - ring * 15, 10).toString(16).padStart(2, "0"),
                    }}
                    animate={{ scale: [1, 1.06, 1], opacity: [0.25, 0.55, 0.25] }}
                    transition={{ repeat: Infinity, duration: 2 + ring * 0.5, delay: ring * 0.25 }} />
                ))}
                <motion.div
                  animate={{ y: [0, -14, 0] }}
                  transition={{ repeat: Infinity, duration: 2.2, ease: "easeInOut" }}
                  className="relative w-36 h-36 rounded-3xl overflow-hidden border-4 z-10"
                  style={{ borderColor: winner.color, boxShadow: `0 0 60px ${winner.color}70, 0 0 120px ${winner.color}25` }}>
                  <img src={winner.avatar} alt={winner.displayName} className="w-full h-full object-cover"
                    onError={e => { (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${winner.username}`; }} />
                </motion.div>
              </div>

              {/* Text */}
              <div className="space-y-3">
                <motion.p className="text-purple-300/50 text-xl font-bold"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
                  🏆 الفائز
                </motion.p>
                <motion.h2 className="text-6xl font-black"
                  initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.25, type: "spring" }}
                  style={{ color: winner.color, textShadow: `0 0 50px ${winner.color}` }}>
                  {winner.displayName}
                </motion.h2>
                <motion.p className="text-3xl font-bold text-purple-200/60"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}>
                  🎉 مبروك!
                </motion.p>
              </div>

              {/* Buttons */}
              <motion.div className="flex gap-4"
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
                <motion.button onClick={handleRematch}
                  whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
                  className="flex items-center gap-2 px-7 py-4 rounded-2xl font-black text-base border border-purple-500/35 text-purple-300 hover:border-purple-400/60 transition-all">
                  <RotateCcw size={18} /> إعادة اللعبة
                </motion.button>
                <motion.button onClick={handleNewGame}
                  whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
                  className="flex items-center gap-2 px-7 py-4 rounded-2xl font-black text-base"
                  style={{ background: "linear-gradient(135deg, #e040fb, #9c27b0)", boxShadow: "0 0 30px rgba(224,64,251,0.45)" }}>
                  <Play size={18} fill="white" /> جولة جديدة
                </motion.button>
              </motion.div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}
