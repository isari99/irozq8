import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight, Play, Pause, Trophy, Music2, SkipForward, Zap,
  RotateCcw, RefreshCw, Eye, Volume2, VolumeX, Timer, Star,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
type Phase = "setup" | "settings" | "control" | "play" | "ended";

interface Song {
  id: number;
  title: string;
  artist: string;
  youtubeId: string;
  clipStart: number; // seconds
  clipEnd: number;   // seconds — must be clipStart + ~20
}

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady?: () => void;
    _ytApiReady?: boolean;
  }
}

// ─── Song bank ────────────────────────────────────────────────────────────────
// clipEnd = clipStart + 20  →  exactly 20-second vocal clip
const SONGS: Song[] = [
  {
    id: 1,
    title: "يا نور العين",
    artist: "مطرف المطرف",
    youtubeId: "WlqefHeYYR0",
    clipStart: 45,  // 0:45 — vocal chorus
    clipEnd: 65,    // 1:05 — 20-second clip, stops automatically
  },
  // ── لإضافة أغنية جديدة: { id: 2, title: "...", artist: "...", youtubeId: "...", clipStart: X, clipEnd: X+20 }
];

const ROUND_OPTIONS = [5, 10, 15, 20, 25];
const TIMER_BASE = 60;
const EXTRA_TIME = 60;

// ─── YouTube loader ───────────────────────────────────────────────────────────
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

