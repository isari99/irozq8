import { useState, useRef, useCallback, useEffect } from "react";
import { useSearch, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Copy, Check, Users, Eye, EyeOff, Play, ChevronRight, Link2 } from "lucide-react";

// ─── WS URL ───────────────────────────────────────────────────────────────────
function getWsUrl(): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/ws`;
}

// ─── Theme ────────────────────────────────────────────────────────────────────
const GOLD = "#f59e0b";
const BG   = "linear-gradient(145deg,#13082e 0%,#1d0f4a 60%,#110628 100%)";
const HDR  = "rgba(18,8,40,0.97)";

// ─── Glow background orbs ─────────────────────────────────────────────────────
function ConvinceGlowOrbs() {
  return <>
    <div style={{ position: "fixed", top: "-8%", right: "0%", width: 500, height: 500, borderRadius: "50%",
      background: `radial-gradient(circle,${GOLD}28,transparent)`, filter: "blur(100px)",
      pointerEvents: "none", zIndex: 0 }} />
    <div style={{ position: "fixed", bottom: "-8%", left: "0%", width: 450, height: 450, borderRadius: "50%",
      background: "radial-gradient(circle,#6d28d940,transparent)", filter: "blur(90px)",
      pointerEvents: "none", zIndex: 0 }} />
    <div style={{ position: "fixed", top: "40%", left: "30%", width: 300, height: 300, borderRadius: "50%",
      background: `radial-gradient(circle,${GOLD}12,transparent)`, filter: "blur(70px)",
      pointerEvents: "none", zIndex: 0 }} />
  </>;
}

// ─── Preset Avatars ───────────────────────────────────────────────────────────
const AVATAR_CATEGORIES = [
  { label: "شباب", items: ["👦","🧑","👱","🧔","🤴","🦸","🧙","🕵️"] },
  { label: "بنات", items: ["👧","👩","👱‍♀️","👸","🦹‍♀️","🧝‍♀️","🧚‍♀️","🧜‍♀️"] },
  { label: "إيموجي", items: ["😎","🤩","🥸","🦁","🐯","🦊","👻","🌟"] },
];

function AvatarPicker({ selected, onSelect }: { selected: string; onSelect: (a: string) => void }) {
  const ALL = AVATAR_CATEGORIES.flatMap(c => c.items);
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <label style={{ color: "rgba(255,255,255,0.75)", fontSize: 13, fontWeight: 700 }}>صورتك</label>
        {selected && <span style={{ fontSize: 20, lineHeight: 1 }}>{selected}</span>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(8,1fr)", gap: 6 }}>
        {ALL.map(a => (
          <button key={a} onClick={() => onSelect(a)} style={{
            width: "100%", aspectRatio: "1", borderRadius: 10, fontSize: 20,
            background: selected === a ? `${GOLD}30` : "rgba(255,255,255,0.05)",
            border: `2px solid ${selected === a ? GOLD : "rgba(255,255,255,0.1)"}`,
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: selected === a ? `0 0 10px ${GOLD}55` : "none",
            transform: selected === a ? "scale(1.1)" : "scale(1)",
            transition: "all 0.12s", padding: 0,
          }}>{a}</button>
        ))}
      </div>
    </div>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface ConvincePlayer {
  id: string; name: string; color: string; avatar: string; score: number;
  isHost: boolean; disconnected: boolean; hasAnswered: boolean; isBot?: boolean;
}
interface CurrentReview {
  id: string; name: string; color: string; avatar: string;
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
  winner: { id: string; name: string; color: string; avatar: string } | null;
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
      }}>{p.avatar || initials(p.name)}</div>
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

function NumberRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const locked = value > 0;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10 }}>
      {[1,2,3,4,5,6,7,8,9,10].map(n => {
        const selected = n === value;
        return (
          <button key={n}
            onClick={() => { if (!locked) onChange(n); }}
            disabled={locked}
            style={{
              padding: "14px 0", borderRadius: 14, fontWeight: 900, fontSize: 20,
              cursor: locked ? "default" : "pointer",
              border: `2px solid ${selected ? GOLD : "rgba(255,255,255,0.15)"}`,
              background: selected
                ? `linear-gradient(135deg,${GOLD},#d97706)`
                : "rgba(255,255,255,0.07)",
              color: selected ? "#000" : "rgba(255,255,255,0.75)",
              boxShadow: selected ? `0 4px 20px ${GOLD}60` : "none",
              transform: selected ? "scale(1.07)" : "scale(1)",
              transition: "all 0.15s",
              fontFamily: "'Cairo','Arial',sans-serif",
            }}>{n}</button>
        );
      })}
    </div>
  );
}

