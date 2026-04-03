import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight, Trophy, HelpCircle, CheckCircle2, Wifi, WifiOff,
  Play, SkipForward, Eye, RefreshCw, Tv2,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────
interface GameQuestion {
  id: number;
  text: string;
  choices: string[];
  category: string;
  correctAnswer: number | null;
  correctAnswerText: string | null;
}
interface LeaderboardEntry { rank: number; username: string; score: number }
interface GameStateAPI {
  phase: "idle" | "active" | "revealed";
  question: GameQuestion | null;
  leaderboard: LeaderboardEntry[];
  totalAnswers: number;
  distribution: Record<string, number>;
  twitch: { connected: boolean; channel: string | null };
}

// ────────────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────────────
const CHOICE_COLORS = [
  { color: "#e040fb", border: "#e040fb50", bg: "#e040fb12", num: "bg-pink-500/20 text-pink-300 border-pink-500/40" },
  { color: "#00e5ff", border: "#00e5ff50", bg: "#00e5ff12", num: "bg-cyan-500/20 text-cyan-300 border-cyan-500/40" },
  { color: "#ffd600", border: "#ffd60050", bg: "#ffd60012", num: "bg-yellow-500/20 text-yellow-300 border-yellow-500/40" },
  { color: "#ff6d00", border: "#ff6d0050", bg: "#ff6d0012", num: "bg-orange-500/20 text-orange-300 border-orange-500/40" },
];
const CAT_COLORS: Record<string, string> = {
  "ديني": "#22c55e", "عام": "#00e5ff", "أغاني": "#e040fb",
};

