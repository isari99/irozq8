import { useState, useRef, useCallback, useEffect } from "react";
import { fetchTwitchAvatar, fallbackAvatar } from "@/lib/twitchUser";
import { parseChatLine } from "@/lib/twitchChat";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Wifi, WifiOff, X, Play } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Player {
  username: string;
  displayName: string;
  avatar: string;
  color: string;
}
interface VotingCard {
  emoji: string;
  name: string;
  player: Player;
}
type Phase = "lobby" | "voting" | "winner";

interface EliminationFlash {
  player: Player;
  fruit: string;
  votes: number;
  isTie: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const ROUND_DURATION = 60;

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

// set of all fruit names for fast chat matching
const FRUIT_NAME_SET = new Set(FRUITS.map(f => f.name));

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
  const { user } = useAuth();

  // ── Core state ─────────────────────────────────────────────────────────────
  const [phase, setPhase]               = useState<Phase>("lobby");
  const [twitchConnected, setTwitchConnected] = useState(false);
  const [allPlayers, setAllPlayers]     = useState<Player[]>([]);   // all who joined
  const [activePlayers, setActivePlayers] = useState<Player[]>([]); // currently in game
  const [cards, setCards]               = useState<VotingCard[]>([]);
  const [votes, setVotes]               = useState<Record<string, string>>({}); // voter→fruitEmoji
  const [timeLeft, setTimeLeft]         = useState(ROUND_DURATION);
  const [round, setRound]               = useState(1);
  const [winner, setWinner]             = useState<Player | null>(null);
  const [elimination, setElimination]   = useState<EliminationFlash | null>(null);
  const [joinMsg, setJoinMsg]           = useState("");

