import { useState, useRef, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Wifi, WifiOff, Users, Play, RotateCcw, Tv2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

// ─── Types ────────────────────────────────────────────────────────────────────
type Mark = "X" | "O" | null;
type GamePhase = "joining" | "playing" | "result";

interface XOPlayer {
  username: string;
  displayName: string;
  avatar: string;
  mark: "X" | "O";
}

const WINNING_COMBOS = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

function checkWinner(board: Mark[]): { winner: "X" | "O" | null; combo: number[] | null } {
  for (const combo of WINNING_COMBOS) {
    const [a, b, c] = combo;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a] as "X" | "O", combo };
    }
  }
  return { winner: null, combo: null };
}

const X_COLOR = "#e040fb";
const O_COLOR = "#00e5ff";

// ─── Player Avatar Card ───────────────────────────────────────────────────────
const PlayerAvatar = ({
  player,
  isActive,
  mark,
}: {
  player: XOPlayer | null;
  isActive: boolean;
  mark: "X" | "O";
}) => {
  const color = mark === "X" ? X_COLOR : O_COLOR;
  return (
    <div
      className="flex flex-col items-center gap-2 p-3 rounded-2xl border transition-all duration-300"
      style={{
        borderColor: isActive ? color : `${color}30`,
        background: isActive ? `${color}12` : `${color}06`,
        boxShadow: isActive ? `0 0 20px ${color}25` : "none",
      }}
    >
      {player ? (
        <>
          <div
            className="relative w-16 h-16 rounded-xl overflow-hidden border-2"
            style={{
              borderColor: isActive ? color : `${color}40`,
              boxShadow: isActive ? `0 0 14px ${color}40` : "none",
            }}
          >
            <img
              src={player.avatar}
              alt={player.displayName}
              className="w-full h-full object-cover"
              onError={e => {
                (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${player.username}`;
              }}
            />
            {isActive && (
              <motion.div
                className="absolute inset-0"
                animate={{ opacity: [0.15, 0.35, 0.15] }}
                transition={{ repeat: Infinity, duration: 1.2 }}
                style={{ background: color }}
              />
            )}
          </div>
          <p className="text-xs font-bold truncate max-w-[80px] text-center" style={{ color }}>
            {player.displayName}
          </p>
        </>
      ) : (
        <>
          <div
            className="w-16 h-16 rounded-xl border-2 border-dashed flex items-center justify-center"
            style={{ borderColor: `${color}35` }}
          >
            <span className="text-2xl font-black" style={{ color: `${color}40` }}>?</span>
          </div>
          <p className="text-xs text-purple-400/30">بانتظار...</p>
        </>
      )}
      <div
        className="text-2xl font-black leading-none"
        style={{
          color: isActive ? color : `${color}60`,
          textShadow: isActive ? `0 0 14px ${color}` : "none",
        }}
      >
        {mark === "X" ? "✕" : "○"}
      </div>
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────
export default function XOGame() {
  const [, navigate] = useLocation();
  const { user } = useAuth();

  const [phase, setPhase] = useState<GamePhase>("joining");
  const [players, setPlayers] = useState<{ X: XOPlayer | null; O: XOPlayer | null }>({
    X: null, O: null,
  });
  const [board, setBoard] = useState<Mark[]>(Array(9).fill(null));
  const [currentMark, setCurrentMark] = useState<"X" | "O">("X");
  const [winnerInfo, setWinnerInfo] = useState<{
    mark: "X" | "O"; combo: number[];
  } | null>(null);
  const [isDraw, setIsDraw] = useState(false);
  const [scores, setScores] = useState({ X: 0, O: 0, draw: 0 });
  const [joinMsg, setJoinMsg] = useState("");
  const [twitchConnected, setTwitchConnected] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const phaseRef = useRef<GamePhase>("joining");
  const playersRef = useRef<{ X: XOPlayer | null; O: XOPlayer | null }>({ X: null, O: null });
  const boardRef = useRef<Mark[]>(Array(9).fill(null));
  const currentMarkRef = useRef<"X" | "O">("X");
  const connectedRef = useRef(false);

  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { playersRef.current = players; }, [players]);
  useEffect(() => { currentMarkRef.current = currentMark; }, [currentMark]);
  useEffect(() => { boardRef.current = board; }, [board]);

  // ── Twitch IRC ─────────────────────────────────────────────────────────────
  const connectTwitch = useCallback((channel: string) => {
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
    const ch = channel.toLowerCase().replace(/^#/, "");
    const ws = new WebSocket("wss://irc-ws.chat.twitch.tv");
    wsRef.current = ws;
    ws.onopen = () => {
      ws.send("PASS SCHMOOPIIE");
      ws.send(`NICK justinfan${Math.floor(Math.random() * 89999) + 10000}`);
      ws.send(`JOIN #${ch}`);
    };
    ws.onmessage = e => {
      const lines = (e.data as string).split("\r\n").filter(Boolean);
      for (const line of lines) {
        if (line.startsWith("PING")) { ws.send("PONG :tmi.twitch.tv"); continue; }
        if (line.includes("366") || line.includes("ROOMSTATE")) { setTwitchConnected(true); continue; }
        const m = line.match(/^(?:@[^ ]+ )?:(\w+)!\w+@\w+\.tmi\.twitch\.tv PRIVMSG #\w+ :(.+)$/);
        if (m) handleChatMsg(m[1], m[2].trim());
      }
    };
    ws.onclose = () => setTwitchConnected(false);
  }, []);

  if (!connectedRef.current && user?.username) {
    connectedRef.current = true;
    setTimeout(() => connectTwitch(user.username), 80);
  }

  // ── Chat handler ───────────────────────────────────────────────────────────
  const handleChatMsg = useCallback((username: string, text: string) => {
    const msg = text.trim().toLowerCase();
    const ph = phaseRef.current;
    const pl = playersRef.current;

    // JOIN phase — accept first 2 unique players
    if (msg === "join" && ph === "joining") {
      const alreadyJoined = pl.X?.username === username || pl.O?.username === username;
      if (alreadyJoined) return;

      const slot: "X" | "O" | null = !pl.X ? "X" : !pl.O ? "O" : null;
      if (!slot) return; // already 2 players

      const newPlayer: XOPlayer = {
        username,
        displayName: username,
        avatar: `https://unavatar.io/twitch/${username}`,
        mark: slot,
      };

      setPlayers(prev => {
        const next = { ...prev, [slot]: newPlayer };
        playersRef.current = next;
        return next;
      });
      setJoinMsg(`${username} انضم كـ ${slot}`);
      setTimeout(() => setJoinMsg(""), 2500);
      return;
    }

    // PLAYING phase — current player types 1-9
    if (ph === "playing") {
      const mark = currentMarkRef.current;
      const pl2 = playersRef.current;
      const currentPlayer = mark === "X" ? pl2.X : pl2.O;
      if (!currentPlayer || currentPlayer.username !== username) return;

      const num = parseInt(msg, 10);
      if (isNaN(num) || num < 1 || num > 9) return;
      const cellIndex = num - 1;

      const b = boardRef.current;
      if (b[cellIndex] !== null) return; // already taken

      const newBoard = [...b];
      newBoard[cellIndex] = mark;
      boardRef.current = newBoard;
      setBoard([...newBoard]);

      const { winner, combo } = checkWinner(newBoard);
      if (winner && combo) {
        setWinnerInfo({ mark: winner, combo });
        setScores(s => ({ ...s, [winner]: s[winner] + 1 }));
        phaseRef.current = "result";
        setPhase("result");
      } else if (newBoard.every(c => c !== null)) {
        setIsDraw(true);
        setScores(s => ({ ...s, draw: s.draw + 1 }));
        phaseRef.current = "result";
        setPhase("result");
      } else {
        const next = mark === "X" ? "O" : "X";
        currentMarkRef.current = next;
        setCurrentMark(next);
      }
    }
  }, []);

  // ── Game controls ──────────────────────────────────────────────────────────
  const startGame = () => {
    if (!players.X || !players.O) return;
    const empty: Mark[] = Array(9).fill(null);
    setBoard(empty); boardRef.current = empty;
    setCurrentMark("X"); currentMarkRef.current = "X";
    setWinnerInfo(null); setIsDraw(false);
    phaseRef.current = "playing"; setPhase("playing");
  };

  const rematch = () => {
    // Keep same players, reset board only
    const empty: Mark[] = Array(9).fill(null);
    setBoard(empty); boardRef.current = empty;
    setCurrentMark("X"); currentMarkRef.current = "X";
    setWinnerInfo(null); setIsDraw(false);
    phaseRef.current = "playing"; setPhase("playing");
  };

  const newGame = () => {
    setPlayers({ X: null, O: null }); playersRef.current = { X: null, O: null };
    const empty: Mark[] = Array(9).fill(null);
    setBoard(empty); boardRef.current = empty;
    setCurrentMark("X"); currentMarkRef.current = "X";
    setWinnerInfo(null); setIsDraw(false);
    setScores({ X: 0, O: 0, draw: 0 });
    phaseRef.current = "joining"; setPhase("joining");
  };

  const bothJoined = players.X !== null && players.O !== null;
  const winnerPlayer = winnerInfo ? (winnerInfo.mark === "X" ? players.X : players.O) : null;
  const currentPlayer = currentMark === "X" ? players.X : players.O;

  return (
    <div className="min-h-screen gradient-bg relative overflow-hidden flex flex-col" dir="rtl">
      {/* Background glows */}
      <div className="absolute top-0 right-0 w-[400px] h-[400px] rounded-full opacity-10 pointer-events-none"
        style={{ background: "radial-gradient(circle, #e040fb, transparent)", filter: "blur(80px)" }} />
      <div className="absolute bottom-0 left-0 w-[400px] h-[400px] rounded-full opacity-10 pointer-events-none"
        style={{ background: "radial-gradient(circle, #00e5ff, transparent)", filter: "blur(80px)" }} />

      {/* ── HEADER ──────────────────────────────────────────────────────── */}
      <header
        className="flex items-center justify-between px-5 py-3 border-b border-purple-500/20 flex-shrink-0 z-10"
        style={{ background: "rgba(10,5,20,0.92)", backdropFilter: "blur(16px)" }}
      >
        <button onClick={() => navigate("/")}
          className="flex items-center gap-1.5 text-purple-300/60 hover:text-cyan-400 transition-colors text-sm">
          <ArrowRight size={16} /> العودة
        </button>
        <div className="flex items-center gap-2">
          <span className="text-xl font-black" style={{ color: X_COLOR }}>✕</span>
          <h1 className="text-xl font-black neon-text-cyan">لعبة XO</h1>
          <span className="text-xl font-black" style={{ color: O_COLOR }}>○</span>
        </div>
        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs ${
          twitchConnected ? "border-purple-500/40 bg-purple-500/10 text-purple-300" : "border-gray-700 text-gray-600"
        }`}>
          {twitchConnected ? <Wifi size={11} /> : <WifiOff size={11} />}
          {twitchConnected ? `#${user?.username}` : "جارٍ الاتصال..."}
        </div>
      </header>

      {/* ── CONTENT ─────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 overflow-y-auto z-10">
        <AnimatePresence mode="wait">

          {/* ── JOINING ── */}
          {phase === "joining" && (
            <motion.div key="joining"
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
              className="w-full max-w-md space-y-5">

              <div className="text-center space-y-2">
                <div className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full border text-xs ${
                  twitchConnected
                    ? "border-green-500/40 bg-green-500/10 text-green-300"
                    : "border-gray-700 text-gray-500"
                }`}>
                  {twitchConnected ? <><Wifi size={11} />#{user?.username} متصل</> : <><WifiOff size={11} />جارٍ الاتصال...</>}
                </div>
                <h2 className="text-3xl font-black text-white">
                  اكتب <span className="neon-text-cyan">join</span> في الشات
                </h2>
                <p className="text-purple-300/40 text-sm">أول لاعبين يكتبون join يدخلون</p>
              </div>

              {/* Join notification */}
              <AnimatePresence>
                {joinMsg && (
                  <motion.div key={joinMsg}
                    initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    className="text-center py-2.5 px-5 rounded-xl bg-cyan-500/12 border border-cyan-500/30 text-cyan-400 font-bold text-sm">
                    {joinMsg}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Player slots */}
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-2xl border p-4 text-center space-y-3"
                  style={{ borderColor: `${X_COLOR}30`, background: `${X_COLOR}08` }}>
                  <p className="text-sm font-bold" style={{ color: X_COLOR }}>اللاعب الأول</p>
                  {players.X ? (
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-16 h-16 rounded-xl overflow-hidden border-2" style={{ borderColor: X_COLOR }}>
                        <img src={players.X.avatar} alt={players.X.displayName} className="w-full h-full object-cover"
                          onError={e => { (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${players.X!.username}`; }} />
                      </div>
                      <p className="font-bold text-sm" style={{ color: X_COLOR }}>{players.X.displayName}</p>
                    </div>
                  ) : (
                    <div className="w-16 h-16 rounded-xl border-2 border-dashed mx-auto flex items-center justify-center"
                      style={{ borderColor: `${X_COLOR}30` }}>
                      <span className="text-purple-400/30 text-xs">انتظار</span>
                    </div>
                  )}
                  <div className="text-3xl font-black" style={{ color: X_COLOR }}>✕</div>
                </div>

                <div className="rounded-2xl border p-4 text-center space-y-3"
                  style={{ borderColor: `${O_COLOR}30`, background: `${O_COLOR}08` }}>
                  <p className="text-sm font-bold" style={{ color: O_COLOR }}>اللاعب الثاني</p>
                  {players.O ? (
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-16 h-16 rounded-xl overflow-hidden border-2" style={{ borderColor: O_COLOR }}>
                        <img src={players.O.avatar} alt={players.O.displayName} className="w-full h-full object-cover"
                          onError={e => { (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${players.O!.username}`; }} />
                      </div>
                      <p className="font-bold text-sm" style={{ color: O_COLOR }}>{players.O.displayName}</p>
                    </div>
                  ) : (
                    <div className="w-16 h-16 rounded-xl border-2 border-dashed mx-auto flex items-center justify-center"
                      style={{ borderColor: `${O_COLOR}30` }}>
                      <span className="text-purple-400/30 text-xs">انتظار</span>
                    </div>
                  )}
                  <div className="text-3xl font-black" style={{ color: O_COLOR }}>○</div>
                </div>
              </div>

              {bothJoined && (
                <motion.button
                  onClick={startGame}
                  initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                  whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
                  className="w-full py-4 rounded-2xl text-xl font-black flex items-center justify-center gap-3"
                  style={{
                    background: "linear-gradient(135deg, #00e5ff, #0288d1)",
                    boxShadow: "0 0 30px rgba(0,229,255,0.35)",
                    color: "#000",
                  }}
                >
                  <Play size={22} fill="black" /> ابدأ اللعبة
                </motion.button>
              )}
            </motion.div>
          )}

          {/* ── PLAYING ── */}
          {(phase === "playing" || phase === "result") && (
            <motion.div key="playing"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="w-full max-w-lg space-y-5">

              {/* Score + Players */}
              <div className="grid grid-cols-3 items-center gap-3">
                <PlayerAvatar player={players.X} isActive={phase === "playing" && currentMark === "X"} mark="X" />
                <div className="text-center space-y-1">
                  <p className="text-xl font-black text-purple-300/50">VS</p>
                  <div className="space-y-0.5 text-xs">
                    <div className="flex justify-center gap-2">
                      <span style={{ color: X_COLOR }} className="font-bold">{scores.X}</span>
                      <span className="text-purple-400/40">-</span>
                      <span style={{ color: O_COLOR }} className="font-bold">{scores.O}</span>
                    </div>
                    {scores.draw > 0 && (
                      <p className="text-purple-400/30 text-[10px]">تعادل: {scores.draw}</p>
                    )}
                  </div>
                </div>
                <PlayerAvatar player={players.O} isActive={phase === "playing" && currentMark === "O"} mark="O" />
              </div>

              {/* Turn indicator */}
              <AnimatePresence mode="wait">
                {phase === "playing" && (
                  <motion.div key={currentMark}
                    initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    className="text-center py-2.5 px-5 rounded-xl border"
                    style={{
                      borderColor: currentMark === "X" ? `${X_COLOR}40` : `${O_COLOR}40`,
                      background: currentMark === "X" ? `${X_COLOR}10` : `${O_COLOR}10`,
                    }}
                  >
                    <p className="text-sm font-black" style={{ color: currentMark === "X" ? X_COLOR : O_COLOR }}>
                      دور {currentPlayer?.displayName}
                      {" "}
                      <span style={{ textShadow: `0 0 10px ${currentMark === "X" ? X_COLOR : O_COLOR}` }}>
                        ({currentMark === "X" ? "✕" : "○"})
                      </span>
                      {" "}— اكتب رقم في الشات
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Board */}
              <div className="grid grid-cols-3 gap-3 max-w-[340px] mx-auto">
                {board.map((cell, i) => {
                  const isWin = winnerInfo?.combo?.includes(i);
                  const cellNum = i + 1;
                  const cellColor = cell === "X" ? X_COLOR : cell === "O" ? O_COLOR : null;
                  return (
                    <motion.div
                      key={i}
                      className="aspect-square rounded-2xl border flex items-center justify-center relative overflow-hidden"
                      style={{
                        borderColor: isWin ? cellColor! : cell ? `${cellColor}50` : "rgba(74,32,96,0.6)",
                        background: isWin
                          ? `${cellColor}20`
                          : cell
                          ? "rgba(18,6,32,0.9)"
                          : "rgba(12,4,22,0.7)",
                        boxShadow: isWin ? `0 0 24px ${cellColor}40` : "none",
                      }}
                      animate={isWin ? { scale: [1, 1.06, 1] } : { scale: 1 }}
                      transition={{ repeat: isWin ? Infinity : 0, duration: 1 }}
                    >
                      <AnimatePresence mode="wait">
                        {cell ? (
                          <motion.span
                            key={`mark-${i}`}
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ type: "spring", stiffness: 380, damping: 18 }}
                            className="text-4xl sm:text-5xl font-black"
                            style={{
                              color: cellColor!,
                              textShadow: isWin ? `0 0 20px ${cellColor}` : `0 0 8px ${cellColor}80`,
                            }}
                          >
                            {cell === "X" ? "✕" : "○"}
                          </motion.span>
                        ) : (
                          <motion.span
                            key={`num-${i}`}
                            className="text-2xl font-black"
                            style={{ color: "rgba(120,80,160,0.45)" }}
                          >
                            {cellNum}
                          </motion.span>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })}
              </div>

              {/* Result overlay */}
              <AnimatePresence>
                {phase === "result" && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.85, y: 16 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    className="rounded-2xl border p-6 text-center space-y-4"
                    style={{
                      borderColor: winnerInfo
                        ? winnerInfo.mark === "X" ? `${X_COLOR}45` : `${O_COLOR}45`
                        : "rgba(255,255,255,0.12)",
                      background: winnerInfo
                        ? winnerInfo.mark === "X" ? `${X_COLOR}12` : `${O_COLOR}12`
                        : "rgba(255,255,255,0.05)",
                      boxShadow: winnerInfo
                        ? `0 0 40px ${winnerInfo.mark === "X" ? X_COLOR : O_COLOR}20`
                        : "none",
                    }}
                  >
                    {winnerPlayer && winnerInfo ? (
                      <>
                        <motion.div
                          animate={{ y: [0, -8, 0] }}
                          transition={{ repeat: Infinity, duration: 2 }}
                          className="relative w-24 h-24 mx-auto rounded-2xl overflow-hidden border-4"
                          style={{
                            borderColor: winnerInfo.mark === "X" ? X_COLOR : O_COLOR,
                            boxShadow: `0 0 30px ${winnerInfo.mark === "X" ? X_COLOR : O_COLOR}50`,
                          }}
                        >
                          <img
                            src={winnerPlayer.avatar} alt={winnerPlayer.displayName}
                            className="w-full h-full object-cover"
                            onError={e => {
                              (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${winnerPlayer.username}`;
                            }}
                          />
                        </motion.div>
                        <div>
                          <p className="text-purple-300/50 text-sm">الفائز</p>
                          <h3
                            className="text-3xl font-black"
                            style={{
                              color: winnerInfo.mark === "X" ? X_COLOR : O_COLOR,
                              textShadow: `0 0 20px ${winnerInfo.mark === "X" ? X_COLOR : O_COLOR}`,
                            }}
                          >
                            {winnerPlayer.displayName}
                          </h3>
                          <p className="text-4xl font-black mt-1"
                            style={{ color: winnerInfo.mark === "X" ? X_COLOR : O_COLOR }}>
                            {winnerInfo.mark === "X" ? "✕" : "○"} فاز
                          </p>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="text-5xl font-black text-purple-300/60">½</div>
                        <h3 className="text-3xl font-black text-purple-300">تعادل</h3>
                      </>
                    )}

                    <div className="flex gap-3 justify-center pt-2">
                      <motion.button
                        onClick={rematch}
                        whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm"
                        style={{
                          background: "rgba(0,229,255,0.12)",
                          border: "1px solid rgba(0,229,255,0.4)",
                          color: O_COLOR,
                        }}
                      >
                        <RotateCcw size={15} /> إعادة المباراة
                      </motion.button>
                      <button
                        onClick={newGame}
                        className="px-5 py-2.5 rounded-xl font-bold text-sm border border-purple-500/25 text-purple-400/60 hover:text-purple-300 transition-all"
                      >
                        لعبة جديدة
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Reset during play */}
              {phase === "playing" && (
                <button
                  onClick={newGame}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-purple-400/35 hover:text-purple-300/60 border border-purple-500/15 transition-all text-xs"
                >
                  <RotateCcw size={13} /> إعادة تعيين الكل وتغيير اللاعبين
                </button>
              )}
            </motion.div>
          )}

        </AnimatePresence>
      </div>

      {/* Status bar */}
      <div
        className="flex-shrink-0 border-t border-purple-500/15 px-5 py-2 flex items-center justify-between text-xs z-10"
        style={{ background: "rgba(8,4,16,0.88)" }}
      >
        <span className="flex items-center gap-1.5 text-purple-400/40">
          <Users size={11} />
          {[players.X, players.O].filter(Boolean).length} / 2 لاعبين
        </span>
        <div className={`flex items-center gap-1.5 ${twitchConnected ? "text-purple-400/40" : "text-gray-700"}`}>
          <Tv2 size={11} /> {twitchConnected ? `#${user?.username}` : "غير متصل"}
        </div>
      </div>
    </div>
  );
}
