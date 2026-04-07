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

// ── Clean non-overlapping positions ──────────────────────────────────────────
// Ladders (bottom → top):  start < end, no cell used by snakes
const LADDERS: Record<number, number> = {
   4: 14,
   9: 31,
  20: 38,
  28: 84,
  40: 59,
  51: 67,
  63: 81,
  71: 91,
};
// Snakes (head → tail):  head > tail, no cell used by ladders
const SNAKES: Record<number, number> = {
  17:  7,
  54: 34,
  62: 19,
  64:  3,
  87: 24,
  93: 73,
  95: 75,
  99: 78,
};

const SNAKE_COLORS = [
  "#FFD600","#22C55E","#3B82F6","#EC4899",
  "#F97316","#8B5CF6","#EF4444","#06B6D4",
];

// Bright, saturated cell palette — alternating rows
const CELL_PALETTE = [
  ["#FFF9C4","#FFF3E0"],  // row 0,2,4,…
  ["#E3F2FD","#E8F5E9"],  // row 1,3,5,…
];

const DICE_DOTS: Record<number, [number,number][]> = {
  1: [[50,50]],
  2: [[28,28],[72,72]],
  3: [[28,28],[50,50],[72,72]],
  4: [[28,28],[72,28],[28,72],[72,72]],
  5: [[28,28],[72,28],[50,50],[28,72],[72,72]],
  6: [[28,22],[72,22],[28,50],[72,50],[28,78],[72,78]],
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
function cellColor(col: number, boardRow: number) {
  const pal = CELL_PALETTE[boardRow % 2];
  return pal[(col + boardRow) % 2];
}

// ─── DiceFace ─────────────────────────────────────────────────────────────────
function DiceFace({ value, size = 90, color = "#e040fb" }: { value: number; size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      <rect x="3" y="3" width="94" height="94" rx="18" fill="#0f0228" />
      <rect x="3" y="3" width="94" height="94" rx="18" fill="none"
        stroke={color} strokeWidth="3"
        style={{ filter: `drop-shadow(0 0 12px ${color})` }} />
      {(DICE_DOTS[value] ?? []).map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r="9.5" fill={color}
          style={{ filter: `drop-shadow(0 0 6px ${color})` }} />
      ))}
    </svg>
  );
}

