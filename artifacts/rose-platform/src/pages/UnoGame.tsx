import { useState, useRef, useCallback, useEffect, memo } from "react";
import { useSearch, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight, Copy, Check, Users, Play, Link2,
  MessageCircle, X, Send, RotateCcw, Trophy, ChevronRight,
} from "lucide-react";

// ─── WebSocket URL ────────────────────────────────────────────────────────────
function getWsUrl() {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/ws`;
}

// ─── Types ────────────────────────────────────────────────────────────────────
type Color = "red" | "blue" | "green" | "yellow";
type WildColor = Color | "wild";

interface UnoCard {
  id: string;
  color: WildColor;
  type: "number" | "skip" | "reverse" | "draw2" | "wild" | "wild4";
  value?: number;
}

interface PlayerInfo {
  id: string; name: string; cardCount: number;
  saidUno: boolean; isHost: boolean; isConnected: boolean;
  isCurrentPlayer: boolean; score: number;
  isBot?: boolean; difficulty?: "easy" | "medium" | "hard";
}

interface ChatMsg { playerId: string; name: string; text: string; ts: number; }

interface UnoState {
  roomCode: string; phase: "lobby" | "playing" | "gameover";
  players: PlayerInfo[]; myHand: UnoCard[];
  myPlayerIndex: number; myId: string;
  topCard: UnoCard | null; currentColor: Color;
  currentPlayerIndex: number; direction: 1 | -1;
  deckCount: number; drawStack: number;
  pendingWild: boolean; winner: string | null; winnerName: string | null;
  lastAction: string; chat: ChatMsg[];
}

// ─── Card Color Map ───────────────────────────────────────────────────────────
const CARD_COLORS: Record<WildColor, string> = {
  red: "#dc2626", blue: "#2563eb", green: "#16a34a", yellow: "#ca8a04", wild: "wild",
};
const CARD_LIGHT: Record<WildColor, string> = {
  red: "#fca5a5", blue: "#93c5fd", green: "#86efac", yellow: "#fde047", wild: "#fff",
};
const COLOR_AR: Record<Color, string> = {
  red: "أحمر", blue: "أزرق", green: "أخضر", yellow: "أصفر",
};

// ─── Glow Orbs ────────────────────────────────────────────────────────────────
function UnoGlowOrbs() {
  return <>
    <div style={{ position: "fixed", top: "-8%", right: "-5%", width: 500, height: 500, borderRadius: "50%",
      background: "radial-gradient(circle,#dc262655,transparent)", filter: "blur(100px)",
      pointerEvents: "none", zIndex: 0, opacity: 0.5 }} />
    <div style={{ position: "fixed", bottom: "-8%", left: "-5%", width: 450, height: 450, borderRadius: "50%",
      background: "radial-gradient(circle,#2563eb55,transparent)", filter: "blur(90px)",
      pointerEvents: "none", zIndex: 0, opacity: 0.45 }} />
    <div style={{ position: "fixed", top: "40%", left: "50%", width: 350, height: 350, borderRadius: "50%",
      transform: "translate(-50%,-50%)",
      background: "radial-gradient(circle,#16a34a33,transparent)", filter: "blur(80px)",
      pointerEvents: "none", zIndex: 0, opacity: 0.3 }} />
  </>;
}

// ─── Sound Engine ─────────────────────────────────────────────────────────────
let _audioCtx: AudioContext | null = null;
function getAudioCtx() {
  if (!_audioCtx) {
    try { _audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)(); } catch { _audioCtx = null; }
  }
  return _audioCtx;
}
function playUnoSound(type: "play" | "draw" | "turn", vol: number) {
  if (vol <= 0) return;
  const ctx = getAudioCtx();
  if (!ctx) return;
  const gain = ctx.createGain();
  const osc = ctx.createOscillator();
  osc.connect(gain);
  gain.connect(ctx.destination);
  const now = ctx.currentTime;
  gain.gain.setValueAtTime(vol * 0.35, now);
  if (type === "play") {
    osc.type = "sine";
    osc.frequency.setValueAtTime(523, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.07);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    osc.start(now); osc.stop(now + 0.22);
  } else if (type === "draw") {
    osc.type = "triangle";
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.exponentialRampToValueAtTime(200, now + 0.12);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    osc.start(now); osc.stop(now + 0.18);
  } else {
    osc.type = "sine";
    osc.frequency.setValueAtTime(659, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc.start(now); osc.stop(now + 0.12);
  }
}

// ─── Card Symbol ─────────────────────────────────────────────────────────────
function cardSymbol(card: UnoCard): string {
  if (card.type === "number") return String(card.value ?? 0);
  if (card.type === "skip") return "⊘";
  if (card.type === "reverse") return "⇄";
  if (card.type === "draw2") return "+2";
  if (card.type === "wild") return "🌈";
  if (card.type === "wild4") return "+4";
  return "?";
}

// ─── UNO Card Component ───────────────────────────────────────────────────────
interface UnoCardProps {
  card: UnoCard;
  playable?: boolean;
  active?: boolean; // current color highlight
  onClick?: () => void;
  size?: "sm" | "md" | "lg";
  faceDown?: boolean;
  style?: React.CSSProperties;
}

const UnoCardEl = memo(function UnoCardEl({ card, playable, onClick, size = "md", faceDown, style }: UnoCardProps) {
  const [hovered, setHovered] = useState(false);

  const dims = size === "sm" ? { w: 40, h: 56, fs: 10, sym: 14 }
             : size === "lg" ? { w: 80, h: 112, fs: 18, sym: 30 }
             : { w: 56, h: 80, fs: 14, sym: 22 };

  if (faceDown) {
    return (
      <div style={{
        width: dims.w, height: dims.h, borderRadius: dims.w * 0.15,
        background: "linear-gradient(135deg,#1e1b4b,#312e81)",
        border: "2px solid #4338ca",
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
        flexShrink: 0, ...style,
      }}>
        <div style={{ fontSize: dims.sym * 0.7, opacity: 0.6, color: "#818cf8" }}>UNO</div>
      </div>
    );
  }

  const isWild = card.color === "wild";
  const bg = isWild
    ? "linear-gradient(135deg,#dc2626 25%,#2563eb 25% 50%,#16a34a 50% 75%,#ca8a04 75%)"
    : CARD_COLORS[card.color];

  const sym = cardSymbol(card);
  const canClick = !!onClick;

  return (
    <motion.div
      whileHover={canClick && playable ? { y: -12, scale: 1.08 } : canClick ? { y: -4 } : {}}
      whileTap={canClick ? { scale: 0.95 } : {}}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      onClick={onClick}
      style={{
        width: dims.w, height: dims.h, borderRadius: dims.w * 0.15,
        background: bg,
        border: `2.5px solid ${playable && hovered ? "#fff" : "rgba(255,255,255,0.25)"}`,
        position: "relative", flexShrink: 0,
        cursor: canClick ? "pointer" : "default",
        boxShadow: playable && hovered
          ? `0 8px 24px ${CARD_COLORS[card.color] === "wild" ? "#fff" : CARD_COLORS[card.color]}88, 0 0 0 2px #fff`
          : "0 4px 12px rgba(0,0,0,0.4)",
        opacity: canClick && !playable ? 0.65 : 1,
        transition: "box-shadow 0.15s, border-color 0.15s",
        userSelect: "none",
        ...style,
      }}
    >
      {/* White oval center */}
      <div style={{
        position: "absolute", inset: "12% 10%",
        background: isWild ? "rgba(0,0,0,0.75)" : "rgba(255,255,255,0.15)",
        borderRadius: "50%",
        display: "flex", alignItems: "center", justifyContent: "center",
        border: "1.5px solid rgba(255,255,255,0.3)",
      }}>
        <span style={{
          fontSize: dims.sym,
          fontWeight: 900,
          color: isWild ? "#fff" : "rgba(255,255,255,0.95)",
          textShadow: "0 1px 4px rgba(0,0,0,0.6)",
          lineHeight: 1,
          fontFamily: "'Cairo','Arial',sans-serif",
        }}>{sym}</span>
      </div>

      {/* Corner top-left */}
      <div style={{ position: "absolute", top: 3, left: 4, fontSize: dims.fs * 0.75,
        fontWeight: 900, color: "rgba(255,255,255,0.9)", lineHeight: 1 }}>{sym}</div>
      {/* Corner bottom-right (rotated) */}
      <div style={{ position: "absolute", bottom: 3, right: 4, fontSize: dims.fs * 0.75,
        fontWeight: 900, color: "rgba(255,255,255,0.9)", lineHeight: 1,
        transform: "rotate(180deg)" }}>{sym}</div>

      {/* Playable indicator */}
      {playable && (
        <motion.div
          animate={{ opacity: [0.6, 1, 0.6] }}
          transition={{ repeat: Infinity, duration: 1.4 }}
          style={{
            position: "absolute", inset: -3, borderRadius: dims.w * 0.15 + 3,
            border: "2px solid #fff", pointerEvents: "none",
          }}
        />
      )}
    </motion.div>
  );
});

