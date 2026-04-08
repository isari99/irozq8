import { useState, useRef, useCallback, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Copy, Check, Users, Clock, SkipForward, Lock, Unlock, Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

// ─── WS URL ───────────────────────────────────────────────────────────────────
function getWsUrl(): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/ws`;
}

function dicebear(seed: string) {
  return `https://api.dicebear.com/7.x/pixel-art/svg?seed=${encodeURIComponent(seed)}`;
}

function fmt(ms: number): string {
  const s = Math.ceil(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

// ─── Types ────────────────────────────────────────────────────────────────────
type Category = "دول" | "حيوانات" | "أكلات" | "أشياء" | "عام";
type Mode = "host" | "player";

interface QAEntry {
  askerId: string; askerName: string;
  targetId: string; targetName: string;
  question: string; answer: string | null; timedOut: boolean;
}
interface PublicPlayer {
  id: string; name: string; avatar: string;
  connected: boolean; voted: boolean; disconnected: boolean;
  eliminated: boolean;
  role: "host" | "player";
}
interface GameState {
  code: string; roomName: string; category: Category; durationMs: number;
  phase: "lobby" | "countdown" | "reveal" | "playing" | "voting" | "elimination" | "result";
  word: string;
  hostPlayerId: string;
  players: PublicPlayer[]; playerOrder: string[];
  currentTurnIdx: number; currentTurnId: string | null;
  currentTargetId: string | null; currentQuestion: string | null;
  qaHistory: QAEntry[];
  lastAnswer: { targetId: string; answer: string } | null;
  gameRemaining: number; turnRemaining: number;
}
interface Role { role: "imposter" | "player"; word?: string }
interface Result {
  imposterName: string; imposterId: string; word: string;
  winner: "players" | "imposter";
  votes: Record<string, string>; counts: Record<string, number>;
}
interface EliminationInfo {
  eliminatedId: string; eliminatedName: string;
  votes: Record<string, string>; counts: Record<string, number>;
}

const COLORS = [
  "#e040fb","#00e5ff","#ffd600","#ff6d00",
  "#22c55e","#f43f5e","#a78bfa","#fb923c",
  "#38bdf8","#4ade80","#facc15","#f87171",
];
function playerColor(idx: number) { return COLORS[idx % COLORS.length]; }

const neonPurple = "#e040fb";
const neonCyan   = "#00e5ff";
const font = { fontFamily: "'Cairo', sans-serif" };

// ─── Avatar Pool ──────────────────────────────────────────────────────────────
const AVATAR_POOL = [
  "https://api.dicebear.com/7.x/adventurer/svg?seed=Jasmine&backgroundColor=fecaca",
  "https://api.dicebear.com/7.x/adventurer/svg?seed=Mia&backgroundColor=fed7aa",
  "https://api.dicebear.com/7.x/adventurer/svg?seed=Leo&backgroundColor=fde68a",
  "https://api.dicebear.com/7.x/adventurer/svg?seed=Zara&backgroundColor=bbf7d0",
  "https://api.dicebear.com/7.x/adventurer/svg?seed=Omar&backgroundColor=bfdbfe",
  "https://api.dicebear.com/7.x/adventurer/svg?seed=Nora&backgroundColor=ddd6fe",
  "https://api.dicebear.com/7.x/adventurer/svg?seed=Max&backgroundColor=fda4af",
  "https://api.dicebear.com/7.x/adventurer/svg?seed=Sara&backgroundColor=fdba74",
  "https://api.dicebear.com/7.x/adventurer/svg?seed=Felix&backgroundColor=fcd34d",
  "https://api.dicebear.com/7.x/adventurer/svg?seed=Layla&backgroundColor=6ee7b7",
  "https://api.dicebear.com/7.x/adventurer/svg?seed=Amir&backgroundColor=93c5fd",
  "https://api.dicebear.com/7.x/adventurer/svg?seed=Luna&backgroundColor=c4b5fd",
  "https://api.dicebear.com/7.x/adventurer/svg?seed=Rami&backgroundColor=f9a8d4",
  "https://api.dicebear.com/7.x/adventurer/svg?seed=Dina&backgroundColor=fde47f",
  "https://api.dicebear.com/7.x/adventurer/svg?seed=Kareem&backgroundColor=a7f3d0",
  "https://api.dicebear.com/7.x/adventurer/svg?seed=Hana&backgroundColor=bae6fd",
  "https://api.dicebear.com/7.x/adventurer/svg?seed=Yusuf&backgroundColor=e9d5ff",
  "https://api.dicebear.com/7.x/adventurer/svg?seed=Rima&backgroundColor=fecdd3",
];

// ─── Draggable Streamer Box ────────────────────────────────────────────────────
function DraggableStreamerBox({ onClose }: { onClose: () => void }) {
  const [pos, setPos] = useState({ x: 40, y: 120 });
  const [locked, setLocked] = useState(false);
  const dragging = useRef(false);
  const origin   = useRef({ mx: 0, my: 0, bx: 0, by: 0 });

  const onMouseDown = (e: React.MouseEvent) => {
    if (locked) return;
    dragging.current = true;
    origin.current = { mx: e.clientX, my: e.clientY, bx: pos.x, by: pos.y };
    e.preventDefault();
  };

  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (!dragging.current) return;
      setPos({
        x: origin.current.bx + e.clientX - origin.current.mx,
        y: origin.current.by + e.clientY - origin.current.my,
      });
    };
    const up = () => { dragging.current = false; };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
  }, []);

  // Touch support
  const onTouchStart = (e: React.TouchEvent) => {
    if (locked) return;
    dragging.current = true;
    origin.current = { mx: e.touches[0].clientX, my: e.touches[0].clientY, bx: pos.x, by: pos.y };
  };
  useEffect(() => {
    const move = (e: TouchEvent) => {
      if (!dragging.current) return;
      setPos({
        x: origin.current.bx + e.touches[0].clientX - origin.current.mx,
        y: origin.current.by + e.touches[0].clientY - origin.current.my,
      });
    };
    const up = () => { dragging.current = false; };
    window.addEventListener("touchmove", move, { passive: false });
    window.addEventListener("touchend", up);
    return () => { window.removeEventListener("touchmove", move); window.removeEventListener("touchend", up); };
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.85 }}
      style={{
        position: "fixed", left: pos.x, top: pos.y, zIndex: 9999,
        width: 260, height: 160,
        background: "#000",
        border: "2px solid #333",
        borderRadius: 16,
        cursor: locked ? "default" : "grab",
        userSelect: "none",
        boxShadow: "0 8px 40px rgba(0,0,0,0.8)",
      }}
      onMouseDown={onMouseDown}
      onTouchStart={onTouchStart}
    >
      {/* Header bar */}
      <div className="flex items-center justify-between px-3 py-2"
        style={{ borderBottom: "1px solid #222" }}>
        <span className="text-white/40 text-xs font-bold">🎥 وضع الستريمر</span>
        <div className="flex items-center gap-2">
          {/* Lock toggle */}
          <button
            onClick={e => { e.stopPropagation(); setLocked(v => !v); }}
            className="text-white/40 hover:text-white/80 transition-colors p-1"
            title={locked ? "فتح التحريك" : "قفل المربع"}>
            {locked ? <Lock size={13} /> : <Unlock size={13} />}
          </button>
          {/* Close */}
          <button
            onClick={e => { e.stopPropagation(); onClose(); }}
            className="text-white/30 hover:text-red-400 transition-colors p-1 font-black text-sm">
            ✕
          </button>
        </div>
      </div>
      {/* Body */}
      <div className="flex flex-col items-center justify-center h-[calc(100%-40px)] gap-1">
        <span style={{ fontSize: 28 }}>🔒</span>
        <p className="text-white/25 text-xs font-bold">محتوى مخفي للبث</p>
        {!locked && (
          <p className="text-white/15 text-[10px] mt-1">اسحب للتحريك</p>
        )}
      </div>
    </motion.div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function ImposterGame() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const roomParam = params.get("room")?.toUpperCase() ?? "";
  const mode: Mode = roomParam ? "player" : "host";

  const { user } = useAuth();

  // ── Host state ─────────────────────────────────────────────────────────────
  const [setupDone, setSetupDone] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<Category>("عام");
  const [selectedDuration, setSelectedDuration] = useState(10);
  const [streamerBoxVisible, setStreamerBoxVisible] = useState(false);
  const [creating, setCreating] = useState(false);
  const [hostName, setHostName] = useState("");
  const [hostAvatar, setHostAvatar] = useState(AVATAR_POOL[0]);
  const [wordVisible, setWordVisible] = useState(true);

  // Auto-fill host name from logged-in account username
  useEffect(() => {
    if (user?.username && !hostName) setHostName(user.username);
  }, [user]);

  // ── Core WS state ──────────────────────────────────────────────────────────
  const wsRef    = useRef<WebSocket | null>(null);
  const [wsReady, setWsReady] = useState(false);
  const [gameState, setGameState]   = useState<GameState | null>(null);
  const [result, setResult]                 = useState<Result | null>(null);
  const [eliminationInfo, setEliminationInfo] = useState<EliminationInfo | null>(null);
  const [error, setError]           = useState<string | null>(null);
  const [copied, setCopied]         = useState(false);
  const [roomCode, setRoomCode]     = useState<string>(roomParam);

  // ── Player state ───────────────────────────────────────────────────────────
  const [playerName, setPlayerName]       = useState("");
  const [playerId, setPlayerId]           = useState<string | null>(null);
  const [myRole, setMyRole]               = useState<Role | null>(null);
  const [isMyTurn, setIsMyTurn]           = useState(false);
  const [needAnswer, setNeedAnswer]       = useState(false);
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);

  // ── Q&A input ──────────────────────────────────────────────────────────────
  const [selectedTarget, setSelectedTarget] = useState<string>("");
  const [questionText, setQuestionText]     = useState("");
  const [answerText, setAnswerText]         = useState("");

  // ── Countdown ──────────────────────────────────────────────────────────────
  const [countdown, setCountdown] = useState(5);

  // ── Timers ─────────────────────────────────────────────────────────────────
  const [gameRemaining, setGameRemaining] = useState(0);
  const [turnRemaining, setTurnRemaining] = useState(0);

  const playerIdRef  = useRef<string | null>(null);
  const gameStateRef = useRef<GameState | null>(null);
  useEffect(() => { playerIdRef.current = playerId; }, [playerId]);
  useEffect(() => { gameStateRef.current = gameState; }, [gameState]);

  // Countdown animation
  useEffect(() => {
    if (gameState?.phase !== "countdown") return;
    setCountdown(5);
    let n = 5;
    const iv = setInterval(() => {
      n -= 1;
      setCountdown(n > 0 ? n : 0);
      if (n <= 0) clearInterval(iv);
    }, 1_000);
    return () => clearInterval(iv);
  }, [gameState?.phase]);

  // Reset Q&A input on new turn
  useEffect(() => {
    setSelectedTarget("");
    setQuestionText("");
    setAnswerText("");
  }, [gameState?.currentTurnId]);

  // ── WS send ────────────────────────────────────────────────────────────────
  const wsSend = useCallback((msg: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN)
      wsRef.current.send(JSON.stringify(msg));
  }, []);

  // ── Connect & message handler ──────────────────────────────────────────────
  const connectWs = useCallback((isHost: boolean, opts?: { category: Category; duration: number; hostName: string; hostAvatar: string }) => {
    const ws = new WebSocket(getWsUrl());
    wsRef.current = ws;

    ws.onopen = () => {
      setWsReady(true);
      if (isHost) {
        ws.send(JSON.stringify({
          type: "imposter:create",
          roomName: "برا السالفة",
          category: opts?.category ?? "عام",
          duration: opts?.duration ?? 10,
          hostName: opts?.hostName ?? "المضيف",
          hostAvatar: opts?.hostAvatar ?? AVATAR_POOL[0],
        }));
      }
    };

    ws.onclose  = () => setWsReady(false);
    ws.onerror  = () => setCreating(false);

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string);
        if (msg.type === "imposter:created") {
          setRoomCode(msg.code);
          setSetupDone(true);
          setCreating(false);
          // Host is now a player — set their player ID
          if (msg.hostPlayerId) {
            setPlayerId(msg.hostPlayerId);
            playerIdRef.current = msg.hostPlayerId;
          }
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
          // Clear elimination overlay when game resumes to playing
          if (gs.phase === "playing") setEliminationInfo(null);
          // If I am eliminated → clear active states (I'm now spectator)
          const myEntry = gs.players.find((p: PublicPlayer) => p.id === playerIdRef.current);
          if (myEntry?.eliminated) {
            setIsMyTurn(false);
            setNeedAnswer(false);
          }
        }
        if (msg.type === "imposter:timer") {
          setGameRemaining(msg.gameRemaining);
          setTurnRemaining(msg.turnRemaining);
        }
        if (msg.type === "imposter:role")    setMyRole({ role: msg.role, word: msg.word ?? undefined });
        if (msg.type === "imposter:your_turn") { setIsMyTurn(true); setNeedAnswer(false); }
        if (msg.type === "imposter:answer_now") { setNeedAnswer(true); setIsMyTurn(false); }
        if (msg.type === "imposter:answered")  setNeedAnswer(false);
        if (msg.type === "imposter:result")      setResult(msg as Result);
        if (msg.type === "imposter:elimination") setEliminationInfo(msg as EliminationInfo);
        if (msg.type === "imposter:removed")   setError("تم إزالتك من الغرفة");
        if (msg.type === "imposter:host_left") setError("المضيف غادر الغرفة");
        if (msg.type === "imposter:error")     setError(msg.message);
      } catch { /* ignore */ }
    };
  }, []);

  // Player auto-connects
  useEffect(() => {
    if (mode === "player") {
      connectWs(false);
      return () => { wsRef.current?.close(); };
    }
    return undefined;
  }, [connectWs, mode]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleConfirmCreate = () => {
    if (creating) return;
    const name = hostName.trim() || "المضيف";
    setCreating(true);
    connectWs(true, { category: selectedCategory, duration: selectedDuration, hostName: name, hostAvatar });
  };

  const handleJoin = () => {
    const name = playerName.trim();
    if (!name || !roomParam) return;
    wsSend({ type: "imposter:join", room: roomParam, name, avatar: dicebear(name) });
  };

  const handleStart        = ()             => wsSend({ type: "imposter:start" });
  const handleForceVote    = ()             => wsSend({ type: "imposter:force_vote" });
  const handleChangeAvatar = (avatar: string) => {
    wsSend({ type: "imposter:change_avatar", avatar });
    setShowAvatarPicker(false);
  };
  const handleNewRound     = ()             => { setResult(null); setEliminationInfo(null); setMyRole(null); setIsMyTurn(false); setNeedAnswer(false); wsSend({ type: "imposter:new_round" }); };
  const handleVote         = (t: string)   => wsSend({ type: "imposter:vote", voterId: playerIdRef.current, targetId: t });
  const handleRemove       = (pid: string) => wsSend({ type: "imposter:remove_player", playerId: pid });
  const handleKick         = (pid: string) => wsSend({ type: "imposter:kick", playerId: pid });

  const handleSendQuestion = () => {
    if (!selectedTarget || !questionText.trim()) return;
    wsSend({ type: "imposter:send_question", targetId: selectedTarget, question: questionText.trim() });
    setIsMyTurn(false);
    setQuestionText("");
  };
  const handleSendAnswer = (choice: "yes" | "no") => {
    wsSend({ type: "imposter:send_answer_text", answer: choice });
    setNeedAnswer(false);
  };

  const copyLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}?room=${roomCode}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── Derived ────────────────────────────────────────────────────────────────
  const phase              = gameState?.phase ?? "lobby";
  const players            = gameState?.players ?? [];
  const currentTurnId      = gameState?.currentTurnId;
  const currentTargetId    = gameState?.currentTargetId;
  const hostPlayerId       = gameState?.hostPlayerId ?? "";
  const myPlayer           = players.find(p => p.id === playerId);
  const iAmEliminated      = myPlayer?.eliminated === true;
  const currentTurnPlayer  = players.find(p => p.id === currentTurnId);
  const targetPlayer       = currentTargetId ? players.find(p => p.id === currentTargetId) : null;
  const inviteUrl          = `${window.location.origin}${window.location.pathname}?room=${roomCode}`;
  const amIHost            = playerId === hostPlayerId;

  // ── Error ──────────────────────────────────────────────────────────────────
  if (error) return (
    <div className="min-h-screen gradient-bg flex items-center justify-center" dir="rtl" style={font}>
      <div className="text-center flex flex-col items-center gap-6">
        <span style={{ fontSize: 60 }}>⚠️</span>
        <p className="text-xl font-black text-red-400">{error}</p>
        <button onClick={() => navigate("/")}
          className="px-8 py-3 rounded-2xl font-black text-white"
          style={{ background: "linear-gradient(135deg,#7c3aed,#e040fb)" }}>
          العودة للرئيسية
        </button>
      </div>
    </div>
  );

  // ══════════════════════════════════════════════════════════════════════════
  // HOST VIEW
  // ══════════════════════════════════════════════════════════════════════════
  if (mode === "host") {
    return (
      <div className="min-h-screen gradient-bg relative overflow-hidden" dir="rtl" style={font}>

        {/* Ambient dots */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {[...Array(18)].map((_, i) => (
            <motion.div key={i} className="absolute rounded-full"
              style={{ width: 2, height: 2,
                background: i % 3 === 0 ? neonPurple : i % 3 === 1 ? neonCyan : "#ffd600",
                left: `${Math.random()*100}%`, top: `${Math.random()*100}%` }}
              animate={{ opacity: [0.08, 0.45, 0.08] }}
              transition={{ duration: 3+Math.random()*3, repeat: Infinity, delay: Math.random()*3 }} />
          ))}
        </div>

        {/* Glow blobs */}
        <div className="absolute top-[-180px] right-[-180px] w-[420px] h-[420px] rounded-full pointer-events-none opacity-10"
          style={{ background: `radial-gradient(circle, ${neonPurple}, transparent)` }} />
        <div className="absolute bottom-[-180px] left-[-180px] w-[420px] h-[420px] rounded-full pointer-events-none opacity-8"
          style={{ background: `radial-gradient(circle, ${neonCyan}, transparent)` }} />

        {/* Draggable streamer box */}
        <AnimatePresence>
          {streamerBoxVisible && (
            <DraggableStreamerBox onClose={() => setStreamerBoxVisible(false)} />
          )}
        </AnimatePresence>

        {/* ── Page content ── */}
        <div className="relative z-10 flex flex-col min-h-screen">

          {/* Nav */}
          <div className="flex items-center justify-between px-5 py-4">
            <button onClick={() => navigate("/")}
              className="flex items-center gap-1.5 text-purple-400/40 hover:text-purple-300 text-sm font-bold transition-colors">
              <ArrowRight size={14}/> الرئيسية
            </button>
            <span className="text-sm font-black" style={{ color: neonPurple, textShadow: `0 0 14px ${neonPurple}60` }}>
              🕵️ برا السالفة
            </span>
            <div style={{ width: 80 }} />
          </div>

          <AnimatePresence mode="wait">

            {/* ─────────── SCREEN 1: Setup (Professional Desktop 2-column) ─────────── */}
            {!setupDone && (
              <motion.div key="create"
                initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}
                className="flex flex-col items-center justify-center flex-1 px-6 py-6">

                {/* Wide card */}
                <div className="w-full max-w-4xl rounded-3xl overflow-hidden"
                  style={{ background: "rgba(8,3,20,0.97)", border: `1.5px solid ${neonPurple}35`,
                    boxShadow: `0 24px 80px rgba(0,0,0,0.8), 0 0 60px ${neonPurple}12` }}>

                  {/* ── Top header bar ── */}
                  <div className="flex items-center gap-4 px-8 py-5"
                    style={{ borderBottom: `1px solid rgba(255,255,255,0.07)`, background: `${neonPurple}0a` }}>
                    <motion.span style={{ fontSize: 36, filter: `drop-shadow(0 0 12px ${neonPurple}80)` }}
                      animate={{ y: [0, -4, 0] }} transition={{ repeat: Infinity, duration: 2.5 }}>
                      🕵️
                    </motion.span>
                    <div>
                      <h1 className="text-2xl font-black" style={{ color: neonPurple, textShadow: `0 0 16px ${neonPurple}60` }}>
                        برا السالفة
                      </h1>
                      <p className="text-xs text-purple-400/40 font-bold mt-0.5">إعدادات الغرفة الجديدة</p>
                    </div>
                  </div>

                  {/* ── Two-column body ── */}
                  <div className="grid grid-cols-2 divide-x divide-white/5" style={{ direction: "rtl" }}>

                    {/* ── LEFT COL: Identity ── */}
                    <div className="p-8 flex flex-col gap-5">
                      <div>
                        <p className="text-xs font-black text-purple-300/50 mb-1.5 tracking-wider">اسمك في اللعبة</p>
                        <input
                          value={hostName}
                          onChange={e => setHostName(e.target.value)}
                          placeholder="المضيف"
                          maxLength={20}
                          autoFocus
                          className="w-full bg-white/5 border rounded-xl px-4 py-3 text-white text-base placeholder-white/20 focus:outline-none focus:border-purple-500/60 text-right transition-colors"
                          style={{ borderColor: `${neonPurple}35` }}
                        />
                      </div>

                      {/* Avatar section */}
                      <div>
                        <p className="text-xs font-black text-purple-300/50 mb-3 tracking-wider">اختر شخصيتك</p>
                        {/* Big selected preview */}
                        <div className="flex justify-center mb-3">
                          <div className="w-20 h-20 rounded-2xl overflow-hidden"
                            style={{ border: `3px solid ${neonPurple}`, boxShadow: `0 0 24px ${neonPurple}55` }}>
                            <img src={hostAvatar} alt="avatar" className="w-full h-full object-cover"/>
                          </div>
                        </div>
                        {/* Grid picker */}
                        <div className="grid grid-cols-6 gap-1.5">
                          {AVATAR_POOL.map((av, i) => (
                            <button key={i} onClick={() => setHostAvatar(av)}
                              className="rounded-xl overflow-hidden transition-all duration-150"
                              style={{
                                border: `2px solid ${hostAvatar === av ? neonPurple : "rgba(255,255,255,0.08)"}`,
                                boxShadow: hostAvatar === av ? `0 0 12px ${neonPurple}70` : "none",
                                outline: "none",
                              }}>
                              <img src={av} alt="" className="w-full aspect-square object-cover"/>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* ── RIGHT COL: Settings ── */}
                    <div className="p-8 flex flex-col gap-5">

                      {/* Category */}
                      <div>
                        <p className="text-xs font-black text-purple-300/50 mb-3 tracking-wider">فئة الكلمات</p>
                        <div className="grid grid-cols-5 gap-2">
                          {([
                            { id: "عام"      as Category, emoji: "🎲", color: "#22c55e" },
                            { id: "دول"      as Category, emoji: "🌍", color: "#3b82f6" },
                            { id: "حيوانات" as Category, emoji: "🦁", color: "#f97316" },
                            { id: "أكلات"   as Category, emoji: "🍕", color: "#ef4444" },
                            { id: "أشياء"   as Category, emoji: "📦", color: "#a78bfa" },
                          ]).map(cat => {
                            const active = selectedCategory === cat.id;
                            return (
                              <motion.button key={cat.id} onClick={() => setSelectedCategory(cat.id)}
                                className="flex flex-col items-center gap-1.5 py-3 rounded-xl transition-all"
                                style={{
                                  background: active ? cat.color + "25" : "rgba(255,255,255,0.04)",
                                  border: `2px solid ${active ? cat.color : "rgba(255,255,255,0.08)"}`,
                                  boxShadow: active ? `0 0 16px ${cat.color}45` : "none",
                                }}
                                whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.93 }}>
                                <span style={{ fontSize: 22 }}>{cat.emoji}</span>
                                <span className="text-[10px] font-black leading-none"
                                  style={{ color: active ? cat.color : "rgba(255,255,255,0.35)" }}>
                                  {cat.id}
                                </span>
                              </motion.button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Duration */}
                      <div>
                        <p className="text-xs font-black text-purple-300/50 mb-3 tracking-wider">⏱ مدة الجلسة</p>
                        <div className="grid grid-cols-4 gap-2">
                          {[5, 10, 15, 20].map(d => {
                            const active = selectedDuration === d;
                            return (
                              <motion.button key={d} onClick={() => setSelectedDuration(d)}
                                className="py-3.5 rounded-xl font-black flex flex-col items-center gap-0.5 transition-all"
                                style={{
                                  background: active ? `${neonCyan}18` : "rgba(255,255,255,0.04)",
                                  border: `2px solid ${active ? neonCyan : "rgba(255,255,255,0.08)"}`,
                                  color: active ? neonCyan : "rgba(255,255,255,0.35)",
                                  boxShadow: active ? `0 0 14px ${neonCyan}35` : "none",
                                }}
                                whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.93 }}>
                                <span className="text-lg leading-none">{d}</span>
                                <span className="text-[10px]">دقيقة</span>
                              </motion.button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Streamer mode + Create — bottom row */}
                      <div className="mt-auto flex flex-col gap-3 pt-3"
                        style={{ borderTop: `1px solid rgba(255,255,255,0.06)` }}>
                        {/* Streamer toggle */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <span className="text-lg">🎥</span>
                            <div>
                              <p className="text-sm font-black text-white/65">وضع الستريمر</p>
                              <p className="text-[10px] text-purple-400/30">مربع أسود قابل للسحب على الشاشة</p>
                            </div>
                          </div>
                          <button
                            onClick={() => setStreamerBoxVisible(v => !v)}
                            className="relative w-12 h-6 rounded-full transition-all flex-shrink-0"
                            style={{ background: streamerBoxVisible ? "linear-gradient(135deg,#7c3aed,#e040fb)" : "rgba(255,255,255,0.12)" }}>
                            <motion.span
                              className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow"
                              animate={{ right: streamerBoxVisible ? 2 : undefined, left: streamerBoxVisible ? undefined : 2 }}
                              transition={{ type: "spring", stiffness: 300, damping: 25 }}/>
                          </button>
                        </div>

                        {/* Create button */}
                        <motion.button onClick={handleConfirmCreate} disabled={creating}
                          className="w-full py-4 rounded-2xl font-black text-white text-lg relative overflow-hidden disabled:opacity-50"
                          style={{ background: "linear-gradient(135deg,#7c3aed,#c026d3,#e040fb)",
                            boxShadow: `0 8px 40px ${neonPurple}55` }}
                          whileHover={{ scale: 1.02, boxShadow: `0 12px 50px ${neonPurple}70` }}
                          whileTap={{ scale: 0.97 }}>
                          {creating ? (
                            <span className="flex items-center justify-center gap-2">
                              <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"/>
                              جاري الإنشاء...
                            </span>
                          ) : (
                            <>
                              <span>إنشاء الغرفة 🚀</span>
                              <motion.div className="absolute inset-0 pointer-events-none"
                                style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.10), transparent)" }}
                                animate={{ x: ["-100%", "200%"] }}
                                transition={{ repeat: Infinity, duration: 2.2, ease: "linear" }}/>
                            </>
                          )}
                        </motion.button>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* ─────────── SCREEN 2: Lobby ─────────── */}
            {setupDone && phase === "lobby" && (
              <motion.div key="lobby"
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="flex flex-col flex-1 px-4 pb-6 gap-5 max-w-2xl mx-auto w-full pt-2">

                {/* ══ GAME NAME ══ */}
                <div className="text-center">
                  <p className="text-xs font-bold text-white/40 mb-0.5">الغرفة جاهزة</p>
                  <h2 className="text-2xl font-black" style={{ color: "#fff", textShadow: `0 0 20px ${neonPurple}90` }}>
                    🕵️ برا السالفة
                  </h2>
                </div>

                {/* ══ START BUTTON ══ */}
                <motion.button
                  onClick={handleStart}
                  disabled={players.length < 3}
                  className="w-full py-5 rounded-2xl font-black text-white text-xl relative overflow-hidden"
                  style={players.length >= 3 ? {
                    background: "linear-gradient(135deg, #15803d, #22c55e, #16a34a)",
                    boxShadow: "0 0 0 1px #22c55e60, 0 8px 40px rgba(34,197,94,0.55)",
                  } : {
                    background: "rgba(255,255,255,0.05)",
                    border: "2px solid rgba(255,255,255,0.12)",
                    color: "rgba(255,255,255,0.35)",
                    cursor: "not-allowed",
                  }}
                  whileHover={players.length >= 3 ? { scale: 1.02, boxShadow: "0 0 0 1px #22c55e80, 0 12px 50px rgba(34,197,94,0.65)" } : {}}
                  whileTap={players.length >= 3 ? { scale: 0.97 } : {}}>
                  {players.length >= 3 ? (
                    <span className="flex items-center justify-center gap-3">
                      <span className="text-2xl">▶</span>
                      <span>ابدأ اللعبة</span>
                      <span className="text-sm font-bold opacity-80">({players.length} لاعبين)</span>
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-2 text-base">
                      <Users size={16} />
                      يلزم {Math.max(0, 3 - players.length)} لاعبين إضافيين للبدء
                    </span>
                  )}
                  {players.length >= 3 && (
                    <motion.div className="absolute inset-0 pointer-events-none"
                      style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.12), transparent)" }}
                      animate={{ x: ["-100%", "200%"] }}
                      transition={{ repeat: Infinity, duration: 2.5, ease: "linear" }} />
                  )}
                </motion.button>

                {/* ══ INVITE CARD ══ */}
                <div className="rounded-2xl overflow-hidden"
                  style={{ border: `1.5px solid ${neonPurple}55`, background: "rgba(14,6,30,0.95)" }}>

                  {/* Link header */}
                  <div className="px-4 py-2.5 flex items-center gap-2"
                    style={{ borderBottom: `1px solid ${neonPurple}20`, background: `${neonPurple}08` }}>
                    <span className="text-base">🔗</span>
                    <span className="text-xs font-black text-white/60">شارك هذا الرابط مع اللاعبين</span>
                  </div>

                  {/* Link row */}
                  <div className="flex gap-2 items-center px-3 py-3">
                    <input
                      readOnly
                      value={inviteUrl}
                      onClick={e => (e.target as HTMLInputElement).select()}
                      className="flex-1 text-xs px-3 py-2 rounded-xl focus:outline-none cursor-text font-mono"
                      style={{
                        background: "rgba(255,255,255,0.06)",
                        border: "1px solid rgba(255,255,255,0.15)",
                        color: "rgba(255,255,255,0.75)",
                        direction: "ltr",
                      }}
                    />
                    <motion.button onClick={copyLink}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl font-black text-sm whitespace-nowrap shrink-0"
                      style={copied ? {
                        background: "rgba(34,197,94,0.25)",
                        border: "1px solid #22c55e80",
                        color: "#4ade80",
                      } : {
                        background: `${neonPurple}25`,
                        border: `1px solid ${neonPurple}70`,
                        color: neonPurple,
                      }}
                      whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.94 }}>
                      {copied ? <Check size={14}/> : <Copy size={14}/>}
                      {copied ? "تم النسخ!" : "نسخ"}
                    </motion.button>
                  </div>
                </div>

                {/* ══ PLAYERS ══ */}
                <div className="flex flex-col gap-3 flex-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Users size={14} color="#a78bfa"/>
                      <span className="text-sm font-black text-white/70">اللاعبون</span>
                    </div>
                    <span className="text-xs font-bold px-2.5 py-1 rounded-full"
                      style={{ background: `${neonPurple}20`, color: neonPurple, border: `1px solid ${neonPurple}40` }}>
                      {players.length} / ∞
                    </span>
                  </div>

                  {players.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 rounded-2xl gap-2"
                      style={{ border: `1px dashed ${neonPurple}30`, background: "rgba(224,64,251,0.04)" }}>
                      <motion.span style={{ fontSize: 36 }}
                        animate={{ scale: [1, 1.15, 1] }} transition={{ repeat: Infinity, duration: 1.8 }}>
                        👀
                      </motion.span>
                      <motion.p className="text-sm font-black text-white/50"
                        animate={{ opacity: [0.4, 0.9, 0.4] }} transition={{ repeat: Infinity, duration: 2 }}>
                        في انتظار اللاعبين...
                      </motion.p>
                      <p className="text-xs text-white/25">شارك رابط الدعوة أعلاه</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                      <AnimatePresence>
                        {players.map((p, i) => {
                          const isHost = p.role === "host";
                          const isMe   = p.id === playerId;
                          return (
                            <motion.div key={p.id}
                              initial={{ opacity: 0, scale: 0.6 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.5 }}
                              transition={{ type: "spring", stiffness: 300, damping: 22 }}
                              className="relative flex flex-col items-center gap-2 p-3 rounded-2xl group"
                              style={{
                                background: isHost ? `${neonPurple}20` : playerColor(i) + "18",
                                border: `2px solid ${isHost ? neonPurple : playerColor(i)}60`,
                                boxShadow: `0 2px 16px ${isHost ? neonPurple : playerColor(i)}20`,
                              }}>
                              {/* Host badge */}
                              {isHost && (
                                <span className="absolute -top-2 right-1 text-[9px] font-black px-1.5 py-0.5 rounded-full"
                                  style={{ background: neonPurple, color: "#fff" }}>
                                  هوست
                                </span>
                              )}
                              {/* Kick button — visible on hover, shown for all except if it's the host kicking themselves (shown as "مغادرة") */}
                              <button onClick={() => handleKick(p.id)}
                                className="absolute top-1 left-1 w-5 h-5 rounded-full hidden group-hover:flex items-center justify-center font-black text-xs"
                                style={{ background: isMe ? "rgba(251,113,133,0.3)" : "rgba(239,68,68,0.3)", color: isMe ? "#fda4af" : "#f87171", border: `1px solid ${isMe ? "rgba(251,113,133,0.5)" : "rgba(239,68,68,0.5)"}` }}
                                title={isMe ? "مغادرة الغرفة" : `طرد ${p.name}`}>
                                {isMe ? "🚪" : "✕"}
                              </button>
                              <div className="w-12 h-12 rounded-xl overflow-hidden border-2"
                                style={{ borderColor: isHost ? neonPurple : playerColor(i), boxShadow: `0 0 12px ${isHost ? neonPurple : playerColor(i)}55` }}>
                                <img src={p.avatar} alt={p.name} className="w-full h-full object-cover"/>
                              </div>
                              <p className="text-xs font-black truncate w-full text-center"
                                style={{ color: "#fff", textShadow: `0 0 8px ${isHost ? neonPurple : playerColor(i)}` }}>
                                {p.name}
                              </p>
                              {isMe && !isHost && (
                                <span className="text-[8px] font-black text-yellow-400/70">أنت</span>
                              )}
                            </motion.div>
                          );
                        })}
                      </AnimatePresence>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* ─────────── COUNTDOWN ─────────── */}
            {setupDone && phase === "countdown" && (
              <motion.div key="host-countdown" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="flex flex-col items-center justify-center flex-1 gap-6 px-4">
                <motion.div className="text-base font-black text-white/60 tracking-wider"
                  animate={{ opacity: [0.5, 1, 0.5] }} transition={{ repeat: Infinity, duration: 1.5 }}>
                  جاري تجهيز الجولة...
                </motion.div>
                <motion.div key={countdown}
                  initial={{ scale: 1.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }}
                  className="text-8xl font-black"
                  style={{ color: neonPurple, textShadow: `0 0 40px ${neonPurple}80` }}>
                  {countdown}
                </motion.div>
                <div className="flex gap-1.5 mt-2">
                  {[0,1,2,3,4].map(i => (
                    <motion.div key={i} className="w-2 h-2 rounded-full"
                      style={{ background: i < (5 - countdown) ? neonPurple : "rgba(255,255,255,0.15)" }}
                      animate={{ scale: i === (5 - countdown - 1) ? [1, 1.4, 1] : 1 }}
                      transition={{ duration: 0.3 }} />
                  ))}
                </div>
              </motion.div>
            )}

            {/* ─────────── WORD REVEAL ─────────── */}
            {setupDone && phase === "reveal" && (
              <motion.div key="host-reveal" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                className="flex flex-col items-center justify-center flex-1 gap-5 px-4">
                <motion.div animate={{ opacity: [0.6, 1, 0.6] }} transition={{ repeat: Infinity, duration: 2 }}
                  className="text-sm font-black text-white/40">الكشف عن السالفة...</motion.div>
                <div className="w-full max-w-sm rounded-3xl p-8 flex flex-col items-center gap-3 text-center"
                  style={{ background: "rgba(10,4,24,0.95)", border: `2px solid ${neonPurple}60`,
                    boxShadow: `0 0 60px ${neonPurple}25` }}>
                  <span className="text-3xl">📍</span>
                  <p className="text-xs font-black text-white/40">المكان / السالفة</p>
                  <motion.p className="text-4xl font-black"
                    initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
                    style={{ color: neonPurple, textShadow: `0 0 30px ${neonPurple}` }}>
                    {gameState?.word ?? "..."}
                  </motion.p>
                </div>
                <p className="text-xs text-white/25">ستبدأ اللعبة بعد لحظات...</p>
              </motion.div>
            )}

            {/* ─────────── PLAYING — 3-column layout ─────────── */}
            {setupDone && phase === "playing" && (
              <motion.div key="host-playing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="flex flex-col lg:flex-row gap-3 flex-1 px-3 pb-3 min-h-0">

                {/* ── LEFT: Q&A History ── */}
                <div className="lg:w-56 flex-shrink-0 rounded-2xl flex flex-col overflow-hidden"
                  style={{ background: "rgba(16,10,38,0.92)", border: "1.5px solid rgba(107,70,193,0.45)" }}>
                  <div className="px-3 py-2.5 border-b flex items-center gap-2"
                    style={{ borderColor: "rgba(107,70,193,0.25)", background: "rgba(99,60,200,0.08)" }}>
                    <span className="text-base">📋</span>
                    <span className="text-xs font-black text-white/70">معلومات الجولة</span>
                  </div>
                  <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-2">
                    {(gameState?.qaHistory ?? []).length === 0 ? (
                      <p className="text-center text-white/20 text-[10px] py-4">لا يوجد أسئلة بعد...</p>
                    ) : (
                      [...(gameState?.qaHistory ?? [])].reverse().map((qa, idx) => (
                        <div key={idx} className="rounded-xl p-2 flex flex-col gap-1"
                          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                          <div className="flex items-center gap-1 text-[9px] font-black"
                            style={{ color: neonCyan }}>
                            <span>{qa.askerName}</span>
                            <span className="text-white/30">←</span>
                            <span style={{ color: neonPurple }}>{qa.targetName}</span>
                          </div>
                          <p className="text-[10px] text-white/70 font-bold">❓ {qa.question}</p>
                          {qa.timedOut ? (
                            <span className="inline-flex items-center gap-1 text-[9px] font-black text-orange-400/80">
                              <span>⏰</span><span>انتهى الوقت</span>
                            </span>
                          ) : (
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black w-fit ${qa.answer === "نعم" ? "text-green-300" : "text-red-400"}`}
                              style={{ background: qa.answer === "نعم" ? "rgba(34,197,94,0.18)" : "rgba(239,68,68,0.18)", border: `1px solid ${qa.answer === "نعم" ? "rgba(34,197,94,0.35)" : "rgba(239,68,68,0.35)"}` }}>
                              {qa.answer === "نعم" ? "✅" : "❌"} {qa.answer}
                            </span>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* ── CENTER: Main game ── */}
                <div className="flex-1 rounded-2xl flex flex-col overflow-hidden min-h-0"
                  style={{ background: "rgba(10,6,28,0.94)", border: "1.5px solid rgba(107,70,193,0.35)" }}>

                  {/* Top bar */}
                  <div className="px-4 py-2.5 flex items-center justify-between border-b"
                    style={{ borderColor: "rgba(255,255,255,0.07)", background: "rgba(0,229,255,0.04)" }}>
                    <div className="flex items-center gap-2">
                      <span className="text-sm">📍</span>
                      {wordVisible ? (
                        <span className="text-sm font-black" style={{ color: neonCyan }}>{gameState?.word ?? "..."}</span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-black"
                          style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.28)", border: "1px solid rgba(255,255,255,0.1)" }}>
                          🔒 كلمة مخفية
                        </span>
                      )}
                      <button onClick={() => setWordVisible(v => !v)}
                        className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-black transition-all"
                        style={{ background: wordVisible ? "rgba(0,229,255,0.12)" : "rgba(255,255,255,0.08)", color: wordVisible ? neonCyan : "rgba(255,255,255,0.35)" }}
                        title={wordVisible ? "إخفاء الكلمة عن البث" : "إظهار الكلمة"}>
                        {wordVisible ? <Eye size={11}/> : <EyeOff size={11}/>}
                        {wordVisible ? "مرئية" : "مخفية"}
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black" style={{ color: gameRemaining < 60_000 ? "#ef4444" : neonCyan }}>
                        {fmt(gameRemaining)}
                      </span>
                      <div className="w-20 h-1 rounded-full" style={{ background: "rgba(255,255,255,0.1)" }}>
                        <div className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${(gameRemaining / (gameState?.durationMs ?? 1)) * 100}%`,
                            background: gameRemaining < 60_000 ? "#ef4444" : neonCyan }} />
                      </div>
                    </div>
                  </div>

                  {/* Current turn */}
                  <div className="px-4 py-3 border-b flex items-center gap-3"
                    style={{ borderColor: "rgba(255,255,255,0.07)", background: `${neonPurple}08` }}>
                    <span className="text-base">🎮</span>
                    <span className="text-sm font-black" style={{ color: neonPurple }}>
                      الدور على {currentTurnPlayer?.name ?? "..."}
                    </span>
                    {currentTargetId && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-black"
                        style={{ background: `${neonCyan}20`, color: neonCyan }}>
                        → {targetPlayer?.name}
                      </span>
                    )}
                    {/* Turn timer */}
                    <div className="mr-auto flex items-center gap-1.5">
                      <Clock size={11} color={turnRemaining < 15_000 ? "#ef4444" : "rgba(255,255,255,0.35)"}/>
                      <span className="text-xs font-black"
                        style={{ color: turnRemaining < 15_000 ? "#ef4444" : "rgba(255,255,255,0.35)" }}>
                        {Math.ceil(turnRemaining / 1000)}
                      </span>
                    </div>
                  </div>

                  {/* Q&A active */}
                  <div className="flex-1 p-4 overflow-y-auto flex flex-col gap-2">
                    {(gameState?.currentQuestion) && (
                      <div className="rounded-xl p-3 flex flex-col gap-1.5"
                        style={{ background: `${neonPurple}12`, border: `1px solid ${neonPurple}35` }}>
                        <div className="flex items-center gap-1 text-[10px] font-black" style={{ color: neonPurple }}>
                          <span>{currentTurnPlayer?.name}</span>
                          <span className="text-white/30 text-xs">→</span>
                          <span style={{ color: neonCyan }}>{targetPlayer?.name}</span>
                        </div>
                        <p className="text-sm font-bold text-white">❓ {gameState.currentQuestion}</p>
                        <motion.p className="text-[10px] text-white/40"
                          animate={{ opacity: [0.4,1,0.4] }} transition={{ repeat: Infinity, duration: 1.5 }}>
                          ينتظر الرد...
                        </motion.p>
                      </div>
                    )}
                    {gameState?.lastAnswer && (
                      <div className="rounded-xl p-3"
                        style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.25)" }}>
                        <p className="text-sm font-bold text-green-400">✅ {gameState.lastAnswer.answer}</p>
                      </div>
                    )}
                  </div>

                  {/* ── HOST PERSONAL INTERACTION ── */}
                  {/* When host is the one asking this turn */}
                  {isMyTurn && (
                    <div className="mx-4 mb-3 rounded-xl p-3 flex flex-col gap-3"
                      style={{ background: `${neonPurple}12`, border: `2px solid ${neonPurple}50` }}>
                      <p className="text-xs font-black text-center" style={{ color: neonPurple }}>
                        🎯 دورك — اختر لاعباً تسأله
                      </p>
                      <div className="grid grid-cols-3 gap-1.5">
                        {players.filter(p => p.id !== playerId && !p.disconnected).map((p, i) => (
                          <button key={p.id} onClick={() => setSelectedTarget(selectedTarget === p.id ? "" : p.id)}
                            className="flex flex-col items-center gap-1 p-1.5 rounded-lg transition-all"
                            style={{
                              background: selectedTarget === p.id ? `${playerColor(i)}20` : "rgba(255,255,255,0.04)",
                              border: `2px solid ${selectedTarget === p.id ? playerColor(i) : "rgba(255,255,255,0.08)"}`,
                            }}>
                            <div className="w-7 h-7 rounded-md overflow-hidden border" style={{ borderColor: playerColor(i) + "60" }}>
                              <img src={p.avatar} alt={p.name} className="w-full h-full object-cover"/>
                            </div>
                            <p className="text-[9px] font-black truncate w-full text-center"
                              style={{ color: selectedTarget === p.id ? playerColor(i) : "rgba(255,255,255,0.4)" }}>
                              {p.name}
                            </p>
                          </button>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <input value={questionText} onChange={e => setQuestionText(e.target.value)}
                          placeholder="اكتب سؤالك..."
                          className="flex-1 bg-transparent border rounded-lg px-2 py-1.5 text-white text-xs placeholder-white/25 focus:outline-none text-right"
                          style={{ borderColor: "rgba(255,255,255,0.15)" }}
                          onKeyDown={e => e.key === "Enter" && handleSendQuestion()}
                        />
                        <button onClick={handleSendQuestion} disabled={!selectedTarget || !questionText.trim()}
                          className="px-3 rounded-lg font-black text-xs disabled:opacity-30 shrink-0"
                          style={{ background: `linear-gradient(135deg,#7c3aed,${neonPurple})`, color: "#fff" }}>
                          إرسال ✈️
                        </button>
                      </div>
                    </div>
                  )}

                  {/* When host is the target and must answer */}
                  {needAnswer && (
                    <div className="mx-4 mb-3 rounded-xl p-3 flex flex-col gap-3"
                      style={{ background: "rgba(0,229,255,0.07)", border: `2px solid ${neonCyan}50` }}>
                      <p className="text-xs font-black text-center" style={{ color: neonCyan }}>
                        👈 وُجّه إليك سؤال!
                      </p>
                      {gameState?.currentQuestion && (
                        <p className="text-sm font-bold text-white text-center">❓ {gameState.currentQuestion}</p>
                      )}
                      <div className="grid grid-cols-2 gap-2">
                        <motion.button onClick={() => handleSendAnswer("yes")}
                          className="py-3 rounded-xl font-black text-white text-sm"
                          style={{ background: "linear-gradient(135deg,#16a34a,#22c55e)" }}
                          whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.92 }}>
                          ✅ نعم
                        </motion.button>
                        <motion.button onClick={() => handleSendAnswer("no")}
                          className="py-3 rounded-xl font-black text-white text-sm"
                          style={{ background: "linear-gradient(135deg,#dc2626,#ef4444)" }}
                          whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.92 }}>
                          ❌ لا
                        </motion.button>
                      </div>
                    </div>
                  )}

                  {/* Host controls */}
                  <div className="px-4 pb-4">
                    <button onClick={handleForceVote}
                      className="w-full py-2 rounded-xl text-xs font-bold border transition-all text-red-400/50 hover:text-red-400 border-red-500/10 hover:border-red-400/30">
                      <SkipForward size={10} className="inline ml-1"/> التخطي للتصويت
                    </button>
                  </div>
                </div>

                {/* ── RIGHT: Players ── */}
                <div className="lg:w-48 flex-shrink-0 rounded-2xl flex flex-col overflow-hidden"
                  style={{ background: "rgba(16,10,38,0.92)", border: "1.5px solid rgba(107,70,193,0.45)" }}>
                  <div className="px-3 py-2.5 border-b flex items-center gap-2"
                    style={{ borderColor: "rgba(107,70,193,0.25)", background: "rgba(99,60,200,0.08)" }}>
                    <span className="text-xs font-black text-white/60">👥 اللاعبون</span>
                  </div>
                  <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-2">
                    {players.map((p, i) => {
                      const isCur  = p.id === currentTurnId;
                      const isTgt  = p.id === currentTargetId;
                      const isHost = p.role === "host";
                      const isMe   = p.id === playerId;
                      return (
                        <div key={p.id} className="flex items-center gap-2 p-2 rounded-xl group relative"
                          style={{
                            background: isCur ? `${neonPurple}18` : isTgt ? `${neonCyan}12` : "rgba(255,255,255,0.03)",
                            border: `1.5px solid ${isCur ? neonPurple : isTgt ? neonCyan : isHost ? neonPurple + "40" : playerColor(i) + "30"}`,
                          }}>
                          <div className="w-9 h-9 rounded-lg overflow-hidden flex-shrink-0 border"
                            style={{ borderColor: isCur ? neonPurple : isHost ? neonPurple + "60" : playerColor(i) + "50" }}>
                            <img src={p.avatar} alt={p.name} className="w-full h-full object-cover"/>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1">
                              <p className="text-[11px] font-black truncate"
                                style={{ color: isCur ? neonPurple : isTgt ? neonCyan : isHost ? neonPurple : playerColor(i) }}>
                                {p.name}
                              </p>
                              {isHost && <span className="text-[8px] px-1 rounded font-black shrink-0" style={{ background: `${neonPurple}30`, color: neonPurple }}>هوست</span>}
                            </div>
                            <p className="text-[9px] font-bold text-white/25">
                              {isCur ? "✏️ يسأل" : isTgt ? "💬 يجاوب" : p.disconnected ? "❌ غير متصل" : "🟢 متصل"}
                            </p>
                          </div>
                          {/* Kick button (host only, show for non-host players) */}
                          {!isHost && (
                            <button onClick={() => handleKick(p.id)}
                              className="w-5 h-5 rounded-full opacity-0 group-hover:opacity-100 flex items-center justify-center text-[9px] font-black shrink-0 transition-opacity"
                              style={{ background: "rgba(239,68,68,0.25)", color: "#f87171", border: "1px solid rgba(239,68,68,0.4)" }}
                              title={`طرد ${p.name}`}>
                              ✕
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </motion.div>
            )}

            {/* ─────────── VOTING (host) ─────────── */}
            {setupDone && phase === "voting" && (
              <motion.div key="host-voting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="flex flex-col lg:flex-row gap-4 flex-1 px-4 pb-4 max-w-5xl mx-auto w-full">

                {/* ── LEFT: voting status grid ── */}
                <div className="lg:w-64 flex-shrink-0 rounded-2xl overflow-hidden"
                  style={{ background: "rgba(16,10,38,0.92)", border: "1.5px solid rgba(107,70,193,0.45)" }}>
                  <div className="px-4 py-3 border-b flex items-center gap-2"
                    style={{ borderColor: "rgba(107,70,193,0.25)", background: "rgba(99,60,200,0.08)" }}>
                    <span className="text-base">🗳️</span>
                    <span className="text-sm font-black text-white/80">حالة التصويت</span>
                    <span className="mr-auto text-xs font-black px-2 py-0.5 rounded-full"
                      style={{ background: "rgba(99,60,200,0.2)", color: "#a78bfa" }}>
                      {players.filter(p => !p.eliminated && p.voted).length} / {players.filter(p => !p.eliminated).length}
                    </span>
                  </div>
                  <div className="p-3 flex flex-col gap-2">
                    {players.map((p, i) => (
                      <div key={p.id} className="flex items-center gap-2.5 px-2 py-2 rounded-xl"
                        style={{ background: p.eliminated ? "rgba(239,68,68,0.06)" : p.voted ? "rgba(34,197,94,0.08)" : "rgba(255,255,255,0.03)",
                          border: `1px solid ${p.eliminated ? "rgba(239,68,68,0.25)" : p.voted ? "rgba(34,197,94,0.30)" : "rgba(255,255,255,0.06)"}` }}>
                        <div className="w-8 h-8 rounded-lg overflow-hidden flex-shrink-0 border"
                          style={{ borderColor: p.eliminated ? "#ef444470" : p.voted ? "#22c55e70" : playerColor(i) + "50" }}>
                          <img src={p.avatar} alt={p.name} className="w-full h-full object-cover" style={{ opacity: p.eliminated ? 0.4 : 1 }}/>
                        </div>
                        <p className="text-xs font-black flex-1 truncate"
                          style={{ color: p.eliminated ? "#ef444480" : p.voted ? "#4ade80" : playerColor(i) }}>
                          {p.name} {p.id === playerId ? "(أنت)" : ""}
                        </p>
                        <span className="text-[10px] font-black flex-shrink-0"
                          style={{ color: p.eliminated ? "#ef4444" : p.voted ? "#22c55e" : "rgba(255,255,255,0.2)" }}>
                          {p.eliminated ? "🚪" : p.voted ? "✓" : "..."}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* ── RIGHT: host voting panel ── */}
                <div className="flex-1 rounded-2xl flex flex-col overflow-hidden"
                  style={{ background: "rgba(16,10,38,0.92)", border: "1.5px solid rgba(107,70,193,0.45)" }}>
                  <div className="px-4 py-3 border-b flex items-center gap-2"
                    style={{ borderColor: "rgba(107,70,193,0.25)", background: "rgba(99,60,200,0.08)" }}>
                    <span className="text-base">👑</span>
                    <span className="text-sm font-black text-white/80">صوتك — اختر من هو برا السالفة</span>
                  </div>
                  <div className="flex-1 p-4 flex flex-col justify-center">
                    {myPlayer?.voted ? (
                      <div className="flex flex-col items-center justify-center gap-4 py-8">
                        <motion.span style={{ fontSize: 56 }}
                          animate={{ scale: [1, 1.1, 1] }} transition={{ repeat: Infinity, duration: 2 }}>✅</motion.span>
                        <p className="text-xl font-black text-green-400">تم تسجيل صوتك!</p>
                        <p className="text-sm text-white/30">في انتظار بقية اللاعبين...</p>
                      </div>
                    ) : (
                      <>
                        <p className="text-center text-sm font-bold text-purple-300/50 mb-4">اضغط على اللاعب الذي تظنه برا السالفة</p>
                        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                          {players.filter(p => p.id !== playerId && !p.disconnected && !p.eliminated).map((p, i) => (
                            <motion.button key={p.id} onClick={() => handleVote(p.id)}
                              className="flex flex-col items-center gap-2 p-3 rounded-2xl transition-all"
                              style={{ background: "rgba(255,255,255,0.03)", border: `2px solid ${playerColor(i)}40` }}
                              whileHover={{ scale: 1.05, borderColor: playerColor(i), background: `${playerColor(i)}15` }}
                              whileTap={{ scale: 0.93 }}>
                              <div className="w-13 h-13 rounded-xl overflow-hidden border-2" style={{ borderColor: playerColor(i) + "70" }}>
                                <img src={p.avatar} alt={p.name} className="w-full h-full object-cover"/>
                              </div>
                              <p className="text-xs font-black truncate w-full text-center" style={{ color: playerColor(i) }}>{p.name}</p>
                            </motion.button>
                          ))}
                        </div>
                        <motion.button onClick={() => handleVote("skip")}
                          className="mt-4 py-2.5 rounded-xl font-bold text-sm transition-all"
                          style={{ color: "rgba(255,255,255,0.3)", border: "1px solid rgba(255,255,255,0.1)" }}
                          whileHover={{ scale: 1.02, color: "rgba(255,255,255,0.55)" }}
                          whileTap={{ scale: 0.97 }}>
                          تخطي ↩
                        </motion.button>
                      </>
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {/* ─────────── ELIMINATION (host) ─────────── */}
            {setupDone && phase === "elimination" && eliminationInfo && (
              <EliminationScreen info={eliminationInfo} players={players} />
            )}

            {/* ─────────── RESULT (host) ─────────── */}
            {setupDone && phase === "result" && result && (
              <ResultScreen result={result} players={players}
                onNewRound={handleNewRound} onHome={() => navigate("/")} isHost />
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
    <div className="min-h-screen gradient-bg relative overflow-hidden flex flex-col items-center justify-center px-4"
      dir="rtl" style={font}>

      {/* Ambient dots */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(12)].map((_, i) => (
          <motion.div key={i} className="absolute rounded-full"
            style={{ width: 2, height: 2, background: i%2===0 ? neonPurple : neonCyan,
              left: `${Math.random()*100}%`, top: `${Math.random()*100}%` }}
            animate={{ opacity: [0.1, 0.45, 0.1] }}
            transition={{ duration: 3+Math.random()*2, repeat: Infinity, delay: Math.random()*2 }}/>
        ))}
      </div>

      <div className="relative z-10 w-full max-w-sm">
        <AnimatePresence mode="wait">

          {/* ── JOIN ── */}
          {!playerId && (
            <motion.div key="join" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-6">
              <div className="text-center">
                <motion.div style={{ fontSize: 64 }}
                  animate={{ rotate: [0,-8,8,0] }} transition={{ repeat: Infinity, duration: 3 }}>
                  🕵️
                </motion.div>
                <h1 className="text-3xl font-black mt-3"
                  style={{ color: neonPurple, textShadow: `0 0 24px ${neonPurple}80` }}>
                  برا السالفة
                </h1>
              </div>

              <div className="w-full flex flex-col gap-3 p-6 rounded-3xl"
                style={{ background: "rgba(10,4,24,0.92)", border: `1px solid ${neonPurple}30` }}>
                <label className="text-xs font-bold text-purple-300/60">اسمك في اللعبة</label>
                <input value={playerName} onChange={e => setPlayerName(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleJoin()}
                  placeholder="أدخل اسمك..."
                  className="w-full bg-transparent border border-purple-500/30 rounded-xl px-4 py-3 text-white placeholder-purple-400/30 focus:outline-none focus:border-purple-400/60 text-sm text-right"/>
                <motion.button onClick={handleJoin} disabled={!playerName.trim()}
                  className="w-full py-3.5 rounded-2xl font-black text-white text-base btn-shimmer disabled:opacity-30"
                  style={{ background: `linear-gradient(135deg,#7c3aed,${neonPurple})`, boxShadow: `0 4px 24px ${neonPurple}40` }}
                  whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                  انضم الآن 🎮
                </motion.button>
              </div>
            </motion.div>
          )}

          {/* ── PLAYER LOBBY ── */}
          {playerId && phase === "lobby" && (
            <motion.div key="p-lobby" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="flex flex-col gap-5 w-full">

              {/* Header */}
              <div className="text-center">
                <h2 className="text-2xl font-black" style={{ color: neonPurple, textShadow: `0 0 20px ${neonPurple}80` }}>
                  🕵️ برا السالفة
                </h2>
                <div className="inline-flex items-center gap-2 mt-1.5 px-3 py-1 rounded-full text-xs font-black"
                  style={{ background: `${neonPurple}18`, border: `1px solid ${neonPurple}35`, color: neonPurple }}>
                  في انتظار بدء اللعبة...
                </div>
              </div>

              {/* Players grid */}
              <div className="rounded-2xl p-4" style={{ background: "rgba(10,4,24,0.85)", border: `1px solid ${neonPurple}25` }}>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-black" style={{ color: neonPurple }}>اللاعبون في الغرفة</p>
                  <span className="text-xs font-black px-2 py-0.5 rounded-full"
                    style={{ background: `${neonPurple}20`, color: neonPurple }}>
                    {players.length} / 10
                  </span>
                </div>

                {players.length === 0 ? (
                  <p className="text-center text-purple-400/30 text-sm py-4">لا يوجد لاعبون بعد...</p>
                ) : (
                  <div className="grid grid-cols-3 gap-2.5">
                    {players.map((p, i) => {
                      const isMe = p.id === playerId;
                      const color = playerColor(i);
                      return (
                        <div key={p.id} className="flex flex-col items-center gap-1.5 p-2.5 rounded-xl relative"
                          style={{
                            background: isMe ? `${neonPurple}18` : "rgba(255,255,255,0.04)",
                            border: `2px solid ${isMe ? neonPurple : color + "40"}`,
                            boxShadow: isMe ? `0 0 14px ${neonPurple}35` : "none",
                          }}>

                          {/* Avatar — mine is clickable */}
                          <div className="relative">
                            <div className="w-14 h-14 rounded-xl overflow-hidden"
                              style={{ border: `2px solid ${isMe ? neonPurple : color + "50"}` }}>
                              <img src={p.avatar} alt={p.name} className="w-full h-full object-cover"/>
                            </div>
                            {isMe && (
                              <motion.button onClick={() => setShowAvatarPicker(true)}
                                whileHover={{ scale: 1.15 }} whileTap={{ scale: 0.9 }}
                                className="absolute -bottom-1 -left-1 w-5 h-5 rounded-full flex items-center justify-center text-[9px]"
                                style={{ background: neonPurple, boxShadow: `0 0 8px ${neonPurple}80` }}
                                title="غيّر صورتك">
                                ✏️
                              </motion.button>
                            )}
                          </div>

                          <p className="text-[10px] font-black truncate w-full text-center"
                            style={{ color: isMe ? neonPurple : color }}>
                            {p.name}
                          </p>
                          {isMe && (
                            <span className="text-[8px] font-black px-1.5 py-0.5 rounded-full"
                              style={{ background: `${neonPurple}25`, color: neonPurple }}>أنت</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Waiting status */}
              <div className="flex flex-col items-center gap-2 py-3 rounded-2xl"
                style={{ background: "rgba(10,4,24,0.6)", border: "1px solid rgba(255,255,255,0.07)" }}>
                <motion.div animate={{ opacity: [0.5, 1, 0.5] }} transition={{ repeat: Infinity, duration: 1.8 }}
                  className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ background: "#22c55e" }}/>
                  <p className="text-sm font-bold text-white/60">في انتظار المضيف لبدء اللعبة...</p>
                </motion.div>
                {players.length < 3 && (
                  <p className="text-[11px] font-black" style={{ color: "#fbbf24" }}>
                    يلزم {3 - players.length} لاعب إضافي على الأقل
                  </p>
                )}
              </div>

              {/* Avatar Picker Modal */}
              <AnimatePresence>
                {showAvatarPicker && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="fixed inset-0 z-50 flex items-end justify-center pb-4 px-4"
                    style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)" }}
                    onClick={() => setShowAvatarPicker(false)}>

                    <motion.div initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }}
                      className="w-full max-w-sm rounded-3xl p-5"
                      style={{ background: "rgba(13,6,28,0.98)", border: `2px solid ${neonPurple}50`,
                        boxShadow: `0 0 40px ${neonPurple}30` }}
                      onClick={e => e.stopPropagation()}>

                      <div className="flex items-center justify-between mb-4">
                        <p className="font-black text-white text-base">اختر صورتك</p>
                        <button onClick={() => setShowAvatarPicker(false)}
                          className="w-7 h-7 rounded-full flex items-center justify-center text-white/40 hover:text-white transition-colors"
                          style={{ background: "rgba(255,255,255,0.08)" }}>✕</button>
                      </div>

                      <div className="grid grid-cols-4 gap-2.5 max-h-64 overflow-y-auto">
                        {AVATAR_POOL.map((url, idx) => {
                          const isCurrent = myPlayer?.avatar === url;
                          return (
                            <motion.button key={idx} onClick={() => handleChangeAvatar(url)}
                              whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.92 }}
                              className="w-full aspect-square rounded-xl overflow-hidden relative"
                              style={{ border: `2px solid ${isCurrent ? neonPurple : "rgba(255,255,255,0.12)"}`,
                                boxShadow: isCurrent ? `0 0 12px ${neonPurple}60` : "none" }}>
                              <img src={url} alt="" className="w-full h-full object-cover"/>
                              {isCurrent && (
                                <div className="absolute inset-0 flex items-center justify-center"
                                  style={{ background: `${neonPurple}30` }}>
                                  <span className="text-lg">✓</span>
                                </div>
                              )}
                            </motion.button>
                          );
                        })}
                      </div>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>

            </motion.div>
          )}

          {/* ── COUNTDOWN (player) ── */}
          {playerId && phase === "countdown" && (
            <motion.div key="p-countdown" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-6 text-center">
              <motion.div className="text-sm font-black text-white/50"
                animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1.5 }}>
                جاري تجهيز الجولة...
              </motion.div>
              <motion.div key={countdown}
                initial={{ scale: 1.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                className="text-9xl font-black"
                style={{ color: neonPurple, textShadow: `0 0 50px ${neonPurple}80` }}>
                {countdown}
              </motion.div>
              <div className="flex gap-2">
                {[0,1,2,3,4].map(i => (
                  <div key={i} className="w-2 h-2 rounded-full transition-all duration-500"
                    style={{ background: i < (5 - countdown) ? neonPurple : "rgba(255,255,255,0.15)" }} />
                ))}
              </div>
            </motion.div>
          )}

          {/* ── REVEAL (player) ── */}
          {playerId && phase === "reveal" && myRole && (
            <motion.div key="p-reveal" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
              className="w-full flex flex-col items-center gap-5 text-center">
              {myRole.role === "imposter" ? (
                <div className="w-full rounded-3xl p-7 flex flex-col items-center gap-4"
                  style={{ background: "rgba(239,68,68,0.12)", border: "2px solid #ef4444" }}>
                  <motion.span style={{ fontSize: 64 }}
                    animate={{ rotate: [0,-10,10,0] }} transition={{ repeat: Infinity, duration: 2 }}>🕵️</motion.span>
                  <p className="text-3xl font-black text-red-400">برا السالفة! 🤫</p>
                  <p className="text-sm text-red-300/60">أجب بذكاء دون أن يكشفوك</p>
                  <div className="w-full rounded-2xl px-5 py-3 mt-1"
                    style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)" }}>
                    <p className="text-[10px] text-red-400/50 mb-1">ملاحظة</p>
                    <p className="text-sm text-white/70">أنت لا تعرف الكلمة — حاول اكتشافها من السياق!</p>
                  </div>
                </div>
              ) : (
                <div className="w-full rounded-3xl p-7 flex flex-col items-center gap-4"
                  style={{ background: "rgba(34,197,94,0.12)", border: "2px solid #22c55e" }}>
                  <motion.span style={{ fontSize: 64 }}
                    animate={{ scale: [1,1.08,1] }} transition={{ repeat: Infinity, duration: 2 }}>😎</motion.span>
                  <p className="text-2xl font-black text-green-400">جوا السالفة ✅</p>
                  <div className="w-full rounded-2xl px-6 py-4"
                    style={{ background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.4)" }}>
                    <p className="text-xs text-green-400/60 mb-2">📍 المكان / السالفة</p>
                    <p className="text-3xl font-black text-white">{myRole.word}</p>
                  </div>
                  <p className="text-xs text-green-300/50">اكشف من هو برا السالفة!</p>
                </div>
              )}
              <motion.p className="text-xs text-white/20"
                animate={{ opacity: [0.3, 0.8, 0.3] }} transition={{ repeat: Infinity, duration: 1.8 }}>
                ستبدأ اللعبة بعد لحظات...
              </motion.p>
            </motion.div>
          )}

          {/* ── PLAYING (unified: ask + answer + wait) ── */}
          {playerId && phase === "playing" && (
            <motion.div key="p-playing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="w-full flex flex-col gap-3">

              {/* ── SPECTATOR BANNER (eliminated player) ── */}
              {iAmEliminated && (
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-3 px-4 py-3 rounded-2xl"
                  style={{ background: "rgba(239,68,68,0.10)", border: "1.5px solid rgba(239,68,68,0.35)" }}>
                  <span className="text-xl flex-shrink-0">🚪</span>
                  <div className="flex-1">
                    <p className="text-sm font-black text-red-400">تم إقصاؤك من الجولة</p>
                    <p className="text-[10px] text-white/35 mt-0.5">أنت الآن مشاهد فقط — تابع اللعبة دون مشاركة</p>
                  </div>
                  <motion.span className="text-xs font-black px-2 py-1 rounded-lg"
                    style={{ background: "rgba(239,68,68,0.2)", color: "#f87171" }}
                    animate={{ opacity: [0.6, 1, 0.6] }} transition={{ repeat: Infinity, duration: 2 }}>
                    مشاهد
                  </motion.span>
                </motion.div>
              )}

              {/* Role badge */}
              {myRole && !iAmEliminated && (
                <div className="flex items-center justify-between px-3 py-2 rounded-xl"
                  style={{ background: myRole.role === "imposter" ? "rgba(239,68,68,0.12)" : "rgba(34,197,94,0.1)",
                    border: `1px solid ${myRole.role === "imposter" ? "#ef444435" : "#22c55e35"}` }}>
                  <span className="text-xs font-black" style={{ color: myRole.role === "imposter" ? "#ef4444" : "#22c55e" }}>
                    {myRole.role === "imposter" ? "🕵️ أنت برا السالفة" : `😎 الكلمة: ${myRole.word}`}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <Clock size={10} color={turnRemaining < 15_000 ? "#ef4444" : "rgba(255,255,255,0.35)"}/>
                    <span className="text-[10px] font-black"
                      style={{ color: turnRemaining < 15_000 ? "#ef4444" : "rgba(255,255,255,0.35)" }}>
                      {Math.ceil(turnRemaining/1000)}
                    </span>
                  </div>
                </div>
              )}

              {/* Current turn + location */}
              <div className="rounded-xl px-3 py-2 flex items-center justify-between"
                style={{ background: "rgba(10,4,24,0.85)", border: `1px solid ${neonPurple}25` }}>
                <div className="flex items-center gap-2">
                  <span className="text-xs">📍</span>
                  <span className="text-xs font-black text-white/60">{gameState?.word ?? "..."}</span>
                </div>
                <span className="text-xs font-black" style={{ color: neonPurple }}>
                  {currentTurnPlayer?.id === playerId ? "🎯 دورك!" : `🎮 دور ${currentTurnPlayer?.name ?? "..."}`}
                </span>
              </div>

              {/* Q&A History */}
              <div className="rounded-xl flex flex-col gap-1.5 max-h-40 overflow-y-auto"
                style={{ background: "rgba(10,4,24,0.80)", border: "1px solid rgba(255,255,255,0.07)" }}>
                <div className="px-3 pt-2 pb-1 border-b" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
                  <span className="text-[10px] font-black text-white/40">📋 سجل الأسئلة</span>
                </div>
                <div className="p-2 flex flex-col gap-1.5">
                  {(gameState?.qaHistory ?? []).length === 0 ? (
                    <p className="text-center text-white/20 text-[10px] py-2">لا يوجد أسئلة بعد...</p>
                  ) : (
                    [...(gameState?.qaHistory ?? [])].reverse().map((qa, idx) => (
                      <div key={idx} className="rounded-lg p-2 flex flex-col gap-0.5"
                        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                        <div className="flex items-center gap-1 text-[9px] font-black" style={{ color: neonCyan }}>
                          <span>{qa.askerName}</span><span className="text-white/25">→</span>
                          <span style={{ color: neonPurple }}>{qa.targetName}</span>
                        </div>
                        <p className="text-[10px] text-white/65">❓ {qa.question}</p>
                        {qa.timedOut ? (
                          <span className="inline-flex items-center gap-1 text-[9px] font-black text-orange-400/70">
                            <span>⏰</span><span>انتهى الوقت</span>
                          </span>
                        ) : (
                          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-black w-fit ${qa.answer === "نعم" ? "text-green-300" : "text-red-400"}`}
                            style={{ background: qa.answer === "نعم" ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)", border: `1px solid ${qa.answer === "نعم" ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}` }}>
                            {qa.answer === "نعم" ? "✅" : "❌"} {qa.answer}
                          </span>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Active Q (waiting for answer) */}
              {gameState?.currentQuestion && !needAnswer && !isMyTurn && (
                <div className="rounded-xl p-3 flex flex-col gap-1.5"
                  style={{ background: `${neonPurple}10`, border: `1px solid ${neonPurple}30` }}>
                  <p className="text-[10px] font-black" style={{ color: neonCyan }}>
                    {currentTurnPlayer?.name} → {targetPlayer?.name}
                  </p>
                  <p className="text-sm font-bold text-white">❓ {gameState.currentQuestion}</p>
                  <motion.p className="text-[10px] text-white/35"
                    animate={{ opacity: [0.4,1,0.4] }} transition={{ repeat: Infinity, duration: 1.5 }}>
                    ينتظر الرد...
                  </motion.p>
                </div>
              )}

              {/* MY TURN — ask (spectator cannot ask) */}
              {isMyTurn && !iAmEliminated && (
                <div className="rounded-xl p-3 flex flex-col gap-3"
                  style={{ background: `${neonPurple}12`, border: `2px solid ${neonPurple}50` }}>
                  <motion.p className="text-sm font-black text-center" style={{ color: neonPurple }}
                    animate={{ scale: [1,1.06,1] }} transition={{ repeat: Infinity, duration: 1 }}>
                    🎯 دورك — اسأل أحد اللاعبين!
                  </motion.p>

                  {/* Target selector — exclude self, disconnected, eliminated */}
                  <div className="grid grid-cols-3 gap-1.5">
                    {players.filter(p => p.id !== playerId && !p.disconnected && !p.eliminated).map((p, i) => (
                      <button key={p.id} onClick={() => setSelectedTarget(selectedTarget === p.id ? "" : p.id)}
                        className="flex flex-col items-center gap-1 p-2 rounded-xl transition-all"
                        style={{
                          background: selectedTarget === p.id ? `${playerColor(i)}20` : "rgba(255,255,255,0.04)",
                          border: `2px solid ${selectedTarget === p.id ? playerColor(i) : "rgba(255,255,255,0.08)"}`,
                        }}>
                        <div className="w-10 h-10 rounded-lg overflow-hidden border"
                          style={{ borderColor: playerColor(i) + "60" }}>
                          <img src={p.avatar} alt={p.name} className="w-full h-full object-cover"/>
                        </div>
                        <p className="text-[9px] font-black truncate w-full text-center"
                          style={{ color: selectedTarget === p.id ? playerColor(i) : "rgba(255,255,255,0.45)" }}>
                          {p.name}
                        </p>
                      </button>
                    ))}
                  </div>

                  {/* Question input */}
                  <textarea value={questionText} onChange={e => setQuestionText(e.target.value)}
                    placeholder="اكتب سؤالك هنا..."
                    rows={2}
                    className="w-full bg-transparent border rounded-xl px-3 py-2 text-white text-sm placeholder-white/25 focus:outline-none resize-none text-right"
                    style={{ borderColor: "rgba(255,255,255,0.15)" }}/>

                  <motion.button onClick={handleSendQuestion}
                    disabled={!selectedTarget || !questionText.trim()}
                    className="w-full py-3 rounded-xl font-black text-white text-sm disabled:opacity-30"
                    style={{ background: `linear-gradient(135deg,#7c3aed,${neonPurple})` }}
                    whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.96 }}>
                    إرسال السؤال ✈️
                  </motion.button>
                </div>
              )}

              {/* ANSWER — نعم / لا (spectator cannot answer) */}
              {needAnswer && !iAmEliminated && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.88, y: 12 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  transition={{ type: "spring", stiffness: 260, damping: 22 }}
                  className="rounded-2xl p-4 flex flex-col gap-4"
                  style={{ background: "rgba(0,229,255,0.07)", border: `2px solid ${neonCyan}55` }}>

                  {/* Header */}
                  <div className="flex items-center justify-center gap-2">
                    <motion.span className="text-xl"
                      animate={{ rotate: [0,-12,12,0] }} transition={{ repeat: Infinity, duration: 1 }}>👈</motion.span>
                    <p className="text-sm font-black" style={{ color: neonCyan }}>وُجّه إليك سؤال!</p>
                  </div>

                  {/* Question bubble */}
                  {gameState?.currentQuestion && (
                    <div className="rounded-xl px-4 py-3 text-center"
                      style={{ background: `${neonPurple}18`, border: `1px solid ${neonPurple}35` }}>
                      <p className="text-[10px] text-purple-400/50 mb-1">السؤال</p>
                      <p className="text-sm font-bold text-white leading-relaxed">❓ {gameState.currentQuestion}</p>
                    </div>
                  )}

                  {/* Who asked */}
                  {(() => {
                    const asker = players.find(p => p.id === currentTurnId);
                    return asker ? (
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-7 h-7 rounded-lg overflow-hidden border border-purple-500/40">
                          <img src={asker.avatar} alt={asker.name} className="w-full h-full object-cover"/>
                        </div>
                        <p className="text-[10px] text-white/40">{asker.name} ينتظر ردك...</p>
                      </div>
                    ) : null;
                  })()}

                  {/* YES / NO buttons */}
                  <div className="grid grid-cols-2 gap-3">
                    <motion.button
                      onClick={() => handleSendAnswer("yes")}
                      className="py-5 rounded-2xl text-2xl font-black text-white flex flex-col items-center gap-1"
                      style={{ background: "linear-gradient(135deg,#16a34a,#22c55e)", boxShadow: "0 6px 24px #22c55e45" }}
                      whileHover={{ scale: 1.06, boxShadow: "0 8px 32px #22c55e70" }}
                      whileTap={{ scale: 0.91 }}>
                      ✅
                      <span className="text-sm font-black">نعم</span>
                    </motion.button>
                    <motion.button
                      onClick={() => handleSendAnswer("no")}
                      className="py-5 rounded-2xl text-2xl font-black text-white flex flex-col items-center gap-1"
                      style={{ background: "linear-gradient(135deg,#dc2626,#ef4444)", boxShadow: "0 6px 24px #ef444445" }}
                      whileHover={{ scale: 1.06, boxShadow: "0 8px 32px #ef444470" }}
                      whileTap={{ scale: 0.91 }}>
                      ❌
                      <span className="text-sm font-black">لا</span>
                    </motion.button>
                  </div>

                  {/* Answer timer */}
                  <div className="flex items-center gap-2 px-1">
                    <div className="flex-1 h-1 rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
                      <motion.div className="h-full rounded-full"
                        style={{ background: neonCyan }}
                        initial={{ width: "100%" }}
                        animate={{ width: "0%" }}
                        transition={{ duration: 45, ease: "linear" }}/>
                    </div>
                    <span className="text-[9px] text-white/30">45s</span>
                  </div>
                </motion.div>
              )}

              {/* Players mini row */}
              <div className="flex gap-1.5 flex-wrap justify-center">
                {players.map((p, i) => {
                  const isCur = p.id === currentTurnId;
                  const isTgt = p.id === currentTargetId;
                  const isMe  = p.id === playerId;
                  return (
                    <div key={p.id} className="flex flex-col items-center gap-0.5"
                      title={p.name}>
                      <div className="w-9 h-9 rounded-lg overflow-hidden"
                        style={{ border: `2px solid ${isCur ? neonPurple : isTgt ? neonCyan : isMe ? "#ffd600" : playerColor(i) + "40"}` }}>
                        <img src={p.avatar} alt={p.name} className="w-full h-full object-cover"/>
                      </div>
                      <p className="text-[8px] font-black" style={{ color: isCur ? neonPurple : isTgt ? neonCyan : isMe ? "#ffd600" : playerColor(i) + "80" }}>
                        {p.name.slice(0,5)}
                      </p>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* ── VOTING ── */}
          {playerId && phase === "voting" && (
            <motion.div key="p-vote" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="w-full flex flex-col items-center gap-5">
              <div className="text-center">
                <p className="text-2xl font-black" style={{ color: "#ffd600" }}>🗳️ من هو برا السالفة؟</p>
                <p className="text-sm text-purple-400/40 mt-1">اختر اللاعب الذي تظن أنه برا السالفة</p>
              </div>
              {myPlayer?.voted ? (
                <div className="text-center p-6">
                  <p className="text-4xl mb-3">✅</p>
                  <p className="text-green-400 font-black">تم تسجيل صوتك!</p>
                  <p className="text-purple-400/35 text-sm mt-1">في انتظار بقية اللاعبين...</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 w-full">
                  {players.filter(p => p.id !== playerId && !p.disconnected && !p.eliminated).map((p, i) => (
                    <motion.button key={p.id} onClick={() => handleVote(p.id)}
                      className="flex flex-col items-center gap-2 p-4 rounded-2xl"
                      style={{ background: "rgba(10,4,24,0.88)", border: `2px solid ${playerColor(i)}40` }}
                      whileHover={{ scale: 1.04, borderColor: playerColor(i) }}
                      whileTap={{ scale: 0.93 }}>
                      <div className="w-12 h-12 rounded-xl overflow-hidden border-2" style={{ borderColor: playerColor(i) + "70" }}>
                        <img src={p.avatar} alt={p.name} className="w-full h-full object-cover"/>
                      </div>
                      <p className="text-xs font-black" style={{ color: playerColor(i) }}>{p.name}</p>
                    </motion.button>
                  ))}
                  <motion.button onClick={() => handleVote("skip")}
                    className="col-span-2 py-3 rounded-2xl font-bold text-sm text-purple-400/40 border border-purple-500/15 hover:text-purple-300 hover:border-purple-400/25 transition-all"
                    whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.97 }}>
                    تخطي ↩
                  </motion.button>
                </div>
              )}
            </motion.div>
          )}

          {/* ── ELIMINATION ── */}
          {phase === "elimination" && eliminationInfo && (
            <EliminationScreen info={eliminationInfo} players={players} />
          )}

          {/* ── RESULT ── */}
          {phase === "result" && result && (
            <ResultScreen result={result} players={players}
              onNewRound={() => { setResult(null); setEliminationInfo(null); setMyRole(null); setIsMyTurn(false); setNeedAnswer(false); }}
              onHome={() => navigate("/")} isHost={false} />
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}

// ─── Elimination Screen ────────────────────────────────────────────────────────
function EliminationScreen({ info, players }: { info: EliminationInfo; players: PublicPlayer[] }) {
  const eliminatedPlayer = players.find(p => p.id === info.eliminatedId);
  const topVotes = info.counts[info.eliminatedId] ?? 0;

  return (
    <motion.div key="elimination" initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center px-4 text-center"
      style={{ background: "rgba(5,0,18,0.96)" }} dir="rtl">

      <motion.div initial={{ y: -30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1 }}
        className="mb-6 text-6xl">🚪</motion.div>

      <motion.p initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 }}
        className="text-2xl font-black text-white mb-1">
        خرج من اللعبة!
      </motion.p>

      {eliminatedPlayer && (
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.35, type: "spring" }}
          className="my-5 flex flex-col items-center gap-3">
          <div className="w-20 h-20 rounded-2xl overflow-hidden border-4 border-red-500/60 shadow-lg shadow-red-500/20">
            <img src={eliminatedPlayer.avatar} alt={eliminatedPlayer.name} className="w-full h-full object-cover" />
          </div>
          <p className="text-xl font-black text-red-400">{eliminatedPlayer.name}</p>
          <p className="text-sm text-white/40">حصل على {topVotes} {topVotes === 1 ? "صوت" : "أصوات"}</p>
        </motion.div>
      )}

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }}
        className="px-6 py-3 rounded-2xl mb-6"
        style={{ background: "rgba(234,179,8,0.12)", border: "1.5px solid rgba(234,179,8,0.35)" }}>
        <p className="text-lg font-black text-yellow-400">GG تعيش وتاكل غيرها 😅</p>
      </motion.div>

      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.75 }}
        className="text-sm text-white/40">
        اللعبة مستمرة... الكذاب لا يزال بينكم 🕵️
      </motion.p>

      {/* Progress bar */}
      <motion.div className="mt-6 w-48 h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.1)" }}>
        <motion.div className="h-full rounded-full"
          style={{ background: "rgba(234,179,8,0.7)" }}
          initial={{ width: "100%" }}
          animate={{ width: "0%" }}
          transition={{ duration: 4, ease: "linear" }} />
      </motion.div>
    </motion.div>
  );
}

// ─── Result Screen ─────────────────────────────────────────────────────────────
function ResultScreen({ result, players, onNewRound, onHome, isHost }:
  { result: Result; players: PublicPlayer[]; onNewRound: () => void; onHome: () => void; isHost: boolean }) {
  const playersWon    = result.winner === "players";
  const imposterPlayer = players.find(p => p.id === result.imposterId);

  return (
    <motion.div key="result" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center px-4 text-center"
      style={{ background: "rgba(5,0,18,0.97)" }} dir="rtl">

      {[...Array(16)].map((_, i) => (
        <motion.div key={i} className="absolute text-xl pointer-events-none"
          style={{ left: `${Math.random()*100}%`, top: "-10%" }}
          animate={{ y: "110vh", rotate: [0,360], opacity: [1,0] }}
          transition={{ duration: 2+Math.random()*2, delay: Math.random()*1.5, repeat: Infinity }}>
          {["🎉","⭐","🕵️","💫","🎊","✨","🏆","🎈"][i % 8]}
        </motion.div>
      ))}

      <div className="relative z-10 flex flex-col items-center gap-6 max-w-sm w-full">
        <motion.div style={{ fontSize: 72 }}
          animate={{ rotate: [0,-10,10,0], y: [0,-10,0] }}
          transition={{ duration: 0.8, delay: 0.2 }}>
          {playersWon ? "🏆" : "🕵️"}
        </motion.div>

        <p className="text-3xl font-black"
          style={{ color: playersWon ? "#22c55e" : "#ef4444", textShadow: `0 0 24px ${playersWon ? "#22c55e" : "#ef4444"}80` }}>
          {playersWon ? "اللاعبون فازوا! 🎉" : "برا السالفة فاز! 🕵️"}
        </p>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
          className="w-full p-5 rounded-3xl flex flex-col items-center gap-3"
          style={{ background: "rgba(10,4,24,0.92)", border: "2px solid rgba(239,68,68,0.45)" }}>
          <p className="text-xs font-bold text-red-400/60">برا السالفة كان...</p>
          {imposterPlayer && (
            <div className="w-16 h-16 rounded-2xl overflow-hidden border-2"
              style={{ borderColor: "#ef4444", boxShadow: "0 0 22px rgba(239,68,68,0.5)" }}>
              <img src={imposterPlayer.avatar} alt={imposterPlayer.name} className="w-full h-full object-cover"/>
            </div>
          )}
          <p className="text-2xl font-black text-red-400">{result.imposterName}</p>
          <div className="px-5 py-2 rounded-xl"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}>
            <p className="text-xs text-purple-400/45 mb-0.5">الكلمة كانت</p>
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
            style={{ background: "rgba(139,92,246,0.14)", border: "1px solid rgba(139,92,246,0.28)" }}
            whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.97 }}>
            الرئيسية
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}
