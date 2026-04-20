import { useState, useRef, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";

// ─── YouTube loader ────────────────────────────────────────────────────────────
declare global {
  interface Window { YT: any; onYouTubeIframeAPIReady?: () => void; _ytReady?: boolean }
}
let _ytP: Promise<void> | null = null;
function loadYT(): Promise<void> {
  if (_ytP) return _ytP;
  _ytP = new Promise(res => {
    if (window._ytReady && window.YT?.Player) { res(); return; }
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { window._ytReady = true; prev?.(); res(); };
    if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
      const s = document.createElement("script"); s.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(s);
    }
  });
  return _ytP;
}

// ─── Twitch photo ─────────────────────────────────────────────────────────────
async function fetchTwitchPhoto(username: string): Promise<string> {
  try {
    const res = await fetch(`https://api.ivr.fi/v2/twitch/user?login=${username}`);
    const data = await res.json();
    const u = Array.isArray(data) ? data[0] : data?.data?.[0];
    const url = u?.profileImageURL ?? u?.logo ?? u?.profile_image_url;
    if (url) return url.replace("{width}", "150").replace("{height}", "150");
  } catch {}
  return `https://unavatar.io/twitch/${username}`;
}

// ─── Songs ────────────────────────────────────────────────────────────────────
interface Song { id: string; title: string; artist: string; start: number }
const SONGS: Song[] = [
  { id: "joevqtOJFes", title: "يا طير",        artist: "راشد الماجد",  start: 25 },
  { id: "_nSq4Mtlfno", title: "ندمان",           artist: "نبيل شعيل",    start: 30 },
  { id: "5Gi9Q9P0bVI", title: "يا عمري انا",    artist: "فرقة ميامي",   start: 24 },
  { id: "QUBvVTNRp4Q", title: "بشرة خير",       artist: "حسين الجسمي",  start: 30 },
  { id: "KLJA-srM_yM", title: "نور العين",       artist: "عمرو دياب",    start: 25 },
  { id: "EgmXTmj62ic", title: "تملى معاك",      artist: "عمرو دياب",    start: 35 },
  { id: "a_vfYHbLr7Y", title: "وغلاوتك",        artist: "عمرو دياب",    start: 30 },
  { id: "qzcIKpmEBHo", title: "أخاصمك آه",      artist: "نانسي عجرم",   start: 20 },
  { id: "1nlzrBWh0H8", title: "يا سلام",         artist: "نانسي عجرم",   start: 22 },
  { id: "UFn1-pTQ85s", title: "من نظرة",        artist: "نانسي عجرم",   start: 18 },
  { id: "iOP9PYLICK8", title: "بدنا نولع الجو", artist: "نانسي عجرم",   start: 18 },
  { id: "jHEYg6VZoOw", title: "يللا",           artist: "نانسي عجرم",   start: 15 },
  { id: "WlqefHeYYR0", title: "يا نور العين",    artist: "مطرف المطرف",  start: 32 },
  { id: "z6RC2T3Q7rs", title: "قمرين",           artist: "عمرو دياب",    start: 28 },
  { id: "D_hH-bn5dD0", title: "أنا يللي بحبك",  artist: "نانسي عجرم",   start: 22 },
  { id: "YRadUqAv7i8", title: "إحساس جديد",     artist: "نانسي عجرم",   start: 22 },
  { id: "dNQMH3WVMNs", title: "قلبي يا قلبي",   artist: "نانسي عجرم",   start: 18 },
  { id: "vZ0OFwpvIv0", title: "شيخ الشباب",     artist: "نانسي عجرم",   start: 20 },
];
const CLIP_DURATIONS = [10, 15, 20, 22] as const;

// ─── Types ────────────────────────────────────────────────────────────────────
type Phase = "lobby" | "spinning" | "selecting" | "elimination" | "winner";
interface Player { username: string; displayName: string; avatar: string }

// ─── Geometry ─────────────────────────────────────────────────────────────────
const TOTAL      = 600;   // SVG/container size
const CX         = 300;   // center
const CY         = 300;
const DISC_R     = 224;   // disc radius
const PLAYER_R   = 284;   // players outside disc
const CHAIR_R_IN = 128;   // chairs inside disc ring
const SELECT_S   = 20;

