import { useState, useRef, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Wifi, WifiOff, Play, RotateCcw, X, Users, Trophy } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

// ─── Types ───────────────────────────────────────────────────────────────────
interface Player {
  username: string;
  displayName: string;
  avatar: string;
  color: string;
  eliminated: boolean;
  fruitId?: string;
}
interface FruitCard {
  id: string;
  name: string;
  emoji: string;
  playerId: string | null;
  votes: number;
  eliminated: boolean;
}
interface VoteRecord {
  voterUsername: string;
  fruitId: string;
}
type Phase = "settings" | "lobby" | "playing" | "reveal" | "winner";

// ─── Constants ───────────────────────────────────────────────────────────────
const PLAYER_COLORS = [
  "#e040fb","#00e5ff","#ffd600","#ff6d00",
  "#22c55e","#f43f5e","#a78bfa","#fb923c",
  "#38bdf8","#4ade80","#facc15","#f87171",
];

const ALL_FRUITS = [
  { name: "بطيخ",   emoji: "🍉" },
  { name: "فراولة", emoji: "🍓" },
  { name: "ليمون",  emoji: "🍋" },
  { name: "برتقال", emoji: "🍊" },
  { name: "عنب",    emoji: "🍇" },
  { name: "خوخ",    emoji: "🍑" },
  { name: "أناناس", emoji: "🍍" },
  { name: "مانجا",  emoji: "🥭" },
  { name: "تفاح",   emoji: "🍎" },
  { name: "موز",    emoji: "🍌" },
  { name: "كرز",    emoji: "🍒" },
  { name: "كيوي",   emoji: "🥝" },
  { name: "كمثرى",  emoji: "🍐" },
  { name: "توت",    emoji: "🫐" },
  { name: "تين",    emoji: "🍈" },
  { name: "جوافة",  emoji: "🍀" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function avatarUrl(username: string) {
  return `https://api.dicebear.com/7.x/pixel-art/svg?seed=${username}`;
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function FruitsGame() {
  const [, navigate] = useLocation();
  const { user } = useAuth();

  const [phase, setPhase] = useState<Phase>("settings");
  const [channel, setChannel] = useState("");
  const [voteThreshold, setVoteThreshold] = useState(3);
  const [connected, setConnected] = useState(false);

  const [players, setPlayers] = useState<Player[]>([]);
  const [fruits, setFruits] = useState<FruitCard[]>([]);
  const [votes, setVotes] = useState<VoteRecord[]>([]);
  const [recentVotes, setRecentVotes] = useState<{ voter: string; fruit: string; emoji: string }[]>([]);

  const [revealData, setRevealData] = useState<{ fruitName: string; emoji: string; playerName: string } | null>(null);
  const [winner, setWinner] = useState<Player | null>(null);

  // Refs for stale-closure safety
  const wsRef = useRef<WebSocket | null>(null);
  const phaseRef = useRef<Phase>("settings");
  const playersRef = useRef<Player[]>([]);
  const fruitsRef = useRef<FruitCard[]>([]);
  const votesRef = useRef<VoteRecord[]>([]);
  const thresholdRef = useRef(3);

  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { playersRef.current = players; }, [players]);
  useEffect(() => { fruitsRef.current = fruits; }, [fruits]);
  useEffect(() => { votesRef.current = votes; }, [votes]);
  useEffect(() => { thresholdRef.current = voteThreshold; }, [voteThreshold]);

  // ── Twitch IRC ──────────────────────────────────────────────────────────────
  const connectTwitch = useCallback((ch: string) => {
    if (wsRef.current) wsRef.current.close();
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

    ws.onmessage = (ev) => {
      const raw: string = ev.data;
      if (raw.startsWith("PING")) { ws.send("PONG :tmi.twitch.tv"); return; }
      const match = raw.match(/^:(\w+)!\w+@\S+ PRIVMSG #\S+ :(.+)$/);
      if (!match) return;
      const [, username, rawMsg] = match;
      const msg = rawMsg.trim().toLowerCase();
      const displayName = username;

      // ── JOIN command ─────────────────────────────────────────────────────
      if ((msg === "join" || msg === "انضم") && phaseRef.current === "lobby") {
        setPlayers(prev => {
          if (prev.some(p => p.username === username)) return prev;
          const color = PLAYER_COLORS[prev.length % PLAYER_COLORS.length];
          return [...prev, {
            username,
            displayName,
            avatar: avatarUrl(username),
            color,
            eliminated: false,
          }];
        });
        return;
      }

      // ── VOTE command (fruit name) ─────────────────────────────────────────
      if (phaseRef.current === "playing") {
        const activeFruits = fruitsRef.current.filter(f => !f.eliminated);
        const matched = activeFruits.find(f => f.name.toLowerCase() === msg || f.emoji === msg);
        if (!matched) return;

        // Check if this voter already voted this round
        const alreadyVoted = votesRef.current.some(v => v.voterUsername === username);
        if (alreadyVoted) return;

        const newVote: VoteRecord = { voterUsername: username, fruitId: matched.id };
        const newVotes = [...votesRef.current, newVote];
        votesRef.current = newVotes;
        setVotes(newVotes);

        setRecentVotes(prev => [
          { voter: displayName, fruit: matched.name, emoji: matched.emoji },
          ...prev.slice(0, 9),
        ]);

        // Update fruit vote count
        const updatedFruits = fruitsRef.current.map(f =>
          f.id === matched.id ? { ...f, votes: f.votes + 1 } : f
        );
        fruitsRef.current = updatedFruits;
        setFruits(updatedFruits);

        // Auto-eliminate if threshold reached
        const updatedFruit = updatedFruits.find(f => f.id === matched.id)!;
        if (updatedFruit.votes >= thresholdRef.current) {
          setTimeout(() => triggerEliminate(matched.id, updatedFruits), 400);
        }
      }
    };
  }, []);

  // ── Start ──────────────────────────────────────────────────────────────────
  const handleStart = () => {
    const ch = channel.trim().replace(/^#/, "");
    if (!ch) return;
    setPhase("lobby");
    phaseRef.current = "lobby";
    connectTwitch(ch);
  };

  // ── Begin game ─────────────────────────────────────────────────────────────
  const handleBeginGame = () => {
    const activePlayers = playersRef.current.filter(p => !p.eliminated);
    if (activePlayers.length < 2) return;

    const shuffledFruits = shuffle(ALL_FRUITS).slice(0, activePlayers.length);
    const fruitCards: FruitCard[] = shuffledFruits.map((f, i) => ({
      id: `fruit-${i}`,
      name: f.name,
      emoji: f.emoji,
      playerId: activePlayers[i].username,
      votes: 0,
      eliminated: false,
    }));

    // Assign fruit to player (hidden)
    const updatedPlayers = playersRef.current.map(p => {
      const card = fruitCards.find(f => f.playerId === p.username);
      return { ...p, fruitId: card?.id };
    });

    fruitsRef.current = fruitCards;
    votesRef.current = [];
    setFruits(fruitCards);
    setVotes([]);
    setRecentVotes([]);
    setPlayers(updatedPlayers);
    setPhase("playing");
    phaseRef.current = "playing";
  };

  // ── Eliminate ──────────────────────────────────────────────────────────────
  const triggerEliminate = useCallback((fruitId: string, currentFruits?: FruitCard[]) => {
    const source = currentFruits ?? fruitsRef.current;
    const fruit = source.find(f => f.id === fruitId);
    if (!fruit || fruit.eliminated) return;

    // Find the player assigned to this fruit
    const player = playersRef.current.find(p => p.fruitId === fruitId);

    // Mark fruit eliminated
    const newFruits = source.map(f =>
      f.id === fruitId ? { ...f, eliminated: true } : f
    );
    fruitsRef.current = newFruits;
    setFruits(newFruits);

    // Mark player eliminated
    if (player) {
      const newPlayers = playersRef.current.map(p =>
        p.username === player.username ? { ...p, eliminated: true } : p
      );
      playersRef.current = newPlayers;
      setPlayers(newPlayers);
    }

    // Reset votes for next round
    votesRef.current = [];
    setVotes([]);
    setRecentVotes([]);

    // Show reveal
    setRevealData({
      fruitName: fruit.name,
      emoji: fruit.emoji,
      playerName: player?.displayName ?? "مجهول",
    });
    setPhase("reveal");
    phaseRef.current = "reveal";
  }, []);

  // ── Eliminate highest voted (manual) ──────────────────────────────────────
  const handleManualEliminate = () => {
    const active = fruitsRef.current.filter(f => !f.eliminated);
    if (active.length === 0) return;
    const highest = active.reduce((a, b) => b.votes > a.votes ? b : a);
    triggerEliminate(highest.id);
  };

  // ── Continue after reveal ─────────────────────────────────────────────────
  const handleContinue = () => {
    const activeFruits = fruitsRef.current.filter(f => !f.eliminated);
    if (activeFruits.length <= 1) {
      // Find winner
      const winnerFruit = activeFruits[0];
      const winnerPlayer = winnerFruit
        ? playersRef.current.find(p => p.fruitId === winnerFruit.id) ?? null
        : null;
      setWinner(winnerPlayer);
      setPhase("winner");
      phaseRef.current = "winner";
    } else {
      setPhase("playing");
      phaseRef.current = "playing";
    }
  };

  // ── Rematch ────────────────────────────────────────────────────────────────
  const handleRematch = () => {
    const resetPlayers = playersRef.current.map(p => ({
      ...p,
      eliminated: false,
      fruitId: undefined,
    }));
    playersRef.current = resetPlayers;
    setPlayers(resetPlayers);
    fruitsRef.current = [];
    setFruits([]);
    votesRef.current = [];
    setVotes([]);
    setRecentVotes([]);
    setRevealData(null);
    setWinner(null);
    setPhase("lobby");
    phaseRef.current = "lobby";
  };

  const handleRemovePlayer = (username: string) => {
    const updated = playersRef.current.filter(p => p.username !== username);
    playersRef.current = updated;
    setPlayers(updated);
  };

  // ── Cleanup ────────────────────────────────────────────────────────────────
  useEffect(() => () => { wsRef.current?.close(); }, []);

  // ────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ────────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen gradient-bg relative overflow-hidden" dir="rtl"
      style={{ fontFamily: "'Cairo', sans-serif" }}>

      {/* Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(16)].map((_, i) => (
          <motion.div key={i} className="absolute rounded-full"
            style={{ width: Math.random() * 3 + 1, height: Math.random() * 3 + 1,
              background: i % 2 === 0 ? "#e040fb" : "#00e5ff",
              left: `${Math.random() * 100}%`, top: `${Math.random() * 100}%` }}
            animate={{ opacity: [0.15, 0.7, 0.15], scale: [1, 1.6, 1] }}
            transition={{ duration: Math.random() * 3 + 2, repeat: Infinity, delay: Math.random() * 2 }} />
        ))}
      </div>

      <AnimatePresence mode="wait">

        {/* ══════════════════ SETTINGS ══════════════════ */}
        {phase === "settings" && (
          <motion.div key="settings" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="relative z-10 flex flex-col items-center justify-center min-h-screen px-4 py-8 gap-6">

            {/* Back */}
            <button onClick={() => navigate("/")}
              className="absolute top-6 right-6 flex items-center gap-2 text-purple-400/60 hover:text-purple-300 transition-colors text-sm font-bold">
              <ArrowRight size={16} /> الرئيسية
            </button>

            {/* Logo */}
            <motion.img src="/fruits-hero.png" alt="حرب الفواكه"
              className="w-36 h-36 rounded-3xl object-cover"
              style={{ boxShadow: "0 0 40px #22c55e50" }}
              initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
              transition={{ type: "spring", stiffness: 200, damping: 20 }} />

            <div className="text-center">
              <h1 className="text-4xl font-black" style={{ color: "#22c55e", textShadow: "0 0 20px #22c55e80" }}>
                حرب الفواكه 🍉
              </h1>
              <p className="text-purple-300/60 mt-1 text-sm">صوّت لتقصي الفاكهة وافز باللعبة!</p>
            </div>

            {/* Settings card */}
            <motion.div className="w-full max-w-sm rounded-3xl p-6 flex flex-col gap-5"
              style={{ background: "rgba(10,4,24,0.92)", border: "1px solid rgba(34,197,94,0.3)", boxShadow: "0 8px 40px rgba(34,197,94,0.15)" }}
              initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.15 }}>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-bold text-purple-300/80">قناة Twitch</label>
                <input value={channel} onChange={e => setChannel(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleStart()}
                  placeholder="اسم القناة..."
                  className="w-full bg-transparent border border-purple-500/30 rounded-xl px-4 py-3 text-white placeholder-purple-400/30 focus:outline-none focus:border-green-400/60 transition-colors text-sm" />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-bold text-purple-300/80">
                  عدد الأصوات للإقصاء التلقائي
                </label>
                <div className="flex items-center gap-3">
                  <input type="range" min={1} max={10} value={voteThreshold}
                    onChange={e => setVoteThreshold(+e.target.value)}
                    className="flex-1 accent-green-400" />
                  <span className="text-2xl font-black w-8 text-center"
                    style={{ color: "#22c55e" }}>{voteThreshold}</span>
                </div>
                <p className="text-[11px] text-purple-400/40">عند وصول فاكهة لهذا العدد من الأصوات تُقصى تلقائياً</p>
              </div>

              <motion.button onClick={handleStart} disabled={!channel.trim()}
                className="w-full py-3.5 rounded-2xl text-white font-black text-lg btn-shimmer disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: "linear-gradient(135deg, #16a34a, #22c55e)", boxShadow: "0 4px 24px #22c55e40" }}
                whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                الانضمام إلى اللوبي 🎮
              </motion.button>
            </motion.div>
          </motion.div>
        )}

        {/* ══════════════════ LOBBY ══════════════════ */}
        {phase === "lobby" && (
          <motion.div key="lobby" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="relative z-10 flex flex-col items-center min-h-screen px-4 py-8 gap-6">

            {/* Header */}
            <div className="flex items-center justify-between w-full max-w-2xl">
              <button onClick={() => { wsRef.current?.close(); setPhase("settings"); }}
                className="flex items-center gap-2 text-purple-400/60 hover:text-purple-300 transition-colors text-sm font-bold">
                <ArrowRight size={16} /> رجوع
              </button>
              <div className="flex items-center gap-2">
                <motion.div animate={{ scale: connected ? [1, 1.3, 1] : 1 }}
                  transition={{ repeat: connected ? Infinity : 0, duration: 2 }}
                  className="w-2 h-2 rounded-full" style={{ background: connected ? "#22c55e" : "#ef4444" }} />
                {connected ? <Wifi size={14} className="text-green-400" /> : <WifiOff size={14} className="text-red-400" />}
                <span className="text-sm font-bold text-purple-300/70">#{channel}</span>
              </div>
            </div>

            <div className="text-center">
              <h2 className="text-3xl font-black" style={{ color: "#22c55e", textShadow: "0 0 20px #22c55e60" }}>
                لوبي حرب الفواكه 🍉
              </h2>
              <p className="text-purple-300/60 text-sm mt-1">اكتب <span className="text-green-400 font-black">join</span> أو <span className="text-green-400 font-black">انضم</span> في الشات للمشاركة</p>
            </div>

            {/* Players grid */}
            <div className="w-full max-w-2xl">
              {players.length === 0 ? (
                <motion.div animate={{ opacity: [0.4, 0.8, 0.4] }} transition={{ repeat: Infinity, duration: 2 }}
                  className="text-center text-purple-400/40 text-sm py-16">
                  في انتظار اللاعبين... 👀
                </motion.div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                  <AnimatePresence>
                    {players.map(p => (
                      <motion.div key={p.username}
                        initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.7 }}
                        transition={{ type: "spring", stiffness: 280, damping: 22 }}
                        className="relative flex flex-col items-center gap-2 p-3 rounded-2xl"
                        style={{ border: `2px solid ${p.color}40`, background: p.color + "10" }}>
                        {/* Remove button */}
                        <button onClick={() => handleRemovePlayer(p.username)}
                          className="absolute top-1.5 left-1.5 w-5 h-5 rounded-full flex items-center justify-center transition-opacity opacity-0 hover:opacity-100 bg-red-500/20 hover:bg-red-500/40 text-red-400">
                          <X size={10} />
                        </button>
                        <div className="w-12 h-12 rounded-xl overflow-hidden border-2"
                          style={{ borderColor: p.color }}>
                          <img src={p.avatar} alt={p.displayName} className="w-full h-full object-cover"
                            onError={e => { (e.target as HTMLImageElement).src = avatarUrl(p.username); }} />
                        </div>
                        <p className="text-xs font-black truncate w-full text-center"
                          style={{ color: p.color }}>{p.displayName}</p>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </div>

            {/* Start button */}
            <motion.button onClick={handleBeginGame}
              disabled={players.length < 2}
              className="px-12 py-4 rounded-2xl text-white font-black text-xl btn-shimmer disabled:opacity-30 disabled:cursor-not-allowed"
              style={{ background: "linear-gradient(135deg, #16a34a, #22c55e)", boxShadow: "0 6px 32px #22c55e50" }}
              whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.97 }}
              animate={players.length >= 2 ? { scale: [1, 1.03, 1] } : {}}
              transition={{ repeat: Infinity, duration: 2 }}>
              بدء اللعب 🎮 ({players.length} لاعب)
            </motion.button>
          </motion.div>
        )}

        {/* ══════════════════ PLAYING ══════════════════ */}
        {phase === "playing" && (
          <motion.div key="playing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="relative z-10 flex min-h-screen overflow-hidden" style={{ padding: "12px", gap: "12px" }}>

            {/* ── Sidebar (RTL: visual right) ── */}
            <div style={{ width: "200px", flexShrink: 0 }} className="flex flex-col gap-2.5 overflow-y-auto">

              {/* Connection */}
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
                style={{ background: "rgba(10,4,24,0.85)", border: "1px solid rgba(34,197,94,0.2)" }}>
                <motion.div animate={{ scale: connected ? [1, 1.4, 1] : 1 }}
                  transition={{ repeat: connected ? Infinity : 0, duration: 2 }}
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: connected ? "#22c55e" : "#ef4444" }} />
                <span className="text-[10px] font-bold truncate"
                  style={{ color: connected ? "#22c55e" : "#ef4444" }}>#{channel}</span>
              </div>

              {/* Vote log */}
              <div className="rounded-xl overflow-hidden flex-1"
                style={{ background: "rgba(10,4,24,0.85)", border: "1px solid rgba(139,92,246,0.2)" }}>
                <div className="px-3 py-2 border-b border-purple-500/15">
                  <span className="text-[10px] font-black text-purple-400/50">الأصوات الأخيرة</span>
                </div>
                <div className="flex flex-col gap-0 overflow-y-auto" style={{ maxHeight: "200px" }}>
                  <AnimatePresence>
                    {recentVotes.length === 0 ? (
                      <p className="text-[10px] text-purple-400/30 text-center py-4">في انتظار التصويت...</p>
                    ) : recentVotes.map((v, i) => (
                      <motion.div key={`${v.voter}-${i}`}
                        initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}
                        className="flex items-center gap-1.5 px-2.5 py-1.5"
                        style={{ borderBottom: "1px solid rgba(139,92,246,0.06)" }}>
                        <span className="text-base">{v.emoji}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-[9px] text-purple-400/50 truncate">{v.voter}</p>
                          <p className="text-[10px] font-bold text-white/70">{v.fruit}</p>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </div>

              {/* Players status */}
              <div className="rounded-xl overflow-hidden flex-shrink-0"
                style={{ background: "rgba(10,4,24,0.85)", border: "1px solid rgba(139,92,246,0.15)" }}>
                <div className="px-3 py-2 border-b border-purple-500/15">
                  <span className="text-[10px] font-black text-purple-400/50">اللاعبون</span>
                </div>
                {players.map(p => (
                  <div key={p.username} className="flex items-center gap-2 px-2.5 py-1.5"
                    style={{ borderBottom: "1px solid rgba(139,92,246,0.06)", opacity: p.eliminated ? 0.35 : 1 }}>
                    <div className="w-5 h-5 rounded-md overflow-hidden border flex-shrink-0"
                      style={{ borderColor: p.color + (p.eliminated ? "30" : "80") }}>
                      <img src={p.avatar} alt={p.displayName} className="w-full h-full object-cover"
                        onError={e => { (e.target as HTMLImageElement).src = avatarUrl(p.username); }} />
                    </div>
                    <span className="flex-1 text-[10px] font-bold truncate"
                      style={{ color: p.eliminated ? "#6b7280" : p.color }}>
                      {p.displayName}
                    </span>
                    {p.eliminated && <span className="text-[9px] text-red-400/60">مقصى</span>}
                  </div>
                ))}
              </div>

              {/* Manual eliminate button */}
              <motion.button onClick={handleManualEliminate}
                className="py-2 rounded-xl font-black text-xs"
                style={{ background: "linear-gradient(135deg, #dc2626aa, #ef4444aa)", border: "1px solid #ef444460", color: "#fff" }}
                whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
                ⚡ إقصاء الأعلى صوتاً
              </motion.button>

              <button onClick={handleRematch}
                className="flex items-center justify-center gap-1 py-1.5 rounded-xl text-purple-400/20 hover:text-purple-300/40 text-[9px] border border-purple-500/10 hover:border-purple-500/20 transition-all">
                <RotateCcw size={8} /> لعبة جديدة
              </button>
            </div>

            {/* ── Fruit grid ── */}
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="text-center mb-4">
                <h2 className="text-lg font-black" style={{ color: "#22c55e", textShadow: "0 0 16px #22c55e60" }}>
                  🍉 صوّت لإقصاء الفاكهة!
                </h2>
                <p className="text-xs text-purple-400/50">اكتب اسم الفاكهة في الشات — صوت واحد فقط لكل لاعب</p>
              </div>

              <div className="flex-1 overflow-y-auto">
                <div className="grid gap-3"
                  style={{ gridTemplateColumns: `repeat(auto-fill, minmax(130px, 1fr))` }}>
                  <AnimatePresence>
                    {fruits.filter(f => !f.eliminated).map(fruit => {
                      const pct = Math.min(100, (fruit.votes / voteThreshold) * 100);
                      return (
                        <motion.div key={fruit.id}
                          initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.5, rotate: -10 }}
                          transition={{ type: "spring", stiffness: 280, damping: 22 }}
                          layout
                          className="rounded-2xl p-4 flex flex-col items-center gap-2 relative overflow-hidden"
                          style={{
                            background: "rgba(10,4,24,0.90)",
                            border: `2px solid ${pct > 60 ? "#ef4444" : pct > 30 ? "#ffd600" : "rgba(34,197,94,0.3)"}`,
                            boxShadow: pct > 60 ? "0 0 20px rgba(239,68,68,0.3)" : "0 4px 16px rgba(0,0,0,0.3)",
                          }}>
                          {/* Vote bar */}
                          <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/5 rounded-b-2xl overflow-hidden">
                            <motion.div className="h-full rounded-full"
                              style={{ background: pct > 60 ? "#ef4444" : pct > 30 ? "#ffd600" : "#22c55e" }}
                              animate={{ width: `${pct}%` }}
                              transition={{ duration: 0.3 }} />
                          </div>

                          {/* Emoji */}
                          <motion.span className="text-5xl select-none"
                            animate={pct > 75 ? { scale: [1, 1.15, 1] } : {}}
                            transition={{ repeat: Infinity, duration: 0.6 }}>
                            {fruit.emoji}
                          </motion.span>

                          {/* Name */}
                          <p className="text-sm font-black text-white/90">{fruit.name}</p>

                          {/* Vote count */}
                          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full"
                            style={{ background: pct > 60 ? "rgba(239,68,68,0.2)" : "rgba(34,197,94,0.1)", border: `1px solid ${pct > 60 ? "#ef444440" : "#22c55e30"}` }}>
                            <span className="text-xs font-black" style={{ color: pct > 60 ? "#ef4444" : "#22c55e" }}>
                              {fruit.votes}/{voteThreshold}
                            </span>
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* ══════════════════ REVEAL ══════════════════ */}
        {phase === "reveal" && revealData && (
          <motion.div key="reveal" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex flex-col items-center justify-center"
            style={{ background: "rgba(5,0,18,0.97)" }}>

            <motion.div
              initial={{ scale: 0.3, rotate: -15, opacity: 0 }}
              animate={{ scale: 1, rotate: 0, opacity: 1 }}
              transition={{ type: "spring", stiffness: 200, damping: 18 }}
              className="flex flex-col items-center gap-8 text-center px-8">

              {/* Eliminated banner */}
              <div className="px-6 py-2 rounded-full font-black text-sm tracking-widest"
                style={{ background: "rgba(239,68,68,0.2)", border: "1px solid #ef444460", color: "#ef4444" }}>
                🚫 تم الإقصاء!
              </div>

              {/* Fruit */}
              <motion.span
                animate={{ scale: [1, 1.2, 1], rotate: [0, -5, 5, 0] }}
                transition={{ repeat: 3, duration: 0.4 }}
                style={{ fontSize: "100px", lineHeight: 1 }}>
                {revealData.emoji}
              </motion.span>

              <div>
                <p className="text-3xl font-black text-white mb-2">{revealData.fruitName}</p>
                <p className="text-purple-400/60 text-lg">كانت فاكهة...</p>
              </div>

              {/* Player reveal */}
              <motion.div
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}
                className="flex flex-col items-center gap-3">
                <div className="w-20 h-20 rounded-2xl overflow-hidden border-3"
                  style={{ border: "3px solid #e040fb", boxShadow: "0 0 30px #e040fb60" }}>
                  <img src={avatarUrl(
                    players.find(p => p.displayName === revealData.playerName)?.username ?? revealData.playerName
                  )} alt={revealData.playerName} className="w-full h-full object-cover" />
                </div>
                <p className="text-2xl font-black" style={{ color: "#e040fb", textShadow: "0 0 20px #e040fb80" }}>
                  {revealData.playerName}
                </p>
                <p className="text-purple-300/60">تم إقصاؤه من اللعبة</p>
              </motion.div>

              <motion.button onClick={handleContinue}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1 }}
                className="px-10 py-3.5 rounded-2xl font-black text-white text-lg btn-shimmer mt-4"
                style={{ background: "linear-gradient(135deg, #16a34a, #22c55e)", boxShadow: "0 6px 30px #22c55e50" }}
                whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.97 }}>
                {fruits.filter(f => !f.eliminated).length <= 1 ? "🏆 عرض الفائز" : "متابعة ▶"}
              </motion.button>
            </motion.div>
          </motion.div>
        )}

        {/* ══════════════════ WINNER ══════════════════ */}
        {phase === "winner" && (
          <motion.div key="winner" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden"
            style={{ background: "rgba(5,0,18,0.98)" }}>

            {/* Particles */}
            {[...Array(14)].map((_, i) => (
              <motion.div key={i} className="absolute text-2xl pointer-events-none"
                style={{ left: `${Math.random() * 100}%`, top: "-10%" }}
                animate={{ y: "120vh", rotate: [0, 360], opacity: [1, 0] }}
                transition={{ duration: Math.random() * 3 + 2, delay: Math.random() * 1.5, repeat: Infinity }}>
                {["🍉","🍓","🍋","🍊","🍇","🍑","🍍","🥭","🍎","🍌","🍒","🥝","🫐","🍐"][i]}
              </motion.div>
            ))}

            <div className="flex flex-col items-center gap-8 text-center px-8 relative z-10">
              <motion.div animate={{ rotate: [0, -10, 10, -10, 0], y: [0, -20, 0] }}
                transition={{ duration: 0.8, delay: 0.3 }}
                style={{ fontSize: "80px" }}>🏆</motion.div>

              <div>
                <p className="text-4xl font-black text-white mb-1">الفائز!</p>
              </div>

              {winner ? (
                <>
                  <motion.div
                    initial={{ scale: 0 }} animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.2 }}
                    className="relative">
                    {/* Glow rings */}
                    {[1.4, 1.2].map((s, i) => (
                      <motion.div key={i}
                        className="absolute inset-0 rounded-full"
                        animate={{ scale: [s, s + 0.1, s], opacity: [0.3, 0.6, 0.3] }}
                        transition={{ repeat: Infinity, duration: 1.5, delay: i * 0.4 }}
                        style={{ background: `radial-gradient(circle, ${winner.color}30, transparent)` }} />
                    ))}
                    <div className="w-28 h-28 rounded-3xl overflow-hidden relative"
                      style={{ border: `4px solid ${winner.color}`, boxShadow: `0 0 40px ${winner.color}80` }}>
                      <img src={winner.avatar} alt={winner.displayName} className="w-full h-full object-cover"
                        onError={e => { (e.target as HTMLImageElement).src = avatarUrl(winner.username); }} />
                    </div>
                  </motion.div>
                  <p className="text-3xl font-black"
                    style={{ color: winner.color, textShadow: `0 0 30px ${winner.color}80` }}>
                    {winner.displayName}
                  </p>
                </>
              ) : (
                <p className="text-2xl font-black text-purple-400/60">بقي الفائز مجهولاً 🤷</p>
              )}

              <div className="flex gap-3 mt-4">
                <motion.button onClick={handleRematch}
                  className="px-8 py-3 rounded-2xl font-black text-white text-base btn-shimmer"
                  style={{ background: "linear-gradient(135deg, #16a34a, #22c55e)", boxShadow: "0 4px 24px #22c55e40" }}
                  whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.97 }}>
                  <RotateCcw size={16} className="inline ml-2" />إعادة المباراة
                </motion.button>
                <motion.button onClick={() => navigate("/")}
                  className="px-8 py-3 rounded-2xl font-black text-purple-300 text-base"
                  style={{ background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.3)" }}
                  whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.97 }}>
                  الرئيسية
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}
