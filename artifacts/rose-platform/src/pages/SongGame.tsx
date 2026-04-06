import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight, Play, Pause, Trophy, Music2, SkipForward, Zap,
  RotateCcw, RefreshCw, Eye, Volume2, VolumeX, Timer, Star, Users,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
type Phase = "settings" | "control" | "play" | "ended";

interface Song {
  id: number;
  title: string;
  artist: string;
  youtubeId: string;
  clipStart: number;
  clipEnd: number;
}

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady?: () => void;
    _ytApiReady?: boolean;
  }
}

// ─── Song bank (clipEnd = clipStart + ~20-50s with vocals) ───────────────────
const SONGS: Song[] = [
  {
    id: 1,
    title: "يا نور العين",
    artist: "مطرف المطرف",
    youtubeId: "WlqefHeYYR0",
    clipStart: 45,   // 0:45 — vocal chorus
    clipEnd: 65,     // 1:05 — 20 second clip
  },
  {
    id: 2,
    title: "يا طير خذ قلبي وشل",
    artist: "راشد الماجد",
    youtubeId: "joevqtOJFes",
    clipStart: 35,   // 0:35 — skip musical intro, enter with vocals
    clipEnd: 80,     // 1:20 — 45 second clip with full chorus
  },
  // { id: 3, title: "...", artist: "...", youtubeId: "...", clipStart: X, clipEnd: X+20~50 },
];

const ROUND_OPTIONS = [5, 10, 15, 20, 25];
const TIMER_BASE = 60;
const EXTRA_TIME = 60;

// ─── YouTube API loader ───────────────────────────────────────────────────────
let ytApiPromise: Promise<void> | null = null;
function loadYouTubeAPI(): Promise<void> {
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise((resolve) => {
    if (window._ytApiReady && window.YT?.Player) { resolve(); return; }
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      window._ytApiReady = true;
      if (prev) prev();
      resolve();
    };
    if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(tag);
    }
  });
  return ytApiPromise;
}

// ─── Floating music note ─────────────────────────────────────────────────────
const Note = ({ delay, x, color, s = 26 }: { delay: number; x: number; color: string; s?: number }) => (
  <motion.span className="absolute pointer-events-none select-none font-black"
    style={{ left: `${x}%`, bottom: 0, color, fontSize: s, zIndex: 0 }}
    initial={{ y: 0, opacity: 0 }}
    animate={{ y: -240, opacity: [0, 1, 1, 0], rotate: [0, 20, -16, 4], scale: [0.4, 1.2, 1, 0.2] }}
    transition={{ duration: 3.5, delay, repeat: Infinity, repeatDelay: 0.4 }}>
    ♪
  </motion.span>
);