// ─── Colors (matching reference images exactly) ───────────────────────────────
const CYAN       = "#00d4ff";
const CYAN_GLOW  = "rgba(0,212,255,0.45)";
const DISC_FILL  = "#0c1628";
const PAGE_BG    = "linear-gradient(135deg, #0a0e1a 0%, #0f1a2e 60%, #0a0e1a 100%)";

// ─── Chair SVG icon — sofa shape matching reference ──────────────────────────
function ChairSVG({ size = 40 }: { size?: number }) {
  const s = size / 40;
  return (
    <svg width={size} height={Math.round(size * 0.78)} viewBox="0 0 40 31"
      style={{ filter: `drop-shadow(0 0 5px ${CYAN})`, overflow: "visible" }}>
      {/* Backrest */}
      <rect x="6" y="0" width="28" height="13" rx="4.5"
        fill="rgba(0,212,255,0.13)" stroke={CYAN} strokeWidth={1.8} />
      {/* Left armrest */}
      <rect x="1" y="10" width="7" height="14" rx="3.5"
        fill="rgba(0,212,255,0.13)" stroke={CYAN} strokeWidth={1.8} />
      {/* Right armrest */}
      <rect x="32" y="10" width="7" height="14" rx="3.5"
        fill="rgba(0,212,255,0.13)" stroke={CYAN} strokeWidth={1.8} />
      {/* Seat cushion */}
      <rect x="6" y="12" width="28" height="13" rx="4.5"
        fill="rgba(0,212,255,0.13)" stroke={CYAN} strokeWidth={1.8} />
      {/* Legs */}
      <line x1="10" y1="25" x2="10" y2="31" stroke={CYAN} strokeWidth={1.8} strokeLinecap="round" />
      <line x1="30" y1="25" x2="30" y2="31" stroke={CYAN} strokeWidth={1.8} strokeLinecap="round" />
    </svg>
  );
}

// ─── Volume slider — horizontal, matches reference image ─────────────────────
function VolumeSlider({ vol, onChange }: { vol: number; onChange: (v: number) => void }) {
  return (
    <div style={{
      position: "absolute", top: 18, left: 18, zIndex: 30,
      display: "flex", alignItems: "center", gap: 10,
      background: "rgba(8,18,38,0.80)", borderRadius: 24,
      padding: "7px 16px", direction: "rtl",
      border: "1px solid rgba(0,212,255,0.25)",
      boxShadow: "0 2px 16px rgba(0,0,0,0.4)",
    }}>
      <span style={{ color: CYAN, fontSize: 15 }}>♫</span>
      <input
        type="range" min={0} max={100} value={vol}
        onChange={e => onChange(+e.target.value)}
        style={{
          width: 110, direction: "ltr", accentColor: CYAN,
          cursor: "pointer", outline: "none", border: "none",
          background: "transparent",
        }}
      />
      <span style={{
        color: CYAN, fontSize: 12, fontWeight: 700,
        fontFamily: "'Cairo','Arial',sans-serif", whiteSpace: "nowrap",
      }}>مستوى الصوت</span>
    </div>
  );
}

// ─── Back button — minimal, top-right ─────────────────────────────────────────
function BackBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick}
      style={{
        position: "absolute", top: 18, right: 18, zIndex: 30,
        background: "rgba(8,18,38,0.75)", border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 16, padding: "6px 14px",
        color: "rgba(255,255,255,0.55)", fontSize: 12, fontWeight: 700,
        cursor: "pointer", fontFamily: "'Cairo','Arial',sans-serif",
      }}>
      ← رجوع
    </button>
  );
}

// ─── Dot grid for disc interior ───────────────────────────────────────────────
function DotGrid() {
  return (
    <defs>
      <pattern id="cg" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
        <circle cx="10" cy="10" r="1" fill="rgba(0,212,255,0.12)" />
      </pattern>
      <clipPath id="discClip">
        <circle cx={CX} cy={CY} r={DISC_R - 2} />
      </clipPath>
    </defs>
  );
}

