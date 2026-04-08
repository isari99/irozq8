import { useState, useRef, useCallback, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Copy, Check, Users, ArrowRight } from "lucide-react";
import barBg    from "@assets/بار2_1775630997287.jpg";
import barHero  from "@assets/بار_1775633003083.png";

// ─── WS URL ───────────────────────────────────────────────────────────────────
function getWsUrl(): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/ws`;
}

// ─── Characters ───────────────────────────────────────────────────────────────
const CHARACTERS = [
  { name: "الخنزير الجزار", emoji: "🐷", color: "#f9a8d4", bg: "#831843" },
  { name: "الثور",          emoji: "🐂", color: "#93c5fd", bg: "#1e3a8a" },
  { name: "الثعلب",         emoji: "🦊", color: "#fdba74", bg: "#9a3412" },
  { name: "الذئب",          emoji: "🐺", color: "#6ee7b7", bg: "#064e3b" },
];

const CARD_COLORS: Record<string, string> = {
  Ace:   "#e040fb",
  King:  "#ffd600",
  Queen: "#f43f5e",
  Jack:  "#00e5ff",
  Joker: "#22c55e",
};

const CARD_LABELS: Record<string, string> = {
  Ace:   "A",
  King:  "K",
  Queen: "Q",
  Jack:  "J",
  Joker: "🃏",
};

const SUIT_ICONS = ["♠", "♣", "♥", "♦"];

// ─── Types ────────────────────────────────────────────────────────────────────
interface BarCard { id: string; value: string }
interface PublicPlayer {
  id: string; name: string; avatar: string;
  character: number; hp: number; cardCount: number;
  role: string; eliminated: boolean; charSelected: boolean; connected: boolean;
}
interface GameState {
  code: string; phase: string; hostId: string;
  players: PublicPlayer[]; playerOrder: string[];
  currentTurnId: string | null; nextPlayerId: string | null;
  playState: string; currentCardType: string;
  tableClaim: { playerId: string; count: number } | null;
  tableCardCount: number; roundNum: number; winnerId: string | null;
}
interface BluffReveal {
  cards: BarCard[]; isBluff: boolean;
  accusedId: string; accusedName: string;
  challengerId: string; challengerName: string;
  claim: { count: number; cardType: string };
}
interface ChallengeTurn {
  claim: { playerId: string; playerName: string; count: number; cardType: string };
}

// ─── HP Display ───────────────────────────────────────────────────────────────
function HpDisplay({ hp, maxHp = 6 }: { hp: number; maxHp?: number }) {
  return (
    <div className="flex gap-0.5 justify-center">
      {Array.from({ length: maxHp }).map((_, i) => (
        <div key={i} className="w-2.5 h-2.5 rounded-full border border-white/30"
          style={{ background: i < hp ? "#e040fb" : "rgba(255,255,255,0.1)", boxShadow: i < hp ? "0 0 6px #e040fb" : "none" }} />
      ))}
    </div>
  );
}

// ─── Playing Card Face ────────────────────────────────────────────────────────
function CardFace({ card, selected, onClick, suitIdx = 0 }: {
  card: BarCard; selected?: boolean; onClick?: () => void; suitIdx?: number;
}) {
  const color = CARD_COLORS[card.value] ?? "#fff";
  const label = CARD_LABELS[card.value] ?? card.value;
  return (
    <motion.div
      whileHover={{ y: -8, scale: 1.05 }}
      whileTap={{ scale: 0.97 }}
      animate={selected ? { y: -16 } : { y: 0 }}
      onClick={onClick}
      className="relative cursor-pointer rounded-xl border-2 select-none"
      style={{
        width: 64, height: 92,
        background: "linear-gradient(135deg, #1a0a2e, #0d0018)",
        borderColor: selected ? color : "rgba(255,255,255,0.2)",
        boxShadow: selected ? `0 0 20px ${color}80` : "0 2px 8px rgba(0,0,0,0.5)",
        flexShrink: 0,
      }}>
      <div className="absolute top-1 left-1.5 text-xs font-black" style={{ color, lineHeight: 1 }}>{label}</div>
      <div className="absolute top-2.5 left-1.5 text-[8px]" style={{ color: `${color}80` }}>{SUIT_ICONS[suitIdx % 4]}</div>
      <div className="absolute inset-0 flex items-center justify-center text-2xl font-black"
        style={{ color, textShadow: `0 0 16px ${color}` }}>{label}</div>
      <div className="absolute bottom-1 right-1.5 text-xs font-black rotate-180" style={{ color, lineHeight: 1 }}>{label}</div>
      {selected && (
        <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-pink-500 flex items-center justify-center text-[8px] text-white font-black">✓</div>
      )}
    </motion.div>
  );
}

// ─── Card Back ────────────────────────────────────────────────────────────────
function CardBack({ count = 1 }: { count?: number }) {
  return (
    <div className="relative" style={{ width: 56 + Math.min(count - 1, 4) * 6, height: 80 }}>
      {Array.from({ length: Math.min(count, 5) }).map((_, i) => (
        <div key={i} className="absolute rounded-lg border border-purple-500/30"
          style={{
            width: 52, height: 76,
            left: i * 5, top: i * 2,
            background: "linear-gradient(135deg, #2d1457, #1a0a30)",
            zIndex: i,
          }}>
          <div className="w-full h-full rounded-lg border border-purple-500/20 m-0.5"
            style={{ background: "repeating-linear-gradient(45deg, rgba(224,64,251,0.05) 0px, rgba(224,64,251,0.05) 2px, transparent 2px, transparent 8px)" }} />
        </div>
      ))}
      {count > 0 && (
        <div className="absolute inset-0 flex items-center justify-center" style={{ zIndex: 10 }}>
          <span className="text-xs font-black text-purple-300 bg-black/60 px-1.5 py-0.5 rounded-full">{count}</span>
        </div>
      )}
    </div>
  );
}

// ─── Face-down Pile ────────────────────────────────────────────────────────────
function TablePile({ claim, currentCardType, roundNum }: {
  claim: { playerId: string; count: number } | null;
  currentCardType: string;
  roundNum: number;
}) {
  const color = CARD_COLORS[currentCardType] ?? "#e040fb";
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="text-center">
        <div className="text-xs text-white/40 mb-1">الجولة {roundNum} — الورقة المطلوبة</div>
        <div className="px-4 py-1.5 rounded-full font-black text-sm"
          style={{ background: `${color}20`, color, border: `1px solid ${color}50`, boxShadow: `0 0 16px ${color}30` }}>
          {CARD_LABELS[currentCardType]} {currentCardType}
        </div>
      </div>
      {claim ? (
        <div className="relative">
          <div className="flex gap-1">
            {Array.from({ length: claim.count }).map((_, i) => (
              <div key={i} className="w-12 h-16 rounded-lg border border-purple-500/30 flex items-center justify-center"
                style={{ background: "linear-gradient(135deg, #2d1457, #1a0a30)", transform: `rotate(${(i - 1) * 4}deg)` }}>
                <span className="text-purple-400/40 text-lg">★</span>
              </div>
            ))}
          </div>
          <div className="absolute -bottom-5 inset-x-0 text-center text-[10px] text-white/50">
            {claim.count} ورقة وُضعت
          </div>
        </div>
      ) : (
        <div className="w-16 h-22 rounded-xl border-2 border-dashed border-white/10 flex items-center justify-center">
          <span className="text-white/20 text-xs">فارغ</span>
        </div>
      )}
    </div>
  );
}

// ─── Seat for other players ───────────────────────────────────────────────────
function PlayerSeat({ player, isCurrentTurn, isChallenger, position }: {
  player: PublicPlayer; isCurrentTurn: boolean; isChallenger: boolean;
  position: "top" | "left" | "right";
}) {
  const char = CHARACTERS[player.character] ?? CHARACTERS[0];
  const opacity = player.eliminated ? 0.3 : 1;
  return (
    <div className="flex flex-col items-center gap-1.5" style={{ opacity }}>
      <div className="relative">
        <motion.div
          animate={isCurrentTurn ? { boxShadow: ["0 0 0px #e040fb", "0 0 20px #e040fb", "0 0 0px #e040fb"] } : {}}
          transition={{ duration: 1.5, repeat: Infinity }}
          className="w-14 h-14 rounded-full flex items-center justify-center text-3xl border-2"
          style={{
            background: char.bg,
            borderColor: isCurrentTurn ? "#e040fb" : isChallenger ? "#ffd600" : "rgba(255,255,255,0.15)",
          }}>
          {char.emoji}
        </motion.div>
        {isCurrentTurn && (
          <div className="absolute -top-1 -right-1 text-[10px] bg-pink-500 text-white rounded-full w-4 h-4 flex items-center justify-center">▶</div>
        )}
        {isChallenger && !isCurrentTurn && (
          <div className="absolute -top-1 -right-1 text-[10px] bg-yellow-500 text-black rounded-full w-4 h-4 flex items-center justify-center">?</div>
        )}
        {player.eliminated && (
          <div className="absolute inset-0 rounded-full flex items-center justify-center bg-black/60 text-2xl">💀</div>
        )}
      </div>
      <div className="text-[10px] font-bold text-white/70 truncate max-w-[64px] text-center">{player.name}</div>
      <HpDisplay hp={player.hp} />
      {!player.eliminated && <CardBack count={player.cardCount} />}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function LiarsBarGame() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);

  // Entry state
  const [name, setName]           = useState("");
  const [roomCode, setRoomCode]   = useState(params.get("room") ?? "");
  const [error, setError]         = useState("");
  const [copied, setCopied]       = useState(false);

  // Game state
  const [myId, setMyId]           = useState<string | null>(null);
  const [myRole, setMyRole]       = useState<"host"|"player">("player");
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [myHand, setMyHand]       = useState<BarCard[]>([]);
  const [selectedIds, setSelected]= useState<Set<string>>(new Set());

  // UX state
  const [challenge, setChallenge] = useState<ChallengeTurn | null>(null);
  const [reveal, setReveal]       = useState<BluffReveal | null>(null);
  const [toast, setToast]         = useState<string | null>(null);
  const [eliminated, setEliminated] = useState<{id:string;name:string}|null>(null);
  const [joinedCode, setJoinedCode] = useState<string | null>(null);

  const wsRef    = useRef<WebSocket | null>(null);
  const myIdRef  = useRef<string | null>(null);
  useEffect(() => { myIdRef.current = myId; }, [myId]);

  // ── Toast helper ──────────────────────────────────────────────────────────
  const showToast = useCallback((msg: string, duration = 3000) => {
    setToast(msg);
    setTimeout(() => setToast(null), duration);
  }, []);

  // ── WS connect ────────────────────────────────────────────────────────────
  const connect = useCallback(() => {
    if (wsRef.current) wsRef.current.close();
    const ws = new WebSocket(getWsUrl());
    wsRef.current = ws;

    ws.onopen = () => {};
    ws.onmessage = e => {
      try {
        const msg = JSON.parse(e.data);
        handleMsg(msg);
      } catch {}
    };
    ws.onclose = () => {
      setTimeout(() => {
        if (wsRef.current === ws && myIdRef.current) connect();
      }, 2000);
    };
    ws.onerror = () => {};
    return ws;
  }, []);

  function wsSend(msg: object) {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }

  function handleMsg(msg: Record<string, unknown>) {
    const t = msg.type as string;

    if (t === "bar:joined") {
      setMyId(msg.playerId as string);
      setMyRole(msg.role as "host" | "player");
      setJoinedCode(msg.code as string);
    }
    if (t === "bar:state") {
      setGameState(msg as unknown as GameState);
    }
    if (t === "bar:hand") {
      setMyHand(msg.hand as BarCard[]);
      setSelected(new Set());
    }
    if (t === "bar:your_turn") {
      showToast(`دورك الآن! العب أوراق ${msg.cardType}`);
    }
    if (t === "bar:challenge_turn") {
      setChallenge({ claim: msg.claim as ChallengeTurn["claim"] });
      showToast("هل تتهمه بالكذب؟");
    }
    if (t === "bar:bluff_reveal") {
      setReveal(msg as unknown as BluffReveal);
      setChallenge(null);
      setTimeout(() => setReveal(null), 4000);
    }
    if (t === "bar:eliminated") {
      setEliminated({ id: msg.playerId as string, name: msg.playerName as string });
      showToast(`💀 تم إقصاء ${msg.playerName}!`, 4000);
      setTimeout(() => setEliminated(null), 4000);
    }
    if (t === "bar:game_over") {
      showToast(`🏆 الفائز: ${msg.winnerName}!`, 6000);
    }
    if (t === "bar:error") {
      setError(msg.msg as string);
      setTimeout(() => setError(""), 3000);
    }
  }

  // ── Join / Create ─────────────────────────────────────────────────────────
  function joinOrCreate() {
    if (!name.trim()) { setError("أدخل اسمك أولاً"); return; }
    const ws = connect();
    const avatar = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${encodeURIComponent(name)}`;
    const payload: Record<string, string> = { type: "bar:join", name: name.trim(), avatar };
    if (roomCode.trim()) payload.code = roomCode.trim().toUpperCase();
    const send = () => ws.send(JSON.stringify(payload));
    if (ws.readyState === WebSocket.OPEN) send();
    else ws.addEventListener("open", send, { once: true });
  }

  // ── Game actions ──────────────────────────────────────────────────────────
  function startGame() { wsSend({ type: "bar:start" }); }

  function selectChar(idx: number) { wsSend({ type: "bar:char_select", charIdx: idx }); }

  function toggleCard(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); return next; }
      if (next.size >= 3) return prev;
      next.add(id);
      return next;
    });
  }

  function playCards() {
    if (selectedIds.size === 0) { setError("اختر ورقة واحدة على الأقل"); return; }
    wsSend({ type: "bar:play", cardIds: Array.from(selectedIds) });
    setSelected(new Set());
  }

  function callBluff() { wsSend({ type: "bar:call_bluff" }); setChallenge(null); }
  function passChallenge() { wsSend({ type: "bar:pass_challenge" }); setChallenge(null); }

  // Keyboard controls
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!gameState || gameState.phase !== "playing") return;
      if (e.code === "KeyE") playCards();
      if (e.code === "Space" && challenge) { e.preventDefault(); callBluff(); }
      if (e.code === "KeyP" && challenge)  passChallenge();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [gameState, challenge, selectedIds]);

  // ── Sync on reconnect ─────────────────────────────────────────────────────
  useEffect(() => {
    if (myId) wsSend({ type: "bar:sync" });
  }, [myId]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const gs = gameState;
  const isMyTurn    = gs?.currentTurnId === myId && gs?.playState === "waiting_play";
  const isMyChallengeTurn = gs?.nextPlayerId === myId && gs?.playState === "waiting_challenge";
  const myPlayer    = gs?.players.find(p => p.id === myId);
  const myChar      = CHARACTERS[myPlayer?.character ?? 0];

  function seatedPlayers(): { player: PublicPlayer; pos: "top"|"left"|"right" }[] {
    if (!gs || !myId) return [];
    const order = gs.playerOrder.filter(id => {
      const p = gs.players.find(q => q.id === id);
      return p && !p.eliminated;
    });
    const myIdx = order.indexOf(myId);
    if (myIdx < 0) return [];
    const POSITIONS: ("top"|"left"|"right")[] = ["top","right","left"];
    return order
      .filter(id => id !== myId)
      .map((id, i) => ({
        player: gs.players.find(p => p.id === id)!,
        pos: POSITIONS[i] ?? "top",
      }))
      .filter(x => x.player);
  }

  const phase = gs?.phase ?? (myId ? "lobby" : "entry");

  // ════════════════════════════════════════════════════════════════════════════
  // ENTRY SCREEN
  // ════════════════════════════════════════════════════════════════════════════
  if (!myId) {
    return (
      <div className="min-h-screen flex flex-col items-center" dir="rtl"
        style={{ background: "#050010", overflowY: "auto" }}>

        {/* ── Hero Image Block ── */}
        <div className="w-full flex justify-center" style={{ background: "#05000e" }}>
          <div className="relative w-full" style={{ maxWidth: 520 }}>
            {/* Square container — aspect-square */}
            <div className="relative w-full" style={{ paddingBottom: "100%" }}>
              <img
                src={barHero}
                alt="Liar's Bar"
                className="absolute inset-0 w-full h-full object-cover"
                style={{ display: "block" }}
              />
              {/* Bottom gradient fade into page bg */}
              <div className="absolute bottom-0 inset-x-0 h-28 pointer-events-none"
                style={{ background: "linear-gradient(to bottom, transparent, #050010)" }} />
              {/* Top subtle vignette */}
              <div className="absolute top-0 inset-x-0 h-16 pointer-events-none"
                style={{ background: "linear-gradient(to bottom, rgba(5,0,16,0.6), transparent)" }} />
            </div>
          </div>
        </div>

        {/* ── Title ── */}
        <div className="relative z-10 flex flex-col items-center -mt-10 px-5 w-full" style={{ maxWidth: 480 }}>
          <motion.h1
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className="text-5xl font-black tracking-widest mb-1 text-center"
            style={{
              fontFamily: "serif",
              color: "#e040fb",
              textShadow: "0 0 40px #e040fb, 0 0 80px #e040fb60, 0 2px 0 #9c27b0",
              letterSpacing: "0.12em",
            }}>
            LIAR'S BAR
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 }}
            className="text-sm font-bold mb-8 text-center"
            style={{ color: "rgba(200,150,255,0.55)", letterSpacing: "0.04em" }}>
            لعبة الكذب والبلوف على الطاولة
          </motion.p>

          {/* ── Form Card ── */}
          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
            className="w-full flex flex-col gap-3 rounded-2xl p-5 mb-8"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(224,64,251,0.18)",
              backdropFilter: "blur(10px)",
              boxShadow: "0 8px 40px rgba(0,0,0,0.6)",
            }}>
            {/* Name */}
            <input
              value={name} onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && joinOrCreate()}
              placeholder="اسمك في اللعبة"
              className="w-full px-4 py-3.5 rounded-xl text-white text-center font-bold outline-none"
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(224,64,251,0.28)",
                fontSize: 16,
                caretColor: "#e040fb",
              }}
            />
            {/* Room code */}
            <input
              value={roomCode} onChange={e => setRoomCode(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === "Enter" && joinOrCreate()}
              placeholder="كود الغرفة (للانضمام — اختياري)"
              maxLength={4}
              className="w-full px-4 py-3.5 rounded-xl text-white text-center font-bold outline-none uppercase tracking-widest"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(224,64,251,0.15)",
                fontSize: 16,
                letterSpacing: "0.25em",
                caretColor: "#e040fb",
              }}
            />
            {error && (
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="text-red-400 text-sm text-center font-bold">{error}</motion.p>
            )}
            {/* CTA Button */}
            <motion.button
              onClick={joinOrCreate}
              whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
              className="w-full py-4 rounded-xl font-black text-white text-lg mt-1"
              style={{
                background: "linear-gradient(135deg, #e040fb 0%, #9c27b0 60%, #6a0dad 100%)",
                boxShadow: "0 0 30px #e040fb40, 0 4px 20px rgba(0,0,0,0.5)",
                letterSpacing: "0.03em",
              }}>
              {roomCode.trim() ? "🚪 انضم إلى الغرفة" : "🃏 أنشئ غرفة جديدة"}
            </motion.button>
          </motion.div>

          {/* Controls hint */}
          <p className="text-center text-purple-500/30 text-xs pb-6">
            A/D للتنقل بين الأوراق &nbsp;•&nbsp; Space للاختيار &nbsp;•&nbsp; E للعب
          </p>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // LOBBY SCREEN
  // ════════════════════════════════════════════════════════════════════════════
  if (phase === "lobby") {
    const copyCode = () => {
      navigator.clipboard.writeText(`${window.location.origin}/liars-bar?room=${joinedCode}`);
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    };
    return (
      <div className="min-h-screen gradient-bg flex flex-col items-center justify-center" dir="rtl">
        <div className="absolute inset-0">
          <img src={barBg} alt="" className="w-full h-full object-cover opacity-10" />
          <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, rgba(5,0,15,0.8), rgba(5,0,15,0.98))" }} />
        </div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="relative z-10 w-full max-w-sm mx-5 flex flex-col gap-5">
          <h2 className="text-2xl font-black text-center" style={{ color: "#e040fb" }}>انتظار اللاعبين</h2>

          {/* Room Code */}
          <div className="bg-white/5 border border-purple-500/20 rounded-2xl p-4 text-center">
            <p className="text-purple-400/60 text-xs mb-2">كود الغرفة</p>
            <div className="text-4xl font-black tracking-widest mb-3"
              style={{ color: "#ffd600", textShadow: "0 0 20px #ffd600" }}>{joinedCode}</div>
            <button onClick={copyCode}
              className="flex items-center gap-2 mx-auto px-4 py-2 rounded-lg text-sm font-bold text-purple-300 border border-purple-500/30"
              style={{ background: "rgba(224,64,251,0.1)" }}>
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? "تم النسخ!" : "نسخ رابط الدعوة"}
            </button>
          </div>

          {/* Players */}
          <div className="bg-white/5 border border-purple-500/20 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Users size={14} className="text-purple-400" />
              <span className="text-sm font-bold text-purple-300">اللاعبون ({gs?.players.length ?? 0}/4)</span>
            </div>
            <div className="flex flex-col gap-2">
              {gs?.players.map((p, i) => (
                <div key={p.id} className="flex items-center gap-3 px-3 py-2 rounded-xl border border-purple-500/15"
                  style={{ background: "rgba(224,64,251,0.05)" }}>
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-lg"
                    style={{ background: CHARACTERS[0].bg }}>{CHARACTERS[i % 4].emoji}</div>
                  <span className="font-bold text-white/80 text-sm">{p.name}</span>
                  {p.role === "host" && <span className="text-[10px] text-yellow-400 border border-yellow-400/30 px-1.5 py-0.5 rounded-full">مضيف</span>}
                </div>
              ))}
            </div>
          </div>

          {myRole === "host" && (
            <motion.button
              onClick={startGame}
              disabled={(gs?.players.length ?? 0) < 2}
              whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
              className="w-full py-4 rounded-2xl font-black text-white text-lg"
              style={{
                background: (gs?.players.length ?? 0) >= 2 ? "linear-gradient(135deg, #e040fb, #9c27b0)" : "rgba(255,255,255,0.05)",
                boxShadow: (gs?.players.length ?? 0) >= 2 ? "0 0 30px #e040fb40" : "none",
                cursor: (gs?.players.length ?? 0) >= 2 ? "pointer" : "not-allowed",
                color: (gs?.players.length ?? 0) >= 2 ? "#fff" : "rgba(255,255,255,0.2)",
              }}>
              {(gs?.players.length ?? 0) >= 2 ? "🚀 ابدأ اللعبة" : `يلزم ${2 - (gs?.players.length ?? 0)} لاعب`}
            </motion.button>
          )}
          {myRole !== "host" && (
            <p className="text-center text-purple-400/50 text-sm">في انتظار المضيف لبدء اللعبة...</p>
          )}
        </motion.div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // CHARACTER SELECT
  // ════════════════════════════════════════════════════════════════════════════
  if (phase === "char_select") {
    const takenChars = new Set(gs?.players.filter(p => p.charSelected).map(p => p.character) ?? []);
    const myCharSelected = myPlayer?.charSelected;
    return (
      <div className="min-h-screen gradient-bg flex flex-col items-center justify-center" dir="rtl">
        <div className="absolute inset-0">
          <img src={barBg} alt="" className="w-full h-full object-cover opacity-20" />
          <div className="absolute inset-0" style={{ background: "rgba(5,0,15,0.85)" }} />
        </div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="relative z-10 flex flex-col items-center gap-6 px-5">
          <div className="text-center">
            <h2 className="text-2xl font-black neon-text-pink">اختر شخصيتك</h2>
            <p className="text-purple-400/50 text-sm mt-1">كل لاعب يختار شخصية مختلفة</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {CHARACTERS.map((c, i) => {
              const taken = takenChars.has(i) && myPlayer?.character !== i;
              return (
                <motion.button key={i}
                  onClick={() => !taken && !myCharSelected && selectChar(i)}
                  whileHover={!taken && !myCharSelected ? { scale: 1.05 } : {}}
                  whileTap={!taken && !myCharSelected ? { scale: 0.95 } : {}}
                  className="flex flex-col items-center gap-3 p-5 rounded-2xl border-2 transition-all"
                  style={{
                    background: taken ? "rgba(255,255,255,0.03)" : `${c.bg}30`,
                    borderColor: myPlayer?.character === i ? c.color : taken ? "rgba(255,255,255,0.08)" : `${c.color}40`,
                    opacity: taken ? 0.4 : 1,
                    cursor: taken || myCharSelected ? "not-allowed" : "pointer",
                    boxShadow: myPlayer?.character === i ? `0 0 20px ${c.color}50` : "none",
                  }}>
                  <span className="text-5xl">{c.emoji}</span>
                  <span className="font-black text-sm" style={{ color: c.color }}>{c.name}</span>
                  {taken && <span className="text-[10px] text-white/30">محجوز</span>}
                </motion.button>
              );
            })}
          </div>
          {myCharSelected && (
            <p className="text-green-400 text-sm font-bold animate-pulse">
              ✓ اخترت {CHARACTERS[myPlayer!.character].name} — في انتظار باقي اللاعبين
            </p>
          )}
          <div className="flex flex-wrap justify-center gap-2 text-[11px] text-purple-400/40">
            {gs?.players.map(p => (
              <span key={p.id} className={p.charSelected ? "text-green-400/60" : ""}>
                {p.name} {p.charSelected ? "✓" : "..."}
              </span>
            ))}
          </div>
        </motion.div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // END SCREEN
  // ════════════════════════════════════════════════════════════════════════════
  if (phase === "end") {
    const winner = gs?.players.find(p => p.id === gs.winnerId);
    const winChar = CHARACTERS[winner?.character ?? 0];
    return (
      <div className="min-h-screen flex flex-col items-center justify-center" dir="rtl"
        style={{ background: "#040010" }}>
        <div className="absolute inset-0">
          <img src={barBg} alt="" className="w-full h-full object-cover opacity-20" />
          <div className="absolute inset-0" style={{ background: "rgba(4,0,16,0.80)" }} />
        </div>
        <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          className="relative z-10 flex flex-col items-center gap-6 text-center px-5">
          <motion.div animate={{ y: [0, -15, 0] }} transition={{ duration: 2, repeat: Infinity }}>
            <span className="text-7xl">🏆</span>
          </motion.div>
          <div>
            <p className="text-yellow-400/80 text-xl mb-3 font-bold">الفائز</p>
            <div className="text-8xl mb-3">{winChar.emoji}</div>
            <h2 className="text-4xl font-black" style={{ color: winChar.color }}>{winner?.name}</h2>
            <p className="text-white/40 mt-2">{winChar.name}</p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => { wsRef.current?.close(); navigate("/liars-bar"); window.location.reload(); }}
              className="px-6 py-3 rounded-xl font-bold text-white border border-purple-500/30"
              style={{ background: "rgba(224,64,251,0.1)" }}>
              لعبة جديدة
            </button>
            <button onClick={() => navigate("/")}
              className="px-6 py-3 rounded-xl font-bold text-white border border-purple-500/30"
              style={{ background: "rgba(0,229,255,0.08)" }}>
              الرئيسية
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // PLAYING SCREEN
  // ════════════════════════════════════════════════════════════════════════════
  const seated = seatedPlayers();
  const topPlayer    = seated.find(s => s.pos === "top");
  const leftPlayer   = seated.find(s => s.pos === "left");
  const rightPlayer  = seated.find(s => s.pos === "right");

  return (
    <div className="min-h-screen overflow-hidden relative flex flex-col" dir="rtl" style={{ height: "100dvh" }}>
      {/* Background */}
      <div className="absolute inset-0">
        <img src={barBg} alt="Liar's Bar" className="w-full h-full object-cover" />
        <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, rgba(5,0,20,0.45), rgba(5,0,15,0.75))" }} />
      </div>

      {/* Header HUD */}
      <div className="relative z-10 flex items-center justify-between px-4 py-2">
        <button onClick={() => navigate("/")}
          className="flex items-center gap-1 text-white/40 hover:text-white/70 text-xs transition-colors">
          <ArrowRight size={12} /><span>خروج</span>
        </button>
        <div className="px-3 py-1 rounded-full text-[11px] font-bold"
          style={{ background: "rgba(0,0,0,0.5)", color: "#ffd600", border: "1px solid rgba(255,214,0,0.3)" }}>
          LIAR'S BAR — غرفة {joinedCode}
        </div>
        <div className="text-[10px] text-white/30">ج{gs?.roundNum}</div>
      </div>

      {/* ── TOP PLAYER ─── */}
      <div className="relative z-10 flex justify-center pt-2 pb-3">
        {topPlayer ? (
          <PlayerSeat player={topPlayer.player}
            isCurrentTurn={gs?.currentTurnId === topPlayer.player.id}
            isChallenger={gs?.nextPlayerId === topPlayer.player.id && gs?.playState === "waiting_challenge"}
            position="top" />
        ) : (
          <div className="w-14 h-14 rounded-full border-2 border-dashed border-white/10 flex items-center justify-center opacity-30">
            <span className="text-white/30 text-xs">+</span>
          </div>
        )}
      </div>

      {/* ── MIDDLE ROW ─── */}
      <div className="relative z-10 flex items-center justify-between flex-1 px-4 min-h-0">
        {/* Left */}
        <div>
          {leftPlayer ? (
            <PlayerSeat player={leftPlayer.player}
              isCurrentTurn={gs?.currentTurnId === leftPlayer.player.id}
              isChallenger={gs?.nextPlayerId === leftPlayer.player.id && gs?.playState === "waiting_challenge"}
              position="left" />
          ) : <div className="w-14" />}
        </div>

        {/* Table Center */}
        <div className="flex-1 flex items-center justify-center">
          <div className="rounded-full flex items-center justify-center p-6"
            style={{
              width: 180, height: 180,
              background: "radial-gradient(circle, rgba(80,30,30,0.9), rgba(50,10,10,0.95))",
              border: "4px solid rgba(255,255,255,0.08)",
              boxShadow: "0 0 40px rgba(0,0,0,0.8), inset 0 0 30px rgba(0,0,0,0.5)",
            }}>
            <TablePile
              claim={gs?.tableClaim ?? null}
              currentCardType={gs?.currentCardType ?? "Ace"}
              roundNum={gs?.roundNum ?? 1}
            />
          </div>
        </div>

        {/* Right */}
        <div>
          {rightPlayer ? (
            <PlayerSeat player={rightPlayer.player}
              isCurrentTurn={gs?.currentTurnId === rightPlayer.player.id}
              isChallenger={gs?.nextPlayerId === rightPlayer.player.id && gs?.playState === "waiting_challenge"}
              position="right" />
          ) : <div className="w-14" />}
        </div>
      </div>

      {/* ── BOTTOM: YOUR HAND ─── */}
      <div className="relative z-10 pb-3 pt-2">
        {/* My Info Row */}
        <div className="flex items-center justify-between px-4 mb-2">
          <HpDisplay hp={myPlayer?.hp ?? 6} />
          <div className="flex items-center gap-1.5">
            <div className="text-xl">{myChar?.emoji}</div>
            <span className="text-xs font-bold text-white/70">{myPlayer?.name}</span>
            {isMyTurn && <span className="text-[10px] text-pink-400 animate-pulse">دورك!</span>}
          </div>
          <div className="text-xs text-white/30">{selectedIds.size > 0 ? `${selectedIds.size} مختارة` : ""}</div>
        </div>

        {/* Hand */}
        <div className="flex justify-center gap-2 px-4 overflow-x-auto pb-1">
          {myPlayer?.eliminated ? (
            <p className="text-white/30 text-sm py-4">أنت محذوف 💀</p>
          ) : myHand.length === 0 ? (
            <p className="text-white/20 text-xs py-4">جاري توزيع الأوراق...</p>
          ) : (
            myHand.map((card, i) => (
              <CardFace key={card.id} card={card}
                selected={selectedIds.has(card.id)}
                onClick={() => isMyTurn && toggleCard(card.id)}
                suitIdx={i} />
            ))
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 justify-center px-4 mt-3">
          {isMyTurn && (
            <motion.button
              onClick={playCards}
              disabled={selectedIds.size === 0}
              whileHover={selectedIds.size > 0 ? { scale: 1.05 } : {}}
              whileTap={selectedIds.size > 0 ? { scale: 0.97 } : {}}
              className="px-6 py-2.5 rounded-xl font-black text-sm text-white"
              style={{
                background: selectedIds.size > 0 ? "linear-gradient(135deg, #e040fb, #9c27b0)" : "rgba(255,255,255,0.05)",
                color: selectedIds.size > 0 ? "#fff" : "rgba(255,255,255,0.2)",
                boxShadow: selectedIds.size > 0 ? "0 0 20px #e040fb40" : "none",
              }}>
              العب ({selectedIds.size}) [E]
            </motion.button>
          )}
          {isMyChallengeTurn && challenge && (
            <>
              <motion.button onClick={callBluff}
                whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                animate={{ boxShadow: ["0 0 10px #f43f5e40", "0 0 25px #f43f5e", "0 0 10px #f43f5e40"] }}
                transition={{ duration: 1, repeat: Infinity }}
                className="px-5 py-2.5 rounded-xl font-black text-sm text-white"
                style={{ background: "linear-gradient(135deg, #f43f5e, #be123c)" }}>
                🔫 كاذب! [Space]
              </motion.button>
              <motion.button onClick={passChallenge}
                whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                className="px-5 py-2.5 rounded-xl font-black text-sm text-white/70 border border-white/20"
                style={{ background: "rgba(255,255,255,0.05)" }}>
                تمرير [P]
              </motion.button>
            </>
          )}
        </div>
      </div>

      {/* ── OVERLAYS ─── */}

      {/* Challenge notification */}
      <AnimatePresence>
        {challenge && !isMyChallengeTurn && (
          <motion.div key="challbar"
            initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
            className="absolute top-14 inset-x-0 flex justify-center z-30 pointer-events-none">
            <div className="px-4 py-2 rounded-full text-sm font-bold text-white"
              style={{ background: "rgba(244,63,94,0.85)", border: "1px solid #f43f5e80" }}>
              🃏 {challenge.claim.playerName} ادّعى {challenge.claim.count}× {challenge.claim.cardType}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bluff Reveal overlay */}
      <AnimatePresence>
        {reveal && (
          <motion.div key="reveal"
            initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}
            className="absolute inset-0 z-50 flex items-center justify-center"
            style={{ background: "rgba(0,0,0,0.85)" }}>
            <div className="flex flex-col items-center gap-4 text-center px-6">
              <h3 className="text-xl font-black text-white">{reveal.accusedName} ادّعى {reveal.claim.count}× {reveal.claim.cardType}</h3>
              <div className="flex gap-2 justify-center">
                {reveal.cards.map((c, i) => (
                  <motion.div key={c.id}
                    initial={{ rotateY: 180 }} animate={{ rotateY: 0 }}
                    transition={{ delay: i * 0.2 }}>
                    <CardFace card={c} suitIdx={i} />
                  </motion.div>
                ))}
              </div>
              {reveal.isBluff ? (
                <div className="text-2xl font-black text-red-400">💥 كان يكذب! — {reveal.accusedName} يطلق على نفسه!</div>
              ) : (
                <div className="text-2xl font-black text-green-400">✅ كان صادقاً! — {reveal.challengerName} يطلق على نفسه!</div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div key="toast"
            initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 40 }}
            className="absolute bottom-32 inset-x-0 flex justify-center z-40 pointer-events-none">
            <div className="px-5 py-2 rounded-full text-sm font-bold text-white max-w-xs text-center"
              style={{ background: "rgba(14,4,40,0.95)", border: "1px solid rgba(224,64,251,0.4)" }}>
              {toast}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
