import { useState, useRef, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Wifi, WifiOff, Users, Play, Trophy, RotateCcw } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

// ─── Types ────────────────────────────────────────────────────────────────────
type Phase = "lobby" | "spinning" | "selecting" | "elimination" | "winner";

interface Player {
  username: string;
  displayName: string;
  avatar: string;
}

// ─── Wheel SVG ────────────────────────────────────────────────────────────────
const WHEEL_COLORS = [
  "#e040fb", "#00e5ff", "#ffd600", "#ff6d00",
  "#22c55e", "#f43f5e", "#818cf8", "#fb923c",
  "#34d399", "#a78bfa", "#f59e0b", "#06b6d4",
];

function WheelSVG({ spinning, size = 280 }: { spinning: boolean; size?: number }) {
  const segments = 12;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 8;
  const angleStep = (2 * Math.PI) / segments;

  const paths = Array.from({ length: segments }).map((_, i) => {
    const start = i * angleStep - Math.PI / 2;
    const end = start + angleStep;
    const x1 = cx + r * Math.cos(start);
    const y1 = cy + r * Math.sin(start);
    const x2 = cx + r * Math.cos(end);
    const y2 = cy + r * Math.sin(end);
    const mx = cx + (r * 0.62) * Math.cos(start + angleStep / 2);
    const my = cy + (r * 0.62) * Math.sin(start + angleStep / 2);
    return { d: `M${cx},${cy} L${x1},${y1} A${r},${r} 0 0,1 ${x2},${y2} Z`, color: WHEEL_COLORS[i % WHEEL_COLORS.length], mx, my };
  });

  return (
    <motion.div
      animate={spinning ? { rotate: 360 } : { rotate: 0 }}
      transition={spinning ? { duration: 1.2, repeat: Infinity, ease: "linear" } : { duration: 0.6, ease: "easeOut" }}
      style={{ width: size, height: size, willChange: "transform" }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {paths.map((p, i) => (
          <g key={i}>
            <path d={p.d} fill={p.color} stroke="#0a0012" strokeWidth="2" />
            <text x={p.mx} y={p.my} textAnchor="middle" dominantBaseline="middle"
              fontSize="11" fontWeight="bold" fill="rgba(0,0,0,0.6)">
              {["🎵", "⭐", "🎶", "✨", "🎸", "💫", "🎺", "🌟", "🎻", "🔥", "🎷", "🎤"][i]}
            </text>
          </g>
        ))}
        <circle cx={cx} cy={cy} r="22" fill="#0a0012" stroke="#e040fb" strokeWidth="3" />
        <circle cx={cx} cy={cy} r="10" fill="#e040fb" />
      </svg>
    </motion.div>
  );
}

// ─── Pointer ──────────────────────────────────────────────────────────────────
function WheelPointer() {
  return (
    <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1" style={{ zIndex: 10 }}>
      <div style={{
        width: 0, height: 0,
        borderLeft: "12px solid transparent",
        borderRight: "12px solid transparent",
        borderTop: "28px solid #e040fb",
        filter: "drop-shadow(0 0 8px #e040fb)",
      }} />
    </div>
  );
}

// ─── Chair Component ──────────────────────────────────────────────────────────
function Chair({ num, player, total }: { num: number; player: Player | null; total: number }) {
  const color = WHEEL_COLORS[(num - 1) % WHEEL_COLORS.length];
  return (
    <motion.div
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ delay: num * 0.08, type: "spring" }}
      className="flex flex-col items-center gap-1.5"
    >
      <div className="relative">
        <div className="w-16 h-16 rounded-2xl border-2 flex flex-col items-end justify-end p-1.5 transition-all duration-300"
          style={{
            borderColor: player ? color : `${color}50`,
            background: player ? `${color}20` : `${color}08`,
            boxShadow: player ? `0 0 16px ${color}50` : "none",
          }}>
          {player ? (
            <img src={player.avatar} alt={player.displayName}
              className="absolute inset-1 w-[calc(100%-8px)] h-[calc(100%-8px)] rounded-xl object-cover"
              onError={e => { (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${player.username}`; }} />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-3xl opacity-30">🪑</span>
            </div>
          )}
        </div>
        <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center text-xs font-black"
          style={{ background: color, color: "#000" }}>
          {num}
        </div>
      </div>
      <span className="text-[10px] font-bold truncate max-w-[64px] text-center"
        style={{ color: player ? color : "rgba(255,255,255,0.25)" }}>
        {player ? player.displayName : `كرسي ${num}`}
      </span>
    </motion.div>
  );
}

// ─── Player Card (lobby) ──────────────────────────────────────────────────────
function PlayerCard({ player, index }: { player: Player; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05 }}
      className="flex items-center gap-2.5 px-3 py-2 rounded-xl border border-purple-500/20"
      style={{ background: "rgba(224,64,251,0.06)" }}
    >
      <img src={player.avatar} alt={player.displayName}
        className="w-8 h-8 rounded-full object-cover flex-shrink-0"
        onError={e => { (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${player.username}`; }} />
      <span className="text-sm font-bold text-white/80 truncate">{player.displayName}</span>
    </motion.div>
  );
}

// ─── Confetti ─────────────────────────────────────────────────────────────────
function Confetti() {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 50 }}>
      {Array.from({ length: 40 }).map((_, i) => (
        <motion.div key={i}
          className="absolute w-3 h-3 rounded-sm"
          style={{
            left: `${Math.random() * 100}%`,
            background: WHEEL_COLORS[i % WHEEL_COLORS.length],
            top: -20,
          }}
          animate={{ y: ["0vh", "110vh"], rotate: [0, 360 * (Math.random() > 0.5 ? 1 : -1)], opacity: [1, 0.8, 0] }}
          transition={{ duration: Math.random() * 2 + 1.5, delay: Math.random() * 1.5, ease: "linear" }}
        />
      ))}
    </div>
  );
}

