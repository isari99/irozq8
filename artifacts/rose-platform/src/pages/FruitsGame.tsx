import { useState, useRef, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Wifi, WifiOff, X, RotateCcw, Play } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Player {
  username: string;
  displayName: string;
  avatar: string;
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

interface Toast { id: number; name: string }

// ─── Component ────────────────────────────────────────────────────────────────
export default function FruitsGame() {
  const [, navigate] = useLocation();
  const { user } = useAuth();

  const [phase, setPhase]               = useState<Phase>("lobby");
  const [twitchConnected, setTwitchConnected] = useState(false);
  const [players, setPlayers]           = useState<Player[]>([]);
  const [cards, setCards]               = useState<FruitCard[]>([]);
  const [toasts, setToasts]             = useState<Toast[]>([]);
  const [joinMsg, setJoinMsg]           = useState("");

  // ── Refs (same pattern as XO) ─────────────────────────────────────────────
  const wsRef        = useRef<WebSocket | null>(null);
  const phaseRef     = useRef<Phase>("lobby");
  const playersRef   = useRef<Player[]>([]);
  const connectedRef = useRef(false);
  const toastCounter = useRef(0);

  useEffect(() => { phaseRef.current = phase; },    [phase]);
  useEffect(() => { playersRef.current = players; }, [players]);

  // ── Toast ─────────────────────────────────────────────────────────────────
  const showToast = (name: string) => {
    const id = ++toastCounter.current;
    setToasts(prev => [...prev, { id, name }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
  };

  // ── Twitch IRC — exact same pattern as XO ────────────────────────────────
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
        if (line.includes("366") || line.includes("ROOMSTATE")) {
          setTwitchConnected(true);
          continue;
        }
        // ← same regex as XOGame exactly
        const m = line.match(/^(?:@[^ ]+ )?:(\w+)!\w+@\w+\.tmi\.twitch\.tv PRIVMSG #\w+ :(.+)$/);
        if (m) handleChatMsg(m[1], m[2].trim());
      }
    };

    ws.onclose = () => setTwitchConnected(false);
  }, []);

  // Connect when user is ready — same pattern as XO
  if (!connectedRef.current && user?.username) {
    connectedRef.current = true;
    setTimeout(() => connectTwitch(user.username), 80);
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => { wsRef.current?.close(); };
  }, []);

  // ── Chat handler — mirrors XO logic ──────────────────────────────────────
  const handleChatMsg = useCallback((username: string, text: string) => {
    const msg = text.trim().toLowerCase();
    const ph  = phaseRef.current;

    if (msg === "join" && ph === "lobby") {
      // No duplicates
      if (playersRef.current.some(p => p.username === username)) return;

      const color = COLORS[playersRef.current.length % COLORS.length];
      const newPlayer: Player = {
        username,
        displayName: username,
        // Same avatar source as XO
        avatar: `https://unavatar.io/twitch/${username}`,
        color,
      };

      setPlayers(prev => {
        if (prev.some(p => p.username === username)) return prev;
        const next = [...prev, newPlayer];
        playersRef.current = next;
        return next;
      });

      setJoinMsg(`${username} انضم! 🍉`);
      setTimeout(() => setJoinMsg(""), 2500);

      showToast(username);
    }
  }, []);

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

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen gradient-bg relative overflow-hidden" dir="rtl"
      style={{ fontFamily: "'Cairo', sans-serif" }}>

      {/* Particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(12)].map((_, i) => (
          <motion.div key={i} className="absolute rounded-full"
            style={{
              width: Math.random() * 3 + 1, height: Math.random() * 3 + 1,
              background: i % 2 === 0 ? "#e040fb" : "#22c55e",
              left: `${(i * 17 + 5) % 100}%`, top: `${(i * 23 + 11) % 100}%`,
            }}
            animate={{ opacity: [0.15, 0.7, 0.15], scale: [1, 1.6, 1] }}
            transition={{ duration: 2 + i * 0.3, repeat: Infinity, delay: i * 0.25 }} />
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
              🍉 انضم <span style={{ color: "#4ade80" }}>{t.name}</span>
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

              {/* Connection status — same style as XO */}
              <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-bold ${
                twitchConnected
                  ? "border-purple-500/40 bg-purple-500/10 text-purple-300"
                  : "border-gray-700/50 text-gray-600"
              }`}>
                {twitchConnected ? <Wifi size={11} /> : <WifiOff size={11} />}
                {twitchConnected ? `#${user?.username}` : "جارٍ الاتصال..."}
              </div>
            </div>

            {/* Main centered content */}
            <div className="flex-1 flex flex-col items-center justify-center px-5 pb-10 gap-8">

              {/* Hero */}
              <div className="text-center space-y-3">
                <motion.h1 className="font-black"
                  style={{
                    fontSize: "clamp(2.5rem, 8vw, 5rem)",
                    color: "#22c55e",
                    textShadow: "0 0 40px #22c55e80, 0 0 80px #22c55e30",
                    lineHeight: 1.1,
                  }}
                  initial={{ y: -24, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 220, damping: 22 }}>
                  حرب الفواكه 🍉
                </motion.h1>

                {/* Connection status badge — same as XO joining screen */}
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}
                  className={`inline-flex items-center gap-2 px-5 py-2 rounded-full border text-sm font-bold ${
                    twitchConnected
                      ? "border-green-500/40 bg-green-500/10 text-green-300"
                      : "border-gray-700/40 text-gray-500"
                  }`}>
                  {twitchConnected
                    ? <><Wifi size={13} />#{user?.username} متصل</>
                    : <><WifiOff size={13} />جارٍ الاتصال...</>}
                </motion.div>

                <motion.div
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
                  className="flex items-center justify-center gap-2 flex-wrap">
                  <span className="text-white/40 text-lg font-bold">اكتب</span>
                  <span className="px-4 py-1.5 rounded-xl text-xl font-black"
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

              {/* Join flash — same as XO */}
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
              <div className="w-full max-w-3xl">
                {players.length === 0 ? (
                  <motion.div
                    animate={{ opacity: [0.3, 0.7, 0.3] }}
                    transition={{ repeat: Infinity, duration: 2.5 }}
                    className="flex flex-col items-center gap-3 py-12">
                    <span style={{ fontSize: 52 }}>👀</span>
                    <p className="text-purple-400/40 text-base font-bold">في انتظار اللاعبين...</p>
                  </motion.div>
                ) : (
                  <motion.div className="grid gap-4"
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
                            border: `1.5px solid ${p.color}35`,
                            background: `linear-gradient(135deg, ${p.color}12, ${p.color}06)`,
                          }}>

                          {/* Remove button */}
                          <button onClick={() => handleRemovePlayer(p.username)}
                            className="absolute top-1.5 left-1.5 w-5 h-5 rounded-full items-center justify-center hidden group-hover:flex bg-red-500/20 hover:bg-red-500/60 text-red-400 transition-all z-10">
                            <X size={10} />
                          </button>

                          {/* Circular avatar */}
                          <div className="relative">
                            <div className="absolute inset-0 rounded-full blur-md opacity-50"
                              style={{ background: p.color, transform: "scale(1.1)" }} />
                            <div className="relative w-16 h-16 rounded-full overflow-hidden border-2"
                              style={{ borderColor: p.color, boxShadow: `0 0 14px ${p.color}55` }}>
                              <img src={p.avatar} alt={p.displayName}
                                className="w-full h-full object-cover"
                                onError={e => { (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${p.username}`; }} />
                            </div>
                          </div>

                          <p className="text-xs font-black truncate w-full text-center"
                            style={{ color: p.color, textShadow: `0 0 8px ${p.color}55` }}>
                            {p.displayName}
                          </p>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </motion.div>
                )}
              </div>

              {players.length > 0 && (
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="text-purple-400/40 text-sm font-bold">
                  {players.length} لاعب في اللوبي
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
                    <motion.button onClick={handleStartGame}
                      animate={{ scale: [1, 1.03, 1], boxShadow: ["0 0 30px #22c55e55","0 0 60px #22c55e88","0 0 30px #22c55e55"] }}
                      transition={{ repeat: Infinity, duration: 2 }}
                      whileHover={{ scale: 1.07 }} whileTap={{ scale: 0.96 }}
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

            <div className="flex items-center justify-between w-full max-w-4xl">
              <button onClick={handleReset}
                className="flex items-center gap-1.5 text-purple-400/45 hover:text-purple-300 transition-colors text-sm font-bold">
                <RotateCcw size={14} /> إعادة
              </button>
              <h2 className="text-xl font-black"
                style={{ color: "#22c55e", textShadow: "0 0 16px #22c55e60" }}>
                🍉 حرب الفواكه
              </h2>
              <motion.button onClick={handleRevealAll}
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

            <div className="w-full max-w-4xl">
              <div className="grid gap-4"
                style={{ gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))" }}>
                {cards.map((card, idx) => (
                  <motion.div key={idx}
                    onClick={() => !card.revealed && handleReveal(idx)}
                    className="relative rounded-2xl overflow-hidden select-none"
                    style={{ aspectRatio: "3/4", cursor: card.revealed ? "default" : "pointer" }}
                    whileHover={!card.revealed ? { scale: 1.06, y: -4 } : {}}
                    whileTap={!card.revealed ? { scale: 0.96 } : {}}>

                    <AnimatePresence mode="wait">
                      {!card.revealed ? (
                        <motion.div key="hidden"
                          exit={{ opacity: 0, scale: 0.85 }} transition={{ duration: 0.16 }}
                          className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-3"
                          style={{
                            background: "rgba(10,4,24,0.90)",
                            border: "2px solid rgba(34,197,94,0.22)",
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
                          <div className="relative">
                            <div className="absolute inset-0 rounded-full blur-md opacity-50"
                              style={{ background: card.player.color, transform: "scale(1.2)" }} />
                            <div className="relative w-12 h-12 rounded-full overflow-hidden border-2"
                              style={{ borderColor: card.player.color, boxShadow: `0 0 12px ${card.player.color}55` }}>
                              <img
                                src={card.player.avatar}
                                alt={card.player.displayName}
                                className="w-full h-full object-cover"
                                onError={e => { (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${card.player.username}`; }} />
                            </div>
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