// ─── Floating note ────────────────────────────────────────────────────────────
const Note = ({ delay, x, color, s = 24 }: { delay: number; x: number; color: string; s?: number }) => (
  <motion.span className="absolute pointer-events-none select-none font-black"
    style={{ left: `${x}%`, bottom: 0, color, fontSize: s }}
    initial={{ y: 0, opacity: 0 }}
    animate={{ y: -200, opacity: [0, 1, 1, 0], rotate: [0, 18, -14, 4], scale: [0.4, 1.1, 1, 0.3] }}
    transition={{ duration: 3, delay, repeat: Infinity, repeatDelay: 0.5 }}>
    ♪
  </motion.span>
);

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function SongGame() {
  const [, navigate] = useLocation();
  const [phase, setPhase] = useState<Phase>("setup");

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
  const [volume, setVolume] = useState(60); // 0-100, default 60 (not too loud)
  const clipWatchRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Derived ───────────────────────────────────────────────────────────────
  const currentSong: Song = SONGS[currentSongIndex % SONGS.length];
  const teamColor = (t: 1 | 2) => t === 1 ? "#e040fb" : "#00e5ff";
  const teamName = (t: 1 | 2) => t === 1 ? team1Name : team2Name;
  const currentDoubleUsed = currentTurn === 1 ? team1DoubleUsed : team2DoubleUsed;
  const currentExtraUsed = currentTurn === 1 ? team1ExtraUsed : team2ExtraUsed;
  const timerMax = TIMER_BASE + (
    (currentTurn === 1 ? !team1ExtraUsed : !team2ExtraUsed) ? EXTRA_TIME : 0
  );
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
          stopTimer();
          setCurrentTurn(prev => prev === 1 ? 2 : 1);
          setDoubleActive(false);
          setShowAnswer(false);
          setPhase("control");
          return 0;
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

  // ── YouTube clip management ───────────────────────────────────────────────
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

  // Watch clip time — STOP (not loop) when clipEnd is reached
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
          autoplay: 1,
          start: currentSong.clipStart,
          controls: 0,
          modestbranding: 1,
          rel: 0, fs: 0,
          iv_load_policy: 3,
          disablekb: 1,
          playsinline: 1,
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
            else if (e.data === S?.PAUSED) {
              // Only set to paused if we didn't manually stop it at clip end
              setAudioState(prev => prev === "stopped" ? "stopped" : "paused");
            }
          },
          onError: () => setAudioState("error"),
        },
      });
    }).catch(() => setAudioState("error"));

    return () => destroyPlayer();
  }, [phase, currentSongIndex]);

  // Sync volume to player
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

  // ── Game actions ──────────────────────────────────────────────────────────
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

  const resetFull = () => { stopTimer(); destroyPlayer(); setPhase("setup"); };
  const winner = team1Score > team2Score ? team1Name : team2Score > team1Score ? team2Name : "تعادل! 🤝";

  // ── Control Scoreboard ────────────────────────────────────────────────────
  const ControlScoreboard = () => (
    <div className="grid grid-cols-3 gap-3 items-stretch">
      <motion.div layout className="rounded-2xl overflow-hidden border transition-all"
        style={{
          borderColor: currentTurn === 1 ? "#e040fb60" : "rgba(224,64,251,0.12)",
          background: currentTurn === 1 ? "rgba(224,64,251,0.12)" : "rgba(8,3,18,0.8)",
          boxShadow: currentTurn === 1 ? "0 0 28px rgba(224,64,251,0.2)" : "none",
        }}>
        {currentTurn === 1 && <div className="h-0.5" style={{ background: "linear-gradient(90deg, #e040fb, #c026d3)" }} />}
        <div className="p-4 text-center">
          <div className="w-10 h-10 rounded-xl mx-auto mb-2 flex items-center justify-center"
            style={{ background: "rgba(224,64,251,0.14)", border: "1px solid rgba(224,64,251,0.3)" }}>
            <Star size={18} style={{ color: "#e040fb" }} />
          </div>
          <p className="text-xs font-bold truncate mb-1" style={{ color: "#e040fb80" }}>{team1Name}</p>
          <p className="text-5xl font-black" style={{ color: "#e040fb", textShadow: "0 0 18px #e040fb80" }}>{team1Score}</p>
          {currentTurn === 1 && <p className="text-xs font-bold mt-1.5" style={{ color: "#e040fb" }}>⚡ دورهم</p>}
        </div>
      </motion.div>

      <div className="flex flex-col items-center justify-center gap-2">
        <div className="text-base font-black" style={{ color: "rgba(167,139,250,0.4)" }}>VS</div>
        <div className="text-xs text-purple-400/40 font-bold">{currentRound}/{totalRounds}</div>
        <div className="w-full h-1.5 rounded-full overflow-hidden bg-purple-900/30">
          <motion.div className="h-full rounded-full"
            animate={{ width: `${(currentRound / totalRounds) * 100}%` }}
            style={{ background: "linear-gradient(90deg, #e040fb, #7c3aed, #00e5ff)" }} />
        </div>
      </div>

      <motion.div layout className="rounded-2xl overflow-hidden border transition-all"
        style={{
          borderColor: currentTurn === 2 ? "#00e5ff60" : "rgba(0,229,255,0.12)",
          background: currentTurn === 2 ? "rgba(0,229,255,0.10)" : "rgba(8,3,18,0.8)",
          boxShadow: currentTurn === 2 ? "0 0 28px rgba(0,229,255,0.18)" : "none",
        }}>
        {currentTurn === 2 && <div className="h-0.5" style={{ background: "linear-gradient(90deg, #00e5ff, #0284c7)" }} />}
        <div className="p-4 text-center">
          <div className="w-10 h-10 rounded-xl mx-auto mb-2 flex items-center justify-center"
            style={{ background: "rgba(0,229,255,0.14)", border: "1px solid rgba(0,229,255,0.3)" }}>
            <Star size={18} style={{ color: "#00e5ff" }} />
          </div>
          <p className="text-xs font-bold truncate mb-1" style={{ color: "#00e5ff80" }}>{team2Name}</p>
          <p className="text-5xl font-black" style={{ color: "#00e5ff", textShadow: "0 0 18px #00e5ff80" }}>{team2Score}</p>
          {currentTurn === 2 && <p className="text-xs font-bold mt-1.5" style={{ color: "#00e5ff" }}>⚡ دورهم</p>}
        </div>
      </motion.div>
    </div>
  );

  return (
    <div className="min-h-screen gradient-bg flex flex-col overflow-hidden" dir="rtl">
      {/* Ambient glows */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 right-0 w-[600px] h-[600px] rounded-full"
          style={{ background: "radial-gradient(circle, rgba(224,64,251,0.07), transparent)", filter: "blur(80px)", transform: "translate(25%,-25%)" }} />
        <div className="absolute bottom-0 left-0 w-[600px] h-[600px] rounded-full"
          style={{ background: "radial-gradient(circle, rgba(0,229,255,0.07), transparent)", filter: "blur(80px)", transform: "translate(-25%,25%)" }} />
      </div>

      {/* Hidden YouTube mount */}
      {phase === "play" && (
        <div style={{ position: "fixed", top: -2, left: -2, width: 1, height: 1, overflow: "hidden", zIndex: -10 }}>
          <div ref={ytContainerRef} />
        </div>
      )}

      {/* ── HEADER ── */}
      <header className="flex items-center justify-between px-5 py-3 border-b border-white/[0.05] flex-shrink-0 z-10"
        style={{ background: "rgba(5,2,14,0.94)", backdropFilter: "blur(20px)" }}>
        <button onClick={() => navigate("/")}
          className="flex items-center gap-1.5 text-purple-300/45 hover:text-pink-400 transition-colors text-sm">
          <ArrowRight size={16} /> العودة
        </button>
        <div className="flex items-center gap-2">
          <Music2 className="text-pink-400" size={18} />
          <span className="text-base font-black neon-text-pink">لعبة الأغاني</span>
        </div>
        <div className="w-20" />
      </header>

      {/* ── BODY ── */}
      <div className="flex-1 flex items-center justify-center p-4 overflow-y-auto z-10">
        <AnimatePresence mode="wait">

          {/* ──────── SETUP ──────── */}
          {phase === "setup" && (
            <motion.div key="setup"
              initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
              className="flex flex-col items-center gap-6 w-full max-w-sm">
              <motion.div
                animate={{ scale: [1, 1.02, 1] }}
                transition={{ duration: 3.5, repeat: Infinity }}
                className="w-72 sm:w-80 rounded-3xl overflow-hidden border border-pink-500/25"
                style={{ boxShadow: "0 0 60px rgba(224,64,251,0.18)" }}>
                <img src="/song-hero.jpg" alt="لعبة الأغاني" className="w-full h-auto object-cover block" />
              </motion.div>
              <motion.button onClick={() => setPhase("settings")}
                whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.97 }}
                className="flex items-center gap-2 px-12 py-4 rounded-2xl text-xl font-black"
                style={{ background: "linear-gradient(135deg, #e040fb, #9c27b0)",
                  boxShadow: "0 0 40px rgba(224,64,251,0.5)", color: "#fff" }}>
                <Play size={22} fill="white" /> إلعب الآن
              </motion.button>
            </motion.div>
          )}

          {/* ──────── SETTINGS ──────── */}
          {phase === "settings" && (
            <motion.div key="settings"
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
              className="w-full max-w-md space-y-6">
              <div className="text-center">
                <h2 className="text-2xl font-black text-white">إعدادات اللعبة</h2>
                <p className="text-purple-300/35 text-sm mt-1">سمّ الفريقين واختر عدد الجولات</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { val: team1Name, set: setTeam1Name, color: "#e040fb", label: "الفريق الأول" },
                  { val: team2Name, set: setTeam2Name, color: "#00e5ff", label: "الفريق الثاني" },
                ].map((t, i) => (
                  <div key={i} className="rounded-2xl border p-4 space-y-2"
                    style={{ borderColor: `${t.color}28`, background: `${t.color}06` }}>
                    <label className="block text-xs font-bold" style={{ color: t.color }}>{t.label}</label>
                    <input value={t.val} onChange={e => t.set(e.target.value)}
                      className="w-full rounded-xl px-3 py-2.5 bg-black/30 border text-white font-bold text-center"
                      style={{ borderColor: `${t.color}28` }} />
                  </div>
                ))}
              </div>
              <div className="space-y-3">
                <p className="text-sm font-bold text-purple-300/50 flex items-center gap-2">
                  <Trophy size={14} /> عدد الجولات
                </p>
                <div className="grid grid-cols-5 gap-2">
                  {ROUND_OPTIONS.map(r => (
                    <button key={r} onClick={() => setTotalRounds(r)}
                      className="py-3 rounded-xl font-black text-sm border transition-all"
                      style={{
                        borderColor: totalRounds === r ? "#e040fb" : "rgba(224,64,251,0.18)",
                        background: totalRounds === r ? "rgba(224,64,251,0.2)" : "rgba(224,64,251,0.04)",
                        color: totalRounds === r ? "#e040fb" : "rgba(224,64,251,0.3)",
                        boxShadow: totalRounds === r ? "0 0 16px rgba(224,64,251,0.3)" : "none",
                      }}>{r}</button>
                  ))}
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setPhase("setup")}
                  className="px-5 py-3 rounded-xl border border-purple-500/20 text-purple-400/45 text-sm font-bold hover:text-purple-300 transition-all">
                  رجوع
                </button>
                <motion.button onClick={startGame}
                  whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                  className="flex-1 py-3.5 rounded-2xl font-black text-lg flex items-center justify-center gap-2"
                  style={{ background: "linear-gradient(135deg, #e040fb, #9c27b0)",
                    boxShadow: "0 0 32px rgba(224,64,251,0.4)", color: "#fff" }}>
                  <Play size={20} fill="white" /> بدأ اللعبة
                </motion.button>
              </div>
            </motion.div>
          )}

          {/* ──────── CONTROL ──────── */}
          {phase === "control" && (
            <motion.div key="control"
              initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
              className="w-full max-w-lg space-y-4">
              <ControlScoreboard />
              <div className="rounded-2xl border py-4 text-center"
                style={{ borderColor: `${teamColor(currentTurn)}28`, background: `${teamColor(currentTurn)}06` }}>
                <p className="text-sm text-purple-300/35">الدور الحالي</p>
                <p className="text-2xl font-black mt-0.5" style={{ color: teamColor(currentTurn) }}>{teamName(currentTurn)}</p>
              </div>
              <div className="space-y-2.5">
                <motion.button onClick={playSong}
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  className="w-full flex items-center justify-center gap-3 py-5 rounded-2xl font-black text-2xl"
                  style={{ background: "linear-gradient(135deg, #22c55e, #16a34a)",
                    boxShadow: "0 0 30px rgba(34,197,94,0.4)", color: "#fff" }}>
                  <Play size={24} fill="white" /> تشغيل الأغنية
                </motion.button>
                <motion.button onClick={activateDouble} disabled={currentDoubleUsed}
                  whileHover={currentDoubleUsed ? {} : { scale: 1.02 }}
                  whileTap={currentDoubleUsed ? {} : { scale: 0.98 }}
                  className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl font-black text-xl border transition-all"
                  style={{
                    background: currentDoubleUsed ? "rgba(255,214,0,0.03)" : doubleActive ? "rgba(255,214,0,0.2)" : "rgba(255,214,0,0.08)",
                    borderColor: currentDoubleUsed ? "rgba(255,214,0,0.12)" : doubleActive ? "#ffd600" : "rgba(255,214,0,0.38)",
                    color: currentDoubleUsed ? "rgba(255,214,0,0.28)" : "#ffd600",
                    boxShadow: doubleActive ? "0 0 24px rgba(255,214,0,0.35)" : "none",
                    cursor: currentDoubleUsed ? "not-allowed" : "pointer",
                  }}>
                  <Zap size={22} />
                  {currentDoubleUsed ? "الدبل مستخدم ✓" : doubleActive ? "DOUBLE مفعّل ×2 ⚡" : "تفعيل الدبل"}
                </motion.button>
                <motion.button onClick={skipTurn}
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  className="w-full flex items-center justify-center gap-3 py-3.5 rounded-2xl font-bold text-lg border border-purple-500/20 text-purple-400/55 hover:text-purple-200 hover:border-purple-500/35 transition-all">
                  <SkipForward size={20} /> تخطي الدور
                </motion.button>
              </div>
              <button onClick={resetFull}
                className="w-full flex items-center justify-center gap-2 py-2 text-xs text-purple-500/25 hover:text-purple-400/45 transition-colors">
                <RotateCcw size={12} /> إعادة تعيين اللعبة
              </button>
            </motion.div>
          )}

          {/* ──────── PLAY ──────── */}
          {phase === "play" && (
            <motion.div key="play"
              initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
              className="w-full max-w-lg flex flex-col gap-4">

              {/* ── BIG LOGO HERO ── */}
              <div className="relative flex justify-center">
                <motion.div className="relative"
                  animate={{ y: [0, -6, 0] }}
                  transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}>
                  <motion.img src="/song-logo.jpg" alt="🎵"
                    className="w-28 h-28 rounded-full object-cover"
                    style={{
                      border: `3px solid ${teamColor(currentTurn)}60`,
                      boxShadow: `0 0 40px ${teamColor(currentTurn)}40, 0 0 80px ${teamColor(currentTurn)}20`,
                    }}
                    animate={audioState === "playing" ? { scale: [1, 1.06, 1] } : {}}
                    transition={{ repeat: Infinity, duration: 1.3 }} />
                  {/* Floating notes around logo */}
                  <div className="absolute inset-0 overflow-visible pointer-events-none">
                    <Note delay={0}   x={-30} color="#e040fb" s={20} />
                    <Note delay={1}   x={110} color="#00e5ff" s={18} />
                    <Note delay={0.5} x={40}  color="#ffd600" s={16} />
                  </div>
                </motion.div>

                {/* Status dot */}
                <div className="absolute bottom-0 right-[calc(50%-56px-8px)] flex items-center gap-1.5 px-2 py-1 rounded-full"
                  style={{ background: "rgba(0,0,0,0.7)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <motion.div className="w-2 h-2 rounded-full"
                    animate={audioState === "playing" ? { opacity: [1, 0.2, 1] } : {}}
                    transition={{ repeat: Infinity, duration: 0.8 }}
                    style={{ background: audioState === "playing" ? "#22c55e" : audioState === "stopped" ? "#f59e0b" : audioState === "error" ? "#ef4444" : "#6b7280" }} />
                  <span className="text-[10px] text-white/50">
                    {audioState === "loading" ? "تحميل" : audioState === "playing" ? "تشغيل" :
                      audioState === "stopped" ? "انتهى المقطع" : audioState === "error" ? "خطأ" : "متوقف"}
                  </span>
                </div>
              </div>

              {/* ── TEAMS ── */}
              <div className="grid grid-cols-3 gap-3 items-center">
                {/* Team 1 */}
                <div className="rounded-2xl border overflow-hidden"
                  style={{ borderColor: "rgba(224,64,251,0.22)", background: "rgba(224,64,251,0.07)" }}>
                  <div className="h-0.5 w-full" style={{ background: "linear-gradient(90deg, #e040fb, #c026d3)" }} />
                  <div className="p-4 text-center">
                    <p className="text-sm font-bold truncate" style={{ color: "#e040fb80" }}>{team1Name}</p>
                    <p className="text-5xl font-black mt-1" style={{ color: "#e040fb", textShadow: "0 0 24px #e040fb80" }}>{team1Score}</p>
                  </div>
                </div>

                {/* Center timer */}
                <div className="flex flex-col items-center gap-1">
                  <div className="relative w-24 h-24">
                    <svg className="w-24 h-24 -rotate-90 absolute inset-0" viewBox="0 0 96 96">
                      <circle cx="48" cy="48" r="42" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="6" />
                      <motion.circle cx="48" cy="48" r="42" fill="none"
                        stroke={timerColor} strokeWidth="6" strokeLinecap="round"
                        strokeDasharray={`${2 * Math.PI * 42}`}
                        strokeDashoffset={`${2 * Math.PI * 42 * (1 - timerPct / 100)}`}
                        transition={{ duration: 0.6 }} />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <motion.span className="text-3xl font-black tabular-nums"
                        animate={timeLeft <= 10 && timerRunning ? { scale: [1, 1.2, 1] } : {}}
                        transition={{ repeat: Infinity, duration: 0.8 }}
                        style={{ color: timerColor, textShadow: `0 0 14px ${timerColor}80` }}>
                        {timeLeft}
                      </motion.span>
                    </div>
                  </div>
                  <div className="text-xs text-purple-400/35 font-bold">{currentRound}/{totalRounds}</div>
                </div>

                {/* Team 2 */}
                <div className="rounded-2xl border overflow-hidden"
                  style={{ borderColor: "rgba(0,229,255,0.22)", background: "rgba(0,229,255,0.07)" }}>
                  <div className="h-0.5 w-full" style={{ background: "linear-gradient(90deg, #00e5ff, #0284c7)" }} />
                  <div className="p-4 text-center">
                    <p className="text-sm font-bold truncate" style={{ color: "#00e5ff80" }}>{team2Name}</p>
                    <p className="text-5xl font-black mt-1" style={{ color: "#00e5ff", textShadow: "0 0 24px #00e5ff80" }}>{team2Score}</p>
                  </div>
                </div>
              </div>

              {/* Double badge */}
              {doubleActive && (
                <motion.div animate={{ scale: [1, 1.04, 1] }} transition={{ repeat: Infinity, duration: 1 }}
                  className="rounded-2xl border-2 py-2.5 text-center font-black text-xl"
                  style={{ borderColor: "#ffd600", background: "rgba(255,214,0,0.1)", color: "#ffd600",
                    boxShadow: "0 0 24px rgba(255,214,0,0.3)" }}>
                  ⚡ DOUBLE × 2 ⚡
                </motion.div>
              )}

              {/* ── PLAYER CARD ── */}
              <div className="rounded-3xl border border-purple-500/18 overflow-hidden"
                style={{ background: "linear-gradient(160deg, rgba(15,5,32,0.97), rgba(3,10,26,0.97))" }}>
                <div className="h-px" style={{ background: "linear-gradient(90deg, #e040fb, #7c3aed, #00e5ff)" }} />
                <div className="p-5 space-y-4">

                  {/* ── Volume control ── */}
                  <div className="flex items-center gap-3">
                    <button onClick={() => setVolume(v => v === 0 ? 60 : 0)}
                      className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center border border-purple-500/20 text-purple-400/50 hover:text-purple-200 transition-all">
                      {volume === 0 ? <VolumeX size={17} /> : <Volume2 size={17} />}
                    </button>
                    <div className="flex-1 relative">
                      <input type="range" min={0} max={100} value={volume}
                        onChange={e => setVolume(Number(e.target.value))}
                        className="w-full appearance-none h-2 rounded-full outline-none cursor-pointer"
                        style={{
                          background: `linear-gradient(to left, rgba(255,255,255,0.08) ${100 - volume}%, #e040fb ${100 - volume}%)`,
                          accentColor: "#e040fb",
                        }} />
                    </div>
                    <span className="text-xs text-purple-400/40 w-7 text-left">{volume}</span>
                  </div>

                  {/* ── Playback controls ── */}
                  {!showAnswer && (
                    <div className="grid grid-cols-3 gap-2">
                      {/* Play / Pause */}
                      <motion.button
                        onClick={audioState === "playing" ? pauseAudio : playAudio}
                        whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.95 }}
                        className="flex items-center justify-center gap-1.5 py-3.5 rounded-2xl font-bold"
                        style={{
                          background: audioState === "playing" ? "rgba(239,68,68,0.14)" : "rgba(34,197,94,0.14)",
                          border: `1px solid ${audioState === "playing" ? "rgba(239,68,68,0.4)" : "rgba(34,197,94,0.4)"}`,
                          color: audioState === "playing" ? "#ef4444" : "#22c55e",
                          fontSize: 14,
                        }}>
                        {audioState === "playing"
                          ? <><Pause size={16} fill="currentColor" /> إيقاف</>
                          : <><Play size={16} fill="currentColor" /> تشغيل</>}
                      </motion.button>

                      {/* Replay */}
                      <motion.button onClick={replayAudio}
                        whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.95 }}
                        className="flex items-center justify-center gap-1.5 py-3.5 rounded-2xl font-bold border border-purple-500/22 text-purple-300/55 hover:text-purple-200 transition-all"
                        style={{ fontSize: 14 }}>
                        <RefreshCw size={16} /> إعادة
                      </motion.button>

                      {/* Show answer */}
                      <motion.button onClick={handleShowAnswer}
                        whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.95 }}
                        className="flex items-center justify-center gap-1.5 py-3.5 rounded-2xl font-bold"
                        style={{ background: "rgba(251,191,36,0.11)", border: "1px solid rgba(251,191,36,0.4)",
                          color: "#fbbf24", fontSize: 14 }}>
                        <Eye size={16} /> الإجابة
                      </motion.button>
                    </div>
                  )}

                  {/* ── Add minute ── */}
                  {!showAnswer && (
                    <motion.button onClick={addExtraTime} disabled={currentExtraUsed}
                      whileHover={currentExtraUsed ? {} : { scale: 1.02 }}
                      whileTap={currentExtraUsed ? {} : { scale: 0.97 }}
                      className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl font-bold border transition-all"
                      style={{
                        background: currentExtraUsed ? "rgba(99,102,241,0.04)" : "rgba(99,102,241,0.12)",
                        borderColor: currentExtraUsed ? "rgba(99,102,241,0.14)" : "rgba(99,102,241,0.42)",
                        color: currentExtraUsed ? "rgba(129,140,248,0.28)" : "#818cf8",
                        cursor: currentExtraUsed ? "not-allowed" : "pointer",
                        fontSize: 14,
                      }}>
                      <Timer size={16} />
                      {currentExtraUsed ? "زيادة الدقيقة مستخدمة ✓" : "+60 ثانية"}
                    </motion.button>
                  )}

                  {/* ── Answer panel ── */}
                  <AnimatePresence>
                    {showAnswer && (
                      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                        className="space-y-3">
                        {/* Answer card */}
                        <div className="rounded-2xl border border-green-500/28 overflow-hidden"
                          style={{ background: "linear-gradient(135deg, rgba(34,197,94,0.08), rgba(16,185,129,0.05))" }}>
                          <div className="flex items-center gap-4 p-4">
                            <motion.img src="/song-logo.jpg" alt="🎵"
                              className="w-16 h-16 rounded-2xl object-cover flex-shrink-0"
                              style={{ border: "2px solid rgba(34,197,94,0.28)" }}
                              animate={{ scale: [1, 1.04, 1] }}
                              transition={{ repeat: Infinity, duration: 2.5 }} />
                            <div>
                              <p className="text-xs text-green-400/55 mb-0.5">الإجابة الصحيحة</p>
                              <p className="text-2xl font-black text-green-300">{currentSong.title}</p>
                              <p className="text-sm text-green-400/65 mt-0.5 font-bold">{currentSong.artist}</p>
                            </div>
                          </div>
                        </div>

                        {/* Point buttons */}
                        <div className="grid grid-cols-2 gap-3">
                          <motion.button onClick={() => awardPoint(1)}
                            whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                            className="py-5 rounded-2xl font-black text-lg"
                            style={{ background: "linear-gradient(135deg, rgba(224,64,251,0.22), rgba(224,64,251,0.09))",
                              border: "1px solid rgba(224,64,251,0.5)", color: "#e040fb",
                              boxShadow: "0 0 20px rgba(224,64,251,0.18)" }}>
                            +{doubleActive ? 2 : 1} {team1Name}
                          </motion.button>
                          <motion.button onClick={() => awardPoint(2)}
                            whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                            className="py-5 rounded-2xl font-black text-lg"
                            style={{ background: "linear-gradient(135deg, rgba(0,229,255,0.18), rgba(0,229,255,0.07))",
                              border: "1px solid rgba(0,229,255,0.45)", color: "#00e5ff",
                              boxShadow: "0 0 20px rgba(0,229,255,0.16)" }}>
                            +{doubleActive ? 2 : 1} {team2Name}
                          </motion.button>
                        </div>

                        {/* Replay after answer */}
                        <button onClick={replayAudio}
                          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-purple-500/18 text-purple-400/35 hover:text-purple-300 transition-all text-xs">
                          <RefreshCw size={13} /> إعادة تشغيل المقطع
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </motion.div>
          )}

          {/* ──────── ENDED ──────── */}
          {phase === "ended" && (
            <motion.div key="ended"
              initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center gap-6 text-center py-8 w-full max-w-sm">
              <motion.div animate={{ y: [0, -14, 0] }} transition={{ repeat: Infinity, duration: 2.2 }}>
                <Trophy size={90} className="text-yellow-400" style={{ filter: "drop-shadow(0 0 28px #ffd600)" }} />
              </motion.div>
              <div>
                <p className="text-purple-300/35 text-sm mb-1">الفائز</p>
                <h2 className="text-5xl font-black neon-text-pink">{winner}</h2>
              </div>
              <div className="flex gap-14 justify-center w-full">
                <div className="text-center">
                  <p className="text-sm font-bold mb-1" style={{ color: "#e040fb70" }}>{team1Name}</p>
                  <p className="text-5xl font-black" style={{ color: "#e040fb" }}>{team1Score}</p>
                </div>
                <div className="flex items-center text-purple-500/25 font-black text-3xl">VS</div>
                <div className="text-center">
                  <p className="text-sm font-bold mb-1" style={{ color: "#00e5ff70" }}>{team2Name}</p>
                  <p className="text-5xl font-black" style={{ color: "#00e5ff" }}>{team2Score}</p>
                </div>
              </div>
              <div className="flex gap-3 mt-2">
                <motion.button onClick={resetFull}
                  whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
                  className="px-8 py-3.5 rounded-2xl font-black border border-pink-500/35 text-pink-400 hover:bg-pink-500/10 transition-all">
                  لعبة جديدة
                </motion.button>
                <button onClick={() => navigate("/")}
                  className="px-8 py-3.5 rounded-2xl font-bold border border-purple-500/18 text-purple-400/45 hover:text-purple-300 transition-all">
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