// ─── Lobby card ───────────────────────────────────────────────────────────────
function LobbyScreen({ players, onStart }: { players: Player[]; onStart: () => void }) {
  return (
    <div style={{
      position: "absolute", inset: 0, display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", gap: 24,
      fontFamily: "'Cairo','Arial',sans-serif", direction: "rtl",
    }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 52, fontWeight: 900, color: "#fff",
          textShadow: `0 0 30px ${CYAN}` }}>
          اكتب{" "}
          <span style={{ color: CYAN, textShadow: `0 0 20px ${CYAN}` }}>join</span>
          {" "}في الشات
        </div>
        <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 14, fontWeight: 600, marginTop: 6 }}>
          لعبة الكراسي الموسيقية 🪑
        </div>
      </div>

      <div style={{
        background: "rgba(0,212,255,0.06)", border: `1.5px solid rgba(0,212,255,0.25)`,
        borderRadius: 20, padding: "16px 24px", minWidth: 320,
      }}>
        {players.length === 0 ? (
          <div style={{ textAlign: "center", color: "rgba(255,255,255,0.45)", fontSize: 14 }}>
            في انتظار المشاركين...
          </div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center" }}>
            {players.map(p => (
              <div key={p.username} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <img src={p.avatar} alt={p.displayName}
                  style={{ width: 46, height: 46, borderRadius: "50%", objectFit: "cover",
                    border: `2.5px solid ${CYAN}`, boxShadow: `0 0 10px ${CYAN}60` }}
                  onError={e => { (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${p.username}`; }} />
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.8)", fontWeight: 700,
                  maxWidth: 50, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {p.displayName}
                </span>
              </div>
            ))}
          </div>
        )}
        <div style={{ textAlign: "center", marginTop: 10, color: CYAN, fontSize: 13, fontWeight: 700 }}>
          {players.length} لاعب
        </div>
      </div>

      <button
        onClick={onStart}
        disabled={players.length < 2}
        style={{
          padding: "16px 60px", borderRadius: 16, fontFamily: "'Cairo','Arial',sans-serif",
          fontSize: 18, fontWeight: 900,
          background: players.length >= 2
            ? `linear-gradient(135deg, ${CYAN}, #0099bb)`
            : "rgba(255,255,255,0.08)",
          color: players.length >= 2 ? "#000" : "rgba(255,255,255,0.3)",
          border: "none", cursor: players.length >= 2 ? "pointer" : "not-allowed",
          boxShadow: players.length >= 2 ? `0 6px 28px ${CYAN}60` : "none",
        }}>
        {players.length >= 2 ? `ابدأ اللعبة (${players.length} لاعبين)` : "انتظر اللاعبين..."}
      </button>
    </div>
  );
}

// ─── Main game disc ───────────────────────────────────────────────────────────
function GameDisc({
  phase, players, numChairs, chairOccupied, selTimer, eliminated, winner, roundNum,
}: {
  phase: Phase; players: Player[]; numChairs: number;
  chairOccupied: Record<number, Player>; selTimer: number;
  eliminated: Player | null; winner: Player | null; roundNum: number;
}) {
  // Chair positions inside disc
  const chairPositions = Array.from({ length: numChairs }, (_, i) => {
    const a = (i / numChairs) * 2 * Math.PI - Math.PI / 2;
    return { num: i + 1, x: CX + CHAIR_R_IN * Math.cos(a), y: CY + CHAIR_R_IN * Math.sin(a) };
  });

  // Player positions outside disc
  const playerPositions = players.map((p, i) => {
    const a = (i / players.length) * 2 * Math.PI - Math.PI / 2;
    return { player: p, x: CX + PLAYER_R * Math.cos(a), y: CY + PLAYER_R * Math.sin(a) };
  });

  const isSpinning  = phase === "spinning";
  const isSelecting = phase === "selecting";

  return (
    <div style={{ width: TOTAL, height: TOTAL, position: "relative", flexShrink: 0 }}>
      {/* ── SVG disc layer ── */}
      <svg width={TOTAL} height={TOTAL} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
        <DotGrid />

        {/* Outer glow ring */}
        <circle cx={CX} cy={CY} r={DISC_R + 6}
          fill="none" stroke={CYAN_GLOW} strokeWidth={12} />

        {/* Disc fill */}
        <circle cx={CX} cy={CY} r={DISC_R} fill={DISC_FILL} />

        {/* Dot grid inside disc */}
        <rect x={CX - DISC_R} y={CY - DISC_R}
          width={DISC_R * 2} height={DISC_R * 2}
          fill="url(#cg)" clipPath="url(#discClip)" />

        {/* Disc border */}
        <circle cx={CX} cy={CY} r={DISC_R}
          fill="none" stroke={CYAN} strokeWidth={3} />

        {/* ── SPINNING center ── */}
        {isSpinning && (
          <g>
            {/* Music note */}
            <text x={CX} y={CY - 10} textAnchor="middle" fontSize={68}
              fill={CYAN} style={{ filter: `drop-shadow(0 0 14px ${CYAN})` }}>♫</text>
            {/* "الموسيقى تعمل..." */}
            <text x={CX} y={CY + 50} textAnchor="middle" fontSize={18}
              fontWeight="700" fill={CYAN}
              fontFamily="Cairo,Arial,sans-serif"
              style={{ filter: `drop-shadow(0 0 8px ${CYAN})` }}>
              الموسيقى تعمل...
            </text>
          </g>
        )}

        {/* ── SELECTING center — big countdown ── */}
        {isSelecting && (
          <g>
            <text x={CX} y={CY + 22} textAnchor="middle" fontSize={100}
              fontWeight="900" fill={CYAN}
              fontFamily="Cairo,Arial,sans-serif"
              style={{ filter: `drop-shadow(0 0 20px ${CYAN})` }}>
              {selTimer}
            </text>
          </g>
        )}

        {/* ── ELIMINATION center ── */}
        {phase === "elimination" && eliminated && (
          <g>
            <text x={CX} y={CY - 30} textAnchor="middle" fontSize={42}
              fill="#f87171" fontFamily="Cairo,Arial,sans-serif" fontWeight="900">
              خرج!
            </text>
            <text x={CX} y={CY + 24} textAnchor="middle" fontSize={22}
              fill="#f87171" fontFamily="Cairo,Arial,sans-serif" fontWeight="700">
              {eliminated.displayName}
            </text>
          </g>
        )}

        {/* ── WINNER center ── */}
        {phase === "winner" && winner && (
          <g>
            <text x={CX} y={CY - 40} textAnchor="middle" fontSize={44}
              fill={CYAN} fontFamily="Cairo,Arial,sans-serif" fontWeight="900"
              style={{ filter: `drop-shadow(0 0 16px ${CYAN})` }}>
              🏆
            </text>
            <text x={CX} y={CY + 10} textAnchor="middle" fontSize={26}
              fill={CYAN} fontFamily="Cairo,Arial,sans-serif" fontWeight="900"
              style={{ filter: `drop-shadow(0 0 12px ${CYAN})` }}>
              الفائز!
            </text>
            <text x={CX} y={CY + 44} textAnchor="middle" fontSize={18}
              fill="#fff" fontFamily="Cairo,Arial,sans-serif" fontWeight="700">
              {winner.displayName}
            </text>
          </g>
        )}

        {/* ── Bottom instruction text inside disc ── */}
        {(isSpinning || isSelecting) && (
          <text x={CX} y={CY + DISC_R - 30} textAnchor="middle" fontSize={15}
            fontWeight="700" fill={CYAN}
            fontFamily="Cairo,Arial,sans-serif"
            style={{ filter: `drop-shadow(0 0 6px ${CYAN})` }}>
            {isSpinning ? "اكتب اقرب كرسي" : "اكتب رقم الكرسي"}
          </text>
        )}

        {/* ── Round indicator (spinning) ── */}
        {isSpinning && (
          <text x={CX} y={CY - DISC_R + 36} textAnchor="middle" fontSize={13}
            fill="rgba(0,212,255,0.65)" fontFamily="Cairo,Arial,sans-serif" fontWeight="700">
            جولة {roundNum}
          </text>
        )}
      </svg>

      {/* ── Players outside disc (HTML overlaid) ── */}
      {playerPositions.map(({ player: p, x, y }) => {
        const eliminated_p = phase === "elimination" && eliminated?.username === p.username;
        const isWinner_p   = phase === "winner" && winner?.username === p.username;
        return (
          <div key={p.username} style={{
            position: "absolute",
            left: x - 28, top: y - 36,
            width: 56, height: 70,
            display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
            opacity: eliminated_p ? 0.22 : 1,
            transition: "opacity 0.4s",
          }}>
            <div style={{
              width: 50, height: 50, borderRadius: "50%", overflow: "hidden",
              border: `2.5px solid ${isWinner_p ? "#fbbf24" : CYAN}`,
              boxShadow: `0 0 ${isWinner_p ? 20 : 10}px ${isWinner_p ? "#fbbf24" : CYAN}80`,
            }}>
              <img src={p.avatar} alt={p.displayName}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                onError={e => { (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${p.username}`; }} />
            </div>
            <span style={{
              fontSize: 10, fontWeight: 800, color: "#fff",
              textShadow: "0 1px 4px rgba(0,0,0,0.9)",
              maxWidth: 56, overflow: "hidden", textOverflow: "ellipsis",
              whiteSpace: "nowrap", textAlign: "center",
              fontFamily: "'Cairo','Arial',sans-serif",
            }}>
              {p.displayName}
            </span>
          </div>
        );
      })}

      {/* ── Chairs inside disc (HTML overlaid, shown only in selecting/elimination) ── */}
      {(isSelecting || phase === "elimination") && chairPositions.map(({ num, x, y }) => {
        const seated = chairOccupied[num];
        return (
          <motion.div key={num}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: (num - 1) * 0.04, type: "spring", stiffness: 400, damping: 24 }}
            style={{
              position: "absolute",
              left: x - 22, top: y - 42,
              display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
            }}>
            {/* Chair icon or occupied player avatar */}
            {seated ? (
              <div style={{
                width: 40, height: 40, borderRadius: "50%", overflow: "hidden",
                border: `2.5px solid ${CYAN}`,
                boxShadow: `0 0 14px ${CYAN}`,
              }}>
                <img src={seated.avatar} alt={seated.displayName}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  onError={e => { (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${seated.username}`; }} />
              </div>
            ) : (
              <ChairSVG size={38} />
            )}
            {/* Number box below chair */}
            <div style={{
              background: "rgba(8,18,38,0.88)",
              border: `1.5px solid ${CYAN}`,
              borderRadius: 6, padding: "2px 8px", minWidth: 26,
              textAlign: "center",
              boxShadow: `0 0 6px ${CYAN}50`,
            }}>
              <span style={{
                color: "#fff", fontSize: 12, fontWeight: 800,
                fontFamily: "'Cairo','Arial',sans-serif",
              }}>{num}</span>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function ChairsGame() {
  const [, navigate]  = useLocation();
  const { user }      = useAuth();

  const [phase, setPhase]                 = useState<Phase>("lobby");
  const [players, setPlayers]             = useState<Player[]>([]);
  const [roundNum, setRoundNum]           = useState(1);
  const [chairOccupied, setChairOccupied] = useState<Record<number, Player>>({});
  const [eliminated, setEliminated]       = useState<Player | null>(null);
  const [winner, setWinner]               = useState<Player | null>(null);
  const [selTimer, setSelTimer]           = useState(SELECT_S);
  const [volume, setVolume]               = useState(80);

  const phaseRef   = useRef<Phase>("lobby");
  const playersRef = useRef<Player[]>([]);
  const chairRef   = useRef<Record<number, Player>>({});
  const ytRef      = useRef<any>(null);
  const ytDivRef   = useRef<HTMLDivElement>(null);
  const songIdxRef = useRef(0);
  const connRef    = useRef(false);

  const selInt  = useRef<ReturnType<typeof setInterval> | null>(null);
  const clipInt = useRef<ReturnType<typeof setInterval> | null>(null);
  const cdInt   = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { playersRef.current = players; }, [players]);
  useEffect(() => { chairRef.current = chairOccupied; }, [chairOccupied]);

  const numChairs = Math.max(players.length - 1, 1);

  const clrAll = () => {
    [selInt, clipInt, cdInt].forEach(r => { if (r.current) { clearInterval(r.current); r.current = null; } });
  };

  const changeVolume = useCallback((v: number) => {
    setVolume(v);
    try { ytRef.current?.setVolume(v); } catch {}
  }, []);

  // YouTube setup
  useEffect(() => {
    loadYT().then(() => {
      if (!ytDivRef.current || ytRef.current) return;
      ytRef.current = new window.YT.Player(ytDivRef.current, {
        width: "1", height: "1",
        playerVars: { autoplay: 0, controls: 0, fs: 0, modestbranding: 1, rel: 0, playsinline: 1 },
        events: { onReady: () => { try { ytRef.current?.setVolume(volume); } catch {} } },
      });
    });
    return () => { clrAll(); try { ytRef.current?.destroy(); } catch {}; ytRef.current = null; };
  }, []);

  const playMusic = useCallback(() => {
    const shuffled = [...SONGS].sort(() => Math.random() - 0.5);
    const s = shuffled[songIdxRef.current % SONGS.length];
    songIdxRef.current++;
    try { ytRef.current?.loadVideoById({ videoId: s.id, startSeconds: s.start }); } catch {}
    try { ytRef.current?.setVolume(volume); } catch {}
  }, [volume]);

  const stopMusic = useCallback(() => {
    try { ytRef.current?.pauseVideo(); } catch {}
  }, []);

  // Eliminate & auto-advance
  const doEliminate = useCallback(() => {
    clrAll();
    const cur = playersRef.current;
    const occ = chairRef.current;
    const sat = new Set(Object.values(occ).map(p => p.username));
    const out = cur.filter(p => !sat.has(p.username));
    const eli = out[Math.floor(Math.random() * out.length)] ?? null;
    setEliminated(eli);
    phaseRef.current = "elimination"; setPhase("elimination");

    // Auto-advance after 3 seconds
    let cd = 3;
    cdInt.current = setInterval(() => {
      cd--;
      if (cd <= 0) {
        clearInterval(cdInt.current!); cdInt.current = null;
        const rem = playersRef.current.filter(p => p.username !== eli?.username);
        playersRef.current = rem;
        if (rem.length <= 1) {
          setWinner(rem[0] ?? null);
          setPlayers(rem);
          phaseRef.current = "winner"; setPhase("winner");
        } else {
          setPlayers(rem);
          setRoundNum(r => r + 1);
          setTimeout(() => startRound(rem), 100);
        }
      }
    }, 1000);
  }, []);

  const stopSpin = useCallback(() => {
    clrAll(); stopMusic();
    setChairOccupied({}); chairRef.current = {};
    phaseRef.current = "selecting"; setPhase("selecting");
    let t = SELECT_S; setSelTimer(t);
    selInt.current = setInterval(() => {
      t--; setSelTimer(t);
      if (t <= 0) { clearInterval(selInt.current!); selInt.current = null; doEliminate(); }
    }, 1000);
  }, [stopMusic, doEliminate]);

  const startRound = (pl: Player[]) => {
    if (pl.length < 2) return;
    clrAll();
    setChairOccupied({}); chairRef.current = {};
    setEliminated(null);
    phaseRef.current = "spinning"; setPhase("spinning");
    playMusic();
    const dur = CLIP_DURATIONS[Math.floor(Math.random() * CLIP_DURATIONS.length)];
    let t = dur;
    clipInt.current = setInterval(() => {
      t--;
      if (t <= 0) { clearInterval(clipInt.current!); clipInt.current = null; stopSpin(); }
    }, 1000);
  };

  const handleStart = useCallback(() => {
    const pl = playersRef.current;
    if (pl.length < 2) return;
    startRound(pl);
  }, []);

  const handleChat = useCallback((username: string, text: string) => {
    const msg = text.trim().toLowerCase();
    const ph  = phaseRef.current;
    const pl  = playersRef.current;

    if (msg === "join" && ph === "lobby") {
      if (pl.some(p => p.username === username)) return;
      const np: Player = { username, displayName: username, avatar: `https://unavatar.io/twitch/${username}` };
      setPlayers(prev => { const n = [...prev, np]; playersRef.current = n; return n; });
      fetchTwitchPhoto(username).then(url =>
        setPlayers(prev => { const n = prev.map(p => p.username === username ? { ...p, avatar: url } : p); playersRef.current = n; return n; })
      );
      return;
    }

    if (ph === "selecting") {
      const num = parseInt(msg, 10);
      const occ = chairRef.current; const cur = playersRef.current;
      if (isNaN(num) || num < 1 || num > cur.length - 1) return;
      if (occ[num]) return;
      const p = cur.find(x => x.username === username); if (!p) return;
      if (Object.values(occ).some(x => x.username === username)) return;
      setChairOccupied(prev => {
        const n = { ...prev, [num]: p }; chairRef.current = n;
        if (Object.keys(n).length >= cur.length - 1) setTimeout(() => doEliminate(), 500);
        return n;
      });
    }
  }, [doEliminate]);

  // Twitch IRC
  if (!connRef.current && user?.username) {
    connRef.current = true;
    setTimeout(() => {
      const ws = new WebSocket("wss://irc-ws.chat.twitch.tv");
      ws.onopen = () => {
        ws.send("PASS SCHMOOPIIE");
        ws.send(`NICK justinfan${Math.floor(Math.random() * 89999) + 10000}`);
        ws.send(`JOIN #${user.username.toLowerCase()}`);
      };
      ws.onmessage = e => {
        for (const line of (e.data as string).split("\r\n").filter(Boolean)) {
          if (line.startsWith("PING")) { ws.send("PONG :tmi.twitch.tv"); continue; }
          const m = line.match(/^(?:@[^ ]+ )?:(\w+)!\w+@\w+\.tmi\.twitch\.tv PRIVMSG #\w+ :(.+)$/);
          if (m) handleChat(m[1], m[2].trim());
        }
      };
    }, 80);
  }

  const handleBack = () => { clrAll(); stopMusic(); navigate("/"); };

  const isPlaying = phase !== "lobby";

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{
      width: "100%", height: "100vh", overflow: "hidden", position: "relative",
      background: PAGE_BG, fontFamily: "'Cairo','Arial',sans-serif",
    }}>
      {/* Hidden YouTube player */}
      <div style={{ position: "absolute", opacity: 0, pointerEvents: "none", width: 1, height: 1 }}>
        <div ref={ytDivRef} />
      </div>

      {/* Volume slider — always visible */}
      <VolumeSlider vol={volume} onChange={changeVolume} />

      {/* Back button */}
      <BackBtn onClick={handleBack} />

      {/* ── LOBBY ── */}
      {!isPlaying && (
        <LobbyScreen players={players} onStart={handleStart} />
      )}

      {/* ── GAME DISC — centered, all play phases ── */}
      {isPlaying && (
        <div style={{
          position: "absolute", inset: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <GameDisc
            phase={phase}
            players={players}
            numChairs={numChairs}
            chairOccupied={chairOccupied}
            selTimer={selTimer}
            eliminated={eliminated}
            winner={winner}
            roundNum={roundNum}
          />
        </div>
      )}

      {/* Winner — back to lobby button */}
      {phase === "winner" && (
        <div style={{
          position: "absolute", bottom: 40, left: "50%", transform: "translateX(-50%)",
          display: "flex", gap: 16,
        }}>
          <button onClick={() => {
            clrAll(); stopMusic();
            setPlayers([]); playersRef.current = [];
            setChairOccupied({}); chairRef.current = {};
            setEliminated(null); setWinner(null);
            setRoundNum(1); setPhase("lobby"); phaseRef.current = "lobby";
          }} style={{
            padding: "12px 36px", borderRadius: 14, fontSize: 15, fontWeight: 900,
            background: `linear-gradient(135deg, ${CYAN}, #0099bb)`,
            color: "#000", border: "none", cursor: "pointer",
            fontFamily: "'Cairo','Arial',sans-serif",
            boxShadow: `0 4px 20px ${CYAN}60`,
          }}>
            العب مجدداً
          </button>
          <button onClick={handleBack} style={{
            padding: "12px 28px", borderRadius: 14, fontSize: 14, fontWeight: 700,
            background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.6)",
            border: "1px solid rgba(255,255,255,0.15)", cursor: "pointer",
            fontFamily: "'Cairo','Arial',sans-serif",
          }}>
            الرئيسية
          </button>
        </div>
      )}
    </div>
  );
}
