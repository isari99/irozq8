import { useState, useRef, useCallback, useEffect, memo } from "react";
import { useSearch, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
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

// ─── Avatar System (DiceBear adventurer — same as برا السالفة) ──────────────
export const AVATARS = [
  { id: 0, img: "https://api.dicebear.com/7.x/adventurer/svg?seed=Jasmine&backgroundColor=fecaca", bg: "#fecaca", label: "ياسمين",   glow: "#f87171" },
  { id: 1, img: "https://api.dicebear.com/7.x/adventurer/svg?seed=Leo&backgroundColor=fde68a",     bg: "#fde68a", label: "ليو",       glow: "#facc15" },
  { id: 2, img: "https://api.dicebear.com/7.x/adventurer/svg?seed=Nora&backgroundColor=ddd6fe",    bg: "#ddd6fe", label: "نورا",      glow: "#a78bfa" },
  { id: 3, img: "https://api.dicebear.com/7.x/adventurer/svg?seed=Omar&backgroundColor=bfdbfe",    bg: "#bfdbfe", label: "عمر",       glow: "#60a5fa" },
  { id: 4, img: "https://api.dicebear.com/7.x/adventurer/svg?seed=Zara&backgroundColor=bbf7d0",    bg: "#bbf7d0", label: "زارا",      glow: "#34d399" },
  { id: 5, img: "https://api.dicebear.com/7.x/adventurer/svg?seed=Max&backgroundColor=fda4af",     bg: "#fda4af", label: "مكس",       glow: "#fb7185" },
  { id: 6, img: "https://api.dicebear.com/7.x/adventurer/svg?seed=Sara&backgroundColor=fdba74",    bg: "#fdba74", label: "سارة",      glow: "#fb923c" },
  { id: 7, img: "https://api.dicebear.com/7.x/adventurer/svg?seed=Amir&backgroundColor=93c5fd",    bg: "#93c5fd", label: "أمير",      glow: "#38bdf8" },
] as const;

type AvatarId = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

function encodePlayerName(name: string, avatarId: number): string {
  return `${avatarId}:${name}`;
}

function decodePlayerName(encoded: string): { name: string; avatarId: AvatarId } {
  const colonIdx = encoded.indexOf(":");
  if (colonIdx > 0) {
    const id = parseInt(encoded.slice(0, colonIdx));
    if (!isNaN(id) && id >= 0 && id < AVATARS.length) {
      return { name: encoded.slice(colonIdx + 1), avatarId: id as AvatarId };
    }
  }
  return { name: encoded, avatarId: 0 };
}

function getAvatar(avatarId: AvatarId) {
  return AVATARS[avatarId] ?? AVATARS[0];
}

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

// ─── UNO Card Back ───────────────────────────────────────────────────────────
function UnoCardBack({ w = 32, h = 46 }: { w?: number; h?: number }) {
  const r = Math.round(h * 0.1);
  return (
    <div style={{
      width: w, height: h, borderRadius: r,
      background: "linear-gradient(150deg, #1a0e52 0%, #0d0830 100%)",
      border: "1.5px solid rgba(90,70,180,0.65)",
      display: "flex", alignItems: "center", justifyContent: "center",
      overflow: "hidden", position: "relative", flexShrink: 0,
      boxShadow: "0 2px 8px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.06)",
    }}>
      <div style={{
        width: w * 0.65, height: h * 0.68, borderRadius: "50%",
        background: "linear-gradient(135deg, #dc2626 0%, #7f1d1d 100%)",
        transform: "rotate(-30deg)",
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: "0 0 8px rgba(220,38,38,0.45)",
      }}>
        <span style={{
          color: "#fff", fontWeight: 900, letterSpacing: "0.04em",
          transform: "rotate(30deg)", display: "block",
          fontSize: Math.max(5, Math.round(h * 0.13)),
        }}>UNO</span>
      </div>
    </div>
  );
}

// ─── Player Seat Components ────────────────────────────────────────────────
function PlayerAvatar({ player, size = 44 }: { player: PlayerInfo; size?: number }) {
  const isCurrent = player.isCurrentPlayer;
  const { avatarId } = decodePlayerName(player.name);
  const av = getAvatar(player.isBot ? 0 : avatarId);
  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <motion.div
        animate={isCurrent ? {
          boxShadow: [`0 0 0px ${av.glow}00`, `0 0 28px ${av.glow}ee`, `0 0 0px ${av.glow}00`],
        } : {}}
        transition={{ repeat: Infinity, duration: 1.2 }}
        style={{
          width: size, height: size, borderRadius: "50%",
          background: player.isBot ? "rgba(124,58,237,0.25)" : av.bg,
          border: `3px solid ${isCurrent ? av.glow : "rgba(255,255,255,0.22)"}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "border-color 0.3s",
          boxShadow: isCurrent
            ? `0 0 0 4px ${av.glow}44, 0 0 24px ${av.glow}88`
            : "0 3px 10px rgba(0,0,0,0.6)",
          overflow: "hidden",
        }}>
        {player.isBot ? (
          <span style={{ fontSize: size * 0.5, lineHeight: 1 }}>🤖</span>
        ) : (
          <img src={av.img} alt={av.label}
            style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }} />
        )}
      </motion.div>
      {isCurrent && (
        <motion.div
          animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 3, ease: "linear" }}
          style={{
            position: "absolute", inset: -5, borderRadius: "50%",
            border: `2px dashed ${av.glow}99`, pointerEvents: "none",
          }} />
      )}
      {player.saidUno && (
        <div style={{
          position: "absolute", top: -8, right: -8, zIndex: 10,
          background: "#dc2626", color: "#fff", fontSize: 7, fontWeight: 900,
          padding: "2px 5px", borderRadius: 5, border: "1px solid #fff",
          letterSpacing: "0.04em",
        }}>UNO!</div>
      )}
    </div>
  );
}

// TOP player seat — horizontal card holder
function TopSeat({ player }: { player: PlayerInfo }) {
  const n = Math.max(1, Math.min(player.cardCount, 7));
  const cW = 30, cH = 43, overlap = 6;
  const totalW = cW + (n - 1) * (cW - overlap);
  const isCurrent = player.isCurrentPlayer;
  const displayName = player.isBot ? player.name : decodePlayerName(player.name).name;
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
      opacity: player.isConnected ? 1 : 0.35,
    }}>
      <PlayerAvatar player={player} size={46} />
      <div style={{
        color: isCurrent ? "#fff" : "rgba(255,255,255,0.6)",
        fontSize: 10, fontWeight: 800, textAlign: "center",
        maxWidth: 90, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>{displayName}</div>
      {/* Wood + leather card holder */}
      <div style={{
        background: "linear-gradient(180deg, #8a4e28 0%, #6a361a 40%, #4a2210 80%, #341608 100%)",
        border: "2px solid rgba(255,200,100,0.28)",
        borderRadius: "8px 8px 6px 6px",
        padding: "6px 10px 10px",
        boxShadow: [
          "0 5px 18px rgba(0,0,0,0.7)",
          "inset 0 1px 0 rgba(255,200,80,0.15)",
          "inset 0 -3px 0 rgba(0,0,0,0.5)",
        ].join(", "),
        position: "relative",
      }}>
        {/* Slot groove */}
        <div style={{
          position: "absolute", top: 6, left: 8, right: 8, height: 3,
          background: "rgba(0,0,0,0.4)", borderRadius: 2,
        }} />
        <div style={{ position: "relative", width: totalW, height: cH, marginTop: 2 }}>
          {Array.from({ length: n }).map((_, i) => (
            <div key={i} style={{ position: "absolute", left: i * (cW - overlap), top: 0, zIndex: i }}>
              <UnoCardBack w={cW} h={cH} />
            </div>
          ))}
        </div>
        {/* Bottom ledge */}
        <div style={{
          position: "absolute", bottom: 0, left: 0, right: 0, height: 6, borderRadius: "0 0 5px 5px",
          background: "linear-gradient(180deg, #5a2e14, #2a1207)",
          boxShadow: "0 3px 6px rgba(0,0,0,0.6)",
        }} />
      </div>
    </div>
  );
}

// LEFT player seat — vertical card holder with perspective
function LeftSeat({ player }: { player: PlayerInfo }) {
  const n = Math.max(1, Math.min(player.cardCount, 6));
  const cW = 30, cH = 43, overlap = 9;
  const totalH = cH + (n - 1) * (cH - overlap);
  const isCurrent = player.isCurrentPlayer;
  const displayName = player.isBot ? player.name : decodePlayerName(player.name).name;
  return (
    <div style={{
      display: "flex", flexDirection: "row", alignItems: "center", gap: 6,
      opacity: player.isConnected ? 1 : 0.35,
    }}>
      {/* Vertical leather holder with perspective */}
      <div style={{
        background: "linear-gradient(90deg, #8a4e28 0%, #6a361a 40%, #4a2210 80%, #341608 100%)",
        border: "2px solid rgba(255,200,100,0.28)",
        borderRadius: "6px 8px 8px 6px",
        padding: "8px 8px 8px 6px",
        boxShadow: [
          "0 5px 18px rgba(0,0,0,0.7)",
          "inset 1px 0 0 rgba(255,200,80,0.15)",
          "inset -3px 0 0 rgba(0,0,0,0.5)",
        ].join(", "),
        position: "relative",
        transform: "perspective(180px) rotateY(18deg)",
        transformOrigin: "left center",
      }}>
        {/* Slot groove */}
        <div style={{
          position: "absolute", left: 5, top: 6, bottom: 6, width: 3,
          background: "rgba(0,0,0,0.4)", borderRadius: 2,
        }} />
        <div style={{ position: "relative", width: cW, height: totalH, marginLeft: 2 }}>
          {Array.from({ length: n }).map((_, i) => (
            <div key={i} style={{ position: "absolute", top: i * (cH - overlap), left: 0, zIndex: i }}>
              <UnoCardBack w={cW} h={cH} />
            </div>
          ))}
        </div>
        {/* Right ledge */}
        <div style={{
          position: "absolute", top: 0, bottom: 0, right: 0, width: 6, borderRadius: "0 5px 5px 0",
          background: "linear-gradient(90deg, #5a2e14, #2a1207)",
          boxShadow: "3px 0 6px rgba(0,0,0,0.6)",
        }} />
      </div>
      {/* Player info */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
        <PlayerAvatar player={player} size={40} />
        <div style={{
          color: isCurrent ? "#fff" : "rgba(255,255,255,0.6)",
          fontSize: 9, fontWeight: 800,
          maxWidth: 52, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          textAlign: "center",
        }}>{displayName}</div>
      </div>
    </div>
  );
}

// RIGHT player seat — hologram avatar on pedestal (shown INSIDE the table)
// Card holder shown on the right edge
function RightSeat({ player }: { player: PlayerInfo }) {
  const n = Math.max(1, Math.min(player.cardCount, 6));
  const cW = 30, cH = 43, overlap = 9;
  const totalH = cH + (n - 1) * (cH - overlap);
  const isCurrent = player.isCurrentPlayer;
  const displayName = player.isBot ? player.name : decodePlayerName(player.name).name;
  return (
    <div style={{
      display: "flex", flexDirection: "row-reverse", alignItems: "center", gap: 6,
      opacity: player.isConnected ? 1 : 0.35,
    }}>
      {/* Vertical leather holder with perspective */}
      <div style={{
        background: "linear-gradient(270deg, #8a4e28 0%, #6a361a 40%, #4a2210 80%, #341608 100%)",
        border: "2px solid rgba(255,200,100,0.28)",
        borderRadius: "8px 6px 6px 8px",
        padding: "8px 6px 8px 8px",
        boxShadow: [
          "0 5px 18px rgba(0,0,0,0.7)",
          "inset -1px 0 0 rgba(255,200,80,0.15)",
          "inset 3px 0 0 rgba(0,0,0,0.5)",
        ].join(", "),
        position: "relative",
        transform: "perspective(180px) rotateY(-18deg)",
        transformOrigin: "right center",
      }}>
        {/* Slot groove */}
        <div style={{
          position: "absolute", right: 5, top: 6, bottom: 6, width: 3,
          background: "rgba(0,0,0,0.4)", borderRadius: 2,
        }} />
        <div style={{ position: "relative", width: cW, height: totalH, marginRight: 2 }}>
          {Array.from({ length: n }).map((_, i) => (
            <div key={i} style={{ position: "absolute", top: i * (cH - overlap), left: 0, zIndex: i }}>
              <UnoCardBack w={cW} h={cH} />
            </div>
          ))}
        </div>
        {/* Left ledge */}
        <div style={{
          position: "absolute", top: 0, bottom: 0, left: 0, width: 6, borderRadius: "5px 0 0 5px",
          background: "linear-gradient(270deg, #5a2e14, #2a1207)",
          boxShadow: "-3px 0 6px rgba(0,0,0,0.6)",
        }} />
      </div>
      {/* Player info */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
        <PlayerAvatar player={player} size={40} />
        <div style={{
          color: isCurrent ? "#fff" : "rgba(255,255,255,0.6)",
          fontSize: 9, fontWeight: 800,
          maxWidth: 52, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          textAlign: "center",
        }}>{displayName}</div>
      </div>
    </div>
  );
}

// Hologram avatar pedestal — shown on the table surface for the right player
function HologramAvatar({ player }: { player: PlayerInfo }) {
  const isCurrent = player.isCurrentPlayer;
  const { avatarId } = decodePlayerName(player.name);
  const av = getAvatar(player.isBot ? 0 : avatarId);
  const displayName = player.isBot ? player.name : decodePlayerName(player.name).name;
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      gap: 0, position: "relative",
    }}>
      {/* Hologram glow ring */}
      <motion.div
        animate={isCurrent ? {
          boxShadow: [
            `0 0 10px ${av.glow}55, 0 0 30px ${av.glow}33`,
            `0 0 22px ${av.glow}cc, 0 0 55px ${av.glow}66`,
            `0 0 10px ${av.glow}55, 0 0 30px ${av.glow}33`,
          ],
        } : {}}
        transition={{ repeat: Infinity, duration: 1.5 }}
        style={{
          width: 58, height: 58,
          borderRadius: 8,
          background: player.isBot ? "rgba(124,58,237,0.25)" : av.bg,
          border: `2px solid ${av.glow}bb`,
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: `0 0 16px ${av.glow}66, inset 0 0 10px ${av.glow}22`,
          backdropFilter: "blur(4px)",
          position: "relative", zIndex: 2,
          overflow: "hidden",
        }}>
        {player.isBot ? (
          <span style={{ fontSize: 28, lineHeight: 1 }}>🤖</span>
        ) : (
          <img src={av.img} alt={av.label}
            style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        )}
        {/* Scan lines effect */}
        <div style={{
          position: "absolute", inset: 0, borderRadius: 7, overflow: "hidden",
          background: "repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(80,200,255,0.05) 3px, rgba(80,200,255,0.05) 4px)",
          pointerEvents: "none",
        }} />
      </motion.div>
      {/* Pedestal */}
      <div style={{
        width: 44, height: 8,
        background: "linear-gradient(180deg, #5a3010, #3a1e08)",
        borderRadius: "0 0 4px 4px",
        border: "1px solid rgba(255,200,100,0.2)",
        boxShadow: "0 2px 6px rgba(0,0,0,0.5)",
      }} />
      <div style={{
        width: 36, height: 5,
        background: "linear-gradient(180deg, #3a1e08, #221208)",
        borderRadius: "0 0 3px 3px",
        border: "1px solid rgba(255,180,80,0.15)",
        boxShadow: isCurrent
          ? "0 0 12px rgba(80,200,255,0.5)"
          : "0 0 6px rgba(200,140,40,0.3)",
      }} />
      {/* Name */}
      <div style={{
        marginTop: 3, color: isCurrent ? av.glow : "rgba(255,255,255,0.55)",
        fontSize: 9, fontWeight: 800, textAlign: "center",
        maxWidth: 60, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        textShadow: isCurrent ? `0 0 8px ${av.glow}bb` : "none",
      }}>{displayName}</div>
      {player.saidUno && (
        <div style={{
          position: "absolute", top: -8, right: -8, zIndex: 10,
          background: "#dc2626", color: "#fff", fontSize: 7, fontWeight: 900,
          padding: "2px 5px", borderRadius: 5, border: "1px solid #fff",
        }}>UNO!</div>
      )}
    </div>
  );
}

// Legacy wrapper (still used in non-playing phases if any)
function OtherPlayerCard({ player, orientation = "top" }: {
  player: PlayerInfo;
  orientation?: "top" | "left" | "right";
}) {
  if (orientation === "top") return <TopSeat player={player} />;
  if (orientation === "left") return <LeftSeat player={player} />;
  return <RightSeat player={player} />;
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
type Screen = "entry" | "join" | "game";

export default function UnoGame() {
  const { user } = useAuth();
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
  const [myName, setMyName] = useState(user?.username ?? "");
  const [myAvatar, setMyAvatar] = useState<AvatarId>(0);
  const [myBotCount, setMyBotCount] = useState(1);
  const [joinCode, setJoinCode] = useState(urlCode);
  const [copied, setCopied] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [unreadChat, setUnreadChat] = useState(0);
  const [lastActionAnim, setLastActionAnim] = useState("");
  const [botDifficulty, setBotDifficulty] = useState<"easy" | "medium" | "hard">("easy");
  const [soundVol, setSoundVol] = useState(0.6);
  const soundVolRef = useRef(0.6);

  // ── Flying-card draw animation ──
  const drawPileRef = useRef<HTMLDivElement>(null);
  const handTrayRef = useRef<HTMLDivElement>(null);
  const flyKeyRef = useRef(0);
  const [flyingCards, setFlyingCards] = useState<{ key: number; fromX: number; fromY: number; toX: number; toY: number }[]>([]);

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
    const encoded = encodePlayerName(myName.trim(), myAvatar);
    send({ type: "uno:create", name: encoded });
    // Add bots after a short delay so the room is created first
    for (let i = 0; i < myBotCount; i++) {
      setTimeout(() => send({ type: "uno:add_bot", difficulty: botDifficulty }), 300 + i * 150);
    }
    setScreen("game");
  };
  const joinRoom = () => {
    if (!myName.trim()) { setError("اكتب اسمك أولاً"); return; }
    if (!joinCode.trim()) { setError("اكتب كود الغرفة"); return; }
    const encoded = encodePlayerName(myName.trim(), myAvatar);
    send({ type: "uno:join", name: encoded, code: joinCode.trim() });
    setScreen("game");
  };
  const playCard = (cardId: string) => send({ type: "uno:play_card", cardId });

  const drawCard = useCallback((count = 1) => {
    if (drawPileRef.current && handTrayRef.current) {
      const pileRect = drawPileRef.current.getBoundingClientRect();
      const handRect = handTrayRef.current.getBoundingClientRect();
      const toX = handRect.left + handRect.width / 2 - 24;
      const toY = handRect.top + 8;
      const newCards = Array.from({ length: count }, (_, i) => {
        flyKeyRef.current++;
        return {
          key: flyKeyRef.current,
          fromX: pileRect.left + pileRect.width / 2 - 24,
          fromY: pileRect.top + pileRect.height / 2 - 34,
          toX, toY,
        };
      });
      setFlyingCards(prev => [...prev, ...newCards]);
      newCards.forEach(c => {
        setTimeout(() => setFlyingCards(prev => prev.filter(x => x.key !== c.key)), 650);
      });
    }
    send({ type: "uno:draw" });
  }, [send]);
  const sayUno = () => send({ type: "uno:say_uno" });
  const chooseColor = (color: Color) => send({ type: "uno:choose_color", color });
  const playAgain = () => send({ type: "uno:play_again" });
  const sendChat = (text: string) => send({ type: "uno:chat", text });

  // ─── Helpers ──────────────────────────────────────────────────────────────
  const canPlayCard = (card: UnoCard): boolean => {
    if (!gs || !isMyTurn || gs.pendingWild) return false;
    const top = gs.topCard;
    if (!top) return false;
    if (card.type === "wild" || card.type === "wild4") return true;
    if (gs.drawStack > 0) {
      return card.type === "draw2" && top.type === "draw2";
    }
    if (card.color === gs.currentColor) return true;
    // same type for specials ONLY (skip/reverse/draw2), NOT for numbers
    if (card.type !== "number" && top.type === card.type) return true;
    // same value for numbers
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

  // ─── ENTRY SCREEN (unified — name + avatar + bots + create) ──────────────
  if (screen === "entry") return (
    <div dir="rtl" style={{
      minHeight: "100dvh", fontFamily: "'Cairo','Arial',sans-serif",
      background: "linear-gradient(160deg,#0d0a1e 0%,#130820 40%,#0a0510 100%)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start",
      padding: 16, overflowY: "auto",
    }}>
      <div style={{ width: "100%", maxWidth: 520, position: "relative", zIndex: 1, paddingTop: 12 }}>
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}>
          {/* Back button */}
          <button onClick={() => navigate("/")} style={{
            background: "none", border: "none", color: "rgba(255,255,255,0.5)", cursor: "pointer",
            display: "flex", alignItems: "center", gap: 6, fontSize: 13, marginBottom: 18, fontWeight: 700,
          }}><ArrowRight size={14}/>الرئيسية</button>

          {/* Header: small logo + title */}
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 24 }}>
            <img src="/uno-logo.png" alt="UNO" style={{
              width: 62, height: 62, borderRadius: 14,
              boxShadow: "0 6px 22px rgba(220,38,38,0.5)",
              border: "2px solid rgba(255,255,255,0.15)",
              flexShrink: 0,
            }} />
            <div>
              <h1 style={{ fontSize: 32, fontWeight: 900, color: "#fff", lineHeight: 1,
                textShadow: "0 0 24px rgba(220,38,38,0.9)" }}>UNO</h1>
              <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, fontWeight: 500, marginTop: 3 }}>
                لعبة الأوراق الأشهر — أونلاين!
              </p>
            </div>
          </div>

          {error && (
            <div style={{
              background: "rgba(220,38,38,0.15)", border: "1px solid rgba(220,38,38,0.4)",
              borderRadius: 12, padding: "10px 16px", marginBottom: 16,
              color: "#fca5a5", fontSize: 13, fontWeight: 600,
            }}>{error}</div>
          )}

          {/* Name input */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ color: "rgba(255,255,255,0.7)", fontSize: 13, fontWeight: 700,
              display: "block", marginBottom: 7 }}>اسمك في اللعبة</label>
            <input value={myName} onChange={e => setMyName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && createRoom()}
              placeholder="أدخل اسمك..."
              style={{
                width: "100%", padding: "13px 16px", borderRadius: 14,
                background: "rgba(255,255,255,0.08)", border: "1.5px solid rgba(220,38,38,0.4)",
                color: "#fff", fontSize: 16, fontWeight: 600, outline: "none", boxSizing: "border-box",
                fontFamily: "'Cairo','Arial',sans-serif",
              }} />
          </div>

          {/* Avatar picker */}
          <div style={{ marginBottom: 22 }}>
            <label style={{ color: "rgba(255,255,255,0.7)", fontSize: 13, fontWeight: 700,
              display: "block", marginBottom: 10 }}>اختر شخصيتك</label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
              {AVATARS.map(av => {
                const selected = myAvatar === av.id;
                return (
                  <motion.button key={av.id}
                    whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.93 }}
                    onClick={() => setMyAvatar(av.id as AvatarId)}
                    style={{
                      background: selected ? `linear-gradient(135deg,${av.bg}55,${av.bg}22)` : "rgba(255,255,255,0.05)",
                      border: selected ? `2.5px solid ${av.glow}` : "2px solid rgba(255,255,255,0.1)",
                      borderRadius: 16, padding: "8px 6px 7px",
                      display: "flex", flexDirection: "column", alignItems: "center", gap: 5,
                      cursor: "pointer",
                      boxShadow: selected ? `0 0 20px ${av.glow}55` : "none",
                      transition: "all 0.14s",
                    }}>
                    <img src={av.img} alt={av.label}
                      style={{ width: 48, height: 48, borderRadius: "50%",
                        border: `2px solid ${selected ? av.glow : "rgba(255,255,255,0.15)"}`,
                        objectFit: "cover",
                        boxShadow: selected ? `0 0 12px ${av.glow}88` : "0 2px 8px rgba(0,0,0,0.4)",
                      }} />
                    <span style={{
                      color: selected ? "#fff" : "rgba(255,255,255,0.5)",
                      fontSize: 9, fontWeight: 800, textAlign: "center",
                    }}>{av.label}</span>
                  </motion.button>
                );
              })}
            </div>
          </div>

          {/* Bot count selector */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ color: "rgba(255,255,255,0.7)", fontSize: 13, fontWeight: 700,
              display: "block", marginBottom: 8 }}>عدد البوتات</label>
            <div style={{ display: "flex", gap: 8 }}>
              {[0, 1, 2, 3].map(n => (
                <button key={n} onClick={() => setMyBotCount(n)}
                  style={{
                    flex: 1, padding: "10px 0", borderRadius: 12, fontSize: 14, fontWeight: 800,
                    cursor: "pointer",
                    border: myBotCount === n ? "2px solid #a78bfa" : "2px solid rgba(124,58,237,0.25)",
                    background: myBotCount === n ? "rgba(124,58,237,0.4)" : "rgba(124,58,237,0.1)",
                    color: myBotCount === n ? "#fff" : "#a78bfa",
                    fontFamily: "'Cairo','Arial',sans-serif",
                    transition: "all 0.15s",
                  }}>
                  {n === 0 ? "لا" : n} {n > 0 ? "🤖" : ""}
                </button>
              ))}
            </div>
            {myBotCount > 0 && (
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                {(["easy","medium","hard"] as const).map(d => {
                  const labels = { easy: "سهل", medium: "متوسط", hard: "صعب" };
                  return (
                    <button key={d} onClick={() => setBotDifficulty(d)}
                      style={{
                        flex: 1, padding: "6px 0", borderRadius: 9, fontSize: 11, fontWeight: 700,
                        cursor: "pointer",
                        border: botDifficulty === d ? "1.5px solid #7c3aed" : "1.5px solid rgba(124,58,237,0.25)",
                        background: botDifficulty === d ? "rgba(124,58,237,0.35)" : "rgba(124,58,237,0.08)",
                        color: botDifficulty === d ? "#fff" : "#a78bfa",
                        fontFamily: "'Cairo','Arial',sans-serif",
                      }}>{labels[d]}</button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Create button */}
          <motion.button
            whileHover={{ scale: 1.02, boxShadow: "0 14px 40px rgba(220,38,38,0.65)" }}
            whileTap={{ scale: 0.97 }}
            onClick={createRoom} disabled={!wsReady}
            style={{
              width: "100%", padding: "16px", borderRadius: 16, fontWeight: 900, fontSize: 18, cursor: wsReady ? "pointer" : "not-allowed",
              background: wsReady ? "linear-gradient(135deg,#dc2626,#991b1b)" : "rgba(255,255,255,0.08)",
              color: wsReady ? "#fff" : "rgba(255,255,255,0.35)", border: "none",
              boxShadow: wsReady ? "0 8px 30px rgba(220,38,38,0.5)" : "none",
              fontFamily: "'Cairo','Arial',sans-serif", marginBottom: 12,
            }}>🃏 أنشئ غرفة وابدأ اللعب</motion.button>

          {/* Join with code link */}
          <div style={{ textAlign: "center" }}>
            <button onClick={() => setScreen("join")} style={{
              background: "none", border: "none", color: "rgba(255,255,255,0.45)",
              cursor: "pointer", fontSize: 13, fontWeight: 600, textDecoration: "underline",
              fontFamily: "'Cairo','Arial',sans-serif",
            }}>لديك رمز دعوة؟ انضم لغرفة</button>
          </div>
        </motion.div>
      </div>
    </div>
  );

  // ─── JOIN SCREEN ──────────────────────────────────────────────────────────
  if (screen === "join") return (
    <div dir="rtl" style={{
      minHeight: "100dvh", fontFamily: "'Cairo','Arial',sans-serif",
      background: "linear-gradient(160deg,#0d0a1e 0%,#130820 40%,#0a0510 100%)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start",
      padding: 16, overflowY: "auto",
    }}>
      <div style={{ width: "100%", maxWidth: 520, position: "relative", zIndex: 1, paddingTop: 12 }}>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <button onClick={() => setScreen("entry")} style={{
            background: "none", border: "none", color: "rgba(255,255,255,0.5)", cursor: "pointer",
            display: "flex", alignItems: "center", gap: 6, fontSize: 13, marginBottom: 18, fontWeight: 700,
          }}><ArrowRight size={14}/>رجوع</button>

          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 24 }}>
            <img src="/uno-logo.png" alt="UNO" style={{ width: 62, height: 62, borderRadius: 14,
              boxShadow: "0 6px 22px rgba(220,38,38,0.5)", border: "2px solid rgba(255,255,255,0.15)", flexShrink: 0 }} />
            <div>
              <h1 style={{ fontSize: 28, fontWeight: 900, color: "#fff", lineHeight: 1,
                textShadow: "0 0 24px rgba(220,38,38,0.9)" }}>انضم للعبة</h1>
              <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, fontWeight: 500, marginTop: 3 }}>أدخل بيانات اللاعب</p>
            </div>
          </div>

          {error && (
            <div style={{ background: "rgba(220,38,38,0.15)", border: "1px solid rgba(220,38,38,0.4)",
              borderRadius: 12, padding: "10px 16px", marginBottom: 16,
              color: "#fca5a5", fontSize: 13, fontWeight: 600 }}>{error}</div>
          )}

          {/* Name */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ color: "rgba(255,255,255,0.7)", fontSize: 13, fontWeight: 700,
              display: "block", marginBottom: 7 }}>اسمك في اللعبة</label>
            <input value={myName} onChange={e => setMyName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && joinRoom()}
              placeholder="أدخل اسمك..."
              style={{ width: "100%", padding: "13px 16px", borderRadius: 14,
                background: "rgba(255,255,255,0.08)", border: "1.5px solid rgba(220,38,38,0.4)",
                color: "#fff", fontSize: 16, fontWeight: 600, outline: "none", boxSizing: "border-box",
                fontFamily: "'Cairo','Arial',sans-serif" }} />
          </div>

          {/* Room code */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ color: "rgba(255,255,255,0.7)", fontSize: 13, fontWeight: 700,
              display: "block", marginBottom: 7 }}>رمز الغرفة</label>
            <input value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === "Enter" && joinRoom()}
              placeholder="مثال: ABCD"
              style={{ width: "100%", padding: "14px 16px", borderRadius: 14,
                background: "rgba(255,255,255,0.08)", border: "1.5px solid rgba(255,255,255,0.2)",
                color: "#fff", fontSize: 22, fontWeight: 900, outline: "none", boxSizing: "border-box",
                letterSpacing: "0.15em", textAlign: "center", fontFamily: "monospace" }} />
          </div>

          {/* Avatar picker */}
          <div style={{ marginBottom: 22 }}>
            <label style={{ color: "rgba(255,255,255,0.7)", fontSize: 13, fontWeight: 700,
              display: "block", marginBottom: 10 }}>اختر شخصيتك</label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
              {AVATARS.map(av => {
                const selected = myAvatar === av.id;
                return (
                  <motion.button key={av.id}
                    whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.93 }}
                    onClick={() => setMyAvatar(av.id as AvatarId)}
                    style={{
                      background: selected ? `linear-gradient(135deg,${av.bg}55,${av.bg}22)` : "rgba(255,255,255,0.05)",
                      border: selected ? `2.5px solid ${av.glow}` : "2px solid rgba(255,255,255,0.1)",
                      borderRadius: 16, padding: "8px 6px 7px",
                      display: "flex", flexDirection: "column", alignItems: "center", gap: 5,
                      cursor: "pointer", boxShadow: selected ? `0 0 20px ${av.glow}55` : "none",
                      transition: "all 0.14s",
                    }}>
                    <img src={av.img} alt={av.label}
                      style={{ width: 48, height: 48, borderRadius: "50%",
                        border: `2px solid ${selected ? av.glow : "rgba(255,255,255,0.15)"}`,
                        objectFit: "cover",
                        boxShadow: selected ? `0 0 12px ${av.glow}88` : "0 2px 8px rgba(0,0,0,0.4)",
                      }} />
                    <span style={{ color: selected ? "#fff" : "rgba(255,255,255,0.5)", fontSize: 9, fontWeight: 800, textAlign: "center" }}>
                      {av.label}
                    </span>
                  </motion.button>
                );
              })}
            </div>
          </div>

          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
            onClick={joinRoom} disabled={!wsReady}
            style={{
              width: "100%", padding: "16px", borderRadius: 16, fontWeight: 900, fontSize: 18,
              cursor: wsReady ? "pointer" : "not-allowed",
              background: wsReady ? "linear-gradient(135deg,#dc2626,#991b1b)" : "rgba(255,255,255,0.1)",
              color: wsReady ? "#fff" : "rgba(255,255,255,0.4)", border: "none",
              boxShadow: wsReady ? "0 6px 24px rgba(220,38,38,0.5)" : "none",
              fontFamily: "'Cairo','Arial',sans-serif",
            }}>انضم للعبة 🃏</motion.button>
        </motion.div>
      </div>
    </div>
  );

  // ─── GAME SCREEN ──────────────────────────────────────────────────────────
  if (screen === "game" && gs) {

    // ── LOBBY ──
    if (gs.phase === "lobby") return (
      <div dir="rtl" style={{
        minHeight: "100dvh", fontFamily: "'Cairo','Arial',sans-serif",
        background: "linear-gradient(160deg,#0d0a1e 0%,#130820 40%,#0a0510 100%)",
        position: "relative",
      }}>
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

          {/* Players header */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <Users size={16} color="#dc2626" />
            <span style={{ color: "rgba(255,255,255,0.9)", fontWeight: 700, fontSize: 15 }}>
              {gs.players.length}/4 لاعبين {gs.players.length === 4 ? "🔒 كاملة" : `(تبقى ${4 - gs.players.length})`}
            </span>
          </div>

          {/* Square player cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 16 }}>
            {gs.players.map(p => {
              const isMe = p.id === myId;
              const { avatarId, name: displayName } = p.isBot
                ? { avatarId: 0 as AvatarId, name: p.name }
                : decodePlayerName(p.name);
              const av = getAvatar(p.isBot ? 0 : avatarId);
              const diffLabel: Record<string, string> = { easy: "سهل", medium: "متوسط", hard: "صعب" };
              return (
                <motion.div key={p.id}
                  initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }}
                  style={{
                    display: "flex", flexDirection: "column", alignItems: "center",
                    borderRadius: 16, padding: "16px 8px 12px",
                    background: isMe
                      ? av.bg
                      : p.isBot
                        ? "rgba(124,58,237,0.14)"
                        : "rgba(255,255,255,0.06)",
                    border: isMe
                      ? `2px solid ${av.glow}`
                      : p.isBot
                        ? "2px solid rgba(124,58,237,0.45)"
                        : "2px solid rgba(255,255,255,0.1)",
                    boxShadow: isMe ? `0 0 20px ${av.glow}44` : "none",
                    position: "relative",
                    cursor: "default",
                  }}>
                  {/* Avatar circle */}
                  <div style={{
                    width: 56, height: 56, borderRadius: "50%", marginBottom: 8,
                    background: p.isBot ? "rgba(124,58,237,0.3)" : av.bg,
                    border: `3px solid ${isMe ? av.glow : "rgba(255,255,255,0.2)"}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    overflow: "hidden",
                    boxShadow: isMe ? `0 0 20px ${av.glow}99` : "0 3px 10px rgba(0,0,0,0.5)",
                  }}>
                    {p.isBot ? (
                      <span style={{ fontSize: 26 }}>🤖</span>
                    ) : (
                      <img src={av.img} alt={av.label}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    )}
                  </div>
                  {/* Name */}
                  <div style={{
                    color: isMe ? "#fff" : "rgba(255,255,255,0.8)",
                    fontWeight: 800, fontSize: 11,
                    textAlign: "center", maxWidth: "100%",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    marginBottom: 3,
                  }}>
                    {displayName}{isMe && " ⭐"}
                  </div>
                  {/* Badges */}
                  {p.isHost && (
                    <div style={{ color: "#fbbf24", fontSize: 9, fontWeight: 700 }}>هوست 👑</div>
                  )}
                  {p.isBot && (
                    <div style={{ color: "#a78bfa", fontSize: 9, fontWeight: 700 }}>
                      🤖 {diffLabel[p.difficulty ?? "easy"]}
                    </div>
                  )}
                  {/* Remove bot button */}
                  {amHost && p.isBot && (
                    <button
                      onClick={() => send({ type: "uno:remove_bot", botId: p.id })}
                      style={{
                        position: "absolute", top: 6, left: 6,
                        background: "rgba(220,38,38,0.3)", border: "none",
                        borderRadius: 6, width: 20, height: 20, display: "flex", alignItems: "center",
                        justifyContent: "center", cursor: "pointer", color: "#fca5a5",
                        fontSize: 10, padding: 0,
                      }}>✕</button>
                  )}
                </motion.div>
              );
            })}
            {/* Empty slot placeholders */}
            {Array.from({ length: Math.max(0, 4 - gs.players.length) }).map((_, i) => (
              <div key={`empty-${i}`} style={{
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                borderRadius: 16, padding: "16px 8px",
                background: "rgba(255,255,255,0.03)",
                border: "2px dashed rgba(255,255,255,0.1)",
                minHeight: 120, color: "rgba(255,255,255,0.2)", fontSize: 11, fontWeight: 600,
              }}>
                <Users size={22} color="rgba(255,255,255,0.2)" style={{ marginBottom: 6 }} />
                ينتظر...
              </div>
            ))}
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
        <div dir="rtl" style={{
            minHeight: "100dvh", fontFamily: "'Cairo','Arial',sans-serif",
            background: "linear-gradient(160deg,#0d0a1e 0%,#130820 40%,#0a0510 100%)",
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24,
          }}>

          <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
            style={{ width: "100%", maxWidth: 480, position: "relative", zIndex: 1 }}>

            <div style={{ textAlign: "center", marginBottom: 32 }}>
              <motion.div animate={{ rotate: [0, -10, 10, -10, 0] }} transition={{ duration: 0.6, delay: 0.3 }}
                style={{ fontSize: 80, marginBottom: 12 }}>🎉</motion.div>
              <h1 style={{ fontSize: 32, fontWeight: 900, color: "#fff",
                textShadow: "0 0 30px rgba(220,38,38,0.8)", marginBottom: 8 }}>
                {isWinner ? "مبروك! أنت فزت! 🏆" : `${winner ? (winner.isBot ? winner.name : decodePlayerName(winner.name).name) : ""} فاز!`}
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
                    {p.isBot ? p.name : decodePlayerName(p.name).name}{p.id === myId && " (أنت)"}
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

      // Fixed 4-player positions
      const topP   = others[0] ?? null;
      const rightP = others[1] ?? null;
      const leftP  = others[2] ?? null;

      return (
        <div style={{
          height: "100dvh",
          position: "relative", overflow: "hidden", userSelect: "none",
          fontFamily: "'Cairo','Arial',sans-serif",
          display: "flex", flexDirection: "column",
        }} dir="rtl">

          {/* ── Solid dark backdrop — covers rose-bg-layer (z:2) and overlay (z:3) ── */}
          <div style={{
            position: "fixed", inset: 0, zIndex: 4,
            background: "radial-gradient(ellipse at 65% 15%, #2c1607 0%, #180a03 45%, #0c0401 100%)",
            pointerEvents: "none",
          }} />

          {/* ── Warm amber lamp glow (upper-right, like reference image) ── */}
          <div style={{
            position: "fixed", top: -120, right: -60,
            width: 550, height: 440,
            background: "radial-gradient(ellipse, rgba(220,145,28,0.24) 0%, transparent 62%)",
            filter: "blur(70px)", pointerEvents: "none", zIndex: 5,
          }} />
          <div style={{
            position: "fixed", bottom: -80, left: -60,
            width: 360, height: 320,
            background: "radial-gradient(ellipse, rgba(40,18,5,0.6) 0%, transparent 70%)",
            filter: "blur(50px)", pointerEvents: "none", zIndex: 5,
          }} />

          {/* ── Modals ── */}
          <AnimatePresence>
            {gs.pendingWild && <ColorPicker onPick={chooseColor} />}
          </AnimatePresence>
          <AnimatePresence>
            {chatOpen && (
              <ChatPanel chat={gs.chat} myId={myId ?? ""} onSend={sendChat} onClose={() => setChatOpen(false)} />
            )}
          </AnimatePresence>

          {/* ── Top-left controls (fixed) ── */}
          <div style={{
            position: "fixed", top: 10, left: 10, zIndex: 60,
            display: "flex", alignItems: "center", gap: 7,
          }}>
            {/* Back */}
            <button onClick={() => navigate("/")} style={{
              background: "rgba(8,4,1,0.9)", border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: 8, color: "rgba(255,255,255,0.85)", cursor: "pointer",
              display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700,
              padding: "5px 9px", backdropFilter: "blur(10px)",
            }}><ArrowRight size={12}/>رجوع</button>
            {/* Chat */}
            <button onClick={() => setChatOpen(v => !v)} style={{
              background: "rgba(8,4,1,0.9)", border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: 8, padding: "5px 9px", cursor: "pointer", color: "#fff",
              display: "flex", alignItems: "center", gap: 4, fontSize: 11,
              position: "relative", backdropFilter: "blur(10px)",
            }}>
              <MessageCircle size={13} />
              {unreadChat > 0 && (
                <div style={{ position: "absolute", top: -5, right: -5, width: 15, height: 15,
                  background: "#dc2626", borderRadius: "50%", fontSize: 8, fontWeight: 900,
                  display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}>
                  {unreadChat}
                </div>
              )}
            </button>
            {/* Volume slider */}
            <div style={{
              background: "rgba(8,4,1,0.88)", border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 8, padding: "4px 8px", backdropFilter: "blur(10px)",
              display: "flex", alignItems: "center", gap: 5,
            }}>
              <span style={{ fontSize: 11 }}>{soundVol === 0 ? "🔇" : "🔊"}</span>
              <input type="range" min={0} max={1} step={0.05} value={soundVol}
                onChange={e => setSoundVol(parseFloat(e.target.value))}
                style={{ width: 60, accentColor: "#c87a20", cursor: "pointer" }} />
            </div>
            {gs.drawStack > 0 && (
              <motion.div animate={{ scale: [1, 1.18, 1] }} transition={{ repeat: Infinity, duration: 0.5 }}
                style={{ background: "#dc2626", color: "#fff", fontWeight: 900, fontSize: 11,
                  padding: "3px 9px", borderRadius: 18, border: "1px solid #fca5a5" }}>
                +{gs.drawStack}
              </motion.div>
            )}
          </div>

          {/* ── Turn indicator — top-right gold badge ── */}
          <div style={{ position: "fixed", top: 10, right: 10, zIndex: 60 }}>
            <AnimatePresence mode="wait">
              <motion.div key={gs.currentPlayerIndex}
                initial={{ opacity: 0, scale: 0.8, y: -8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.8 }}
                style={{
                  background: isMyTurn
                    ? "linear-gradient(135deg,#92400e,#d97706)"
                    : "linear-gradient(135deg,#0f0a02,#1c1207)",
                  border: isMyTurn
                    ? "2px solid #f59e0b"
                    : "1.5px solid rgba(245,158,11,0.3)",
                  borderRadius: 10, padding: "5px 12px",
                  backdropFilter: "blur(12px)",
                  boxShadow: isMyTurn
                    ? "0 0 20px rgba(245,158,11,0.7), 0 4px 12px rgba(0,0,0,0.5)"
                    : "0 2px 8px rgba(0,0,0,0.5)",
                  display: "flex", alignItems: "center", gap: 6,
                }}>
                {isMyTurn ? (
                  <motion.span animate={{ opacity: [0.8, 1, 0.8] }} transition={{ repeat: Infinity, duration: 0.8 }}
                    style={{ fontSize: 13 }}>⚡</motion.span>
                ) : (
                  <span style={{ fontSize: 11 }}>⏳</span>
                )}
                <div>
                  <div style={{
                    color: isMyTurn ? "#fef3c7" : "rgba(245,158,11,0.6)",
                    fontSize: 9, fontWeight: 700, letterSpacing: "0.05em",
                  }}>{isMyTurn ? "دورك الآن" : "الدور على"}</div>
                  {!isMyTurn && (
                    <div style={{ color: "#f59e0b", fontSize: 11, fontWeight: 900, lineHeight: 1.2 }}>
                      {(() => {
                        const cp = gs.players[gs.currentPlayerIndex];
                        if (!cp) return "";
                        return cp.isBot ? cp.name : decodePlayerName(cp.name).name;
                      })()}
                    </div>
                  )}
                </div>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* ═══════════════ GAME AREA (absolute positioning) ═══════════════ */}
          <div style={{ flex: 1, position: "relative", zIndex: 6, minHeight: 0, overflow: "hidden" }}>

            {/* ── TOP PLAYER — centered above table ── */}
            {topP && (
              <div style={{ position: "absolute", top: 8, left: "50%", transform: "translateX(-50%)", zIndex: 22 }}>
                <TopSeat player={topP} />
              </div>
            )}

            {/* ── LEFT PLAYER — on left edge ── */}
            {leftP && (
              <div style={{ position: "absolute", left: 4, top: "50%", transform: "translateY(-50%)", zIndex: 22 }}>
                <LeftSeat player={leftP} />
              </div>
            )}

            {/* ── RIGHT PLAYER — on right edge ── */}
            {rightP && (
              <div style={{ position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)", zIndex: 22 }}>
                <RightSeat player={rightP} />
              </div>
            )}

            {/* ═══ THE TABLE (fills center with inset for player seats) ═══ */}
            <div style={{
              position: "absolute",
              top: topP ? 112 : 12,
              bottom: 22,
              left: leftP ? 90 : 12,
              right: rightP ? 90 : 12,
            }}>

              {/* Outer wood frame */}
              <div style={{
                position: "absolute", inset: 0,
                background: "linear-gradient(150deg, #5e2e10 0%, #421c07 30%, #2e1205 65%, #200d03 100%)",
                borderRadius: 22,
                boxShadow: [
                  "0 30px 80px rgba(0,0,0,0.95)",
                  "0 12px 35px rgba(0,0,0,0.7)",
                  "0 0 0 2px rgba(100,50,10,0.6)",
                  "inset 0 2px 0 rgba(255,190,80,0.1)",
                  "inset 0 -3px 0 rgba(0,0,0,0.6)",
                ].join(", "),
              }} />

              {/* Inner mahogany surface */}
              <div style={{
                position: "absolute", inset: 12,
                background: "linear-gradient(145deg, #3e1d08 0%, #2c1205 45%, #1e0d03 100%)",
                borderRadius: 12,
              }} />

              {/* Neon LED border */}
              <div style={{
                position: "absolute", inset: 12, borderRadius: 12,
                border: "1.5px solid rgba(185,235,255,0.75)",
                boxShadow: [
                  "0 0 14px rgba(155,218,255,0.65)",
                  "0 0 30px rgba(110,185,255,0.28)",
                  "inset 0 0 14px rgba(155,218,255,0.18)",
                  "inset 0 0 5px rgba(210,245,255,0.32)",
                ].join(", "),
                pointerEvents: "none", zIndex: 5,
              }} />

              {/* Gold ornament */}
              <div style={{
                position: "absolute", inset: "18% 14%",
                border: "0.5px solid rgba(255,210,110,0.07)",
                borderRadius: 10, pointerEvents: "none", zIndex: 4,
              }} />
              <div style={{
                position: "absolute", inset: "32% 25%",
                border: "0.5px solid rgba(255,210,110,0.04)",
                borderRadius: 6, pointerEvents: "none", zIndex: 4,
              }} />

              {/* Hologram (upper-right for rightP) */}
              {rightP && (
                <div style={{ position: "absolute", top: 16, right: 18, zIndex: 14 }}>
                  <HologramAvatar player={rightP} />
                </div>
              )}

              {/* CENTER PILES */}
              <div style={{
                position: "absolute", inset: 0, zIndex: 12,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <div style={{
                  background: "linear-gradient(145deg, #321808, #1e0e04)",
                  border: "2px solid #5c2c10",
                  borderRadius: 16, padding: "12px 20px",
                  display: "flex", gap: 20, alignItems: "center",
                  boxShadow: [
                    "0 8px 26px rgba(0,0,0,0.8)",
                    "0 3px 8px rgba(0,0,0,0.55)",
                    "inset 0 1px 0 rgba(255,185,65,0.1)",
                    "0 0 0 1px rgba(92,44,16,0.6)",
                  ].join(", "),
                }}>
                  {/* DRAW PILE */}
                  <div ref={drawPileRef} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
                    <motion.div
                      whileHover={isMyTurn && !hasPlayableCard && !gs.pendingWild ? { scale: 1.1, y: -5 } : {}}
                      whileTap={isMyTurn && !hasPlayableCard && !gs.pendingWild ? { scale: 0.93 } : {}}
                      onClick={isMyTurn && !hasPlayableCard && !gs.pendingWild
                        ? () => { playUnoSound("draw", soundVol); drawCard(); }
                        : undefined}
                      style={{ cursor: isMyTurn && !hasPlayableCard && !gs.pendingWild ? "pointer" : "default", position: "relative" }}>
                      {[2, 1, 0].map(i => (
                        <div key={i} style={{
                          position: i === 0 ? "relative" : "absolute",
                          top: i === 0 ? 0 : i * 2, left: i === 0 ? 0 : i * 1.5, zIndex: 3 - i,
                        }}>
                          <UnoCardBack w={48} h={68} />
                        </div>
                      ))}
                      {isMyTurn && !hasPlayableCard && !gs.pendingWild && (
                        <motion.div
                          animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 0.7 }}
                          style={{ position: "absolute", inset: -4, borderRadius: 8, border: "2.5px solid #dc2626", pointerEvents: "none", zIndex: 10 }} />
                      )}
                    </motion.div>
                    <div style={{ color: "rgba(255,255,255,0.42)", fontSize: 9, fontWeight: 700 }}>{gs.deckCount}</div>
                  </div>

                  {/* DISCARD PILE */}
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
                    <AnimatePresence mode="wait">
                      {top && (
                        <motion.div key={top.id}
                          initial={{ rotateY: 90, scale: 0.75, opacity: 0 }}
                          animate={{ rotateY: 0, scale: 1, opacity: 1 }}
                          exit={{ rotateY: -90, scale: 0.75, opacity: 0 }}
                          transition={{ duration: 0.22 }}>
                          <UnoCardEl card={top} size="lg" />
                        </motion.div>
                      )}
                    </AnimatePresence>
                    {top?.color === "wild" && (
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <div style={{ width: 9, height: 9, borderRadius: "50%", background: CARD_COLORS[gs.currentColor], boxShadow: `0 0 6px ${CARD_COLORS[gs.currentColor]}` }} />
                        <span style={{ color: "rgba(255,255,255,0.55)", fontSize: 9 }}>{COLOR_AR[gs.currentColor]}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Direction + color (bottom-left inside table) */}
              <div style={{ position: "absolute", bottom: 16, left: 20, zIndex: 10, display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ color: "rgba(200,230,255,0.55)", fontSize: 18, lineHeight: 1 }}>{gs.direction === 1 ? "↻" : "↺"}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <div style={{ width: 11, height: 11, borderRadius: "50%", background: CARD_COLORS[gs.currentColor], boxShadow: `0 0 10px ${CARD_COLORS[gs.currentColor]}` }} />
                  <span style={{ color: "rgba(255,255,255,0.52)", fontSize: 9, fontWeight: 700 }}>{COLOR_AR[gs.currentColor]}</span>
                </div>
              </div>

            </div>
            {/* ═══ END TABLE ═══ */}

          </div>

          {/* ═══════════════ MY HAND (bottom tray) ═══════════════ */}
          <div ref={handTrayRef} style={{
            flexShrink: 0, position: "relative", zIndex: 10,
            padding: "0 10px 0",
          }}>
            {/* Draw buttons */}
            {isMyTurn && !hasPlayableCard && !gs.pendingWild && gs.drawStack === 0 && (
              <motion.button
                animate={{ scale: [1, 1.025, 1], boxShadow: ["0 0 0px #6366f1","0 0 18px #6366f1aa","0 0 0px #6366f1"] }}
                transition={{ repeat: Infinity, duration: 0.85 }}
                whileTap={{ scale: 0.96 }}
                onClick={() => { playUnoSound("draw", soundVol); drawCard(); }}
                style={{
                  width: "100%", padding: "9px", borderRadius: 11, fontWeight: 900, fontSize: 14,
                  background: "linear-gradient(135deg,#4f46e5,#7c3aed)",
                  color: "#fff", border: "1.5px solid #818cf8",
                  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  fontFamily: "'Cairo','Arial',sans-serif", marginBottom: 5,
                }}>
                🃏 اسحب ورقة
              </motion.button>
            )}
            {isMyTurn && gs.drawStack > 0 && !gs.pendingWild && (
              <motion.button
                animate={{ scale: [1, 1.025, 1] }} transition={{ repeat: Infinity, duration: 0.85 }}
                whileTap={{ scale: 0.96 }}
                onClick={() => { playUnoSound("draw", soundVol); drawCard(gs.drawStack); }}
                style={{
                  width: "100%", padding: "8px", borderRadius: 10, fontWeight: 900, fontSize: 13,
                  background: "linear-gradient(135deg,#dc2626,#991b1b)",
                  color: "#fff", border: "1.5px solid #fca5a5",
                  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  fontFamily: "'Cairo','Arial',sans-serif", marginBottom: 5,
                }}>
                💀 اسحب {gs.drawStack} أوراق
              </motion.button>
            )}

            {/* UNO button when hand ≤ 2 and has playable */}
            {myHand.length <= 2 && hasPlayableCard && (
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 4 }}>
                <motion.button
                  whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.9 }}
                  animate={myHand.length === 1 && !me?.saidUno
                    ? { scale: [1, 1.07, 1] } : {}}
                  transition={{ repeat: Infinity, duration: 0.7 }}
                  onClick={sayUno}
                  style={{
                    padding: "5px 26px", borderRadius: 16, fontWeight: 900, fontSize: 16,
                    background: me?.saidUno ? "rgba(255,255,255,0.07)" : "linear-gradient(135deg,#dc2626,#991b1b)",
                    color: me?.saidUno ? "rgba(255,255,255,0.35)" : "#fff",
                    border: `2px solid ${me?.saidUno ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.25)"}`,
                    cursor: me?.saidUno ? "default" : "pointer",
                    boxShadow: me?.saidUno ? "none" : "0 4px 16px rgba(220,38,38,0.55)",
                  }}>
                  {me?.saidUno ? "✓ UNO!" : "UNO!"}
                </motion.button>
              </div>
            )}

            {/* ── Leather card tray (centered) ── */}
            <div style={{
              background: "linear-gradient(180deg, #8a4e28 0%, #6a361a 40%, #4a2210 80%, #341608 100%)",
              border: "2px solid rgba(255,200,100,0.3)",
              borderRadius: "12px 12px 8px 8px",
              padding: "9px 12px 12px",
              boxShadow: [
                "0 -6px 22px rgba(0,0,0,0.55)",
                "inset 0 1px 0 rgba(255,200,80,0.16)",
                "inset 0 -3px 0 rgba(0,0,0,0.5)",
              ].join(", "),
              position: "relative",
              marginBottom: 10,
            }}>
              {/* Slot groove */}
              <div style={{
                position: "absolute", top: 7, left: 10, right: 10, height: 3,
                background: "rgba(0,0,0,0.35)", borderRadius: 2,
              }} />
              {/* Name + count strip */}
              <div style={{
                position: "absolute", top: -22, left: 0, right: 0,
                display: "flex", justifyContent: "space-between", padding: "0 12px",
              }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                  <div style={{ color: "rgba(255,255,255,0.85)", fontSize: 11, fontWeight: 800 }}>
                    {me ? decodePlayerName(me.name).name : "أنت"}
                  </div>
                  <div style={{ color: "rgba(255,200,80,0.65)", fontSize: 8, fontWeight: 600 }}>
                    حظ موفق ✨
                  </div>
                </div>
                <div style={{ color: "rgba(255,255,255,0.38)", fontSize: 9, fontWeight: 700 }}>
                  {myHand.length} ورقة{!isMyTurn && " — انتظر..."}
                </div>
              </div>
              {/* Cards row — centered */}
              <div style={{
                display: "flex", gap: 5, overflowX: "auto", alignItems: "flex-end",
                scrollbarWidth: "none", paddingBottom: 1,
                justifyContent: myHand.length <= 7 ? "center" : "flex-start",
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
                  <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 12, padding: "12px 20px", alignSelf: "center" }}>لا أوراق!</div>
                )}
              </div>
              {/* Bottom ledge */}
              <div style={{
                position: "absolute", bottom: 0, left: 0, right: 0, height: 6,
                borderRadius: "0 0 7px 7px",
                background: "linear-gradient(180deg, #5a2e14, #2a1207)",
                boxShadow: "0 3px 7px rgba(0,0,0,0.6)",
              }} />
            </div>
          </div>

          {/* ── Flying card draw animations ── */}
          {flyingCards.map(fc => (
            <motion.div
              key={fc.key}
              initial={{ x: fc.fromX, y: fc.fromY, rotate: -10, scale: 1.05, opacity: 1 }}
              animate={{ x: fc.toX, y: fc.toY, rotate: 720, scale: 0.7, opacity: 0 }}
              transition={{ duration: 0.55, ease: [0.19, 1, 0.22, 1] }}
              style={{
                position: "fixed", top: 0, left: 0, zIndex: 9999,
                width: 48, height: 68, pointerEvents: "none",
                filter: "drop-shadow(0 0 12px rgba(255,200,80,0.7))",
              }}>
              <UnoCardBack w={48} h={68} />
            </motion.div>
          ))}
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
