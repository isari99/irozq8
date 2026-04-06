import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight, Trophy, CheckCircle2, Wifi, WifiOff,
  Play, SkipForward, RotateCcw, Clock, Users,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";
interface QuestionResult {
  username: string;
  answer: number;
  correct: boolean;
  points: number;
  rank: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const CHOICE_COLORS = [
  { color: "#e040fb", border: "#e040fb50", bg: "#e040fb12", ring: "#e040fb60" },
  { color: "#00e5ff", border: "#00e5ff50", bg: "#00e5ff12", ring: "#00e5ff60" },
  { color: "#ffd600", border: "#ffd60050", bg: "#ffd60012", ring: "#ffd60060" },
  { color: "#ff6d00", border: "#ff6d0050", bg: "#ff6d0012", ring: "#ff6d0060" },
];

const CAT_COLOR: Record<string, string> = {
  "ديني": "#22c55e",
  "حيوانات": "#f59e0b",
  "علوم": "#3b82f6",
  "عام": "#00e5ff",
  "خفيف": "#e040fb",
  "أغاني": "#a855f7",
};

const ROUND_OPTIONS = [10, 15, 20, 25, 30];
const TIME_OPTIONS = [15, 20, 30];

type UIPhase = "setup" | "settings" | "idle" | "active" | "revealed" | "finished";

interface Question {
  id: number;
  text: string;
  choices: string[];
  category: string;
  correctAnswer: number | null;
  correctAnswerText: string | null;
}
interface LeaderboardEntry { rank: number; username: string; score: number }

// ─── Leaderboard Sidebar ──────────────────────────────────────────────────────
const LeaderboardSidebar = ({ entries, title = "المتصدرون" }: { entries: LeaderboardEntry[]; title?: string }) => (
  <aside className="w-56 flex flex-col border-r border-purple-500/20 flex-shrink-0 overflow-hidden"
    style={{ background: "rgba(8,4,18,0.75)" }}>
    <div className="flex items-center gap-2 px-4 py-3 border-b border-yellow-500/20 flex-shrink-0"
      style={{ background: "rgba(255,214,0,0.05)" }}>
      <Trophy size={14} className="text-yellow-400" />
      <span className="font-black text-yellow-400 text-sm">{title}</span>
    </div>
    <div className="flex-1 overflow-y-auto divide-y divide-purple-500/10">
      {entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full gap-2 py-12 text-center px-4">
          <Trophy size={28} className="text-purple-400/15" />
          <p className="text-purple-400/30 text-xs">لا توجد نقاط بعد</p>
        </div>
      ) : entries.map(e => {
        const medals = ["🥇", "🥈", "🥉"];
        const pct = entries[0].score > 0 ? (e.score / entries[0].score) * 100 : 0;
        return (
          <motion.div key={e.username} layout
            className="relative flex items-center gap-2 px-3 py-2.5 overflow-hidden">
            <div className="absolute inset-0 opacity-25 pointer-events-none"
              style={{ width: `${pct}%`, background: "linear-gradient(90deg, #e040fb15, transparent)" }} />
            <span className="relative w-6 text-center text-sm font-black flex-shrink-0"
              style={{ color: e.rank === 1 ? "#ffd600" : e.rank === 2 ? "#c0c0c0" : e.rank === 3 ? "#cd7f32" : "#4b5563" }}>
              {e.rank <= 3 ? medals[e.rank - 1] : `#${e.rank}`}
            </span>
            <span className="relative flex-1 text-xs font-medium truncate text-white/80">{e.username}</span>
            <span className="relative font-black text-yellow-400 text-sm flex-shrink-0">{e.score}</span>
          </motion.div>
        );
      })}
    </div>
  </aside>
);

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function QuizGame() {
  const [, navigate] = useLocation();
  const { user, logout } = useAuth();

  const [uiPhase, setUiPhase] = useState<UIPhase>("setup");
  const [question, setQuestion] = useState<Question | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [distribution, setDistribution] = useState<Record<string, number>>({ "1": 0, "2": 0, "3": 0, "4": 0 });
  const [totalAnswers, setTotalAnswers] = useState(0);
  const [questionResults, setQuestionResults] = useState<QuestionResult[]>([]);
  const [currentRound, setCurrentRound] = useState(0);
  const [totalRounds, setTotalRounds] = useState(10);
  const [questionTime, setQuestionTime] = useState(20);
  const [twitchConnected, setTwitchConnected] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [isLastRound, setIsLastRound] = useState(false);

  // Settings selections
  const [selectedRounds, setSelectedRounds] = useState(10);
  const [selectedTime, setSelectedTime] = useState(20);

  // Timer
  const [timeLeft, setTimeLeft] = useState(20);
  const [timerRunning, setTimerRunning] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const revealCalledRef = useRef(false);

  // ── Load state on mount ────────────────────────────────────────────────────
  useEffect(() => {
    loadState();
  }, []);

  const loadState = async () => {
    try {
      const s = await apiFetch<any>("/quiz/state");
      setLeaderboard(s.leaderboard ?? []);
      setTotalAnswers(s.totalAnswers ?? 0);
      setDistribution(s.distribution ?? { "1": 0, "2": 0, "3": 0, "4": 0 });
      setCurrentRound(s.currentRound ?? 0);
      setTotalRounds(s.totalRounds ?? 10);
      setQuestionTime(s.questionTime ?? 20);
      setTwitchConnected(s.twitch?.connected ?? false);
      if (s.question) setQuestion(s.question);

      if (s.phase === "active" || s.phase === "revealed" || s.phase === "finished") {
        setUiPhase(s.phase);
      } else {
        setUiPhase("setup");
      }
    } catch {}
  };

  // ── Auto-connect Twitch ────────────────────────────────────────────────────
  useEffect(() => {
    if (user?.username && !twitchConnected) {
      apiFetch("/quiz/twitch/connect", {
        method: "POST",
        body: JSON.stringify({ channel: user.username }),
      }).catch(() => {});
    }
  }, [user]);

  // ── WebSocket ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${proto}//${window.location.host}/ws`;

    const connect = () => {
      const ws = new WebSocket(url);
      wsRef.current = ws;
      ws.onopen = () => {
        setWsConnected(true);
        ws.send(JSON.stringify({ type: "auth", userId: user.id, username: user.username }));
      };
      ws.onclose = () => { setWsConnected(false); setTimeout(connect, 3000); };
      ws.onerror = () => ws.close();
      ws.onmessage = (e) => { try { handleWS(JSON.parse(e.data)); } catch {} };
    };
    connect();
    return () => { wsRef.current?.close(); };
  }, [user]);

  const handleWS = useCallback((msg: any) => {
    switch (msg.type) {
      case "new_question":
        setQuestion({
          id: msg.questionId, text: msg.text, choices: msg.choices,
          category: msg.category, correctAnswer: null, correctAnswerText: null,
        });
        setCurrentRound(msg.currentRound ?? 0);
        setTotalRounds(msg.totalRounds ?? 10);
        setQuestionTime(msg.questionTime ?? 20);
        setTotalAnswers(0);
        setDistribution({ "1": 0, "2": 0, "3": 0, "4": 0 });
        setQuestionResults([]);
        setIsLastRound(false);
        revealCalledRef.current = false;
        setUiPhase("active");
        // Start timer
        setTimeLeft(msg.questionTime ?? 20);
        setTimerRunning(true);
        break;

      case "twitch_answer":
        setTotalAnswers(msg.totalAnswers);
        setDistribution(msg.distribution);
        break;

      case "answer_reveal":
        stopTimer();
        setQuestion(prev => prev ? {
          ...prev,
          correctAnswer: msg.correctAnswer,
          correctAnswerText: msg.correctAnswerText,
        } : prev);
        setLeaderboard(msg.leaderboard ?? []);
        setDistribution(msg.distribution);
        setTotalAnswers(msg.totalAnswers);
        setQuestionResults(msg.questionResults ?? []);
        setCurrentRound(msg.currentRound ?? 0);
        setTotalRounds(msg.totalRounds ?? 10);
        setIsLastRound(msg.isLastRound ?? false);
        setUiPhase("revealed");
        break;

      case "game_started":
        setTotalRounds(msg.totalRounds ?? 10);
        setQuestionTime(msg.questionTime ?? 20);
        setCurrentRound(0);
        setQuestion(null);
        setLeaderboard([]);
        setTotalAnswers(0);
        setQuestionResults([]);
        setIsLastRound(false);
        break;

      case "game_finished":
        stopTimer();
        setLeaderboard(msg.leaderboard ?? []);
        setUiPhase("finished");
        break;

      case "twitch_status":
        setTwitchConnected(msg.status === "connected");
        break;
    }
  }, []);

  // ── Timer logic ────────────────────────────────────────────────────────────
  const stopTimer = () => {
    setTimerRunning(false);
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };

  useEffect(() => {
    if (timerRunning) {
      timerRef.current = setInterval(() => {
        setTimeLeft(t => {
          if (t <= 1) {
            stopTimer();
            // Auto-reveal when timer hits 0
            if (!revealCalledRef.current) {
              revealCalledRef.current = true;
              hostReveal();
            }
            return 0;
          }
          return t - 1;
        });
      }, 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [timerRunning]);

  // ── Host actions ───────────────────────────────────────────────────────────
  const hostReveal = async () => {
    try { await apiFetch("/quiz/reveal", { method: "POST" }); }
    catch {}
  };

  const hostNextQuestion = async () => {
    setActionLoading(true);
    try { await apiFetch("/quiz/question", { method: "POST" }); }
    catch (e: any) { alert(e.message); }
    finally { setActionLoading(false); }
  };

  const startGame = async () => {
    setActionLoading(true);
    try {
      // Reseed first (force-update question bank)
      await apiFetch("/seed", { method: "POST" }).catch(() => {});
      // Start with settings
      await apiFetch("/quiz/start", {
        method: "POST",
        body: JSON.stringify({ rounds: selectedRounds, questionTime: selectedTime }),
      });
      setTotalRounds(selectedRounds);
      setQuestionTime(selectedTime);
      // Immediately launch first question
      await apiFetch("/quiz/question", { method: "POST" });
    } catch (e: any) { alert(e.message); }
    finally { setActionLoading(false); }
  };

  const restartFull = async () => {
    stopTimer();
    setUiPhase("setup");
    setQuestion(null);
    setLeaderboard([]);
    setQuestionResults([]);
    setCurrentRound(0);
  };

  // ── Derived ────────────────────────────────────────────────────────────────
  const catColor = CAT_COLOR[question?.category ?? ""] ?? "#00e5ff";
  const timerPct = questionTime > 0 ? (timeLeft / questionTime) * 100 : 0;
  const timerColor = timerPct > 50 ? "#22c55e" : timerPct > 25 ? "#ffd600" : "#ef4444";
  const showSidebar = uiPhase === "active" || uiPhase === "revealed";

  return (
    <div className="h-screen gradient-bg flex flex-col overflow-hidden" dir="rtl">
      {/* Ambient glows */}
      <div className="absolute top-0 right-0 w-80 h-80 rounded-full opacity-10 pointer-events-none"
        style={{ background: "radial-gradient(circle, #e040fb, transparent)", filter: "blur(60px)" }} />
      <div className="absolute bottom-0 left-0 w-80 h-80 rounded-full opacity-10 pointer-events-none"
        style={{ background: "radial-gradient(circle, #00e5ff, transparent)", filter: "blur(60px)" }} />

      {/* ── HEADER ──────────────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-5 py-2.5 border-b border-purple-500/20 flex-shrink-0 z-10"
        style={{ background: "rgba(10,5,20,0.92)", backdropFilter: "blur(16px)" }}>
        <button onClick={() => navigate("/")}
          className="flex items-center gap-1.5 text-purple-300/60 hover:text-pink-400 transition-colors text-sm">
          <ArrowRight size={16} /> العودة
        </button>

        <div className="flex items-center gap-3">
          <h1 className="text-lg font-black neon-text-pink">لعبة الأسئلة</h1>
          {(uiPhase === "active" || uiPhase === "revealed") && currentRound > 0 && (
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold border border-purple-500/30 text-purple-300/60">
              {currentRound} / {totalRounds}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs ${
            twitchConnected
              ? "border-purple-500/40 bg-purple-500/10 text-purple-300"
              : "border-gray-700 text-gray-600"
          }`}>
            {twitchConnected ? <Wifi size={11} /> : <WifiOff size={11} />}
            {twitchConnected ? `#${user?.username}` : "جارٍ الاتصال..."}
          </div>
          <div className={`w-2 h-2 rounded-full ${wsConnected ? "bg-green-400" : "bg-red-400"}`} />
        </div>
      </header>

      {/* ── BODY ────────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── MAIN CONTENT ─────────────────────────────────────────────────── */}
        <main className="flex-1 flex flex-col items-center justify-center p-5 overflow-y-auto z-10">
          <AnimatePresence mode="wait">

            {/* ── SETUP ── */}
            {uiPhase === "setup" && (
              <motion.div key="setup"
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
                className="flex flex-col items-center gap-5">
                <div className="w-72 sm:w-80 rounded-3xl overflow-hidden border border-purple-500/25"
                  style={{ boxShadow: "0 0 40px rgba(224,64,251,0.12)" }}>
                  <img src="/quiz-hero.png" alt="لعبة الأسئلة"
                    className="w-full h-auto object-contain block" />
                </div>
                <motion.button
                  onClick={() => setUiPhase("settings")}
                  whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
                  className="flex items-center gap-2 px-10 py-3.5 rounded-2xl text-lg font-black"
                  style={{
                    background: "linear-gradient(135deg, #e040fb, #9c27b0)",
                    boxShadow: "0 0 30px rgba(224,64,251,0.4)",
                    color: "#fff",
                  }}
                >
                  <Play size={20} fill="white" /> إلعب الآن
                </motion.button>
              </motion.div>
            )}

            {/* ── SETTINGS ── */}
            {uiPhase === "settings" && (
              <motion.div key="settings"
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
                className="w-full max-w-md space-y-6">

                <div className="text-center">
                  <h2 className="text-2xl font-black text-white">إعدادات اللعبة</h2>
                  <p className="text-purple-300/40 text-sm mt-1">اختر الجولات ووقت السؤال</p>
                </div>

                {/* Rounds */}
                <div className="space-y-3">
                  <p className="text-sm font-bold text-purple-300/60 flex items-center gap-2">
                    <Trophy size={14} /> عدد الجولات
                  </p>
                  <div className="grid grid-cols-5 gap-2">
                    {ROUND_OPTIONS.map(r => (
                      <button
                        key={r}
                        onClick={() => setSelectedRounds(r)}
                        className="py-2.5 rounded-xl font-black text-sm border transition-all"
                        style={{
                          borderColor: selectedRounds === r ? "#e040fb" : "rgba(224,64,251,0.2)",
                          background: selectedRounds === r ? "rgba(224,64,251,0.2)" : "rgba(224,64,251,0.05)",
                          color: selectedRounds === r ? "#e040fb" : "rgba(224,64,251,0.4)",
                          boxShadow: selectedRounds === r ? "0 0 16px rgba(224,64,251,0.3)" : "none",
                        }}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Time */}
                <div className="space-y-3">
                  <p className="text-sm font-bold text-purple-300/60 flex items-center gap-2">
                    <Clock size={14} /> وقت كل سؤال (ثانية)
                  </p>
                  <div className="grid grid-cols-3 gap-3">
                    {TIME_OPTIONS.map(t => (
                      <button
                        key={t}
                        onClick={() => setSelectedTime(t)}
                        className="py-3 rounded-xl font-black text-base border transition-all"
                        style={{
                          borderColor: selectedTime === t ? "#00e5ff" : "rgba(0,229,255,0.2)",
                          background: selectedTime === t ? "rgba(0,229,255,0.15)" : "rgba(0,229,255,0.04)",
                          color: selectedTime === t ? "#00e5ff" : "rgba(0,229,255,0.35)",
                          boxShadow: selectedTime === t ? "0 0 16px rgba(0,229,255,0.25)" : "none",
                        }}
                      >
                        {t}s
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-2 flex gap-3">
                  <button onClick={() => setUiPhase("setup")}
                    className="px-5 py-3 rounded-xl border border-purple-500/20 text-purple-400/50 hover:text-purple-300 transition-all text-sm font-bold">
                    رجوع
                  </button>
                  <motion.button
                    onClick={startGame}
                    disabled={actionLoading}
                    whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                    className="flex-1 py-3.5 rounded-2xl font-black text-lg flex items-center justify-center gap-2"
                    style={{
                      background: actionLoading ? "rgba(224,64,251,0.3)" : "linear-gradient(135deg, #e040fb, #9c27b0)",
                      boxShadow: actionLoading ? "none" : "0 0 30px rgba(224,64,251,0.4)",
                      color: "#fff",
                    }}
                  >
                    {actionLoading ? (
                      <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    ) : (
                      <><Play size={20} fill="white" /> بدأ اللعبة</>
                    )}
                  </motion.button>
                </div>
              </motion.div>
            )}

            {/* ── ACTIVE ── */}
            {uiPhase === "active" && question && (
              <motion.div key={`q-${question.id}`}
                initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}
                transition={{ duration: 0.35 }}
                className="w-full max-w-2xl space-y-4">

                {/* Category + Answer count + Timer */}
                <div className="flex items-center justify-between">
                  <span className="px-3 py-1 rounded-full text-xs font-bold"
                    style={{ background: `${catColor}18`, border: `1px solid ${catColor}50`, color: catColor }}>
                    {question.category}
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1.5 text-xs text-purple-400/60">
                      <Users size={11} />{totalAnswers} أجاب
                    </span>
                    {/* Timer circle */}
                    <div className="relative w-10 h-10">
                      <svg className="w-10 h-10 -rotate-90" viewBox="0 0 40 40">
                        <circle cx="20" cy="20" r="17" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
                        <motion.circle
                          cx="20" cy="20" r="17" fill="none"
                          stroke={timerColor}
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeDasharray={`${2 * Math.PI * 17}`}
                          strokeDashoffset={`${2 * Math.PI * 17 * (1 - timerPct / 100)}`}
                          transition={{ duration: 0.5 }}
                        />
                      </svg>
                      <span className="absolute inset-0 flex items-center justify-center text-xs font-black"
                        style={{ color: timerColor }}>
                        {timeLeft}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Question text */}
                <div className="rounded-2xl border border-purple-500/30 p-6 text-center relative overflow-hidden"
                  style={{ background: "linear-gradient(135deg, rgba(26,10,46,0.98), rgba(8,20,48,0.98))" }}>
                  <div className="absolute top-0 inset-x-0 h-[2px]"
                    style={{ background: "linear-gradient(90deg, transparent, #e040fb, #00e5ff, transparent)" }} />
                  <p className="text-2xl sm:text-3xl font-black text-white leading-relaxed">{question.text}</p>
                </div>

                {/* 4 Choices */}
                <div className="grid grid-cols-2 gap-3">
                  {question.choices.map((choice, i) => {
                    const col = CHOICE_COLORS[i];
                    return (
                      <div key={i}
                        className="flex items-center gap-3 p-4 rounded-2xl border"
                        style={{ borderColor: col.border, background: col.bg }}>
                        <span className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-black flex-shrink-0 border"
                          style={{ background: `${col.color}20`, borderColor: col.ring, color: col.color }}>
                          {i + 1}
                        </span>
                        <span className="flex-1 text-base font-bold leading-snug" style={{ color: col.color }}>{choice}</span>
                      </div>
                    );
                  })}
                </div>

                {/* Manual reveal button */}
                <button
                  onClick={() => { revealCalledRef.current = true; stopTimer(); hostReveal(); }}
                  className="w-full py-2 rounded-xl text-xs text-purple-400/35 hover:text-purple-300/60 border border-purple-500/12 transition-all"
                >
                  كشف الإجابة مبكراً
                </button>
              </motion.div>
            )}

            {/* ── REVEALED ── */}
            {uiPhase === "revealed" && question && (
              <motion.div key={`r-${question.id}`}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="w-full max-w-2xl space-y-4">

                {/* Category */}
                <div className="flex items-center justify-between">
                  <span className="px-3 py-1 rounded-full text-xs font-bold"
                    style={{ background: `${catColor}18`, border: `1px solid ${catColor}50`, color: catColor }}>
                    {question.category}
                  </span>
                  <span className="text-xs text-purple-400/40">{totalAnswers} إجابة مستلمة</span>
                </div>

                {/* Question text */}
                <div className="rounded-2xl border border-purple-500/20 p-5 text-center relative overflow-hidden"
                  style={{ background: "rgba(20,8,40,0.95)" }}>
                  <p className="text-xl font-black text-white/70 leading-relaxed">{question.text}</p>
                </div>

                {/* Choices with answer highlights */}
                <div className="grid grid-cols-2 gap-3">
                  {question.choices.map((choice, i) => {
                    const num = i + 1;
                    const isCorrect = question.correctAnswer === num;
                    const col = CHOICE_COLORS[i];
                    const pct = totalAnswers > 0
                      ? Math.round(((distribution[String(num)] ?? 0) / totalAnswers) * 100) : 0;
                    return (
                      <div key={i}
                        className="relative flex items-center gap-3 p-4 rounded-2xl border overflow-hidden"
                        style={{
                          borderColor: isCorrect ? "#22c55e70" : "rgba(255,255,255,0.08)",
                          background: isCorrect ? "rgba(34,197,94,0.12)" : "rgba(10,4,20,0.7)",
                        }}>
                        {/* Distribution bar */}
                        <div className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${pct}%` }}
                            transition={{ duration: 0.8 }}
                            className="h-full opacity-10"
                            style={{ background: isCorrect ? "#22c55e" : col.color }}
                          />
                        </div>
                        <span className="relative w-8 h-8 rounded-full flex items-center justify-center text-sm font-black flex-shrink-0 border"
                          style={{
                            background: isCorrect ? "rgba(34,197,94,0.2)" : "rgba(255,255,255,0.04)",
                            borderColor: isCorrect ? "#22c55e60" : "rgba(255,255,255,0.1)",
                            color: isCorrect ? "#22c55e" : "#6b7280",
                          }}>
                          {isCorrect ? <CheckCircle2 size={16} /> : num}
                        </span>
                        <span className="relative flex-1 text-base font-bold leading-snug"
                          style={{ color: isCorrect ? "#22c55e" : "#6b7280" }}>
                          {choice}
                        </span>
                        <span className="relative text-xs font-bold flex-shrink-0"
                          style={{ color: isCorrect ? "#22c55e80" : "#6b728070" }}>
                          {pct}%
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Correct answer banner */}
                <motion.div
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  className="rounded-xl border border-green-500/50 bg-green-500/10 p-4 flex items-center justify-center gap-3">
                  <CheckCircle2 className="text-green-400 flex-shrink-0" size={22} />
                  <span className="text-green-400 font-black text-lg">الإجابة: {question.correctAnswerText}</span>
                </motion.div>

                {/* Per-question results */}
                {questionResults.length > 0 && (
                  <div className="rounded-2xl border border-purple-500/20 overflow-hidden"
                    style={{ background: "rgba(14,6,28,0.8)" }}>
                    <div className="px-4 py-2.5 border-b border-purple-500/15 flex items-center justify-between">
                      <span className="text-xs font-bold text-purple-300/50">نتائج هذا السؤال</span>
                      <span className="text-xs text-purple-400/30">{questionResults.filter(r => r.correct).length} صحيحة</span>
                    </div>
                    <div className="divide-y divide-purple-500/10 max-h-40 overflow-y-auto">
                      {questionResults.slice(0, 12).map((r, idx) => (
                        <div key={idx}
                          className="flex items-center gap-3 px-4 py-2">
                          <span className="flex-shrink-0 w-6 text-center text-xs font-black"
                            style={{ color: r.correct ? "#22c55e" : "#ef4444" }}>
                            {r.correct ? `#${r.rank}` : "✕"}
                          </span>
                          <span className="flex-1 text-sm font-medium text-white/75 truncate">{r.username}</span>
                          <span className="flex-shrink-0 font-black text-sm"
                            style={{ color: r.correct ? "#22c55e" : "#ef444460" }}>
                            {r.correct ? `+${r.points}` : "0"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Action button */}
                <motion.button
                  onClick={isLastRound ? restartFull : hostNextQuestion}
                  disabled={actionLoading}
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  className="w-full py-4 rounded-2xl font-black text-lg flex items-center justify-center gap-2"
                  style={{
                    background: isLastRound
                      ? "linear-gradient(135deg, #ffd600, #f59e0b)"
                      : "linear-gradient(135deg, #00e5ff, #0288d1)",
                    boxShadow: isLastRound ? "0 0 30px rgba(255,214,0,0.3)" : "0 0 30px rgba(0,229,255,0.3)",
                    color: "#000",
                    opacity: actionLoading ? 0.7 : 1,
                  }}
                >
                  {actionLoading ? (
                    <div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                  ) : isLastRound ? (
                    <><Trophy size={20} /> عرض النتائج النهائية</>
                  ) : (
                    <><SkipForward size={20} /> السؤال التالي</>
                  )}
                </motion.button>
              </motion.div>
            )}

            {/* ── FINISHED ── */}
            {uiPhase === "finished" && (
              <motion.div key="finished"
                initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                className="w-full max-w-xl flex flex-col items-center gap-6 text-center">

                {/* Title */}
                <motion.div
                  initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                  <h2 className="text-4xl font-black" style={{ color: "#ffd600", textShadow: "0 0 30px rgba(255,214,0,0.5)" }}>
                    انتهت اللعبة
                  </h2>
                  <p className="text-purple-300/40 text-sm mt-1">المتصدرون النهائيون</p>
                </motion.div>

                {/* Podium */}
                <div className="w-full flex items-end justify-center gap-3 mt-2">
                  {/* 2nd place */}
                  {leaderboard[1] && (
                    <motion.div
                      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
                      className="flex flex-col items-center gap-2"
                    >
                      <div className="w-16 h-16 rounded-2xl overflow-hidden border-2"
                        style={{ borderColor: "#c0c0c0", boxShadow: "0 0 20px rgba(192,192,192,0.3)" }}>
                        <img src={`https://api.dicebear.com/7.x/pixel-art/svg?seed=${leaderboard[1].username}`}
                          className="w-full h-full object-cover" alt={leaderboard[1].username} />
                      </div>
                      <p className="text-xs font-bold text-gray-300 truncate max-w-[72px]">{leaderboard[1].username}</p>
                      <div className="h-20 w-24 rounded-t-xl flex flex-col items-center justify-end pb-3"
                        style={{ background: "linear-gradient(180deg, rgba(192,192,192,0.2), rgba(192,192,192,0.08))", border: "1px solid rgba(192,192,192,0.3)" }}>
                        <p className="text-2xl">🥈</p>
                        <p className="text-lg font-black text-silver-300" style={{ color: "#c0c0c0" }}>{leaderboard[1].score}</p>
                      </div>
                    </motion.div>
                  )}

                  {/* 1st place */}
                  {leaderboard[0] && (
                    <motion.div
                      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                      className="flex flex-col items-center gap-2"
                    >
                      <motion.div
                        animate={{ y: [0, -8, 0] }}
                        transition={{ repeat: Infinity, duration: 2 }}
                        className="w-20 h-20 rounded-2xl overflow-hidden border-4"
                        style={{ borderColor: "#ffd600", boxShadow: "0 0 30px rgba(255,214,0,0.5)" }}>
                        <img src={`https://api.dicebear.com/7.x/pixel-art/svg?seed=${leaderboard[0].username}`}
                          className="w-full h-full object-cover" alt={leaderboard[0].username} />
                      </motion.div>
                      <p className="text-sm font-bold text-yellow-300 truncate max-w-[88px]">{leaderboard[0].username}</p>
                      <div className="h-28 w-28 rounded-t-xl flex flex-col items-center justify-end pb-3"
                        style={{ background: "linear-gradient(180deg, rgba(255,214,0,0.25), rgba(255,214,0,0.08))", border: "1px solid rgba(255,214,0,0.4)" }}>
                        <p className="text-3xl">🥇</p>
                        <p className="text-2xl font-black" style={{ color: "#ffd600" }}>{leaderboard[0].score}</p>
                      </div>
                    </motion.div>
                  )}

                  {/* 3rd place */}
                  {leaderboard[2] && (
                    <motion.div
                      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
                      className="flex flex-col items-center gap-2"
                    >
                      <div className="w-14 h-14 rounded-2xl overflow-hidden border-2"
                        style={{ borderColor: "#cd7f32", boxShadow: "0 0 16px rgba(205,127,50,0.3)" }}>
                        <img src={`https://api.dicebear.com/7.x/pixel-art/svg?seed=${leaderboard[2].username}`}
                          className="w-full h-full object-cover" alt={leaderboard[2].username} />
                      </div>
                      <p className="text-xs font-bold text-orange-300 truncate max-w-[64px]">{leaderboard[2].username}</p>
                      <div className="h-14 w-20 rounded-t-xl flex flex-col items-center justify-end pb-3"
                        style={{ background: "linear-gradient(180deg, rgba(205,127,50,0.2), rgba(205,127,50,0.07))", border: "1px solid rgba(205,127,50,0.3)" }}>
                        <p className="text-xl">🥉</p>
                        <p className="text-base font-black" style={{ color: "#cd7f32" }}>{leaderboard[2].score}</p>
                      </div>
                    </motion.div>
                  )}
                </div>

                {/* Rest of leaderboard */}
                {leaderboard.length > 3 && (
                  <motion.div
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}
                    className="w-full rounded-2xl border border-purple-500/20 overflow-hidden"
                    style={{ background: "rgba(14,6,28,0.8)" }}>
                    {leaderboard.slice(3, 10).map((e, i) => (
                      <div key={e.username}
                        className="flex items-center gap-3 px-5 py-2.5 border-b border-purple-500/10 last:border-0">
                        <span className="text-xs font-black text-gray-600 w-6">#{e.rank}</span>
                        <span className="flex-1 text-sm text-white/65 truncate">{e.username}</span>
                        <span className="font-black text-yellow-400/70 text-sm">{e.score}</span>
                      </div>
                    ))}
                  </motion.div>
                )}

                <motion.button
                  onClick={restartFull}
                  whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }}
                  className="flex items-center gap-2 px-8 py-3 rounded-2xl font-black border border-purple-500/30 text-purple-300 hover:text-white hover:border-purple-400/50 transition-all"
                >
                  <RotateCcw size={16} /> إعادة اللعبة
                </motion.button>
              </motion.div>
            )}

          </AnimatePresence>
        </main>

        {/* ── LEADERBOARD SIDEBAR ─────────────────────────────────────────────── */}
        {showSidebar && (
          <LeaderboardSidebar entries={leaderboard} />
        )}

      </div>
    </div>
  );
}
