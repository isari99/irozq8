import { useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Plus, Minus, Eye, EyeOff, SkipForward, Zap, Trophy, Music2, RotateCcw, Play } from "lucide-react";

interface Song {
  id: number;
  title: string;
  artist: string;
  hint: string;
  answer: string;
}

const defaultSongs: Song[] = [
  { id: 1, title: "أغنية 1", artist: "فنان", hint: "أغنية عربية شهيرة", answer: "اسم الأغنية والفنان" },
  { id: 2, title: "أغنية 2", artist: "فنان", hint: "إيقاع سريع", answer: "اسم الأغنية والفنان" },
  { id: 3, title: "أغنية 3", artist: "فنان", hint: "بطيئة ورومانسية", answer: "اسم الأغنية والفنان" },
];

export default function SongGame() {
  const [, navigate] = useLocation();
  const [team1Score, setTeam1Score] = useState(0);
  const [team2Score, setTeam2Score] = useState(0);
  const [team1Name, setTeam1Name] = useState("الفريق الأول");
  const [team2Name, setTeam2Name] = useState("الفريق الثاني");
  const [currentSongIndex, setCurrentSongIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [doubleActive, setDoubleActive] = useState(false);
  const [gamePhase, setGamePhase] = useState<"setup" | "playing" | "ended">("setup");
  const [songs, setSongs] = useState<Song[]>(defaultSongs);
  const [currentTurn, setCurrentTurn] = useState<1 | 2>(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [addingNew, setAddingNew] = useState(false);
  const [newSong, setNewSong] = useState({ title: "", artist: "", hint: "", answer: "" });
  const [editingTeams, setEditingTeams] = useState(false);

  const currentSong = songs[currentSongIndex];
  const totalSongs = songs.length;

  const addPoint = (team: 1 | 2) => {
    const pts = doubleActive ? 2 : 1;
    if (team === 1) setTeam1Score(s => s + pts);
    else setTeam2Score(s => s + pts);
    setDoubleActive(false);
    setShowAnswer(false);
  };

  const skipSong = () => {
    setDoubleActive(false);
    setShowAnswer(false);
    setIsPlaying(false);
    if (currentSongIndex < songs.length - 1) {
      setCurrentSongIndex(i => i + 1);
      setCurrentTurn(currentTurn === 1 ? 2 : 1);
    } else {
      setGamePhase("ended");
    }
  };

  const playQuestion = () => {
    setIsPlaying(true);
    setShowAnswer(false);
  };

  const nextRound = () => {
    setShowAnswer(false);
    setIsPlaying(false);
    if (currentSongIndex < songs.length - 1) {
      setCurrentSongIndex(i => i + 1);
      setCurrentTurn(currentTurn === 1 ? 2 : 1);
    } else {
      setGamePhase("ended");
    }
  };

  const resetGame = () => {
    setTeam1Score(0);
    setTeam2Score(0);
    setCurrentSongIndex(0);
    setShowAnswer(false);
    setDoubleActive(false);
    setCurrentTurn(1);
    setIsPlaying(false);
    setGamePhase("playing");
  };

  const addSong = () => {
    if (!newSong.title.trim()) return;
    setSongs(s => [...s, { id: Date.now(), ...newSong }]);
    setNewSong({ title: "", artist: "", hint: "", answer: "" });
    setAddingNew(false);
  };

  const winner = team1Score > team2Score ? team1Name : team2Score > team1Score ? team2Name : "تعادل";

  return (
    <div className="min-h-screen gradient-bg relative overflow-hidden" dir="rtl">
      {/* Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-200px] right-[-200px] w-[500px] h-[500px] rounded-full opacity-10"
          style={{ background: "radial-gradient(circle, #e040fb, transparent)" }} />
        <div className="absolute bottom-[-200px] left-[-200px] w-[500px] h-[500px] rounded-full opacity-10"
          style={{ background: "radial-gradient(circle, #00e5ff, transparent)" }} />
      </div>

      <div className="relative z-10 max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-2 text-purple-300 hover:text-pink-400 transition-colors"
          >
            <ArrowRight size={20} />
            <span>العودة</span>
          </button>
          <div className="flex items-center gap-3">
            <Music2 className="text-pink-400" size={28} />
            <h1 className="text-3xl font-black neon-text-pink">لعبة الأغاني</h1>
          </div>
          <div className="w-24" />
        </div>

        {/* SETUP PHASE */}
        {gamePhase === "setup" && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            {/* Team names */}
            <div className="grid grid-cols-2 gap-4">
              {[{ name: team1Name, setName: setTeam1Name, color: "#e040fb", label: "اسم الفريق الأول" },
                { name: team2Name, setName: setTeam2Name, color: "#00e5ff", label: "اسم الفريق الثاني" }]
                .map((team, i) => (
                  <div key={i} className="rounded-2xl border p-5" style={{ borderColor: `${team.color}40`, background: `${team.color}10` }}>
                    <label className="block text-sm font-medium mb-2" style={{ color: team.color }}>{team.label}</label>
                    <input
                      value={team.name}
                      onChange={e => team.setName(e.target.value)}
                      className="w-full rounded-xl px-4 py-2.5 bg-black/30 border text-white font-bold text-lg text-center"
                      style={{ borderColor: `${team.color}40` }}
                    />
                  </div>
                ))}
            </div>

            {/* Songs list */}
            <div className="rounded-2xl border border-purple-500/30 p-5 bg-card">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-purple-300">قائمة الأغاني ({songs.length})</h3>
                <button
                  onClick={() => setAddingNew(true)}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold btn-shimmer"
                  style={{ background: "#e040fb20", border: "1px solid #e040fb50", color: "#e040fb" }}
                >
                  <Plus size={16} /> إضافة أغنية
                </button>
              </div>

              <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                {songs.map((song, idx) => (
                  <div key={song.id} className="flex items-center gap-3 rounded-xl p-3 border border-purple-500/20 bg-black/20">
                    <span className="text-pink-400 font-bold text-lg w-8 text-center">{idx + 1}</span>
                    <div className="flex-1">
                      <p className="font-bold text-white">{song.title}</p>
                      <p className="text-sm text-purple-300/60">{song.artist} • {song.hint}</p>
                    </div>
                    <button onClick={() => setSongs(s => s.filter(ss => ss.id !== song.id))}
                      className="text-red-400/60 hover:text-red-400 transition-colors">
                      <Minus size={16} />
                    </button>
                  </div>
                ))}
              </div>

              {addingNew && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className="mt-4 p-4 rounded-xl border border-pink-500/30 bg-pink-500/5 space-y-3"
                >
                  <div className="grid grid-cols-2 gap-3">
                    {[["title", "اسم الأغنية"], ["artist", "اسم الفنان"], ["hint", "تلميح"], ["answer", "الإجابة الصحيحة"]].map(([key, placeholder]) => (
                      <input
                        key={key}
                        placeholder={placeholder}
                        value={newSong[key as keyof typeof newSong]}
                        onChange={e => setNewSong(s => ({ ...s, [key]: e.target.value }))}
                        className="px-3 py-2 rounded-lg bg-black/30 border border-purple-500/30 text-sm text-white placeholder-purple-400/40"
                      />
                    ))}
                  </div>
                  <div className="flex gap-3">
                    <button onClick={addSong}
                      className="flex-1 py-2 rounded-lg font-bold text-sm"
                      style={{ background: "#e040fb30", border: "1px solid #e040fb50", color: "#e040fb" }}>
                      إضافة
                    </button>
                    <button onClick={() => setAddingNew(false)}
                      className="flex-1 py-2 rounded-lg font-bold text-sm border border-purple-500/30 text-purple-400">
                      إلغاء
                    </button>
                  </div>
                </motion.div>
              )}
            </div>

            <motion.button
              onClick={() => setGamePhase("playing")}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="w-full py-4 rounded-2xl text-xl font-black btn-shimmer"
              style={{
                background: "linear-gradient(135deg, #e040fb, #9c27b0)",
                boxShadow: "0 0 30px #e040fb40",
              }}
            >
              ابدأ اللعبة
            </motion.button>
          </motion.div>
        )}

        {/* PLAYING PHASE */}
        {gamePhase === "playing" && (
          <div className="space-y-6">
            {/* Scoreboard */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="grid grid-cols-3 gap-4 items-center"
            >
              {/* Team 1 */}
              <div className={`rounded-2xl p-5 text-center border transition-all ${currentTurn === 1 ? "border-pink-400/60 animate-pulse-glow" : "border-purple-500/20"}`}
                style={{ background: currentTurn === 1 ? "#e040fb15" : "#1a0a2e80" }}>
                <p className="text-sm font-medium text-pink-300/70 mb-1">{team1Name}</p>
                <p className="text-5xl font-black" style={{ color: "#e040fb", textShadow: "0 0 20px #e040fb" }}>{team1Score}</p>
                {currentTurn === 1 && <p className="text-xs text-pink-400 mt-1 font-bold">دورهم ⚡</p>}
              </div>

              {/* VS */}
              <div className="text-center">
                <p className="text-3xl font-black text-purple-400">VS</p>
                <p className="text-xs text-purple-400/60 mt-1">{currentSongIndex + 1}/{totalSongs}</p>
                <div className="mt-2 h-1.5 rounded-full bg-purple-800/40 overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${((currentSongIndex) / totalSongs) * 100}%`, background: "linear-gradient(90deg, #e040fb, #00e5ff)" }} />
                </div>
              </div>

              {/* Team 2 */}
              <div className={`rounded-2xl p-5 text-center border transition-all ${currentTurn === 2 ? "border-cyan-400/60 animate-pulse-glow" : "border-purple-500/20"}`}
                style={{ background: currentTurn === 2 ? "#00e5ff15" : "#1a0a2e80" }}>
                <p className="text-sm font-medium text-cyan-300/70 mb-1">{team2Name}</p>
                <p className="text-5xl font-black" style={{ color: "#00e5ff", textShadow: "0 0 20px #00e5ff" }}>{team2Score}</p>
                {currentTurn === 2 && <p className="text-xs text-cyan-400 mt-1 font-bold">دورهم ⚡</p>}
              </div>
            </motion.div>

            {/* Song card */}
            <motion.div
              key={currentSongIndex}
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              className="rounded-2xl border border-purple-500/30 p-6 relative overflow-hidden"
              style={{ background: "linear-gradient(135deg, #1a0a2e, #0a1a2e)" }}
            >
              <div className="absolute top-0 left-0 right-0 h-[2px]"
                style={{ background: "linear-gradient(90deg, transparent, #e040fb, #00e5ff, transparent)" }} />

              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center"
                    style={{ background: "#e040fb20", border: "1px solid #e040fb40" }}>
                    <Music2 className="text-pink-400" size={22} />
                  </div>
                  <div>
                    <p className="text-xs text-purple-400/60">سؤال {currentSongIndex + 1}</p>
                    <h3 className="text-xl font-bold text-white">{currentSong?.title || "أغنية"}</h3>
                    <p className="text-sm text-purple-300/60">{currentSong?.artist}</p>
                  </div>
                </div>

                {doubleActive && (
                  <motion.div
                    animate={{ scale: [1, 1.1, 1] }}
                    transition={{ repeat: Infinity, duration: 1 }}
                    className="px-4 py-2 rounded-xl font-black text-lg"
                    style={{ background: "#ffd60020", border: "2px solid #ffd600", color: "#ffd600" }}
                  >
                    × 2 DOUBLE
                  </motion.div>
                )}
              </div>

              {currentSong?.hint && (
                <div className="mb-4 p-3 rounded-xl border border-purple-500/20 bg-purple-500/10">
                  <p className="text-purple-300/80 text-sm"><span className="font-bold text-purple-300">تلميح:</span> {currentSong.hint}</p>
                </div>
              )}

              {/* Answer reveal (host only) */}
              <AnimatePresence>
                {showAnswer && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mb-4 p-4 rounded-xl border border-pink-500/40"
                    style={{ background: "#e040fb15" }}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <Eye size={16} className="text-pink-400" />
                      <span className="text-xs font-bold text-pink-400 uppercase">الإجابة - للهوست فقط</span>
                    </div>
                    <p className="text-white font-bold text-lg">{currentSong?.answer || currentSong?.title}</p>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Control buttons */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <button
                  onClick={playQuestion}
                  className={`flex items-center justify-center gap-2 py-3 rounded-xl font-bold btn-shimmer transition-all ${isPlaying ? "opacity-50" : ""}`}
                  style={{ background: "#22c55e20", border: "1px solid #22c55e50", color: "#22c55e" }}
                >
                  <Play size={18} /> {isPlaying ? "جارٍ التشغيل..." : "تشغيل السؤال"}
                </button>

                <button
                  onClick={() => setShowAnswer(!showAnswer)}
                  className="flex items-center justify-center gap-2 py-3 rounded-xl font-bold btn-shimmer"
                  style={{ background: "#f59e0b20", border: "1px solid #f59e0b50", color: "#f59e0b" }}
                >
                  {showAnswer ? <EyeOff size={18} /> : <Eye size={18} />}
                  {showAnswer ? "إخفاء الإجابة" : "إظهار الإجابة"}
                </button>
              </div>

              {/* Point buttons */}
              <div className="grid grid-cols-2 gap-3 mb-3">
                <motion.button
                  onClick={() => addPoint(1)}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  className="py-4 rounded-xl font-black text-lg btn-shimmer"
                  style={{ background: "linear-gradient(135deg, #e040fb30, #e040fb10)", border: "1px solid #e040fb60", color: "#e040fb" }}
                >
                  +{doubleActive ? 2 : 1} {team1Name}
                </motion.button>

                <motion.button
                  onClick={() => addPoint(2)}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  className="py-4 rounded-xl font-black text-lg btn-shimmer"
                  style={{ background: "linear-gradient(135deg, #00e5ff30, #00e5ff10)", border: "1px solid #00e5ff60", color: "#00e5ff" }}
                >
                  +{doubleActive ? 2 : 1} {team2Name}
                </motion.button>
              </div>

              {/* Double & Skip */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setDoubleActive(!doubleActive)}
                  className={`flex items-center justify-center gap-2 py-3 rounded-xl font-bold transition-all btn-shimmer ${doubleActive ? "animate-pulse-glow" : ""}`}
                  style={{
                    background: doubleActive ? "#ffd60030" : "#ffd60010",
                    border: `1px solid ${doubleActive ? "#ffd600" : "#ffd60040"}`,
                    color: "#ffd600"
                  }}
                >
                  <Zap size={18} /> {doubleActive ? "DOUBLE مفعّل!" : "تفعيل Double"}
                </button>

                <button
                  onClick={skipSong}
                  className="flex items-center justify-center gap-2 py-3 rounded-xl font-bold btn-shimmer"
                  style={{ background: "#6366f120", border: "1px solid #6366f150", color: "#6366f1" }}
                >
                  <SkipForward size={18} /> تخطي
                </button>
              </div>
            </motion.div>

            <button
              onClick={resetGame}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-purple-400/60 hover:text-purple-300 border border-purple-500/20 hover:border-purple-500/40 transition-all"
            >
              <RotateCcw size={16} /> إعادة تعيين اللعبة
            </button>
          </div>
        )}

        {/* ENDED PHASE */}
        {gamePhase === "ended" && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center gap-8 py-12"
          >
            <motion.div
              animate={{ y: [0, -10, 0] }}
              transition={{ repeat: Infinity, duration: 2 }}
            >
              <Trophy size={80} className="text-yellow-400" style={{ filter: "drop-shadow(0 0 20px #ffd600)" }} />
            </motion.div>

            <div className="text-center">
              <p className="text-purple-300/60 mb-2">الفائز</p>
              <h2 className="text-5xl font-black neon-text-pink">{winner}</h2>
            </div>

            <div className="flex gap-12">
              <div className="text-center">
                <p className="text-pink-400 font-bold">{team1Name}</p>
                <p className="text-4xl font-black" style={{ color: "#e040fb" }}>{team1Score}</p>
              </div>
              <div className="text-center">
                <p className="text-cyan-400 font-bold">{team2Name}</p>
                <p className="text-4xl font-black" style={{ color: "#00e5ff" }}>{team2Score}</p>
              </div>
            </div>

            <div className="flex gap-4">
              <button onClick={() => setGamePhase("setup")}
                className="px-8 py-3 rounded-xl font-bold btn-shimmer"
                style={{ background: "#e040fb20", border: "1px solid #e040fb50", color: "#e040fb" }}>
                لعبة جديدة
              </button>
              <button onClick={() => navigate("/")}
                className="px-8 py-3 rounded-xl font-bold border border-purple-500/30 text-purple-300">
                الرئيسية
              </button>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