// ─── Color Picker Modal ───────────────────────────────────────────────────────
function ColorPicker({ onPick }: { onPick: (c: Color) => void }) {
  const colors: { c: Color; label: string; bg: string }[] = [
    { c: "red", label: "أحمر", bg: "#dc2626" },
    { c: "blue", label: "أزرق", bg: "#2563eb" },
    { c: "green", label: "أخضر", bg: "#16a34a" },
    { c: "yellow", label: "أصفر", bg: "#ca8a04" },
  ];
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 200,
        display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
      <p style={{ color: "#fff", fontWeight: 900, fontSize: 20, marginBottom: 8 }}>اختر اللون</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {colors.map(({ c, label, bg }) => (
          <motion.button key={c} whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }}
            onClick={() => onPick(c)}
            style={{
              width: 120, height: 120, borderRadius: 20, background: bg,
              border: "3px solid rgba(255,255,255,0.4)", cursor: "pointer",
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              gap: 8, color: "#fff", fontWeight: 900, fontSize: 16,
              boxShadow: `0 8px 24px ${bg}88`,
              fontFamily: "'Cairo','Arial',sans-serif",
            }}>
            <div style={{ width: 40, height: 40, borderRadius: "50%", background: "rgba(255,255,255,0.2)",
              border: "2px solid #fff" }} />
            {label}
          </motion.button>
        ))}
      </div>
    </motion.div>
  );
}

// ─── Chat Panel ───────────────────────────────────────────────────────────────
function ChatPanel({ chat, myId, onSend, onClose }: {
  chat: ChatMsg[]; myId: string; onSend: (t: string) => void; onClose: () => void;
}) {
  const [text, setText] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chat.length]);

  const send = () => {
    if (!text.trim()) return;
    onSend(text.trim());
    setText("");
  };

  return (
    <motion.div initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
      style={{
        position: "fixed", top: 0, right: 0, bottom: 0, width: 300,
        background: "rgba(10,8,30,0.98)", borderLeft: "1px solid rgba(255,255,255,0.1)",
        zIndex: 150, display: "flex", flexDirection: "column",
        fontFamily: "'Cairo','Arial',sans-serif",
      }}>
      <div style={{ padding: "16px 16px 12px", borderBottom: "1px solid rgba(255,255,255,0.1)",
        display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ color: "#fff", fontWeight: 800, fontSize: 16 }}>💬 شات اللعبة</span>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "#fff", cursor: "pointer" }}>
          <X size={20} />
        </button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
        {chat.map((m, i) => (
          <div key={i} style={{ textAlign: m.playerId === myId ? "left" : "right" }}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 2 }}>{m.name}</div>
            <div style={{
              display: "inline-block", padding: "6px 12px", borderRadius: 12, maxWidth: "85%",
              background: m.playerId === myId ? "#2563eb" : "rgba(255,255,255,0.1)",
              color: "#fff", fontSize: 13, fontWeight: 600, wordBreak: "break-word",
            }}>{m.text}</div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div style={{ padding: 12, borderTop: "1px solid rgba(255,255,255,0.1)",
        display: "flex", gap: 8 }}>
        <input value={text} onChange={e => setText(e.target.value)}
          onKeyDown={e => e.key === "Enter" && send()}
          placeholder="اكتب رسالة..."
          style={{
            flex: 1, padding: "8px 12px", borderRadius: 10,
            background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.2)",
            color: "#fff", fontSize: 13, outline: "none",
            fontFamily: "'Cairo','Arial',sans-serif",
          }} />
        <button onClick={send} disabled={!text.trim()}
          style={{ background: "#2563eb", border: "none", borderRadius: 10, padding: "8px 12px",
            cursor: text.trim() ? "pointer" : "not-allowed", opacity: text.trim() ? 1 : 0.5, color: "#fff" }}>
          <Send size={16} />
        </button>
      </div>
    </motion.div>
  );
}

// ─── Other Players Display (around-table style) ───────────────────────────────
const PLAYER_PALETTE = ["#ef4444","#3b82f6","#22c55e","#eab308","#a855f7","#06b6d4","#ec4899"];
function getPlayerColor(name: string) {
  return PLAYER_PALETTE[name.charCodeAt(0) % PLAYER_PALETTE.length];
}

