import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight, Trophy, HelpCircle, CheckCircle2, XCircle,
  Users, Zap, Play, LogIn
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";

interface Question {
  sessionId: number;
  questionId: number;
  text: string;
  choices: string[];
  category: string;
  hasAnswered: boolean;
  answeredCount: number;
}

interface AnswerResult {
  correct: boolean;
  correctAnswer: number;
  correctAnswerText: string;
  newScore: number;
}

interface LeaderboardEntry {
  userId: number;
  username: string;
  score: number;
  rank: number;
}

const CATEGORY_COLORS: Record<string, { border: string; bg: string; text: string }> = {
  "ديني":   { border: "#22c55e", bg: "#22c55e15", text: "#22c55e" },
  "عام":    { border: "#00e5ff", bg: "#00e5ff15", text: "#00e5ff" },
  "أغاني": { border: "#e040fb", bg: "#e040fb15", text: "#e040fb" },
};

const ANSWER_COLORS = [
  { idle: "#e040fb", border: "#e040fb50", bg: "#e040fb12" },
  { idle: "#00e5ff", border: "#00e5ff50", bg: "#00e5ff12" },
  { idle: "#ffd600", border: "#ffd60050", bg: "#ffd60012" },
  { idle: "#ff6d00", border: "#ff6d0050", bg: "#ff6d0012" },
];

