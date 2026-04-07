import { useState, useRef, useCallback, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Copy, Check, Users, Clock, SkipForward, Lock, Unlock } from "lucide-react";

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

interface PublicPlayer {
  id: string; name: string; avatar: string;
  connected: boolean; voted: boolean; disconnected: boolean;
}
interface GameState {
  code: string; roomName: string; category: Category; durationMs: number;
  phase: "lobby" | "playing" | "voting" | "result";
  players: PublicPlayer[]; playerOrder: string[];
  currentTurnIdx: number; currentTurnId: string | null;
  currentTargetId: string | null;
  lastAnswer: { targetId: string; answer: string } | null;
  gameRemaining: number; turnRemaining: number;
}
interface Role { role: "imposter" | "player"; word?: string }
interface Result {
  imposterName: string; imposterId: string; word: string;
  winner: "players" | "imposter";
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

  // ── Host state ─────────────────────────────────────────────────────────────
  const [setupDone, setSetupDone] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<Category>("عام");
  const [selectedDuration, setSelectedDuration] = useState(10);
  const [streamerBoxVisible, setStreamerBoxVisible] = useState(false);
  const [creating, setCreating] = useState(false);

  // ── Core WS state ──────────────────────────────────────────────────────────
  const wsRef    = useRef<WebSocket | null>(null);
  const [wsReady, setWsReady] = useState(false);
  const [gameState, setGameState]   = useState<GameState | null>(null);
  const [result, setResult]         = useState<Result | null>(null);
  const [error, setError]           = useState<string | null>(null);
  const [copied, setCopied]         = useState(false);
  const [roomCode, setRoomCode]     = useState<string>(roomParam);

  // ── Player state ───────────────────────────────────────────────────────────
  const [playerName, setPlayerName] = useState("");
  const [playerId, setPlayerId]     = useState<string | null>(null);
  const [myRole, setMyRole]         = useState<Role | null>(null);
  const [isMyTurn, setIsMyTurn]     = useState(false);
  const [needAnswer, setNeedAnswer] = useState(false);

  // ── Timers ─────────────────────────────────────────────────────────────────
  const [gameRemaining, setGameRemaining] = useState(0);
  const [turnRemaining, setTurnRemaining] = useState(0);

  const playerIdRef  = useRef<string | null>(null);
  const gameStateRef = useRef<GameState | null>(null);
  useEffect(() => { playerIdRef.current = playerId; }, [playerId]);
  useEffect(() => { gameStateRef.current = gameState; }, [gameState]);

