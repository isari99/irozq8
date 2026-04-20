import { useState, useRef, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Wifi, WifiOff, Users, RotateCcw, Music2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

// ─── YouTube IFrame API ───────────────────────────────────────────────────────
declare global {
  interface Window { YT: any; onYouTubeIframeAPIReady?: () => void; _ytReady?: boolean }
}
let _ytPromise: Promise<void> | null = null;
function loadYT(): Promise<void> {
  if (_ytPromise) return _ytPromise;
  _ytPromise = new Promise(res => {
    if (window._ytReady && window.YT?.Player) { res(); return; }
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { window._ytReady = true; prev?.(); res(); };
    if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
      const s = document.createElement("script"); s.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(s);
    }
  });
  return _ytPromise;
}

// ─── Song List ────────────────────────────────────────────────────────────────
interface Song { id: string; title: string; artist: string; start: number }
const SONGS: Song[] = [
  // راشد الماجد
  { id: "joevqtOJFes", title: "يا طير خذ قلبي",    artist: "راشد الماجد",        start: 25 },
  { id: "5zvgBPuFYUs", title: "وش جاه",             artist: "راشد الماجد",        start: 20 },
  { id: "P8L-CiWNQHk", title: "ابشر",               artist: "راشد الماجد",        start: 22 },
  { id: "lGWALLSMDuU", title: "سارق القلب",          artist: "راشد الماجد",        start: 18 },
  { id: "N5Ql2rfsEFk", title: "هلا بالي",           artist: "راشد الماجد",        start: 24 },
  // نبيل شعيل
  { id: "_nSq4Mtlfno", title: "ندمان",               artist: "نبيل شعيل",           start: 30 },
  { id: "F3m2VJZF9bE", title: "عطوه جوه",           artist: "نبيل شعيل",           start: 22 },
  // اصاله
  { id: "MwPTnHcBNvs", title: "غلبان",              artist: "أصالة",               start: 20 },
  { id: "rVN7WKqEgio", title: "نار حقدك",           artist: "أصالة",               start: 25 },
  { id: "Qa_RaLl9NB0", title: "ماعرفتك",            artist: "أصالة",               start: 22 },
  { id: "H0FmPkCHNJI", title: "بنت اكابر",          artist: "أصالة",               start: 18 },
  // اصيل هميم
  { id: "A2xDp45B6BA", title: "سر الحياة",          artist: "أصيل هميم",           start: 24 },
  { id: "kVfNJp63v4A", title: "انت السعادة",         artist: "أصيل هميم",           start: 20 },
  { id: "GFMVPlCodOk", title: "خلك بحر",            artist: "أصيل هميم",           start: 22 },
  // شرين
  { id: "pD1oDSStjKs", title: "اللي يقابل حبيبي",   artist: "شرين",                start: 28 },
  { id: "q8P3WmdcPTo", title: "قلة النوم",           artist: "شرين",                start: 20 },
  // رحمه رياض
  { id: "B3cEbHrKOsI", title: "اصعد القمر",         artist: "رحمة رياض",           start: 22 },
  // نانسي عجرم
  { id: "UFn1-pTQ85s", title: "من نظرة",            artist: "نانسي عجرم",          start: 18 },
  { id: "qzcIKpmEBHo", title: "أخاصمك آه",          artist: "نانسي عجرم",          start: 20 },
  { id: "1nlzrBWh0H8", title: "يا سلام",             artist: "نانسي عجرم",          start: 22 },
  { id: "iOP9PYLICK8", title: "بدنا نولع الجو",     artist: "نانسي عجرم",          start: 18 },
  { id: "jHEYg6VZoOw", title: "يللا",               artist: "نانسي عجرم",          start: 15 },
  { id: "jEGnvYKH18A", title: "لون عيونك",          artist: "نانسي عجرم",          start: 20 },
  { id: "cnxrq_ZOcoY", title: "ابن الجيران",         artist: "نانسي عجرم",          start: 15 },
  { id: "D_hH-bn5dD0", title: "أنا يللي بحبك",      artist: "نانسي عجرم",          start: 22 },
  // حسام الرسام
  { id: "dEzf5vCd-Eo", title: "اذا عديت نجم الليل", artist: "حسام الرسام",         start: 25 },
  // بدر الشعيبي
  { id: "fRCVFnF2aqo", title: "واويلاه",             artist: "بدر الشعيبي",         start: 20 },
  { id: "mT1_dXFlC4k", title: "برافو عليك",         artist: "بدر الشعيبي",         start: 22 },
  // عمرو دياب
  { id: "KLJA-srM_yM", title: "نور العين",           artist: "عمرو دياب",           start: 25 },
  { id: "EgmXTmj62ic", title: "تملى معاك",          artist: "عمرو دياب",           start: 35 },
  { id: "a_vfYHbLr7Y", title: "وغلاوتك",            artist: "عمرو دياب",           start: 30 },
  // حسين الجسمي
  { id: "QUBvVTNRp4Q", title: "بشرة خير",           artist: "حسين الجسمي",         start: 30 },
  { id: "tZ-mGMW67bM", title: "دق القلب",            artist: "حسين الجسمي",         start: 22 },
  // احمد سعد
  { id: "9cWaJLGm6Vw", title: "طيبة تاني لا",       artist: "أحمد سعد",            start: 20 },
  { id: "NgtEBt1YoZI", title: "مكسرات",              artist: "أحمد سعد",            start: 18 },
  // حمده
  { id: "IHf5xVAaH1Q", title: "مابي مابي",           artist: "حمدة",                start: 22 },
  // فرقة ميامي
  { id: "5Gi9Q9P0bVI", title: "يا عمري انا",        artist: "فرقة ميامي",          start: 24 },
  { id: "XC_bWbUlLkY", title: "الليلة",              artist: "فرقة ميامي",          start: 20 },
  { id: "dpBBgZBFvpk", title: "ياحلوكم",             artist: "فرقة ميامي",          start: 22 },
  // اسماء المنور
  { id: "C-q_BI3y_jg", title: "شسوي",               artist: "أسماء المنور",        start: 20 },
  // مطرف المطرف
  { id: "WlqefHeYYR0", title: "يا نور العين",        artist: "مطرف المطرف",         start: 32 },
  { id: "S_I-GOijmaU", title: "منهك غرام",           artist: "مطرف المطرف",         start: 20 },
  { id: "kkHjRf9O1vQ", title: "لبيه",               artist: "مطرف المطرف",         start: 22 },
  { id: "o7lKMiqv46Y", title: "خساره",               artist: "مطرف المطرف",         start: 18 },
  // عبدالله رويشد
  { id: "gNGhVhFJdZc", title: "الي نساك انساه",     artist: "عبدالله رويشد",       start: 22 },
  { id: "hpHi6Ow7bBc", title: "وين رايح",            artist: "عبدالله رويشد",       start: 20 },
  { id: "GRl_MNFn8VQ", title: "وحشت الدار",         artist: "عبدالله رويشد",       start: 25 },
  { id: "iFQKa0MWXC4", title: "حبيبة قلبي",         artist: "عبدالله رويشد",       start: 22 },
  // عبدالكريم عبدالقادر
  { id: "nvGqHFJMHXs", title: "ارجع يا كل الحب",    artist: "عبدالكريم عبدالقادر", start: 20 },
  { id: "lS8_SzJJm0E", title: "لا لا تروح",         artist: "عبدالكريم عبدالقادر", start: 18 },
  { id: "xMqelzGJPxI", title: "الحب لك وحده",       artist: "عبدالكريم عبدالقادر", start: 22 },
  { id: "kpbFPZQ3Aro", title: "الي يحبك",           artist: "عبدالكريم عبدالقادر", start: 24 },
  // اخرى
  { id: "hcPIbIVBb6o", title: "قيس هشام - إذا عندك قلب", artist: "قيس هشام",     start: 22 },
  { id: "5kRlS6w0gXM", title: "ناري",               artist: "أحمد ستار",           start: 18 },
  { id: "jNzXhxMlJq4", title: "يا غايب",             artist: "فضل شاكر",           start: 25 },
  { id: "E-GMomX2tQA", title: "بعشق روحك",          artist: "مروان خوري",          start: 20 },
  { id: "3Ox_R_Auzr4", title: "سلم",                artist: "سامر أحمد",           start: 22 },
];