// ─── Audio ────────────────────────────────────────────────────────────────────
function useGameAudio() {
  const ctxRef = useRef<AudioContext | null>(null);
  const nodesRef = useRef<OscillatorNode[]>([]);

  const getCtx = () => {
    if (!ctxRef.current || ctxRef.current.state === "closed") {
      ctxRef.current = new AudioContext();
    }
    return ctxRef.current;
  };

  const startMusic = useCallback(() => {
    try {
      const ctx = getCtx();
      if (ctx.state === "suspended") ctx.resume();
      // Stop any existing
      nodesRef.current.forEach(n => { try { n.stop(); } catch (_) {} });
      nodesRef.current = [];

      const notes = [261.63, 329.63, 392.00, 523.25];
      const intervalMs = 280;

      let step = 0;
      const gainMaster = ctx.createGain();
      gainMaster.gain.value = 0.18;
      gainMaster.connect(ctx.destination);

      const play = () => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = "square";
        osc.frequency.value = notes[step % notes.length] * (step % 8 < 4 ? 1 : 1.5);
        g.gain.setValueAtTime(0.4, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
        osc.connect(g);
        g.connect(gainMaster);
        osc.start();
        osc.stop(ctx.currentTime + 0.23);
        step++;
      };

      play();
      const id = setInterval(play, intervalMs);
      (nodesRef as any).current._interval = id;
    } catch (_) {}
  }, []);

  const stopMusic = useCallback(() => {
    try {
      clearInterval((nodesRef as any).current._interval);
      nodesRef.current.forEach(n => { try { n.stop(); } catch (_) {} });
      nodesRef.current = [];
    } catch (_) {}
  }, []);

  useEffect(() => () => stopMusic(), [stopMusic]);
  return { startMusic, stopMusic };
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function ChairsGame() {
  const [, navigate] = useLocation();
  const { user } = useAuth();

  const [phase, setPhase] = useState<Phase>("lobby");
  const [players, setPlayers] = useState<Player[]>([]);
  const [roundNum, setRoundNum] = useState(1);
  const [chairOccupied, setChairOccupied] = useState<Record<number, Player>>({});
  const [eliminated, setEliminated] = useState<Player | null>(null);
  const [winner, setWinner] = useState<Player | null>(null);
  const [twitchConnected, setTwitchConnected] = useState(false);
  const [spinTimeLeft, setSpinTimeLeft] = useState(0);

  const phaseRef = useRef<Phase>("lobby");
  const playersRef = useRef<Player[]>([]);
  const chairOccupiedRef = useRef<Record<number, Player>>({});
  const wsRef = useRef<WebSocket | null>(null);
  const connectedRef = useRef(false);
  const spinTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { playersRef.current = players; }, [players]);
  useEffect(() => { chairOccupiedRef.current = chairOccupied; }, [chairOccupied]);

  const { startMusic, stopMusic } = useGameAudio();

  // chairs count = players.length - 1 during selecting
  const chairCount = Math.max(playersRef.current.length - 1, 1);

  // ── Twitch IRC ──────────────────────────────────────────────────────────────
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

  // ── Chat handler ─────────────────────────────────────────────────────────────
  const handleChatMsg = useCallback((username: string, text: string) => {
    const msg = text.trim().toLowerCase();
    const ph = phaseRef.current;
    const pl = playersRef.current;

    if (msg === "join" && ph === "lobby") {
      if (pl.some(p => p.username === username)) return;
      const newPlayer: Player = {
        username,
        displayName: username,
        avatar: `https://unavatar.io/twitch/${username}`,
      };
      setPlayers(prev => {
        const next = [...prev, newPlayer];
        playersRef.current = next;
        return next;
      });
      return;
    }

    if (ph === "selecting") {
      const num = parseInt(msg, 10);
      const currentPlayers = playersRef.current;
      const occupied = chairOccupiedRef.current;
      const chairs = currentPlayers.length - 1;
      if (isNaN(num) || num < 1 || num > chairs) return;
      if (occupied[num]) return;
      const player = currentPlayers.find(p => p.username === username);
      if (!player) return;
      if (Object.values(occupied).some(p => p.username === username)) return;

      setChairOccupied(prev => {
        const next = { ...prev, [num]: player };
        chairOccupiedRef.current = next;
        return next;
      });
    }
  }, []);

  // ── Game controls ─────────────────────────────────────────────────────────
  const startSpin = () => {
    const occupied: Record<number, Player> = {};
    setChairOccupied(occupied);
    chairOccupiedRef.current = occupied;
    phaseRef.current = "spinning";
    setPhase("spinning");
    startMusic();
  };

  const stopSpin = () => {
    stopMusic();
    phaseRef.current = "selecting";
    setPhase("selecting");
  };

  const finishSelecting = () => {
    const currentPlayers = playersRef.current;
    const occupied = chairOccupiedRef.current;
    const seatedUsernames = new Set(Object.values(occupied).map(p => p.username));
    const unseated = currentPlayers.filter(p => !seatedUsernames.has(p.username));
    const eli = unseated.length > 0 ? unseated[Math.floor(Math.random() * unseated.length)] : null;

    setEliminated(eli);
    phaseRef.current = "elimination";
    setPhase("elimination");
  };

  const nextRound = () => {
    const currentPlayers = playersRef.current;
    const eli = eliminated;
    const remaining = currentPlayers.filter(p => p.username !== eli?.username);

    if (remaining.length <= 1) {
      setWinner(remaining[0] ?? null);
      phaseRef.current = "winner";
      setPhase("winner");
    } else {
      setPlayers(remaining);
      playersRef.current = remaining;
      setRoundNum(r => r + 1);
      setEliminated(null);
      startSpin();
    }
  };

  const restart = () => {
    setPlayers([]);
    playersRef.current = [];
    setChairOccupied({});
    chairOccupiedRef.current = {};
    setEliminated(null);
    setWinner(null);
    setRoundNum(1);
    phaseRef.current = "lobby";
    setPhase("lobby");
    stopMusic();
  };

  // chairs for current round
  const currentChairs = players.length > 1 ? players.length - 1 : 1;

  return (
    <div className="min-h-screen gradient-bg flex flex-col" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-purple-500/20"
        style={{ background: "rgba(5,2,14,0.8)", backdropFilter: "blur(12px)" }}>
        <button onClick={() => { stopMusic(); navigate("/"); }}
          className="flex items-center gap-2 text-purple-400/70 hover:text-purple-300 transition-colors text-sm">
          <ArrowRight size={16} />
          <span>رجوع</span>
        </button>
        <div className="flex items-center gap-2">
          <span className="text-xl">🪑</span>
          <span className="font-black text-lg neon-text-pink">لعبة الكراسي</span>
        </div>
        <div className="flex items-center gap-1.5">
          {twitchConnected
            ? <Wifi size={14} className="text-green-400" />
            : <WifiOff size={14} className="text-red-400/60" />}
          <span className="text-xs text-purple-400/60">
            {twitchConnected ? user?.username : "غير متصل"}
          </span>
        </div>
      </div>

      <AnimatePresence mode="wait">

        {/* ══════════ LOBBY ══════════ */}
        {phase === "lobby" && (
          <motion.div key="lobby"
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
            className="flex-1 flex flex-col items-center justify-center px-5 py-10 gap-6">

            <div className="flex flex-col items-center gap-2">
              <span className="text-5xl">🪑</span>
              <h2 className="text-3xl font-black neon-text-pink">لعبة الكراسي الموسيقية</h2>
              <p className="text-purple-300/60 text-center max-w-sm">
                اكتب <span className="font-black text-pink-400">join</span> في الشات للانضمام
              </p>
            </div>

            {/* Players list */}
            <div className="w-full max-w-sm">
              <div className="flex items-center gap-2 mb-3">
                <Users size={14} className="text-purple-400" />
                <span className="text-sm font-bold text-purple-300">
                  اللاعبون ({players.length})
                </span>
              </div>
              <div className="flex flex-col gap-2 max-h-64 overflow-y-auto pr-1">
                {players.length === 0 ? (
                  <p className="text-center text-purple-400/30 text-sm py-6">لم ينضم أحد بعد...</p>
                ) : (
                  players.map((p, i) => <PlayerCard key={p.username} player={p} index={i} />)
                )}
              </div>
            </div>

            <motion.button
              onClick={startSpin}
              disabled={players.length < 2}
              whileHover={players.length >= 2 ? { scale: 1.05 } : {}}
              whileTap={players.length >= 2 ? { scale: 0.97 } : {}}
              className="px-10 py-4 rounded-2xl font-black text-lg transition-all"
              style={{
                background: players.length >= 2
                  ? "linear-gradient(135deg, #e040fb, #c026d3)"
                  : "rgba(255,255,255,0.05)",
                color: players.length >= 2 ? "#fff" : "rgba(255,255,255,0.2)",
                boxShadow: players.length >= 2 ? "0 0 30px #e040fb50" : "none",
                border: "1px solid rgba(255,255,255,0.1)",
                cursor: players.length >= 2 ? "pointer" : "not-allowed",
              }}
            >
              {players.length >= 2 ? "🚀 ابدأ اللعبة الآن" : `يلزم ${Math.max(2 - players.length, 0)} لاعب إضافي`}
            </motion.button>
          </motion.div>
        )}

        {/* ══════════ SPINNING ══════════ */}
        {phase === "spinning" && (
          <motion.div key="spinning"
            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
            className="flex-1 flex flex-col items-center justify-center px-5 py-8 gap-6">

            <div className="text-center">
              <span className="text-2xl font-black text-purple-300">الجولة {roundNum}</span>
              <p className="text-purple-400/50 text-sm mt-1">
                {players.length} لاعبين — {currentChairs} كرسي
              </p>
            </div>

            {/* Wheel */}
            <div className="relative flex items-center justify-center">
              {/* Outer glow ring */}
              <div className="absolute rounded-full"
                style={{
                  inset: -12,
                  background: "conic-gradient(#e040fb, #00e5ff, #ffd600, #ff6d00, #22c55e, #e040fb)",
                  animation: "spin 3s linear infinite",
                  opacity: 0.3,
                  borderRadius: "50%",
                  filter: "blur(8px)",
                }} />
              <WheelPointer />
              <WheelSVG spinning={true} size={280} />
            </div>

            {/* Players row */}
            <div className="flex flex-wrap justify-center gap-2 max-w-lg">
              {players.map(p => (
                <div key={p.username} className="flex flex-col items-center gap-1">
                  <img src={p.avatar} alt={p.displayName}
                    className="w-10 h-10 rounded-full border-2 border-purple-500/40 object-cover"
                    onError={e => { (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${p.username}`; }} />
                  <span className="text-[10px] text-purple-400/70 truncate max-w-[40px] text-center">{p.displayName}</span>
                </div>
              ))}
            </div>

            <motion.button
              onClick={stopSpin}
              whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.97 }}
              animate={{ boxShadow: ["0 0 20px #e040fb60", "0 0 40px #e040fb", "0 0 20px #e040fb60"] }}
              transition={{ duration: 1.2, repeat: Infinity }}
              className="px-10 py-4 rounded-2xl font-black text-lg text-white"
              style={{ background: "linear-gradient(135deg, #e040fb, #c026d3)", border: "1px solid #e040fb80" }}
            >
              ⏹ أوقف العجلة
            </motion.button>
          </motion.div>
        )}

        {/* ══════════ SELECTING ══════════ */}
        {phase === "selecting" && (
          <motion.div key="selecting"
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="flex-1 flex flex-col items-center px-5 py-6 gap-5 overflow-y-auto">

            <div className="text-center">
              <h3 className="text-2xl font-black neon-text-pink">اختر كرسيك! 🪑</h3>
              <p className="text-purple-300/60 text-sm mt-1">
                اكتب رقم الكرسي في الشات (1 إلى {currentChairs})
              </p>
            </div>

            {/* Chairs grid */}
            <div className="flex flex-wrap justify-center gap-4 max-w-2xl w-full">
              {Array.from({ length: currentChairs }).map((_, i) => (
                <Chair key={i + 1} num={i + 1} player={chairOccupied[i + 1] ?? null} total={currentChairs} />
              ))}
            </div>

            {/* Unseated players */}
            <div className="w-full max-w-lg">
              <p className="text-xs text-purple-400/50 text-center mb-2">لم يختاروا بعد</p>
              <div className="flex flex-wrap justify-center gap-2">
                {players
                  .filter(p => !Object.values(chairOccupied).some(op => op.username === p.username))
                  .map(p => (
                    <div key={p.username} className="flex items-center gap-1.5 px-2 py-1 rounded-lg border border-purple-500/20">
                      <img src={p.avatar} alt={p.displayName}
                        className="w-6 h-6 rounded-full object-cover"
                        onError={e => { (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${p.username}`; }} />
                      <span className="text-xs text-white/60">{p.displayName}</span>
                    </div>
                  ))}
              </div>
            </div>

            <motion.button
              onClick={finishSelecting}
              whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
              className="px-8 py-3 rounded-xl font-black text-sm text-white mt-2"
              style={{ background: "linear-gradient(135deg, #f43f5e, #e11d48)", boxShadow: "0 0 20px #f43f5e50" }}
            >
              ❌ انتهاء الاختيار — كشف المحذوف
            </motion.button>
          </motion.div>
        )}

        {/* ══════════ ELIMINATION ══════════ */}
        {phase === "elimination" && (
          <motion.div key="elimination"
            initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
            className="flex-1 flex flex-col items-center justify-center px-5 py-10 gap-8">

            {eliminated ? (
              <>
                <motion.div
                  animate={{ scale: [1, 1.08, 1] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                  className="text-6xl">💥</motion.div>
                <div className="text-center">
                  <p className="text-purple-300/60 mb-3 text-lg">تم إقصاء</p>
                  <div className="flex flex-col items-center gap-3">
                    <div className="relative">
                      <img src={eliminated.avatar} alt={eliminated.displayName}
                        className="w-24 h-24 rounded-full border-4 border-red-500 object-cover"
                        onError={e => { (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${eliminated.username}`; }} />
                      <div className="absolute inset-0 rounded-full border-4 border-red-500"
                        style={{ boxShadow: "0 0 30px #f43f5e" }} />
                      <div className="absolute -bottom-2 -right-2 text-2xl">❌</div>
                    </div>
                    <h3 className="text-3xl font-black text-red-400"
                      style={{ textShadow: "0 0 20px #f43f5e" }}>
                      {eliminated.displayName}
                    </h3>
                  </div>
                </div>

                <div className="text-center">
                  <p className="text-purple-300/50 text-sm mb-2">المتبقون ({players.length - 1} لاعب)</p>
                  <div className="flex flex-wrap justify-center gap-2">
                    {players
                      .filter(p => p.username !== eliminated.username)
                      .map(p => (
                        <div key={p.username} className="flex flex-col items-center gap-1">
                          <img src={p.avatar} alt={p.displayName}
                            className="w-10 h-10 rounded-full border-2 border-green-500/50 object-cover"
                            onError={e => { (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${p.username}`; }} />
                          <span className="text-[10px] text-green-400/70 truncate max-w-[40px] text-center">{p.displayName}</span>
                        </div>
                      ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center">
                <span className="text-5xl">🤝</span>
                <p className="text-white/60 mt-3">الجميع وجد كرسيًا! تعادل في هذه الجولة</p>
              </div>
            )}

            <motion.button
              onClick={nextRound}
              whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.97 }}
              className="px-10 py-4 rounded-2xl font-black text-lg text-white"
              style={{ background: "linear-gradient(135deg, #e040fb, #c026d3)", boxShadow: "0 0 30px #e040fb50" }}
            >
              {players.length - (eliminated ? 1 : 0) <= 1 ? "🏆 عرض الفائز" : "▶ الجولة التالية"}
            </motion.button>
          </motion.div>
        )}

        {/* ══════════ WINNER ══════════ */}
        {phase === "winner" && (
          <motion.div key="winner"
            initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
            className="flex-1 flex flex-col items-center justify-center px-5 py-10 gap-8">
            <Confetti />

            <motion.div
              animate={{ y: [0, -15, 0] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              className="text-7xl">
              🏆
            </motion.div>

            <div className="text-center">
              <p className="text-2xl text-yellow-400/80 mb-4 font-bold">الفائز هو</p>
              {winner && (
                <div className="flex flex-col items-center gap-4">
                  <div className="relative">
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
                      className="absolute rounded-full"
                      style={{ inset: -6, background: "conic-gradient(#ffd600, #e040fb, #00e5ff, #ffd600)" }}
                    />
                    <img src={winner.avatar} alt={winner.displayName}
                      className="relative w-32 h-32 rounded-full border-4 border-yellow-400 object-cover"
                      style={{ boxShadow: "0 0 50px #ffd60080" }}
                      onError={e => { (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${winner.username}`; }} />
                  </div>
                  <h2 className="text-5xl font-black"
                    style={{ color: "#ffd600", textShadow: "0 0 30px #ffd600, 0 0 60px #ffd60060" }}>
                    {winner.displayName}
                  </h2>
                  <p className="text-yellow-400/60">🎉 بطل لعبة الكراسي! 🎉</p>
                </div>
              )}
            </div>

            <div className="flex gap-4">
              <motion.button
                onClick={restart}
                whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.97 }}
                className="flex items-center gap-2 px-8 py-3 rounded-xl font-bold text-white border border-purple-500/40"
                style={{ background: "rgba(224,64,251,0.15)" }}
              >
                <RotateCcw size={16} />
                العب مجدداً
              </motion.button>
              <motion.button
                onClick={() => navigate("/")}
                whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.97 }}
                className="flex items-center gap-2 px-8 py-3 rounded-xl font-bold text-white border border-purple-500/40"
                style={{ background: "rgba(0,229,255,0.10)" }}
              >
                <ArrowRight size={16} />
                الرئيسية
              </motion.button>
            </div>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}