// ─── Main component ───────────────────────────────────────────────────────────
export default function SongGame() {
  const [, navigate] = useLocation();
  // Start directly at settings — no intermediate "setup" landing page
  const [phase, setPhase] = useState<Phase>("settings");

  // Settings
  const [team1Name, setTeam1Name] = useState("الفريق الأول");
  const [team2Name, setTeam2Name] = useState("الفريق الثاني");
  const [totalRounds, setTotalRounds] = useState(10);

  // Game state
  const [team1Score, setTeam1Score] = useState(0);
  const [team2Score, setTeam2Score] = useState(0);
  const [currentRound, setCurrentRound] = useState(0);
  const [currentTurn, setCurrentTurn] = useState<1 | 2>(1);
  const [team1DoubleUsed, setTeam1DoubleUsed] = useState(false);
  const [team2DoubleUsed, setTeam2DoubleUsed] = useState(false);
  const [team1ExtraUsed, setTeam1ExtraUsed] = useState(false);
  const [team2ExtraUsed, setTeam2ExtraUsed] = useState(false);
  const [doubleActive, setDoubleActive] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);
  const [currentSongIndex, setCurrentSongIndex] = useState(0);

  // Timer
  const [timeLeft, setTimeLeft] = useState(TIMER_BASE);
  const [timerRunning, setTimerRunning] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // YouTube
  const ytPlayerRef = useRef<any>(null);
  const ytContainerRef = useRef<HTMLDivElement>(null);
  const [audioState, setAudioState] = useState<"loading" | "playing" | "paused" | "stopped" | "error">("loading");
  const [volume, setVolume] = useState(60);
  const clipWatchRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Ref so timer callback can access current song without stale closure
  const currentSongRef = useRef<Song>(SONGS[0]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const currentSong: Song = SONGS[currentSongIndex % SONGS.length];
  currentSongRef.current = currentSong; // keep ref in sync for timer callback
  const teamColor = (t: 1 | 2) => t === 1 ? "#e040fb" : "#00e5ff";
  const teamName = (t: 1 | 2) => t === 1 ? team1Name : team2Name;
  const currentDoubleUsed = currentTurn === 1 ? team1DoubleUsed : team2DoubleUsed;
  const currentExtraUsed = currentTurn === 1 ? team1ExtraUsed : team2ExtraUsed;
  const timerPct = Math.min((timeLeft / (TIMER_BASE + EXTRA_TIME)) * 100, 100);
  const timerColor = timeLeft <= 10 ? "#ef4444" : timeLeft <= 30 ? "#f59e0b" : "#22c55e";

  // ── Timer ─────────────────────────────────────────────────────────────────
  const stopTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setTimerRunning(false);
  }, []);

  useEffect(() => {
    if (!timerRunning) return;
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          // Stay in play — switch turn, reset timer, replay clip for new team
          setCurrentTurn(prev => prev === 1 ? 2 : 1);
          setDoubleActive(false);
          setShowAnswer(false);
          setTimeout(() => {
            const song = currentSongRef.current;
            if (ytPlayerRef.current) {
              try {
                ytPlayerRef.current.seekTo(song.clipStart, true);
                ytPlayerRef.current.playVideo();
                setAudioState("playing");
                startClipWatch(song);
              } catch (_) {}
            }
          }, 300);
          return TIMER_BASE; // reset timer for next team, stay in play page
        }
        return t - 1;
      });
    }, 1000);
    return () => stopTimer();
  }, [timerRunning]);

  const addExtraTime = () => {
    if (currentExtraUsed) return;
    if (currentTurn === 1) setTeam1ExtraUsed(true);
    else setTeam2ExtraUsed(true);
    setTimeLeft(t => t + EXTRA_TIME);
  };

  // ── YouTube clip ──────────────────────────────────────────────────────────
  const clearClipWatch = () => {
    if (clipWatchRef.current) { clearInterval(clipWatchRef.current); clipWatchRef.current = null; }
  };
  const destroyPlayer = useCallback(() => {
    clearClipWatch();
    if (ytPlayerRef.current) {
      try { ytPlayerRef.current.destroy(); } catch (_) {}
      ytPlayerRef.current = null;
    }
  }, []);

  const startClipWatch = (song: Song) => {
    clearClipWatch();
    clipWatchRef.current = setInterval(() => {
      if (!ytPlayerRef.current) return;
      try {
        const t = ytPlayerRef.current.getCurrentTime?.() ?? 0;
        if (t >= song.clipEnd) {
          clearClipWatch();
          ytPlayerRef.current.pauseVideo();
          setAudioState("stopped");
        }
      } catch (_) {}
    }, 300);
  };

  useEffect(() => {
    if (phase !== "play") { destroyPlayer(); return; }
    setAudioState("loading");
    loadYouTubeAPI().then(() => {
      if (!ytContainerRef.current) return;
      destroyPlayer();
      ytPlayerRef.current = new window.YT.Player(ytContainerRef.current, {
        height: "1", width: "1",
        videoId: currentSong.youtubeId,
        playerVars: {
          autoplay: 1, start: currentSong.clipStart,
          controls: 0, modestbranding: 1, rel: 0, fs: 0,
          iv_load_policy: 3, disablekb: 1, playsinline: 1,
        },
        events: {
          onReady: (e: any) => {
            e.target.setVolume(volume);
            e.target.playVideo();
            setAudioState("playing");
            startClipWatch(currentSong);
          },
          onStateChange: (e: any) => {
            const S = window.YT?.PlayerState;
            if (e.data === S?.PLAYING) setAudioState("playing");
            else if (e.data === S?.PAUSED)
              setAudioState(prev => prev === "stopped" ? "stopped" : "paused");
          },
          onError: () => setAudioState("error"),
        },
      });
    }).catch(() => setAudioState("error"));
    return () => destroyPlayer();
  }, [phase, currentSongIndex]);

  useEffect(() => {
    if (!ytPlayerRef.current) return;
    try {
      if (volume === 0) ytPlayerRef.current.mute();
      else { ytPlayerRef.current.unMute(); ytPlayerRef.current.setVolume(volume); }
    } catch (_) {}
  }, [volume]);

  // ── Audio controls ────────────────────────────────────────────────────────
  const playAudio = () => {
    if (!ytPlayerRef.current) return;
    try { ytPlayerRef.current.playVideo(); setAudioState("playing"); startClipWatch(currentSong); } catch (_) {}
  };
  const pauseAudio = () => {
    if (!ytPlayerRef.current) return;
    try { clearClipWatch(); ytPlayerRef.current.pauseVideo(); setAudioState("paused"); } catch (_) {}
  };
  const replayAudio = () => {
    if (!ytPlayerRef.current) return;
    try {
      ytPlayerRef.current.seekTo(currentSong.clipStart, true);
      ytPlayerRef.current.playVideo();
      setAudioState("playing");
      startClipWatch(currentSong);
    } catch (_) {}
  };

  // ── Game flow ─────────────────────────────────────────────────────────────
  const startGame = () => {
    setTeam1Score(0); setTeam2Score(0);
    setCurrentRound(0); setCurrentTurn(1); setCurrentSongIndex(0);
    setTeam1DoubleUsed(false); setTeam2DoubleUsed(false);
    setTeam1ExtraUsed(false); setTeam2ExtraUsed(false);
    setDoubleActive(false); setShowAnswer(false);
    setPhase("control");
  };

  const activateDouble = () => {
    if (currentDoubleUsed) return;
    setDoubleActive(true);
    if (currentTurn === 1) setTeam1DoubleUsed(true);
    else setTeam2DoubleUsed(true);
  };

  const skipTurn = () => {
    setCurrentTurn(t => t === 1 ? 2 : 1);
    setDoubleActive(false);
    setShowAnswer(false);
  };

  const playSong = () => {
    setShowAnswer(false);
    setTimeLeft(TIMER_BASE);
    setTimerRunning(true);
    setPhase("play");
  };

  const handleShowAnswer = () => {
    pauseAudio();
    stopTimer();
    setShowAnswer(true);
  };

  const awardPoint = (team: 1 | 2) => {
    const pts = doubleActive ? 2 : 1;
    if (team === 1) setTeam1Score(s => s + pts);
    else setTeam2Score(s => s + pts);
    const next = currentRound + 1;
    setCurrentRound(next);
    setDoubleActive(false);
    setShowAnswer(false);
    stopTimer();
    destroyPlayer();
    setCurrentSongIndex(i => i + 1);
    if (next >= totalRounds) setPhase("ended");
    else { setCurrentTurn(t => t === 1 ? 2 : 1); setPhase("control"); }
  };

  const resetFull = () => {
    stopTimer(); destroyPlayer();
    setPhase("settings");
    setTeam1Name("الفريق الأول"); setTeam2Name("الفريق الثاني"); setTotalRounds(10);
  };

  const winner = team1Score > team2Score ? team1Name : team2Score > team1Score ? team2Name : "تعادل! 🤝";

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen w-full gradient-bg flex flex-col" dir="rtl"
      style={{ overflowX: "hidden" }}>

      {/* Ambient glows */}
      <div className="fixed inset-0 pointer-events-none">
        <div style={{ position: "absolute", top: 0, right: 0, width: 700, height: 700,
          background: "radial-gradient(circle, rgba(224,64,251,0.08), transparent)", filter: "blur(100px)",
          transform: "translate(30%,-30%)" }} />
        <div style={{ position: "absolute", bottom: 0, left: 0, width: 700, height: 700,
          background: "radial-gradient(circle, rgba(0,229,255,0.08), transparent)", filter: "blur(100px)",
          transform: "translate(-30%,30%)" }} />
      </div>

      {/* Hidden YouTube mount */}
      {phase === "play" && (
        <div style={{ position: "fixed", top: -2, left: -2, width: 1, height: 1, overflow: "hidden", zIndex: -10 }}>
          <div ref={ytContainerRef} />
        </div>
      )}

      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <header className="relative z-20 flex items-center justify-between px-6 py-4 border-b border-white/[0.05] flex-shrink-0"
        style={{ background: "rgba(5,2,14,0.95)", backdropFilter: "blur(20px)" }}>
        <button onClick={() => navigate("/")}
          className="flex items-center gap-2 text-purple-300/50 hover:text-pink-400 transition-colors font-bold">
          <ArrowRight size={18} />
          <span className="text-sm">العودة</span>
        </button>
        <div className="flex items-center gap-2.5">
          <Music2 className="text-pink-400" size={20} />
          <span className="text-lg font-black neon-text-pink">لعبة الأغاني</span>
        </div>
        <div className="w-24" />
      </header>

      {/* ── CONTENT ────────────────────────────────────────────────────────── */}
      <div className="relative z-10 flex-1 flex flex-col">
        <AnimatePresence mode="wait">

          {/* ════════════════════ SETTINGS (first screen) ════════════════════ */}
          {phase === "settings" && (
            <motion.div key="settings"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.35 }}
              className="flex-1 flex flex-col items-center justify-center px-5 py-8 gap-8">

              {/* Hero logo */}
              <motion.div
                animate={{ y: [0, -8, 0] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                className="relative">
                <div className="w-40 h-40 sm:w-52 sm:h-52 rounded-full overflow-hidden"
                  style={{
                    border: "3px solid rgba(224,64,251,0.4)",
                    boxShadow: "0 0 60px rgba(224,64,251,0.35), 0 0 120px rgba(224,64,251,0.12)",
                  }}>
                  <img src="/song-logo.jpg" alt="لعبة الأغاني" className="w-full h-full object-cover" />
                </div>
                {/* Floating notes */}
                <div className="absolute inset-0 overflow-visible pointer-events-none">
                  <Note delay={0}    x={-20} color="#e040fb" s={22} />
                  <Note delay={1.1}  x={110} color="#00e5ff" s={20} />
                  <Note delay={0.55} x={45}  color="#ffd600" s={18} />
                </div>
              </motion.div>

              <div className="text-center">
                <h1 className="text-3xl sm:text-4xl font-black text-white">إعداد اللعبة</h1>
                <p className="text-purple-300/40 text-base mt-1">أدخل أسماء الفريقين واختر عدد الجولات</p>
              </div>

              {/* Team name inputs */}
              <div className="w-full max-w-lg grid grid-cols-2 gap-4">
                {[
                  { val: team1Name, set: setTeam1Name, color: "#e040fb", label: "الفريق الأول" },
                  { val: team2Name, set: setTeam2Name, color: "#00e5ff", label: "الفريق الثاني" },
                ].map((t, i) => (
                  <div key={i} className="rounded-2xl border p-5 space-y-3"
                    style={{ borderColor: `${t.color}28`, background: `${t.color}07` }}>
                    <div className="flex items-center gap-2">
                      <Users size={16} style={{ color: t.color }} />
                      <label className="text-sm font-black" style={{ color: t.color }}>{t.label}</label>
                    </div>
                    <input
                      value={t.val}
                      onChange={e => t.set(e.target.value)}
                      className="w-full rounded-xl px-4 py-3 bg-black/30 border text-white font-black text-center text-lg focus:outline-none transition-all"
                      style={{ borderColor: `${t.color}28`, fontSize: 18 }}
                    />
                  </div>
                ))}
              </div>

              {/* Rounds selector */}
              <div className="w-full max-w-lg space-y-3">
                <p className="flex items-center gap-2 text-base font-black text-purple-300/60">
                  <Trophy size={16} /> عدد الجولات
                </p>
                <div className="grid grid-cols-5 gap-3">
                  {ROUND_OPTIONS.map(r => (
                    <button key={r} onClick={() => setTotalRounds(r)}
                      className="py-4 rounded-2xl font-black text-xl border transition-all"
                      style={{
                        borderColor: totalRounds === r ? "#e040fb" : "rgba(224,64,251,0.18)",
                        background: totalRounds === r ? "rgba(224,64,251,0.2)" : "rgba(224,64,251,0.04)",
                        color: totalRounds === r ? "#e040fb" : "rgba(224,64,251,0.3)",
                        boxShadow: totalRounds === r ? "0 0 20px rgba(224,64,251,0.3)" : "none",
                      }}>{r}</button>
                  ))}
                </div>
              </div>

              {/* Start button */}
              <motion.button
                onClick={startGame}
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.97 }}
                className="flex items-center justify-center gap-3 px-16 py-5 rounded-2xl font-black text-2xl"
                style={{
                  background: "linear-gradient(135deg, #e040fb, #9c27b0)",
                  boxShadow: "0 0 50px rgba(224,64,251,0.5)",
                  color: "#fff",
                  width: "100%",
                  maxWidth: 480,
                }}>
                <Play size={26} fill="white" />
                إبدأ اللعبة
              </motion.button>
            </motion.div>
          )}

          {/* ════════════════════ CONTROL ════════════════════ */}
          {phase === "control" && (
            <motion.div key="control"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="flex-1 flex flex-col items-center justify-center px-5 py-6 gap-5">

              {/* ── Score cards ── */}
              <div className="w-full max-w-2xl grid grid-cols-3 gap-4 items-stretch">
                {/* Team 1 */}
                <div className="rounded-3xl overflow-hidden border transition-all"
                  style={{
                    borderColor: currentTurn === 1 ? "#e040fb70" : "rgba(224,64,251,0.15)",
                    background: currentTurn === 1 ? "rgba(224,64,251,0.12)" : "rgba(8,3,18,0.85)",
                    boxShadow: currentTurn === 1 ? "0 0 40px rgba(224,64,251,0.22)" : "none",
                  }}>
                  {currentTurn === 1 && <div className="h-1" style={{ background: "linear-gradient(90deg, #e040fb, #c026d3)" }} />}
                  <div className="p-5 text-center">
                    <div className="w-12 h-12 rounded-xl mx-auto mb-3 flex items-center justify-center"
                      style={{ background: "rgba(224,64,251,0.15)", border: "1px solid rgba(224,64,251,0.3)" }}>
                      <Star size={22} style={{ color: "#e040fb" }} />
                    </div>
                    <p className="text-sm font-bold truncate" style={{ color: "#e040fb80" }}>{team1Name}</p>
                    <p className="text-6xl font-black mt-1"
                      style={{ color: "#e040fb", textShadow: "0 0 28px #e040fb80" }}>{team1Score}</p>
                    {currentTurn === 1 && (
                      <p className="text-sm font-black mt-2" style={{ color: "#e040fb" }}>⚡ دورهم</p>
                    )}
                  </div>
                </div>

                {/* Middle */}
                <div className="flex flex-col items-center justify-center gap-3">
                  <div className="text-2xl font-black" style={{ color: "rgba(167,139,250,0.4)" }}>VS</div>
                  <div className="text-sm text-purple-400/40 font-bold">{currentRound}/{totalRounds}</div>
                  <div className="w-full h-2 rounded-full overflow-hidden bg-purple-900/30">
                    <motion.div className="h-full rounded-full"
                      animate={{ width: `${(currentRound / totalRounds) * 100}%` }}
                      style={{ background: "linear-gradient(90deg, #e040fb, #7c3aed, #00e5ff)" }} />
                  </div>
                </div>

                {/* Team 2 */}
                <div className="rounded-3xl overflow-hidden border transition-all"
                  style={{
                    borderColor: currentTurn === 2 ? "#00e5ff70" : "rgba(0,229,255,0.15)",
                    background: currentTurn === 2 ? "rgba(0,229,255,0.10)" : "rgba(8,3,18,0.85)",
                    boxShadow: currentTurn === 2 ? "0 0 40px rgba(0,229,255,0.2)" : "none",
                  }}>
                  {currentTurn === 2 && <div className="h-1" style={{ background: "linear-gradient(90deg, #00e5ff, #0284c7)" }} />}
                  <div className="p-5 text-center">
                    <div className="w-12 h-12 rounded-xl mx-auto mb-3 flex items-center justify-center"
                      style={{ background: "rgba(0,229,255,0.14)", border: "1px solid rgba(0,229,255,0.3)" }}>
                      <Star size={22} style={{ color: "#00e5ff" }} />
                    </div>
                    <p className="text-sm font-bold truncate" style={{ color: "#00e5ff80" }}>{team2Name}</p>
                    <p className="text-6xl font-black mt-1"
                      style={{ color: "#00e5ff", textShadow: "0 0 28px #00e5ff80" }}>{team2Score}</p>
                    {currentTurn === 2 && (
                      <p className="text-sm font-black mt-2" style={{ color: "#00e5ff" }}>⚡ دورهم</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Current turn banner */}
              <div className="w-full max-w-2xl rounded-2xl border py-4 text-center"
                style={{ borderColor: `${teamColor(currentTurn)}28`, background: `${teamColor(currentTurn)}07` }}>
                <p className="text-sm text-purple-300/35">الدور الحالي</p>
                <p className="text-3xl font-black mt-0.5" style={{ color: teamColor(currentTurn) }}>
                  {teamName(currentTurn)}
                </p>
              </div>

              {/* Action buttons */}
              <div className="w-full max-w-2xl space-y-3">
                <motion.button onClick={playSong}
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  className="w-full flex items-center justify-center gap-3 py-6 rounded-2xl font-black text-2xl"
                  style={{
                    background: "linear-gradient(135deg, #22c55e, #16a34a)",
                    boxShadow: "0 0 36px rgba(34,197,94,0.45)", color: "#fff",
                  }}>
                  <Play size={26} fill="white" /> تشغيل الأغنية
                </motion.button>

                <motion.button onClick={activateDouble} disabled={currentDoubleUsed}
                  whileHover={currentDoubleUsed ? {} : { scale: 1.02 }}
                  whileTap={currentDoubleUsed ? {} : { scale: 0.98 }}
                  className="w-full flex items-center justify-center gap-3 py-5 rounded-2xl font-black text-xl border transition-all"
                  style={{
                    background: currentDoubleUsed ? "rgba(255,214,0,0.03)" : doubleActive ? "rgba(255,214,0,0.2)" : "rgba(255,214,0,0.08)",
                    borderColor: currentDoubleUsed ? "rgba(255,214,0,0.12)" : doubleActive ? "#ffd600" : "rgba(255,214,0,0.38)",
                    color: currentDoubleUsed ? "rgba(255,214,0,0.3)" : "#ffd600",
                    boxShadow: doubleActive ? "0 0 28px rgba(255,214,0,0.4)" : "none",
                    cursor: currentDoubleUsed ? "not-allowed" : "pointer",
                  }}>
                  <Zap size={24} />
                  {currentDoubleUsed ? "الدبل مستخدم ✓" : doubleActive ? "DOUBLE مفعّل ×2 ⚡" : "تفعيل الدبل"}
                </motion.button>

                <motion.button onClick={skipTurn}
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl font-bold text-lg border border-purple-500/20 text-purple-400/55 hover:text-purple-200 hover:border-purple-500/35 transition-all">
                  <SkipForward size={22} /> تخطي الدور
                </motion.button>
              </div>

              <button onClick={resetFull}
                className="flex items-center gap-2 py-1.5 text-sm text-purple-500/25 hover:text-purple-400/45 transition-colors">
                <RotateCcw size={13} /> إعادة تعيين اللعبة
              </button>
            </motion.div>
          )}

          {/* ════════════════════ PLAY ════════════════════ */}
          {phase === "play" && (
            <motion.div key="play"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="flex-1 flex flex-col items-center justify-start px-5 py-5 gap-4 overflow-y-auto">

              {/* ── BIG logo section ── */}
              <div className="relative flex flex-col items-center">
                <motion.div
                  animate={{ y: [0, -7, 0] }}
                  transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                  className="relative">
                  <motion.img
                    src="/song-logo.jpg"
                    alt="🎵"
                    className="w-36 h-36 sm:w-44 sm:h-44 rounded-full object-cover"
                    style={{
                      border: `4px solid ${teamColor(currentTurn)}50`,
                      boxShadow: `0 0 60px ${teamColor(currentTurn)}40, 0 0 120px ${teamColor(currentTurn)}18`,
                    }}
                    animate={audioState === "playing" ? { scale: [1, 1.07, 1] } : {}}
                    transition={{ repeat: Infinity, duration: 1.2 }}
                  />
                  {/* Ring pulse */}
                  {audioState === "playing" && (
                    <motion.div className="absolute inset-0 rounded-full"
                      animate={{ scale: [1, 1.3, 1.3], opacity: [0.6, 0, 0] }}
                      transition={{ repeat: Infinity, duration: 1.8 }}
                      style={{ border: `2px solid ${teamColor(currentTurn)}`, borderRadius: "50%" }} />
                  )}
                  {/* Floating notes around logo */}
                  <div className="absolute inset-0 overflow-visible pointer-events-none">
                    <Note delay={0}    x={-28} color="#e040fb" s={24} />
                    <Note delay={1.2}  x={115} color="#00e5ff" s={22} />
                    <Note delay={0.6}  x={40}  color="#ffd600" s={18} />
                  </div>
                </motion.div>

                {/* Audio status badge */}
                <div className="mt-3 flex items-center gap-2 px-4 py-1.5 rounded-full"
                  style={{ background: "rgba(0,0,0,0.65)", border: "1px solid rgba(255,255,255,0.07)" }}>
                  <motion.div className="w-2.5 h-2.5 rounded-full"
                    animate={audioState === "playing" ? { opacity: [1, 0.2, 1] } : {}}
                    transition={{ repeat: Infinity, duration: 0.8 }}
                    style={{ background: audioState === "playing" ? "#22c55e" : audioState === "stopped" ? "#f59e0b" : audioState === "error" ? "#ef4444" : "#6b7280" }} />
                  <span className="text-sm font-bold" style={{ color: "rgba(255,255,255,0.55)" }}>
                    {audioState === "loading" ? "جارٍ التحميل..." :
                      audioState === "playing" ? "▶ قيد التشغيل" :
                      audioState === "stopped" ? "انتهى المقطع" :
                      audioState === "error" ? "خطأ في التحميل" : "⏸ متوقف مؤقتاً"}
                  </span>
                </div>
              </div>

              {/* ── Teams + Timer row ── */}
              <div className="w-full max-w-2xl grid grid-cols-3 gap-4 items-center">
                {/* Team 1 */}
                <motion.div layout className="rounded-2xl border overflow-hidden transition-all"
                  style={{
                    borderColor: currentTurn === 1 ? "#e040fb80" : "rgba(224,64,251,0.2)",
                    background: currentTurn === 1 ? "rgba(224,64,251,0.16)" : "rgba(224,64,251,0.06)",
                    boxShadow: currentTurn === 1 ? "0 0 32px rgba(224,64,251,0.25)" : "none",
                  }}>
                  <div className="h-1.5" style={{ background: currentTurn === 1
                    ? "linear-gradient(90deg, #e040fb, #c026d3)"
                    : "rgba(224,64,251,0.15)" }} />
                  <div className="p-4 text-center">
                    <p className="text-sm font-black truncate" style={{ color: currentTurn === 1 ? "#e040fb" : "#e040fb80" }}>{team1Name}</p>
                    <p className="text-5xl font-black mt-1"
                      style={{ color: "#e040fb", textShadow: currentTurn === 1 ? "0 0 32px #e040fb" : "0 0 20px #e040fb50" }}>{team1Score}</p>
                    {currentTurn === 1 && <p className="text-xs font-black mt-1.5" style={{ color: "#e040fb" }}>⚡ دورهم</p>}
                  </div>
                </motion.div>

                {/* Timer */}
                <div className="flex flex-col items-center gap-2">
                  <div className="relative w-28 h-28">
                    <svg className="w-28 h-28 -rotate-90 absolute inset-0" viewBox="0 0 112 112">
                      <circle cx="56" cy="56" r="48" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="7" />
                      <motion.circle cx="56" cy="56" r="48" fill="none"
                        stroke={timerColor} strokeWidth="7" strokeLinecap="round"
                        strokeDasharray={`${2 * Math.PI * 48}`}
                        strokeDashoffset={`${2 * Math.PI * 48 * (1 - timerPct / 100)}`}
                        transition={{ duration: 0.6 }} />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <motion.span
                        className="text-4xl font-black tabular-nums"
                        animate={timeLeft <= 10 && timerRunning ? { scale: [1, 1.2, 1] } : {}}
                        transition={{ repeat: Infinity, duration: 0.8 }}
                        style={{ color: timerColor, textShadow: `0 0 18px ${timerColor}80` }}>
                        {timeLeft}
                      </motion.span>
                    </div>
                  </div>
                  <div className="text-xs text-purple-400/35 font-bold">{currentRound}/{totalRounds}</div>
                </div>

                {/* Team 2 */}
                <motion.div layout className="rounded-2xl border overflow-hidden transition-all"
                  style={{
                    borderColor: currentTurn === 2 ? "#00e5ff80" : "rgba(0,229,255,0.2)",
                    background: currentTurn === 2 ? "rgba(0,229,255,0.14)" : "rgba(0,229,255,0.06)",
                    boxShadow: currentTurn === 2 ? "0 0 32px rgba(0,229,255,0.22)" : "none",
                  }}>
                  <div className="h-1.5" style={{ background: currentTurn === 2
                    ? "linear-gradient(90deg, #00e5ff, #0284c7)"
                    : "rgba(0,229,255,0.15)" }} />
                  <div className="p-4 text-center">
                    <p className="text-sm font-black truncate" style={{ color: currentTurn === 2 ? "#00e5ff" : "#00e5ff80" }}>{team2Name}</p>
                    <p className="text-5xl font-black mt-1"
                      style={{ color: "#00e5ff", textShadow: currentTurn === 2 ? "0 0 32px #00e5ff" : "0 0 20px #00e5ff50" }}>{team2Score}</p>
                    {currentTurn === 2 && <p className="text-xs font-black mt-1.5" style={{ color: "#00e5ff" }}>⚡ دورهم</p>}
                  </div>
                </motion.div>
              </div>

              {/* Double badge */}
              {doubleActive && (
                <motion.div
                  animate={{ scale: [1, 1.04, 1] }}
                  transition={{ repeat: Infinity, duration: 1 }}
                  className="w-full max-w-2xl rounded-2xl border-2 py-3 text-center font-black text-2xl"
                  style={{ borderColor: "#ffd600", background: "rgba(255,214,0,0.1)", color: "#ffd600",
                    boxShadow: "0 0 28px rgba(255,214,0,0.35)" }}>
                  ⚡ DOUBLE × 2 ⚡
                </motion.div>
              )}

              {/* ── Player card ── */}
              <div className="w-full max-w-2xl rounded-3xl border border-purple-500/18 overflow-hidden"
                style={{ background: "linear-gradient(160deg, rgba(15,5,32,0.97), rgba(3,10,26,0.97))" }}>
                <div className="h-px" style={{ background: "linear-gradient(90deg, #e040fb, #7c3aed, #00e5ff)" }} />
                <div className="p-6 space-y-5">

                  {/* Volume */}
                  <div className="flex items-center gap-4">
                    <button onClick={() => setVolume(v => v === 0 ? 60 : 0)}
                      className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center border border-purple-500/20 text-purple-400/55 hover:text-purple-200 transition-all">
                      {volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
                    </button>
                    <input
                      type="range" min={0} max={100} value={volume}
                      dir="ltr"
                      onChange={e => setVolume(Number(e.target.value))}
                      className="flex-1 appearance-none h-2.5 rounded-full outline-none cursor-pointer"
                      style={{
                        background: `linear-gradient(to right, #e040fb ${volume}%, rgba(255,255,255,0.08) ${volume}%)`,
                        accentColor: "#e040fb",
                      }}
                    />
                    <span className="text-sm text-purple-400/45 w-8 text-left font-bold">{volume}</span>
                  </div>

                  {/* Playback buttons */}
                  {!showAnswer && (
                    <div className="grid grid-cols-3 gap-3">
                      <motion.button
                        onClick={audioState === "playing" ? pauseAudio : playAudio}
                        whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.95 }}
                        className="flex items-center justify-center gap-2 py-4 rounded-2xl font-black text-base"
                        style={{
                          background: audioState === "playing" ? "rgba(239,68,68,0.14)" : "rgba(34,197,94,0.14)",
                          border: `1px solid ${audioState === "playing" ? "rgba(239,68,68,0.4)" : "rgba(34,197,94,0.4)"}`,
                          color: audioState === "playing" ? "#ef4444" : "#22c55e",
                        }}>
                        {audioState === "playing"
                          ? <><Pause size={18} fill="currentColor" /> إيقاف</>
                          : <><Play size={18} fill="currentColor" /> تشغيل</>}
                      </motion.button>

                      <motion.button onClick={replayAudio}
                        whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.95 }}
                        className="flex items-center justify-center gap-2 py-4 rounded-2xl font-black text-base border border-purple-500/25 text-purple-300/60 hover:text-purple-200 transition-all">
                        <RefreshCw size={18} /> إعادة
                      </motion.button>

                      <motion.button onClick={handleShowAnswer}
                        whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.95 }}
                        className="flex items-center justify-center gap-2 py-4 rounded-2xl font-black text-base"
                        style={{ background: "rgba(251,191,36,0.11)", border: "1px solid rgba(251,191,36,0.42)", color: "#fbbf24" }}>
                        <Eye size={18} /> الإجابة
                      </motion.button>
                    </div>
                  )}

                  {/* Add minute */}
                  {!showAnswer && (
                    <motion.button onClick={addExtraTime} disabled={currentExtraUsed}
                      whileHover={currentExtraUsed ? {} : { scale: 1.02 }}
                      whileTap={currentExtraUsed ? {} : { scale: 0.97 }}
                      className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl font-black text-base border transition-all"
                      style={{
                        background: currentExtraUsed ? "rgba(99,102,241,0.04)" : "rgba(99,102,241,0.12)",
                        borderColor: currentExtraUsed ? "rgba(99,102,241,0.14)" : "rgba(99,102,241,0.44)",
                        color: currentExtraUsed ? "rgba(129,140,248,0.3)" : "#818cf8",
                        cursor: currentExtraUsed ? "not-allowed" : "pointer",
                      }}>
                      <Timer size={18} />
                      {currentExtraUsed ? "زيادة الدقيقة مستخدمة ✓" : "زيادة دقيقة  (+60 ثانية)"}
                    </motion.button>
                  )}

                  {/* Answer reveal */}
                  <AnimatePresence>
                    {showAnswer && (
                      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                        className="space-y-4">
                        {/* Song card */}
                        <div className="rounded-2xl border border-green-500/28 overflow-hidden"
                          style={{ background: "linear-gradient(135deg, rgba(34,197,94,0.09), rgba(16,185,129,0.05))" }}>
                          <div className="flex items-center gap-5 p-5">
                            <motion.img src="/song-logo.jpg" alt="🎵"
                              className="w-20 h-20 rounded-2xl object-cover flex-shrink-0"
                              style={{ border: "2px solid rgba(34,197,94,0.3)" }}
                              animate={{ scale: [1, 1.04, 1] }}
                              transition={{ repeat: Infinity, duration: 2.5 }} />
                            <div>
                              <p className="text-sm text-green-400/60 mb-1">الإجابة الصحيحة</p>
                              <p className="text-3xl font-black text-green-300">{currentSong.title}</p>
                              <p className="text-lg text-green-400/70 mt-0.5 font-bold">{currentSong.artist}</p>
                            </div>
                          </div>
                        </div>

                        {/* Award buttons */}
                        <div className="grid grid-cols-2 gap-4">
                          <motion.button onClick={() => awardPoint(1)}
                            whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                            className="py-6 rounded-2xl font-black text-xl"
                            style={{
                              background: "linear-gradient(135deg, rgba(224,64,251,0.22), rgba(224,64,251,0.09))",
                              border: "1px solid rgba(224,64,251,0.5)", color: "#e040fb",
                              boxShadow: "0 0 24px rgba(224,64,251,0.2)",
                            }}>
                            +{doubleActive ? 2 : 1}  {team1Name}
                          </motion.button>
                          <motion.button onClick={() => awardPoint(2)}
                            whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                            className="py-6 rounded-2xl font-black text-xl"
                            style={{
                              background: "linear-gradient(135deg, rgba(0,229,255,0.18), rgba(0,229,255,0.07))",
                              border: "1px solid rgba(0,229,255,0.45)", color: "#00e5ff",
                              boxShadow: "0 0 24px rgba(0,229,255,0.18)",
                            }}>
                            +{doubleActive ? 2 : 1}  {team2Name}
                          </motion.button>
                        </div>

                        <button onClick={replayAudio}
                          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-purple-500/18 text-purple-400/35 hover:text-purple-300 transition-all text-sm">
                          <RefreshCw size={14} /> إعادة تشغيل المقطع
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </motion.div>
          )}

          {/* ════════════════════ ENDED ════════════════════ */}
          {phase === "ended" && (
            <motion.div key="ended"
              initial={{ opacity: 0, scale: 0.88 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4 }}
              className="flex-1 flex flex-col items-center justify-center gap-8 px-5 py-8">

              <motion.div animate={{ y: [0, -16, 0] }} transition={{ repeat: Infinity, duration: 2.4 }}>
                <Trophy size={100} className="text-yellow-400"
                  style={{ filter: "drop-shadow(0 0 32px #ffd600)" }} />
              </motion.div>

              <div className="text-center">
                <p className="text-lg text-purple-300/35 mb-2">الفائز</p>
                <h2 className="text-5xl sm:text-6xl font-black neon-text-pink">{winner}</h2>
              </div>

              <div className="flex gap-16 justify-center">
                <div className="text-center">
                  <p className="text-base font-bold mb-2" style={{ color: "#e040fb70" }}>{team1Name}</p>
                  <p className="text-6xl font-black" style={{ color: "#e040fb" }}>{team1Score}</p>
                </div>
                <div className="flex items-center text-purple-500/25 font-black text-4xl">VS</div>
                <div className="text-center">
                  <p className="text-base font-bold mb-2" style={{ color: "#00e5ff70" }}>{team2Name}</p>
                  <p className="text-6xl font-black" style={{ color: "#00e5ff" }}>{team2Score}</p>
                </div>
              </div>

              <div className="flex gap-4 mt-2">
                <motion.button onClick={resetFull}
                  whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
                  className="px-10 py-4 rounded-2xl font-black text-lg border border-pink-500/38 text-pink-400 hover:bg-pink-500/10 transition-all">
                  لعبة جديدة
                </motion.button>
                <button onClick={() => navigate("/")}
                  className="px-10 py-4 rounded-2xl font-bold text-lg border border-purple-500/18 text-purple-400/45 hover:text-purple-300 transition-all">
                  الرئيسية
                </button>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}