// ─── Types ────────────────────────────────────────────────────────────────────
type Phase = "lobby" | "spinning" | "selecting" | "elimination" | "winner";
interface Player { username: string; avatar: string }

const CLIP_DURATIONS = [10, 15, 20] as const;
const GOLD = "#c8860a";
const GOLD_GLOW = "rgba(200,134,10,0.5)";
const BROWN_DARK = "#1a0d05";
const BROWN_MID  = "#2d1a0a";
const SELECT_TIMEOUT = 18; // seconds players have to choose

// ─── Luxury Wheel Component ───────────────────────────────────────────────────
function LuxuryWheel({
  spinning, chairs, chairOccupied, chairCount, onPhase
}: {
  spinning: boolean;
  chairs: boolean;
  chairOccupied: Record<number, Player>;
  chairCount: number;
  onPhase: Phase;
}) {
  const SIZE = 340;
  const cx = SIZE / 2, cy = SIZE / 2;
  const outerR = SIZE / 2 - 8;

  // Chair positions arranged in a circle inside the wheel
  const chairPositions = Array.from({ length: chairCount }, (_, i) => {
    const angle = (i / chairCount) * 2 * Math.PI - Math.PI / 2;
    const r = outerR * 0.58;
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle), num: i + 1 };
  });

  return (
    <div className="relative flex items-center justify-center" style={{ width: SIZE, height: SIZE }}>
      {/* Outer glow ring */}
      <motion.div
        className="absolute rounded-full"
        animate={spinning
          ? { boxShadow: [`0 0 30px ${GOLD_GLOW}, 0 0 60px ${GOLD_GLOW}`, `0 0 50px ${GOLD_GLOW}, 0 0 100px ${GOLD_GLOW}`, `0 0 30px ${GOLD_GLOW}, 0 0 60px ${GOLD_GLOW}`] }
          : { boxShadow: `0 0 24px ${GOLD_GLOW}` }}
        transition={{ duration: 1.5, repeat: Infinity }}
        style={{ inset: 0, borderRadius: "50%", border: `6px solid ${GOLD}` }}
      />

      {/* Spinning decorative ring */}
      <motion.div
        className="absolute rounded-full"
        animate={{ rotate: spinning ? 360 : 0 }}
        transition={spinning
          ? { duration: 10, repeat: Infinity, ease: "linear" }
          : { duration: 1.5, ease: "easeOut" }}
        style={{
          inset: 12, borderRadius: "50%",
          background: `conic-gradient(transparent 0deg, ${GOLD}20 30deg, transparent 60deg, ${GOLD}15 90deg, transparent 120deg, ${GOLD}20 150deg, transparent 180deg, ${GOLD}15 210deg, transparent 240deg, ${GOLD}20 270deg, transparent 300deg, ${GOLD}15 330deg, transparent 360deg)`,
        }}
      />

      {/* Main circle body */}
      <div className="absolute rounded-full overflow-hidden"
        style={{
          inset: 14,
          background: `radial-gradient(circle at 40% 35%, ${BROWN_MID}, ${BROWN_DARK} 70%)`,
          boxShadow: `inset 0 0 40px rgba(0,0,0,0.8), inset 0 0 80px rgba(0,0,0,0.4)`,
        }}>
        {/* Dot pattern */}
        <svg width="100%" height="100%" style={{ position: "absolute", opacity: 0.08 }}>
          <defs>
            <pattern id="dots" x="0" y="0" width="16" height="16" patternUnits="userSpaceOnUse">
              <circle cx="8" cy="8" r="1.5" fill={GOLD} />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#dots)" />
        </svg>
      </div>

      {/* Decorative inner ring */}
      <div className="absolute rounded-full" style={{
        inset: 28,
        border: `1.5px solid ${GOLD}30`,
        borderRadius: "50%",
      }} />
      <div className="absolute rounded-full" style={{
        inset: 42,
        border: `1px solid ${GOLD}15`,
        borderRadius: "50%",
      }} />

      {/* CENTER content */}
      <div className="absolute inset-0 flex items-center justify-center">
        <AnimatePresence mode="wait">
          {!chairs && (
            <motion.div key="music-center"
              initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.7 }}
              className="flex flex-col items-center gap-1.5">
              {spinning ? (
                <>
                  <motion.div
                    animate={{ scale: [1, 1.2, 1], rotate: [0, 10, -10, 0] }}
                    transition={{ duration: 0.8, repeat: Infinity }}
                    style={{ fontSize: 36 }}>🎵</motion.div>
                  <p className="text-xs font-bold" style={{ color: GOLD, textShadow: `0 0 12px ${GOLD}` }}>
                    الموسيقى تعمل...
                  </p>
                </>
              ) : (
                <span style={{ fontSize: 32 }}>🪑</span>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Chair slots */}
      <AnimatePresence>
        {chairs && chairPositions.map(({ x, y, num }) => {
          const player = chairOccupied[num];
          return (
            <motion.div key={num}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: num * 0.07, type: "spring", stiffness: 400, damping: 20 }}
              className="absolute flex flex-col items-center gap-0.5"
              style={{ left: x - 22, top: y - 22, width: 44 }}>
              <div className="w-11 h-11 rounded-xl border-2 overflow-hidden flex items-center justify-center"
                style={{
                  borderColor: player ? GOLD : `${GOLD}30`,
                  background: player ? `${GOLD}18` : `${BROWN_MID}cc`,
                  boxShadow: player ? `0 0 14px ${GOLD_GLOW}` : "none",
                  transition: "all 0.3s",
                }}>
                {player
                  ? <img src={player.avatar} alt={player.username} className="w-full h-full object-cover"
                      onError={e => { (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${player.username}`; }} />
                  : <span className="font-black text-sm" style={{ color: GOLD }}>{num}</span>}
              </div>
              {player && (
                <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="text-[8px] font-bold truncate w-full text-center"
                  style={{ color: GOLD }}>
                  {player.username}
                </motion.span>
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>

      {/* Top diamond ornament */}
      <div className="absolute top-1 left-1/2 -translate-x-1/2">
        <div style={{ width: 12, height: 12, background: GOLD, transform: "rotate(45deg)", boxShadow: `0 0 8px ${GOLD}` }} />
      </div>
      {/* Bottom diamond */}
      <div className="absolute bottom-1 left-1/2 -translate-x-1/2">
        <div style={{ width: 8, height: 8, background: GOLD, transform: "rotate(45deg)", opacity: 0.6 }} />
      </div>
    </div>
  );
}

// ─── Player Card (lobby) ──────────────────────────────────────────────────────
function PlayerCard({ player, index }: { player: Player; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="flex items-center gap-3 p-3 rounded-xl border"
      style={{ background: `${BROWN_MID}80`, borderColor: `${GOLD}20` }}>
      <div className="w-10 h-10 rounded-xl overflow-hidden border-2 flex-shrink-0"
        style={{ borderColor: `${GOLD}50`, boxShadow: `0 0 10px ${GOLD_GLOW}` }}>
        <img src={player.avatar} alt={player.username} className="w-full h-full object-cover"
          onError={e => { (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${player.username}`; }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-bold text-sm text-white/90 truncate">{player.username}</p>
        <p className="text-[10px] opacity-40 truncate" style={{ color: GOLD }}>مستعد للعب</p>
      </div>
      <div className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ background: GOLD, boxShadow: `0 0 6px ${GOLD}` }} />
    </motion.div>
  );
}

// ─── Confetti ─────────────────────────────────────────────────────────────────
const CONFETTI_COLORS = [GOLD, "#e040fb", "#00e5ff", "#22c55e", "#f43f5e", "#fbbf24"];
function Confetti() {
  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      {Array.from({ length: 56 }).map((_, i) => (
        <motion.div key={i} className="absolute rounded-sm"
          style={{
            width: Math.random() * 8 + 5, height: Math.random() * 8 + 5,
            left: `${Math.random() * 100}%`, top: -16,
            background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
          }}
          animate={{ y: ["0vh","110vh"], rotate: [0, (Math.random()>0.5?1:-1)*720], opacity:[1,0.8,0] }}
          transition={{ duration: Math.random()*2.5+1.5, delay: Math.random()*1.5, ease:"linear" }} />
      ))}
    </div>
  );
}

// ─── Countdown ring ───────────────────────────────────────────────────────────
function CountdownRing({ seconds, total }: { seconds: number; total: number }) {
  const r = 18; const circ = 2 * Math.PI * r;
  const dash = circ * (seconds / total);
  return (
    <svg width="48" height="48" viewBox="0 0 48 48">
      <circle cx="24" cy="24" r={r} fill="none" stroke={`${GOLD}20`} strokeWidth="3" />
      <circle cx="24" cy="24" r={r} fill="none" stroke={GOLD} strokeWidth="3"
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        style={{ transform:"rotate(-90deg)", transformOrigin:"center", transition:"stroke-dasharray 0.9s linear" }} />
      <text x="24" y="28" textAnchor="middle" fontSize="13" fontWeight="900" fill={GOLD}>{seconds}</text>
    </svg>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function ChairsGame() {
  const [, navigate] = useLocation();
  const { user } = useAuth();

  const [phase, setPhase]           = useState<Phase>("lobby");
  const [players, setPlayers]       = useState<Player[]>([]);
  const [roundNum, setRoundNum]     = useState(1);
  const [chairOccupied, setChairOccupied] = useState<Record<number, Player>>({});
  const [eliminated, setEliminated] = useState<Player | null>(null);
  const [winner, setWinner]         = useState<Player | null>(null);
  const [connected, setConnected]   = useState(false);
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [clipTimer, setClipTimer]   = useState(0);
  const [clipTotal, setClipTotal]   = useState(15);
  const [selectTimer, setSelectTimer] = useState(SELECT_TIMEOUT);
  const [countdown, setCountdown]   = useState(0); // auto-advance countdown
  const [showChairs, setShowChairs] = useState(false);

  const phaseRef     = useRef<Phase>("lobby");
  const playersRef   = useRef<Player[]>([]);
  const chairRef     = useRef<Record<number, Player>>({});
  const wsRef        = useRef<WebSocket | null>(null);
  const ytRef        = useRef<any>(null);
  const ytDivRef     = useRef<HTMLDivElement>(null);
  const songIdxRef   = useRef(0);
  const clipTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const selTimerRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const cdTimerRef   = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { playersRef.current = players; }, [players]);
  useEffect(() => { chairRef.current = chairOccupied; }, [chairOccupied]);

  const currentChairs = Math.max(players.length - 1, 1);

  const clearTimers = () => {
    if (clipTimerRef.current) clearInterval(clipTimerRef.current);
    if (selTimerRef.current)  clearInterval(selTimerRef.current);
    if (cdTimerRef.current)   clearInterval(cdTimerRef.current);
    clipTimerRef.current = selTimerRef.current = cdTimerRef.current = null;
  };

  // ── YouTube setup ────────────────────────────────────────────────────────
  useEffect(() => {
    loadYT().then(() => {
      if (!ytDivRef.current || ytRef.current) return;
      ytRef.current = new window.YT.Player(ytDivRef.current, {
        width:"1", height:"1",
        playerVars:{ autoplay:0, controls:0, fs:0, modestbranding:1, rel:0 },
        events:{ onReady:()=>{} },
      });
    });
    return () => { clearTimers(); try { ytRef.current?.destroy(); } catch {} ytRef.current=null; };
  }, []);

  // ── Start spin ────────────────────────────────────────────────────────────
  const doStartSpin = useCallback((pl?: Player[]) => {
    const curPlayers = pl ?? playersRef.current;
    if (curPlayers.length < 2) return;

    clearTimers();
    setShowChairs(false);
    const empty: Record<number,Player> = {};
    setChairOccupied(empty); chairRef.current = empty;
    setEliminated(null);
    phaseRef.current = "spinning"; setPhase("spinning");

    // Pick random song
    const shuffled = [...SONGS].sort(() => Math.random() - 0.5);
    const song = shuffled[songIdxRef.current % shuffled.length];
    songIdxRef.current++;
    setCurrentSong(song);
    try {
      ytRef.current?.loadVideoById?.({ videoId: song.id, startSeconds: song.start });
    } catch {}

    // Pick random clip duration
    const dur = CLIP_DURATIONS[Math.floor(Math.random() * CLIP_DURATIONS.length)];
    setClipTotal(dur); setClipTimer(dur);

    // Auto-stop after clip duration
    let remaining = dur;
    clipTimerRef.current = setInterval(() => {
      remaining -= 1;
      setClipTimer(remaining);
      if (remaining <= 0) {
        if (clipTimerRef.current) clearInterval(clipTimerRef.current);
        doStopSpin();
      }
    }, 1000);
  }, []);

  // ── Stop spin → show chairs ────────────────────────────────────────────────
  const doStopSpin = useCallback(() => {
    clearTimers();
    try { ytRef.current?.pauseVideo?.(); } catch {}
    setCurrentSong(null);
    phaseRef.current = "selecting"; setPhase("selecting");
    setShowChairs(true);

    let sel = SELECT_TIMEOUT; setSelectTimer(sel);
    selTimerRef.current = setInterval(() => {
      sel -= 1; setSelectTimer(sel);
      if (sel <= 0) {
        if (selTimerRef.current) clearInterval(selTimerRef.current);
        doEliminate();
      }
    }, 1000);
  }, []);

  // ── Eliminate ─────────────────────────────────────────────────────────────
  const doEliminate = useCallback(() => {
    clearTimers();
    const cur = playersRef.current;
    const occ = chairRef.current;
    const seated = new Set(Object.values(occ).map(p => p.username));
    const out = cur.filter(p => !seated.has(p.username));
    const eli = out.length > 0 ? out[Math.floor(Math.random() * out.length)] : null;
    setEliminated(eli);
    phaseRef.current = "elimination"; setPhase("elimination");

    // 5 second auto-advance
    let cd = 5; setCountdown(cd);
    cdTimerRef.current = setInterval(() => {
      cd -= 1; setCountdown(cd);
      if (cd <= 0) {
        if (cdTimerRef.current) clearInterval(cdTimerRef.current);
        doNextRound(eli);
      }
    }, 1000);
  }, []);

  // ── Next round ────────────────────────────────────────────────────────────
  const doNextRound = useCallback((eli: Player | null) => {
    clearTimers();
    const cur = playersRef.current;
    const remaining = cur.filter(p => p.username !== eli?.username);
    playersRef.current = remaining;

    if (remaining.length <= 1) {
      setWinner(remaining[0] ?? null);
      phaseRef.current = "winner"; setPhase("winner");
      setPlayers(remaining);
    } else {
      setPlayers(remaining);
      setRoundNum(r => r + 1);
      setShowChairs(false);
      setTimeout(() => doStartSpin(remaining), 100);
    }
  }, [doStartSpin]);

  // ── Restart ────────────────────────────────────────────────────────────────
  const doRestart = () => {
    clearTimers();
    try { ytRef.current?.pauseVideo?.(); } catch {}
    setPlayers([]); playersRef.current = [];
    setChairOccupied({}); chairRef.current = {};
    setEliminated(null); setWinner(null); setRoundNum(1);
    setCurrentSong(null); setShowChairs(false);
    phaseRef.current = "lobby"; setPhase("lobby");
  };

  // ── Twitch IRC ─────────────────────────────────────────────────────────────
  const handleChat = useCallback((username: string, text: string) => {
    const msg = text.trim().toLowerCase();
    const ph  = phaseRef.current;
    const pl  = playersRef.current;

    if (msg === "join" && ph === "lobby") {
      if (pl.some(p => p.username === username)) return;
      const np: Player = {
        username,
        avatar: `https://unavatar.io/twitch/${username}`,
      };
      setPlayers(prev => { const n=[...prev,np]; playersRef.current=n; return n; });
      return;
    }

    if ((msg === "start game" || msg === "startgame") && ph === "lobby") {
      if (pl.length >= 2) doStartSpin(pl);
      return;
    }

    if (ph === "selecting") {
      const num = parseInt(msg, 10);
      const occ = chairRef.current;
      const cur = playersRef.current;
      const max = cur.length - 1;
      if (isNaN(num) || num < 1 || num > max) return;
      if (occ[num]) return;
      const p = cur.find(x => x.username === username);
      if (!p) return;
      if (Object.values(occ).some(x => x.username === username)) return;
      setChairOccupied(prev => {
        const n={...prev,[num]:p}; chairRef.current=n;
        // If all chairs filled, auto-eliminate
        if (Object.keys(n).length >= cur.length - 1) {
          setTimeout(() => doEliminate(), 800);
        }
        return n;
      });
    }
  }, [doStartSpin, doEliminate]);

  const connectedRef = useRef(false);
  if (!connectedRef.current && user?.username) {
    connectedRef.current = true;
    setTimeout(() => {
      const ch = user.username.toLowerCase();
      const ws = new WebSocket("wss://irc-ws.chat.twitch.tv");
      wsRef.current = ws;
      ws.onopen = () => {
        ws.send("PASS SCHMOOPIIE");
        ws.send(`NICK justinfan${Math.floor(Math.random()*89999)+10000}`);
        ws.send(`JOIN #${ch}`);
      };
      ws.onmessage = e => {
        const lines = (e.data as string).split("\r\n").filter(Boolean);
        for (const line of lines) {
          if (line.startsWith("PING")) { ws.send("PONG :tmi.twitch.tv"); continue; }
          if (line.includes("366") || line.includes("ROOMSTATE")) { setConnected(true); continue; }
          const m = line.match(/^(?:@[^ ]+ )?:(\w+)!\w+@\w+\.tmi\.twitch\.tv PRIVMSG #\w+ :(.+)$/);
          if (m) handleChat(m[1], m[2].trim());
        }
      };
      ws.onclose = () => setConnected(false);
    }, 80);
  }

  // ─── Shared header ─────────────────────────────────────────────────────────
  const Header = () => (
    <header className="flex items-center justify-between px-5 py-3 border-b flex-shrink-0 z-20"
      style={{ background: `${BROWN_DARK}f0`, backdropFilter:"blur(16px)", borderColor:`${GOLD}20` }}>
      <button onClick={() => { clearTimers(); try{ytRef.current?.pauseVideo?.();}catch{} navigate("/"); }}
        className="flex items-center gap-1.5 text-sm transition-opacity opacity-50 hover:opacity-100"
        style={{ color: GOLD }}>
        <ArrowRight size={14} /><span>رجوع</span>
      </button>
      <div className="flex items-center gap-2">
        <span style={{ fontSize: 18 }}>🪑</span>
        <span className="font-black text-base" style={{ color: GOLD, textShadow:`0 0 18px ${GOLD_GLOW}` }}>
          لعبة الكراسي الموسيقية
        </span>
        {roundNum > 1 && <span className="text-xs opacity-40" style={{color:GOLD}}>ج{roundNum}</span>}
      </div>
      <div className="flex items-center gap-1.5">
        {connected ? <Wifi size={12} className="text-green-400"/> : <WifiOff size={12} style={{color:"rgba(255,100,100,0.5)"}}/>}
        <span className="text-xs" style={{ color: connected ? "#4ade80":"rgba(255,100,100,0.5)" }}>
          {connected ? user?.username : "غير متصل"}
        </span>
      </div>
    </header>
  );

  return (
    <div className="h-screen flex flex-col overflow-hidden relative" dir="rtl"
      style={{ background: `radial-gradient(ellipse at 30% 20%, #2a1505 0%, ${BROWN_DARK} 60%)` }}>

      {/* Background glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 right-0 w-96 h-96 rounded-full opacity-10"
          style={{ background:`radial-gradient(circle,${GOLD},transparent)`, filter:"blur(80px)" }} />
        <div className="absolute bottom-0 left-0 w-96 h-96 rounded-full opacity-5"
          style={{ background:`radial-gradient(circle,${GOLD},transparent)`, filter:"blur(80px)" }} />
      </div>

      {/* Hidden YouTube player */}
      <div style={{ position:"absolute", opacity:0, pointerEvents:"none", width:1, height:1, overflow:"hidden" }}>
        <div ref={ytDivRef} />
      </div>

      <Header />

      <AnimatePresence mode="wait">

        {/* ══ LOBBY ══════════════════════════════════════════════════════════ */}
        {phase === "lobby" && (
          <motion.main key="lobby"
            initial={{opacity:0,y:16}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-16}}
            className="flex-1 overflow-y-auto flex flex-col items-center py-6 px-5 gap-5">

            {/* Join banner */}
            <div className="w-full max-w-md rounded-2xl p-5 text-center border"
              style={{ background:`${BROWN_MID}80`, borderColor:`${GOLD}30`,
                boxShadow:`0 0 30px ${GOLD_GLOW}` }}>
              <p className="text-2xl font-black mb-1" style={{ color: GOLD }}>
                اكتب <span style={{textDecoration:"underline",textDecorationColor:`${GOLD}60`}}>join</span> في الشات
              </p>
              <p className="text-sm opacity-50 text-white">للانضمام إلى لعبة الكراسي الموسيقية 🎵</p>
              <p className="text-xs mt-2 opacity-30 text-white">المشرف يكتب «start game» لبدء اللعبة</p>
            </div>

            {/* Player list */}
            <div className="w-full max-w-md">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Users size={14} style={{color:GOLD}}/>
                  <span className="text-sm font-bold" style={{color:GOLD}}>اللاعبون</span>
                </div>
                <span className="text-xs font-black px-2.5 py-0.5 rounded-full"
                  style={{background:`${GOLD}18`, color:GOLD, border:`1px solid ${GOLD}30`}}>
                  {players.length}
                </span>
              </div>
              <div className="flex flex-col gap-2">
                {players.length === 0 ? (
                  <div className="text-center py-12 border border-dashed rounded-2xl"
                    style={{borderColor:`${GOLD}15`}}>
                    <span className="text-4xl opacity-20 block mb-2">🪑</span>
                    <p className="text-sm opacity-30" style={{color:GOLD}}>لم ينضم أحد بعد...</p>
                  </div>
                ) : players.map((p,i) => <PlayerCard key={p.username} player={p} index={i}/>)}
              </div>
            </div>

            {/* Start button (manual override) */}
            {players.length >= 2 && (
              <div className="w-full max-w-md">
                <motion.button
                  onClick={() => doStartSpin()}
                  whileHover={{scale:1.03}} whileTap={{scale:0.97}}
                  className="w-full py-4 rounded-2xl font-black text-base text-black"
                  style={{
                    background:`linear-gradient(135deg,${GOLD},#a06008)`,
                    boxShadow:`0 0 32px ${GOLD_GLOW}`,
                  }}>
                  🚀 ابدأ اللعبة — {players.length} لاعبين
                </motion.button>
              </div>
            )}
          </motion.main>
        )}

        {/* ══ SPINNING + SELECTING (shared wheel view) ═══════════════════════ */}
        {(phase === "spinning" || phase === "selecting") && (
          <motion.main key="wheel"
            initial={{opacity:0,scale:0.93}} animate={{opacity:1,scale:1}} exit={{opacity:0}}
            className="flex-1 overflow-y-auto flex flex-col items-center justify-center gap-4 px-4 py-4">

            {/* Round + player count */}
            <div className="text-center">
              <p className="text-xl font-black text-white/80">الجولة {roundNum}</p>
              <p className="text-sm opacity-40" style={{color:GOLD}}>
                {players.length} لاعبين — {currentChairs} كرسي
              </p>
            </div>

            {/* Wheel */}
            <div className="relative">
              <LuxuryWheel
                spinning={phase === "spinning"}
                chairs={showChairs}
                chairOccupied={chairOccupied}
                chairCount={currentChairs}
                onPhase={phase}
              />
              {/* Timer badge */}
              {phase === "spinning" && (
                <div className="absolute -top-3 -left-3">
                  <CountdownRing seconds={clipTimer} total={clipTotal} />
                </div>
              )}
              {phase === "selecting" && (
                <div className="absolute -top-3 -left-3">
                  <CountdownRing seconds={selectTimer} total={SELECT_TIMEOUT} />
                </div>
              )}
            </div>

            {/* Now playing */}
            {currentSong && phase === "spinning" && (
              <motion.div initial={{opacity:0,y:6}} animate={{opacity:1,y:0}}
                className="flex items-center gap-2 px-4 py-2 rounded-full border"
                style={{background:`${GOLD}10`, borderColor:`${GOLD}30`}}>
                <motion.div animate={{scale:[1,1.3,1]}} transition={{duration:0.6,repeat:Infinity}}>
                  <Music2 size={12} style={{color:GOLD}} />
                </motion.div>
                <span className="text-xs font-bold truncate max-w-[180px]" style={{color:GOLD}}>
                  {currentSong.title} — {currentSong.artist}
                </span>
              </motion.div>
            )}

            {/* Instruction during selecting */}
            {phase === "selecting" && (
              <motion.div initial={{opacity:0,y:8}} animate={{opacity:1,y:0}}
                className="text-center px-4 py-2 rounded-xl border"
                style={{background:`${GOLD}10`, borderColor:`${GOLD}25`}}>
                <p className="font-black text-sm" style={{color:GOLD}}>
                  اكتب رقم الكرسي في الشات! (1 – {currentChairs})
                </p>
                <p className="text-xs opacity-40 text-white mt-0.5">
                  أول لاعب يختار الكرسي يأخذه
                </p>
              </motion.div>
            )}

            {/* Player mini strip */}
            <div className="flex flex-wrap justify-center gap-2 max-w-sm">
              {players.map((p, i) => {
                const seated = Object.values(chairOccupied).some(x => x.username === p.username);
                return (
                  <div key={p.username} className="flex flex-col items-center gap-0.5">
                    <div className="w-9 h-9 rounded-xl overflow-hidden border-2 transition-all"
                      style={{
                        borderColor: seated ? GOLD : `${GOLD}20`,
                        boxShadow: seated ? `0 0 10px ${GOLD_GLOW}` : "none",
                        opacity: seated ? 1 : 0.6,
                      }}>
                      <img src={p.avatar} alt={p.username} className="w-full h-full object-cover"
                        onError={e=>{(e.target as HTMLImageElement).src=`https://api.dicebear.com/7.x/pixel-art/svg?seed=${p.username}`;}}/>
                    </div>
                    <span className="text-[8px] truncate max-w-[36px] text-center"
                      style={{color: seated ? GOLD : "rgba(255,255,255,0.3)"}}>
                      {p.username}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Buttons */}
            <div className="flex gap-3">
              {phase === "spinning" && (
                <motion.button onClick={doStopSpin}
                  whileHover={{scale:1.05}} whileTap={{scale:0.97}}
                  animate={{boxShadow:[`0 0 18px ${GOLD_GLOW}`,`0 0 40px ${GOLD_GLOW}`,`0 0 18px ${GOLD_GLOW}`]}}
                  transition={{duration:1.4, repeat:Infinity}}
                  className="px-8 py-3.5 rounded-2xl font-black text-base text-black"
                  style={{background:`linear-gradient(135deg,${GOLD},#a06008)`}}>
                  ⏹ أوقف الموسيقى
                </motion.button>
              )}
              {phase === "selecting" && (
                <motion.button onClick={doEliminate}
                  whileHover={{scale:1.04}} whileTap={{scale:0.97}}
                  className="px-8 py-3 rounded-2xl font-black text-sm text-black"
                  style={{background:`linear-gradient(135deg,${GOLD},#a06008)`, boxShadow:`0 0 20px ${GOLD_GLOW}`}}>
                  ❌ انتهى الاختيار
                </motion.button>
              )}
            </div>
          </motion.main>
        )}

        {/* ══ ELIMINATION ════════════════════════════════════════════════════ */}
        {phase === "elimination" && (
          <motion.main key="elim"
            initial={{opacity:0,scale:0.9}} animate={{opacity:1,scale:1}} exit={{opacity:0}}
            className="flex-1 flex flex-col items-center justify-center gap-6 px-5 py-8">

            {eliminated ? (
              <>
                <motion.div animate={{scale:[1,1.15,1]}} transition={{duration:1.2,repeat:Infinity}}
                  className="text-6xl">💥</motion.div>
                <div className="text-center">
                  <p className="text-purple-300/50 text-lg font-bold mb-3">تم إقصاء</p>
                  <div className="relative inline-block">
                    <img src={eliminated.avatar} alt={eliminated.username}
                      className="w-28 h-28 rounded-2xl object-cover border-4"
                      style={{ borderColor:"#f43f5e", boxShadow:"0 0 36px rgba(244,63,94,0.7)" }}
                      onError={e=>{(e.target as HTMLImageElement).src=`https://api.dicebear.com/7.x/pixel-art/svg?seed=${eliminated.username}`;}}/>
                    <div className="absolute -bottom-2 -right-2 text-2xl">❌</div>
                  </div>
                  <h3 className="text-3xl font-black mt-3" style={{color:"#f43f5e",textShadow:"0 0 24px #f43f5e"}}>
                    {eliminated.username}
                  </h3>
                </div>

                {/* Auto-advance countdown */}
                <div className="flex flex-col items-center gap-1">
                  <CountdownRing seconds={countdown} total={5} />
                  <p className="text-xs opacity-40" style={{color:GOLD}}>الجولة القادمة...</p>
                </div>

                {/* Remaining players */}
                <div className="flex flex-wrap justify-center gap-2">
                  {players.filter(p=>p.username!==eliminated.username).map((p,i)=>(
                    <div key={p.username} className="flex flex-col items-center gap-1">
                      <img src={p.avatar} alt={p.username}
                        className="w-10 h-10 rounded-xl border-2 object-cover"
                        style={{borderColor:GOLD, boxShadow:`0 0 10px ${GOLD_GLOW}`}}
                        onError={e=>{(e.target as HTMLImageElement).src=`https://api.dicebear.com/7.x/pixel-art/svg?seed=${p.username}`;}}/>
                      <span className="text-[9px] truncate max-w-[40px] text-center" style={{color:GOLD}}>
                        {p.username}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="text-center">
                <span className="text-5xl block mb-3">🤝</span>
                <p className="text-lg" style={{color:GOLD}}>الجميع وجدوا كرسياً!</p>
              </div>
            )}

            <motion.button
              onClick={() => { clearTimers(); doNextRound(eliminated); }}
              whileHover={{scale:1.05}} whileTap={{scale:0.97}}
              className="px-8 py-3 rounded-xl font-black text-sm text-black"
              style={{background:`linear-gradient(135deg,${GOLD},#a06008)`, boxShadow:`0 0 20px ${GOLD_GLOW}`}}>
              {(players.length-(eliminated?1:0))<=1 ? "🏆 عرض الفائز" : "▶ الجولة التالية الآن"}
            </motion.button>
          </motion.main>
        )}

        {/* ══ WINNER ═════════════════════════════════════════════════════════ */}
        {phase === "winner" && (
          <motion.main key="winner"
            initial={{opacity:0,scale:0.8}} animate={{opacity:1,scale:1}} exit={{opacity:0}}
            className="flex-1 flex flex-col items-center justify-center gap-6 px-5 py-8">
            <Confetti />

            <motion.div animate={{y:[0,-20,0]}} transition={{duration:2,repeat:Infinity,ease:"easeInOut"}}
              className="text-7xl">🏆</motion.div>

            {winner && (
              <div className="flex flex-col items-center gap-4 text-center">
                <p className="text-2xl font-bold text-white/60">الفائز بلعبة الكراسي</p>
                <div className="relative">
                  <motion.div animate={{rotate:360}} transition={{duration:6,repeat:Infinity,ease:"linear"}}
                    className="absolute rounded-2xl"
                    style={{inset:-5, background:`conic-gradient(${GOLD},#e040fb,#00e5ff,${GOLD})`, filter:"blur(3px)"}}/>
                  <img src={winner.avatar} alt={winner.username}
                    className="relative w-32 h-32 rounded-2xl border-4 object-cover"
                    style={{borderColor:GOLD, boxShadow:`0 0 50px ${GOLD_GLOW}`}}
                    onError={e=>{(e.target as HTMLImageElement).src=`https://api.dicebear.com/7.x/pixel-art/svg?seed=${winner.username}`;}}/>
                </div>
                <h2 className="text-4xl font-black" style={{color:GOLD,textShadow:`0 0 30px ${GOLD},0 0 60px ${GOLD_GLOW}`}}>
                  {winner.username}
                </h2>
                <p style={{color:GOLD}} className="opacity-60 text-sm">🎉 بطل الكراسي الموسيقية 🎉</p>
              </div>
            )}

            <div className="flex gap-3 mt-2">
              <motion.button onClick={doRestart}
                whileHover={{scale:1.05}} whileTap={{scale:0.97}}
                className="flex items-center gap-2 px-7 py-3 rounded-xl font-bold text-sm text-black"
                style={{background:`linear-gradient(135deg,${GOLD},#a06008)`, boxShadow:`0 0 18px ${GOLD_GLOW}`}}>
                <RotateCcw size={14}/> العب مجدداً
              </motion.button>
              <motion.button onClick={()=>navigate("/")}
                whileHover={{scale:1.05}} whileTap={{scale:0.97}}
                className="flex items-center gap-2 px-7 py-3 rounded-xl font-bold text-sm border"
                style={{color:GOLD, borderColor:`${GOLD}30`, background:`${GOLD}08`}}>
                <ArrowRight size={14}/> الرئيسية
              </motion.button>
            </div>
          </motion.main>
        )}

      </AnimatePresence>
    </div>
  );
}
