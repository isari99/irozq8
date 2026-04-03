import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Trophy, MessageSquare, ChevronRight, HelpCircle, CheckCircle2, XCircle, Users, Zap } from "lucide-react";
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

interface ChatMessage {
  id: number;
  userId: number;
  username: string;
  message: string;
  createdAt: string;
  isAnswer?: boolean;
  isCorrect?: boolean;
}

interface Stats {
  totalAnswers: number;
  correctAnswers: number;
  distribution: Record<string, number>;
}

const CATEGORY_COLORS: Record<string, string> = {
  "ديني": "#22c55e",
  "عام": "#00e5ff",
  "أغاني": "#e040fb",
};

export default function QuizGame() {
  const [, navigate] = useLocation();
  const { user, logout } = useAuth();

  const [question, setQuestion] = useState<Question | null>(null);
  const [answerResult, setAnswerResult] = useState<AnswerResult | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [questionLoading, setQuestionLoading] = useState(true);
  const [wsConnected, setWsConnected] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // Load initial data
  useEffect(() => {
    loadQuestion();
    loadLeaderboard();
    loadChat();
  }, []);

  // WebSocket connection
  useEffect(() => {
    if (!user) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    const connect = () => {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsConnected(true);
        ws.send(JSON.stringify({ type: "auth", userId: user.id, username: user.username }));
      };

      ws.onclose = () => {
        setWsConnected(false);
        // Reconnect after 3s
        setTimeout(connect, 3000);
      };

      ws.onerror = () => {
        ws.close();
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          handleWSMessage(msg);
        } catch (e) {}
      };
    };

    connect();

    return () => {
      wsRef.current?.close();
    };
  }, [user]);

  const handleWSMessage = useCallback((msg: any) => {
    if (msg.type === "new_question") {
      setQuestion({
        sessionId: msg.sessionId,
        questionId: msg.questionId,
        text: msg.text,
        choices: msg.choices,
        category: msg.category,
        hasAnswered: false,
        answeredCount: 0,
      });
      setAnswerResult(null);
      setStats(null);
      addChatMessage({
        id: Date.now(),
        userId: 0,
        username: "🎯 النظام",
        message: `سؤال جديد! اكتب رقم إجابتك (1-4) في الشات`,
        createdAt: new Date().toISOString(),
      });
    } else if (msg.type === "answer") {
      const isAnswer = msg.answer >= 1 && msg.answer <= 4;
      addChatMessage({
        id: Date.now() + Math.random(),
        userId: msg.userId,
        username: msg.username,
        message: `أجاب بـ ${msg.answer}`,
        createdAt: new Date().toISOString(),
        isAnswer: true,
        isCorrect: msg.correct,
      });
      setQuestion(prev => prev ? { ...prev, answeredCount: prev.answeredCount + 1 } : prev);
    } else if (msg.type === "leaderboard_update") {
      setLeaderboard(msg.leaderboard);
    } else if (msg.type === "stats_update") {
      setStats(msg);
    } else if (msg.type === "connected") {
      addChatMessage({
        id: Date.now(),
        userId: 0,
        username: "✅ النظام",
        message: msg.message,
        createdAt: new Date().toISOString(),
      });
    }
  }, []);

  const addChatMessage = (msg: ChatMessage) => {
    setChatMessages(prev => [...prev.slice(-49), msg]);
  };

  const loadQuestion = async () => {
    setQuestionLoading(true);
    try {
      const q = await apiFetch<Question>("/quiz/current");
      setQuestion(q);
    } catch (e) {
      setQuestion(null);
    } finally {
      setQuestionLoading(false);
    }
  };

  const loadLeaderboard = async () => {
    try {
      const lb = await apiFetch<LeaderboardEntry[]>("/quiz/leaderboard");
      setLeaderboard(lb);
    } catch (e) {}
  };

  const loadChat = async () => {
    try {
      const msgs = await apiFetch<ChatMessage[]>("/quiz/chat");
      setChatMessages(msgs);
    } catch (e) {}
  };

  const submitAnswer = async (answer: number) => {
    if (!question || question.hasAnswered || loading) return;
    setLoading(true);
    try {
      const result = await apiFetch<AnswerResult>("/quiz/answer", {
        method: "POST",
        body: JSON.stringify({ answer }),
      });
      setAnswerResult(result);
      setQuestion(prev => prev ? { ...prev, hasAnswered: true } : prev);
    } catch (err: any) {
      addChatMessage({
        id: Date.now(),
        userId: 0,
        username: "⚠️ النظام",
        message: err.message,
        createdAt: new Date().toISOString(),
      });
    } finally {
      setLoading(false);
    }
  };

  const sendChatMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const msg = chatInput.trim();
    if (!msg || !user) return;
    setChatInput("");

    // Check if it's an answer (1-4)
    const num = parseInt(msg);
    if (num >= 1 && num <= 4 && question && !question.hasAnswered) {
      await submitAnswer(num);
      return;
    }

    // Regular chat message
    addChatMessage({
      id: Date.now(),
      userId: user.id,
      username: user.username,
      message: msg,
      createdAt: new Date().toISOString(),
    });

    // Save to DB
    try {
      await apiFetch("/quiz/chat", {
        method: "POST",
        body: JSON.stringify({ message: msg }),
      }).catch(() => {});
    } catch {}
  };

  const nextQuestion = async () => {
    try {
      await apiFetch("/quiz/next", { method: "POST" });
    } catch (e) {}
  };

  const startGame = async () => {
    try {
      await apiFetch("/seed", { method: "POST" });
      await nextQuestion();
    } catch (e) {}
  };

  const myScore = leaderboard.find(e => e.userId === user?.id)?.score ?? 0;
  const myRank = leaderboard.find(e => e.userId === user?.id)?.rank ?? "—";

  return (
    <div className="min-h-screen gradient-bg relative overflow-hidden" dir="rtl">
      <div className="absolute top-[-200px] right-[-200px] w-[400px] h-[400px] rounded-full opacity-10"
        style={{ background: "radial-gradient(circle, #e040fb, transparent)" }} />
      <div className="absolute bottom-[-200px] left-[-200px] w-[400px] h-[400px] rounded-full opacity-10"
        style={{ background: "radial-gradient(circle, #00e5ff, transparent)" }} />

      <div className="relative z-10 flex flex-col h-screen max-h-screen overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-purple-500/20"
          style={{ background: "rgba(10,5,20,0.8)", backdropFilter: "blur(10px)" }}>
          <button onClick={() => navigate("/")}
            className="flex items-center gap-2 text-purple-300 hover:text-pink-400 transition-colors text-sm">
            <ArrowRight size={18} /><span>العودة</span>
          </button>

          <div className="flex items-center gap-3">
            <HelpCircle className="text-yellow-400" size={22} />
            <span className="text-xl font-black neon-text-pink">لعبة الأسئلة</span>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-xs text-purple-400/60">{user?.username}</p>
              <p className="text-sm font-bold text-yellow-400">نقاطي: {myScore} | #{myRank}</p>
            </div>
            <div className={`w-2 h-2 rounded-full ${wsConnected ? "bg-green-400" : "bg-red-400"}`} title={wsConnected ? "متصل" : "غير متصل"} />
            <button onClick={logout} className="text-xs text-purple-400/60 hover:text-red-400 transition-colors">خروج</button>
          </div>
        </div>

        {/* Main layout */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left: Question + Leaderboard */}
          <div className="flex flex-col flex-1 overflow-hidden">
            {/* Question area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Question card */}
              {questionLoading ? (
                <div className="flex items-center justify-center h-40">
                  <div className="animate-spin w-8 h-8 border-2 border-pink-400/40 border-t-pink-400 rounded-full" />
                </div>
              ) : question ? (
                <motion.div
                  key={question.questionId}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-2xl border border-purple-500/30 p-5 relative overflow-hidden"
                  style={{ background: "linear-gradient(135deg, rgba(26,10,46,0.9), rgba(10,26,46,0.9))" }}
                >
                  <div className="absolute top-0 left-0 right-0 h-[2px]"
                    style={{ background: "linear-gradient(90deg, transparent, #e040fb, #00e5ff, transparent)" }} />

                  {/* Category + count */}
                  <div className="flex items-center justify-between mb-4">
                    <span className="px-3 py-1 rounded-full text-xs font-bold"
                      style={{
                        background: `${CATEGORY_COLORS[question.category] ?? "#e040fb"}20`,
                        border: `1px solid ${CATEGORY_COLORS[question.category] ?? "#e040fb"}50`,
                        color: CATEGORY_COLORS[question.category] ?? "#e040fb",
                      }}>
                      {question.category}
                    </span>
                    <span className="flex items-center gap-1.5 text-xs text-purple-400/70">
                      <Users size={13} />
                      {question.answeredCount} أجابوا
                    </span>
                  </div>

                  {/* Question text */}
                  <h2 className="text-xl font-bold text-white mb-5 leading-relaxed">{question.text}</h2>

                  {/* Choices */}
                  <div className="grid grid-cols-2 gap-3">
                    {question.choices.map((choice, i) => {
                      const num = i + 1;
                      const isCorrect = answerResult?.correctAnswer === num;
                      const isMyChoice = answerResult && !answerResult.correct && question.hasAnswered;

                      let borderColor = "#4a2060";
                      let bg = "rgba(26,10,46,0.8)";
                      let textColor = "#c4a8e0";

                      if (answerResult) {
                        if (isCorrect) {
                          borderColor = "#22c55e";
                          bg = "rgba(34,197,94,0.15)";
                          textColor = "#22c55e";
                        }
                      }

                      return (
                        <motion.button
                          key={num}
                          onClick={() => !question.hasAnswered && submitAnswer(num)}
                          disabled={question.hasAnswered || loading}
                          whileHover={!question.hasAnswered ? { scale: 1.02 } : {}}
                          whileTap={!question.hasAnswered ? { scale: 0.97 } : {}}
                          className="flex items-center gap-3 p-3 rounded-xl border text-right transition-all"
                          style={{ borderColor, background: bg }}
                        >
                          <span className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-black flex-shrink-0"
                            style={{
                              background: isCorrect && answerResult ? "#22c55e30" : "#e040fb20",
                              border: `1px solid ${isCorrect && answerResult ? "#22c55e" : "#e040fb40"}`,
                              color: isCorrect && answerResult ? "#22c55e" : "#e040fb",
                            }}>
                            {num}
                          </span>
                          <span className="text-sm font-medium flex-1" style={{ color: textColor }}>{choice}</span>
                          {answerResult && isCorrect && <CheckCircle2 size={16} className="text-green-400 flex-shrink-0" />}
                        </motion.button>
                      );
                    })}
                  </div>

                  {/* Answer result */}
                  <AnimatePresence>
                    {answerResult && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className={`mt-4 p-4 rounded-xl border text-center`}
                        style={{
                          background: answerResult.correct ? "#22c55e15" : "#ef444415",
                          borderColor: answerResult.correct ? "#22c55e50" : "#ef444450",
                        }}
                      >
                        <div className="flex items-center justify-center gap-2 text-lg font-black">
                          {answerResult.correct
                            ? <><CheckCircle2 className="text-green-400" size={22} /> <span className="text-green-400">إجابة صحيحة! +1 نقطة</span></>
                            : <><XCircle className="text-red-400" size={22} /> <span className="text-red-400">إجابة خاطئة</span></>
                          }
                        </div>
                        {!answerResult.correct && (
                          <p className="text-sm text-purple-300/70 mt-1">
                            الإجابة الصحيحة: <span className="font-bold text-green-400">{answerResult.correctAnswerText}</span>
                          </p>
                        )}
                        <p className="text-xs text-purple-400/60 mt-2">مجموع نقاطك: {answerResult.newScore}</p>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {question.hasAnswered && !answerResult && (
                    <div className="mt-4 p-3 rounded-xl border border-yellow-500/30 bg-yellow-500/10 text-center text-sm text-yellow-400">
                      لقد أجبت على هذا السؤال بالفعل
                    </div>
                  )}

                  {/* Stats */}
                  {stats && stats.totalAnswers > 0 && (
                    <div className="mt-4 space-y-2">
                      <p className="text-xs text-purple-400/60 font-medium">توزيع الإجابات:</p>
                      {[1, 2, 3, 4].map(n => {
                        const count = stats.distribution[String(n)] || 0;
                        const pct = stats.totalAnswers > 0 ? Math.round((count / stats.totalAnswers) * 100) : 0;
                        return (
                          <div key={n} className="flex items-center gap-2">
                            <span className="text-xs text-purple-300 w-4">{n}</span>
                            <div className="flex-1 h-2 rounded-full bg-purple-900/40 overflow-hidden">
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${pct}%` }}
                                className="h-full rounded-full"
                                style={{ background: n === question?.choices?.length ? "#22c55e" : "#e040fb60" }}
                              />
                            </div>
                            <span className="text-xs text-purple-400/60 w-8">{pct}%</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </motion.div>
              ) : (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex flex-col items-center justify-center h-48 gap-4"
                >
                  <HelpCircle size={48} className="text-purple-400/40" />
                  <p className="text-purple-300/60 text-center">لا يوجد سؤال نشط حالياً</p>
                  <button
                    onClick={startGame}
                    className="px-8 py-3 rounded-xl font-bold btn-shimmer"
                    style={{ background: "#e040fb20", border: "1px solid #e040fb50", color: "#e040fb" }}
                  >
                    ابدأ أول سؤال
                  </button>
                </motion.div>
              )}

              {/* Host controls */}
              {question && (
                <div className="flex gap-3">
                  <button
                    onClick={nextQuestion}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm btn-shimmer"
                    style={{ background: "#6366f120", border: "1px solid #6366f140", color: "#6366f1" }}
                  >
                    <ChevronRight size={16} /> سؤال جديد (للهوست)
                  </button>
                </div>
              )}

              {/* Leaderboard */}
              <div className="rounded-2xl border border-yellow-500/20 overflow-hidden"
                style={{ background: "rgba(26,10,46,0.7)" }}>
                <div className="flex items-center gap-2 px-4 py-3 border-b border-yellow-500/20"
                  style={{ background: "rgba(255,214,0,0.05)" }}>
                  <Trophy size={16} className="text-yellow-400" />
                  <span className="font-bold text-yellow-400 text-sm">لوحة المتصدرين</span>
                </div>
                <div className="divide-y divide-purple-500/10">
                  {leaderboard.length === 0 ? (
                    <div className="px-4 py-6 text-center text-purple-400/40 text-sm">لا توجد نقاط بعد</div>
                  ) : leaderboard.slice(0, 10).map((entry) => (
                    <div key={entry.userId}
                      className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${entry.userId === user?.id ? "bg-pink-500/10" : ""}`}>
                      <span className="w-6 text-center text-sm font-black"
                        style={{ color: entry.rank === 1 ? "#ffd600" : entry.rank === 2 ? "#c0c0c0" : entry.rank === 3 ? "#cd7f32" : "#6b7280" }}>
                        {entry.rank <= 3 ? ["🥇", "🥈", "🥉"][entry.rank - 1] : `#${entry.rank}`}
                      </span>
                      <span className={`flex-1 text-sm font-medium ${entry.userId === user?.id ? "text-pink-300" : "text-white"}`}>
                        {entry.username} {entry.userId === user?.id && "(أنت)"}
                      </span>
                      <span className="font-black text-yellow-400">{entry.score}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Right: Chat sidebar */}
          <div className="w-72 flex flex-col border-r border-purple-500/20"
            style={{ background: "rgba(10,5,20,0.6)" }}>
            <div className="flex items-center gap-2 px-3 py-3 border-b border-purple-500/20">
              <MessageSquare size={15} className="text-cyan-400" />
              <span className="text-sm font-bold text-cyan-400">الشات المباشر</span>
              <span className="mr-auto text-xs text-purple-400/50">اكتب 1-4 للإجابة</span>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
              {chatMessages.map((msg, i) => {
                const isSystem = msg.userId === 0;
                const isMe = msg.userId === user?.id;
                return (
                  <motion.div
                    key={`${msg.id}-${i}`}
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className={`text-xs rounded-lg p-2 ${isSystem ? "border border-purple-500/20 bg-purple-500/5" : isMe ? "border border-pink-500/20 bg-pink-500/5" : "bg-white/3"}`}
                  >
                    <div className="flex items-center gap-1.5 mb-0.5">
                      {msg.isAnswer && (
                        msg.isCorrect
                          ? <CheckCircle2 size={10} className="text-green-400 flex-shrink-0" />
                          : <XCircle size={10} className="text-red-400 flex-shrink-0" />
                      )}
                      <span className={`font-bold ${isSystem ? "text-purple-400" : isMe ? "text-pink-400" : "text-cyan-400/80"}`}>
                        {msg.username}
                      </span>
                    </div>
                    <span className="text-white/70">{msg.message}</span>
                  </motion.div>
                );
              })}
              <div ref={chatEndRef} />
            </div>

            {/* Hint */}
            {question && !question.hasAnswered && (
              <div className="px-3 py-2 border-t border-purple-500/20">
                <div className="flex items-center gap-1.5 text-xs text-yellow-400/80 bg-yellow-400/5 border border-yellow-400/20 rounded-lg px-2 py-1.5">
                  <Zap size={11} />
                  اكتب رقم إجابتك (1-4) وأرسل
                </div>
              </div>
            )}

            {/* Chat input */}
            <form onSubmit={sendChatMessage} className="flex gap-2 p-3 border-t border-purple-500/20">
              <input
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                placeholder={question && !question.hasAnswered ? "اكتب 1-4..." : "اكتب رسالة..."}
                className="flex-1 px-3 py-2 rounded-xl bg-black/30 border border-purple-500/30 text-white text-sm placeholder-purple-400/40 focus:outline-none focus:border-pink-400/50"
              />
              <button type="submit"
                className="px-3 py-2 rounded-xl text-sm font-bold"
                style={{ background: "#e040fb20", border: "1px solid #e040fb40", color: "#e040fb" }}>
                إرسال
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