export default function QuizGame() {
  const [, navigate] = useLocation();
  const { user, logout } = useAuth();

  const [question, setQuestion]         = useState<Question | null>(null);
  const [answerResult, setAnswerResult] = useState<AnswerResult | null>(null);
  const [leaderboard, setLeaderboard]   = useState<LeaderboardEntry[]>([]);
  const [joined, setJoined]             = useState(false);
  const [joinInput, setJoinInput]       = useState("");
  const [loading, setLoading]           = useState(false);
  const [questionLoading, setQLoading]  = useState(true);
  const [wsConnected, setWsConnected]   = useState(false);
  const [playerCount, setPlayerCount]   = useState(0);

  const wsRef = useRef<WebSocket | null>(null);

  /* ── initial data ── */
  useEffect(() => {
    loadQuestion();
    loadLeaderboard();
    checkJoined();
  }, []);

  /* ── WebSocket ── */
  useEffect(() => {
    if (!user) return;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl    = `${protocol}//${window.location.host}/ws`;

    const connect = () => {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsConnected(true);
        ws.send(JSON.stringify({ type: "auth", userId: user.id, username: user.username }));
      };
      ws.onclose = () => { setWsConnected(false); setTimeout(connect, 3000); };
      ws.onerror = () => ws.close();
      ws.onmessage = (e) => {
        try { handleWS(JSON.parse(e.data)); } catch {}
      };
    };

    connect();
    return () => { wsRef.current?.close(); };
  }, [user]);

  const handleWS = useCallback((msg: any) => {
    if (msg.type === "new_question") {
      setQuestion({
        sessionId:     msg.sessionId,
        questionId:    msg.questionId,
        text:          msg.text,
        choices:       msg.choices,
        category:      msg.category,
        hasAnswered:   false,
        answeredCount: 0,
      });
      setAnswerResult(null);
    } else if (msg.type === "answer") {
      setQuestion(prev => prev ? { ...prev, answeredCount: prev.answeredCount + 1 } : prev);
    } else if (msg.type === "leaderboard_update") {
      setLeaderboard(msg.leaderboard);
    } else if (msg.type === "player_count") {
      setPlayerCount(msg.count);
    }
  }, []);

  const loadQuestion = async () => {
    setQLoading(true);
    try {
      const q = await apiFetch<Question>("/quiz/current");
      setQuestion(q);
    } catch { setQuestion(null); }
    finally { setQLoading(false); }
  };

  const loadLeaderboard = async () => {
    try { setLeaderboard(await apiFetch<LeaderboardEntry[]>("/quiz/leaderboard")); }
    catch {}
  };

  const checkJoined = async () => {
    try {
      await apiFetch<{ joined: boolean }>("/quiz/joined");
      setJoined(true);
    } catch { setJoined(false); }
  };

  /* ── join by typing "join" ── */
  const handleJoinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (joinInput.trim().toLowerCase() !== "join") return;
    setLoading(true);
    try {
      await apiFetch("/quiz/join", { method: "POST" });
      setJoined(true);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
      setJoinInput("");
    }
  };

  /* ── answer ── */
  const submitAnswer = async (answer: number) => {
    if (!question || question.hasAnswered || loading || !joined) return;
    setLoading(true);
    try {
      const result = await apiFetch<AnswerResult>("/quiz/answer", {
        method: "POST",
        body: JSON.stringify({ answer }),
      });
      setAnswerResult(result);
      setQuestion(prev => prev ? { ...prev, hasAnswered: true } : prev);
      loadLeaderboard();
    } catch {}
    finally { setLoading(false); }
  };

  /* ── host controls ── */
  const startGame = async () => {
    setLoading(true);
    try {
      await apiFetch("/seed", { method: "POST" });
      await apiFetch("/quiz/next", { method: "POST" });
    } catch {}
    finally { setLoading(false); }
  };

  const nextQuestion = async () => {
    try { await apiFetch("/quiz/next", { method: "POST" }); }
    catch {}
  };

  const myScore = leaderboard.find(e => e.userId === user?.id)?.score ?? 0;
  const myRank  = leaderboard.find(e => e.userId === user?.id)?.rank;
  const cat     = CATEGORY_COLORS[question?.category ?? ""] ?? CATEGORY_COLORS["عام"];

  return (
    <div className="min-h-screen gradient-bg relative overflow-hidden" dir="rtl">
      {/* Glow blobs */}
      <div className="absolute top-[-200px] right-[-200px] w-[500px] h-[500px] rounded-full opacity-10 pointer-events-none"
        style={{ background: "radial-gradient(circle, #e040fb, transparent)" }} />
      <div className="absolute bottom-[-200px] left-[-200px] w-[500px] h-[500px] rounded-full opacity-10 pointer-events-none"
        style={{ background: "radial-gradient(circle, #00e5ff, transparent)" }} />

      <div className="relative z-10 flex flex-col min-h-screen">

        {/* ── HEADER ── */}
        <header className="flex items-center justify-between px-5 py-3 border-b border-purple-500/20"
          style={{ background: "rgba(10,5,20,0.85)", backdropFilter: "blur(12px)" }}>
          <button onClick={() => navigate("/")}
            className="flex items-center gap-2 text-purple-300/70 hover:text-pink-400 transition-colors text-sm">
            <ArrowRight size={17} /> العودة
          </button>

          <div className="flex items-center gap-2">
            <HelpCircle className="text-yellow-400" size={20} />
            <span className="text-xl font-black neon-text-pink">لعبة الأسئلة</span>
          </div>

          <div className="flex items-center gap-3">
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${wsConnected ? "bg-green-400" : "bg-red-400"}`} />
            <div className="text-left text-sm">
              <span className="text-purple-300/60 text-xs">{user?.username}  </span>
              <span className="text-yellow-400 font-bold">{myScore} نقطة</span>
              {myRank && <span className="text-purple-400/60 text-xs">  #{myRank}</span>}
            </div>
            <button onClick={logout} className="text-xs text-purple-400/40 hover:text-red-400 transition-colors">خروج</button>
          </div>
        </header>

        {/* ── BODY ── */}
        <div className="flex flex-1 overflow-hidden">

          {/* ── MAIN AREA ── */}
          <main className="flex-1 flex flex-col items-center justify-center p-6 gap-6 overflow-y-auto">

            {/* JOIN OVERLAY — show if not joined */}
            {!joined && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="w-full max-w-md text-center space-y-6"
              >
                <div className="rounded-2xl border border-cyan-500/30 p-8"
                  style={{ background: "linear-gradient(135deg, rgba(0,229,255,0.07), rgba(26,10,46,0.9))" }}>
                  <LogIn size={48} className="mx-auto text-cyan-400 mb-4" />
                  <h2 className="text-2xl font-black text-white mb-2">انضم للعبة</h2>
                  <p className="text-purple-300/60 text-sm mb-6">اكتب كلمة <span className="text-cyan-300 font-bold">join</span> للانضمام</p>
                  <form onSubmit={handleJoinSubmit} className="flex gap-3">
                    <input
                      value={joinInput}
                      onChange={e => setJoinInput(e.target.value)}
                      placeholder="اكتب join..."
                      className="flex-1 px-4 py-3 rounded-xl bg-black/30 border border-cyan-500/30 text-white text-center text-lg placeholder-cyan-400/30 font-bold focus:outline-none focus:border-cyan-400/60 transition-colors"
                      autoFocus
                    />
                    <motion.button
                      type="submit"
                      disabled={loading || joinInput.trim().toLowerCase() !== "join"}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.96 }}
                      className="px-6 py-3 rounded-xl font-black text-lg disabled:opacity-40 transition-all"
                      style={{ background: "linear-gradient(135deg, #00e5ff, #0097a7)", color: "#000" }}
                    >
                      {loading ? "..." : "انضم"}
                    </motion.button>
                  </form>
                </div>
              </motion.div>
            )}

            {/* QUESTION AREA — show if joined */}
            {joined && (
              <>
                {/* Loading spinner */}
                {questionLoading && (
                  <div className="flex items-center justify-center h-48">
                    <div className="animate-spin w-10 h-10 border-2 border-pink-400/30 border-t-pink-400 rounded-full" />
                  </div>
                )}

                {/* No active question */}
                {!questionLoading && !question && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-center space-y-6"
                  >
                    <div className="w-24 h-24 rounded-full flex items-center justify-center mx-auto border border-purple-500/30"
                      style={{ background: "rgba(26,10,46,0.7)" }}>
                      <HelpCircle size={44} className="text-purple-400/40" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-black text-white mb-2">لا يوجد سؤال نشط</h2>
                      <p className="text-purple-300/50 text-sm">اضغط الزر أدناه لبدء اللعبة</p>
                    </div>
                    <motion.button
                      onClick={startGame}
                      disabled={loading}
                      whileHover={{ scale: 1.04 }}
                      whileTap={{ scale: 0.97 }}
                      className="flex items-center gap-3 mx-auto px-10 py-4 rounded-2xl text-xl font-black btn-shimmer disabled:opacity-50"
                      style={{
                        background: "linear-gradient(135deg, #e040fb, #9c27b0)",
                        boxShadow: "0 0 35px #e040fb40",
                      }}
                    >
                      <Play size={22} fill="white" />
                      {loading ? "جارٍ التحميل..." : "بدء اللعبة"}
                    </motion.button>
                  </motion.div>
                )}

                {/* Active question */}
                {!questionLoading && question && (
                  <motion.div
                    key={question.questionId}
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    className="w-full max-w-2xl space-y-6"
                  >
                    {/* Category badge + count */}
                    <div className="flex items-center justify-between">
                      <span className="px-4 py-1.5 rounded-full text-sm font-bold"
                        style={{ background: cat.bg, border: `1px solid ${cat.border}`, color: cat.text }}>
                        {question.category}
                      </span>
                      <span className="flex items-center gap-1.5 text-xs text-purple-400/60">
                        <Users size={13} /> {question.answeredCount} أجابوا
                      </span>
                    </div>

                    {/* Question text card */}
                    <div className="rounded-2xl border border-purple-500/30 p-7 text-center relative overflow-hidden"
                      style={{ background: "linear-gradient(135deg, rgba(26,10,46,0.95), rgba(10,20,46,0.95))" }}>
                      <div className="absolute top-0 left-0 right-0 h-[2px]"
                        style={{ background: "linear-gradient(90deg, transparent, #e040fb, #00e5ff, transparent)" }} />
                      <p className="text-3xl font-black text-white leading-relaxed">{question.text}</p>
                    </div>

                    {/* Result banner */}
                    <AnimatePresence>
                      {answerResult && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.9 }}
                          className="rounded-2xl border p-4 text-center"
                          style={{
                            background: answerResult.correct ? "#22c55e15" : "#ef444415",
                            borderColor: answerResult.correct ? "#22c55e50" : "#ef444450",
                          }}
                        >
                          <div className="flex items-center justify-center gap-2 text-xl font-black">
                            {answerResult.correct
                              ? <><CheckCircle2 className="text-green-400" size={24} /><span className="text-green-400">إجابة صحيحة! +1 نقطة</span></>
                              : <><XCircle className="text-red-400" size={24} /><span className="text-red-400">إجابة خاطئة</span></>
                            }
                          </div>
                          {!answerResult.correct && (
                            <p className="text-sm text-purple-300/70 mt-1.5">
                              الصحيح: <span className="font-bold text-green-400">{answerResult.correctAnswerText}</span>
                            </p>
                          )}
                          <p className="text-xs text-purple-400/50 mt-1.5">مجموع نقاطك: {answerResult.newScore}</p>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* 4 Answer buttons */}
                    <div className="grid grid-cols-2 gap-4">
                      {question.choices.map((choice, i) => {
                        const num   = i + 1;
                        const col   = ANSWER_COLORS[i];
                        const isCorrect = answerResult?.correctAnswer === num;
                        const isWrong   = answerResult && !answerResult.correct && question.hasAnswered;
                        const disabled  = question.hasAnswered || loading || !joined;

                        let borderC = col.border;
                        let bgC     = col.bg;
                        let textC   = col.idle;

                        if (answerResult) {
                          if (isCorrect) { borderC = "#22c55e80"; bgC = "#22c55e20"; textC = "#22c55e"; }
                          else           { borderC = "#ffffff15"; bgC = "rgba(20,10,30,0.6)"; textC = "#6b7280"; }
                        }

                        return (
                          <motion.button
                            key={num}
                            onClick={() => submitAnswer(num)}
                            disabled={disabled}
                            whileHover={!disabled ? { scale: 1.04, y: -2 } : {}}
                            whileTap={!disabled ? { scale: 0.97 } : {}}
                            className="relative flex items-center gap-4 p-5 rounded-2xl border text-right transition-all overflow-hidden"
                            style={{ borderColor: borderC, background: bgC }}
                          >
                            {/* Glow on hover */}
                            {!disabled && (
                              <div className="absolute inset-0 opacity-0 hover:opacity-100 transition-opacity rounded-2xl"
                                style={{ background: `radial-gradient(ellipse at center, ${col.idle}10, transparent 70%)` }} />
                            )}
                            {/* Number badge */}
                            <span className="relative w-10 h-10 rounded-full flex items-center justify-center text-lg font-black flex-shrink-0"
                              style={{
                                background: answerResult
                                  ? (isCorrect ? "#22c55e25" : "#ffffff08")
                                  : `${col.idle}20`,
                                border: `2px solid ${answerResult ? (isCorrect ? "#22c55e" : "#ffffff15") : col.idle}`,
                                color: answerResult ? (isCorrect ? "#22c55e" : "#6b7280") : col.idle,
                              }}>
                              {num}
                            </span>
                            {/* Choice text */}
                            <span className="relative flex-1 text-base font-bold leading-snug" style={{ color: textC }}>
                              {choice}
                            </span>
                            {/* Icon */}
                            {answerResult && isCorrect && <CheckCircle2 size={20} className="text-green-400 flex-shrink-0" />}
                          </motion.button>
                        );
                      })}
                    </div>

                    {/* Already answered */}
                    {question.hasAnswered && !answerResult && (
                      <div className="text-center text-sm text-yellow-400/70 bg-yellow-400/5 border border-yellow-400/20 rounded-xl py-3">
                        لقد أجبت على هذا السؤال
                      </div>
                    )}

                    {/* Host: next question */}
                    <div className="flex justify-center pt-2">
                      <button
                        onClick={nextQuestion}
                        className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all"
                        style={{
                          background: "rgba(99,102,241,0.15)",
                          border: "1px solid rgba(99,102,241,0.35)",
                          color: "#818cf8",
                        }}
                      >
                        <Zap size={15} /> سؤال جديد (للهوست)
                      </button>
                    </div>
                  </motion.div>
                )}
              </>
            )}
          </main>

          {/* ── LEADERBOARD SIDEBAR ── */}
          <aside className="w-64 flex flex-col border-r border-purple-500/20"
            style={{ background: "rgba(10,5,20,0.6)" }}>
            {/* Header */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-yellow-500/20"
              style={{ background: "rgba(255,214,0,0.04)" }}>
              <Trophy size={16} className="text-yellow-400" />
              <span className="font-bold text-yellow-400 text-sm">المتصدرون</span>
              {playerCount > 0 && (
                <span className="mr-auto flex items-center gap-1 text-xs text-purple-400/50">
                  <Users size={11} /> {playerCount}
                </span>
              )}
            </div>

            {/* Entries */}
            <div className="flex-1 overflow-y-auto divide-y divide-purple-500/10">
              {leaderboard.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-4 py-12">
                  <Trophy size={36} className="text-purple-400/20" />
                  <p className="text-purple-400/40 text-sm">لا توجد نقاط بعد</p>
                </div>
              ) : leaderboard.slice(0, 15).map((entry) => {
                const medals = ["🥇", "🥈", "🥉"];
                const isMe = entry.userId === user?.id;
                return (
                  <motion.div
                    key={entry.userId}
                    layout
                    className={`flex items-center gap-3 px-4 py-2.5 ${isMe ? "bg-pink-500/10" : ""}`}
                  >
                    <span className="w-7 text-center text-sm font-black flex-shrink-0"
                      style={{
                        color: entry.rank === 1 ? "#ffd600" :
                               entry.rank === 2 ? "#c0c0c0" :
                               entry.rank === 3 ? "#cd7f32" : "#6b7280",
                      }}>
                      {entry.rank <= 3 ? medals[entry.rank - 1] : `#${entry.rank}`}
                    </span>
                    <span className={`flex-1 text-sm font-medium truncate ${isMe ? "text-pink-300" : "text-white/80"}`}>
                      {entry.username}{isMe && " ★"}
                    </span>
                    <span className="font-black text-yellow-400 text-sm flex-shrink-0">{entry.score}</span>
                  </motion.div>
                );
              })}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