  // ── WS send ────────────────────────────────────────────────────────────────
  const wsSend = useCallback((msg: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN)
      wsRef.current.send(JSON.stringify(msg));
  }, []);

  // ── Connect & message handler ──────────────────────────────────────────────
  const connectWs = useCallback((isHost: boolean, opts?: { category: Category; duration: number }) => {
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
        if (msg.type === "imposter:role")    setMyRole({ role: msg.role, word: msg.word ?? undefined });
        if (msg.type === "imposter:your_turn") { setIsMyTurn(true); setNeedAnswer(false); }
        if (msg.type === "imposter:answer_now") { setNeedAnswer(true); setIsMyTurn(false); }
        if (msg.type === "imposter:answered")  setNeedAnswer(false);
        if (msg.type === "imposter:result")    setResult(msg as Result);
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
  }, [connectWs, mode]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleConfirmCreate = () => {
    if (creating) return;
    setCreating(true);
    connectWs(true, { category: selectedCategory, duration: selectedDuration });
  };

  const handleJoin = () => {
    const name = playerName.trim();
    if (!name || !roomParam) return;
    wsSend({ type: "imposter:join", room: roomParam, name, avatar: dicebear(name) });
  };

  const handleStart        = ()             => wsSend({ type: "imposter:start" });
  const handleForceVote    = ()             => wsSend({ type: "imposter:force_vote" });
  const handleNewRound     = ()             => { setResult(null); setMyRole(null); setIsMyTurn(false); setNeedAnswer(false); wsSend({ type: "imposter:new_round" }); };
  const handleSelectTarget = (t: string)   => { wsSend({ type: "imposter:select_target", targetId: t }); setIsMyTurn(false); };
  const handleAnswer       = (a: "yes"|"no") => { wsSend({ type: "imposter:answer", answer: a }); setNeedAnswer(false); };
  const handleVote         = (t: string)   => wsSend({ type: "imposter:vote", voterId: playerIdRef.current, targetId: t });
  const handleRemove       = (pid: string) => wsSend({ type: "imposter:remove_player", playerId: pid });

  const copyLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}?room=${roomCode}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── Derived ────────────────────────────────────────────────────────────────
  const phase           = gameState?.phase ?? "lobby";
  const players         = gameState?.players ?? [];
  const currentTurnId   = gameState?.currentTurnId;
  const currentTargetId = gameState?.currentTargetId;
  const myPlayer        = players.find(p => p.id === playerId);
  const currentTurnPlayer  = players.find(p => p.id === currentTurnId);
  const targetPlayer       = currentTargetId ? players.find(p => p.id === currentTargetId) : null;
  const inviteUrl       = `${window.location.origin}${window.location.pathname}?room=${roomCode}`;

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

            {/* ─────────── SCREEN 1: Settings Card (shown immediately) ─────────── */}
            {!setupDone && (
              <motion.div key="create"
                initial={{ opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
                className="flex flex-col items-center justify-center flex-1 px-4 py-4">

                <div className="w-full max-w-sm flex flex-col gap-5 p-6 rounded-3xl"
                  style={{ background: "rgba(10,4,24,0.95)", border: `2px solid ${neonPurple}45`,
                    boxShadow: `0 12px 60px rgba(0,0,0,0.7), 0 0 40px ${neonPurple}15` }}>

                  {/* Card header */}
                  <div className="flex flex-col items-center gap-2 text-center pb-2"
                    style={{ borderBottom: `1px solid ${neonPurple}20` }}>
                    <motion.span style={{ fontSize: 48, filter: `drop-shadow(0 0 16px ${neonPurple}80)` }}
                      animate={{ y: [0, -5, 0] }} transition={{ repeat: Infinity, duration: 2.5, ease: "easeInOut" }}>
                      🕵️
                    </motion.span>
                    <h1 className="text-2xl font-black" style={{ color: neonPurple, textShadow: `0 0 20px ${neonPurple}60` }}>
                      برا السالفة
                    </h1>
                    <p className="text-[11px] text-purple-400/40 font-bold">إعدادات الغرفة</p>
                  </div>

                  {/* Category */}
                  <div className="flex flex-col gap-2.5">
                    <p className="text-xs font-black text-purple-300/60">الفئة</p>
                    <div className="grid grid-cols-5 gap-1.5">
                      {([
                        { id: "عام"     as Category, emoji: "🎲", color: "#22c55e" },
                        { id: "دول"     as Category, emoji: "🌍", color: "#3b82f6" },
                        { id: "حيوانات"as Category, emoji: "🦁", color: "#f97316" },
                        { id: "أكلات"  as Category, emoji: "🍕", color: "#ef4444" },
                        { id: "أشياء"  as Category, emoji: "📦", color: "#a78bfa" },
                      ]).map(cat => {
                        const active = selectedCategory === cat.id;
                        return (
                          <motion.button key={cat.id} onClick={() => setSelectedCategory(cat.id)}
                            className="flex flex-col items-center gap-1 py-2.5 rounded-xl transition-all"
                            style={{
                              background: active ? cat.color + "22" : "rgba(255,255,255,0.04)",
                              border: `2px solid ${active ? cat.color : "rgba(255,255,255,0.07)"}`,
                              boxShadow: active ? `0 0 12px ${cat.color}40` : "none",
                            }}
                            whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.94 }}>
                            <span style={{ fontSize: 18 }}>{cat.emoji}</span>
                            <span className="text-[9px] font-black leading-none"
                              style={{ color: active ? cat.color : "rgba(255,255,255,0.30)" }}>
                              {cat.id}
                            </span>
                          </motion.button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Duration */}
                  <div className="flex flex-col gap-2.5">
                    <p className="text-xs font-black text-purple-300/60">⏱ مدة الجلسة</p>
                    <div className="grid grid-cols-4 gap-1.5">
                      {[5, 10, 15, 20].map(d => {
                        const active = selectedDuration === d;
                        return (
                          <motion.button key={d} onClick={() => setSelectedDuration(d)}
                            className="py-3 rounded-xl font-black text-sm flex flex-col items-center gap-0.5 transition-all"
                            style={{
                              background: active ? `${neonCyan}18` : "rgba(255,255,255,0.04)",
                              border: `2px solid ${active ? neonCyan : "rgba(255,255,255,0.07)"}`,
                              color: active ? neonCyan : "rgba(255,255,255,0.35)",
                              boxShadow: active ? `0 0 12px ${neonCyan}35` : "none",
                            }}
                            whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.94 }}>
                            <span className="text-base leading-none">{d}</span>
                            <span style={{ fontSize: 9 }}>دقيقة</span>
                          </motion.button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Streamer mode toggle */}
                  <div className="flex items-center justify-between px-1 py-1"
                    style={{ borderTop: `1px solid ${neonPurple}15` }}>
                    <div className="flex items-center gap-2">
                      <span className="text-base">🎥</span>
                      <div>
                        <p className="text-xs font-black text-white/60">وضع الستريمر</p>
                        <p className="text-[10px] text-purple-400/30">مربع أسود قابل للسحب</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setStreamerBoxVisible(v => !v)}
                      className="relative w-11 h-6 rounded-full transition-all"
                      style={{
                        background: streamerBoxVisible
                          ? "linear-gradient(135deg,#7c3aed,#e040fb)"
                          : "rgba(255,255,255,0.10)",
                      }}>
                      <motion.span
                        className="absolute top-0.5 w-5 h-5 rounded-full bg-white"
                        animate={{ right: streamerBoxVisible ? 2 : undefined, left: streamerBoxVisible ? undefined : 2 }}
                        transition={{ type: "spring", stiffness: 300, damping: 25 }}
                        style={{ boxShadow: "0 1px 4px rgba(0,0,0,0.4)" }}
                      />
                    </button>
                  </div>

                  {/* Create button */}
                  <motion.button onClick={handleConfirmCreate} disabled={creating}
                    className="w-full py-4 rounded-2xl font-black text-white text-base btn-shimmer disabled:opacity-50"
                    style={{ background: "linear-gradient(135deg,#7c3aed,#e040fb)", boxShadow: `0 6px 32px ${neonPurple}55` }}
                    whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                    {creating ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>
                        جاري الإنشاء...
                      </span>
                    ) : "إنشاء الغرفة 🚀"}
                  </motion.button>
                </div>
              </motion.div>
            )}

            {/* ─────────── SCREEN 2: Lobby ─────────── */}
            {setupDone && phase === "lobby" && (
              <motion.div key="lobby"
                initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
                className="flex flex-col flex-1 px-4 pb-6 gap-4 max-w-2xl mx-auto w-full">

                {/* ── Start button — TOP, prominent ── */}
                <div className="mt-2">
                  <motion.button
                    onClick={handleStart}
                    disabled={players.length < 3}
                    className="w-full py-4 rounded-2xl font-black text-white text-lg btn-shimmer disabled:opacity-30 disabled:cursor-not-allowed relative overflow-hidden"
                    style={{
                      background: players.length >= 3
                        ? "linear-gradient(135deg,#16a34a,#22c55e,#16a34a)"
                        : "rgba(255,255,255,0.06)",
                      border: players.length >= 3 ? "none" : "2px solid rgba(255,255,255,0.1)",
                      boxShadow: players.length >= 3 ? "0 6px 32px rgba(34,197,94,0.50)" : "none",
                      color: players.length >= 3 ? "#fff" : "rgba(255,255,255,0.3)",
                    }}
                    whileHover={players.length >= 3 ? { scale: 1.03 } : {}}
                    whileTap={players.length >= 3 ? { scale: 0.97 } : {}}>
                    {players.length >= 3
                      ? `▶ ابدأ اللعبة  (${players.length} لاعبين)`
                      : `يلزم ${3 - players.length} لاعبين إضافيين للبدء`}
                  </motion.button>
                </div>

                {/* ── Invite section ── */}
                <div className="rounded-2xl p-4 flex flex-col gap-3"
                  style={{ background: "rgba(10,4,24,0.90)", border: `1px solid ${neonPurple}30` }}>

                  {/* Room meta */}
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-purple-400/50 font-bold">رمز الغرفة</p>
                    <p className="text-2xl font-black tracking-widest"
                      style={{ color: neonPurple, textShadow: `0 0 18px ${neonPurple}80` }}>
                      {roomCode}
                    </p>
                  </div>

                  {/* Link row */}
                  <div className="flex gap-2 items-center">
                    <input
                      readOnly
                      value={inviteUrl}
                      onClick={e => (e.target as HTMLInputElement).select()}
                      className="flex-1 text-xs px-3 py-2.5 rounded-xl text-purple-300/60 bg-transparent border cursor-text focus:outline-none"
                      style={{ borderColor: `${neonPurple}25`, direction: "ltr", fontFamily: "monospace" }}
                    />
                    <motion.button
                      onClick={copyLink}
                      className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-black whitespace-nowrap transition-all shrink-0"
                      style={{
                        background: copied ? "rgba(34,197,94,0.2)" : `${neonPurple}20`,
                        border: `1px solid ${copied ? "rgba(34,197,94,0.5)" : `${neonPurple}45`}`,
                        color: copied ? "#22c55e" : neonPurple,
                      }}
                      whileTap={{ scale: 0.94 }}>
                      {copied ? <Check size={14}/> : <Copy size={14}/>}
                      {copied ? "تم!" : "نسخ"}
                    </motion.button>
                  </div>
                </div>

                {/* ── Players ── */}
                <div className="flex flex-col gap-3 flex-1">
                  <div className="flex items-center gap-2 text-purple-400/40 text-xs font-bold">
                    <Users size={13}/>
                    <span>اللاعبون ({players.length})</span>
                  </div>

                  {players.length === 0 ? (
                    <motion.div
                      className="flex flex-col items-center justify-center py-12 rounded-2xl"
                      style={{ border: "1px dashed rgba(224,64,251,0.2)" }}>
                      <motion.p
                        animate={{ opacity: [0.3, 0.7, 0.3] }}
                        transition={{ repeat: Infinity, duration: 2 }}
                        className="text-purple-400/35 text-sm font-bold">
                        في انتظار اللاعبين... 👀
                      </motion.p>
                      <p className="text-purple-400/20 text-xs mt-2">شارك رابط الدعوة أعلاه</p>
                    </motion.div>
                  ) : (
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                      <AnimatePresence>
                        {players.map((p, i) => (
                          <motion.div key={p.id}
                            initial={{ opacity: 0, scale: 0.65 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.5 }}
                            transition={{ type: "spring", stiffness: 280, damping: 22 }}
                            className="relative flex flex-col items-center gap-2 p-3 rounded-2xl group"
                            style={{ background: playerColor(i) + "0d", border: `2px solid ${playerColor(i)}35` }}>
                            <button onClick={() => handleRemove(p.id)}
                              className="absolute top-1 left-1 w-5 h-5 rounded-full hidden group-hover:flex items-center justify-center bg-red-500/20 hover:bg-red-500/50 text-red-400 text-xs font-black">
                              ✕
                            </button>
                            <div className="w-12 h-12 rounded-xl overflow-hidden border-2"
                              style={{ borderColor: playerColor(i), boxShadow: `0 0 10px ${playerColor(i)}40` }}>
                              <img src={p.avatar} alt={p.name} className="w-full h-full object-cover"/>
                            </div>
                            <p className="text-xs font-black truncate w-full text-center"
                              style={{ color: playerColor(i) }}>
                              {p.name}
                            </p>
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* ─────────── SCREEN 3: Playing (host view) ─────────── */}
            {setupDone && phase === "playing" && (
              <motion.div key="host-playing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="flex flex-col gap-4 flex-1 px-4 pb-4">

                {/* Timer bar */}
                <div className="flex items-center justify-between px-1">
                  <span className="text-xs text-purple-400/50 font-bold">وقت المتبقي</span>
                  <span className="text-lg font-black" style={{ color: gameRemaining < 60_000 ? "#ef4444" : neonCyan }}>
                    {fmt(gameRemaining)}
                  </span>
                </div>

                {/* Turn card */}
                <div className="rounded-2xl p-4 flex flex-col items-center gap-3"
                  style={{ background: "rgba(10,4,24,0.90)", border: `1px solid ${neonPurple}30` }}>
                  {currentTurnPlayer ? (
                    <>
                      <p className="text-[10px] text-purple-400/50 font-bold">يسأل الآن</p>
                      <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-xl overflow-hidden border-2"
                          style={{ borderColor: neonPurple, boxShadow: `0 0 14px ${neonPurple}60` }}>
                          <img src={currentTurnPlayer.avatar} alt={currentTurnPlayer.name} className="w-full h-full object-cover"/>
                        </div>
                        <p className="text-lg font-black" style={{ color: neonPurple }}>{currentTurnPlayer.name}</p>
                      </div>
                      {targetPlayer && (
                        <div className="flex items-center gap-2 px-4 py-1.5 rounded-xl"
                          style={{ background: `${neonCyan}15`, border: `1px solid ${neonCyan}40` }}>
                          <img src={targetPlayer.avatar} alt={targetPlayer.name} className="w-5 h-5 rounded-lg"/>
                          <p className="text-sm font-black" style={{ color: neonCyan }}>{targetPlayer.name}</p>
                        </div>
                      )}
                      <div className="w-full flex items-center gap-2 mt-1">
                        <div className="flex-1 h-1 rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
                          <motion.div className="h-full rounded-full"
                            style={{ background: turnRemaining < 15_000 ? "#ef4444" : neonCyan }}
                            animate={{ width: `${(turnRemaining / 60_000) * 100}%` }}
                            transition={{ duration: 0.5 }} />
                        </div>
                        <span className="text-xs font-black w-10 text-left"
                          style={{ color: turnRemaining < 15_000 ? "#ef4444" : neonCyan }}>
                          {fmt(turnRemaining)}
                        </span>
                      </div>
                    </>
                  ) : <p className="text-purple-400/40 text-sm">في انتظار الدور...</p>}
                </div>

                {/* Players mini grid */}
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 flex-1">
                  {players.map((p, i) => {
                    const isCur = p.id === currentTurnId;
                    const isTgt = p.id === currentTargetId;
                    return (
                      <div key={p.id} className="flex flex-col items-center gap-1.5 p-2 rounded-xl"
                        style={{
                          background: isCur ? `${neonPurple}15` : isTgt ? `${neonCyan}10` : "rgba(10,4,24,0.70)",
                          border: `2px solid ${isCur ? neonPurple : isTgt ? neonCyan : playerColor(i) + "20"}`,
                        }}>
                        <div className="w-9 h-9 rounded-lg overflow-hidden border"
                          style={{ borderColor: isCur ? neonPurple : isTgt ? neonCyan : playerColor(i) + "50" }}>
                          <img src={p.avatar} alt={p.name} className="w-full h-full object-cover"/>
                        </div>
                        <p className="text-[10px] font-black truncate w-full text-center"
                          style={{ color: isCur ? neonPurple : isTgt ? neonCyan : playerColor(i) }}>
                          {p.name}
                        </p>
                      </div>
                    );
                  })}
                </div>

                <button onClick={handleForceVote}
                  className="flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold text-purple-400/30 hover:text-red-400 border border-purple-500/10 hover:border-red-400/30 transition-all">
                  <SkipForward size={12}/> التخطي للتصويت
                </button>
              </motion.div>
            )}

            {/* ─────────── VOTING (host) ─────────── */}
            {setupDone && phase === "voting" && (
              <motion.div key="host-voting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="flex flex-col items-center gap-5 flex-1 px-4">
                <div className="text-center mt-4">
                  <p className="text-2xl font-black" style={{ color: "#ffd600" }}>🗳️ وقت التصويت!</p>
                  <p className="text-sm text-purple-400/40 mt-1">اللاعبون يختارون من هو برا السالفة</p>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 w-full max-w-2xl">
                  {players.map((p, i) => (
                    <div key={p.id} className="flex flex-col items-center gap-2 p-3 rounded-2xl"
                      style={{ background: "rgba(10,4,24,0.85)", border: `2px solid ${p.voted ? "#22c55e50" : playerColor(i) + "30"}` }}>
                      <div className="w-11 h-11 rounded-xl overflow-hidden border-2"
                        style={{ borderColor: p.voted ? "#22c55e" : playerColor(i) + "60" }}>
                        <img src={p.avatar} alt={p.name} className="w-full h-full object-cover"/>
                      </div>
                      <p className="text-[10px] font-black truncate w-full text-center" style={{ color: p.voted ? "#22c55e" : playerColor(i) }}>
                        {p.name}
                      </p>
                      <span className="text-[9px]" style={{ color: p.voted ? "#22c55e80" : "rgba(139,92,246,0.3)" }}>
                        {p.voted ? "✓ صوّت" : "ينتظر..."}
                      </span>
                    </div>
                  ))}
                </div>
              </motion.div>
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
                <div className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full mt-2"
                  style={{ background: `${neonPurple}18`, border: `1px solid ${neonPurple}40` }}>
                  <span className="text-sm font-black" style={{ color: neonPurple }}>الغرفة: {roomParam}</span>
                </div>
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

          {/* ── WAITING ── */}
          {playerId && phase === "lobby" && (
            <motion.div key="p-lobby" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-6 text-center">
              <motion.div style={{ fontSize: 72 }}
                animate={{ scale: [1,1.08,1], rotate: [0,5,-5,0] }}
                transition={{ repeat: Infinity, duration: 2 }}>🕵️</motion.div>
              <div>
                <p className="text-2xl font-black" style={{ color: neonPurple }}>
                  مرحباً {myPlayer?.name ?? playerName}!
                </p>
                <p className="text-purple-400/40 text-sm mt-1">في انتظار المضيف لبدء اللعبة...</p>
              </div>
              <div className="flex items-center gap-2 text-sm text-purple-400/35">
                <Users size={14}/> <span>{players.length} لاعب في الغرفة</span>
              </div>
            </motion.div>
          )}

          {/* ── ROLE REVEAL ── */}
          {playerId && phase === "playing" && myRole && !isMyTurn && !needAnswer && (() => {
            const isImposter = myRole.role === "imposter";
            return (
              <motion.div key="p-role"
                initial={{ opacity: 0, scale: 0.75 }} animate={{ opacity: 1, scale: 1 }}
                transition={{ type: "spring", stiffness: 200, damping: 18 }}
                className="w-full flex flex-col items-center gap-5 p-6 rounded-3xl text-center"
                style={{
                  background: isImposter ? "rgba(239,68,68,0.12)" : "rgba(34,197,94,0.12)",
                  border: `2px solid ${isImposter ? "#ef4444" : "#22c55e"}`,
                }}>
                <motion.span style={{ fontSize: 68 }}
                  animate={{ rotate: [0,-10,10,0] }} transition={{ repeat: Infinity, duration: 2 }}>
                  {isImposter ? "🕵️" : "😎"}
                </motion.span>
                {isImposter ? (
                  <div>
                    <p className="text-3xl font-black text-red-400">برا السالفة! 🤫</p>
                    <p className="text-sm text-red-300/60 mt-2">أجب بذكاء دون أن يكشفوك</p>
                  </div>
                ) : (
                  <div>
                    <p className="text-xl font-black text-green-400 mb-3">جوا السالفة ✅</p>
                    <div className="px-6 py-3 rounded-2xl"
                      style={{ background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.4)" }}>
                      <p className="text-xs text-green-400/60 mb-1">الكلمة السرية</p>
                      <p className="text-3xl font-black text-white">{myRole.word}</p>
                    </div>
                    <p className="text-xs text-green-300/50 mt-3">اكشف من هو برا السالفة!</p>
                  </div>
                )}
                <p className="text-xs text-purple-400/30">انتظر دورك...</p>
              </motion.div>
            );
          })()}

          {/* ── MY TURN ── */}
          {playerId && phase === "playing" && isMyTurn && (
            <motion.div key="p-ask" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="w-full flex flex-col items-center gap-4">
              <motion.div className="text-center"
                animate={{ scale: [1,1.08,1] }} transition={{ repeat: Infinity, duration: 1 }}>
                <p className="text-2xl font-black" style={{ color: neonPurple }}>دورك الآن! 🎯</p>
                <p className="text-sm text-purple-400/40 mt-1">اختر لاعباً تسأله</p>
              </motion.div>
              <div className="grid grid-cols-2 gap-3 w-full">
                {players.filter(p => p.id !== playerId && !p.disconnected).map((p, i) => (
                  <motion.button key={p.id} onClick={() => handleSelectTarget(p.id)}
                    className="flex flex-col items-center gap-2 p-4 rounded-2xl"
                    style={{ background: "rgba(10,4,24,0.90)", border: `2px solid ${playerColor(i)}40` }}
                    whileHover={{ scale: 1.04, borderColor: playerColor(i) }}
                    whileTap={{ scale: 0.95 }}>
                    <div className="w-14 h-14 rounded-2xl overflow-hidden border-2" style={{ borderColor: playerColor(i) }}>
                      <img src={p.avatar} alt={p.name} className="w-full h-full object-cover"/>
                    </div>
                    <p className="text-sm font-black" style={{ color: playerColor(i) }}>{p.name}</p>
                  </motion.button>
                ))}
              </div>
              <div className="w-full flex items-center gap-2">
                <div className="flex-1 h-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
                  <motion.div className="h-full rounded-full"
                    style={{ background: turnRemaining < 15_000 ? "#ef4444" : neonPurple }}
                    animate={{ width: `${(turnRemaining/60_000)*100}%` }} transition={{ duration: 0.5 }}/>
                </div>
                <span className="text-xs font-black" style={{ color: turnRemaining < 15_000 ? "#ef4444" : neonPurple }}>
                  {fmt(turnRemaining)}
                </span>
              </div>
            </motion.div>
          )}

          {/* ── ANSWER ── */}
          {playerId && phase === "playing" && needAnswer && (
            <motion.div key="p-answer" initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }}
              transition={{ type: "spring", stiffness: 220, damping: 20 }}
              className="w-full flex flex-col items-center gap-6 text-center">
              <motion.p className="text-2xl font-black" style={{ color: "#ffd600" }}
                animate={{ scale: [1,1.05,1] }} transition={{ repeat: Infinity, duration: 0.8 }}>
                وُجّه لك سؤال! 👈
              </motion.p>
              <p className="text-purple-400/50 text-sm">أجب بـ نعم أو لا فقط</p>
              <div className="flex gap-4 w-full">
                <motion.button onClick={() => handleAnswer("yes")}
                  className="flex-1 py-6 rounded-3xl text-3xl font-black text-white"
                  style={{ background: "linear-gradient(135deg,#16a34a,#22c55e)", boxShadow: "0 6px 28px #22c55e50" }}
                  whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.93 }}>
                  ✅ نعم
                </motion.button>
                <motion.button onClick={() => handleAnswer("no")}
                  className="flex-1 py-6 rounded-3xl text-3xl font-black text-white"
                  style={{ background: "linear-gradient(135deg,#dc2626,#ef4444)", boxShadow: "0 6px 28px #ef444450" }}
                  whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.93 }}>
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
                  {players.filter(p => p.id !== playerId && !p.disconnected).map((p, i) => (
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

          {/* ── RESULT ── */}
          {phase === "result" && result && (
            <ResultScreen result={result} players={players}
              onNewRound={() => { setResult(null); setMyRole(null); setIsMyTurn(false); setNeedAnswer(false); }}
              onHome={() => navigate("/")} isHost={false} />
          )}

        </AnimatePresence>
      </div>
    </div>
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
