import { useState, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Plus, Trash2, Zap, RotateCcw, Skull, Shield } from "lucide-react";

interface Player {
  id: number;
  name: string;
  status: "alive" | "eliminated";
  lives: number;
}

const WHEEL_COLORS = [
  "#e040fb", "#00e5ff", "#ff6d00", "#00c853", "#ffd600",
  "#ff4081", "#40c4ff", "#ff6e40", "#69f0ae", "#eeff41",
  "#ea80fc", "#80d8ff", "#ff9e80", "#b9f6ca", "#ffff8d",
];

export default function WheelGame() {
  const [, navigate] = useLocation();
  const [players, setPlayers] = useState<Player[]>([]);
  const [newPlayerName, setNewPlayerName] = useState("");
  const [gamePhase, setGamePhase] = useState<"setup" | "playing">("setup");
  const [isSpinning, setIsSpinning] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [eliminationResult, setEliminationResult] = useState<{
    player: Player;
    shots: number;
    survived: boolean;
  } | null>(null);
  const [rotation, setRotation] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const spinTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const alivePlayers = players.filter(p => p.status === "alive");

  const addPlayer = () => {
    const name = newPlayerName.trim();
    if (!name) return;
    setPlayers(p => [...p, { id: Date.now(), name, status: "alive", lives: 3 }]);
    setNewPlayerName("");
  };

  const removePlayer = (id: number) => {
    setPlayers(p => p.filter(pp => pp.id !== id));
  };

  const spinWheel = useCallback(() => {
    if (isSpinning || alivePlayers.length < 2) return;

    setIsSpinning(true);
    setShowResult(false);
    setEliminationResult(null);
    setSelectedPlayer(null);

    // Random spin amount: 5-10 full rotations + random offset
    const extraRotation = Math.random() * 360;
    const totalRotation = rotation + 360 * (Math.floor(Math.random() * 5) + 5) + extraRotation;
    setRotation(totalRotation);

    // After spin, determine selected player
    const spinDuration = 4000;
    if (spinTimeoutRef.current) clearTimeout(spinTimeoutRef.current);

    spinTimeoutRef.current = setTimeout(() => {
      // Determine which player the wheel landed on
      const normalizedAngle = ((totalRotation % 360) + 360) % 360;
      const segmentAngle = 360 / alivePlayers.length;
      const selectedIndex = Math.floor((360 - normalizedAngle + segmentAngle / 2) / segmentAngle) % alivePlayers.length;
      const selected = alivePlayers[selectedIndex] || alivePlayers[0];

      setSelectedPlayer(selected);

      // Random elimination logic
      const shots = Math.floor(Math.random() * 7) + 1; // 1-7 shots
      const survived = Math.random() > 0.5; // 50% chance

      setTimeout(() => {
        setEliminationResult({ player: selected, shots, survived });
        setShowResult(true);

        if (!survived) {
          setPlayers(p => p.map(pp =>
            pp.id === selected.id ? { ...pp, status: "eliminated" } : pp
          ));
        }

        setIsSpinning(false);
      }, 1000);
    }, spinDuration);
  }, [isSpinning, alivePlayers, rotation]);

  const resetGame = () => {
    setPlayers(p => p.map(pp => ({ ...pp, status: "alive", lives: 3 })));
    setSelectedPlayer(null);
    setEliminationResult(null);
    setShowResult(false);
    setRotation(0);
  };

  const lastPlayerStanding = alivePlayers.length === 1;
  const gameOver = alivePlayers.length <= 1;

  return (
    <div className="min-h-screen gradient-bg relative overflow-hidden" dir="rtl">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-200px] right-[-200px] w-[500px] h-[500px] rounded-full opacity-10"
          style={{ background: "radial-gradient(circle, #ff6d00, transparent)" }} />
        <div className="absolute bottom-[-200px] left-[-200px] w-[500px] h-[500px] rounded-full opacity-10"
          style={{ background: "radial-gradient(circle, #e040fb, transparent)" }} />
      </div>

      <div className="relative z-10 max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <button onClick={() => navigate("/")}
            className="flex items-center gap-2 text-purple-300 hover:text-orange-400 transition-colors">
            <ArrowRight size={20} /><span>العودة</span>
          </button>
          <div className="flex items-center gap-3">
            <span className="text-3xl">🎡</span>
            <h1 className="text-3xl font-black" style={{ color: "#ff6d00", textShadow: "0 0 20px #ff6d00" }}>
              عجلة الحرب
            </h1>
          </div>
          <div className="w-24" />
        </div>

        {/* Setup */}
        {gamePhase === "setup" && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            {/* Add player */}
            <div className="rounded-2xl border border-orange-500/30 p-5 bg-card">
              <h3 className="text-lg font-bold text-orange-300 mb-4">إضافة اللاعبين</h3>
              <div className="flex gap-3">
                <input
                  value={newPlayerName}
                  onChange={e => setNewPlayerName(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && addPlayer()}
                  placeholder="اسم اللاعب..."
                  className="flex-1 px-4 py-3 rounded-xl bg-black/30 border border-orange-500/30 text-white placeholder-orange-400/40 font-medium"
                />
                <button onClick={addPlayer}
                  className="px-6 py-3 rounded-xl font-bold btn-shimmer flex items-center gap-2"
                  style={{ background: "#ff6d0020", border: "1px solid #ff6d0050", color: "#ff6d00" }}>
                  <Plus size={18} /> إضافة
                </button>
              </div>

              {players.length > 0 && (
                <div className="mt-4 space-y-2 max-h-60 overflow-y-auto">
                  {players.map((player, i) => (
                    <div key={player.id} className="flex items-center gap-3 p-3 rounded-xl border border-purple-500/20 bg-black/20">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
                        style={{ background: WHEEL_COLORS[i % WHEEL_COLORS.length] + "30", color: WHEEL_COLORS[i % WHEEL_COLORS.length] }}>
                        {i + 1}
                      </div>
                      <span className="flex-1 font-medium text-white">{player.name}</span>
                      <button onClick={() => removePlayer(player.id)}
                        className="text-red-400/60 hover:text-red-400 transition-colors">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <motion.button
              onClick={() => players.length >= 2 && setGamePhase("playing")}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              disabled={players.length < 2}
              className="w-full py-4 rounded-2xl text-xl font-black btn-shimmer disabled:opacity-40"
              style={{
                background: "linear-gradient(135deg, #ff6d00, #e65100)",
                boxShadow: "0 0 30px #ff6d0040",
              }}
            >
              {players.length < 2 ? `أضف ${2 - players.length} لاعب على الأقل` : "ابدأ العجلة!"}
            </motion.button>
          </motion.div>
        )}

        {/* Playing */}
        {gamePhase === "playing" && (
          <div className="flex flex-col items-center gap-8">
            {/* Wheel */}
            <div className="relative">
              {/* Pointer */}
              <div className="absolute top-1/2 -translate-y-1/2 -right-4 z-20 w-0 h-0"
                style={{ borderTop: "12px solid transparent", borderBottom: "12px solid transparent", borderRight: "24px solid #ffd600", filter: "drop-shadow(0 0 8px #ffd600)" }} />

              <div className="relative w-72 h-72 md:w-80 md:h-80">
                {/* Outer glow ring */}
                <div className="absolute inset-[-8px] rounded-full opacity-40 animate-spin-slow"
                  style={{ background: "conic-gradient(from 0deg, #e040fb, #00e5ff, #ff6d00, #ffd600, #e040fb)" }} />
                <div className="absolute inset-[-4px] rounded-full"
                  style={{ background: "linear-gradient(135deg, #1a0a2e, #0a1a2e)", boxShadow: "inset 0 0 20px rgba(0,0,0,0.5)" }} />

                {/* Wheel SVG */}
                <motion.div
                  className="absolute inset-0 rounded-full overflow-hidden"
                  style={{ transformOrigin: "center" }}
                  animate={{ rotate: rotation }}
                  transition={{ duration: isSpinning ? 4 : 0, ease: [0.2, 1, 0.3, 1] }}
                >
                  <svg viewBox="0 0 100 100" className="w-full h-full">
                    {alivePlayers.map((player, i) => {
                      const total = alivePlayers.length;
                      const angle = 360 / total;
                      const startAngle = i * angle;
                      const endAngle = startAngle + angle;
                      const startRad = (startAngle - 90) * (Math.PI / 180);
                      const endRad = (endAngle - 90) * (Math.PI / 180);
                      const x1 = 50 + 50 * Math.cos(startRad);
                      const y1 = 50 + 50 * Math.sin(startRad);
                      const x2 = 50 + 50 * Math.cos(endRad);
                      const y2 = 50 + 50 * Math.sin(endRad);
                      const largeArc = angle > 180 ? 1 : 0;

                      const midAngle = (startAngle + angle / 2 - 90) * (Math.PI / 180);
                      const textX = 50 + 32 * Math.cos(midAngle);
                      const textY = 50 + 32 * Math.sin(midAngle);

                      const color = WHEEL_COLORS[i % WHEEL_COLORS.length];

                      return (
                        <g key={player.id}>
                          <path
                            d={`M 50 50 L ${x1} ${y1} A 50 50 0 ${largeArc} 1 ${x2} ${y2} Z`}
                            fill={color + "88"}
                            stroke={color}
                            strokeWidth="0.5"
                          />
                          <text
                            x={textX}
                            y={textY}
                            textAnchor="middle"
                            dominantBaseline="middle"
                            fontSize={total > 8 ? "3.5" : "4.5"}
                            fill="white"
                            fontWeight="bold"
                            style={{ pointerEvents: "none" }}
                          >
                            {player.name.slice(0, total > 6 ? 4 : 6)}
                          </text>
                        </g>
                      );
                    })}
                    {/* Center circle */}
                    <circle cx="50" cy="50" r="10" fill="#1a0a2e" stroke="#e040fb" strokeWidth="0.5" />
                    <text x="50" y="50" textAnchor="middle" dominantBaseline="middle" fontSize="6" fill="#e040fb">روز</text>
                  </svg>
                </motion.div>
              </div>
            </div>

            {/* Spin button */}
            <motion.button
              onClick={spinWheel}
              disabled={isSpinning || gameOver}
              whileHover={!isSpinning && !gameOver ? { scale: 1.05 } : {}}
              whileTap={!isSpinning && !gameOver ? { scale: 0.95 } : {}}
              className="px-12 py-4 rounded-2xl text-xl font-black btn-shimmer disabled:opacity-50"
              style={{
                background: isSpinning ? "#6b7280" : "linear-gradient(135deg, #ff6d00, #e65100)",
                boxShadow: isSpinning ? "none" : "0 0 30px #ff6d0060",
              }}
              animate={isSpinning ? {} : { boxShadow: ["0 0 20px #ff6d0040", "0 0 40px #ff6d0080", "0 0 20px #ff6d0040"] }}
              transition={{ repeat: Infinity, duration: 2 }}
            >
              {isSpinning ? "جارٍ الدوران..." : gameOver ? "انتهت اللعبة" : "🎡 الدوران!"}
            </motion.button>

            {/* Result popup */}
            <AnimatePresence>
              {showResult && eliminationResult && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.7, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.7 }}
                  className="w-full max-w-sm p-6 rounded-2xl border text-center"
                  style={{
                    background: eliminationResult.survived ? "#00c85320" : "#ff000020",
                    borderColor: eliminationResult.survived ? "#00c853" : "#ff1744",
                    boxShadow: eliminationResult.survived ? "0 0 30px #00c85340" : "0 0 30px #ff174440",
                  }}
                >
                  <motion.div
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ repeat: 3, duration: 0.4 }}
                    className="text-5xl mb-3"
                  >
                    {eliminationResult.survived ? "🛡️" : "💀"}
                  </motion.div>
                  <h3 className="text-2xl font-black mb-2"
                    style={{ color: eliminationResult.survived ? "#00c853" : "#ff1744" }}>
                    {eliminationResult.player.name}
                  </h3>
                  <p className="text-white/70 mb-2">
                    عدد الطلقات: <span className="font-bold text-yellow-400">{eliminationResult.shots}</span>
                  </p>
                  <p className="text-lg font-bold"
                    style={{ color: eliminationResult.survived ? "#00c853" : "#ff1744" }}>
                    {eliminationResult.survived ? "✅ نجا!" : "❌ تم إقصاؤه!"}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Last player standing */}
            {lastPlayerStanding && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center p-6 rounded-2xl border border-yellow-500/50"
                style={{ background: "#ffd60015" }}
              >
                <div className="text-5xl mb-3">🏆</div>
                <p className="text-yellow-400 font-bold text-lg mb-1">الفائز</p>
                <p className="text-3xl font-black text-yellow-300">{alivePlayers[0].name}</p>
              </motion.div>
            )}

            {/* Players list */}
            <div className="w-full grid grid-cols-2 gap-3">
              {players.map((player, i) => (
                <div key={player.id}
                  className="flex items-center gap-3 p-3 rounded-xl border transition-all"
                  style={{
                    borderColor: player.status === "eliminated" ? "#ff174420" : WHEEL_COLORS[i % WHEEL_COLORS.length] + "40",
                    background: player.status === "eliminated" ? "rgba(255,23,68,0.05)" : "rgba(0,0,0,0.3)",
                    opacity: player.status === "eliminated" ? 0.5 : 1,
                  }}>
                  {player.status === "eliminated"
                    ? <Skull size={18} className="text-red-400/60 flex-shrink-0" />
                    : <Shield size={18} style={{ color: WHEEL_COLORS[i % WHEEL_COLORS.length] }} className="flex-shrink-0" />
                  }
                  <span className={`font-medium ${player.status === "eliminated" ? "line-through text-white/30" : "text-white"}`}>
                    {player.name}
                  </span>
                </div>
              ))}
            </div>

            {/* Controls */}
            <div className="flex gap-4 w-full">
              <button onClick={resetGame}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-purple-400/60 hover:text-purple-300 border border-purple-500/20 transition-all">
                <RotateCcw size={16} /> إعادة
              </button>
              <button onClick={() => { setGamePhase("setup"); setPlayers([]); setRotation(0); }}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-orange-400/60 hover:text-orange-300 border border-orange-500/20 transition-all">
                <Zap size={16} /> تغيير اللاعبين
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