function OtherPlayerCard({ player, orientation = "top" }: {
  player: PlayerInfo;
  orientation?: "top" | "left" | "right";
}) {
  const c = getPlayerColor(player.name);
  const isCurrent = player.isCurrentPlayer;
  const isHoriz = orientation === "top";
  const shown = Math.min(player.cardCount, isHoriz ? 6 : 4);
  const cardW = isHoriz ? 22 : 18;
  const cardH = isHoriz ? 31 : 26;
  const overlap = isHoriz ? 10 : 8;

  const cardFan = () => {
    if (shown === 0) return null;
    if (isHoriz) {
      const totalW = cardW + (shown - 1) * (cardW - overlap);
      return (
        <div style={{ position: "relative", width: totalW, height: cardH, flexShrink: 0 }}>
          {Array.from({ length: shown }).map((_, i) => (
            <div key={i} style={{
              position: "absolute", left: i * (cardW - overlap),
              width: cardW, height: cardH, borderRadius: 4,
              background: "linear-gradient(135deg,#1e1b4b,#312e81)",
              border: "1.5px solid #4f46e5",
              boxShadow: i === shown-1 ? "2px 2px 6px rgba(0,0,0,0.5)" : "none",
              zIndex: i,
            }} />
          ))}
        </div>
      );
    } else {
      const totalH = cardH + (shown - 1) * (cardH - overlap);
      return (
        <div style={{ position: "relative", width: cardW, height: totalH, flexShrink: 0 }}>
          {Array.from({ length: shown }).map((_, i) => (
            <div key={i} style={{
              position: "absolute", top: i * (cardH - overlap),
              width: cardW, height: cardH, borderRadius: 4,
              background: "linear-gradient(135deg,#1e1b4b,#312e81)",
              border: "1.5px solid #4f46e5",
              boxShadow: i === shown-1 ? "2px 2px 6px rgba(0,0,0,0.5)" : "none",
              zIndex: i,
            }} />
          ))}
        </div>
      );
    }
  };

  const avatar = (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <motion.div
        animate={isCurrent ? { boxShadow: [`0 0 0px ${c}`, `0 0 18px ${c}aa`, `0 0 0px ${c}`] } : {}}
        transition={{ repeat: Infinity, duration: 1.0 }}
        style={{
          width: isHoriz ? 42 : 38, height: isHoriz ? 42 : 38, borderRadius: "50%",
          background: c + "22",
          border: `2.5px solid ${isCurrent ? c : c + "66"}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: isHoriz ? 17 : 14, fontWeight: 900, color: isCurrent ? c : c + "bb",
          transition: "all 0.3s",
        }}>
        {player.isBot ? "🤖" : player.name.trim()[0]?.toUpperCase() ?? "?"}
      </motion.div>
      {player.saidUno && (
        <div style={{
          position: "absolute", top: -8, right: -8,
          background: "#dc2626", color: "#fff", fontSize: 7, fontWeight: 900,
          padding: "2px 5px", borderRadius: 6, border: "1.5px solid #fff",
          letterSpacing: "0.04em",
        }}>UNO!</div>
      )}
      {isCurrent && (
        <motion.div
          animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 2.5, ease: "linear" }}
          style={{
            position: "absolute", inset: -5, borderRadius: "50%",
            border: `2px dashed ${c}99`, pointerEvents: "none",
          }} />
      )}
    </div>
  );

  if (isHoriz) return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", gap: 5,
      opacity: player.isConnected ? 1 : 0.35,
      background: isCurrent ? `${c}14` : "rgba(255,255,255,0.04)",
      border: `1.5px solid ${isCurrent ? c + "55" : "rgba(255,255,255,0.08)"}`,
      borderRadius: 14, padding: "10px 10px 7px",
      minWidth: 72, boxShadow: isCurrent ? `0 0 20px ${c}22` : "none",
      transition: "all 0.3s",
    }}>
      {avatar}
      <div style={{
        color: isCurrent ? "#fff" : "rgba(255,255,255,0.75)",
        fontSize: 10, fontWeight: 800, textAlign: "center",
        maxWidth: 70, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>{player.name}</div>
      {cardFan()}
      <div style={{ color: isCurrent ? c : "rgba(255,255,255,0.5)", fontSize: 10, fontWeight: 700 }}>
        {player.cardCount} {player.cardCount === 1 ? "ورقة" : "أوراق"}
      </div>
    </div>
  );

  return (
    <div style={{
      display: "flex",
      flexDirection: orientation === "left" ? "row" : "row-reverse",
      alignItems: "center", gap: 6,
      opacity: player.isConnected ? 1 : 0.35,
      background: isCurrent ? `${c}14` : "rgba(255,255,255,0.04)",
      border: `1.5px solid ${isCurrent ? c + "55" : "rgba(255,255,255,0.08)"}`,
      borderRadius: 12, padding: "7px 8px",
      boxShadow: isCurrent ? `0 0 18px ${c}22` : "none",
      transition: "all 0.3s",
    }}>
      {avatar}
      <div style={{ display: "flex", flexDirection: "column", gap: 3, alignItems: "flex-start" }}>
        <div style={{
          color: isCurrent ? "#fff" : "rgba(255,255,255,0.75)",
          fontSize: 10, fontWeight: 800,
          maxWidth: 64, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>{player.name}</div>
        <div style={{ color: isCurrent ? c : "rgba(255,255,255,0.5)", fontSize: 9, fontWeight: 700 }}>
          {player.cardCount} أوراق
        </div>
      </div>
      {cardFan()}
    </div>
  );
}

// ─── Color Indicator ─────────────────────────────────────────────────────────
function ActiveColor({ color }: { color: Color }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <motion.div
        animate={{ scale: [1, 1.1, 1] }} transition={{ repeat: Infinity, duration: 1 }}
        style={{
          width: 20, height: 20, borderRadius: "50%",
          background: CARD_COLORS[color],
          boxShadow: `0 0 12px ${CARD_COLORS[color]}`,
          border: "2px solid rgba(255,255,255,0.5)",
        }} />
      <span style={{ color: "#fff", fontSize: 12, fontWeight: 700 }}>{COLOR_AR[color]}</span>
    </div>
  );
}

// ─── Main Game Component ──────────────────────────────────────────────────────
type Screen = "entry" | "host-setup" | "join" | "game";

export default function UnoGame() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const urlCode = params.get("r") ?? "";
  const [, navigate] = useLocation();

  const wsRef = useRef<WebSocket | null>(null);
  const playerIdRef = useRef<string | null>(null);

  const [screen, setScreen] = useState<Screen>(urlCode ? "join" : "entry");
  const [wsReady, setWsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gs, setGs] = useState<UnoState | null>(null);
  const [myName, setMyName] = useState("");
  const [joinCode, setJoinCode] = useState(urlCode);
  const [copied, setCopied] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [unreadChat, setUnreadChat] = useState(0);
  const [lastActionAnim, setLastActionAnim] = useState("");
  const [botDifficulty, setBotDifficulty] = useState<"easy" | "medium" | "hard">("easy");
  const [soundVol, setSoundVol] = useState(0.6);
  const soundVolRef = useRef(0.6);

  const send = useCallback((msg: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify(msg));
  }, []);

  // Keep soundVolRef in sync
  useEffect(() => { soundVolRef.current = soundVol; }, [soundVol]);

  // ── WebSocket ──
  useEffect(() => {
    const ws = new WebSocket(getWsUrl());
    wsRef.current = ws;
    ws.onopen = () => setWsReady(true);
    ws.onclose = () => setWsReady(false);
    ws.onerror = () => setError("فشل الاتصال بالخادم");
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string);
        if (msg.type === "uno:state") {
          const newState = msg as UnoState;
          setGs(prev => {
            if (prev && newState.phase === "playing") {
              const prevTop = prev.topCard?.id;
              const newTop = newState.topCard?.id;
              const prevTurn = prev.currentPlayerIndex;
              const newTurn = newState.currentPlayerIndex;
              const vol = soundVolRef.current;
              if (newTop !== prevTop) playUnoSound("play", vol);
              else if (newState.myHand?.length > (prev.myHand?.length ?? 0)) playUnoSound("draw", vol);
              if (prevTurn !== newTurn) setTimeout(() => playUnoSound("turn", vol), 120);
            }
            return newState;
          });
          if (msg.lastAction) setLastActionAnim(msg.lastAction);
          setScreen("game");
        } else if (msg.type === "uno:created") {
          playerIdRef.current = msg.playerId;
          setJoinCode(msg.code);
        } else if (msg.type === "uno:joined") {
          playerIdRef.current = msg.playerId;
        } else if (msg.type === "uno:error") {
          setError(msg.message);
        }
      } catch { /* ignore */ }
    };
    return () => ws.close();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Unread chat badge
  useEffect(() => {
    if (!chatOpen && gs) setUnreadChat(c => c + 1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gs?.chat.length]);
  useEffect(() => { if (chatOpen) setUnreadChat(0); }, [chatOpen]);

  const myId = playerIdRef.current;
  const me = gs?.players.find(p => p.id === myId);
  const amHost = me?.isHost ?? false;
  const isMyTurn = gs ? gs.players[gs.currentPlayerIndex]?.id === myId : false;

  // ── Invite link ──
  const copyLink = useCallback(() => {
    const code = gs?.roomCode ?? joinCode;
    const base = window.location.origin + window.location.pathname;
    navigator.clipboard.writeText(`${base}?r=${code}`).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    });
  }, [gs?.roomCode, joinCode]);

  // ── Actions ──
  const createRoom = () => {
    if (!myName.trim()) { setError("اكتب اسمك أولاً"); return; }
    send({ type: "uno:create", name: myName.trim() });
    setScreen("game");
  };
  const joinRoom = () => {
    if (!myName.trim()) { setError("اكتب اسمك أولاً"); return; }
    if (!joinCode.trim()) { setError("اكتب كود الغرفة"); return; }
    send({ type: "uno:join", name: myName.trim(), code: joinCode.trim() });
    setScreen("game");
  };
  const playCard = (cardId: string) => send({ type: "uno:play_card", cardId });
  const drawCard = () => send({ type: "uno:draw" });
  const sayUno = () => send({ type: "uno:say_uno" });
  const chooseColor = (color: Color) => send({ type: "uno:choose_color", color });
  const playAgain = () => send({ type: "uno:play_again" });
  const sendChat = (text: string) => send({ type: "uno:chat", text });

  // ─── Helpers ──────────────────────────────────────────────────────────────
  const canPlayCard = (card: UnoCard): boolean => {
    if (!gs || !isMyTurn || gs.pendingWild) return false;
    const top = gs.topCard;
    if (!top) return false;
    const isWild = card.type === "wild" || card.type === "wild4";
    if (isWild) return true;
    if (gs.drawStack > 0) {
      return card.type === "draw2" && top.type === "draw2";
    }
    if (card.color === gs.currentColor) return true;
    if (top.type === card.type) return true;
    if (card.type === "number" && top.type === "number" && card.value === top.value) return true;
    return false;
  };

  const hasPlayableCard = gs?.myHand.some(canPlayCard) ?? false;

  // ─── Shared wrapper ───────────────────────────────────────────────────────
  const wrap = (children: React.ReactNode) => (
    <div className="min-h-screen gradient-bg flex flex-col items-center justify-center p-4"
      dir="rtl" style={{ fontFamily: "'Cairo','Arial',sans-serif", position: "relative" }}>
      <UnoGlowOrbs />
      <div style={{ width: "100%", maxWidth: 520, position: "relative", zIndex: 1 }}>{children}</div>
    </div>
  );

  // ─── ENTRY SCREEN ─────────────────────────────────────────────────────────
  if (screen === "entry") return wrap(
    <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }}>
      <button onClick={() => navigate("/")} style={{
        background: "none", border: "none", color: "rgba(255,255,255,0.55)", cursor: "pointer",
        display: "flex", alignItems: "center", gap: 6, fontSize: 13, marginBottom: 28, fontWeight: 700,
      }}><ArrowRight size={14}/>الرئيسية</button>

      <div style={{ textAlign: "center" }}>
        {/* Logo with glow ring */}
        <div style={{ position: "relative", display: "inline-block", marginBottom: 28 }}>
          <div style={{
            position: "absolute", inset: -10, borderRadius: 32,
            background: "radial-gradient(circle,rgba(220,38,38,0.45),transparent 70%)",
            filter: "blur(18px)", zIndex: 0,
          }} />
          <motion.img
            src="/uno-logo.png" alt="UNO"
            animate={{ y: [0, -6, 0] }}
            transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
            style={{
              width: 130, height: 130, borderRadius: 26, position: "relative", zIndex: 1,
              border: "3px solid rgba(255,255,255,0.18)",
              boxShadow: "0 12px 40px rgba(220,38,38,0.55), 0 4px 16px rgba(0,0,0,0.5)",
            }}
          />
        </div>

        <h1 style={{
          fontSize: 52, fontWeight: 900, color: "#fff", letterSpacing: "0.04em",
          textShadow: "0 0 40px rgba(220,38,38,0.9), 0 2px 8px rgba(0,0,0,0.6)",
          marginBottom: 10, lineHeight: 1,
        }}>UNO</h1>

        <p style={{
          color: "rgba(255,255,255,0.6)", fontSize: 15, marginBottom: 48,
          fontWeight: 500, letterSpacing: "0.02em",
        }}>لعبة الأوراق الأشهر — أونلاين!</p>

        {error && (
          <div style={{
            background: "rgba(220,38,38,0.15)", border: "1px solid rgba(220,38,38,0.4)",
            borderRadius: 12, padding: "10px 16px", marginBottom: 20,
            color: "#fca5a5", fontSize: 14, fontWeight: 600,
          }}>{error}</div>
        )}

        <motion.button
          whileHover={{ scale: 1.04, boxShadow: "0 16px 48px rgba(220,38,38,0.7)" }}
          whileTap={{ scale: 0.96 }}
          onClick={() => { setError(null); setScreen("host-setup"); }}
          style={{
            width: "100%", padding: "20px", borderRadius: 20,
            fontWeight: 900, fontSize: 20, cursor: "pointer",
            background: "linear-gradient(135deg,#ef4444 0%,#b91c1c 100%)",
            color: "#fff", border: "none",
            boxShadow: "0 8px 32px rgba(220,38,38,0.55), inset 0 1px 0 rgba(255,255,255,0.15)",
            letterSpacing: "0.03em",
            fontFamily: "'Cairo','Arial',sans-serif",
          }}>🃏 أنشئ غرفة</motion.button>

        <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 12, marginTop: 20, fontWeight: 500 }}>
          أنشئ غرفة وشارك الرابط مع أصدقائك للعب معاً
        </p>
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

      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <img src="/uno-logo.png" alt="UNO" style={{ width: 64, height: 64, borderRadius: 14, marginBottom: 12 }} />
        <h2 style={{ fontSize: 26, fontWeight: 900, color: "#fff" }}>أنشئ غرفة UNO</h2>
      </div>

      {error && <p style={{ color: "#f87171", marginBottom: 14, fontSize: 13 }}>{error}</p>}

      <label style={{ color: "rgba(255,255,255,0.75)", fontSize: 14, fontWeight: 700 }}>اسمك في اللعبة</label>
      <input value={myName} onChange={e => setMyName(e.target.value)}
        onKeyDown={e => e.key === "Enter" && createRoom()}
        placeholder="أدخل اسمك..."
        style={{ width: "100%", marginTop: 6, marginBottom: 28, padding: "14px 16px", borderRadius: 14,
          background: "rgba(255,255,255,0.08)", border: "1.5px solid rgba(220,38,38,0.5)", color: "#fff",
          fontSize: 16, fontWeight: 600, outline: "none", boxSizing: "border-box",
          fontFamily: "'Cairo','Arial',sans-serif" }} />

      <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
        onClick={createRoom} disabled={!wsReady}
        style={{
          width: "100%", padding: "16px", borderRadius: 16, fontWeight: 900, fontSize: 18, cursor: "pointer",
          background: wsReady ? "linear-gradient(135deg,#dc2626,#991b1b)" : "rgba(255,255,255,0.1)",
          color: wsReady ? "#fff" : "rgba(255,255,255,0.4)", border: "none",
          boxShadow: wsReady ? "0 6px 24px rgba(220,38,38,0.5)" : "none",
          fontFamily: "'Cairo','Arial',sans-serif",
        }}>🎮 ابدأ الغرفة</motion.button>
    </motion.div>
  );

  // ─── JOIN SCREEN ──────────────────────────────────────────────────────────
  if (screen === "join") return wrap(
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
      <button onClick={() => setScreen("entry")} style={{
        background: "none", border: "none", color: "rgba(255,255,255,0.6)", cursor: "pointer",
        display: "flex", alignItems: "center", gap: 6, fontSize: 14, marginBottom: 24,
      }}><ArrowRight size={16}/>رجوع</button>

      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <img src="/uno-logo.png" alt="UNO" style={{ width: 64, height: 64, borderRadius: 14, marginBottom: 12 }} />
        <h2 style={{ fontSize: 26, fontWeight: 900, color: "#fff" }}>انضم لغرفة</h2>
      </div>

      {error && <p style={{ color: "#f87171", marginBottom: 14, fontSize: 13 }}>{error}</p>}

      <label style={{ color: "rgba(255,255,255,0.75)", fontSize: 14, fontWeight: 700 }}>اسمك في اللعبة</label>
      <input value={myName} onChange={e => setMyName(e.target.value)} placeholder="أدخل اسمك..."
        style={{ width: "100%", marginTop: 6, marginBottom: 18, padding: "14px 16px", borderRadius: 14,
          background: "rgba(255,255,255,0.08)", border: "1.5px solid rgba(220,38,38,0.5)", color: "#fff",
          fontSize: 16, fontWeight: 600, outline: "none", boxSizing: "border-box",
          fontFamily: "'Cairo','Arial',sans-serif" }} />

      <label style={{ color: "rgba(255,255,255,0.75)", fontSize: 14, fontWeight: 700 }}>كود الغرفة</label>
      <input value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())} placeholder="مثال: ABCD"
        style={{ width: "100%", marginTop: 6, marginBottom: 28, padding: "14px 16px", borderRadius: 14,
          background: "rgba(255,255,255,0.08)", border: "1.5px solid rgba(255,255,255,0.2)", color: "#fff",
          fontSize: 22, fontWeight: 900, outline: "none", boxSizing: "border-box",
          letterSpacing: "0.15em", textAlign: "center", fontFamily: "monospace" }} />

      <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
        onClick={joinRoom} disabled={!wsReady}
        style={{
          width: "100%", padding: "16px", borderRadius: 16, fontWeight: 900, fontSize: 18, cursor: "pointer",
          background: wsReady ? "linear-gradient(135deg,#dc2626,#991b1b)" : "rgba(255,255,255,0.1)",
          color: wsReady ? "#fff" : "rgba(255,255,255,0.4)", border: "none",
          boxShadow: wsReady ? "0 6px 24px rgba(220,38,38,0.5)" : "none",
          fontFamily: "'Cairo','Arial',sans-serif",
        }}>انضم للعبة 🃏</motion.button>
    </motion.div>
  );

  // ─── GAME SCREEN ──────────────────────────────────────────────────────────
  if (screen === "game" && gs) {

    // ── LOBBY ──
    if (gs.phase === "lobby") return (
      <div className="min-h-screen gradient-bg" dir="rtl"
        style={{ fontFamily: "'Cairo','Arial',sans-serif", position: "relative" }}>
        <UnoGlowOrbs />
        {/* Header */}
        <div style={{ background: "rgba(5,2,14,0.95)", borderBottom: "1px solid rgba(220,38,38,0.3)",
          padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between",
          position: "relative", zIndex: 10 }}>
          <button onClick={() => navigate("/")} style={{
            background: "none", border: "none", color: "rgba(255,255,255,0.8)", cursor: "pointer",
            display: "flex", alignItems: "center", gap: 5, fontSize: 13, fontWeight: 700,
          }}><ArrowRight size={14}/>رجوع</button>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <img src="/uno-logo.png" alt="UNO" style={{ width: 32, height: 32, borderRadius: 8 }} />
            <span style={{ color: "#fff", fontWeight: 900, fontSize: 17 }}>UNO Online</span>
          </div>
          <div style={{ width: 60 }} />
        </div>

        <div style={{ maxWidth: 560, margin: "0 auto", padding: "24px 16px", position: "relative", zIndex: 1 }}>
          {/* Invite card */}
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
            style={{ background: "linear-gradient(135deg,rgba(220,38,38,0.15),rgba(37,99,235,0.1))",
              border: "1.5px solid rgba(220,38,38,0.4)", borderRadius: 18, padding: "18px 20px", marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <Link2 size={16} color="#dc2626" />
              <span style={{ color: "#dc2626", fontWeight: 800, fontSize: 14 }}>رابط الدعوة</span>
              <span style={{ marginRight: "auto", background: "rgba(220,38,38,0.2)",
                border: "1px solid rgba(220,38,38,0.4)", borderRadius: 20, padding: "2px 14px",
                color: "#fca5a5", fontSize: 15, fontWeight: 900, letterSpacing: "0.15em",
                fontFamily: "monospace" }}>{gs.roomCode}</span>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 1, background: "rgba(255,255,255,0.06)", borderRadius: 10,
                padding: "9px 12px", fontSize: 12, color: "rgba(255,255,255,0.5)",
                overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", direction: "ltr" }}>
                {window.location.origin + window.location.pathname}?r={gs.roomCode}
              </div>
              <button onClick={copyLink} style={{
                flexShrink: 0,
                background: copied ? "linear-gradient(135deg,#dc2626,#991b1b)" : "rgba(255,255,255,0.1)",
                border: `1px solid ${copied ? "#dc2626" : "rgba(255,255,255,0.2)"}`,
                borderRadius: 10, padding: "9px 16px", color: "#fff",
                fontSize: 13, fontWeight: 800, cursor: "pointer",
                display: "flex", alignItems: "center", gap: 6,
              }}>
                {copied ? <Check size={14}/> : <Copy size={14}/>}
                {copied ? "تم!" : "نسخ"}
              </button>
            </div>
          </motion.div>

          {/* Players */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <Users size={16} color="#dc2626" />
            <span style={{ color: "rgba(255,255,255,0.9)", fontWeight: 700, fontSize: 15 }}>
              {gs.players.length}/4 لاعبين {gs.players.length === 4 ? "🔒 كاملة" : `(تبقى ${4 - gs.players.length})`}
            </span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
            {gs.players.map(p => {
              const isMe = p.id === myId;
              const playerColor = ["#dc2626","#2563eb","#16a34a","#ca8a04","#7c3aed"][
                gs.players.indexOf(p) % 5
              ];
              const diffLabel: Record<string, string> = { easy: "سهل", medium: "متوسط", hard: "صعب" };
              return (
                <motion.div key={p.id} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    background: isMe ? `${playerColor}18` : p.isBot ? "rgba(124,58,237,0.12)" : "rgba(255,255,255,0.06)",
                    border: `1.5px solid ${isMe ? playerColor : p.isBot ? "rgba(124,58,237,0.45)" : playerColor + "33"}`,
                    borderRadius: 14, padding: "10px 12px", position: "relative",
                    boxShadow: isMe ? `0 0 16px ${playerColor}30` : "none",
                  }}>
                  <div style={{
                    width: 38, height: 38, borderRadius: "50%", flexShrink: 0,
                    background: p.isBot ? "rgba(124,58,237,0.25)" : playerColor + "33",
                    border: `2px solid ${p.isBot ? "#7c3aed" : playerColor}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: p.isBot ? 20 : 17, fontWeight: 900,
                    color: p.isBot ? "#a78bfa" : playerColor,
                  }}>{p.isBot ? "🤖" : p.name.trim()[0]?.toUpperCase()}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: "#fff", fontWeight: 800, fontSize: 13,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {p.name}
                      {isMe && <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, marginRight: 4 }}>(أنت)</span>}
                    </div>
                    {p.isHost && <div style={{ color: "#dc2626", fontSize: 10, fontWeight: 700 }}>هوست 👑</div>}
                    {p.isBot && <div style={{ color: "#a78bfa", fontSize: 10, fontWeight: 700 }}>
                      بوت · {diffLabel[p.difficulty ?? "easy"]}
                    </div>}
                  </div>
                  {amHost && p.isBot && (
                    <button
                      onClick={() => send({ type: "uno:remove_bot", botId: p.id })}
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

          {/* ── Add Bot ── */}
          {amHost && gs.players.length < 10 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              style={{ background: "rgba(124,58,237,0.1)", border: "1.5px dashed rgba(124,58,237,0.4)",
                borderRadius: 16, padding: "14px 16px", marginBottom: 16 }}>
              <div style={{ color: "#a78bfa", fontWeight: 700, fontSize: 13, marginBottom: 10,
                display: "flex", alignItems: "center", gap: 6 }}>
                🤖 إضافة بوت
              </div>
              {/* Difficulty selector */}
              <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                {(["easy","medium","hard"] as const).map(d => {
                  const labels = { easy: "سهل", medium: "متوسط", hard: "صعب" };
                  const active = botDifficulty === d;
                  return (
                    <button key={d} onClick={() => setBotDifficulty(d)}
                      style={{
                        flex: 1, padding: "6px 0", borderRadius: 10, fontSize: 12, fontWeight: 700,
                        cursor: "pointer", border: `1.5px solid ${active ? "#7c3aed" : "rgba(124,58,237,0.3)"}`,
                        background: active ? "rgba(124,58,237,0.35)" : "rgba(124,58,237,0.1)",
                        color: active ? "#fff" : "#a78bfa",
                        fontFamily: "'Cairo','Arial',sans-serif",
                      }}>{labels[d]}</button>
                  );
                })}
              </div>
              <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                onClick={() => send({ type: "uno:add_bot", difficulty: botDifficulty })}
                style={{
                  width: "100%", padding: "10px", borderRadius: 12,
                  background: "linear-gradient(135deg,#7c3aed,#5b21b6)",
                  color: "#fff", border: "none", fontWeight: 800, fontSize: 14, cursor: "pointer",
                  boxShadow: "0 4px 16px rgba(124,58,237,0.4)",
                  fontFamily: "'Cairo','Arial',sans-serif",
                }}>+ إضافة بوت</motion.button>
            </motion.div>
          )}

          {amHost ? (
            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
              onClick={() => send({ type: "uno:start" })} disabled={gs.players.length < 2}
              style={{
                width: "100%", padding: "18px", borderRadius: 18, fontWeight: 900, fontSize: 18, cursor: "pointer",
                background: gs.players.length >= 2
                  ? "linear-gradient(135deg,#dc2626,#991b1b)"
                  : "rgba(255,255,255,0.08)",
                color: gs.players.length >= 2 ? "#fff" : "rgba(255,255,255,0.4)",
                border: "none",
                boxShadow: gs.players.length >= 2 ? "0 8px 32px rgba(220,38,38,0.5)" : "none",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                fontFamily: "'Cairo','Arial',sans-serif",
              }}>
              <Play size={20} />ابدأ اللعبة
            </motion.button>
          ) : (
            <div style={{ textAlign: "center", color: "rgba(255,255,255,0.7)", fontSize: 14, fontWeight: 600,
              padding: "16px", background: "rgba(255,255,255,0.05)", borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.1)" }}>
              ⏳ في انتظار الهوست لبدء اللعبة...
            </div>
          )}
        </div>
      </div>
    );

    // ── GAMEOVER ──
    if (gs.phase === "gameover") {
      const winner = gs.players.find(p => p.id === gs.winner);
      const isWinner = gs.winner === myId;
      const sorted = [...gs.players].sort((a, b) => b.score - a.score);

      return (
        <div className="min-h-screen gradient-bg" dir="rtl"
          style={{ fontFamily: "'Cairo','Arial',sans-serif", position: "relative",
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <UnoGlowOrbs />

          <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
            style={{ width: "100%", maxWidth: 480, position: "relative", zIndex: 1 }}>

            <div style={{ textAlign: "center", marginBottom: 32 }}>
              <motion.div animate={{ rotate: [0, -10, 10, -10, 0] }} transition={{ duration: 0.6, delay: 0.3 }}
                style={{ fontSize: 80, marginBottom: 12 }}>🎉</motion.div>
              <h1 style={{ fontSize: 32, fontWeight: 900, color: "#fff",
                textShadow: "0 0 30px rgba(220,38,38,0.8)", marginBottom: 8 }}>
                {isWinner ? "مبروك! أنت فزت! 🏆" : `${winner?.name ?? ""} فاز!`}
              </h1>
              <p style={{ color: "rgba(255,255,255,0.7)", fontSize: 16 }}>UNO! اللعبة انتهت</p>
            </div>

            {/* Leaderboard */}
            <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 18,
              border: "1px solid rgba(255,255,255,0.1)", padding: "20px", marginBottom: 24 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                <Trophy size={18} color="#ca8a04" />
                <span style={{ color: "#ca8a04", fontWeight: 800, fontSize: 16 }}>ترتيب اللاعبين</span>
              </div>
              {sorted.map((p, i) => (
                <div key={p.id} style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "10px 0",
                  borderBottom: i < sorted.length - 1 ? "1px solid rgba(255,255,255,0.07)" : "none",
                }}>
                  <div style={{ width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
                    background: i === 0 ? "#ca8a04" : i === 1 ? "#9ca3af" : i === 2 ? "#92400e" : "rgba(255,255,255,0.1)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontWeight: 900, fontSize: 14, color: "#fff" }}>
                    {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
                  </div>
                  <div style={{ flex: 1, color: p.id === myId ? "#fca5a5" : "#fff", fontWeight: 700, fontSize: 14 }}>
                    {p.name}{p.id === myId && " (أنت)"}
                  </div>
                  <div style={{ color: "#ca8a04", fontWeight: 900, fontSize: 16 }}>
                    {p.score} {p.score === 1 ? "فوز" : "فوز"}
                  </div>
                  <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 12 }}>
                    {p.cardCount} ورقة متبقية
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", gap: 12 }}>
              {amHost && (
                <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                  onClick={playAgain}
                  style={{
                    flex: 1, padding: "16px", borderRadius: 16, fontWeight: 900, fontSize: 17, cursor: "pointer",
                    background: "linear-gradient(135deg,#dc2626,#991b1b)", color: "#fff", border: "none",
                    boxShadow: "0 6px 24px rgba(220,38,38,0.5)",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                    fontFamily: "'Cairo','Arial',sans-serif",
                  }}>
                  <RotateCcw size={18} />العب مجدداً
                </motion.button>
              )}
              <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                onClick={() => navigate("/")}
                style={{
                  flex: 1, padding: "16px", borderRadius: 16, fontWeight: 900, fontSize: 17, cursor: "pointer",
                  background: "rgba(255,255,255,0.1)", color: "#fff",
                  border: "1.5px solid rgba(255,255,255,0.2)",
                  fontFamily: "'Cairo','Arial',sans-serif",
                }}>الصفحة الرئيسية</motion.button>
            </div>
          </motion.div>
        </div>
      );
    }

    // ── PLAYING ──
    if (gs.phase === "playing") {
      const others = gs.players.filter(p => p.id !== myId);
      const myHand = gs.myHand ?? [];
      const top = gs.topCard;

      // Fixed 4-player positions: top, right, left (me = bottom)
      const topP    = others[0] ?? null;
      const rightP  = others[1] ?? null;
      const leftP   = others[2] ?? null;

      return (
        <div style={{
          height: "100dvh", display: "flex", flexDirection: "column",
          fontFamily: "'Cairo','Arial',sans-serif", position: "relative",
          background: "linear-gradient(170deg,#0d0a1e 0%,#080513 100%)",
          overflow: "hidden", userSelect: "none",
        }} dir="rtl">

          {/* ── Color Picker Modal ── */}
          <AnimatePresence>
            {gs.pendingWild && <ColorPicker onPick={chooseColor} />}
          </AnimatePresence>

          {/* ── Chat Panel ── */}
          <AnimatePresence>
            {chatOpen && (
              <ChatPanel chat={gs.chat} myId={myId ?? ""} onSend={sendChat} onClose={() => setChatOpen(false)} />
            )}
          </AnimatePresence>

          {/* ── Floating Volume Control (top-left) ── */}
          <div style={{
            position: "absolute", top: 10, right: 10, zIndex: 30,
            background: "rgba(0,0,0,0.6)", borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.12)",
            padding: "6px 10px", display: "flex", alignItems: "center", gap: 6,
            backdropFilter: "blur(8px)",
          }}>
            <span style={{ fontSize: 14 }}>{soundVol === 0 ? "🔇" : soundVol < 0.4 ? "🔈" : "🔊"}</span>
            <input type="range" min={0} max={1} step={0.05} value={soundVol}
              onChange={e => setSoundVol(parseFloat(e.target.value))}
              style={{ width: 64, accentColor: "#dc2626", cursor: "pointer" }} />
          </div>

          {/* ── Back + Game Info (top-left) ── */}
          <div style={{
            position: "absolute", top: 10, left: 10, zIndex: 30,
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <button onClick={() => navigate("/")} style={{
              background: "rgba(0,0,0,0.5)", border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: 9, color: "rgba(255,255,255,0.75)", cursor: "pointer",
              display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700,
              padding: "5px 9px", backdropFilter: "blur(6px)",
            }}><ArrowRight size={12}/>رجوع</button>

            <button onClick={() => setChatOpen(v => !v)} style={{
              background: "rgba(0,0,0,0.5)", border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: 9, padding: "5px 9px", cursor: "pointer", color: "#fff",
              display: "flex", alignItems: "center", gap: 4, fontSize: 11,
              position: "relative", backdropFilter: "blur(6px)",
            }}>
              <MessageCircle size={13} />
              {unreadChat > 0 && (
                <div style={{ position: "absolute", top: -5, right: -5, width: 16, height: 16,
                  background: "#dc2626", borderRadius: "50%", fontSize: 9, fontWeight: 900,
                  display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}>
                  {unreadChat > 9 ? "9+" : unreadChat}
                </div>
              )}
            </button>

            {gs.drawStack > 0 && (
              <motion.div animate={{ scale: [1, 1.15, 1] }} transition={{ repeat: Infinity, duration: 0.5 }}
                style={{ background: "#dc2626", color: "#fff", fontWeight: 900, fontSize: 12,
                  padding: "3px 10px", borderRadius: 20, border: "1px solid #fca5a5" }}>
                +{gs.drawStack}
              </motion.div>
            )}
          </div>

          {/* ── Table Layout: top / [left | center | right] ── */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>

            {/* TOP PLAYER */}
            <div style={{ flexShrink: 0, paddingTop: 14, display: "flex", justifyContent: "center" }}>
              {topP ? <OtherPlayerCard player={topP} orientation="top" /> : <div style={{ height: 80 }}/>}
            </div>

            {/* MIDDLE ROW */}
            <div style={{ flex: 1, display: "flex", alignItems: "center", minHeight: 0 }}>

              {/* LEFT PLAYER */}
              <div style={{ flexShrink: 0, paddingLeft: 8 }}>
                {leftP ? <OtherPlayerCard player={leftP} orientation="left" /> : <div style={{ width: 80 }}/>}
              </div>

              {/* TABLE CENTER */}
              <div style={{
                flex: 1, position: "relative",
                display: "flex", alignItems: "center", justifyContent: "center",
                gap: 20,
              }}>
                {/* Dark wood table */}
                <div style={{
                  position: "absolute",
                  width: "min(85vw,340px)", height: "min(38vw,180px)",
                  borderRadius: 28,
                  background: "radial-gradient(ellipse at 40% 40%,#3d2008 0%,#2a1505 55%,#1a0d03 100%)",
                  border: "2px solid #c87a2088",
                  boxShadow: "0 0 40px rgba(200,122,32,0.15), inset 0 0 60px rgba(0,0,0,0.5)",
                }} />
                {/* Table inner glow line */}
                <div style={{
                  position: "absolute",
                  width: "min(72vw,290px)", height: "min(31vw,150px)",
                  borderRadius: 20, border: "1px solid rgba(200,122,32,0.25)",
                  pointerEvents: "none",
                }} />

                {/* Draw pile */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, zIndex: 2 }}>
                  <motion.div
                    whileHover={isMyTurn && !hasPlayableCard && !gs.pendingWild ? { scale: 1.1, y: -6 } : {}}
                    whileTap={isMyTurn && !hasPlayableCard && !gs.pendingWild ? { scale: 0.95 } : {}}
                    onClick={isMyTurn && !hasPlayableCard && !gs.pendingWild ? () => { playUnoSound("draw", soundVol); drawCard(); } : undefined}
                    style={{ cursor: isMyTurn && !hasPlayableCard && !gs.pendingWild ? "pointer" : "default", position: "relative" }}>
                    {[3, 2, 1, 0].map(i => (
                      <div key={i} style={{
                        position: i === 0 ? "relative" : "absolute",
                        top: i === 0 ? 0 : -i * 2, left: i === 0 ? 0 : i * 2,
                        width: 54, height: 78, borderRadius: 9,
                        background: "linear-gradient(135deg,#1e1b4b,#312e81)",
                        border: `1.5px solid ${i === 0 ? "#6366f1" : "#3730a3"}`,
                        boxShadow: i === 0 ? "0 6px 18px rgba(0,0,0,0.6),inset 0 1px 0 rgba(255,255,255,0.08)" : "none",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        {i === 0 && <span style={{ color: "#818cf8", fontWeight: 900, fontSize: 10, letterSpacing: "0.05em" }}>UNO</span>}
                      </div>
                    ))}
                    {isMyTurn && !hasPlayableCard && !gs.pendingWild && (
                      <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 0.7 }}
                        style={{ position: "absolute", inset: -4, borderRadius: 13,
                          border: "2.5px solid #dc2626", pointerEvents: "none" }} />
                    )}
                  </motion.div>
                  <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 9, fontWeight: 700 }}>{gs.deckCount}</div>
                </div>

                {/* Discard (top card) */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, zIndex: 2 }}>
                  <AnimatePresence mode="wait">
                    {top && (
                      <motion.div key={top.id}
                        initial={{ rotateY: 90, scale: 0.7 }} animate={{ rotateY: 0, scale: 1 }}
                        exit={{ rotateY: -90, scale: 0.7 }} transition={{ duration: 0.22 }}>
                        <UnoCardEl card={top} size="lg" />
                      </motion.div>
                    )}
                  </AnimatePresence>
                  {top?.color === "wild" && (
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <div style={{ width: 10, height: 10, borderRadius: "50%",
                        background: CARD_COLORS[gs.currentColor],
                        boxShadow: `0 0 6px ${CARD_COLORS[gs.currentColor]}` }} />
                      <span style={{ color: "rgba(255,255,255,0.55)", fontSize: 9 }}>{COLOR_AR[gs.currentColor]}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* RIGHT PLAYER */}
              <div style={{ flexShrink: 0, paddingRight: 8 }}>
                {rightP ? <OtherPlayerCard player={rightP} orientation="right" /> : <div style={{ width: 80 }}/>}
              </div>
            </div>
          </div>

          {/* ── Status Row ── */}
          <div style={{
            flexShrink: 0, padding: "4px 14px", zIndex: 10,
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
          }}>
            {isMyTurn ? (
              <motion.div animate={{ opacity: [0.7, 1, 0.7] }} transition={{ repeat: Infinity, duration: 0.9 }}
                style={{ color: "#4ade80", fontWeight: 900, fontSize: 13 }}>
                ⚡ دورك!{gs.drawStack > 0 ? ` اسحب ${gs.drawStack}` : !hasPlayableCard ? " — اسحب ورقة" : ""}
              </motion.div>
            ) : (
              <div style={{ color: "rgba(255,255,255,0.38)", fontSize: 12, fontWeight: 600 }}>
                دور {gs.players[gs.currentPlayerIndex]?.name}...
              </div>
            )}
            <AnimatePresence mode="wait">
              <motion.div key={lastActionAnim}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, fontWeight: 600, textAlign: "left", flex: 1 }}>
                {lastActionAnim}
              </motion.div>
            </AnimatePresence>
            {/* Active color */}
            {top && <ActiveColor color={gs.currentColor} />}
            {/* Direction */}
            <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 14 }}>{gs.direction === 1 ? "↻" : "↺"}</div>
          </div>

          {/* ── My Hand Area ── */}
          <div style={{
            flexShrink: 0,
            borderTop: "1px solid rgba(255,255,255,0.07)",
            background: "rgba(0,0,0,0.5)",
            position: "relative", zIndex: 10, padding: "8px 12px 12px",
          }}>
            {/* Label + UNO Button row */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.38)", fontWeight: 700 }}>
                أوراقي ({myHand.length}){!isMyTurn && <span style={{ marginRight: 4, color: "rgba(255,255,255,0.18)" }}>انتظر...</span>}
              </div>
              {/* UNO Button — only when has playable cards */}
              {myHand.length <= 2 && hasPlayableCard && (
                <motion.button
                  whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                  animate={myHand.length === 1 && !me?.saidUno
                    ? { scale: [1, 1.06, 1], boxShadow: ["0 4px 14px #dc262666","0 6px 24px #dc2626cc","0 4px 14px #dc262666"] }
                    : {}}
                  transition={{ repeat: Infinity, duration: 0.7 }}
                  onClick={sayUno}
                  style={{
                    padding: "5px 20px", borderRadius: 16, fontWeight: 900, fontSize: 15,
                    background: me?.saidUno ? "rgba(255,255,255,0.07)" : "linear-gradient(135deg,#dc2626,#991b1b)",
                    color: me?.saidUno ? "rgba(255,255,255,0.35)" : "#fff",
                    border: "2px solid rgba(255,255,255,0.2)",
                    cursor: me?.saidUno ? "default" : "pointer",
                    boxShadow: me?.saidUno ? "none" : "0 4px 16px rgba(220,38,38,0.5)",
                  }}>
                  {me?.saidUno ? "✓ UNO!" : "UNO!"}
                </motion.button>
              )}
            </div>

            {/* No valid cards: show big draw button */}
            {isMyTurn && !hasPlayableCard && !gs.pendingWild && gs.drawStack === 0 && (
              <motion.button
                animate={{ scale: [1, 1.03, 1], boxShadow: ["0 0 0px #dc2626","0 0 20px #dc2626aa","0 0 0px #dc2626"] }}
                transition={{ repeat: Infinity, duration: 0.85 }}
                whileTap={{ scale: 0.96 }}
                onClick={() => { playUnoSound("draw", soundVol); drawCard(); }}
                style={{
                  width: "100%", padding: "13px", borderRadius: 14, fontWeight: 900, fontSize: 16,
                  background: "linear-gradient(135deg,#7c3aed,#4f46e5)",
                  color: "#fff", border: "2px solid #818cf8",
                  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  fontFamily: "'Cairo','Arial',sans-serif", marginBottom: 8,
                }}>
                🃏 اسحب ورقة
              </motion.button>
            )}

            {/* Force draw for drawStack */}
            {isMyTurn && gs.drawStack > 0 && !gs.pendingWild && (
              <motion.button
                animate={{ scale: [1, 1.03, 1] }} transition={{ repeat: Infinity, duration: 0.85 }}
                whileTap={{ scale: 0.96 }}
                onClick={() => { playUnoSound("draw", soundVol); drawCard(); }}
                style={{
                  width: "100%", padding: "11px", borderRadius: 13, fontWeight: 900, fontSize: 15,
                  background: "linear-gradient(135deg,#dc2626,#991b1b)",
                  color: "#fff", border: "1.5px solid #fca5a5",
                  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  fontFamily: "'Cairo','Arial',sans-serif", marginBottom: 6,
                }}>
                💀 اسحب {gs.drawStack} أوراق
              </motion.button>
            )}

            {/* Cards scroll */}
            <div style={{
              display: "flex", gap: 6, overflowX: "auto",
              paddingBottom: 2, alignItems: "flex-end",
              scrollbarWidth: "thin",
            }}>
              {myHand.map(card => {
                const playable = canPlayCard(card);
                return (
                  <UnoCardEl key={card.id} card={card} size="md"
                    playable={isMyTurn && hasPlayableCard ? playable : false}
                    onClick={isMyTurn && hasPlayableCard && !gs.pendingWild && playable
                      ? () => { playUnoSound("play", soundVol); playCard(card.id); }
                      : undefined} />
                );
              })}
              {myHand.length === 0 && (
                <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 13, padding: "14px 0" }}>لا توجد أوراق!</div>
              )}
            </div>
          </div>
        </div>
      );
    }
  }

  // ─── LOADING / CONNECTING ─────────────────────────────────────────────────
  return (
    <div className="min-h-screen gradient-bg flex items-center justify-center" dir="rtl"
      style={{ fontFamily: "'Cairo','Arial',sans-serif" }}>
      <UnoGlowOrbs />
      <div style={{ textAlign: "center", position: "relative", zIndex: 1 }}>
        <img src="/uno-logo.png" alt="UNO" style={{ width: 80, height: 80, borderRadius: 16, marginBottom: 20 }} />
        <div className="animate-spin w-10 h-10 border-2 border-red-400/40 border-t-red-400 rounded-full mx-auto mb-4" />
        <p style={{ color: "rgba(255,255,255,0.7)", fontSize: 15 }}>
          {error ? <span style={{ color: "#f87171" }}>{error}</span> : "جاري الاتصال..."}
        </p>
        {error && (
          <button onClick={() => { setError(null); setScreen("entry"); }}
            style={{ marginTop: 16, padding: "10px 24px", borderRadius: 12, background: "#dc2626",
              color: "#fff", border: "none", cursor: "pointer", fontWeight: 700, fontSize: 14 }}>
            رجوع
          </button>
        )}
      </div>
    </div>
  );
}
