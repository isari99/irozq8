import { useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, RotateCcw, Trophy, Grid3X3 } from "lucide-react";

type Cell = "X" | "O" | null;
type Player = "X" | "O";

const WINNING_COMBOS = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

function checkWinner(board: Cell[]): { winner: Player | null; combo: number[] | null } {
  for (const combo of WINNING_COMBOS) {
    const [a, b, c] = combo;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a] as Player, combo };
    }
  }
  return { winner: null, combo: null };
}

export default function XOGame() {
  const [, navigate] = useLocation();
  const [board, setBoard] = useState<Cell[]>(Array(9).fill(null));
  const [currentPlayer, setCurrentPlayer] = useState<Player>("X");
  const [scores, setScores] = useState({ X: 0, O: 0, draw: 0 });
  const [playerNames, setPlayerNames] = useState({ X: "الفريق X", O: "الفريق O" });
  const [gamePhase, setGamePhase] = useState<"setup" | "playing" | "result">("setup");
  const [resultMessage, setResultMessage] = useState("");
  const [winningCombo, setWinningCombo] = useState<number[] | null>(null);

  const { winner, combo } = checkWinner(board);
  const isDraw = !winner && board.every(c => c !== null);

  const handleCellClick = (index: number) => {
    if (board[index] || winner || isDraw) return;

    const newBoard = [...board];
    newBoard[index] = currentPlayer;
    setBoard(newBoard);

    const { winner: newWinner, combo: newCombo } = checkWinner(newBoard);
    if (newWinner) {
      setWinningCombo(newCombo);
      setScores(s => ({ ...s, [newWinner]: s[newWinner] + 1 }));
      setResultMessage(`🎉 فاز ${playerNames[newWinner]}!`);
      setGamePhase("result");
    } else if (newBoard.every(c => c !== null)) {
      setScores(s => ({ ...s, draw: s.draw + 1 }));
      setResultMessage("🤝 تعادل!");
      setGamePhase("result");
    } else {
      setCurrentPlayer(currentPlayer === "X" ? "O" : "X");
    }
  };

  const resetBoard = () => {
    setBoard(Array(9).fill(null));
    setCurrentPlayer(winner || "X");
    setWinningCombo(null);
    setGamePhase("playing");
  };

  const fullReset = () => {
    setBoard(Array(9).fill(null));
    setCurrentPlayer("X");
    setScores({ X: 0, O: 0, draw: 0 });
    setWinningCombo(null);
    setGamePhase("setup");
  };

  const xColor = "#e040fb";
  const oColor = "#00e5ff";

  return (
    <div className="min-h-screen gradient-bg relative overflow-hidden" dir="rtl">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-200px] right-[-200px] w-[500px] h-[500px] rounded-full opacity-10"
          style={{ background: "radial-gradient(circle, #e040fb, transparent)" }} />
        <div className="absolute bottom-[-200px] left-[-200px] w-[500px] h-[500px] rounded-full opacity-10"
          style={{ background: "radial-gradient(circle, #00e5ff, transparent)" }} />
      </div>

      <div className="relative z-10 max-w-2xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <button onClick={() => navigate("/")}
            className="flex items-center gap-2 text-purple-300 hover:text-cyan-400 transition-colors">
            <ArrowRight size={20} /><span>العودة</span>
          </button>
          <div className="flex items-center gap-3">
            <Grid3X3 className="text-cyan-400" size={28} />
            <h1 className="text-3xl font-black neon-text-cyan">لعبة XO</h1>
          </div>
          <div className="w-24" />
        </div>

        {/* Setup */}
        {gamePhase === "setup" && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              {[{ key: "X", color: xColor, label: "اسم لاعب X" }, { key: "O", color: oColor, label: "اسم لاعب O" }].map(p => (
                <div key={p.key} className="rounded-2xl border p-5" style={{ borderColor: `${p.color}40`, background: `${p.color}10` }}>
                  <label className="block text-sm font-medium mb-2" style={{ color: p.color }}>{p.label}</label>
                  <input
                    value={playerNames[p.key as Player]}
                    onChange={e => setPlayerNames(n => ({ ...n, [p.key]: e.target.value }))}
                    className="w-full rounded-xl px-4 py-2.5 bg-black/30 border text-white font-bold text-lg text-center"
                    style={{ borderColor: `${p.color}40` }}
                  />
                </div>
              ))}
            </div>

            <motion.button
              onClick={() => setGamePhase("playing")}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="w-full py-4 rounded-2xl text-xl font-black btn-shimmer"
              style={{ background: "linear-gradient(135deg, #00e5ff80, #0288d1)", boxShadow: "0 0 30px #00e5ff40" }}
            >
              ابدأ اللعبة
            </motion.button>
          </motion.div>
        )}

        {/* Playing */}
        {(gamePhase === "playing" || gamePhase === "result") && (
          <div className="space-y-6">
            {/* Score */}
            <div className="grid grid-cols-3 gap-3 items-center">
              <div className={`rounded-2xl p-4 text-center border ${currentPlayer === "X" && gamePhase === "playing" ? "border-pink-400/60 animate-pulse-glow" : "border-purple-500/20"}`}
                style={{ background: "#e040fb15" }}>
                <p className="text-4xl font-black" style={{ color: xColor, textShadow: `0 0 20px ${xColor}` }}>✕</p>
                <p className="text-sm text-pink-300/70 mt-1">{playerNames.X}</p>
                <p className="text-2xl font-black" style={{ color: xColor }}>{scores.X}</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-black text-purple-400">VS</p>
                <p className="text-xs text-purple-400/60">تعادل: {scores.draw}</p>
              </div>
              <div className={`rounded-2xl p-4 text-center border ${currentPlayer === "O" && gamePhase === "playing" ? "border-cyan-400/60 animate-pulse-glow" : "border-purple-500/20"}`}
                style={{ background: "#00e5ff15" }}>
                <p className="text-4xl font-black" style={{ color: oColor, textShadow: `0 0 20px ${oColor}` }}>○</p>
                <p className="text-sm text-cyan-300/70 mt-1">{playerNames.O}</p>
                <p className="text-2xl font-black" style={{ color: oColor }}>{scores.O}</p>
              </div>
            </div>

            {/* Turn indicator */}
            {gamePhase === "playing" && (
              <div className="text-center">
                <p className="text-purple-300/60">دور</p>
                <p className="text-2xl font-black" style={{
                  color: currentPlayer === "X" ? xColor : oColor,
                  textShadow: `0 0 15px ${currentPlayer === "X" ? xColor : oColor}`
                }}>
                  {playerNames[currentPlayer]} ({currentPlayer === "X" ? "✕" : "○"})
                </p>
              </div>
            )}

            {/* Board */}
            <div className="grid grid-cols-3 gap-3 max-w-sm mx-auto">
              {board.map((cell, index) => {
                const isWinning = winningCombo?.includes(index);
                return (
                  <motion.button
                    key={index}
                    onClick={() => handleCellClick(index)}
                    className={`xo-cell aspect-square rounded-2xl border flex items-center justify-center text-5xl font-black ${cell ? "occupied" : ""}`}
                    style={{
                      borderColor: isWinning ? (cell === "X" ? xColor : oColor) : "#4a2060",
                      boxShadow: isWinning ? `0 0 20px ${cell === "X" ? xColor : oColor}` : "none",
                      background: isWinning
                        ? `${cell === "X" ? xColor : oColor}20`
                        : cell ? "#1a0a2e" : undefined,
                    }}
                    whileHover={!cell && !winner && !isDraw ? { scale: 1.05 } : {}}
                    whileTap={!cell && !winner && !isDraw ? { scale: 0.95 } : {}}
                    animate={isWinning ? { scale: [1, 1.1, 1] } : {}}
                    transition={{ duration: 0.5, repeat: isWinning ? Infinity : 0 }}
                  >
                    <AnimatePresence>
                      {cell && (
                        <motion.span
                          initial={{ scale: 0, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={{ type: "spring", stiffness: 400 }}
                          style={{
                            color: cell === "X" ? xColor : oColor,
                            textShadow: `0 0 15px ${cell === "X" ? xColor : oColor}`,
                          }}
                        >
                          {cell === "X" ? "✕" : "○"}
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </motion.button>
                );
              })}
            </div>

            {/* Result */}
            <AnimatePresence>
              {gamePhase === "result" && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  className="text-center p-6 rounded-2xl border border-yellow-500/30"
                  style={{ background: "#ffd60015" }}
                >
                  <p className="text-3xl font-black text-yellow-400 mb-4">{resultMessage}</p>
                  <div className="flex gap-4 justify-center">
                    <button onClick={resetBoard}
                      className="px-6 py-3 rounded-xl font-bold btn-shimmer"
                      style={{ background: "#00e5ff20", border: "1px solid #00e5ff50", color: "#00e5ff" }}>
                      جولة جديدة
                    </button>
                    <button onClick={fullReset}
                      className="px-6 py-3 rounded-xl font-bold btn-shimmer"
                      style={{ background: "#e040fb20", border: "1px solid #e040fb50", color: "#e040fb" }}>
                      لعبة جديدة
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {gamePhase === "playing" && (
              <button onClick={fullReset}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-purple-400/60 hover:text-purple-300 border border-purple-500/20 transition-all">
                <RotateCcw size={16} /> إعادة تعيين الكل
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
