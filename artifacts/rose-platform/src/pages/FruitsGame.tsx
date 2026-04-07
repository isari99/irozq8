import { useState, useRef, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Wifi, WifiOff, X, RotateCcw, Play } from "lucide-react";

const DEFAULT_CHANNEL = "rose_stream";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Player {
  username: string;
  displayName: string;
  avatarUrl: string | null;
  color: string;
}
interface FruitCard {
  emoji: string;
  name: string;
  player: Player;
  revealed: boolean;
}
type Phase = "lobby" | "playing";

// ─── Constants ────────────────────────────────────────────────────────────────
const COLORS = [
  "#e040fb","#00e5ff","#ffd600","#ff6d00",
  "#22c55e","#f43f5e","#a78bfa","#fb923c",
  "#38bdf8","#4ade80","#facc15","#f87171",
  "#c084fc","#67e8f9","#86efac","#fca5a5",
];

const FRUITS = [
  { emoji: "🍉", name: "بطيخ"    },
  { emoji: "🍓", name: "فراولة"  },
  { emoji: "🍋", name: "ليمون"   },
  { emoji: "🍊", name: "برتقال"  },
  { emoji: "🍇", name: "عنب"     },
  { emoji: "🍑", name: "خوخ"     },
  { emoji: "🍍", name: "أناناس"  },
  { emoji: "🥭", name: "مانجا"   },
  { emoji: "🍎", name: "تفاح"    },
  { emoji: "🍌", name: "موز"     },
  { emoji: "🍒", name: "كرز"     },
  { emoji: "🥝", name: "كيوي"    },
  { emoji: "🍐", name: "كمثرى"   },
  { emoji: "🫐", name: "توت"     },
  { emoji: "🍈", name: "شمام"    },
  { emoji: "🥥", name: "جوز هند" },
];

