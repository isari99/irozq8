import { useState, useRef, useCallback, useEffect } from "react";
import { useSearch, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Copy, Check, Users, Eye, EyeOff, Play, ChevronRight, Link2 } from "lucide-react";
import { fetchTwitchAvatar, fallbackAvatar } from "../lib/twitchUser";

// ─── WS URL ───────────────────────────────────────────────────────────────────
function getWsUrl(): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/ws`;
}

// ─── Theme ────────────────────────────────────────────────────────────────────
const GOLD = "#f59e0b";
const GOLD2 = "#fbbf24";
const DARK = "#0d0a00";

// ─── Glow background orbs (outside component to avoid re-mount) ───────────────
function ConvinceGlowOrbs() {
  return <>
    <div style={{ position: "fixed", top: "-10%", left: "-5%", width: 560, height: 560, borderRadius: "50%",
      background: `radial-gradient(circle,${GOLD}45,transparent)`, filter: "blur(110px)",
      pointerEvents: "none", zIndex: 0, opacity: 0.55 }} />
    <div style={{ position: "fixed", bottom: "-10%", right: "-5%", width: 480, height: 480, borderRadius: "50%",
      background: "radial-gradient(circle,#7c3aed55,transparent)", filter: "blur(90px)",
      pointerEvents: "none", zIndex: 0, opacity: 0.45 }} />
  </>;
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface ConvincePlayer {
  id: string; name: string; color: string; score: number;
  isHost: boolean; disconnected: boolean; hasAnswered: boolean; isBot?: boolean;
}
interface CurrentReview {
  id: string; name: string; color: string;
  answer: string | null; myRating: number | null;
  ratingsCount: number; totalRaters: number;
}
interface ConvinceState {
  code: string; phase: string; roundNum: number;
  question: string | null;
  players: ConvincePlayer[];
  currentReview: CurrentReview | null;
  reviewedIds: string[];
  reviewQueueLength: number;
  timerEnd: number;
  settings: { timerSecs: number; targetScore: number; hideWriting: boolean };
  winner: { id: string; name: string; color: string } | null;
}
type Screen = "entry" | "host-setup" | "join" | "game";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function initials(name: string) { return name.trim()[0]?.toUpperCase() ?? "?"; }
function useTimer(timerEnd: number) {
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    const tick = () => setRemaining(Math.max(0, Math.ceil((timerEnd - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 300);
    return () => clearInterval(id);
  }, [timerEnd]);
  return remaining;
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function PlayerCard({ p, dim }: { p: ConvincePlayer; dim?: boolean }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      background: dim ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.07)",
      border: `1px solid ${dim ? "rgba(255,255,255,0.08)" : p.color + "44"}`,
      borderRadius: 12, padding: "10px 14px",
      boxShadow: dim ? "none" : `0 0 12px ${p.color}22`,
      opacity: p.disconnected ? 0.4 : 1, transition: "all 0.3s",
    }}>
      <div style={{
        width: 38, height: 38, borderRadius: "50%", flexShrink: 0,
        background: p.color + "33", border: `2px solid ${p.color}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 16, fontWeight: 900, color: p.color,
      }}>{initials(p.name)}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: "#fff", fontWeight: 700, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
        {p.isHost && <div style={{ color: GOLD, fontSize: 11, fontWeight: 600 }}>الهوست</div>}
      </div>
      <div style={{ textAlign: "left", flexShrink: 0 }}>
        <div style={{ color: GOLD, fontSize: 16, fontWeight: 900 }}>{p.score}</div>
        <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10 }}>نقطة</div>
      </div>
    </div>
  );
}