// ────────────────────────────────────────────────────────────────────────────
export default function QuizGame() {
  const [, navigate] = useLocation();
  const { user, logout } = useAuth();

  // Remote state
  const [phase, setPhase] = useState<"idle" | "active" | "revealed">("idle");
  const [question, setQuestion] = useState<GameQuestion | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [totalAnswers, setTotalAnswers] = useState(0);
  const [distribution, setDistribution] = useState<Record<string, number>>({ "1": 0, "2": 0, "3": 0, "4": 0 });
  const [twitchConnected, setTwitchConnected] = useState(false);
  const [twitchChannel, setTwitchChannel] = useState<string | null>(null);

  // Host control state
  const [channelInput, setChannelInput] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);

  // Live answer feed (latest 6)
  const [feed, setFeed] = useState<{ id: number; username: string; answer: number; correct: boolean }[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const feedIdRef = useRef(0);

  // ── Poll game state on mount ─────────────────────────────────────────────
  useEffect(() => {
    loadState();
  }, []);

  const loadState = async () => {
    try {
      const s = await apiFetch<GameStateAPI>("/quiz/state");
      applyState(s);
    } catch {}
  };

  const applyState = (s: GameStateAPI) => {
    setPhase(s.phase);
    setQuestion(s.question);
    setLeaderboard(s.leaderboard);
    setTotalAnswers(s.totalAnswers);
    setDistribution(s.distribution);
    setTwitchConnected(s.twitch.connected);
    setTwitchChannel(s.twitch.channel);
    if (s.twitch.channel) setChannelInput(s.twitch.channel);
  };

  // ── WebSocket ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${window.location.host}/ws`;

    const connect = () => {
      const ws = new WebSocket(url);
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
    switch (msg.type) {
      case "new_question":
        setPhase("active");
        setQuestion({
          id: msg.questionId,
          text: msg.text,
          choices: msg.choices,
          category: msg.category,
          correctAnswer: null,
          correctAnswerText: null,
        });
        setTotalAnswers(0);
        setDistribution({ "1": 0, "2": 0, "3": 0, "4": 0 });
        setFeed([]);
        break;

      case "twitch_answer":
        setTotalAnswers(msg.totalAnswers);
        setDistribution(msg.distribution);
        setFeed(prev => {
          const id = ++feedIdRef.current;
          const next = [{ id, username: msg.username, answer: msg.answer, correct: msg.correct }, ...prev].slice(0, 6);
          return next;
        });
        break;

      case "leaderboard_update":
        setLeaderboard(msg.leaderboard);
        break;

      case "answer_reveal":
        setPhase("revealed");
        setQuestion(prev => prev ? {
          ...prev,
          correctAnswer: msg.correctAnswer,
          correctAnswerText: msg.correctAnswerText,
        } : prev);
        setLeaderboard(msg.leaderboard);
        setDistribution(msg.distribution);
        setTotalAnswers(msg.totalAnswers);
        break;

      case "game_started":
        setPhase("idle");
        setQuestion(null);
        setLeaderboard([]);
        setTotalAnswers(0);
        setDistribution({ "1": 0, "2": 0, "3": 0, "4": 0 });
        setFeed([]);
        break;

      case "twitch_status":
        setTwitchConnected(msg.status === "connected");
        if (msg.status === "connected") setTwitchChannel(msg.channel);
        else setTwitchChannel(null);
        break;
    }
  }, []);

  // ── Host actions ─────────────────────────────────────────────────────────
  const twitchConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!channelInput.trim()) return;
    setConnecting(true);
    try {
      if (twitchConnected) {
        await apiFetch("/quiz/twitch/disconnect", { method: "POST" });
        setTwitchConnected(false);
        setTwitchChannel(null);
      } else {
        await apiFetch("/quiz/twitch/connect", { method: "POST", body: JSON.stringify({ channel: channelInput.trim() }) });
      }
    } catch {}
    finally { setConnecting(false); }
  };

  const hostAction = async (endpoint: string, label: string) => {
    setActionLoading(true);
    try { await apiFetch(endpoint, { method: "POST" }); }
    catch (e: any) { alert(e.message); }
    finally { setActionLoading(false); }
  };

  const seedAndStart = async () => {
    setActionLoading(true);
    try {
      await apiFetch("/seed", { method: "POST" }).catch(() => {});
      await apiFetch("/quiz/start", { method: "POST" });
    } catch (e: any) { alert(e.message); }
    finally { setActionLoading(false); }
  };

  const catColor = CAT_COLORS[question?.category ?? ""] ?? "#00e5ff";
  const myRank = leaderboard.find(e => e.username.toLowerCase() === user?.username.toLowerCase())?.rank;

  return (
    <div className="h-screen gradient-bg flex flex-col overflow-hidden" dir="rtl">
      {/* Ambient glows */}
      <div className="absolute top-0 right-0 w-96 h-96 rounded-full opacity-10 pointer-events-none"
        style={{ background: "radial-gradient(circle, #e040fb, transparent)", filter: "blur(60px)" }} />
      <div className="absolute bottom-0 left-0 w-96 h-96 rounded-full opacity-10 pointer-events-none"
        style={{ background: "radial-gradient(circle, #00e5ff, transparent)", filter: "blur(60px)" }} />

      {/* ── HEADER ────────────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-5 py-2.5 border-b border-purple-500/20 flex-shrink-0 z-10"
        style={{ background: "rgba(10,5,20,0.9)", backdropFilter: "blur(16px)" }}>
        <button onClick={() => navigate("/")}
          className="flex items-center gap-1.5 text-purple-300/60 hover:text-pink-400 transition-colors text-sm">
          <ArrowRight size={16} /> العودة
        </button>

        {/* Logo + title */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="absolute inset-0 rounded-full opacity-60 blur-lg"
              style={{ background: "radial-gradient(circle, #e040fb, #00e5ff)" }} />
            <img src="/rose-logo.png" alt="روز"
              className="relative w-9 h-9 rounded-full object-cover border border-pink-400/40"
              style={{ filter: "drop-shadow(0 0 8px #e040fb)" }} />
          </div>
          <div>
            <span className="text-lg font-black neon-text-pink">روز</span>
            <span className="text-purple-300/50 text-xs mx-2">—</span>
            <span className="font-bold text-white text-sm">لعبة الأسئلة</span>
          </div>
        </div>

        {/* Status */}
        <div className="flex items-center gap-3 text-xs">
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${
            twitchConnected
              ? "border-purple-500/40 bg-purple-500/10 text-purple-300"
              : "border-gray-500/20 bg-gray-500/5 text-gray-500"
          }`}>
            <Tv2 size={12} />
            {twitchConnected ? `#${twitchChannel}` : "غير متصل"}
          </div>
          <div className={`w-2 h-2 rounded-full ${wsConnected ? "bg-green-400" : "bg-red-400"}`} />
          <span className="text-purple-300/50">{user?.username}</span>
          <button onClick={logout} className="text-purple-400/30 hover:text-red-400 transition-colors">خروج</button>
        </div>
      </header>

      {/* ── BODY ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── MAIN CENTER ───────────────────────────────────────────────── */}
        <main className="flex-1 flex flex-col items-center justify-center p-6 gap-5 overflow-y-auto">

          {/* IDLE — no question yet */}
          {phase === "idle" && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center space-y-4"
            >
              <div className="relative mx-auto w-32 h-32 mb-2">
                <div className="absolute inset-0 rounded-full opacity-30 blur-2xl animate-pulse"
                  style={{ background: "radial-gradient(circle, #e040fb, #00e5ff)" }} />
                <img src="/rose-logo.png" alt="روز"
                  className="relative w-32 h-32 rounded-full object-cover border-2 border-pink-400/40"
                  style={{ filter: "drop-shadow(0 0 20px #e040fb)" }} />
              </div>
              <h2 className="text-3xl font-black text-white">جاهز للعب؟</h2>
              <p className="text-purple-300/50 text-sm">اتصل بقناة Twitch ثم ابدأ اللعبة</p>
            </motion.div>
          )}

          {/* ACTIVE or REVEALED — show question */}
          <AnimatePresence mode="wait">
            {question && (
              <motion.div
                key={question.id}
                initial={{ opacity: 0, y: 30, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.4 }}
                className="w-full max-w-2xl space-y-5"
              >
                {/* Category + answer count */}
                <div className="flex items-center justify-between">
                  <span className="px-3 py-1 rounded-full text-xs font-bold"
                    style={{ background: `${catColor}18`, border: `1px solid ${catColor}50`, color: catColor }}>
                    {question.category}
                  </span>
                  <span className="text-xs text-purple-400/60 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                    {totalAnswers} إجابة
                  </span>
                </div>

                {/* Question text */}
                <div className="rounded-2xl border border-purple-500/30 p-7 text-center relative overflow-hidden"
                  style={{ background: "linear-gradient(135deg, rgba(26,10,46,0.98), rgba(8,20,48,0.98))" }}>
                  <div className="absolute top-0 inset-x-0 h-[2px]"
                    style={{ background: "linear-gradient(90deg, transparent, #e040fb, #00e5ff, transparent)" }} />
                  <p className="text-3xl font-black text-white leading-relaxed">{question.text}</p>
                </div>

                {/* 4 Choices */}
                <div className="grid grid-cols-2 gap-3">
                  {question.choices.map((choice, i) => {
                    const num = i + 1;
                    const col = CHOICE_COLORS[i];
                    const isCorrect = question.correctAnswer === num;
                    const isRevealed = phase === "revealed";
                    const pct = totalAnswers > 0
                      ? Math.round(((distribution[String(num)] ?? 0) / totalAnswers) * 100)
                      : 0;

                    let borderC = col.border;
                    let bgC = col.bg;
                    let textC = col.color;

                    if (isRevealed) {
                      if (isCorrect) { borderC = "#22c55e80"; bgC = "#22c55e18"; textC = "#22c55e"; }
                      else { borderC = "#ffffff12"; bgC = "rgba(20,10,35,0.7)"; textC = "#6b7280"; }
                    }

                    return (
                      <div
                        key={num}
                        className="relative flex items-center gap-3 p-4 rounded-2xl border overflow-hidden transition-all"
                        style={{ borderColor: borderC, background: bgC }}
                      >
                        {/* Distribution bar behind */}
                        {isRevealed && (
                          <div className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${pct}%` }}
                              transition={{ duration: 0.8, ease: "easeOut" }}
                              className="h-full opacity-10"
                              style={{ background: isCorrect ? "#22c55e" : col.color }}
                            />
                          </div>
                        )}

                        {/* Number badge */}
                        <span className={`relative w-9 h-9 rounded-full flex items-center justify-center text-base font-black flex-shrink-0 border ${
                          isRevealed
                            ? isCorrect ? "bg-green-500/20 border-green-500/60 text-green-400" : "bg-white/5 border-white/10 text-gray-600"
                            : col.num
                        }`}>
                          {num}
                        </span>

                        {/* Choice text */}
                        <span className="relative flex-1 text-base font-bold leading-snug" style={{ color: textC }}>
                          {choice}
                        </span>

                        {/* Right side: correct icon OR percentage */}
                        <div className="relative flex-shrink-0 text-right min-w-[36px]">
                          {isRevealed && isCorrect && <CheckCircle2 size={20} className="text-green-400" />}
                          {isRevealed && !isCorrect && (
                            <span className="text-xs font-bold text-gray-600">{pct}%</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Reveal banner */}
                {phase === "revealed" && question.correctAnswerText && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-xl border border-green-500/40 bg-green-500/10 p-4 text-center"
                  >
                    <div className="flex items-center justify-center gap-2">
                      <CheckCircle2 className="text-green-400" size={22} />
                      <span className="text-green-400 font-black text-lg">
                        الإجابة الصحيحة: {question.correctAnswerText}
                      </span>
                    </div>
                    <p className="text-xs text-purple-400/50 mt-1">{totalAnswers} مشارك أجاب</p>
                  </motion.div>
                )}

                {/* Live answer feed */}
                {phase === "active" && feed.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    <AnimatePresence>
                      {feed.map(f => (
                        <motion.span
                          key={f.id}
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.8 }}
                          className="px-2.5 py-1 rounded-full text-xs font-bold border"
                          style={{
                            background: f.correct ? "#22c55e10" : "#ef444410",
                            borderColor: f.correct ? "#22c55e40" : "#ef444440",
                            color: f.correct ? "#22c55e" : "#ef4444",
                          }}
                        >
                          {f.username}: {f.answer}
                        </motion.span>
                      ))}
                    </AnimatePresence>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {/* ── LEADERBOARD SIDEBAR ──────────────────────────────────────────── */}
        <aside className="w-60 flex flex-col border-r border-purple-500/20 flex-shrink-0"
          style={{ background: "rgba(10,5,20,0.7)" }}>
          <div className="flex items-center gap-2 px-4 py-3 border-b border-yellow-500/20 flex-shrink-0"
            style={{ background: "rgba(255,214,0,0.04)" }}>
            <Trophy size={15} className="text-yellow-400" />
            <span className="font-black text-yellow-400 text-sm">المتصدرون</span>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-purple-500/10">
            {leaderboard.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-4 py-12">
                <Trophy size={32} className="text-purple-400/15" />
                <p className="text-purple-400/30 text-xs">لا توجد نقاط بعد</p>
              </div>
            ) : leaderboard.map((entry) => {
              const medals = ["🥇", "🥈", "🥉"];
              const pct = leaderboard[0].score > 0 ? (entry.score / leaderboard[0].score) * 100 : 0;
              return (
                <motion.div
                  key={entry.username}
                  layout
                  className="relative flex items-center gap-2.5 px-3 py-2.5 overflow-hidden"
                >
                  {/* Score bar bg */}
                  <div className="absolute inset-0 opacity-20"
                    style={{ width: `${pct}%`, background: "linear-gradient(90deg, #e040fb20, transparent)" }} />
                  <span className="relative w-6 text-center text-sm font-black flex-shrink-0"
                    style={{
                      color: entry.rank === 1 ? "#ffd600" : entry.rank === 2 ? "#c0c0c0" : entry.rank === 3 ? "#cd7f32" : "#4b5563",
                    }}>
                    {entry.rank <= 3 ? medals[entry.rank - 1] : `#${entry.rank}`}
                  </span>
                  <span className="relative flex-1 text-xs font-medium truncate text-white/80">
                    {entry.username}
                  </span>
                  <span className="relative font-black text-yellow-400 text-sm flex-shrink-0">{entry.score}</span>
                </motion.div>
              );
            })}
          </div>
        </aside>
      </div>

      {/* ── HOST CONTROLS BAR ─────────────────────────────────────────────── */}
      <div className="flex-shrink-0 border-t border-purple-500/20 z-10"
        style={{ background: "rgba(10,5,20,0.95)", backdropFilter: "blur(16px)" }}>
        <div className="flex items-center gap-3 px-5 py-3 flex-wrap">

          {/* Twitch connect */}
          <form onSubmit={twitchConnect} className="flex items-center gap-2">
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-purple-500/30 bg-black/30">
              <Tv2 size={14} className="text-purple-400 flex-shrink-0" />
              <input
                value={channelInput}
                onChange={e => setChannelInput(e.target.value)}
                placeholder="اسم قناة Twitch"
                className="bg-transparent text-white text-sm placeholder-purple-400/30 focus:outline-none w-36"
              />
            </div>
            <motion.button
              type="submit"
              disabled={connecting || !channelInput.trim()}
              whileTap={{ scale: 0.95 }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all disabled:opacity-40"
              style={twitchConnected
                ? { background: "#ef444415", borderColor: "#ef444450", color: "#ef4444" }
                : { background: "#9c27b015", borderColor: "#9c27b050", color: "#e040fb" }
              }
            >
              {twitchConnected ? <><WifiOff size={13} /> قطع</> : <><Wifi size={13} /> اتصال</>}
            </motion.button>
          </form>

          <div className="h-8 w-px bg-purple-500/20" />

          {/* Start Game */}
          <HostBtn
            icon={<RefreshCw size={15} />}
            label="بدء اللعبة"
            desc="إعادة تعيين النقاط"
            color="#22c55e"
            onClick={seedAndStart}
            disabled={actionLoading}
          />

          {/* Start Question */}
          <HostBtn
            icon={<Play size={15} fill="currentColor" />}
            label="بدء السؤال"
            desc="سؤال جديد"
            color="#e040fb"
            onClick={() => hostAction("/quiz/question", "بدء السؤال")}
            disabled={actionLoading}
          />

          {/* Reveal Answer */}
          <HostBtn
            icon={<Eye size={15} />}
            label="عرض الإجابة"
            desc="أظهر الصحيح"
            color="#ffd600"
            onClick={() => hostAction("/quiz/reveal", "عرض الإجابة")}
            disabled={actionLoading || phase !== "active"}
          />

          {/* Next Question */}
          <HostBtn
            icon={<SkipForward size={15} />}
            label="السؤال التالي"
            desc="سؤال آخر"
            color="#00e5ff"
            onClick={() => hostAction("/quiz/question", "السؤال التالي")}
            disabled={actionLoading || phase === "active"}
          />

          {/* Phase indicator */}
          <div className="mr-auto flex items-center gap-2">
            <span className="text-xs text-purple-400/40">الحالة:</span>
            <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${
              phase === "active"
                ? "bg-green-500/15 border-green-500/40 text-green-400"
                : phase === "revealed"
                ? "bg-yellow-500/15 border-yellow-500/40 text-yellow-400"
                : "bg-purple-500/15 border-purple-500/40 text-purple-400"
            }`}>
              {phase === "active" ? "🟢 جارٍ السؤال" : phase === "revealed" ? "🟡 عرض الإجابة" : "⚪ انتظار"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Host button component ──────────────────────────────────────────────────
function HostBtn({
  icon, label, desc, color, onClick, disabled,
}: {
  icon: React.ReactNode;
  label: string;
  desc: string;
  color: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <motion.button
      onClick={onClick}
      disabled={disabled}
      whileHover={!disabled ? { scale: 1.04, y: -1 } : {}}
      whileTap={!disabled ? { scale: 0.96 } : {}}
      className="flex flex-col items-center gap-0.5 px-4 py-2 rounded-xl border transition-all disabled:opacity-30"
      style={{ background: `${color}10`, borderColor: `${color}35`, color }}
    >
      <span className="flex items-center gap-1.5 font-black text-sm">{icon}{label}</span>
      <span className="text-[10px] opacity-50">{desc}</span>
    </motion.button>
  );
}