function shuffle<T>(a: T[]): T[] {
  const arr = [...a];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Fallback avatar via DiceBear
function dicebear(username: string) {
  return `https://api.dicebear.com/7.x/pixel-art/svg?seed=${username}`;
}

// ─── Toast notification ───────────────────────────────────────────────────────
interface Toast { id: number; name: string }

// ─── Component ────────────────────────────────────────────────────────────────
export default function FruitsGame() {
  const [, navigate] = useLocation();

  const [phase, setPhase]         = useState<Phase>("lobby");
  const [connected, setConnected] = useState(false);
  const [players, setPlayers]     = useState<Player[]>([]);
  const [cards, setCards]         = useState<FruitCard[]>([]);
  const [toasts, setToasts]       = useState<Toast[]>([]);

  const wsRef        = useRef<WebSocket | null>(null);
  const phaseRef     = useRef<Phase>("lobby");
  const playersRef   = useRef<Player[]>([]);
  const toastCounter = useRef(0);

  useEffect(() => { phaseRef.current = phase; },    [phase]);
  useEffect(() => { playersRef.current = players; }, [players]);

  // ── Show join toast ─────────────────────────────────────────────────────────
  const showToast = (name: string) => {
    const id = ++toastCounter.current;
    setToasts(prev => [...prev, { id, name }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
  };

  // ── Fetch Twitch avatar from backend ────────────────────────────────────────
  const fetchTwitchUser = async (username: string): Promise<{ avatarUrl: string | null; displayName: string }> => {
    try {
      const res = await fetch(`/api/twitch/user/${encodeURIComponent(username)}`);
      if (res.ok) return await res.json();
    } catch (_) {}
    return { avatarUrl: null, displayName: username };
  };

  // ── Twitch IRC connection ────────────────────────────────────────────────────
  const connect = useCallback(() => {
    wsRef.current?.close();
    const ws = new WebSocket("wss://irc-ws.chat.twitch.tv");
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send("PASS SCHMOOPIIE");
      ws.send(`NICK justinfan${Math.floor(100000 + Math.random() * 900000)}`);
      ws.send("CAP REQ :twitch.tv/tags twitch.tv/commands");
      ws.send(`JOIN #${DEFAULT_CHANNEL.toLowerCase().replace(/^#/, "")}`);
      setConnected(true);
    };
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);

    ws.onmessage = async (ev: MessageEvent) => {
      const raw: string = ev.data;
      if (raw.startsWith("PING")) { ws.send("PONG :tmi.twitch.tv"); return; }

      // Handle RECONNECT
      if (raw.includes("RECONNECT")) { connect(); return; }

      const m = raw.match(/^(?:@[^ ]+ )?:(\w+)!\w+@\S+ PRIVMSG #\S+ :(.+)$/);
      if (!m) return;
      const [, username, msg] = m;
      const text = msg.trim().toLowerCase();

      if ((text === "join" || text === "انضم") && phaseRef.current === "lobby") {
        // Avoid duplicate joins
        if (playersRef.current.some(p => p.username === username)) return;

        // Fetch Twitch profile in background, then add player
        const { avatarUrl, displayName } = await fetchTwitchUser(username);
        setPlayers(prev => {
          if (prev.some(p => p.username === username)) return prev;
          const newPlayer: Player = {
            username,
            displayName,
            avatarUrl,
            color: COLORS[prev.length % COLORS.length],
          };
          showToast(displayName);
          return [...prev, newPlayer];
        });
      }
    };
  }, []);

  useEffect(() => {
    connect();
    return () => { wsRef.current?.close(); };
  }, [connect]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleStartGame = () => {
    const active = playersRef.current;
    if (active.length < 2) return;
    const shuffledFruits  = shuffle(FRUITS).slice(0, active.length);
    const shuffledPlayers = shuffle(active);
    setCards(shuffledFruits.map((f, i) => ({ ...f, player: shuffledPlayers[i], revealed: false })));
    setPhase("playing");
  };

  const handleReveal    = (idx: number) =>
    setCards(prev => prev.map((c, i) => i === idx ? { ...c, revealed: true } : c));
  const handleRevealAll = () =>
    setCards(prev => prev.map(c => ({ ...c, revealed: true })));
  const handleReset = () => { setCards([]); setPhase("lobby"); };
  const handleRemovePlayer = (username: string) => {
    const updated = players.filter(p => p.username !== username);
    playersRef.current = updated;
    setPlayers(updated);
  };

  // ── Avatar helper ─────────────────────────────────────────────────────────
  const Avatar = ({ player, size = 56, rounded = "full" }: { player: Player; size?: number; rounded?: string }) => (
    <div
      className={`overflow-hidden border-2 flex-shrink-0 rounded-${rounded}`}
      style={{
        width: size, height: size,
        borderColor: player.color,
        boxShadow: `0 0 14px ${player.color}55`,
      }}>
      <img
        src={player.avatarUrl ?? dicebear(player.username)}
        alt={player.displayName}
        className="w-full h-full object-cover"
        onError={(e) => { (e.target as HTMLImageElement).src = dicebear(player.username); }}
      />
    </div>
  );

  // ────────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen gradient-bg relative overflow-hidden" dir="rtl"
      style={{ fontFamily: "'Cairo', sans-serif" }}>

      {/* Ambient particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(14)].map((_, i) => (
          <motion.div key={i} className="absolute rounded-full"
            style={{
              width: Math.random() * 3 + 1, height: Math.random() * 3 + 1,
              background: i % 2 === 0 ? "#e040fb" : "#22c55e",
              left: `${Math.random() * 100}%`, top: `${Math.random() * 100}%`,
            }}
            animate={{ opacity: [0.15, 0.7, 0.15], scale: [1, 1.6, 1] }}
            transition={{ duration: Math.random() * 3 + 2, repeat: Infinity, delay: Math.random() * 2 }} />
        ))}
      </div>

      {/* Join toasts */}
      <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2 pointer-events-none">
        <AnimatePresence>
          {toasts.map(t => (
            <motion.div key={t.id}
              initial={{ opacity: 0, y: -20, scale: 0.85 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -12, scale: 0.9 }}
              transition={{ type: "spring", stiffness: 280, damping: 24 }}
              className="px-5 py-2 rounded-2xl text-sm font-black text-white whitespace-nowrap"
              style={{
                background: "rgba(34,197,94,0.18)",
                border: "1px solid rgba(34,197,94,0.45)",
                backdropFilter: "blur(12px)",
                boxShadow: "0 0 24px rgba(34,197,94,0.3)",
              }}>
              ✅ انضم <span style={{ color: "#4ade80" }}>{t.name}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <AnimatePresence mode="wait">

        {/* ══════════════════════════ LOBBY ══════════════════════════ */}
        {phase === "lobby" && (
          <motion.div key="lobby"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="relative z-10 min-h-screen flex flex-col">

            {/* Top bar */}
            <div className="flex items-center justify-between px-5 py-4">
              <button onClick={() => navigate("/")}
                className="flex items-center gap-2 text-purple-400/50 hover:text-purple-300 transition-colors text-sm font-bold">
                <ArrowRight size={16} /> الرئيسية
              </button>
              <div className="flex items-center gap-1.5">
                <motion.div
                  animate={{ scale: connected ? [1, 1.5, 1] : 1 }}
                  transition={{ repeat: connected ? Infinity : 0, duration: 2 }}
                  className="w-2 h-2 rounded-full"
                  style={{ background: connected ? "#22c55e" : "#ef4444" }} />
                {connected
                  ? <Wifi size={13} className="text-green-400/60" />
                  : <WifiOff size={13} className="text-red-400/60" />}
              </div>
            </div>

            {/* ── Main centered content ── */}
            <div className="flex-1 flex flex-col items-center justify-center px-5 pb-10 gap-8">

              {/* Hero title */}
              <div className="text-center space-y-3">
                <motion.h1
                  className="font-black"
                  style={{
                    fontSize: "clamp(2.5rem, 8vw, 5rem)",
                    color: "#22c55e",
                    textShadow: "0 0 40px #22c55e80, 0 0 80px #22c55e30",
                    lineHeight: 1.1,
                  }}
                  initial={{ y: -24, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 220, damping: 22 }}>
                  حرب الفواكه 🍉
                </motion.h1>

                <motion.div
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 }}
                  className="flex items-center justify-center gap-2 flex-wrap">
                  <span className="text-white/40 text-lg font-bold">اكتب</span>
                  <span
                    className="px-4 py-1.5 rounded-xl text-xl font-black"
                    style={{
                      background: "rgba(34,197,94,0.15)",
                      border: "2px solid rgba(34,197,94,0.5)",
                      color: "#4ade80",
                      boxShadow: "0 0 20px rgba(34,197,94,0.3)",
                    }}>
                    join
                  </span>
                  <span className="text-white/40 text-lg font-bold">في الشات للانضمام</span>
                </motion.div>
              </div>

              {/* Players grid */}
              <div className="w-full max-w-3xl">
                {players.length === 0 ? (
                  <motion.div
                    animate={{ opacity: [0.3, 0.7, 0.3] }}
                    transition={{ repeat: Infinity, duration: 2.5 }}
                    className="flex flex-col items-center gap-3 py-16">
                    <span style={{ fontSize: 56 }}>👀</span>
                    <p className="text-purple-400/40 text-base font-bold">في انتظار اللاعبين...</p>
                  </motion.div>
                ) : (
                  <motion.div
                    className="grid gap-4"
                    style={{ gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))" }}>
                    <AnimatePresence>
                      {players.map((p, i) => (
                        <motion.div key={p.username}
                          initial={{ opacity: 0, scale: 0.5, y: 20 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.5 }}
                          transition={{ type: "spring", stiffness: 300, damping: 24, delay: i * 0.03 }}
                          className="relative flex flex-col items-center gap-2 p-3 rounded-2xl group"
                          style={{
                            border: `1.5px solid ${p.color}30`,
                            background: `linear-gradient(135deg, ${p.color}12, ${p.color}06)`,
                          }}>

                          {/* Remove button */}
                          <button
                            onClick={() => handleRemovePlayer(p.username)}
                            className="absolute top-1.5 left-1.5 w-5 h-5 rounded-full items-center justify-center hidden group-hover:flex bg-red-500/20 hover:bg-red-500/60 text-red-400 transition-all z-10">
                            <X size={10} />
                          </button>

                          {/* Circular Twitch avatar */}
                          <div className="relative">
                            {/* Glow ring */}
                            <div
                              className="absolute inset-0 rounded-full blur-md opacity-60"
                              style={{ background: p.color, transform: "scale(1.1)" }} />
                            <Avatar player={p} size={64} rounded="full" />
                          </div>

                          {/* Player name */}
                          <p
                            className="text-xs font-black truncate w-full text-center"
                            style={{ color: p.color, textShadow: `0 0 8px ${p.color}55` }}>
                            {p.displayName}
                          </p>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </motion.div>
                )}
              </div>

              {/* Player count badge */}
              {players.length > 0 && (
                <motion.p
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="text-purple-400/40 text-sm font-bold">
                  {players.length} لاعب{players.length > 1 ? "اً" : ""} في اللوبي
                </motion.p>
              )}

              {/* Start button — only when 2+ players */}
              <AnimatePresence>
                {players.length >= 2 && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.8, y: 20 }}
                    transition={{ type: "spring", stiffness: 260, damping: 22 }}>
                    <motion.button
                      onClick={handleStartGame}
                      animate={{ scale: [1, 1.03, 1], boxShadow: ["0 0 30px #22c55e55", "0 0 60px #22c55e88", "0 0 30px #22c55e55"] }}
                      transition={{ repeat: Infinity, duration: 2 }}
                      whileHover={{ scale: 1.07 }}
                      whileTap={{ scale: 0.96 }}
                      className="flex items-center gap-3 px-14 py-5 rounded-3xl font-black text-2xl text-white"
                      style={{ background: "linear-gradient(135deg, #16a34a, #22c55e, #4ade80)" }}>
                      <Play size={26} fill="white" />
                      بدء اللعبة ({players.length})
                    </motion.button>
                  </motion.div>
                )}
              </AnimatePresence>

            </div>
          </motion.div>
        )}

        {/* ══════════════════════════ PLAYING ══════════════════════════ */}
        {phase === "playing" && (
          <motion.div key="playing"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="relative z-10 flex flex-col items-center min-h-screen px-4 py-8 gap-5">

            {/* Header */}
            <div className="flex items-center justify-between w-full max-w-4xl">
              <button onClick={handleReset}
                className="flex items-center gap-1.5 text-purple-400/45 hover:text-purple-300 transition-colors text-sm font-bold">
                <RotateCcw size={14} /> إعادة
              </button>
              <h2 className="text-xl font-black"
                style={{ color: "#22c55e", textShadow: "0 0 16px #22c55e60" }}>
                🍉 حرب الفواكه
              </h2>
              <motion.button
                onClick={handleRevealAll}
                className="px-4 py-1.5 rounded-xl text-sm font-black"
                style={{
                  background: "rgba(124,58,237,0.2)",
                  border: "1px solid rgba(167,139,250,0.4)",
                  color: "#c4b5fd",
                }}
                whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.97 }}>
                كشف الكل 👁
              </motion.button>
            </div>

            <p className="text-purple-400/40 text-xs">اضغط على أي فاكهة لتكشف اللاعب</p>

            {/* Cards */}
            <div className="w-full max-w-4xl">
              <div className="grid gap-4"
                style={{ gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))" }}>
                {cards.map((card, idx) => (
                  <motion.div
                    key={idx}
                    onClick={() => !card.revealed && handleReveal(idx)}
                    className="relative rounded-2xl overflow-hidden select-none"
                    style={{ aspectRatio: "3/4", cursor: card.revealed ? "default" : "pointer" }}
                    whileHover={!card.revealed ? { scale: 1.06, y: -4 } : {}}
                    whileTap={!card.revealed ? { scale: 0.96 } : {}}>

                    <AnimatePresence mode="wait">
                      {!card.revealed ? (
                        <motion.div key="hidden"
                          exit={{ opacity: 0, scale: 0.85 }}
                          transition={{ duration: 0.16 }}
                          className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-3"
                          style={{
                            background: "rgba(10,4,24,0.90)",
                            border: "2px solid rgba(34,197,94,0.22)",
                            boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
                          }}>
                          <span style={{ fontSize: "52px", lineHeight: 1 }}>{card.emoji}</span>
                          <p className="text-sm font-black text-white/90">{card.name}</p>
                          <p className="text-[10px] text-purple-400/35 font-bold">اضغط للكشف</p>
                        </motion.div>
                      ) : (
                        <motion.div key="revealed"
                          initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }}
                          transition={{ duration: 0.22, type: "spring", stiffness: 280, damping: 22 }}
                          className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-3"
                          style={{
                            background: `linear-gradient(135deg, ${card.player.color}18, ${card.player.color}08)`,
                            border: `2px solid ${card.player.color}`,
                            boxShadow: `0 0 20px ${card.player.color}35`,
                          }}>
                          <span style={{ fontSize: "38px", lineHeight: 1 }}>{card.emoji}</span>
                          <p className="text-xs font-bold text-white/55">{card.name}</p>
                          <div className="w-full h-px" style={{ background: `${card.player.color}35` }} />

                          {/* Circular Twitch avatar on card */}
                          <div className="relative">
                            <div
                              className="absolute inset-0 rounded-full blur-md opacity-50"
                              style={{ background: card.player.color, transform: "scale(1.2)" }} />
                            <Avatar player={card.player} size={48} rounded="full" />
                          </div>

                          <p className="text-xs font-black truncate w-full text-center"
                            style={{ color: card.player.color, textShadow: `0 0 10px ${card.player.color}55` }}>
                            {card.player.displayName}
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                ))}
              </div>
            </div>

            <button onClick={() => navigate("/")}
              className="mt-2 text-purple-400/25 hover:text-purple-300/45 text-xs transition-colors font-bold">
              الرئيسية
            </button>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}