function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hover, setHover] = useState(0);
  return (
    <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
      {[1,2,3,4,5,6,7,8,9,10].map(n => (
        <button key={n}
          onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(0)}
          onClick={() => onChange(n)}
          style={{
            background: "none", border: "none", cursor: "pointer",
            fontSize: n <= (hover || value) ? 28 : 22,
            filter: n <= (hover || value) ? `drop-shadow(0 0 6px ${GOLD})` : "none",
            transition: "all 0.15s",
            color: n <= (hover || value) ? GOLD2 : "rgba(255,255,255,0.25)",
          }}>★</button>
      ))}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function ConvinceGame() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const urlCode = params.get("r") ?? "";
  const [, navigate] = useLocation();

  const wsRef = useRef<WebSocket | null>(null);
  const playerIdRef = useRef<string | null>(null);

  const [screen, setScreen] = useState<Screen>(urlCode ? "join" : "entry");
  const [wsReady, setWsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gameState, setGameState] = useState<ConvinceState | null>(null);
  const [myName, setMyName] = useState("");
  const [joinCode, setJoinCode] = useState(urlCode);
  const [answerText, setAnswerText] = useState("");
  const [myRating, setMyRating] = useState(0);
  const [copied, setCopied] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [settings, setSettings] = useState({ timerSecs: 30, targetScore: 50, hideWriting: false });
  const [avatarMap, setAvatarMap] = useState<Record<string, string>>({});

  const send = useCallback((msg: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify(msg));
  }, []);

  // WS connection
  useEffect(() => {
    const ws = new WebSocket(getWsUrl());
    wsRef.current = ws;
    ws.onopen = () => setWsReady(true);
    ws.onclose = () => setWsReady(false);
    ws.onerror = () => setError("فشل الاتصال بالخادم");
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string);
        if (msg.type === "convince:state") {
          setGameState(msg as ConvinceState);
          if (msg.phase === "answering") { setSubmitted(false); setAnswerText(""); }
          if (msg.currentReview?.myRating) setMyRating(msg.currentReview.myRating);
          else if (msg.phase === "rating") setMyRating(0);
          setScreen("game");
        } else if (msg.type === "convince:created") {
          playerIdRef.current = msg.playerId;
          setJoinCode(msg.code);
        } else if (msg.type === "convince:joined") {
          playerIdRef.current = msg.playerId;
        } else if (msg.type === "convince:error") {
          setError(msg.message);
        } else if (msg.type === "convince:host_left") {
          setError("غادر الهوست الغرفة"); setScreen("entry"); setGameState(null);
        }
      } catch { /* ignore */ }
    };
    return () => ws.close();
  }, []);

  // ── Fetch Twitch avatars for players when they join ──
  useEffect(() => {
    if (!gameState) return;
    gameState.players.forEach(p => {
      if (!avatarMap[p.id]) {
        fetchTwitchAvatar(p.name).then(url => {
          setAvatarMap(prev => ({ ...prev, [p.id]: url }));
        });
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState?.players.map(p => p.id).join(",")]);

  const myId = playerIdRef.current;
  const me = gameState?.players.find(p => p.id === myId);
  const amHost = me?.isHost ?? false;

  // ── Copy link ──
  const copyLink = useCallback(() => {
    const code = gameState?.code ?? joinCode;
    const base = window.location.origin + window.location.pathname;
    navigator.clipboard.writeText(`${base}?r=${code}`).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    });
  }, [gameState?.code, joinCode]);

  // ── Actions ──
  const createRoom = () => {
    if (!myName.trim()) { setError("اكتب اسمك أولاً"); return; }
    send({ type: "convince:create", name: myName.trim(), ...settings });
    setScreen("game");
  };
  const joinRoom = () => {
    if (!myName.trim()) { setError("اكتب اسمك أولاً"); return; }
    if (!joinCode.trim()) { setError("اكتب كود الغرفة"); return; }
    send({ type: "convince:join", name: myName.trim(), code: joinCode.toUpperCase().trim() });
    setScreen("game");
  };
  const startGame = () => send({ type: "convince:start" });
  const submitAnswer = () => {
    if (!answerText.trim()) return;
    send({ type: "convince:answer", answer: answerText.trim() });
    setSubmitted(true);
  };
  const showPlayer = (targetId: string) => send({ type: "convince:show_player", targetId });
  const ratePlayer = (score: number) => {
    setMyRating(score);
    send({ type: "convince:rate", score });
  };
  const nextPlayer = () => send({ type: "convince:next_player" });
  const playAgain = () => send({ type: "convince:play_again" });

  // ── Timer ──
  const remaining = useTimer(gameState?.timerEnd ?? 0);
  const timerPct = gameState ? Math.max(0, (remaining / gameState.settings.timerSecs) * 100) : 100;

  // ─── Shared wrapper ───────────────────────────────────────────────────────
  const wrap = (children: React.ReactNode, maxW = 520) => (
    <div className="min-h-screen gradient-bg flex flex-col items-center justify-center p-4" dir="rtl"
      style={{ fontFamily: "'Cairo','Arial',sans-serif", position: "relative" }}>
      <ConvinceGlowOrbs />
      <div style={{ width: "100%", maxWidth: maxW, position: "relative" }}>{children}</div>
    </div>
  );

  // ─── ENTRY SCREEN ─────────────────────────────────────────────────────────
  if (screen === "entry") return wrap(
    <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }}>
      <button onClick={() => navigate("/")} style={{
        background: "none", border: "none", color: "rgba(255,255,255,0.8)", cursor: "pointer",
        display: "flex", alignItems: "center", gap: 6, fontSize: 14, marginBottom: 32, fontWeight: 700,
      }}><ArrowRight size={16}/>الرئيسية</button>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 64, marginBottom: 8 }}>🎤</div>
        <h1 style={{ fontSize: 38, fontWeight: 900, color: GOLD, textShadow: `0 0 24px ${GOLD}`, marginBottom: 8 }}>أقنعني</h1>
        <p style={{ color: "rgba(255,255,255,0.88)", fontSize: 15, marginBottom: 40 }}>اقنع الجميع بإجابتك واحصل على أعلى تقييم!</p>
        {error && <p style={{ color: "#f87171", marginBottom: 16, fontSize: 14 }}>{error}</p>}
        <button onClick={() => { setError(null); setScreen("host-setup"); }} style={{
          padding: "18px 56px", borderRadius: 16, fontWeight: 900, fontSize: 18, cursor: "pointer",
          background: `linear-gradient(135deg,${GOLD},#d97706)`, color: "#000", border: "none",
          boxShadow: `0 8px 28px ${GOLD}70`,
        }}>🎤 أنشئ غرفة</button>
      </div>
    </motion.div>
  );

  // ─── HOST SETUP SCREEN ────────────────────────────────────────────────────
  if (screen === "host-setup") return wrap(
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
      <button onClick={() => setScreen("entry")} style={{
        background: "none", border: "none", color: "rgba(255,255,255,0.6)", cursor: "pointer",
        display: "flex", alignItems: "center", gap: 6, fontSize: 14, marginBottom: 24,
      }}><ArrowRight size={16}/>رجوع</button>

      <h2 style={{ fontSize: 26, fontWeight: 900, color: "#fff", marginBottom: 28, textAlign: "center" }}>إعدادات الجلسة</h2>
      {error && <p style={{ color: "#f87171", marginBottom: 14, fontSize: 13 }}>{error}</p>}

      {/* Name */}
      <label style={{ color: "rgba(255,255,255,0.75)", fontSize: 14, fontWeight: 700 }}>اسمك</label>
      <input value={myName} onChange={e => setMyName(e.target.value)}
        placeholder="أدخل اسمك..."
        style={{ width: "100%", marginTop: 6, marginBottom: 22, padding: "12px 16px", borderRadius: 12,
          background: "rgba(255,255,255,0.08)", border: `1px solid ${GOLD}44`, color: "#fff",
          fontSize: 15, fontWeight: 600, outline: "none", boxSizing: "border-box" }}/>

      {/* Timer */}
      <label style={{ color: "rgba(255,255,255,0.75)", fontSize: 14, fontWeight: 700 }}>مدة الإجابة</label>
      <div style={{ display: "flex", gap: 10, marginTop: 8, marginBottom: 22, flexWrap: "wrap" }}>
        {[20,30,60,100,180].map(s => (
          <button key={s} onClick={() => setSettings(p => ({ ...p, timerSecs: s }))} style={{
            padding: "10px 18px", borderRadius: 12, fontWeight: 800, fontSize: 14, cursor: "pointer",
            background: settings.timerSecs === s ? GOLD : "rgba(255,255,255,0.08)",
            color: settings.timerSecs === s ? "#000" : "rgba(255,255,255,0.7)",
            border: `1px solid ${settings.timerSecs === s ? GOLD : "rgba(255,255,255,0.15)"}`,
          }}>{s}ث</button>
        ))}
      </div>

      {/* Target Score */}
      <label style={{ color: "rgba(255,255,255,0.75)", fontSize: 14, fontWeight: 700 }}>نقاط الفوز</label>
      <div style={{ display: "flex", gap: 10, marginTop: 8, marginBottom: 22, flexWrap: "wrap" }}>
        {[30,50,70,100].map(pts => (
          <button key={pts} onClick={() => setSettings(p => ({ ...p, targetScore: pts }))} style={{
            padding: "10px 18px", borderRadius: 12, fontWeight: 800, fontSize: 14, cursor: "pointer",
            background: settings.targetScore === pts ? GOLD : "rgba(255,255,255,0.08)",
            color: settings.targetScore === pts ? "#000" : "rgba(255,255,255,0.7)",
            border: `1px solid ${settings.targetScore === pts ? GOLD : "rgba(255,255,255,0.15)"}`,
          }}>{pts}</button>
        ))}
      </div>

      {/* Hide Writing */}
      <button onClick={() => setSettings(p => ({ ...p, hideWriting: !p.hideWriting }))} style={{
        width: "100%", padding: "14px 20px", borderRadius: 14, cursor: "pointer",
        display: "flex", alignItems: "center", gap: 12, marginBottom: 28,
        background: settings.hideWriting ? `${GOLD}22` : "rgba(255,255,255,0.05)",
        border: `1px solid ${settings.hideWriting ? GOLD : "rgba(255,255,255,0.15)"}`,
        color: "#fff",
      }}>
        {settings.hideWriting ? <EyeOff size={18} color={GOLD}/> : <Eye size={18} color="rgba(255,255,255,0.5)"/>}
        <div style={{ textAlign: "right" }}>
          <div style={{ fontWeight: 800, fontSize: 15, color: settings.hideWriting ? GOLD : "#fff" }}>إخفاء الكتابة</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>يمنع ظهور الإجابات على البث</div>
        </div>
        <div style={{ marginRight: "auto", width: 44, height: 24, borderRadius: 12,
          background: settings.hideWriting ? GOLD : "rgba(255,255,255,0.15)", position: "relative", transition: "background 0.3s" }}>
          <div style={{ position: "absolute", top: 2, width: 20, height: 20, borderRadius: "50%", background: "#fff",
            transition: "right 0.3s", right: settings.hideWriting ? 2 : 22 }}/>
        </div>
      </button>

      <button onClick={createRoom} disabled={!wsReady} style={{
        width: "100%", padding: "16px", borderRadius: 16, fontWeight: 900, fontSize: 17, cursor: "pointer",
        background: wsReady ? `linear-gradient(135deg,${GOLD},#d97706)` : "rgba(255,255,255,0.1)",
        color: wsReady ? "#000" : "rgba(255,255,255,0.4)", border: "none",
        boxShadow: wsReady ? `0 6px 24px ${GOLD}50` : "none",
      }}>ابدأ الجلسة</button>
    </motion.div>
  );

  // ─── JOIN SCREEN ──────────────────────────────────────────────────────────
  if (screen === "join") return wrap(
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
      <button onClick={() => setScreen("entry")} style={{
        background: "none", border: "none", color: "rgba(255,255,255,0.6)", cursor: "pointer",
        display: "flex", alignItems: "center", gap: 6, fontSize: 14, marginBottom: 24,
      }}><ArrowRight size={16}/>رجوع</button>

      <h2 style={{ fontSize: 26, fontWeight: 900, color: "#fff", marginBottom: 28, textAlign: "center" }}>انضم لغرفة</h2>
      {error && <p style={{ color: "#f87171", marginBottom: 14, fontSize: 13 }}>{error}</p>}

      <label style={{ color: "rgba(255,255,255,0.75)", fontSize: 14, fontWeight: 700 }}>اسمك</label>
      <input value={myName} onChange={e => setMyName(e.target.value)} placeholder="أدخل اسمك..."
        style={{ width: "100%", marginTop: 6, marginBottom: 18, padding: "12px 16px", borderRadius: 12,
          background: "rgba(255,255,255,0.08)", border: `1px solid ${GOLD}44`, color: "#fff",
          fontSize: 15, fontWeight: 600, outline: "none", boxSizing: "border-box" }}/>

      <label style={{ color: "rgba(255,255,255,0.75)", fontSize: 14, fontWeight: 700 }}>كود الغرفة</label>
      <input value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())} placeholder="مثال: ABCD"
        style={{ width: "100%", marginTop: 6, marginBottom: 28, padding: "12px 16px", borderRadius: 12,
          background: "rgba(255,255,255,0.08)", border: `1px solid rgba(255,255,255,0.2)`, color: "#fff",
          fontSize: 20, fontWeight: 900, outline: "none", boxSizing: "border-box", letterSpacing: "0.12em", textAlign: "center" }}/>

      <button onClick={joinRoom} disabled={!wsReady} style={{
        width: "100%", padding: "16px", borderRadius: 16, fontWeight: 900, fontSize: 17, cursor: "pointer",
        background: wsReady ? `linear-gradient(135deg,${GOLD},#d97706)` : "rgba(255,255,255,0.1)",
        color: wsReady ? "#000" : "rgba(255,255,255,0.4)", border: "none",
        boxShadow: wsReady ? `0 6px 24px ${GOLD}50` : "none",
      }}>انضم</button>
    </motion.div>
  );

  // ─── GAME SCREEN ──────────────────────────────────────────────────────────
  if (screen === "game" && gameState) {
    const { phase, players, currentReview, settings: gs } = gameState;
    const notReviewedPlayers = players.filter(p => !gameState.reviewedIds.includes(p.id) && !p.disconnected);

    // ── Lobby ──
    if (phase === "lobby") return (
      <div className="min-h-screen gradient-bg" dir="rtl" style={{ fontFamily: "'Cairo','Arial',sans-serif", padding: 0, position: "relative" }}>
        <ConvinceGlowOrbs />
        {/* Header */}
        <div style={{ background: "rgba(5,2,14,0.95)", borderBottom: `1px solid ${GOLD}55`, padding: "14px 20px",
          display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <button onClick={() => navigate("/")} style={{
            background: "none", border: "none", color: "rgba(255,255,255,0.8)", cursor: "pointer",
            display: "flex", alignItems: "center", gap: 5, fontSize: 13, fontWeight: 700,
          }}><ArrowRight size={14}/>رجوع</button>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 18 }}>🎤</span>
            <span style={{ color: GOLD, fontWeight: 900, fontSize: 17, textShadow: `0 0 12px ${GOLD}` }}>أقنعني</span>
          </div>
          <div style={{ width: 60 }}/>
        </div>

        <div style={{ maxWidth: 560, margin: "0 auto", padding: "24px 16px" }}>

          {/* ── Invite card ── */}
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
            style={{ background: `linear-gradient(135deg,rgba(245,158,11,0.12),rgba(124,58,237,0.12))`,
              border: `1.5px solid ${GOLD}55`, borderRadius: 18, padding: "18px 20px",
              marginBottom: 24, position: "relative" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <Link2 size={16} color={GOLD}/>
              <span style={{ color: GOLD, fontWeight: 800, fontSize: 14 }}>رابط الدعوة</span>
              <span style={{ marginRight: "auto", background: `${GOLD}22`, border: `1px solid ${GOLD}55`,
                borderRadius: 20, padding: "2px 12px", color: GOLD, fontSize: 13, fontWeight: 900,
                letterSpacing: "0.1em" }}>{gameState.code}</span>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <div style={{ flex: 1, background: "rgba(255,255,255,0.07)", borderRadius: 10,
                padding: "9px 12px", fontSize: 12, color: "rgba(255,255,255,0.55)",
                overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", direction: "ltr" }}>
                {window.location.origin + window.location.pathname}?r={gameState.code}
              </div>
              <button onClick={copyLink} style={{
                flexShrink: 0, background: copied ? `linear-gradient(135deg,${GOLD},#d97706)` : "rgba(255,255,255,0.12)",
                border: `1px solid ${copied ? GOLD : "rgba(255,255,255,0.25)"}`,
                borderRadius: 10, padding: "9px 16px", color: copied ? "#000" : "#fff",
                fontSize: 13, fontWeight: 800, cursor: "pointer",
                display: "flex", alignItems: "center", gap: 6, transition: "all 0.2s",
              }}>
                {copied ? <Check size={14}/> : <Copy size={14}/>}
                {copied ? "تم النسخ!" : "نسخ الرابط"}
              </button>
            </div>
          </motion.div>

          {/* ── Players count ── */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <Users size={15} color={GOLD}/>
            <span style={{ color: "rgba(255,255,255,0.85)", fontSize: 15, fontWeight: 700 }}>
              {players.length} {players.length === 1 ? "لاعب" : "لاعبين"} في الغرفة
            </span>
            {amHost && (
              <span style={{ marginRight: "auto", color: "rgba(255,255,255,0.5)", fontSize: 12 }}>
                ابدأ عندما يكون الجميع مستعداً
              </span>
            )}
          </div>

          {/* ── Players grid ── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
            {players.map(p => {
              const avatar = avatarMap[p.id];
              const isMe = p.id === myId;
              return (
                <motion.div key={p.id}
                  initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    background: isMe ? `${p.color}18` : p.isBot ? "rgba(124,58,237,0.1)" : "rgba(255,255,255,0.07)",
                    border: `1.5px solid ${isMe ? p.color : p.isBot ? "rgba(124,58,237,0.4)" : p.color + "44"}`,
                    borderRadius: 14, padding: "12px 14px", position: "relative",
                    boxShadow: isMe ? `0 0 20px ${p.color}40` : "none",
                  }}>
                  {/* Avatar or Bot icon */}
                  <div style={{ width: 46, height: 46, borderRadius: "50%", flexShrink: 0,
                    border: `2.5px solid ${p.isBot ? "#7c3aed" : p.color}`, overflow: "hidden", position: "relative",
                    boxShadow: `0 0 10px ${p.isBot ? "#7c3aed55" : p.color + "55"}`,
                    background: p.isBot ? "rgba(124,58,237,0.25)" : p.color + "33",
                    display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {p.isBot ? (
                      <span style={{ fontSize: 24 }}>🤖</span>
                    ) : avatar ? (
                      <img src={avatar} alt={p.name}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        onError={e => { (e.target as HTMLImageElement).src = fallbackAvatar(p.name); }}/>
                    ) : (
                      <div style={{ width: "100%", height: "100%",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 20, fontWeight: 900, color: p.color }}>
                        {initials(p.name)}
                      </div>
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: "#fff", fontWeight: 800, fontSize: 14,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {p.name}
                      {isMe && <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 11, marginRight: 4 }}>(أنت)</span>}
                    </div>
                    {p.isHost && <div style={{ color: GOLD, fontSize: 11, fontWeight: 700 }}>هوست 👑</div>}
                    {p.isBot && <div style={{ color: "#a78bfa", fontSize: 11, fontWeight: 600 }}>بوت 🤖</div>}
                    {p.disconnected && <div style={{ color: "#f87171", fontSize: 11 }}>انقطع الاتصال</div>}
                  </div>
                  {amHost && p.isBot && (
                    <button
                      onClick={() => send({ type: "convince:remove_bot", botId: p.id })}
                      title="حذف البوت"
                      style={{
                        background: "rgba(220,38,38,0.2)", border: "1px solid rgba(220,38,38,0.4)",
                        borderRadius: 8, width: 26, height: 26, display: "flex", alignItems: "center",
                        justifyContent: "center", cursor: "pointer", flexShrink: 0, color: "#fca5a5",
                        fontSize: 12, padding: 0,
                      }}>✕</button>
                  )}
                </motion.div>
              );
            })}
          </div>

          {/* ── Add Bot (host only) ── */}
          {amHost && players.length < 10 && (
            <motion.button
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
              onClick={() => send({ type: "convince:add_bot" })}
              style={{
                width: "100%", padding: "13px", borderRadius: 14, cursor: "pointer",
                background: "linear-gradient(135deg,rgba(124,58,237,0.25),rgba(124,58,237,0.15))",
                border: "1.5px dashed rgba(124,58,237,0.5)",
                color: "#a78bfa", fontWeight: 800, fontSize: 15,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                marginBottom: 16, fontFamily: "'Cairo','Arial',sans-serif",
              }}>
              🤖 إضافة بوت
            </motion.button>
          )}

          {amHost ? (
            <button onClick={startGame} disabled={players.length < 2} style={{
              width: "100%", padding: "18px", borderRadius: 18, fontWeight: 900, fontSize: 18, cursor: "pointer",
              background: players.length >= 2 ? `linear-gradient(135deg,${GOLD},#d97706)` : "rgba(255,255,255,0.08)",
              color: players.length >= 2 ? "#000" : "rgba(255,255,255,0.4)", border: "none",
              boxShadow: players.length >= 2 ? `0 8px 32px ${GOLD}60` : "none",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
              transition: "all 0.3s",
            }}><Play size={20}/>ابدأ اللعبة</button>
          ) : (
            <div style={{ textAlign: "center", color: "rgba(255,255,255,0.75)", fontSize: 14, fontWeight: 600,
              padding: "16px", background: "rgba(255,255,255,0.05)", borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.1)" }}>
              ⏳ في انتظار الهوست لبدء اللعبة...
            </div>
          )}
        </div>
      </div>
    );

    // ── Answering ──
    if (phase === "answering") return (
      <div className="min-h-screen gradient-bg" dir="rtl" style={{ fontFamily: "'Cairo','Arial',sans-serif", position: "relative" }}>
        <ConvinceGlowOrbs />
        {/* Back header */}
        <div style={{ background: "rgba(5,2,14,0.95)", borderBottom: `1px solid ${GOLD}44`, padding: "10px 16px",
          display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <button onClick={() => navigate("/")} style={{
            background: "none", border: "none", color: "rgba(255,255,255,0.8)", cursor: "pointer",
            display: "flex", alignItems: "center", gap: 5, fontSize: 13, fontWeight: 700,
          }}><ArrowRight size={14}/>رجوع</button>
          <span style={{ color: GOLD, fontWeight: 900, fontSize: 15, textShadow: `0 0 10px ${GOLD}` }}>🎤 أقنعني</span>
          <div style={{ width: 60 }}/>
        </div>
        {/* Timer bar */}
        <div style={{ height: 6, background: "rgba(255,255,255,0.12)" }}>
          <motion.div animate={{ width: `${timerPct}%` }} transition={{ duration: 0.5 }}
            style={{ height: "100%", background: remaining <= 5 ? "#ef4444" : GOLD, transition: "background 0.5s" }}/>
        </div>

        <div style={{ maxWidth: 600, margin: "0 auto", padding: "40px 16px" }}>
          {/* Round + Timer */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
            <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 14, fontWeight: 600 }}>جولة {gameState.roundNum}</span>
            <motion.span key={remaining}
              initial={{ scale: 1.3 }} animate={{ scale: 1 }}
              style={{ fontSize: 42, fontWeight: 900, color: remaining <= 5 ? "#ef4444" : GOLD,
                textShadow: `0 0 20px ${remaining <= 5 ? "#ef4444" : GOLD}` }}>
              {remaining}
            </motion.span>
            <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 14 }}>{players.filter(p=>p.hasAnswered).length}/{players.length} أجاب</span>
          </div>

          {/* Question */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            style={{ background: "rgba(255,255,255,0.09)", border: `2px solid ${GOLD}66`, borderRadius: 20,
              padding: "28px 24px", marginBottom: 28, textAlign: "center",
              boxShadow: `0 0 40px ${GOLD}25` }}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>🎤</div>
            <p style={{ fontSize: 22, fontWeight: 800, color: "#fff", lineHeight: 1.5, textShadow: "0 1px 8px rgba(0,0,0,0.5)" }}>{gameState.question}</p>
          </motion.div>

          {/* Answer input */}
          {!submitted ? (
            <div>
              <textarea value={answerText} onChange={e => setAnswerText(e.target.value)}
                placeholder="اكتب إجابتك هنا..."
                rows={4}
                style={{
                  width: "100%", padding: "16px", borderRadius: 14, resize: "vertical",
                  background: "rgba(255,255,255,0.1)", border: `1.5px solid ${GOLD}66`, color: "#fff",
                  fontSize: 16, fontWeight: 600, outline: "none", boxSizing: "border-box",
                  fontFamily: "'Cairo','Arial',sans-serif", lineHeight: 1.6,
                  ...(gs.hideWriting ? { WebkitTextSecurity: "disc" as any, textSecurity: "disc" } : {}),
                }}/>
              {gs.hideWriting && (
                <p style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, marginTop: 6, fontWeight: 600 }}>
                  🔒 وضع إخفاء الكتابة مفعّل — إجابتك مخفية عن الكاميرا
                </p>
              )}
              <button onClick={submitAnswer} disabled={!answerText.trim()} style={{
                width: "100%", marginTop: 14, padding: "16px", borderRadius: 14,
                background: answerText.trim() ? `linear-gradient(135deg,${GOLD},#d97706)` : "rgba(255,255,255,0.1)",
                color: answerText.trim() ? "#000" : "rgba(255,255,255,0.45)",
                fontWeight: 900, fontSize: 17, border: answerText.trim() ? "none" : "1px solid rgba(255,255,255,0.15)",
                cursor: answerText.trim() ? "pointer" : "not-allowed",
                boxShadow: answerText.trim() ? `0 6px 24px ${GOLD}50` : "none",
              }}>أرسل الإجابة</button>
            </div>
          ) : (
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              style={{ textAlign: "center", padding: 32 }}>
              <div style={{ fontSize: 52, marginBottom: 12 }}>✅</div>
              <p style={{ color: GOLD, fontWeight: 800, fontSize: 18, textShadow: `0 0 16px ${GOLD}` }}>تم إرسال إجابتك!</p>
              <p style={{ color: "rgba(255,255,255,0.75)", fontSize: 14, marginTop: 8, fontWeight: 600 }}>في انتظار باقي اللاعبين...</p>
            </motion.div>
          )}
        </div>
      </div>
    );

    // ── Revealing (host selects who to show) ──
    if (phase === "revealing") return (
      <div className="min-h-screen gradient-bg" dir="rtl" style={{ fontFamily: "'Cairo','Arial',sans-serif", position: "relative" }}>
        <ConvinceGlowOrbs />
        <div style={{ background: "rgba(5,2,14,0.95)", borderBottom: `1px solid ${GOLD}44`, padding: "10px 16px",
          display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <button onClick={() => navigate("/")} style={{
            background: "none", border: "none", color: "rgba(255,255,255,0.8)", cursor: "pointer",
            display: "flex", alignItems: "center", gap: 5, fontSize: 13, fontWeight: 700,
          }}><ArrowRight size={14}/>رجوع</button>
          <span style={{ color: GOLD, fontWeight: 900, fontSize: 15, textShadow: `0 0 10px ${GOLD}` }}>🎤 أقنعني</span>
          <div style={{ width: 60 }}/>
        </div>
        <div style={{ maxWidth: 600, margin: "0 auto", padding: "32px 16px" }}>
          <div style={{ textAlign: "center", marginBottom: 28 }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>🎛️</div>
            <h2 style={{ fontSize: 24, fontWeight: 900, color: "#fff", marginBottom: 8, textShadow: "0 0 20px rgba(255,255,255,0.3)" }}>مرحلة العرض</h2>
            <p style={{ color: "rgba(255,255,255,0.8)", fontSize: 14, fontWeight: 600 }}>
              {amHost ? "اختر لاعبًا لعرض إجابته على الجميع" : "الهوست يختار من يعرض إجابته..."}
            </p>
          </div>

          {/* Already reviewed */}
          {gameState.reviewedIds.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, marginBottom: 8, fontWeight: 700 }}>تم تقييمهم:</p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {players.filter(p => gameState.reviewedIds.includes(p.id)).map(p => (
                  <div key={p.id} style={{ padding: "6px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700,
                    background: p.color + "22", color: p.color, border: `1px solid ${p.color}44`, opacity: 0.6 }}>
                    ✓ {p.name}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Remaining players */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {notReviewedPlayers.map(p => (
              <motion.button key={p.id}
                whileHover={amHost ? { scale: 1.02 } : {}}
                onClick={amHost ? () => showPlayer(p.id) : undefined}
                disabled={!amHost}
                style={{
                  width: "100%", textAlign: "right", padding: "16px 18px", borderRadius: 16, cursor: amHost ? "pointer" : "default",
                  background: "rgba(255,255,255,0.07)", border: `1.5px solid ${p.color}44`,
                  display: "flex", alignItems: "center", gap: 14,
                  boxShadow: `0 0 16px ${p.color}22`, transition: "all 0.2s",
                }}>
                <div style={{ width: 46, height: 46, borderRadius: "50%", flexShrink: 0,
                  background: p.color + "22", border: `2.5px solid ${p.color}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 20, fontWeight: 900, color: p.color }}>
                  {initials(p.name)}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ color: "#fff", fontWeight: 800, fontSize: 16 }}>{p.name}</div>
                  {p.hasAnswered
                    ? <div style={{ color: "#4ade80", fontSize: 12 }}>✓ أجاب</div>
                    : <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 12 }}>لم يجب</div>}
                </div>
                {amHost && <ChevronRight size={18} color={p.color}/>}
              </motion.button>
            ))}
          </div>

          {notReviewedPlayers.length === 0 && amHost && (
            <div style={{ textAlign: "center", marginTop: 32 }}>
              <button onClick={nextPlayer} style={{
                padding: "16px 48px", borderRadius: 16, fontWeight: 900, fontSize: 17, cursor: "pointer",
                background: `linear-gradient(135deg,${GOLD},#d97706)`, color: "#000", border: "none",
                boxShadow: `0 6px 24px ${GOLD}50`,
              }}>الجولة التالية</button>
            </div>
          )}
        </div>
      </div>
    );

    // ── Rating ──
    if (phase === "rating" && currentReview) {
      const isBeingRated = myId === currentReview.id;
      const alreadyRated = currentReview.myRating !== null || myRating > 0;

      return (
        <div className="min-h-screen gradient-bg" dir="rtl" style={{ fontFamily: "'Cairo','Arial',sans-serif", position: "relative" }}>
          <ConvinceGlowOrbs />
          <div style={{ background: "rgba(5,2,14,0.95)", borderBottom: `1px solid ${GOLD}44`, padding: "10px 16px",
            display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <button onClick={() => navigate("/")} style={{
              background: "none", border: "none", color: "rgba(255,255,255,0.8)", cursor: "pointer",
              display: "flex", alignItems: "center", gap: 5, fontSize: 13, fontWeight: 700,
            }}><ArrowRight size={14}/>رجوع</button>
            <span style={{ color: GOLD, fontWeight: 900, fontSize: 15, textShadow: `0 0 10px ${GOLD}` }}>🎤 أقنعني</span>
            <div style={{ width: 60 }}/>
          </div>
          <div style={{ maxWidth: 600, margin: "0 auto", padding: "32px 16px" }}>

            {/* Player being rated */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              style={{ textAlign: "center", marginBottom: 32 }}>
              <div style={{
                width: 80, height: 80, borderRadius: "50%", margin: "0 auto 16px",
                background: currentReview.color + "33", border: `3px solid ${currentReview.color}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 36, fontWeight: 900, color: currentReview.color,
                boxShadow: `0 0 32px ${currentReview.color}55`,
              }}>{initials(currentReview.name)}</div>
              <h3 style={{ fontSize: 22, fontWeight: 900, color: "#fff", marginBottom: 4 }}>{currentReview.name}</h3>
              <p style={{ color: "rgba(255,255,255,0.8)", fontSize: 13, fontWeight: 600 }}>
                {currentReview.ratingsCount} / {currentReview.totalRaters} قيّموا
              </p>
            </motion.div>

            {/* Question */}
            <div style={{ background: "rgba(255,255,255,0.05)", border: `1px solid rgba(255,255,255,0.12)`,
              borderRadius: 14, padding: "14px 18px", marginBottom: 16, textAlign: "center" }}>
              <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, marginBottom: 4 }}>السؤال</p>
              <p style={{ color: "rgba(255,255,255,0.85)", fontSize: 15, fontWeight: 700 }}>{gameState.question}</p>
            </div>

            {/* Answer */}
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              style={{ background: `${currentReview.color}12`, border: `2px solid ${currentReview.color}55`,
                borderRadius: 18, padding: "24px 20px", marginBottom: 32, textAlign: "center",
                boxShadow: `0 0 32px ${currentReview.color}22` }}>
              <p style={{ color: "#fff", fontSize: 18, fontWeight: 700, lineHeight: 1.6 }}>
                {currentReview.answer || "لم يجب"}
              </p>
            </motion.div>

            {/* Rating or waiting */}
            {isBeingRated ? (
              <div style={{ textAlign: "center", padding: 24 }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>⏳</div>
                <p style={{ color: GOLD, fontWeight: 800, fontSize: 18 }}>الجميع يقيّمك الآن!</p>
              </div>
            ) : alreadyRated ? (
              <div style={{ textAlign: "center", padding: 24 }}>
                <p style={{ color: GOLD, fontWeight: 800, fontSize: 18 }}>✅ أعطيت {myRating} نجمة</p>
                <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 14, marginTop: 8 }}>في انتظار باقي اللاعبين...</p>
              </div>
            ) : (
              <div>
                <p style={{ textAlign: "center", color: "rgba(255,255,255,0.75)", fontSize: 15, fontWeight: 700, marginBottom: 18 }}>
                  قيّم الإجابة من 1 إلى 10
                </p>
                <StarRating value={myRating} onChange={ratePlayer}/>
              </div>
            )}
          </div>
        </div>
      );
    }

    // ── Leaderboard ──
    if (phase === "leaderboard") return (
      <div className="min-h-screen gradient-bg" dir="rtl" style={{ fontFamily: "'Cairo','Arial',sans-serif", position: "relative" }}>
        <ConvinceGlowOrbs />
        <div style={{ background: "rgba(5,2,14,0.95)", borderBottom: `1px solid ${GOLD}44`, padding: "10px 16px",
          display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <button onClick={() => navigate("/")} style={{
            background: "none", border: "none", color: "rgba(255,255,255,0.8)", cursor: "pointer",
            display: "flex", alignItems: "center", gap: 5, fontSize: 13, fontWeight: 700,
          }}><ArrowRight size={14}/>رجوع</button>
          <span style={{ color: GOLD, fontWeight: 900, fontSize: 15, textShadow: `0 0 10px ${GOLD}` }}>🎤 أقنعني</span>
          <div style={{ width: 60 }}/>
        </div>
        <div style={{ maxWidth: 520, margin: "0 auto", padding: "32px 16px" }}>
          <div style={{ textAlign: "center", marginBottom: 28 }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>📊</div>
            <h2 style={{ fontSize: 26, fontWeight: 900, color: "#fff", textShadow: "0 0 20px rgba(255,255,255,0.3)" }}>لوحة الترتيب</h2>
            <p style={{ color: "rgba(255,255,255,0.75)", fontSize: 13, marginTop: 6, fontWeight: 600 }}>
              هدف الفوز: {gs.targetScore} نقطة
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 32 }}>
            {[...players].sort((a,b) => b.score - a.score).map((p, idx) => (
              <motion.div key={p.id}
                initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.06 }}
                style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "14px 18px",
                  background: p.id === myId ? `${GOLD}20` : "rgba(255,255,255,0.09)",
                  border: `1.5px solid ${p.id === myId ? GOLD + "77" : p.color + "55"}`,
                  borderRadius: 14,
                }}>
                <span style={{ fontSize: 20, fontWeight: 900, color: idx === 0 ? "#ffd700" : idx === 1 ? "#c0c0c0" : idx === 2 ? "#cd7f32" : "rgba(255,255,255,0.65)", minWidth: 28, textAlign: "center" }}>
                  {idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `${idx+1}`}
                </span>
                <div style={{ width: 38, height: 38, borderRadius: "50%", flexShrink: 0,
                  background: p.color + "33", border: `2px solid ${p.color}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 16, fontWeight: 900, color: p.color,
                  textShadow: `0 0 8px ${p.color}` }}>
                  {initials(p.name)}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ color: "#fff", fontWeight: 800, fontSize: 14 }}>{p.name}</div>
                </div>
                <div style={{ color: GOLD, fontSize: 22, fontWeight: 900, textShadow: `0 0 10px ${GOLD}` }}>{p.score}</div>
              </motion.div>
            ))}
          </div>

          {amHost && (
            <button onClick={nextPlayer} style={{
              width: "100%", padding: "16px", borderRadius: 16, fontWeight: 900, fontSize: 17, cursor: "pointer",
              background: `linear-gradient(135deg,${GOLD},#d97706)`, color: "#000", border: "none",
              boxShadow: `0 6px 24px ${GOLD}50`,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
            }}><ChevronRight size={20}/>{gameState.reviewQueueLength > 0 ? "عرض اللاعب التالي" : "الجولة التالية"}</button>
          )}
          {!amHost && (
            <p style={{ textAlign: "center", color: "rgba(255,255,255,0.75)", fontSize: 14, fontWeight: 600 }}>في انتظار الهوست...</p>
          )}
        </div>
      </div>
    );

    // ── Winner ──
    if (phase === "winner" && gameState.winner) return (
      <div className="min-h-screen gradient-bg" dir="rtl" style={{ fontFamily: "'Cairo','Arial',sans-serif", position: "relative" }}>
        <ConvinceGlowOrbs />
        <div style={{ background: "rgba(5,2,14,0.95)", borderBottom: `1px solid ${GOLD}44`, padding: "10px 16px",
          display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <button onClick={() => navigate("/")} style={{
            background: "none", border: "none", color: "rgba(255,255,255,0.8)", cursor: "pointer",
            display: "flex", alignItems: "center", gap: 5, fontSize: 13, fontWeight: 700,
          }}><ArrowRight size={14}/>رجوع</button>
          <span style={{ color: GOLD, fontWeight: 900, fontSize: 15, textShadow: `0 0 10px ${GOLD}` }}>🎤 أقنعني</span>
          <div style={{ width: 60 }}/>
        </div>
        <div style={{ maxWidth: 520, margin: "0 auto", padding: "40px 16px", textAlign: "center" }}>
          <motion.div initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 15 }}>
            <div style={{ fontSize: 80, marginBottom: 16 }}>🏆</div>
            <h1 style={{ fontSize: 32, fontWeight: 900, color: GOLD, textShadow: `0 0 32px ${GOLD}`, marginBottom: 8 }}>
              الفائز!
            </h1>
            <div style={{
              width: 100, height: 100, borderRadius: "50%", margin: "20px auto",
              background: gameState.winner.color + "33", border: `4px solid ${gameState.winner.color}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 48, fontWeight: 900, color: gameState.winner.color,
              boxShadow: `0 0 60px ${gameState.winner.color}80`,
            }}>{initials(gameState.winner.name)}</div>
            <h2 style={{ fontSize: 36, fontWeight: 900, color: "#fff", marginBottom: 8 }}>{gameState.winner.name}</h2>
          </motion.div>

          <div style={{ marginTop: 24, marginBottom: 40 }}>
            <p style={{ color: "rgba(255,255,255,0.85)", fontSize: 14, marginBottom: 16, fontWeight: 700 }}>النتائج النهائية</p>
            {[...players].sort((a,b) => b.score - a.score).map((p, i) => (
              <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "12px 18px", background: i===0 ? `${GOLD}20` : "rgba(255,255,255,0.08)",
                borderRadius: 12, marginBottom: 6, border: i===0 ? `1.5px solid ${GOLD}66` : "1px solid rgba(255,255,255,0.12)" }}>
                <span style={{ color: "#fff", fontWeight: 800, fontSize: 15 }}>{p.name}</span>
                <span style={{ color: GOLD, fontWeight: 900, fontSize: 18, textShadow: `0 0 10px ${GOLD}` }}>{p.score}</span>
              </div>
            ))}
          </div>

          {amHost && (
            <button onClick={playAgain} style={{
              padding: "16px 48px", borderRadius: 16, fontWeight: 900, fontSize: 17, cursor: "pointer",
              background: `linear-gradient(135deg,${GOLD},#d97706)`, color: "#000", border: "none",
              boxShadow: `0 6px 24px ${GOLD}50`,
            }}>🔁 لعب مرة أخرى</button>
          )}
          {!amHost && (
            <p style={{ color: "rgba(255,255,255,0.75)", fontSize: 14, fontWeight: 600 }}>في انتظار الهوست لإعادة اللعبة...</p>
          )}
        </div>
      </div>
    );
  }

  // ─── Loading / Connecting ─────────────────────────────────────────────────
  return wrap(
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>🎤</div>
      {error
        ? <p style={{ color: "#f87171", fontSize: 16, fontWeight: 700 }}>{error}</p>
        : <div>
            <div className="animate-spin w-10 h-10 border-2 border-amber-400/40 border-t-amber-400 rounded-full" style={{ margin: "0 auto 16px" }}/>
            <p style={{ color: "rgba(255,255,255,0.5)" }}>جارٍ الاتصال...</p>
          </div>
      }
    </div>
  );
}