// ─── Inline Scoreboard Grid ───────────────────────────────────────────────────
const MEDALS = ["🥇","🥈","🥉"];
function ConvinceScoreboard({ players, myId }: { players: ConvincePlayer[]; myId: string | null }) {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  const cols = Math.min(sorted.length, 6);
  return (
    <div style={{
      background: "rgba(0,0,0,0.25)", borderBottom: "1px solid rgba(255,255,255,0.07)",
      padding: "10px 16px",
      display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`,
      gap: 6, fontFamily: "'Cairo','Arial',sans-serif",
    }}>
      {sorted.map((p, idx) => {
        const isMe = p.id === myId;
        return (
          <div key={p.id} style={{
            display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
            padding: "6px 4px", borderRadius: 10, position: "relative",
            background: isMe ? `${p.color}18` : "rgba(255,255,255,0.03)",
            border: `1px solid ${isMe ? p.color + "55" : "rgba(255,255,255,0.06)"}`,
            transition: "all 0.3s",
          }}>
            {idx < 3 && (
              <div style={{ position: "absolute", top: -7, left: "50%", transform: "translateX(-50%)", fontSize: 12, lineHeight: 1 }}>
                {MEDALS[idx]}
              </div>
            )}
            <div style={{
              width: 34, height: 34, borderRadius: "50%", flexShrink: 0,
              background: p.color + "25", border: `2px solid ${p.color}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 17, boxShadow: isMe ? `0 0 12px ${p.color}55` : "none",
            }}>{p.avatar || (p.isBot ? "🤖" : initials(p.name))}</div>
            <div style={{
              color: isMe ? "#fff" : "rgba(255,255,255,0.75)", fontSize: 10, fontWeight: 700,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              width: "100%", textAlign: "center",
            }}>{p.name.length > 7 ? p.name.slice(0,6)+"…" : p.name}</div>
            <div style={{ color: GOLD, fontSize: 14, fontWeight: 900, lineHeight: 1 }}>{p.score}</div>
          </div>
        );
      })}
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
  const [selectedAvatar, setSelectedAvatar] = useState("😎");

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
    send({ type: "convince:create", name: myName.trim(), avatar: selectedAvatar, ...settings });
    setScreen("game");
  };
  const joinRoom = () => {
    if (!myName.trim()) { setError("اكتب اسمك أولاً"); return; }
    if (!joinCode.trim()) { setError("اكتب كود الغرفة"); return; }
    send({ type: "convince:join", name: myName.trim(), avatar: selectedAvatar, code: joinCode.toUpperCase().trim() });
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
    <div dir="rtl" style={{
      minHeight: "100vh", background: BG, display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", padding: "16px",
      fontFamily: "'Cairo','Arial',sans-serif", position: "relative", overflowY: "auto",
    }}>
      <ConvinceGlowOrbs />
      <div style={{ width: "100%", maxWidth: maxW, position: "relative", zIndex: 1 }}>{children}</div>
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
        background: "none", border: "none", color: "rgba(255,255,255,0.55)", cursor: "pointer",
        display: "flex", alignItems: "center", gap: 6, fontSize: 13, marginBottom: 16, fontWeight: 700,
      }}><ArrowRight size={15}/>رجوع</button>

      <h2 style={{ fontSize: 22, fontWeight: 900, color: "#fff", marginBottom: 16, textAlign: "center" }}>إعدادات الجلسة</h2>
      {error && <p style={{ color: "#f87171", marginBottom: 10, fontSize: 13 }}>{error}</p>}

      {/* Name + Avatar side by side */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "start", marginBottom: 14 }}>
        <div>
          <label style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: 700, display: "block", marginBottom: 6 }}>اسمك</label>
          <input value={myName} onChange={e => setMyName(e.target.value)} placeholder="أدخل اسمك..."
            style={{ width: "100%", padding: "11px 14px", borderRadius: 12,
              background: "rgba(255,255,255,0.08)", border: `1px solid ${GOLD}44`, color: "#fff",
              fontSize: 15, fontWeight: 700, outline: "none", boxSizing: "border-box" }}/>
        </div>
        <div style={{ textAlign: "center" }}>
          <label style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: 700, display: "block", marginBottom: 6 }}>صورتك</label>
          <div style={{ width: 46, height: 46, borderRadius: 12, background: `${GOLD}20`,
            border: `2px solid ${GOLD}66`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26 }}>
            {selectedAvatar}
          </div>
        </div>
      </div>

      {/* Avatar picker */}
      <AvatarPicker selected={selectedAvatar} onSelect={setSelectedAvatar}/>

      {/* Settings grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
        {/* Timer – vertical list */}
        <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 14, padding: "12px 10px",
          border: "1px solid rgba(255,255,255,0.08)" }}>
          <div style={{ color: GOLD, fontSize: 11, fontWeight: 900, marginBottom: 8, textAlign: "center", letterSpacing: "0.04em" }}>⏱ مدة الإجابة</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {[20,30,60,100,180].map(s => {
              const sel = settings.timerSecs === s;
              return (
                <button key={s} onClick={() => setSettings(p => ({ ...p, timerSecs: s }))} style={{
                  width: "100%", padding: "8px 10px", borderRadius: 9, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  background: sel ? `${GOLD}22` : "rgba(255,255,255,0.04)",
                  border: `1px solid ${sel ? GOLD + "77" : "rgba(255,255,255,0.08)"}`,
                  color: sel ? GOLD : "rgba(255,255,255,0.72)",
                  fontWeight: sel ? 800 : 600, fontSize: 12, fontFamily: "'Cairo','Arial',sans-serif",
                  boxShadow: sel ? `0 2px 10px ${GOLD}25` : "none", transition: "all 0.12s",
                }}>
                  <span>{s} ث</span>
                  <div style={{ width: 13, height: 13, borderRadius: "50%", flexShrink: 0,
                    border: `2px solid ${sel ? GOLD : "rgba(255,255,255,0.25)"}`,
                    background: sel ? GOLD : "transparent", display: "flex", alignItems: "center", justifyContent: "center",
                  }}>{sel && <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#000" }}/>}</div>
                </button>
              );
            })}
          </div>
        </div>
        {/* Score – vertical list */}
        <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 14, padding: "12px 10px",
          border: "1px solid rgba(255,255,255,0.08)" }}>
          <div style={{ color: GOLD, fontSize: 11, fontWeight: 900, marginBottom: 8, textAlign: "center", letterSpacing: "0.04em" }}>🏆 نقاط الفوز</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {[30,50,70,100,150,200].map(pts => {
              const sel = settings.targetScore === pts;
              return (
                <button key={pts} onClick={() => setSettings(p => ({ ...p, targetScore: pts }))} style={{
                  width: "100%", padding: "8px 10px", borderRadius: 9, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  background: sel ? `${GOLD}22` : "rgba(255,255,255,0.04)",
                  border: `1px solid ${sel ? GOLD + "77" : "rgba(255,255,255,0.08)"}`,
                  color: sel ? GOLD : "rgba(255,255,255,0.72)",
                  fontWeight: sel ? 800 : 600, fontSize: 12, fontFamily: "'Cairo','Arial',sans-serif",
                  boxShadow: sel ? `0 2px 10px ${GOLD}25` : "none", transition: "all 0.12s",
                }}>
                  <span>{pts}</span>
                  <div style={{ width: 13, height: 13, borderRadius: "50%", flexShrink: 0,
                    border: `2px solid ${sel ? GOLD : "rgba(255,255,255,0.25)"}`,
                    background: sel ? GOLD : "transparent", display: "flex", alignItems: "center", justifyContent: "center",
                  }}>{sel && <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#000" }}/>}</div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Hide Writing */}
      <button onClick={() => setSettings(p => ({ ...p, hideWriting: !p.hideWriting }))} style={{
        width: "100%", padding: "12px 16px", borderRadius: 12, cursor: "pointer",
        display: "flex", alignItems: "center", gap: 10, marginBottom: 16,
        background: settings.hideWriting ? `${GOLD}18` : "rgba(255,255,255,0.04)",
        border: `1px solid ${settings.hideWriting ? GOLD + "66" : "rgba(255,255,255,0.1)"}`,
        color: "#fff", fontFamily: "'Cairo','Arial',sans-serif",
      }}>
        {settings.hideWriting ? <EyeOff size={16} color={GOLD}/> : <Eye size={16} color="rgba(255,255,255,0.45)"/>}
        <div style={{ textAlign: "right", flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 13, color: settings.hideWriting ? GOLD : "rgba(255,255,255,0.85)" }}>إخفاء الكتابة</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>يمنع ظهور الإجابات على البث</div>
        </div>
        <div style={{ width: 40, height: 22, borderRadius: 11,
          background: settings.hideWriting ? GOLD : "rgba(255,255,255,0.15)", position: "relative", transition: "background 0.3s", flexShrink: 0 }}>
          <div style={{ position: "absolute", top: 2, width: 18, height: 18, borderRadius: "50%", background: "#fff",
            transition: "right 0.3s", right: settings.hideWriting ? 2 : 20 }}/>
        </div>
      </button>

      <button onClick={createRoom} disabled={!wsReady} style={{
        width: "100%", padding: "15px", borderRadius: 14, fontWeight: 900, fontSize: 16, cursor: "pointer",
        background: wsReady ? `linear-gradient(135deg,${GOLD},#d97706)` : "rgba(255,255,255,0.08)",
        color: wsReady ? "#000" : "rgba(255,255,255,0.4)", border: "none",
        boxShadow: wsReady ? `0 6px 24px ${GOLD}50` : "none", fontFamily: "'Cairo','Arial',sans-serif",
      }}>🎤 ابدأ الجلسة</button>
    </motion.div>
  , 540);

  // ─── JOIN SCREEN ──────────────────────────────────────────────────────────
  if (screen === "join") return wrap(
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
      <button onClick={() => setScreen("entry")} style={{
        background: "none", border: "none", color: "rgba(255,255,255,0.55)", cursor: "pointer",
        display: "flex", alignItems: "center", gap: 6, fontSize: 13, marginBottom: 16, fontWeight: 700,
      }}><ArrowRight size={15}/>رجوع</button>

      <h2 style={{ fontSize: 22, fontWeight: 900, color: "#fff", marginBottom: 16, textAlign: "center" }}>انضم لغرفة</h2>
      {error && <p style={{ color: "#f87171", marginBottom: 10, fontSize: 13 }}>{error}</p>}

      {/* Name + Avatar + Code */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "start", marginBottom: 12 }}>
        <div>
          <label style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: 700, display: "block", marginBottom: 6 }}>اسمك</label>
          <input value={myName} onChange={e => setMyName(e.target.value)} placeholder="أدخل اسمك..."
            style={{ width: "100%", padding: "11px 14px", borderRadius: 12,
              background: "rgba(255,255,255,0.08)", border: `1px solid ${GOLD}44`, color: "#fff",
              fontSize: 15, fontWeight: 700, outline: "none", boxSizing: "border-box" }}/>
        </div>
        <div style={{ textAlign: "center" }}>
          <label style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: 700, display: "block", marginBottom: 6 }}>صورتك</label>
          <div style={{ width: 46, height: 46, borderRadius: 12, background: `${GOLD}20`,
            border: `2px solid ${GOLD}66`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26 }}>
            {selectedAvatar}
          </div>
        </div>
      </div>

      <label style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: 700, display: "block", marginBottom: 6 }}>كود الغرفة</label>
      <input value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())} placeholder="ABCD"
        style={{ width: "100%", marginBottom: 14, padding: "12px 16px", borderRadius: 12,
          background: "rgba(255,255,255,0.08)", border: `1px solid rgba(255,255,255,0.2)`, color: "#fff",
          fontSize: 22, fontWeight: 900, outline: "none", boxSizing: "border-box", letterSpacing: "0.15em", textAlign: "center" }}/>

      <AvatarPicker selected={selectedAvatar} onSelect={setSelectedAvatar}/>

      <button onClick={joinRoom} disabled={!wsReady} style={{
        width: "100%", padding: "15px", borderRadius: 14, fontWeight: 900, fontSize: 16, cursor: "pointer",
        background: wsReady ? `linear-gradient(135deg,${GOLD},#d97706)` : "rgba(255,255,255,0.08)",
        color: wsReady ? "#000" : "rgba(255,255,255,0.4)", border: "none",
        boxShadow: wsReady ? `0 6px 24px ${GOLD}50` : "none", fontFamily: "'Cairo','Arial',sans-serif",
      }}>انضم للغرفة</button>
    </motion.div>
  , 480);

  // ─── GAME SCREEN ──────────────────────────────────────────────────────────
  if (screen === "game" && gameState) {
    const { phase, players, currentReview, settings: gs } = gameState;
    const notReviewedPlayers = players.filter(p => !gameState.reviewedIds.includes(p.id) && !p.disconnected);

    // ── Lobby ──
    if (phase === "lobby") return (
      <div dir="rtl" style={{ minHeight: "100vh", background: BG, fontFamily: "'Cairo','Arial',sans-serif", padding: 0 }}>
        {/* Header */}
        <div style={{ background: HDR, borderBottom: `1px solid ${GOLD}44`, padding: "14px 20px",
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
                  {/* Avatar circle */}
                  <div style={{ width: 46, height: 46, borderRadius: "50%", flexShrink: 0,
                    border: `2.5px solid ${p.color}`,
                    boxShadow: `0 0 10px ${p.color + "55"}`,
                    background: p.color + "22",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 22, fontWeight: 900,
                    color: p.color }}>
                    {p.avatar || (p.isBot ? "🤖" : initials(p.name))}
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
      <div dir="rtl" style={{ minHeight: "100vh", background: BG, fontFamily: "'Cairo','Arial',sans-serif" }}>
        {/* Back header */}
        <div style={{ background: HDR, borderBottom: `1px solid ${GOLD}44`, padding: "10px 16px",
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
    if (phase === "revealing") {
      const allDone = notReviewedPlayers.length === 0;
      return (
        <div dir="rtl" style={{ minHeight: "100vh", background: BG, fontFamily: "'Cairo','Arial',sans-serif" }}>
          {/* Header */}
          <div style={{ background: HDR, borderBottom: `1px solid ${GOLD}33`, padding: "10px 16px",
            display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <button onClick={() => navigate("/")} style={{
              background: "none", border: "none", color: "rgba(255,255,255,0.8)", cursor: "pointer",
              display: "flex", alignItems: "center", gap: 5, fontSize: 13, fontWeight: 700,
            }}><ArrowRight size={14}/>رجوع</button>
            <span style={{ color: GOLD, fontWeight: 900, fontSize: 15, textShadow: `0 0 10px ${GOLD}` }}>🎤 أقنعني</span>
            <div style={{ width: 60 }}/>
          </div>

          {/* Scoreboard inline */}
          <ConvinceScoreboard players={players} myId={myId}/>

          <div style={{ maxWidth: 560, margin: "0 auto", padding: "20px 16px" }}>
            {/* Title */}
            <div style={{ textAlign: "center", marginBottom: 20 }}>
              <h2 style={{ fontSize: 20, fontWeight: 900, color: "#fff", marginBottom: 4 }}>
                {allDone ? "✅ تم تقييم الجميع" : "🎛️ مرحلة العرض"}
              </h2>
              <p style={{ color: "rgba(255,255,255,0.55)", fontSize: 13, fontWeight: 600 }}>
                {allDone
                  ? (amHost ? "اضغط زر الجولة التالية للمتابعة" : "في انتظار الهوست...")
                  : (amHost ? "اضغط على اسم اللاعب لعرض إجابته" : "الهوست يختار من يعرض إجابته...")}
              </p>
            </div>

            {/* Vertical players list */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
              {players.filter(p => !p.disconnected).map(p => {
                const reviewed = gameState.reviewedIds.includes(p.id);
                const canClick = amHost && !reviewed;
                return (
                  <motion.button
                    key={p.id}
                    whileHover={canClick ? { x: -4 } : {}}
                    whileTap={canClick ? { scale: 0.98 } : {}}
                    onClick={canClick ? () => showPlayer(p.id) : undefined}
                    style={{
                      width: "100%", textAlign: "right",
                      padding: "13px 16px", borderRadius: 14,
                      cursor: canClick ? "pointer" : "default",
                      background: reviewed ? "rgba(74,222,128,0.06)" : "rgba(255,255,255,0.05)",
                      border: `1.5px solid ${reviewed ? "#4ade8044" : p.color + "55"}`,
                      display: "flex", alignItems: "center", gap: 13,
                      opacity: reviewed ? 0.72 : 1, transition: "all 0.18s",
                      boxShadow: reviewed ? "none" : `0 2px 14px ${p.color}14`,
                      fontFamily: "'Cairo','Arial',sans-serif",
                    }}>
                    {/* Avatar */}
                    <div style={{ width: 46, height: 46, borderRadius: "50%", flexShrink: 0,
                      background: p.color + "22", border: `2px solid ${reviewed ? "#4ade80" : p.color}`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 22, boxShadow: reviewed ? "none" : `0 0 10px ${p.color}35`,
                    }}>{p.avatar || (p.isBot ? "🤖" : initials(p.name))}</div>
                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: reviewed ? "rgba(255,255,255,0.6)" : "#fff", fontWeight: 800, fontSize: 15, marginBottom: 2 }}>
                        {p.name}
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 700,
                        color: reviewed ? "#4ade80" : p.hasAnswered ? "#86efac" : "rgba(255,255,255,0.38)" }}>
                        {reviewed ? "✓ تم تقييمه" : p.hasAnswered ? "✓ أجاب" : "لم يجب بعد"}
                      </div>
                    </div>
                    {/* Right badge */}
                    {reviewed ? (
                      <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#4ade80",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 14, fontWeight: 900, color: "#000", flexShrink: 0 }}>✓</div>
                    ) : canClick ? (
                      <ChevronRight size={18} color={p.color} style={{ flexShrink: 0 }}/>
                    ) : null}
                  </motion.button>
                );
              })}
            </div>

            {/* Next Round button */}
            {allDone && amHost && (
              <motion.button
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                onClick={nextPlayer}
                style={{
                  width: "100%", padding: "17px", borderRadius: 14,
                  background: `linear-gradient(135deg,${GOLD},#d97706)`,
                  border: "none", color: "#000", fontWeight: 900, fontSize: 17,
                  cursor: "pointer", boxShadow: `0 6px 28px ${GOLD}55`,
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                  fontFamily: "'Cairo','Arial',sans-serif",
                }}>
                <Play size={19}/>الجولة التالية
              </motion.button>
            )}
            {allDone && !amHost && (
              <div style={{ textAlign: "center", color: "rgba(255,255,255,0.5)", fontSize: 14, fontWeight: 600,
                padding: 18, background: "rgba(255,255,255,0.03)", borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.07)" }}>
                ⏳ في انتظار الهوست للجولة التالية...
              </div>
            )}
          </div>
        </div>
      );
    }

    // ── Rating ──
    if (phase === "rating" && currentReview) {
      const isBeingRated = myId === currentReview.id;
      const alreadyRated = currentReview.myRating !== null || myRating > 0;

      return (
        <div dir="rtl" style={{ minHeight: "100vh", background: BG, fontFamily: "'Cairo','Arial',sans-serif" }}>
          <div style={{ background: HDR, borderBottom: `1px solid ${GOLD}33`, padding: "10px 16px",
            display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <button onClick={() => navigate("/")} style={{
              background: "none", border: "none", color: "rgba(255,255,255,0.8)", cursor: "pointer",
              display: "flex", alignItems: "center", gap: 5, fontSize: 13, fontWeight: 700,
            }}><ArrowRight size={14}/>رجوع</button>
            <span style={{ color: GOLD, fontWeight: 900, fontSize: 15, textShadow: `0 0 10px ${GOLD}` }}>🎤 أقنعني</span>
            <div style={{ width: 60 }}/>
          </div>
          <ConvinceScoreboard players={players} myId={myId}/>
          <div style={{ maxWidth: 600, margin: "0 auto", padding: "24px 16px" }}>

            {/* Player being rated */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              style={{ textAlign: "center", marginBottom: 32 }}>
              <div style={{
                width: 80, height: 80, borderRadius: "50%", margin: "0 auto 16px",
                background: currentReview.color + "33", border: `3px solid ${currentReview.color}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 36, fontWeight: 900, color: currentReview.color,
                boxShadow: `0 0 32px ${currentReview.color}55`,
              }}>{currentReview.avatar || initials(currentReview.name)}</div>
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
                <p style={{ color: GOLD, fontWeight: 800, fontSize: 18 }}>✅ أعطيت {myRating} من 10</p>
                <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 14, marginTop: 8 }}>في انتظار باقي اللاعبين...</p>
              </div>
            ) : (
              <div>
                <p style={{ textAlign: "center", color: "rgba(255,255,255,0.75)", fontSize: 15, fontWeight: 700, marginBottom: 18 }}>
                  قيّم الإجابة من 1 إلى 10
                </p>
                <NumberRating value={myRating} onChange={ratePlayer}/>
              </div>
            )}
          </div>
        </div>
      );
    }

    // ── Leaderboard phase is removed — backend now goes directly to revealing ──


    // ── Winner ──
    if (phase === "winner" && gameState.winner) return (
      <div dir="rtl" style={{ minHeight: "100vh", background: BG, fontFamily: "'Cairo','Arial',sans-serif" }}>
        <div style={{ background: HDR, borderBottom: `1px solid ${GOLD}33`, padding: "10px 16px",
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
            }}>{gameState.winner.avatar || initials(gameState.winner.name)}</div>
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
