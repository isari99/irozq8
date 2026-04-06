import { useState, useRef, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Wifi, WifiOff, X, RotateCcw } from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────
interface Player {
  username: string;
  displayName: string;
  color: string;
}
interface FruitCard {
  emoji: string;
  name: string;
  player: Player;
  revealed: boolean;
}
type Phase = "settings" | "lobby" | "playing";

// ─── Constants ───────────────────────────────────────────────────────────────
const COLORS = [
  "#e040fb","#00e5ff","#ffd600","#ff6d00",
  "#22c55e","#f43f5e","#a78bfa","#fb923c",
  "#38bdf8","#4ade80","#facc15","#f87171",
  "#c084fc","#67e8f9","#86efac","#fca5a5",
];

const FRUITS = [
  { emoji: "🍉", name: "بطيخ"   },
  { emoji: "🍓", name: "فراولة" },
  { emoji: "🍋", name: "ليمون"  },
  { emoji: "🍊", name: "برتقال" },
  { emoji: "🍇", name: "عنب"    },
  { emoji: "🍑", name: "خوخ"    },
  { emoji: "🍍", name: "أناناس" },
  { emoji: "🥭", name: "مانجا"  },
  { emoji: "🍎", name: "تفاح"   },
  { emoji: "🍌", name: "موز"    },
  { emoji: "🍒", name: "كرز"    },
  { emoji: "🥝", name: "كيوي"   },
  { emoji: "🍐", name: "كمثرى"  },
  { emoji: "🫐", name: "توت"    },
  { emoji: "🍈", name: "شمام"   },
  { emoji: "🥥", name: "جوز هند"},
];