  // ── Refs (stale-closure-safe) ─────────────────────────────────────────────
  const wsRef            = useRef<WebSocket | null>(null);
  const phaseRef         = useRef<Phase>("lobby");
  const allPlayersRef    = useRef<Player[]>([]);
  const activeRef        = useRef<Player[]>([]);
  const cardsRef         = useRef<VotingCard[]>([]);
  const votesRef         = useRef<Record<string, string>>({});
  const connectedRef       = useRef(false);
  const timerRef           = useRef<ReturnType<typeof setInterval> | null>(null);
  const endRoundCalledRef  = useRef(false); // guard against double-call

  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { allPlayersRef.current = allPlayers; }, [allPlayers]);

  // ── Timer countdown ────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "voting") return;
    if (timeLeft <= 0) { endRound(); return; }
    const t = setTimeout(() => setTimeLeft(prev => prev - 1), 1000);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, timeLeft]);

  // ── Twitch IRC — identical to XO ──────────────────────────────────────────
  const connectTwitch = useCallback((channel: string) => {
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
    const ch = channel.toLowerCase().replace(/^#/, "");
    const ws = new WebSocket("wss://irc-ws.chat.twitch.tv");
    wsRef.current = ws;
    ws.onopen = () => {
      ws.send("PASS SCHMOOPIIE");
      ws.send(`NICK justinfan${Math.floor(Math.random() * 89999) + 10000}`);
      ws.send("CAP REQ :twitch.tv/tags twitch.tv/commands");
      ws.send(`JOIN #${ch}`);
    };
    ws.onmessage = e => {
      const lines = (e.data as string).split("\r\n").filter(Boolean);
      for (const line of lines) {
        if (line.startsWith("PING")) { ws.send("PONG :tmi.twitch.tv"); continue; }
        if (line.includes("366") || line.includes("ROOMSTATE")) { setTwitchConnected(true); continue; }
        const cm = parseChatLine(line);
        if (cm) handleChatMsg(cm.username, cm.text, cm.displayName);
      }
    };
    ws.onclose = () => setTwitchConnected(false);
  }, []);

  if (!connectedRef.current && user?.username) {
    connectedRef.current = true;
    setTimeout(() => connectTwitch(user.username), 80);
  }

  useEffect(() => () => { wsRef.current?.close(); }, []);

  // ── Chat handler ───────────────────────────────────────────────────────────
  const handleChatMsg = useCallback((username: string, text: string, displayName = username) => {
    const msg = text.trim().toLowerCase();
    const ph  = phaseRef.current;

    // ── JOIN ──
    if (msg === "join" && ph === "lobby") {
      if (allPlayersRef.current.some(p => p.username === username)) return;
      const color = COLORS[allPlayersRef.current.length % COLORS.length];
      const newPlayer: Player = {
        username, displayName,
        avatar: fallbackAvatar(username),
        color,
      };
      const next = [...allPlayersRef.current, newPlayer];
      allPlayersRef.current = next;
      setAllPlayers(next);
      setJoinMsg(`${displayName} انضم! 🍉`);
      setTimeout(() => setJoinMsg(""), 2500);
      fetchTwitchAvatar(username).then(avatar =>
        setAllPlayers(prev => prev.map(p => p.username === username ? { ...p, avatar } : p))
      );
      return;
    }

    // ── VOTE ──
    if (ph === "voting") {
      const trimmed = text.trim();
      // Must be a valid fruit name in current round
      if (!FRUIT_NAME_SET.has(trimmed)) return;
      // Must be a joined player
      if (!allPlayersRef.current.some(p => p.username === username)) return;
      // No double voting
      if (votesRef.current[username]) return;
      // Must match an active card
      const card = cardsRef.current.find(c => c.name === trimmed);
      if (!card) return;

      setVotes(prev => {
        if (prev[username]) return prev;
        const next = { ...prev, [username]: card.emoji };
        votesRef.current = next;
        // ── Early finish: all active players voted ──────────────────────
        if (Object.keys(next).length >= activeRef.current.length) {
          setTimeout(() => setTimeLeft(0), 50);
        }
        return next;
      });
    }
  }, []);

  // ── Start game ─────────────────────────────────────────────────────────────
  const handleStartGame = () => {
    const players = allPlayersRef.current;
    if (players.length < 2) return;
    activeRef.current = [...players];
    setActivePlayers([...players]);
    beginRound([...players], 1);
  };

  // ── Begin a new round ──────────────────────────────────────────────────────
  const beginRound = (players: Player[], roundNum: number) => {
    const shuffledFruits   = shuffle(FRUITS).slice(0, players.length);
    const shuffledPlayers  = shuffle([...players]);
    const newCards: VotingCard[] = shuffledFruits.map((f, i) => ({
      emoji: f.emoji, name: f.name, player: shuffledPlayers[i],
    }));

    cardsRef.current  = newCards;
    votesRef.current  = {};
    activeRef.current = players;
    endRoundCalledRef.current = false; // reset guard for new round

    setCards(newCards);
    setVotes({});
    setRound(roundNum);
    setTimeLeft(ROUND_DURATION);
    phaseRef.current = "voting";
    setPhase("voting");
  };

  // ── End round & eliminate ──────────────────────────────────────────────────
  const endRound = () => {
    if (endRoundCalledRef.current) return; // prevent double-call
    endRoundCalledRef.current = true;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }

    const currentVotes = { ...votesRef.current };
    const currentCards = [...cardsRef.current];
    const currentActive = [...activeRef.current];

    // Count votes per fruit emoji
    const voteCounts: Record<string, number> = {};
    currentCards.forEach(c => { voteCounts[c.emoji] = 0; });
    Object.values(currentVotes).forEach(emoji => {
      if (emoji in voteCounts) voteCounts[emoji] = (voteCounts[emoji] || 0) + 1;
    });

    const maxVotes = Math.max(...Object.values(voteCounts));

    // No votes → tie → no elimination
    if (maxVotes === 0) {
      setElimination({ player: currentActive[0], fruit: "", votes: 0, isTie: true });
      setTimeout(() => {
        setElimination(null);
        beginRound(currentActive, round + 1);
      }, 2800);
      return;
    }

    const topFruits = Object.entries(voteCounts).filter(([, v]) => v === maxVotes);

    // Tie between multiple fruits → no elimination
    if (topFruits.length > 1) {
      setElimination({ player: currentActive[0], fruit: "", votes: maxVotes, isTie: true });
      setTimeout(() => {
        setElimination(null);
        beginRound(currentActive, round + 1);
      }, 2800);
      return;
    }

    // Single most-voted fruit → eliminate its player
    const eliminatedEmoji = topFruits[0][0];
    const eliminatedCard  = currentCards.find(c => c.emoji === eliminatedEmoji);
    if (!eliminatedCard) { beginRound(currentActive, round + 1); return; }

    const remaining = currentActive.filter(p => p.username !== eliminatedCard.player.username);

    // Show elimination flash
    phaseRef.current = "lobby"; // pause chat handling during flash
    setElimination({ player: eliminatedCard.player, fruit: eliminatedCard.emoji, votes: maxVotes, isTie: false });

    setTimeout(() => {
      setElimination(null);
      if (remaining.length <= 1) {
        // Winner!
        setWinner(remaining[0] ?? null);
        phaseRef.current = "winner";
        setPhase("winner");
      } else {
        activeRef.current = remaining;
        setActivePlayers(remaining);
        beginRound(remaining, round + 1);
      }
    }, 3200);
  };

  // ── Reset to lobby (players must rejoin with "join") ──────────────────────
  const handleReplay = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    allPlayersRef.current = [];
    activeRef.current = [];
    cardsRef.current = [];
    votesRef.current = {};
    endRoundCalledRef.current = false;
    setAllPlayers([]); setActivePlayers([]); setCards([]); setVotes({});
    setWinner(null); setElimination(null); setRound(1); setTimeLeft(ROUND_DURATION);
    phaseRef.current = "lobby";
    setPhase("lobby");
  };

  // ── Helpers ────────────────────────────────────────────────────────────────
  const votedCount  = Object.keys(votes).length;
  const totalVoters = allPlayers.length;

  // Votes per card
  const getCardVotes = (emoji: string) =>
    Object.values(votes).filter(v => v === emoji).length;

  // Timer color
  const timerColor = timeLeft > 30 ? "#22c55e" : timeLeft > 10 ? "#ffd600" : "#ef4444";
  const timerPct   = (timeLeft / ROUND_DURATION) * 100;

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen gradient-bg relative overflow-hidden" dir="rtl"
      style={{ fontFamily: "'Cairo', sans-serif" }}>

      {/* Particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(10)].map((_, i) => (
          <motion.div key={i} className="absolute rounded-full"
            style={{
              width: Math.random() * 3 + 1, height: Math.random() * 3 + 1,
              background: i % 2 === 0 ? "#22c55e" : "#e040fb",
              left: `${(i * 17 + 5) % 100}%`, top: `${(i * 23 + 11) % 100}%`,
            }}
            animate={{ opacity: [0.1, 0.5, 0.1], scale: [1, 1.8, 1] }}
            transition={{ duration: 2.5 + i * 0.4, repeat: Infinity, delay: i * 0.3 }} />
        ))}
      </div>

      {/* ─── Elimination overlay ─────────────────────────────────────────── */}
      <AnimatePresence>
        {elimination && (
          <motion.div
            key="elim"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6"
            style={{ background: elimination.isTie ? "rgba(10,4,24,0.92)" : "rgba(8,2,18,0.96)", backdropFilter: "blur(16px)" }}>

            {elimination.isTie ? (
              <>
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 260, damping: 18 }}
                  style={{ fontSize: 90 }}>⚖️</motion.div>
                <motion.h2 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
                  className="text-5xl font-black text-white">تعادل!</motion.h2>
                <p className="text-purple-300/60 text-xl font-bold">لا يوجد إقصاء — جولة جديدة</p>
              </>
            ) : (
              <>
                <motion.div initial={{ scale: 0, rotate: -20 }} animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", stiffness: 240, damping: 18 }}
                  style={{ fontSize: 80, lineHeight: 1 }}>🚨</motion.div>

                <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
                  className="flex flex-col items-center gap-4">
                  <span style={{ fontSize: 64 }}>{elimination.fruit}</span>

                  <div className="relative">
                    <div className="absolute inset-0 rounded-full blur-xl opacity-60"
                      style={{ background: elimination.player.color, transform: "scale(1.3)" }} />
                    <div className="relative w-28 h-28 rounded-full overflow-hidden border-4"
                      style={{ borderColor: elimination.player.color, boxShadow: `0 0 40px ${elimination.player.color}80` }}>
                      <img src={elimination.player.avatar} alt={elimination.player.displayName}
                        className="w-full h-full object-cover"
                        onError={e => { (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${elimination.player.username}`; }} />
                    </div>
                  </div>

                  <div className="text-center">
                    <h2 className="text-4xl font-black" style={{ color: elimination.player.color }}>
                      {elimination.player.displayName}
                    </h2>
                    <p className="text-white/50 text-lg font-bold mt-1">
                      خرج من اللعبة! ({elimination.votes} 🗳️)
                    </p>
                  </div>
                </motion.div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">

        {/* ══════════════════════ LOBBY ══════════════════════════════════ */}
        {phase === "lobby" && (
          <motion.div key="lobby"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="relative z-10 min-h-screen flex flex-col">

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4">
              <button onClick={() => navigate("/")}
                className="flex items-center gap-2 text-purple-400/50 hover:text-purple-300 transition-colors text-sm font-bold">
                <ArrowRight size={16} /> الرئيسية
              </button>
              <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-bold ${
                twitchConnected ? "border-purple-500/40 bg-purple-500/10 text-purple-300" : "border-gray-700/50 text-gray-600"
              }`}>
                {twitchConnected ? <Wifi size={11} /> : <WifiOff size={11} />}
                {twitchConnected ? `#${user?.username}` : "جارٍ الاتصال..."}
              </div>
            </div>

            <div className="flex-1 flex flex-col items-center justify-center px-5 pb-10 gap-8">

              {/* Title */}
              <div className="text-center space-y-3">
                <motion.h1 className="font-black"
                  style={{ fontSize: "clamp(2.5rem,8vw,5rem)", color: "#22c55e",
                    textShadow: "0 0 40px #22c55e80, 0 0 80px #22c55e30", lineHeight: 1.1 }}
                  initial={{ y: -24, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 220, damping: 22 }}>
                  حرب الفواكه 🍉
                </motion.h1>

                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}
                  className={`inline-flex items-center gap-2 px-5 py-2 rounded-full border text-sm font-bold ${
                    twitchConnected ? "border-green-500/40 bg-green-500/10 text-green-300" : "border-gray-700/40 text-gray-500"
                  }`}>
                  {twitchConnected ? <><Wifi size={13} />#{user?.username} متصل</> : <><WifiOff size={13} />جارٍ الاتصال...</>}
                </motion.div>

                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
                  className="flex items-center justify-center gap-2 flex-wrap">
                  <span className="text-white/40 text-lg font-bold">اكتب</span>
                  <span className="px-4 py-1.5 rounded-xl text-xl font-black"
                    style={{ background: "rgba(34,197,94,0.15)", border: "2px solid rgba(34,197,94,0.5)",
                      color: "#4ade80", boxShadow: "0 0 20px rgba(34,197,94,0.3)" }}>join</span>
                  <span className="text-white/40 text-lg font-bold">في الشات للانضمام</span>
                </motion.div>
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

              {/* Players */}
              <div className="w-full max-w-3xl">
                {allPlayers.length === 0 ? (
                  <motion.div animate={{ opacity: [0.3, 0.7, 0.3] }} transition={{ repeat: Infinity, duration: 2.5 }}
                    className="flex flex-col items-center gap-3 py-12">
                    <span style={{ fontSize: 52 }}>👀</span>
                    <p className="text-purple-400/40 text-base font-bold">في انتظار اللاعبين...</p>
                  </motion.div>
                ) : (
                  <div className="grid gap-4"
                    style={{ gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))" }}>
                    <AnimatePresence>
                      {allPlayers.map((p, i) => (
                        <motion.div key={p.username}
                          initial={{ opacity: 0, scale: 0.5, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.5 }}
                          transition={{ type: "spring", stiffness: 300, damping: 24, delay: i * 0.03 }}
                          className="relative flex flex-col items-center gap-2 p-3 rounded-2xl group"
                          style={{ border: `1.5px solid ${p.color}35`, background: `linear-gradient(135deg, ${p.color}12, ${p.color}06)` }}>
                          <button onClick={() => {
                            const u = allPlayers.filter(x => x.username !== p.username);
                            allPlayersRef.current = u; setAllPlayers(u);
                          }}
                            className="absolute top-1.5 left-1.5 w-5 h-5 rounded-full items-center justify-center hidden group-hover:flex bg-red-500/20 hover:bg-red-500/60 text-red-400 z-10">
                            <X size={10} />
                          </button>
                          <div className="relative">
                            <div className="absolute inset-0 rounded-full blur-md opacity-50"
                              style={{ background: p.color, transform: "scale(1.1)" }} />
                            <div className="relative w-16 h-16 rounded-full overflow-hidden border-2"
                              style={{ borderColor: p.color, boxShadow: `0 0 14px ${p.color}55` }}>
                              <img src={p.avatar} alt={p.displayName} className="w-full h-full object-cover"
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
                  </div>
                )}
              </div>

              {allPlayers.length > 0 && (
                <p className="text-purple-400/40 text-sm font-bold">{allPlayers.length} لاعب في اللوبي</p>
              )}

              <AnimatePresence>
                {allPlayers.length >= 2 && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.8 }} transition={{ type: "spring", stiffness: 260, damping: 22 }}>
                    <motion.button onClick={handleStartGame}
                      animate={{ scale: [1, 1.03, 1], boxShadow: ["0 0 30px #22c55e55","0 0 60px #22c55e88","0 0 30px #22c55e55"] }}
                      transition={{ repeat: Infinity, duration: 2 }}
                      whileHover={{ scale: 1.07 }} whileTap={{ scale: 0.96 }}
                      className="flex items-center gap-3 px-14 py-5 rounded-3xl font-black text-2xl text-white"
                      style={{ background: "linear-gradient(135deg, #16a34a, #22c55e, #4ade80)" }}>
                      <Play size={26} fill="white" /> بدء اللعبة ({allPlayers.length})
                    </motion.button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}

        {/* ══════════════════════ VOTING ═════════════════════════════════ */}
        {phase === "voting" && (
          <motion.div key="voting"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="relative z-10 min-h-screen flex flex-col">

            {/* ── Top bar ── */}
            <div className="flex-shrink-0 px-5 pt-4 pb-2 flex items-center justify-between">
              <h1 className="font-black text-2xl" style={{ color: "#22c55e", textShadow: "0 0 20px #22c55e60" }}>
                حرب الفواكه 🍉
              </h1>
              <div className="flex items-center gap-3">
                <span className="text-purple-300/50 text-sm font-bold">الجولة {round}</span>
                <span className="text-purple-300/30 text-sm font-bold">•</span>
                <span className="text-purple-300/50 text-sm font-bold">{activePlayers.length} لاعب</span>
              </div>
            </div>

            {/* ── Timer bar ── */}
            <div className="flex-shrink-0 px-5 mb-3">
              <div className="flex items-center gap-3 mb-1.5">
                <motion.span className="font-black text-3xl tabular-nums"
                  key={timeLeft}
                  animate={{ scale: timeLeft <= 10 ? [1, 1.2, 1] : 1 }}
                  transition={{ duration: 0.4 }}
                  style={{ color: timerColor, textShadow: `0 0 16px ${timerColor}80`, minWidth: "2.5rem" }}>
                  {timeLeft}
                </motion.span>
                <div className="flex-1 h-3 rounded-full overflow-hidden"
                  style={{ background: "rgba(255,255,255,0.08)" }}>
                  <motion.div className="h-full rounded-full"
                    animate={{ width: `${timerPct}%` }}
                    transition={{ duration: 0.9, ease: "linear" }}
                    style={{ background: `linear-gradient(90deg, ${timerColor}aa, ${timerColor})` }} />
                </div>
                <span className="text-purple-400/40 text-xs font-bold whitespace-nowrap">
                  {votedCount}/{totalVoters} صوتوا
                </span>
              </div>
              {/* Instruction */}
              <p className="text-center text-purple-300/40 text-xs font-bold">
                اكتب اسم الفاكهة في الشات للتصويت عليها
              </p>
            </div>

            {/* ── Fruit cards grid ── */}
            <div className="flex-1 overflow-y-auto px-5 pb-6">
              <div className="grid gap-4 justify-center"
                style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
                {cards.map((card) => {
                  const cardVotes = getCardVotes(card.emoji);
                  const maxV = Math.max(...cards.map(c => getCardVotes(c.emoji)));
                  const isLeading = cardVotes > 0 && cardVotes === maxV;
                  return (
                    <motion.div key={card.emoji}
                      layout
                      className="relative rounded-2xl overflow-hidden flex flex-col items-center gap-3 p-4"
                      style={{
                        background: isLeading
                          ? "rgba(239,68,68,0.12)"
                          : "rgba(10,4,24,0.88)",
                        border: isLeading
                          ? "2px solid rgba(239,68,68,0.55)"
                          : "2px solid rgba(34,197,94,0.18)",
                        boxShadow: isLeading ? "0 0 24px rgba(239,68,68,0.25)" : "none",
                      }}>

                      {/* Vote count badge */}
                      {cardVotes > 0 && (
                        <motion.div
                          key={cardVotes}
                          initial={{ scale: 0.5 }} animate={{ scale: 1 }}
                          className="absolute top-2 left-2 w-6 h-6 rounded-full flex items-center justify-center font-black text-xs"
                          style={{
                            background: isLeading ? "#ef4444" : "rgba(139,92,246,0.6)",
                            color: "white",
                            boxShadow: isLeading ? "0 0 10px #ef444480" : "none",
                          }}>
                          {cardVotes}
                        </motion.div>
                      )}

                      {/* Leading indicator */}
                      {isLeading && (
                        <motion.div
                          animate={{ opacity: [0.6, 1, 0.6] }} transition={{ repeat: Infinity, duration: 0.9 }}
                          className="absolute top-2 right-2 text-sm">🎯</motion.div>
                      )}

                      {/* Fruit emoji — main visual */}
                      <motion.span
                        animate={isLeading ? { scale: [1, 1.08, 1] } : {}}
                        transition={{ repeat: Infinity, duration: 1.2 }}
                        style={{ fontSize: "clamp(48px, 8vw, 72px)", lineHeight: 1 }}>
                        {card.emoji}
                      </motion.span>

                      {/* Fruit name */}
                      <p className="font-black text-base text-white/90">{card.name}</p>

                      {/* Vote bar */}
                      <div className="w-full h-1.5 rounded-full overflow-hidden"
                        style={{ background: "rgba(255,255,255,0.08)" }}>
                        {totalVoters > 0 && (
                          <motion.div className="h-full rounded-full"
                            animate={{ width: `${(cardVotes / totalVoters) * 100}%` }}
                            transition={{ duration: 0.4 }}
                            style={{ background: isLeading ? "#ef4444" : "#22c55e" }} />
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}

        {/* ══════════════════════ WINNER ═════════════════════════════════ */}
        {phase === "winner" && winner && (
          <motion.div key="winner"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="relative z-10 min-h-screen flex flex-col items-center justify-center gap-8 px-6 text-center">

            {/* Confetti particles */}
            {[...Array(16)].map((_, i) => (
              <motion.div key={i} className="absolute rounded-full pointer-events-none"
                style={{
                  width: Math.random() * 10 + 4, height: Math.random() * 10 + 4,
                  background: COLORS[i % COLORS.length],
                  left: `${(i * 31 + 7) % 95}%`, top: `${(i * 47 + 5) % 90}%`,
                  filter: "blur(0.5px)",
                }}
                animate={{ y: [0, -40, 0, 30, 0], opacity: [0.2, 1, 0.3, 0.9, 0.2], scale: [1, 1.5, 0.8, 1.3, 1] }}
                transition={{ duration: 2 + (i % 4) * 0.6, repeat: Infinity, delay: i * 0.2 }} />
            ))}

            <motion.div initial={{ scale: 0, y: -50 }} animate={{ scale: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 220, damping: 16 }}
              style={{ fontSize: 100, lineHeight: 1, filter: "drop-shadow(0 0 30px gold)" }}>
              🏆
            </motion.div>

            <div className="relative flex items-center justify-center" style={{ width: 180, height: 180 }}>
              {[1, 2, 3].map(r => (
                <motion.div key={r}
                  className="absolute rounded-full"
                  style={{ width: 80 + r * 40, height: 80 + r * 40, border: `2px solid ${winner.color}` }}
                  animate={{ scale: [1, 1.08, 1], opacity: [0.4 / r, 0.8 / r, 0.4 / r] }}
                  transition={{ repeat: Infinity, duration: 2 + r * 0.4, delay: r * 0.2 }} />
              ))}
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 280, damping: 18, delay: 0.3 }}
                className="relative w-28 h-28 rounded-full overflow-hidden border-4"
                style={{ borderColor: winner.color, boxShadow: `0 0 50px ${winner.color}90` }}>
                <img src={winner.avatar} alt={winner.displayName} className="w-full h-full object-cover"
                  onError={e => { (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${winner.username}`; }} />
              </motion.div>
            </div>

            <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
              <p className="text-purple-300/50 text-sm font-bold mb-2">الفائز النهائي</p>
              <h1 className="font-black" style={{
                fontSize: "clamp(2.5rem,7vw,4.5rem)",
                color: winner.color,
                textShadow: `0 0 40px ${winner.color}, 0 0 80px ${winner.color}50`,
                lineHeight: 1.1,
              }}>
                {winner.displayName}
              </h1>
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }}
                className="text-2xl font-bold text-white/50 mt-2">
                فاز باللعبة 🎉
              </motion.p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9 }}
              className="flex items-center gap-4 flex-wrap justify-center">

              {/* إعادة جولة */}
              <motion.button onClick={handleReplay}
                whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.96 }}
                className="flex items-center gap-3 px-10 py-4 rounded-2xl font-black text-xl text-white"
                style={{ background: "linear-gradient(135deg, #16a34a, #22c55e)", boxShadow: "0 0 35px #22c55e55" }}>
                <Play size={22} fill="white" /> إعادة جولة
              </motion.button>

              {/* خروج */}
              <motion.button onClick={() => navigate("/")}
                whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.96 }}
                className="flex items-center gap-3 px-10 py-4 rounded-2xl font-black text-xl"
                style={{
                  background: "rgba(255,255,255,0.06)",
                  border: "2px solid rgba(255,255,255,0.15)",
                  color: "rgba(255,255,255,0.55)",
                }}>
                <ArrowRight size={22} /> خروج
              </motion.button>
            </motion.div>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}