// ─── Board ────────────────────────────────────────────────────────────────────
function GameBoard({ players }: { players: Player[] }) {

  const drawSnake = (from: number, to: number, idx: number) => {
    const color = SNAKE_COLORS[idx % SNAKE_COLORS.length];
    const a = getCellCenter(from);
    const b = getCellCenter(to);
    const perpX = -(b.y - a.y) * 0.42;
    const perpY =  (b.x - a.x) * 0.42;
    const d = `M ${a.x} ${a.y} C ${a.x+perpX} ${a.y+perpY} ${b.x-perpX} ${b.y-perpY} ${b.x} ${b.y}`;
    const hx = a.x + perpX * 0.15, hy = a.y + perpY * 0.15;
    const angle = Math.atan2(a.y - hy, a.x - hx) * 180 / Math.PI;
    return (
      <g key={`snk-${from}`}>
        {/* body shadow */}
        <path d={d} stroke="rgba(0,0,0,0.28)" strokeWidth="0.30" fill="none" strokeLinecap="round" transform="translate(0.035,0.035)" />
        {/* body */}
        <path d={d} stroke={color} strokeWidth="0.25" fill="none" strokeLinecap="round" />
        {/* shine */}
        <path d={d} stroke="rgba(255,255,255,0.30)" strokeWidth="0.08" fill="none" strokeLinecap="round" />
        {/* head */}
        <ellipse cx={a.x} cy={a.y} rx="0.27" ry="0.20" fill={color}
          transform={`rotate(${angle},${a.x},${a.y})`}
          style={{ filter: `drop-shadow(0 0 0.12px ${color})` }} />
        {/* eyes */}
        <circle cx={a.x+0.10} cy={a.y-0.09} r="0.06" fill="white" />
        <circle cx={a.x-0.10} cy={a.y-0.09} r="0.06" fill="white" />
        <circle cx={a.x+0.11} cy={a.y-0.08} r="0.03" fill="#111" />
        <circle cx={a.x-0.09} cy={a.y-0.08} r="0.03" fill="#111" />
        {/* tongue */}
        <path d={`M ${a.x} ${a.y+0.15} l -0.07 0.10 M ${a.x} ${a.y+0.15} l 0.07 0.10`}
          stroke="#ff2244" strokeWidth="0.045" strokeLinecap="round" fill="none" />
        {/* tail dot */}
        <circle cx={b.x} cy={b.y} r="0.065" fill={color} opacity="0.75" />
      </g>
    );
  };

  const drawLadder = (from: number, to: number) => {
    const a = getCellCenter(from);
    const b = getCellCenter(to);
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.sqrt(dx*dx + dy*dy) || 1;
    const nx = (-dy / len) * 0.12, ny = (dx / len) * 0.12;
    const rungs = [0.10,0.22,0.34,0.46,0.58,0.70,0.82,0.94];
    return (
      <g key={`ldr-${from}`}>
        {/* side rails shadow */}
        <line x1={a.x+nx+0.022} y1={a.y+ny+0.022} x2={b.x+nx+0.022} y2={b.y+ny+0.022} stroke="rgba(0,0,0,0.28)" strokeWidth="0.13" strokeLinecap="round" />
        <line x1={a.x-nx+0.022} y1={a.y-ny+0.022} x2={b.x-nx+0.022} y2={b.y-ny+0.022} stroke="rgba(0,0,0,0.28)" strokeWidth="0.13" strokeLinecap="round" />
        {/* rails */}
        <line x1={a.x+nx} y1={a.y+ny} x2={b.x+nx} y2={b.y+ny} stroke="#d4922a" strokeWidth="0.11" strokeLinecap="round" />
        <line x1={a.x-nx} y1={a.y-ny} x2={b.x-nx} y2={b.y-ny} stroke="#d4922a" strokeWidth="0.11" strokeLinecap="round" />
        {/* shine on rails */}
        <line x1={a.x+nx} y1={a.y+ny} x2={b.x+nx} y2={b.y+ny} stroke="rgba(255,255,255,0.38)" strokeWidth="0.032" strokeLinecap="round" />
        <line x1={a.x-nx} y1={a.y-ny} x2={b.x-nx} y2={b.y-ny} stroke="rgba(255,255,255,0.38)" strokeWidth="0.032" strokeLinecap="round" />
        {/* rungs */}
        {rungs.map((t, i) => {
          const x1 = (a.x+nx) + (b.x-a.x)*t;
          const y1 = (a.y+ny) + (b.y-a.y)*t;
          const x2 = (a.x-nx) + (b.x-a.x)*t;
          const y2 = (a.y-ny) + (b.y-a.y)*t;
          return (
            <g key={i}>
              <line x1={x1+0.01} y1={y1+0.01} x2={x2+0.01} y2={y2+0.01} stroke="rgba(0,0,0,0.22)" strokeWidth="0.095" strokeLinecap="round" />
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#c08830" strokeWidth="0.09" strokeLinecap="round" />
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(255,255,255,0.28)" strokeWidth="0.030" strokeLinecap="round" />
            </g>
          );
        })}
        {/* end caps */}
        <circle cx={a.x} cy={a.y} r="0.10" fill="#c08830" />
        <circle cx={b.x} cy={b.y} r="0.10" fill="#c08830" />
      </g>
    );
  };

  return (
    <div className="relative w-full h-full" style={{ minWidth: 0, minHeight: 0 }}>
      {/* Outer decorative frame */}
      <div style={{
        position: "absolute", inset: "-10px",
        background: "linear-gradient(135deg, #f0c040, #d4922a, #f0c040)",
        borderRadius: "14px",
        boxShadow: "0 8px 40px rgba(0,0,0,0.5), inset 0 0 0 3px rgba(255,255,255,0.2)",
        zIndex: 0,
      }} />
      {/* Inner border */}
      <div style={{ position:"absolute", inset:"-2px", background:"#180d04", borderRadius:"6px", zIndex:1 }} />

      {/* Grid cells */}
      <div style={{
        position: "absolute", inset: 0,
        display: "grid",
        gridTemplate: "repeat(10,1fr) / repeat(10,1fr)",
        zIndex: 2,
      }}>
        {Array.from({ length: 100 }, (_, i) => {
          const num = i + 1;
          const { col, displayRow, boardRow } = getCellGridPos(num);
          const playersHere = players.filter(p => p.position === num);
          const bg = cellColor(col, boardRow);
          const isGoal = num === 100;
          return (
            <div key={num} className="relative overflow-hidden select-none"
              style={{
                gridColumn: col + 1, gridRow: displayRow + 1,
                background: bg,
                borderLeft:  "1px solid rgba(0,0,0,0.22)",
                borderTop:   "1px solid rgba(0,0,0,0.22)",
              }}>
              {/* Cell number */}
              <span className="absolute font-black leading-none"
                style={{ top:"2px", left:"3px", fontSize:"clamp(5px,1.2cqw,12px)", color:"#333",
                  textShadow:"0 0 2px rgba(255,255,255,0.7)", zIndex:10 }}>
                {toArabic(num)}
              </span>
              {/* Goal trophy */}
              {isGoal && (
                <div className="absolute inset-0 flex items-center justify-center" style={{ zIndex:5, background:"rgba(255,215,0,0.25)" }}>
                  <motion.span style={{ fontSize:"clamp(10px,2.4cqw,26px)", filter:"drop-shadow(0 0 6px gold)" }}
                    animate={{ scale:[1,1.2,1], y:[0,-3,0] }}
                    transition={{ duration:1.6, repeat:Infinity, ease:"easeInOut" }}>🏆</motion.span>
                </div>
              )}
              {/* Players on this cell */}
              {playersHere.length > 0 && (
                <div className="absolute inset-0 flex items-center justify-center flex-wrap gap-[1px] p-[2px]" style={{ zIndex:20 }}>
                  {playersHere.map(p => {
                    const s = playersHere.length === 1 ? "70%" : playersHere.length <= 4 ? "44%" : "30%";
                    return (
                      <motion.div key={p.username}
                        initial={{ scale:0, y:-8 }} animate={{ scale:1, y:0 }}
                        transition={{ type:"spring", stiffness:500, damping:20 }}
                        style={{ width:s, paddingBottom:s, position:"relative", borderRadius:"50%", overflow:"hidden",
                          border:`2.5px solid ${p.color}`, boxShadow:`0 0 10px ${p.color}cc`, flexShrink:0 }}>
                        <img src={p.avatar} alt={p.displayName}
                          style={{ position:"absolute", inset:0, width:"100%", height:"100%", objectFit:"cover" }}
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
      <svg style={{ position:"absolute", inset:0, width:"100%", height:"100%", zIndex:30, pointerEvents:"none" }}
        viewBox="0 0 10 10" preserveAspectRatio="xMidYMid meet">
        {(Object.entries(LADDERS) as unknown as [number,number][]).map(([f,t]) => drawLadder(+f,+t))}
        {(Object.entries(SNAKES)  as unknown as [number,number][]).map(([f,t],i) => drawSnake(+f,+t,i))}
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
  const startRollRef  = useRef<() => void>(() => {});

  useEffect(() => { phaseRef.current = phase; }, [phase]);

  // ── Twitch IRC — same pattern as XO ──────────────────────────────────────
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

  useEffect(() => () => { wsRef.current?.close(); }, []);

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
    setPhase("finished"); phaseRef.current = "finished";
    isAnimRef.current = false; setIsAnimating(false);
  }, []);

  const handleSpecial = useCallback((pidx: number, pos: number) => {
    if (pos >= 100) { triggerWin(pidx); return; }

    if (LADDERS[pos] !== undefined) {
      const dest = LADDERS[pos];
      setLastAction(`🪜 سلّم! صعد إلى ${toArabic(dest)}`);
      setTimeout(() => {
        setPlayers(prev => {
          const next = prev.map((p, i) => i === pidx ? { ...p, position: dest } : p);
          playersRef.current = next; return next;
        });
        setTimeout(() => endTurn(pidx), 900);
      }, 550);
    } else if (SNAKES[pos] !== undefined) {
      const dest = SNAKES[pos];
      setLastAction(`🐍 ثعبان! نزل إلى ${toArabic(dest)}`);
      setTimeout(() => {
        setPlayers(prev => {
          const next = prev.map((p, i) => i === pidx ? { ...p, position: dest } : p);
          playersRef.current = next; return next;
        });
        setTimeout(() => endTurn(pidx), 900);
      }, 550);
    } else {
      setTimeout(() => endTurn(pidx), 480);
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
        playersRef.current = next; return next;
      });
      if (pos >= 100) { setTimeout(() => triggerWin(pidx), 400); return; }
      setTimeout(tick, 210);
    };
    setTimeout(tick, 150);
  }, [handleSpecial, triggerWin]);

  const doRoll = useCallback(() => {
    if (isAnimRef.current) return;
    const roll = Math.floor(Math.random() * 6) + 1;
    const pidx = currentIdxRef.current;
    setIsRolling(true); setIsAnimating(true); isAnimRef.current = true;
    setLastAction(null);
    let count = 0;
    const iv = setInterval(() => {
      setDiceValue(Math.floor(Math.random() * 6) + 1);
      count++;
      if (count >= 10) {
        clearInterval(iv);
        setDiceValue(roll);
        setIsRolling(false);
        setTimeout(() => startMove(pidx, roll), 420);
      }
    }, 95);
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

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="h-screen flex flex-col overflow-hidden" dir="rtl"
      style={{ background: "linear-gradient(145deg,#1e0545 0%,#2d0960 50%,#190440 100%)", fontFamily:"'Cairo',sans-serif" }}>

      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-5 py-3 border-b border-purple-400/40 flex-shrink-0"
        style={{ background: "rgba(30,5,70,0.98)" }}>
        <button onClick={() => navigate("/")}
          className="flex items-center gap-1.5 text-purple-300/70 hover:text-pink-300 transition-colors text-sm font-bold">
          <ArrowRight size={16} /> العودة
        </button>
        <div className="flex items-center gap-2">
          <span className="text-2xl">🐍</span>
          <h1 className="text-xl font-black" style={{ color:"#e040fb", textShadow:"0 0 24px #e040fb90" }}>
            السلم والثعبان
          </h1>
          <span className="text-2xl">🪜</span>
        </div>
        <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-bold ${
          twitchConnected
            ? "border-purple-400/60 bg-purple-500/20 text-purple-200"
            : "border-purple-500/20 text-purple-400/40"
        }`}>
          {twitchConnected ? <Wifi size={11} /> : <WifiOff size={11} />}
          {twitchConnected ? `#${user?.username}` : "جارٍ الاتصال..."}
        </div>
      </header>

      {/* ── BODY ───────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden flex">
        <AnimatePresence mode="wait">

          {/* ══ JOINING ══════════════════════════════════════════════════════ */}
          {phase === "joining" && (
            <motion.div key="joining"
              initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-20 }}
              className="flex-1 flex flex-col items-center justify-center p-6 gap-6 overflow-y-auto">

              <div className="text-center space-y-3">
                <div className={`inline-flex items-center gap-2 px-5 py-2 rounded-full border text-sm font-bold ${
                  twitchConnected
                    ? "border-green-400/60 bg-green-500/18 text-green-300"
                    : "border-purple-500/25 text-purple-400/50"
                }`}>
                  {twitchConnected
                    ? <><Wifi size={13} /> #{user?.username} متصل</>
                    : <><WifiOff size={13} /> جارٍ الاتصال...</>}
                </div>
                <h2 className="text-5xl font-black text-white">
                  اكتب <span style={{ color:"#00e5ff", textShadow:"0 0 20px #00e5ff" }}>join</span> في الشات
                </h2>
                <p className="text-purple-200/55 text-lg">يمكن حتى {MAX_PLAYERS} لاعبين الانضمام</p>
              </div>

              <AnimatePresence>
                {joinMsg && (
                  <motion.div key={joinMsg}
                    initial={{ opacity:0, y:-8 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }}
                    className="px-6 py-2.5 rounded-xl text-center font-bold text-green-300 border border-green-400/50 bg-green-500/18">
                    ✅ {joinMsg}
                  </motion.div>
                )}
              </AnimatePresence>

              {players.length > 0 && (
                <div className="w-full max-w-2xl">
                  <p className="text-sm text-purple-200/55 mb-3 text-center flex items-center justify-center gap-1 font-bold">
                    <Users size={13} /> {players.length} لاعب
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {players.map(p => (
                      <motion.div key={p.username}
                        initial={{ opacity:0, scale:0.8 }} animate={{ opacity:1, scale:1 }}
                        className="flex flex-col items-center gap-2 p-4 rounded-2xl border"
                        style={{ borderColor: p.color+"65", background: p.color+"18" }}>
                        <div className="w-14 h-14 rounded-full overflow-hidden border-2"
                          style={{ borderColor: p.color, boxShadow:`0 0 18px ${p.color}65` }}>
                          <img src={p.avatar} alt={p.displayName} className="w-full h-full object-cover"
                            onError={e => { (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${p.username}`; }} />
                        </div>
                        <p className="text-sm font-bold truncate w-full text-center" style={{ color:p.color }}>
                          {p.displayName}
                        </p>
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}

              <motion.button onClick={handleStartGame} disabled={players.length < 2}
                whileHover={players.length >= 2 ? { scale:1.04 } : {}}
                whileTap={players.length >= 2 ? { scale:0.97 } : {}}
                className="flex items-center gap-3 px-10 py-4 rounded-2xl text-xl font-black text-white disabled:opacity-30"
                style={{
                  background:"linear-gradient(135deg,#e040fb,#9c27b0)",
                  boxShadow: players.length >= 2 ? "0 0 42px rgba(224,64,251,0.6)" : "none",
                }}>
                <Play size={22} fill="white" /> ابدأ اللعبة ({players.length})
              </motion.button>
            </motion.div>
          )}

          {/* ══ PLAYING ══════════════════════════════════════════════════════ */}
          {phase === "playing" && (
            <motion.div key="playing"
              initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
              className="flex-1 flex overflow-hidden"
              style={{ padding:"10px", gap:"10px" }}>

              {/* ── RIGHT SIDEBAR ── */}
              <div style={{ width:"200px", flexShrink:0 }}
                className="flex flex-col gap-0 overflow-y-auto overflow-x-hidden">

                {/* Current Player card */}
                {currentPlayer && (
                  <motion.div
                    key={currentPlayer.username}
                    initial={{ opacity:0, x:12 }} animate={{ opacity:1, x:0 }}
                    transition={{ type:"spring", stiffness:320, damping:26 }}
                    className="rounded-t-2xl p-4 flex-shrink-0"
                    style={{
                      border:`2px solid ${currentPlayer.color}`,
                      borderBottom:"none",
                      background:`linear-gradient(135deg,${currentPlayer.color}28,${currentPlayer.color}10)`,
                      boxShadow:`0 0 32px ${currentPlayer.color}55`,
                    }}>
                    <div className="flex items-center justify-center gap-1.5 mb-3">
                      <motion.div animate={{ opacity:[0.4,1,0.4] }} transition={{ repeat:Infinity, duration:1.1 }}
                        className="w-2 h-2 rounded-full" style={{ background:currentPlayer.color, boxShadow:`0 0 8px ${currentPlayer.color}` }} />
                      <span className="text-xs font-black tracking-wide" style={{ color:currentPlayer.color }}>الدور على</span>
                      <motion.div animate={{ opacity:[0.4,1,0.4] }} transition={{ repeat:Infinity, duration:1.1, delay:0.55 }}
                        className="w-2 h-2 rounded-full" style={{ background:currentPlayer.color, boxShadow:`0 0 8px ${currentPlayer.color}` }} />
                    </div>
                    <div className="flex flex-col items-center gap-2.5">
                      <div className="w-16 h-16 rounded-full overflow-hidden"
                        style={{ border:`3px solid ${currentPlayer.color}`, boxShadow:`0 0 28px ${currentPlayer.color}80` }}>
                        <img src={currentPlayer.avatar} alt={currentPlayer.displayName} className="w-full h-full object-cover"
                          onError={e => { (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${currentPlayer.username}`; }} />
                      </div>
                      <div className="text-center">
                        <p className="font-black text-base leading-tight truncate max-w-[160px]"
                          style={{ color:currentPlayer.color, textShadow:`0 0 18px ${currentPlayer.color}70` }}>
                          {currentPlayer.displayName}
                        </p>
                        <p className="text-xs mt-0.5 font-bold" style={{ color:currentPlayer.color+"90" }}>
                          {currentPlayer.position === 0 ? "لم يبدأ بعد" : `المربع ${toArabic(currentPlayer.position)}`}
                        </p>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* Dice — attached directly below current player */}
                <div className="rounded-b-2xl p-3 flex-shrink-0 flex flex-col items-center gap-2"
                  style={{
                    border:`2px solid ${currentPlayer?.color ?? "rgba(139,92,246,0.5)"}`,
                    borderTop:`1px solid ${currentPlayer?.color ?? "rgba(139,92,246,0.2)"}60`,
                    background:"rgba(15,2,40,0.97)",
                    boxShadow: currentPlayer ? `0 6px 24px ${currentPlayer.color}28` : "none",
                  }}>
                  <motion.div
                    animate={isRolling ? { rotate:[-15,15,-10,10,-5,5,0] } : {}}
                    transition={{ duration:0.13 }}>
                    {diceValue !== null
                      ? <DiceFace value={diceValue} size={76} color={currentPlayer?.color ?? "#e040fb"} />
                      : (
                        <div className="w-[76px] h-[76px] rounded-2xl flex items-center justify-center"
                          style={{ border:`2px dashed ${currentPlayer?.color ?? "rgba(139,92,246,0.4)"}60` }}>
                          <span style={{ fontSize:"34px", opacity:0.5 }}>🎲</span>
                        </div>
                      )}
                  </motion.div>

                  <AnimatePresence mode="wait">
                    {diceValue !== null && !isRolling && (
                      <motion.p key={`d-${diceValue}`}
                        initial={{ opacity:0, scale:0.7 }} animate={{ opacity:1, scale:1 }} exit={{ opacity:0 }}
                        className="text-base font-black"
                        style={{ color:currentPlayer?.color ?? "#e040fb" }}>
                        رمية {toArabic(diceValue)}
                      </motion.p>
                    )}
                  </AnimatePresence>

                  {!isAnimating && currentPlayer ? (
                    <motion.div animate={{ opacity:[0.6,1,0.6] }} transition={{ repeat:Infinity, duration:1.4 }}
                      className="text-center text-[11px] font-bold py-1.5 px-2.5 rounded-xl w-full"
                      style={{ background:currentPlayer.color+"22", color:currentPlayer.color+"ee" }}>
                      اكتب <span className="text-white font-black">roll</span> أو <span className="text-white font-black">رول</span>
                    </motion.div>
                  ) : isAnimating && (
                    <p className="text-[10px] font-bold" style={{ color:"rgba(167,139,250,0.6)" }}>جارٍ الحركة...</p>
                  )}
                </div>

                {/* Action message */}
                <AnimatePresence>
                  {lastAction && (
                    <motion.div key={lastAction}
                      initial={{ opacity:0, y:-6 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }}
                      className="rounded-xl border px-3 py-2 text-center font-black text-xs flex-shrink-0 mt-2"
                      style={{
                        borderColor: lastAction.includes("سلّم") ? "rgba(34,197,94,0.7)" : "rgba(239,68,68,0.7)",
                        background:  lastAction.includes("سلّم") ? "rgba(34,197,94,0.18)" : "rgba(239,68,68,0.16)",
                        color:       lastAction.includes("سلّم") ? "#4ade80" : "#f87171",
                        boxShadow:   lastAction.includes("سلّم") ? "0 0 12px rgba(34,197,94,0.3)" : "0 0 12px rgba(239,68,68,0.3)",
                      }}>
                      {lastAction}
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Players list */}
                <div className="rounded-xl overflow-hidden flex-shrink-0 mt-2"
                  style={{ border:"1px solid rgba(167,139,250,0.35)", background:"rgba(15,2,40,0.95)" }}>
                  {players.map((p, idx) => {
                    const isCur = idx === currentPlayerIdx;
                    return (
                      <div key={p.username}
                        className="flex items-center gap-2 px-2.5 py-1.5 transition-colors"
                        style={{
                          background: isCur ? p.color+"22" : "transparent",
                          borderBottom: idx < players.length-1 ? "1px solid rgba(167,139,250,0.12)" : "none",
                        }}>
                        <div className="w-6 h-6 rounded-full overflow-hidden border flex-shrink-0"
                          style={{ borderColor: isCur ? p.color : p.color+"60",
                            boxShadow: isCur ? `0 0 8px ${p.color}70` : "none" }}>
                          <img src={p.avatar} alt={p.displayName} className="w-full h-full object-cover"
                            onError={e => { (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${p.username}`; }} />
                        </div>
                        <span className="flex-1 text-[11px] font-bold truncate"
                          style={{ color: isCur ? p.color : p.color+"85" }}>
                          {p.displayName}
                        </span>
                        <span className="text-[9px] font-black flex-shrink-0"
                          style={{ color: isCur ? p.color : "rgba(167,139,250,0.4)" }}>
                          {p.position === 0 ? "—" : toArabic(p.position)}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <button onClick={handleNewGame}
                  className="flex items-center justify-center gap-1 py-1.5 rounded-xl text-purple-300/40 hover:text-purple-200/60 text-[9px] border border-purple-400/20 hover:border-purple-400/35 transition-all flex-shrink-0 mt-2">
                  <RotateCcw size={8} /> لعبة جديدة
                </button>
              </div>

              {/* ── BOARD ── */}
              <div className="flex-1 flex items-center justify-center overflow-hidden">
                <div style={{ height:"96%", aspectRatio:"1", containerType:"inline-size" }}>
                  <GameBoard players={players} />
                </div>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>

      {/* ── WIN SCREEN ─────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {phase === "finished" && winner && (
          <motion.div key="win"
            initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
            style={{
              position:"fixed", inset:0, zIndex:100,
              background:"radial-gradient(ellipse at 50% 40%,#2d0d55 0%,#1a0840 60%,#0d0530 100%)",
              display:"flex", flexDirection:"column",
              alignItems:"center", justifyContent:"center",
              gap:"28px", padding:"32px", textAlign:"center", direction:"rtl",
            }}>
            {/* Confetti */}
            {[...Array(14)].map((_, i) => (
              <motion.div key={i} style={{
                position:"absolute",
                width: Math.random()*8+4, height: Math.random()*8+4,
                borderRadius:"50%",
                background:[winner.color,"#e040fb","#00e5ff","#ffd600"][i%4],
                left:`${(i*37+11)%95}%`, top:`${(i*53+7)%90}%`,
              }}
                animate={{ y:[0,-35,0,25,0], opacity:[0.2,0.9,0.3,0.9,0.2], scale:[1,1.5,0.8,1.3,1] }}
                transition={{ duration:2.8+(i%4)*0.5, repeat:Infinity, delay:i*0.22 }} />
            ))}

            <motion.div initial={{ scale:0, y:-60, rotate:-20 }} animate={{ scale:1, y:0, rotate:0 }}
              transition={{ type:"spring", stiffness:220, damping:16, delay:0.1 }}
              style={{ fontSize:"100px", lineHeight:1, filter:"drop-shadow(0 0 35px gold)", zIndex:10 }}>🏆</motion.div>

            <div style={{ position:"relative", width:210, height:210, display:"flex", alignItems:"center", justifyContent:"center", zIndex:10 }}>
              {[1,2,3].map(r => (
                <motion.div key={r} style={{
                  position:"absolute", width:80+r*44, height:80+r*44,
                  borderRadius:"50%", border:`2px solid ${winner.color}`,
                }}
                  animate={{ scale:[1,1.08,1], opacity:[0.35/r, 0.75/r, 0.35/r] }}
                  transition={{ repeat:Infinity, duration:1.8+r*0.4, delay:r*0.18 }} />
              ))}
              <motion.div initial={{ scale:0 }} animate={{ scale:1 }}
                transition={{ type:"spring", stiffness:280, damping:18, delay:0.3 }}
                style={{
                  width:128, height:128, borderRadius:"50%", overflow:"hidden",
                  border:`4px solid ${winner.color}`,
                  boxShadow:`0 0 50px ${winner.color}90`,
                  zIndex:10, position:"relative",
                }}>
                <img src={winner.avatar} alt={winner.displayName}
                  style={{ width:"100%", height:"100%", objectFit:"cover" }}
                  onError={e => { (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${winner.username}`; }} />
              </motion.div>
            </div>

            <motion.div style={{ zIndex:10 }}
              initial={{ opacity:0, y:30 }} animate={{ opacity:1, y:0 }}
              transition={{ delay:0.45, type:"spring" }}>
              <p style={{ fontSize:"14px", color:"rgba(216,201,255,0.65)", fontWeight:700, marginBottom:"8px" }}>الفائز باللعبة</p>
              <h1 style={{
                fontSize:"clamp(36px,6vw,64px)", fontWeight:900,
                color: winner.color, textShadow:`0 0 40px ${winner.color}, 0 0 80px ${winner.color}50`,
                lineHeight:1.1, marginBottom:"10px",
              }}>
                {winner.displayName}
              </h1>
              <motion.p initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:0.7 }}
                style={{ fontSize:"24px", fontWeight:700, color:"rgba(255,255,255,0.55)" }}>
                🎉 مبروك عليك الفوز!
              </motion.p>
            </motion.div>

            <motion.div initial={{ opacity:0, y:24 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.85 }}
              style={{ display:"flex", gap:"14px", zIndex:10, flexWrap:"wrap", justifyContent:"center" }}>
              <motion.button onClick={() => navigate("/")} whileHover={{ scale:1.04 }} whileTap={{ scale:0.97 }}
                style={{ display:"flex", alignItems:"center", gap:"8px", padding:"14px 26px", borderRadius:"16px",
                  fontWeight:900, fontSize:"15px",
                  border:"1px solid rgba(167,139,250,0.45)", color:"rgba(216,201,255,0.9)",
                  background:"rgba(139,92,246,0.15)", cursor:"pointer" }}>
                <ArrowRight size={17} /> الرئيسية
              </motion.button>
              <motion.button onClick={handleRematch} whileHover={{ scale:1.04 }} whileTap={{ scale:0.97 }}
                style={{ display:"flex", alignItems:"center", gap:"8px", padding:"14px 26px", borderRadius:"16px",
                  fontWeight:900, fontSize:"15px",
                  border:"1px solid rgba(167,139,250,0.45)", color:"rgba(216,201,255,0.9)",
                  background:"rgba(139,92,246,0.15)", cursor:"pointer" }}>
                <RotateCcw size={17} /> إعادة اللعبة
              </motion.button>
              <motion.button onClick={handleNewGame} whileHover={{ scale:1.04 }} whileTap={{ scale:0.97 }}
                style={{ display:"flex", alignItems:"center", gap:"8px", padding:"14px 26px", borderRadius:"16px",
                  fontWeight:900, fontSize:"15px",
                  background:"linear-gradient(135deg,#e040fb,#9c27b0)",
                  boxShadow:"0 0 30px rgba(224,64,251,0.55)", color:"white", cursor:"pointer" }}>
                <Play size={17} fill="white" /> جولة جديدة
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