function shuffle<T>(a: T[]): T[] {
  const arr = [...a];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function FruitsGame() {
  const [, navigate] = useLocation();

  const [phase, setPhase]       = useState<Phase>("settings");
  const [channel, setChannel]   = useState("");
  const [connected, setConnected] = useState(false);
  const [players, setPlayers]   = useState<Player[]>([]);
  const [cards, setCards]       = useState<FruitCard[]>([]);

  // Refs so Twitch callbacks always see current data
  const wsRef      = useRef<WebSocket | null>(null);
  const phaseRef   = useRef<Phase>("settings");
  const playersRef = useRef<Player[]>([]);

  useEffect(() => { phaseRef.current = phase; },   [phase]);
  useEffect(() => { playersRef.current = players; }, [players]);

  // ── Connect to Twitch IRC ──────────────────────────────────────────────────
  const connect = useCallback((ch: string) => {
    wsRef.current?.close();
    const ws = new WebSocket("wss://irc-ws.chat.twitch.tv");
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send("PASS SCHMOOPIIE");
      ws.send(`NICK justinfan${Math.floor(100000 + Math.random() * 900000)}`);
      ws.send(`JOIN #${ch.toLowerCase().replace(/^#/, "")}`);
      setConnected(true);
    };
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);

    ws.onmessage = (ev: MessageEvent) => {
      const raw: string = ev.data;
      if (raw.startsWith("PING")) { ws.send("PONG :tmi.twitch.tv"); return; }
      const m = raw.match(/^:(\w+)!\w+@\S+ PRIVMSG #\S+ :(.+)$/);
      if (!m) return;
      const [, username, msg] = m;
      const text = msg.trim().toLowerCase();

      if ((text === "join" || text === "انضم") && phaseRef.current === "lobby") {
        setPlayers(prev => {
          if (prev.some(p => p.username === username)) return prev;
          return [...prev, {
            username,
            displayName: username,
            color: COLORS[prev.length % COLORS.length],
          }];
        });
      }
    };
  }, []);

  useEffect(() => () => { wsRef.current?.close(); }, []);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleEnterLobby = () => {
    const ch = channel.trim().replace(/^#/, "");
    if (!ch) return;
    setPhase("lobby");
    connect(ch);
  };

  const handleStartGame = () => {
    const active = playersRef.current;
    if (active.length < 2) return;
    const shuffledFruits = shuffle(FRUITS).slice(0, active.length);
    const shuffledPlayers = shuffle(active);
    const newCards: FruitCard[] = shuffledFruits.map((f, i) => ({
      ...f,
      player: shuffledPlayers[i],
      revealed: false,
    }));
    setCards(newCards);
    setPhase("playing");
  };

  const handleReveal = (idx: number) => {
    setCards(prev => prev.map((c, i) => i === idx ? { ...c, revealed: true } : c));
  };

  const handleRevealAll = () => {
    setCards(prev => prev.map(c => ({ ...c, revealed: true })));
  };

  const handleReset = () => {
    setCards([]);
    setPhase("lobby");
  };

  const handleRemovePlayer = (username: string) => {
    const updated = playersRef.current.filter(p => p.username !== username);
    playersRef.current = updated;
    setPlayers(updated);
  };

  // ────────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen gradient-bg relative overflow-hidden" dir="rtl"
      style={{ fontFamily: "'Cairo', sans-serif" }}>

      {/* Background particles */}
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

      <AnimatePresence mode="wait">

        {/* ══ SETTINGS ══ */}
        {phase === "settings" && (
          <motion.div key="settings"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="relative z-10 flex flex-col items-center justify-center min-h-screen px-4 gap-7">

            <button onClick={() => navigate("/")}
              className="absolute top-6 right-6 flex items-center gap-2 text-purple-400/60 hover:text-purple-300 transition-colors text-sm font-bold">
              <ArrowRight size={16} /> الرئيسية
            </button>

            <motion.img src="/fruits-hero.png" alt="حرب الفواكه"
              className="w-36 h-36 rounded-3xl object-cover"
              style={{ boxShadow: "0 0 40px #22c55e50" }}
              initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
              transition={{ type: "spring", stiffness: 200, damping: 20 }} />

            <div className="text-center">
              <h1 className="text-4xl font-black" style={{ color: "#22c55e", textShadow: "0 0 20px #22c55e80" }}>
                حرب الفواكه 🍉
              </h1>
              <p className="text-purple-300/50 text-sm mt-1">اكتب اسم قناتك ثم ابدأ</p>
            </div>

            <motion.div className="w-full max-w-xs rounded-3xl p-6 flex flex-col gap-4"
              style={{ background: "rgba(10,4,24,0.92)", border: "1px solid rgba(34,197,94,0.3)" }}
              initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.12 }}>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-purple-300/70">اسم قناة Twitch</label>
                <input
                  value={channel}
                  onChange={e => setChannel(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleEnterLobby()}
                  placeholder="مثال: rose_streamer"
                  className="w-full bg-transparent border border-purple-500/30 rounded-xl px-4 py-3 text-white placeholder-purple-400/30 focus:outline-none focus:border-green-400/60 transition-colors text-sm text-right" />
              </div>

              <motion.button
                onClick={handleEnterLobby}
                disabled={!channel.trim()}
                className="w-full py-3.5 rounded-2xl text-white font-black text-base btn-shimmer disabled:opacity-35 disabled:cursor-not-allowed"
                style={{ background: "linear-gradient(135deg, #16a34a, #22c55e)", boxShadow: "0 4px 24px #22c55e40" }}
                whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                دخول اللوبي 🎮
              </motion.button>
            </motion.div>
          </motion.div>
        )}

        {/* ══ LOBBY ══ */}
        {phase === "lobby" && (
          <motion.div key="lobby"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="relative z-10 flex flex-col items-center min-h-screen px-4 py-8 gap-5">

            {/* Header */}
            <div className="flex items-center justify-between w-full max-w-2xl">
              <button onClick={() => { wsRef.current?.close(); setConnected(false); setPlayers([]); setPhase("settings"); }}
                className="flex items-center gap-2 text-purple-400/60 hover:text-purple-300 transition-colors text-sm font-bold">
                <ArrowRight size={16} /> رجوع
              </button>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl"
                style={{ background: "rgba(10,4,24,0.80)", border: "1px solid rgba(34,197,94,0.2)" }}>
                <motion.div
                  animate={{ scale: connected ? [1, 1.5, 1] : 1 }}
                  transition={{ repeat: connected ? Infinity : 0, duration: 2 }}
                  className="w-2 h-2 rounded-full"
                  style={{ background: connected ? "#22c55e" : "#ef4444" }} />
                {connected ? <Wifi size={13} className="text-green-400" /> : <WifiOff size={13} className="text-red-400" />}
                <span className="text-xs font-bold text-purple-300/70">#{channel}</span>
              </div>
            </div>

            {/* Title */}
            <div className="text-center">
              <h2 className="text-3xl font-black" style={{ color: "#22c55e", textShadow: "0 0 20px #22c55e60" }}>
                لوبي حرب الفواكه 🍉
              </h2>
              <p className="text-purple-300/50 text-sm mt-1">
                اكتب <span className="text-green-400 font-black">join</span> أو <span className="text-green-400 font-black">انضم</span> في الشات للمشاركة
              </p>
            </div>

            {/* Players */}
            <div className="w-full max-w-2xl flex-1">
              {players.length === 0 ? (
                <motion.p
                  animate={{ opacity: [0.35, 0.75, 0.35] }} transition={{ repeat: Infinity, duration: 2 }}
                  className="text-center text-purple-400/40 text-sm py-20">
                  في انتظار اللاعبين... 👀
                </motion.p>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                  <AnimatePresence>
                    {players.map(p => (
                      <motion.div key={p.username}
                        initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.5 }}
                        transition={{ type: "spring", stiffness: 260, damping: 22 }}
                        className="relative flex flex-col items-center gap-2 p-3 rounded-2xl group"
                        style={{ border: `2px solid ${p.color}35`, background: p.color + "0e" }}>

                        {/* Remove */}
                        <button
                          onClick={() => handleRemovePlayer(p.username)}
                          className="absolute top-1 left-1 w-5 h-5 rounded-full items-center justify-center hidden group-hover:flex bg-red-500/20 hover:bg-red-500/50 text-red-400 transition-all">
                          <X size={10} />
                        </button>

                        {/* Avatar */}
                        <div className="w-11 h-11 rounded-xl overflow-hidden border-2"
                          style={{ borderColor: p.color }}>
                          <img
                            src={`https://api.dicebear.com/7.x/pixel-art/svg?seed=${p.username}`}
                            alt={p.displayName}
                            className="w-full h-full object-cover" />
                        </div>

                        <p className="text-xs font-black truncate w-full text-center"
                          style={{ color: p.color }}>
                          {p.displayName}
                        </p>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </div>

            {/* Start */}
            <motion.button
              onClick={handleStartGame}
              disabled={players.length < 2}
              className="px-12 py-4 rounded-2xl text-white font-black text-xl btn-shimmer disabled:opacity-30 disabled:cursor-not-allowed"
              style={{ background: "linear-gradient(135deg, #16a34a, #22c55e)", boxShadow: "0 6px 32px #22c55e50" }}
              whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.97 }}
              animate={players.length >= 2 ? { scale: [1, 1.02, 1] } : {}}
              transition={{ repeat: Infinity, duration: 2 }}>
              بدء اللعبة 🎮 ({players.length} لاعب)
            </motion.button>
          </motion.div>
        )}

        {/* ══ PLAYING ══ */}
        {phase === "playing" && (
          <motion.div key="playing"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="relative z-10 flex flex-col items-center min-h-screen px-4 py-8 gap-5">

            {/* Header */}
            <div className="flex items-center justify-between w-full max-w-4xl">
              <button onClick={handleReset}
                className="flex items-center gap-1.5 text-purple-400/50 hover:text-purple-300 transition-colors text-sm font-bold">
                <RotateCcw size={14} /> إعادة اللعبة
              </button>
              <h2 className="text-xl font-black" style={{ color: "#22c55e", textShadow: "0 0 16px #22c55e60" }}>
                🍉 حرب الفواكه
              </h2>
              <motion.button
                onClick={handleRevealAll}
                className="px-4 py-1.5 rounded-xl text-sm font-black btn-shimmer"
                style={{ background: "linear-gradient(135deg, #7c3aed60, #a78bfa40)", border: "1px solid #a78bfa50", color: "#c4b5fd" }}
                whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.97 }}>
                كشف الكل 👁
              </motion.button>
            </div>

            {/* Instruction */}
            <p className="text-purple-400/50 text-xs">اضغط على أي فاكهة لكشف اللاعب خلفها</p>

            {/* Fruit cards grid */}
            <div className="w-full max-w-4xl">
              <div className="grid gap-4"
                style={{ gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))" }}>
                {cards.map((card, idx) => (
                  <motion.div
                    key={idx}
                    onClick={() => !card.revealed && handleReveal(idx)}
                    className="relative rounded-2xl overflow-hidden cursor-pointer select-none"
                    style={{ aspectRatio: "3/4" }}
                    whileHover={!card.revealed ? { scale: 1.06, y: -4 } : {}}
                    whileTap={!card.revealed ? { scale: 0.96 } : {}}>

                    <AnimatePresence mode="wait">
                      {!card.revealed ? (
                        /* ── Hidden face ── */
                        <motion.div key="hidden"
                          initial={{ rotateY: 0 }} exit={{ rotateY: 90 }}
                          transition={{ duration: 0.18 }}
                          className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-3"
                          style={{
                            background: "rgba(10,4,24,0.90)",
                            border: "2px solid rgba(34,197,94,0.25)",
                            boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
                          }}>
                          <span style={{ fontSize: "52px", lineHeight: 1 }}>{card.emoji}</span>
                          <p className="text-sm font-black text-white/90">{card.name}</p>
                          <p className="text-[10px] text-purple-400/40 font-bold">اضغط للكشف</p>
                        </motion.div>
                      ) : (
                        /* ── Revealed face ── */
                        <motion.div key="revealed"
                          initial={{ rotateY: -90, opacity: 0 }} animate={{ rotateY: 0, opacity: 1 }}
                          transition={{ duration: 0.22 }}
                          className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-3"
                          style={{
                            background: `linear-gradient(135deg, ${card.player.color}18, ${card.player.color}08)`,
                            border: `2px solid ${card.player.color}`,
                            boxShadow: `0 0 20px ${card.player.color}35`,
                          }}>
                          <span style={{ fontSize: "40px", lineHeight: 1 }}>{card.emoji}</span>
                          <p className="text-xs font-bold text-white/60">{card.name}</p>
                          {/* Divider */}
                          <div className="w-full h-px my-1" style={{ background: `${card.player.color}40` }} />
                          {/* Avatar */}
                          <div className="w-10 h-10 rounded-xl overflow-hidden border-2"
                            style={{ borderColor: card.player.color, boxShadow: `0 0 12px ${card.player.color}60` }}>
                            <img
                              src={`https://api.dicebear.com/7.x/pixel-art/svg?seed=${card.player.username}`}
                              alt={card.player.displayName}
                              className="w-full h-full object-cover" />
                          </div>
                          <p className="text-xs font-black truncate w-full text-center"
                            style={{ color: card.player.color, textShadow: `0 0 10px ${card.player.color}60` }}>
                            {card.player.displayName}
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                ))}
              </div>
            </div>

            {/* Back to home */}
            <button onClick={() => navigate("/")}
              className="mt-2 text-purple-400/30 hover:text-purple-300/50 text-xs transition-colors font-bold">
              الرئيسية
            </button>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}
