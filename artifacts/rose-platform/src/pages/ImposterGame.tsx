import { useState, useRef, useCallback, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Copy, Check, Users, Clock, SkipForward } from "lucide-react";

// ─── WS URL ───────────────────────────────────────────────────────────────────
function getWsUrl(): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/ws`;
}

function avatar(seed: string) {
  return `https://api.dicebear.com/7.x/pixel-art/svg?seed=${encodeURIComponent(seed)}`;
}

function fmt(ms: number): string {
  const s = Math.ceil(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

// ─── Types ────────────────────────────────────────────────────────────────────
type Mode = "host" | "player";
type ClientPhase =
  | "connecting" | "create" | "lobby"
  | "join" | "waiting"
  | "role_reveal" | "playing_wait"
  | "playing_ask" | "playing_answer"
  | "voting" | "result";

interface PublicPlayer {
  id: string; name: string; avatar: string;
  connected: boolean; voted: boolean; disconnected: boolean;
}
interface GameState {
  code: string;
  phase: "lobby" | "playing" | "voting" | "result";
  players: PublicPlayer[];
  playerOrder: string[];
  currentTurnIdx: number;
  currentTurnId: string | null;
  currentTargetId: string | null;
  lastAnswer: { targetId: string; answer: string } | null;
  gameRemaining: number;
  turnRemaining: number;
}
interface Role { role: "imposter" | "player"; word?: string }
interface Result { imposterName: string; imposterId: string; word: string; winner: "players" | "imposter"; votes: Record<string,string>; counts: Record<string,number> }

const COLORS = [
  "#e040fb","#00e5ff","#ffd600","#ff6d00",
  "#22c55e","#f43f5e","#a78bfa","#fb923c",
  "#38bdf8","#4ade80","#facc15","#f87171",
];
function playerColor(idx: number) { return COLORS[idx % COLORS.length]; }

// ─── Component ────────────────────────────────────────────────────────────────
export default function ImposterGame() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const roomParam = params.get("room")?.toUpperCase() ?? "";

  const mode: Mode = roomParam ? "player" : "host";

  const wsRef = useRef<WebSocket | null>(null);
  const [wsReady, setWsReady] = useState(false);

  // shared state
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // host state
  const [roomCode, setRoomCode] = useState<string>(roomParam);

  // player state
  const [playerName, setPlayerName] = useState("");
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<Role | null>(null);
  const [isMyTurn, setIsMyTurn] = useState(false);
  const [needAnswer, setNeedAnswer] = useState(false);

  // timers
  const [gameRemaining, setGameRemaining] = useState(0);
  const [turnRemaining, setTurnRemaining] = useState(0);

  // refs for callbacks
  const playerIdRef = useRef<string | null>(null);
  const gameStateRef = useRef<GameState | null>(null);

  useEffect(() => { playerIdRef.current = playerId; }, [playerId]);
  useEffect(() => { gameStateRef.current = gameState; }, [gameState]);

  // ── WS connection ──────────────────────────────────────────────────────────
  const wsSend = useCallback((msg: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN)
      wsRef.current.send(JSON.stringify(msg));
  }, []);

  const connectWs = useCallback(() => {
    const ws = new WebSocket(getWsUrl());
    wsRef.current = ws;

    ws.onopen = () => {
      setWsReady(true);
      if (mode === "host") {
        ws.send(JSON.stringify({ type: "imposter:create" }));
      }
    };

    ws.onclose = () => { setWsReady(false); };

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string);

        if (msg.type === "imposter:created") {
          setRoomCode(msg.code);
        }

        if (msg.type === "imposter:joined") {
          setPlayerId(msg.playerId);
          playerIdRef.current = msg.playerId;
        }

        if (msg.type === "imposter:state") {
          const gs = msg as GameState;
          setGameState(gs);
          setGameRemaining(gs.gameRemaining);
          setTurnRemaining(gs.turnRemaining);
        }

        if (msg.type === "imposter:timer") {
          setGameRemaining(msg.gameRemaining);
          setTurnRemaining(msg.turnRemaining);
        }

        if (msg.type === "imposter:role") {
          setMyRole({ role: msg.role, word: msg.word ?? undefined });
        }

        if (msg.type === "imposter:your_turn") {
          setIsMyTurn(true);
          setNeedAnswer(false);
        }

        if (msg.type === "imposter:answer_now") {
          setNeedAnswer(true);
          setIsMyTurn(false);
        }

        if (msg.type === "imposter:answered") {
          setNeedAnswer(false);
        }

        if (msg.type === "imposter:result") {
          setResult(msg as Result);
        }

        if (msg.type === "imposter:removed") {
          setError("تم إزالتك من الغرفة من قِبل المضيف");
        }

        if (msg.type === "imposter:host_left") {
          setError("المضيف غادر الغرفة");
        }

        if (msg.type === "imposter:error") {
          setError(msg.message);
        }
      } catch { /* ignore */ }
    };
  }, [mode]);

  useEffect(() => {
    connectWs();
    return () => { wsRef.current?.close(); };
  }, [connectWs]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleJoin = () => {
    const name = playerName.trim();
    if (!name || !roomParam) return;
    wsSend({
      type: "imposter:join",
      room: roomParam,
      name,
      avatar: avatar(name),
    });
  };

  const handleStart = () => wsSend({ type: "imposter:start" });
  const handleForceVote = () => wsSend({ type: "imposter:force_vote" });
  const handleNewRound = () => {
    setResult(null); setMyRole(null);
    setIsMyTurn(false); setNeedAnswer(false);
    wsSend({ type: "imposter:new_round" });
  };

  const handleSelectTarget = (targetId: string) => {
    wsSend({ type: "imposter:select_target", targetId });
    setIsMyTurn(false);
  };

  const handleAnswer = (ans: "yes" | "no") => {
    wsSend({ type: "imposter:answer", answer: ans });
    setNeedAnswer(false);
  };

  const handleVote = (targetId: string) => {
    wsSend({ type: "imposter:vote", voterId: playerIdRef.current, targetId });
  };

  const handleRemovePlayer = (pid: string) => {
    wsSend({ type: "imposter:remove_player", playerId: pid });
  };

  const copyLink = () => {
    const url = `${window.location.origin}${window.location.pathname}?room=${roomCode}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── Derived ──────────────────────────────────────────────────────────────
  const phase = gameState?.phase ?? "lobby";
  const players = gameState?.players ?? [];
  const currentTurnId = gameState?.currentTurnId;
  const currentTargetId = gameState?.currentTargetId;
  const myPlayer = players.find(p => p.id === playerId);
  const currentTurnPlayer = players.find(p => p.id === currentTurnId);
  const targetPlayer = currentTargetId ? players.find(p => p.id === currentTargetId) : null;

  // ────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ────────────────────────────────────────────────────────────────────────────
  const base = "min-h-screen gradient-bg relative overflow-hidden";
  const font = { fontFamily: "'Cairo', sans-serif" };
  const neonPurple = "#e040fb";
  const neonCyan = "#00e5ff";

  // ── Error screen ──────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className={`${base} flex items-center justify-center`} dir="rtl" style={font}>
        <div className="text-center flex flex-col items-center gap-6">
          <span style={{ fontSize: 64 }}>⚠️</span>
          <p className="text-xl font-black text-red-400">{error}</p>
          <button onClick={() => navigate("/")}
            className="px-8 py-3 rounded-2xl font-black text-white"
            style={{ background: "linear-gradient(135deg,#7c3aed,#e040fb)" }}>
            العودة للرئيسية
          </button>
        </div>
      </div>
    );
  }

  // ── Connecting ─────────────────────────────────────────────────────────────
  if (!wsReady && !roomCode) {
    return (
      <div className={`${base} flex items-center justify-center`} dir="rtl" style={font}>
        <div className="animate-spin w-12 h-12 border-2 border-purple-400/30 border-t-purple-400 rounded-full" />
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // HOST VIEW
  // ══════════════════════════════════════════════════════════════════════════
  if (mode === "host") {
    return (
      <div className={`${base}`} dir="rtl" style={font}>
        {/* Particles */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {[...Array(12)].map((_, i) => (
            <motion.div key={i} className="absolute rounded-full"
              style={{ width: 2, height: 2, background: i % 2 === 0 ? neonPurple : neonCyan,
                left: `${Math.random()*100}%`, top: `${Math.random()*100}%` }}
              animate={{ opacity: [0.1, 0.6, 0.1] }}
              transition={{ duration: 3+Math.random()*2, repeat: Infinity, delay: Math.random()*2 }} />
          ))}
        </div>

        <div className="relative z-10 flex flex-col min-h-screen px-4 py-6" style={{ gap: 16 }}>

          {/* Top bar */}
          <div className="flex items-center justify-between">
            <button onClick={() => navigate("/")}
              className="flex items-center gap-2 text-purple-400/50 hover:text-purple-300 text-sm font-bold transition-colors">
              <ArrowRight size={15} /> الرئيسية
            </button>
            <h1 className="text-xl font-black" style={{ color: neonPurple, textShadow: `0 0 20px ${neonPurple}60` }}>
              🕵️ لعبة الكذابين
            </h1>
            {phase === "playing" && (
              <div className="flex items-center gap-2">
                <Clock size={14} className="text-purple-400/60" />
                <span className="text-sm font-black" style={{ color: gameRemaining < 60_000 ? "#ef4444" : neonCyan }}>
                  {fmt(gameRemaining)}
                </span>
              </div>
            )}
            {phase !== "playing" && <div style={{ width: 80 }} />}
          </div>

          <AnimatePresence mode="wait">

            {/* ── HOST LOBBY ── */}
            {phase === "lobby" && (
              <motion.div key="host-lobby" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="flex flex-col items-center gap-5 flex-1">

                {/* Room code */}
                {roomCode && (
                  <motion.div className="flex flex-col items-center gap-3 p-5 rounded-3xl w-full max-w-sm"
                    style={{ background: "rgba(10,4,24,0.92)", border: `2px solid ${neonPurple}40` }}
                    initial={{ y: -10, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
                    <p className="text-xs font-bold text-purple-400/60">رمز الغرفة</p>
                    <p className="text-6xl font-black tracking-widest" style={{ color: neonPurple, textShadow: `0 0 30px ${neonPurple}80` }}>
                      {roomCode}
                    </p>
                    <button onClick={copyLink}
                      className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-black transition-all"
                      style={{ background: copied ? "#22c55e20" : `${neonCyan}15`, border: `1px solid ${copied ? "#22c55e50" : `${neonCyan}40`}`, color: copied ? "#22c55e" : neonCyan }}>
                      {copied ? <Check size={14}/> : <Copy size={14}/>}
                      {copied ? "تم النسخ!" : "نسخ رابط الانضمام"}
                    </button>
                    <p className="text-[10px] text-purple-400/35 text-center">
                      شارك الرمز مع اللاعبين ليدخلوا من هواتفهم
                    </p>
                  </motion.div>
                )}

                {/* Players */}
                <div className="w-full max-w-2xl flex-1">
                  {players.length === 0 ? (
                    <motion.p animate={{ opacity: [0.3, 0.65, 0.3] }} transition={{ repeat: Infinity, duration: 2 }}
                      className="text-center text-purple-400/35 text-sm py-16">
                      في انتظار اللاعبين... 👀
                    </motion.p>
                  ) : (
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                      <AnimatePresence>
                        {players.map((p, i) => (
                          <motion.div key={p.id}
                            initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.5 }}
                            transition={{ type: "spring", stiffness: 260, damping: 22 }}
                            className="relative flex flex-col items-center gap-2 p-3 rounded-2xl group"
                            style={{ border: `2px solid ${playerColor(i)}35`, background: playerColor(i) + "0d" }}>
                            <button onClick={() => handleRemovePlayer(p.id)}
                              className="absolute top-1 left-1 w-5 h-5 rounded-full hidden group-hover:flex items-center justify-center bg-red-500/20 hover:bg-red-500/50 text-red-400 text-xs font-black">
                              ✕
                            </button>
                            <div className="w-12 h-12 rounded-xl overflow-hidden border-2"
                              style={{ borderColor: playerColor(i), boxShadow: `0 0 10px ${playerColor(i)}40` }}>
                              <img src={p.avatar} alt={p.name} className="w-full h-full object-cover" />
                            </div>
                            <p className="text-xs font-black truncate w-full text-center" style={{ color: playerColor(i) }}>
                              {p.name}
                            </p>
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </div>
                  )}
                </div>

                {/* Start button */}
                <motion.button onClick={handleStart}
                  disabled={players.length < 3}
                  className="px-14 py-4 rounded-2xl text-white font-black text-xl btn-shimmer disabled:opacity-25 disabled:cursor-not-allowed"
                  style={{ background: "linear-gradient(135deg,#7c3aed,#e040fb)", boxShadow: players.length >= 3 ? `0 6px 32px ${neonPurple}55` : "none" }}
                  whileHover={players.length >= 3 ? { scale: 1.05 } : {}}
                  whileTap={players.length >= 3 ? { scale: 0.97 } : {}}>
                  بدء اللعبة ({players.length})
                </motion.button>
              </motion.div>
            )}

            {/* ── HOST PLAYING ── */}
            {phase === "playing" && (
              <motion.div key="host-playing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="flex flex-col gap-4 flex-1">

                {/* Turn info */}
                <div className="rounded-2xl p-4 flex flex-col items-center gap-3"
                  style={{ background: "rgba(10,4,24,0.90)", border: `1px solid ${neonPurple}30` }}>
                  {currentTurnPlayer && (
                    <>
                      <p className="text-xs text-purple-400/50 font-bold">يسأل الآن</p>
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl overflow-hidden border-2"
                          style={{ borderColor: neonPurple, boxShadow: `0 0 16px ${neonPurple}60` }}>
                          <img src={currentTurnPlayer.avatar} alt={currentTurnPlayer.name} className="w-full h-full object-cover" />
                        </div>
                        <p className="text-xl font-black" style={{ color: neonPurple }}>{currentTurnPlayer.name}</p>
                      </div>
                      {targetPlayer && (
                        <div className="flex items-center gap-2 px-4 py-2 rounded-xl"
                          style={{ background: `${neonCyan}15`, border: `1px solid ${neonCyan}40` }}>
                          <p className="text-xs text-purple-400/60">يسأل</p>
                          <img src={targetPlayer.avatar} alt={targetPlayer.name} className="w-6 h-6 rounded-lg" />
                          <p className="text-sm font-black" style={{ color: neonCyan }}>{targetPlayer.name}</p>
                        </div>
                      )}
                    </>
                  )}
                  {!currentTurnPlayer && (
                    <p className="text-purple-400/50 text-sm">في انتظار الدور...</p>
                  )}

                  {/* Turn timer */}
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)", width: 180 }}>
                      <motion.div className="h-full rounded-full"
                        style={{ background: turnRemaining < 15_000 ? "#ef4444" : neonCyan }}
                        animate={{ width: `${(turnRemaining / 60_000) * 100}%` }}
                        transition={{ duration: 0.5 }} />
                    </div>
                    <span className="text-xs font-black" style={{ color: turnRemaining < 15_000 ? "#ef4444" : neonCyan }}>
                      {fmt(turnRemaining)}
                    </span>
                  </div>
                </div>

                {/* Players grid */}
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 flex-1">
                  {players.map((p, i) => {
                    const isCur = p.id === currentTurnId;
                    const isTgt = p.id === currentTargetId;
                    return (
                      <div key={p.id} className="flex flex-col items-center gap-1.5 p-2 rounded-xl"
                        style={{
                          background: isCur ? `${neonPurple}15` : isTgt ? `${neonCyan}12` : "rgba(10,4,24,0.70)",
                          border: `2px solid ${isCur ? neonPurple : isTgt ? neonCyan : playerColor(i) + "25"}`,
                          boxShadow: isCur ? `0 0 16px ${neonPurple}40` : isTgt ? `0 0 14px ${neonCyan}35` : "none",
                        }}>
                        <div className="w-10 h-10 rounded-lg overflow-hidden border"
                          style={{ borderColor: isCur ? neonPurple : isTgt ? neonCyan : playerColor(i) + "50" }}>
                          <img src={p.avatar} alt={p.name} className="w-full h-full object-cover" />
                        </div>
                        <p className="text-[10px] font-black truncate w-full text-center"
                          style={{ color: isCur ? neonPurple : isTgt ? neonCyan : playerColor(i) }}>
                          {p.name}
                        </p>
                      </div>
                    );
                  })}
                </div>

                {/* Force vote */}
                <button onClick={handleForceVote}
                  className="flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold text-purple-400/30 hover:text-red-400 border border-purple-500/10 hover:border-red-400/30 transition-all">
                  <SkipForward size={12} /> التخطي للتصويت
                </button>
              </motion.div>
            )}

            {/* ── HOST VOTING ── */}
            {phase === "voting" && (
              <motion.div key="host-voting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="flex flex-col items-center gap-5 flex-1">
                <div className="text-center">
                  <p className="text-2xl font-black" style={{ color: "#ffd600", textShadow: "0 0 20px #ffd60080" }}>🗳️ وقت التصويت!</p>
                  <p className="text-sm text-purple-400/50 mt-1">اللاعبون يختارون من هو الكذاب</p>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 w-full max-w-2xl">
                  {players.map((p, i) => (
                    <div key={p.id} className="flex flex-col items-center gap-2 p-3 rounded-2xl"
                      style={{ background: "rgba(10,4,24,0.85)", border: `2px solid ${p.voted ? "#22c55e50" : playerColor(i) + "30"}`,
                        opacity: p.disconnected ? 0.4 : 1 }}>
                      <div className="w-11 h-11 rounded-xl overflow-hidden border-2"
                        style={{ borderColor: p.voted ? "#22c55e" : playerColor(i) + "60" }}>
                        <img src={p.avatar} alt={p.name} className="w-full h-full object-cover" />
                      </div>
                      <p className="text-[10px] font-black truncate w-full text-center" style={{ color: p.voted ? "#22c55e" : playerColor(i) }}>
                        {p.name}
                      </p>
                      <span className="text-[9px]" style={{ color: p.voted ? "#22c55e80" : "rgba(139,92,246,0.35)" }}>
                        {p.voted ? "✓ صوّت" : "ينتظر..."}
                      </span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* ── HOST RESULT ── */}
            {phase === "result" && result && (
              <ResultScreen result={result} players={players} onNewRound={handleNewRound} onHome={() => navigate("/")} isHost />
            )}

          </AnimatePresence>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PLAYER VIEW
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div className={`${base} flex flex-col items-center justify-center px-4`} dir="rtl" style={font}>
      {/* Particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(10)].map((_, i) => (
          <motion.div key={i} className="absolute rounded-full"
            style={{ width: 2, height: 2, background: i%2===0 ? neonPurple : neonCyan,
              left: `${Math.random()*100}%`, top: `${Math.random()*100}%` }}
            animate={{ opacity: [0.1, 0.5, 0.1] }}
            transition={{ duration: 3+Math.random()*2, repeat: Infinity, delay: Math.random()*2 }} />
        ))}
      </div>

      <div className="relative z-10 flex flex-col items-center w-full max-w-sm gap-5">
        <AnimatePresence mode="wait">

          {/* ── JOIN ── */}
          {!playerId && (
            <motion.div key="join" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="w-full flex flex-col items-center gap-6">
              <div className="text-center">
                <p className="text-4xl font-black mb-2" style={{ color: neonPurple, textShadow: `0 0 24px ${neonPurple}80` }}>
                  🕵️ الكذابون
                </p>
                <div className="px-4 py-1.5 rounded-full inline-block"
                  style={{ background: `${neonPurple}18`, border: `1px solid ${neonPurple}40` }}>
                  <span className="text-sm font-black" style={{ color: neonPurple }}>الغرفة: {roomParam}</span>
                </div>
              </div>
              <div className="w-full flex flex-col gap-3 p-6 rounded-3xl"
                style={{ background: "rgba(10,4,24,0.92)", border: `1px solid ${neonPurple}30` }}>
                <label className="text-xs font-bold text-purple-300/70">اسمك في اللعبة</label>
                <input value={playerName} onChange={e => setPlayerName(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleJoin()}
                  placeholder="أدخل اسمك..."
                  className="w-full bg-transparent border border-purple-500/30 rounded-xl px-4 py-3 text-white placeholder-purple-400/30 focus:outline-none focus:border-purple-400/60 text-sm text-right" />
                <motion.button onClick={handleJoin} disabled={!playerName.trim()}
                  className="w-full py-3.5 rounded-2xl font-black text-white text-base btn-shimmer disabled:opacity-30"
                  style={{ background: `linear-gradient(135deg,#7c3aed,${neonPurple})`, boxShadow: `0 4px 24px ${neonPurple}40` }}
                  whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                  انضم الآن 🎮
                </motion.button>
              </div>
            </motion.div>
          )}

          {/* ── WAITING IN LOBBY ── */}
          {playerId && phase === "lobby" && (
            <motion.div key="p-lobby" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-6 text-center">
              <motion.div animate={{ scale: [1, 1.08, 1], rotate: [0, 5, -5, 0] }}
                transition={{ repeat: Infinity, duration: 2 }}
                style={{ fontSize: 72 }}>🕵️</motion.div>
              <div>
                <p className="text-2xl font-black" style={{ color: neonPurple }}>
                  مرحباً {myPlayer?.name ?? playerName}!
                </p>
                <p className="text-purple-400/50 text-sm mt-1">في انتظار المضيف لبدء اللعبة...</p>
              </div>
              <div className="flex items-center gap-2 text-sm text-purple-400/40">
                <Users size={14} /> <span>{players.length} لاعب في الغرفة</span>
              </div>
            </motion.div>
          )}

          {/* ── ROLE REVEAL ── */}
          {playerId && phase === "playing" && myRole && !isMyTurn && !needAnswer && (() => {
            const isImposter = myRole.role === "imposter";
            return (
              <motion.div key="p-role" initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }}
                transition={{ type: "spring", stiffness: 200, damping: 18 }}
                className="w-full flex flex-col items-center gap-5 p-6 rounded-3xl text-center"
                style={{
                  background: isImposter ? "rgba(239,68,68,0.12)" : "rgba(34,197,94,0.12)",
                  border: `2px solid ${isImposter ? "#ef4444" : "#22c55e"}`,
                  boxShadow: `0 0 40px ${isImposter ? "#ef444430" : "#22c55e30"}`,
                }}>
                <motion.span animate={{ rotate: [0, -10, 10, 0] }} transition={{ repeat: Infinity, duration: 2 }}
                  style={{ fontSize: 72 }}>
                  {isImposter ? "🤥" : "🔍"}
                </motion.span>
                <div>
                  {isImposter ? (
                    <>
                      <p className="text-3xl font-black text-red-400">أنت الكذاب! 🤫</p>
                      <p className="text-sm text-red-300/60 mt-2">أجب على الأسئلة بذكاء بدون أن يكشفوك</p>
                    </>
                  ) : (
                    <>
                      <p className="text-xl font-black text-green-400 mb-3">أنت لاعب شريف ✅</p>
                      <div className="px-6 py-3 rounded-2xl"
                        style={{ background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.4)" }}>
                        <p className="text-xs text-green-400/60 mb-1">الكلمة السرية</p>
                        <p className="text-3xl font-black text-white">{myRole.word}</p>
                      </div>
                      <p className="text-xs text-green-300/50 mt-3">اكشف الكذاب الذي لا يعرف هذه الكلمة</p>
                    </>
                  )}
                </div>
                <p className="text-xs text-purple-400/35 mt-2">انتظر دورك...</p>
              </motion.div>
            );
          })()}

          {/* ── MY TURN: SELECT TARGET ── */}
          {playerId && phase === "playing" && isMyTurn && (
            <motion.div key="p-ask" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="w-full flex flex-col items-center gap-4">
              <motion.div animate={{ scale: [1, 1.1, 1] }} transition={{ repeat: Infinity, duration: 1 }}
                className="text-center">
                <p className="text-2xl font-black" style={{ color: neonPurple }}>دورك الآن! 🎯</p>
                <p className="text-sm text-purple-400/50 mt-1">اختر لاعباً لتسأله سؤالاً</p>
              </motion.div>
              <div className="grid grid-cols-2 gap-3 w-full">
                {players.filter(p => p.id !== playerId && !p.disconnected).map((p, i) => (
                  <motion.button key={p.id} onClick={() => handleSelectTarget(p.id)}
                    className="flex flex-col items-center gap-2 p-4 rounded-2xl"
                    style={{ background: "rgba(10,4,24,0.90)", border: `2px solid ${playerColor(i)}40` }}
                    whileHover={{ scale: 1.05, borderColor: playerColor(i) }}
                    whileTap={{ scale: 0.95 }}>
                    <div className="w-14 h-14 rounded-2xl overflow-hidden border-2"
                      style={{ borderColor: playerColor(i) }}>
                      <img src={p.avatar} alt={p.name} className="w-full h-full object-cover" />
                    </div>
                    <p className="text-sm font-black" style={{ color: playerColor(i) }}>{p.name}</p>
                  </motion.button>
                ))}
              </div>

              {/* Turn timer */}
              <div className="w-full flex items-center gap-2">
                <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
                  <motion.div className="h-full rounded-full"
                    style={{ background: turnRemaining < 15_000 ? "#ef4444" : neonPurple }}
                    animate={{ width: `${(turnRemaining/60_000)*100}%` }} transition={{ duration: 0.5 }} />
                </div>
                <span className="text-xs font-black" style={{ color: turnRemaining < 15_000 ? "#ef4444" : neonPurple }}>
                  {fmt(turnRemaining)}
                </span>
              </div>
            </motion.div>
          )}

          {/* ── ANSWER YES/NO ── */}
          {playerId && phase === "playing" && needAnswer && (
            <motion.div key="p-answer" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
              transition={{ type: "spring", stiffness: 220, damping: 20 }}
              className="w-full flex flex-col items-center gap-6 text-center">
              <motion.p animate={{ scale: [1, 1.05, 1] }} transition={{ repeat: Infinity, duration: 0.8 }}
                className="text-2xl font-black" style={{ color: "#ffd600" }}>
                وُجّه لك سؤال! 👈
              </motion.p>
              <p className="text-purple-400/60 text-sm">أجب بـ نعم أو لا فقط</p>
              <div className="flex gap-4 w-full">
                <motion.button onClick={() => handleAnswer("yes")}
                  className="flex-1 py-6 rounded-3xl text-3xl font-black text-white"
                  style={{ background: "linear-gradient(135deg,#16a34a,#22c55e)", boxShadow: "0 6px 30px #22c55e50" }}
                  whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.92 }}>
                  ✅ نعم
                </motion.button>
                <motion.button onClick={() => handleAnswer("no")}
                  className="flex-1 py-6 rounded-3xl text-3xl font-black text-white"
                  style={{ background: "linear-gradient(135deg,#dc2626,#ef4444)", boxShadow: "0 6px 30px #ef444450" }}
                  whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.92 }}>
                  ❌ لا
                </motion.button>
              </div>
            </motion.div>
          )}

          {/* ── VOTING ── */}
          {playerId && phase === "voting" && (
            <motion.div key="p-vote" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="w-full flex flex-col items-center gap-5">
              <div className="text-center">
                <p className="text-2xl font-black" style={{ color: "#ffd600", textShadow: "0 0 20px #ffd60080" }}>
                  🗳️ من هو الكذاب؟
                </p>
                <p className="text-sm text-purple-400/50 mt-1">اختر اللاعب الذي تعتقد أنه الكذاب</p>
              </div>

              {myPlayer?.voted ? (
                <div className="text-center p-6">
                  <p className="text-4xl mb-3">✅</p>
                  <p className="text-green-400 font-black">تم تسجيل صوتك!</p>
                  <p className="text-purple-400/40 text-sm mt-1">في انتظار باقي اللاعبين...</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 w-full">
                  {players.filter(p => p.id !== playerId && !p.disconnected).map((p, i) => (
                    <motion.button key={p.id} onClick={() => handleVote(p.id)}
                      className="flex flex-col items-center gap-2 p-4 rounded-2xl"
                      style={{ background: "rgba(10,4,24,0.90)", border: `2px solid ${playerColor(i)}35` }}
                      whileHover={{ scale: 1.05, borderColor: "#ef4444" }}
                      whileTap={{ scale: 0.95 }}>
                      <div className="w-12 h-12 rounded-xl overflow-hidden border-2"
                        style={{ borderColor: playerColor(i) + "70" }}>
                        <img src={p.avatar} alt={p.name} className="w-full h-full object-cover" />
                      </div>
                      <p className="text-xs font-black" style={{ color: playerColor(i) }}>{p.name}</p>
                    </motion.button>
                  ))}
                  <motion.button onClick={() => handleVote("skip")}
                    className="col-span-2 py-3 rounded-2xl font-bold text-sm text-purple-400/50 border border-purple-500/20 hover:text-purple-300 hover:border-purple-400/30 transition-all"
                    whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
                    تخطي ↩
                  </motion.button>
                </div>
              )}
            </motion.div>
          )}

          {/* ── RESULT (player) ── */}
          {phase === "result" && result && (
            <ResultScreen result={result} players={players} onNewRound={() => { setResult(null); setMyRole(null); setIsMyTurn(false); setNeedAnswer(false); }} onHome={() => navigate("/")} isHost={false} />
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}

// ─── Shared Result Screen ──────────────────────────────────────────────────────
function ResultScreen({ result, players, onNewRound, onHome, isHost }:
  { result: Result; players: PublicPlayer[]; onNewRound: () => void; onHome: () => void; isHost: boolean }) {
  const COLORS = ["#e040fb","#00e5ff","#ffd600","#ff6d00","#22c55e","#f43f5e","#a78bfa","#fb923c"];
  const playersWon = result.winner === "players";
  const imposterPlayer = players.find(p => p.id === result.imposterId);

  return (
    <motion.div key="result" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center px-4 text-center"
      style={{ background: "rgba(5,0,18,0.97)" }} dir="rtl">

      {/* Confetti particles */}
      {[...Array(16)].map((_, i) => (
        <motion.div key={i} className="absolute text-2xl pointer-events-none"
          style={{ left: `${Math.random() * 100}%`, top: "-10%" }}
          animate={{ y: "110vh", rotate: [0, 360], opacity: [1, 0] }}
          transition={{ duration: 2 + Math.random() * 2, delay: Math.random() * 1.5, repeat: Infinity }}>
          {["🎉","⭐","🕵️","💫","🎊","✨","🏆","🎈"][i % 8]}
        </motion.div>
      ))}

      <div className="relative z-10 flex flex-col items-center gap-6 max-w-sm w-full">
        <motion.div animate={{ rotate: [0, -10, 10, 0], y: [0, -10, 0] }}
          transition={{ duration: 0.8, delay: 0.2 }}
          style={{ fontSize: 72 }}>
          {playersWon ? "🏆" : "🤥"}
        </motion.div>

        <div>
          <p className="text-3xl font-black mb-1"
            style={{ color: playersWon ? "#22c55e" : "#ef4444", textShadow: `0 0 24px ${playersWon ? "#22c55e" : "#ef4444"}80` }}>
            {playersWon ? "اللاعبون فازوا! 🎉" : "الكذاب فاز! 🤥"}
          </p>
        </div>

        {/* Imposter reveal */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
          className="w-full p-5 rounded-3xl flex flex-col items-center gap-3"
          style={{ background: "rgba(10,4,24,0.92)", border: "2px solid rgba(239,68,68,0.5)" }}>
          <p className="text-xs font-bold text-red-400/70">الكذاب كان...</p>
          {imposterPlayer && (
            <div className="w-16 h-16 rounded-2xl overflow-hidden border-2"
              style={{ borderColor: "#ef4444", boxShadow: "0 0 24px rgba(239,68,68,0.5)" }}>
              <img src={imposterPlayer.avatar} alt={imposterPlayer.name} className="w-full h-full object-cover" />
            </div>
          )}
          <p className="text-2xl font-black text-red-400">{result.imposterName}</p>
          <div className="px-5 py-2 rounded-xl" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}>
            <p className="text-xs text-purple-400/50 mb-0.5">الكلمة كانت</p>
            <p className="text-xl font-black text-white">{result.word}</p>
          </div>
        </motion.div>

        <div className="flex gap-3 w-full">
          {isHost && (
            <motion.button onClick={onNewRound}
              className="flex-1 py-3 rounded-2xl font-black text-white text-sm btn-shimmer"
              style={{ background: "linear-gradient(135deg,#7c3aed,#e040fb)", boxShadow: "0 4px 20px rgba(224,64,251,0.4)" }}
              whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.97 }}>
              جولة جديدة 🔄
            </motion.button>
          )}
          <motion.button onClick={onHome}
            className="flex-1 py-3 rounded-2xl font-black text-purple-300 text-sm"
            style={{ background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.3)" }}
            whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.97 }}>
            الرئيسية
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}
