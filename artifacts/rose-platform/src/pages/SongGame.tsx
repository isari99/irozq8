import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight, Play, Trophy, Music2, SkipForward, Zap,
  RotateCcw, RefreshCw, Eye,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
type Phase = "setup" | "settings" | "control" | "play" | "ended";

const ROUND_OPTIONS = [5, 10, 15, 20, 25];
const TIMER_TOTAL = 60;

// ─── Animated music note ─────────────────────────────────────────────────────
const MusicNote = ({ delay, x, color }: { delay: number; x: number; color: string }) => (
  <motion.div
    className="absolute text-2xl pointer-events-none select-none"
    style={{ left: `${x}%`, bottom: 0, color }}
    initial={{ y: 0, opacity: 0, scale: 0.5 }}
    animate={{ y: -180, opacity: [0, 1, 1, 0], scale: [0.5, 1, 1, 0.3], rotate: [0, 15, -15, 0] }}
    transition={{ duration: 2.8, delay, repeat: Infinity, repeatDelay: 0.5 }}
  >♪</motion.div>
);

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function SongGame() {
  const [, navigate] = useLocation();

  // Phase
  const [phase, setPhase] = useState<Phase>("setup");

  // Settings
  const [team1Name, setTeam1Name] = useState("الفريق الأول");
  const [team2Name, setTeam2Name] = useState("الفريق الثاني");
  const [totalRounds, setTotalRounds] = useState(10);

  // Game state
  const [team1Score, setTeam1Score] = useState(0);
  const [team2Score, setTeam2Score] = useState(0);
  const [currentRound, setCurrentRound] = useState(0);      // scored rounds
  const [currentTurn, setCurrentTurn] = useState<1 | 2>(1); // whose turn
  const [team1DoubleUsed, setTeam1DoubleUsed] = useState(false);
  const [team2DoubleUsed, setTeam2DoubleUsed] = useState(false);
  const [doubleActive, setDoubleActive] = useState(false);   // double armed for this round
  const [showAnswer, setShowAnswer] = useState(false);

  // Timer
  const [timeLeft, setTimeLeft] = useState(TIMER_TOTAL);
  const [timerRunning, setTimerRunning] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Timer logic ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!timerRunning) { stopTimer(); return; }
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          stopTimer();
          handleTimeUp();
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => stopTimer();
  }, [timerRunning]);

  const stopTimer = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setTimerRunning(false);
  };

  const handleTimeUp = () => {
    // Auto switch turn
    setCurrentTurn(t => t === 1 ? 2 : 1);
    setDoubleActive(false);
    setShowAnswer(false);
    setPhase("control");
  };

  // ── Derived ───────────────────────────────────────────────────────────────
  const teamName = (t: 1 | 2) => t === 1 ? team1Name : team2Name;
  const teamColor = (t: 1 | 2) => t === 1 ? "#e040fb" : "#00e5ff";
  const otherTurn = currentTurn === 1 ? 2 : 1;
  const timerPct = (timeLeft / TIMER_TOTAL) * 100;
  const timerColor = timeLeft > 10 ? "#22c55e" : "#ef4444";
  const currentDoubleUsed = currentTurn === 1 ? team1DoubleUsed : team2DoubleUsed;

  // ── Actions ───────────────────────────────────────────────────────────────
  const startGame = () => {
    setTeam1Score(0); setTeam2Score(0);
    setCurrentRound(0); setCurrentTurn(1);
    setTeam1DoubleUsed(false); setTeam2DoubleUsed(false);
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
    // Switch turn only — round doesn't count
    setCurrentTurn(t => t === 1 ? 2 : 1);
    setDoubleActive(false);
    setShowAnswer(false);
  };

  const playSong = () => {
    setShowAnswer(false);
    setTimeLeft(TIMER_TOTAL);
    setTimerRunning(true);
    setPhase("play");
  };

  const replaySong = () => {
    setTimeLeft(TIMER_TOTAL);
    setTimerRunning(true);
    setShowAnswer(false);
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

    if (next >= totalRounds) {
      setPhase("ended");
    } else {
      setCurrentTurn(t => t === 1 ? 2 : 1);
      setPhase("control");
    }
  };

  const resetFull = () => {
    stopTimer();
    setPhase("setup");
  };

  const winner = team1Score > team2Score ? team1Name
    : team2Score > team1Score ? team2Name : "تعادل! 🤝";

  return (
    <div className="min-h-screen gradient-bg flex flex-col overflow-hidden" dir="rtl">
      {/* Glows */}
      <div className="absolute top-0 right-0 w-96 h-96 rounded-full opacity-10 pointer-events-none"
        style={{ background: "radial-gradient(circle, #e040fb, transparent)", filter: "blur(70px)" }} />
      <div className="absolute bottom-0 left-0 w-96 h-96 rounded-full opacity-10 pointer-events-none"
        style={{ background: "radial-gradient(circle, #00e5ff, transparent)", filter: "blur(70px)" }} />

      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-5 py-3 border-b border-purple-500/20 flex-shrink-0 z-10"
        style={{ background: "rgba(10,5,20,0.9)", backdropFilter: "blur(16px)" }}>
        <button onClick={() => navigate("/")}
          className="flex items-center gap-1.5 text-purple-300/60 hover:text-pink-400 transition-colors text-sm">
          <ArrowRight size={16} /> العودة
        </button>
        <div className="flex items-center gap-2">
          <Music2 className="text-pink-400" size={20} />
          <h1 className="text-lg font-black neon-text-pink">لعبة الأغاني</h1>
        </div>
        <div className="w-20" />
      </header>

      {/* ── BODY ──────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center p-5 overflow-y-auto z-10">
        <AnimatePresence mode="wait">

          {/* ── SETUP ── */}
          {phase === "setup" && (
            <motion.div key="setup"
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
              className="flex flex-col items-center gap-5 w-full max-w-sm">
              <div className="w-72 sm:w-80 rounded-3xl overflow-hidden border border-pink-500/25"
                style={{ boxShadow: "0 0 40px rgba(224,64,251,0.14)" }}>
                <img src="/song-hero.jpg" alt="لعبة الأغاني"
                  className="w-full h-auto object-cover block" />
              </div>
              <motion.button
                onClick={() => setPhase("settings")}
                whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
                className="flex items-center gap-2 px-10 py-3.5 rounded-2xl text-lg font-black"
                style={{ background: "linear-gradient(135deg, #e040fb, #9c27b0)",
                  boxShadow: "0 0 30px rgba(224,64,251,0.4)", color: "#fff" }}>
                <Play size={20} fill="white" /> إلعب الآن
              </motion.button>
            </motion.div>
          )}

          {/* ── SETTINGS ── */}
          {phase === "settings" && (
            <motion.div key="settings"
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
              className="w-full max-w-md space-y-6">
              <div className="text-center">
                <h2 className="text-2xl font-black text-white">إعدادات اللعبة</h2>
                <p className="text-purple-300/40 text-sm mt-1">سمّ الفريقين واختر عدد الجولات</p>
              </div>

              {/* Team names */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { val: team1Name, set: setTeam1Name, color: "#e040fb", label: "الفريق الأول" },
                  { val: team2Name, set: setTeam2Name, color: "#00e5ff", label: "الفريق الثاني" },
                ].map((t, i) => (
                  <div key={i} className="rounded-2xl border p-4 space-y-2"
                    style={{ borderColor: `${t.color}35`, background: `${t.color}08` }}>
                    <label className="block text-xs font-bold" style={{ color: t.color }}>{t.label}</label>
                    <input value={t.val} onChange={e => t.set(e.target.value)}
                      className="w-full rounded-xl px-3 py-2.5 bg-black/30 border text-white font-bold text-center text-sm"
                      style={{ borderColor: `${t.color}35` }} />
                  </div>
                ))}
              </div>

              {/* Rounds */}
              <div className="space-y-3">
                <p className="text-sm font-bold text-purple-300/60 flex items-center gap-2">
                  <Trophy size={14} /> عدد الجولات
                </p>
                <div className="grid grid-cols-5 gap-2">
                  {ROUND_OPTIONS.map(r => (
                    <button key={r} onClick={() => setTotalRounds(r)}
                      className="py-3 rounded-xl font-black text-sm border transition-all"
                      style={{
                        borderColor: totalRounds === r ? "#e040fb" : "rgba(224,64,251,0.2)",
                        background: totalRounds === r ? "rgba(224,64,251,0.2)" : "rgba(224,64,251,0.05)",
                        color: totalRounds === r ? "#e040fb" : "rgba(224,64,251,0.35)",
                        boxShadow: totalRounds === r ? "0 0 14px rgba(224,64,251,0.3)" : "none",
                      }}>
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-1">
                <button onClick={() => setPhase("setup")}
                  className="px-5 py-3 rounded-xl border border-purple-500/20 text-purple-400/50 hover:text-purple-300 transition-all text-sm font-bold">
                  رجوع
                </button>
                <motion.button onClick={startGame}
                  whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                  className="flex-1 py-3.5 rounded-2xl font-black text-lg flex items-center justify-center gap-2"
                  style={{ background: "linear-gradient(135deg, #e040fb, #9c27b0)",
                    boxShadow: "0 0 30px rgba(224,64,251,0.4)", color: "#fff" }}>
                  <Play size={20} fill="white" /> بدأ اللعبة
                </motion.button>
              </div>
            </motion.div>
          )}

          {/* ── CONTROL ── */}
          {phase === "control" && (
            <motion.div key="control"
              initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
              className="w-full max-w-lg space-y-5">

              {/* Scoreboard */}
              <div className="grid grid-cols-3 gap-3 items-center">
                {/* Team 1 */}
                <motion.div layout
                  className="rounded-2xl p-4 text-center border transition-all"
                  style={{
                    borderColor: currentTurn === 1 ? "#e040fb70" : "rgba(224,64,251,0.15)",
                    background: currentTurn === 1 ? "rgba(224,64,251,0.12)" : "rgba(10,4,20,0.7)",
                    boxShadow: currentTurn === 1 ? "0 0 24px rgba(224,64,251,0.2)" : "none",
                  }}>
                  <p className="text-xs font-bold truncate mb-1" style={{ color: "#e040fb99" }}>{team1Name}</p>
                  <p className="text-4xl font-black" style={{ color: "#e040fb", textShadow: "0 0 16px #e040fb" }}>{team1Score}</p>
                  {currentTurn === 1 && <p className="text-xs text-pink-400 mt-1 font-bold">⚡ دورهم</p>}
                </motion.div>

                {/* Middle */}
                <div className="text-center space-y-1">
                  <p className="text-2xl font-black text-purple-500/50">VS</p>
                  <p className="text-xs text-purple-400/40">{currentRound}/{totalRounds}</p>
                  <div className="h-1.5 rounded-full bg-purple-800/30 overflow-hidden">
                    <motion.div className="h-full rounded-full"
                      animate={{ width: `${(currentRound / totalRounds) * 100}%` }}
                      style={{ background: "linear-gradient(90deg, #e040fb, #00e5ff)" }} />
                  </div>
                </div>

                {/* Team 2 */}
                <motion.div layout
                  className="rounded-2xl p-4 text-center border transition-all"
                  style={{
                    borderColor: currentTurn === 2 ? "#00e5ff70" : "rgba(0,229,255,0.15)",
                    background: currentTurn === 2 ? "rgba(0,229,255,0.10)" : "rgba(10,4,20,0.7)",
                    boxShadow: currentTurn === 2 ? "0 0 24px rgba(0,229,255,0.2)" : "none",
                  }}>
                  <p className="text-xs font-bold truncate mb-1" style={{ color: "#00e5ff99" }}>{team2Name}</p>
                  <p className="text-4xl font-black" style={{ color: "#00e5ff", textShadow: "0 0 16px #00e5ff" }}>{team2Score}</p>
                  {currentTurn === 2 && <p className="text-xs text-cyan-400 mt-1 font-bold">⚡ دورهم</p>}
                </motion.div>
              </div>

              {/* Current turn banner */}
              <div className="rounded-2xl border py-3 text-center"
                style={{ borderColor: `${teamColor(currentTurn)}35`, background: `${teamColor(currentTurn)}08` }}>
                <p className="text-sm text-purple-300/40">دور</p>
                <p className="text-xl font-black" style={{ color: teamColor(currentTurn) }}>{teamName(currentTurn)}</p>
              </div>

              {/* 3 action buttons */}
              <div className="space-y-3">
                {/* تشغيل الأغنية */}
                <motion.button onClick={playSong}
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl font-black text-xl"
                  style={{ background: "linear-gradient(135deg, #22c55e, #16a34a)",
                    boxShadow: "0 0 25px rgba(34,197,94,0.35)", color: "#fff" }}>
                  <Play size={22} fill="white" /> تشغيل الأغنية
                </motion.button>

                {/* تفعيل الدبل */}
                <motion.button
                  onClick={activateDouble}
                  disabled={currentDoubleUsed}
                  whileHover={currentDoubleUsed ? {} : { scale: 1.02 }}
                  whileTap={currentDoubleUsed ? {} : { scale: 0.98 }}
                  className="w-full flex items-center justify-center gap-3 py-3.5 rounded-2xl font-black text-lg border transition-all"
                  style={{
                    background: currentDoubleUsed
                      ? "rgba(255,214,0,0.04)"
                      : doubleActive
                      ? "rgba(255,214,0,0.2)"
                      : "rgba(255,214,0,0.09)",
                    borderColor: currentDoubleUsed ? "rgba(255,214,0,0.15)" : doubleActive ? "#ffd600" : "rgba(255,214,0,0.4)",
                    color: currentDoubleUsed ? "rgba(255,214,0,0.3)" : "#ffd600",
                    boxShadow: doubleActive ? "0 0 20px rgba(255,214,0,0.3)" : "none",
                    cursor: currentDoubleUsed ? "not-allowed" : "pointer",
                  }}>
                  <Zap size={20} />
                  {currentDoubleUsed ? "الدبل مستخدم" : doubleActive ? "DOUBLE مفعّل! ×2" : "تفعيل الدبل"}
                </motion.button>

                {/* تخطي الدور */}
                <motion.button onClick={skipTurn}
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  className="w-full flex items-center justify-center gap-3 py-3 rounded-2xl font-bold border border-purple-500/25 text-purple-400/60 hover:text-purple-300 hover:border-purple-500/40 transition-all">
                  <SkipForward size={18} /> تخطي الدور
                </motion.button>
              </div>

              {/* Reset */}
              <button onClick={resetFull}
                className="w-full flex items-center justify-center gap-2 py-2 text-xs text-purple-500/30 hover:text-purple-400/50 transition-colors">
                <RotateCcw size={13} /> إعادة تعيين
              </button>
            </motion.div>
          )}

          {/* ── PLAY ── */}
          {phase === "play" && (
            <motion.div key="play"
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
              className="w-full max-w-lg space-y-4">

              {/* Teams row */}
              <div className="grid grid-cols-3 gap-3 items-center">
                <div className="rounded-2xl p-4 text-center border border-pink-500/25 bg-pink-500/08">
                  <p className="text-xs font-bold text-pink-400/60 mb-1 truncate">{team1Name}</p>
                  <p className="text-4xl font-black" style={{ color: "#e040fb", textShadow: "0 0 16px #e040fb" }}>{team1Score}</p>
                </div>

                {/* Music + Timer */}
                <div className="flex flex-col items-center gap-2">
                  {/* Timer ring */}
                  <div className="relative w-20 h-20">
                    <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
                      <circle cx="40" cy="40" r="34" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="5" />
                      <motion.circle cx="40" cy="40" r="34" fill="none"
                        stroke={timerColor} strokeWidth="5" strokeLinecap="round"
                        strokeDasharray={`${2 * Math.PI * 34}`}
                        strokeDashoffset={`${2 * Math.PI * 34 * (1 - timerPct / 100)}`}
                        transition={{ duration: 0.7 }} />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-2xl font-black" style={{ color: timerColor }}>{timeLeft}</span>
                    </div>
                  </div>
                  {/* Floating music notes */}
                  <div className="relative w-12 h-8 overflow-visible">
                    <MusicNote delay={0}   x={10} color="#e040fb" />
                    <MusicNote delay={0.8} x={50} color="#00e5ff" />
                    <MusicNote delay={1.6} x={80} color="#ffd600" />
                  </div>
                </div>

                <div className="rounded-2xl p-4 text-center border border-cyan-500/25 bg-cyan-500/08">
                  <p className="text-xs font-bold text-cyan-400/60 mb-1 truncate">{team2Name}</p>
                  <p className="text-4xl font-black" style={{ color: "#00e5ff", textShadow: "0 0 16px #00e5ff" }}>{team2Score}</p>
                </div>
              </div>

              {/* Double badge */}
              {doubleActive && (
                <motion.div animate={{ scale: [1, 1.06, 1] }} transition={{ repeat: Infinity, duration: 1 }}
                  className="rounded-2xl border-2 border-yellow-400/80 bg-yellow-400/10 py-3 text-center font-black text-yellow-400 text-xl"
                  style={{ boxShadow: "0 0 20px rgba(255,214,0,0.3)" }}>
                  ⚡ DOUBLE × 2 ⚡
                </motion.div>
              )}

              {/* Replay + Show answer */}
              {!showAnswer && (
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={replaySong}
                    className="flex items-center justify-center gap-2 py-3.5 rounded-2xl font-bold border border-purple-500/25 text-purple-300/60 hover:text-purple-200 hover:border-purple-500/40 transition-all">
                    <RefreshCw size={16} /> إعادة الأغنية
                  </button>
                  <motion.button onClick={() => { stopTimer(); setShowAnswer(true); }}
                    whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                    className="flex items-center justify-center gap-2 py-3.5 rounded-2xl font-bold"
                    style={{ background: "rgba(251,191,36,0.15)", border: "1px solid rgba(251,191,36,0.45)", color: "#fbbf24" }}>
                    <Eye size={16} /> إظهار الإجابة
                  </motion.button>
                </div>
              )}

              {/* Answer + Point buttons */}
              <AnimatePresence>
                {showAnswer && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    className="space-y-3">
                    <div className="rounded-2xl border border-green-500/40 bg-green-500/08 py-3 text-center">
                      <p className="text-xs text-green-400/60 mb-0.5">الإجابة الصحيحة</p>
                      <p className="text-lg font-black text-green-300">أغنية تشغيل الهوست</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <motion.button onClick={() => awardPoint(1)}
                        whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                        className="py-4 rounded-2xl font-black text-base"
                        style={{ background: "linear-gradient(135deg, rgba(224,64,251,0.25), rgba(224,64,251,0.1))",
                          border: "1px solid rgba(224,64,251,0.55)", color: "#e040fb",
                          boxShadow: "0 0 18px rgba(224,64,251,0.2)" }}>
                        +{doubleActive ? 2 : 1} {team1Name}
                      </motion.button>
                      <motion.button onClick={() => awardPoint(2)}
                        whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                        className="py-4 rounded-2xl font-black text-base"
                        style={{ background: "linear-gradient(135deg, rgba(0,229,255,0.2), rgba(0,229,255,0.08))",
                          border: "1px solid rgba(0,229,255,0.5)", color: "#00e5ff",
                          boxShadow: "0 0 18px rgba(0,229,255,0.18)" }}>
                        +{doubleActive ? 2 : 1} {team2Name}
                      </motion.button>
                    </div>
                    <button onClick={replaySong}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-purple-500/20 text-purple-400/50 hover:text-purple-300 transition-all text-sm">
                      <RefreshCw size={14} /> إعادة تشغيل الأغنية
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {/* ── ENDED ── */}
          {phase === "ended" && (
            <motion.div key="ended"
              initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center gap-6 text-center py-8 w-full max-w-sm">
              <motion.div animate={{ y: [0, -12, 0] }} transition={{ repeat: Infinity, duration: 2.2 }}>
                <Trophy size={80} className="text-yellow-400" style={{ filter: "drop-shadow(0 0 24px #ffd600)" }} />
              </motion.div>

              <div>
                <p className="text-purple-300/40 text-sm mb-1">الفائز</p>
                <h2 className="text-4xl font-black neon-text-pink">{winner}</h2>
              </div>

              <div className="flex gap-12 w-full justify-center">
                <div className="text-center">
                  <p className="text-sm font-bold mb-1" style={{ color: "#e040fb80" }}>{team1Name}</p>
                  <p className="text-4xl font-black" style={{ color: "#e040fb" }}>{team1Score}</p>
                </div>
                <div className="flex items-center text-purple-500/30 font-black text-2xl">VS</div>
                <div className="text-center">
                  <p className="text-sm font-bold mb-1" style={{ color: "#00e5ff80" }}>{team2Name}</p>
                  <p className="text-4xl font-black" style={{ color: "#00e5ff" }}>{team2Score}</p>
                </div>
              </div>

              <div className="flex gap-3 mt-2">
                <motion.button onClick={() => { resetFull(); }}
                  whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
                  className="px-7 py-3 rounded-2xl font-black border border-pink-500/35 text-pink-400 hover:bg-pink-500/10 transition-all">
                  لعبة جديدة
                </motion.button>
                <button onClick={() => navigate("/")}
                  className="px-7 py-3 rounded-2xl font-bold border border-purple-500/20 text-purple-400/50 hover:text-purple-300 transition-all">
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
