import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence, useAnimate } from "framer-motion";
import { ArrowRight, Tv2, Wifi, WifiOff, Users, Play, RefreshCw } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

// ─── Types ──────────────────────────────────────────────────────────────────
interface Player {
  username: string;
  displayName: string;
  avatar: string;
  number: number;
  alive: boolean;
  hits: number;
}
type Phase =
  | "idle"
  | "joining"
  | "roulette"
  | "waiting_target"
  | "shooting"
  | "result"
  | "game_over";

// ─── Sound Engine ────────────────────────────────────────────────────────────
class SoundEngine {
  private ctx: AudioContext | null = null;
  private get() {
    if (!this.ctx) this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    return this.ctx;
  }
  gunshot() {
    const ctx = this.get();
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.28), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++)
      d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.045));
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.setValueAtTime(1, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.28);
    src.connect(g); g.connect(ctx.destination); src.start();
  }
  hit() {
    const ctx = this.get();
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sawtooth"; osc.frequency.setValueAtTime(110, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(35, ctx.currentTime + 0.18);
    g.gain.setValueAtTime(0.55, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.18);
    osc.connect(g); g.connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + 0.18);
  }
  death() {
    const ctx = this.get();
    [80, 60, 40].forEach((f, i) => {
      const osc = ctx.createOscillator(); const g = ctx.createGain();
      osc.frequency.value = f;
      g.gain.setValueAtTime(0.4, ctx.currentTime + i * 0.14);
      g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.14 + 0.32);
      osc.connect(g); g.connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.14); osc.stop(ctx.currentTime + i * 0.14 + 0.35);
    });
  }
  survive() {
    const ctx = this.get();
    [400, 500, 650].forEach((f, i) => {
      const osc = ctx.createOscillator(); const g = ctx.createGain();
      osc.type = "sine"; osc.frequency.value = f;
      g.gain.setValueAtTime(0.28, ctx.currentTime + i * 0.1);
      g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.1 + 0.22);
      osc.connect(g); g.connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.1); osc.stop(ctx.currentTime + i * 0.1 + 0.25);
    });
  }
}
const sound = new SoundEngine();

// ─── Blood Splatter ──────────────────────────────────────────────────────────
const BloodEffect = () => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    className="absolute inset-0 pointer-events-none overflow-hidden rounded-2xl z-10"
  >
    {[...Array(7)].map((_, i) => (
      <motion.div key={i} className="absolute rounded-full"
        style={{
          background: "radial-gradient(circle, #cc0000, #7a0000)",
          width: `${Math.random() * 38 + 14}px`,
          height: `${Math.random() * 26 + 10}px`,
          left: `${Math.random() * 80 + 5}%`,
          top: `${Math.random() * 80 + 5}%`,
          transform: `rotate(${Math.random() * 360}deg)`,
        }}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 0.9 }}
        transition={{ delay: i * 0.04, duration: 0.18 }}
      />
    ))}
    <motion.div className="absolute inset-0 rounded-2xl"
      initial={{ opacity: 0 }} animate={{ opacity: 0.48 }}
      style={{ background: "rgba(170,0,0,0.48)" }} />
    <div className="absolute inset-0 flex items-center justify-center">
      <span className="text-5xl drop-shadow-lg">💀</span>
    </div>
  </motion.div>
);

// ─── Player Card ─────────────────────────────────────────────────────────────
const PlayerCard = ({ player, isShooter, isTarget }: {
  player: Player; isShooter?: boolean; isTarget?: boolean;
}) => (
  <motion.div layout
    initial={{ opacity: 0, scale: 0.8 }}
    animate={{ opacity: player.alive ? 1 : 0.3, scale: 1 }}
    exit={{ opacity: 0, scale: 0.4 }}
    className="relative rounded-2xl border overflow-hidden"
    style={{
      borderColor: isShooter ? "#ffd600" : isTarget ? "#ef4444" : player.alive ? "#3d1860" : "#1a0a2a",
      background: isShooter ? "#ffd60015" : isTarget ? "#ef444415" : "rgba(26,10,46,0.85)",
      boxShadow: isShooter ? "0 0 20px #ffd60035" : isTarget ? "0 0 20px #ef444435" : "none",
    }}
  >
    {!player.alive && <BloodEffect />}
    {player.alive && player.hits > 0 && (
      <div className="absolute top-1.5 right-1.5 flex gap-0.5 flex-wrap justify-end max-w-[75%] z-10">
        {[...Array(player.hits)].map((_, i) => <span key={i} className="text-[11px]">🩸</span>)}
      </div>
    )}
    {isShooter && <div className="absolute top-1.5 left-1.5 z-10 text-lg leading-none">👑</div>}
    {isTarget && <div className="absolute top-1.5 left-1.5 z-10 text-lg leading-none">🎯</div>}
    <div className="relative aspect-square overflow-hidden">
      <img src={player.avatar} alt={player.displayName}
        className="w-full h-full object-cover"
        onError={e => { (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${player.username}`; }} />
      <div className="absolute bottom-1.5 right-1.5 w-7 h-7 rounded-full flex items-center justify-center font-black text-xs border-2"
        style={{
          background: isShooter ? "#ffd600" : isTarget ? "#ef4444" : "#e040fb",
          borderColor: "#0a0a1a",
          color: isShooter ? "#0a0a1a" : "#fff",
        }}>
        {player.number}
      </div>
    </div>
    <div className="px-1.5 py-1.5 text-center">
      <p className="text-xs font-bold truncate"
        style={{ color: !player.alive ? "#4b5563" : isShooter ? "#ffd600" : isTarget ? "#ef4444" : "#e2d0f0", textDecoration: !player.alive ? "line-through" : "none" }}>
        {player.displayName}
      </p>
    </div>
  </motion.div>
);

// ─── Main Component ───────────────────────────────────────────────────────────
export default function WheelGame() {
  const [, navigate] = useLocation();
  const { user, logout } = useAuth();
  const [scope, animate] = useAnimate();

  const [phase, setPhase] = useState<Phase>("idle");
  const [channelInput, setChannelInput] = useState("");
  const [players, setPlayers] = useState<Player[]>([]);
  const [shooter, setShooter] = useState<Player | null>(null);
  const [target, setTarget] = useState<Player | null>(null);
  const [rouletteHL, setRouletteHL] = useState<string | null>(null);
  const [currentBullet, setCurrentBullet] = useState(0);
  const [totalBullets, setTotalBullets] = useState(0);
  const [survived, setSurvived] = useState<boolean | null>(null);
  const [funnyMsg, setFunnyMsg] = useState("");
  const [flashScreen, setFlashScreen] = useState(false);
  const [joinMsg, setJoinMsg] = useState("");
  const [twitchConnected, setTwitchConnected] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const phaseRef = useRef(phase);
  const shooterRef = useRef(shooter);
  const playersRef = useRef(players);
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { shooterRef.current = shooter; }, [shooter]);
  useEffect(() => { playersRef.current = players; }, [players]);

  // ── Twitch IRC (browser direct) ──────────────────────────────────────────
  const connectTwitch = (channel: string) => {
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
    const ch = channel.toLowerCase().replace(/^#/, "");
    const ws = new WebSocket("wss://irc-ws.chat.twitch.tv");
    wsRef.current = ws;
    ws.onopen = () => {
      ws.send("PASS SCHMOOPIIE");
      ws.send(`NICK justinfan${Math.floor(Math.random() * 89999) + 10000}`);
      ws.send(`JOIN #${ch}`);
    };
    ws.onmessage = (e) => {
      const lines = (e.data as string).split("\r\n").filter(Boolean);
      for (const line of lines) {
        if (line.startsWith("PING")) { ws.send("PONG :tmi.twitch.tv"); continue; }
        if (line.includes("366") || line.includes("ROOMSTATE")) { setTwitchConnected(true); continue; }
        const m = line.match(/^(?:@[^ ]+ )?:(\w+)!\w+@\w+\.tmi\.twitch\.tv PRIVMSG #\w+ :(.+)$/);
        if (m) handleChatMsg(m[1], m[2].trim());
      }
    };
    ws.onclose = () => setTwitchConnected(false);
  };

  const handleChatMsg = useCallback((username: string, text: string) => {
    const msg = text.trim().toLowerCase();
    const ph = phaseRef.current;
    const sh = shooterRef.current;
    const pl = playersRef.current;

    if (msg === "join" && ph === "joining") {
      setPlayers(prev => {
        if (prev.find(p => p.username === username)) return prev;
        const num = prev.length + 1;
        setJoinMsg(`✅ ${username} انضم!`);
        setTimeout(() => setJoinMsg(""), 2500);
        return [...prev, {
          username,
          displayName: username,
          avatar: `https://unavatar.io/twitch/${username}`,
          number: num,
          alive: true,
          hits: 0,
        }];
      });
    }

    if (ph === "waiting_target" && sh && username === sh.username) {
      const num = parseInt(msg, 10);
      if (!isNaN(num) && num >= 1) {
        const tgt = pl.find(p => p.number === num && p.alive && p.username !== sh.username);
        if (tgt) runShootingSequence(sh, tgt);
      }
    }
  }, []);

  useEffect(() => () => { wsRef.current?.close(); }, []);

  // ── Screen shake ──────────────────────────────────────────────────────────
  const shakeScreen = async () => {
    await animate(scope.current, { x: [0, -10, 10, -7, 7, -4, 4, 0] }, { duration: 0.4 });
  };

  // ── Roulette ──────────────────────────────────────────────────────────────
  const runRoulette = useCallback(async (alive: Player[]) => {
    setPhase("roulette");
    setShooter(null); setTarget(null); setFunnyMsg(""); setSurvived(null);
    const spins = 22 + Math.floor(Math.random() * 14);
    for (let i = 0; i < spins; i++) {
      const p = alive[i % alive.length];
      setRouletteHL(p.username);
      await new Promise(r => setTimeout(r, 55 + (i / spins) * 200));
    }
    const chosen = alive[Math.floor(Math.random() * alive.length)];
    setRouletteHL(chosen.username);
    await new Promise(r => setTimeout(r, 700));
    setShooter(chosen);
    setPhase("waiting_target");
  }, []);

  // ── Shooting sequence ────────────────────────────────────────────────────
  const runShootingSequence = useCallback(async (sh: Player, tgt: Player) => {
    setTarget(tgt);
    setPhase("shooting");
    setFunnyMsg("");
    setSurvived(null);

    const bullets = Math.floor(Math.random() * 5) + 1; // 1–5 bullets
    const dies = Math.random() < 0.42;
    setTotalBullets(bullets);
    setCurrentBullet(0);

    for (let b = 1; b <= bullets; b++) {
      await new Promise(r => setTimeout(r, 650));
      setCurrentBullet(b);
      // Flash
      setFlashScreen(true);
      setTimeout(() => setFlashScreen(false), 90);
      sound.gunshot();
      await new Promise(r => setTimeout(r, 90));
      shakeScreen();
      sound.hit();
      if (b === 3 && !dies) setFunnyMsg("😂 بس بسبع أرواح!");
      await new Promise(r => setTimeout(r, 250));
    }

    await new Promise(r => setTimeout(r, 500));

    if (dies) {
      sound.death();
      setFunnyMsg("💀 وداعاً!");
      setSurvived(false);
      setPlayers(prev => prev.map(p => p.username === tgt.username ? { ...p, alive: false } : p));
    } else {
      sound.survive();
      if (!dies) setFunnyMsg("😏 لا تجحدها!");
      setSurvived(true);
      setPlayers(prev => prev.map(p => p.username === tgt.username ? { ...p, hits: p.hits + 1 } : p));
    }

    setPhase("result");
  }, []);

  const handleStartGame = () => {
    const alive = players.filter(p => p.alive);
    if (alive.length < 2) return;
    runRoulette(alive);
  };

  const handleNextTurn = () => {
    const alive = players.filter(p => p.alive);
    if (alive.length <= 1) { setPhase("game_over"); return; }
    runRoulette(alive);
  };

  const resetGame = () => {
    setPhase("joining");
    setPlayers([]);
    setShooter(null);
    setTarget(null);
    setFunnyMsg("");
    setSurvived(null);
  };

  const alivePlayers = players.filter(p => p.alive);
  const winner = alivePlayers.length === 1 ? alivePlayers[0] : null;

  return (
    <motion.div ref={scope} className="min-h-screen gradient-bg relative overflow-hidden flex flex-col" dir="rtl">

      {/* Screen flash */}
      <AnimatePresence>
        {flashScreen && (
          <motion.div key="flash" initial={{ opacity: 0.9 }} animate={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            className="fixed inset-0 bg-white z-[100] pointer-events-none" />
        )}
      </AnimatePresence>

      {/* Ambient glows */}
      <div className="absolute top-0 right-0 w-[450px] h-[450px] rounded-full opacity-10 pointer-events-none"
        style={{ background: "radial-gradient(circle, #e040fb, transparent)", filter: "blur(80px)" }} />
      <div className="absolute bottom-0 left-0 w-[450px] h-[450px] rounded-full opacity-10 pointer-events-none"
        style={{ background: "radial-gradient(circle, #ff4444, transparent)", filter: "blur(80px)" }} />

      {/* ── HEADER ────────────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-5 py-3 border-b border-purple-500/20 flex-shrink-0 z-10"
        style={{ background: "rgba(10,5,20,0.9)", backdropFilter: "blur(16px)" }}>
        <button onClick={() => navigate("/")}
          className="flex items-center gap-1.5 text-purple-300/60 hover:text-pink-400 transition-colors text-sm">
          <ArrowRight size={16} /> العودة
        </button>
        <div className="flex items-center gap-2">
          <span className="text-2xl">🔫</span>
          <h1 className="text-xl font-black neon-text-pink">الشخصنة</h1>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${
            twitchConnected ? "border-purple-500/40 bg-purple-500/10 text-purple-300" : "border-gray-700 text-gray-600"}`}>
            {twitchConnected ? <Wifi size={11} /> : <WifiOff size={11} />}
            {twitchConnected ? channelInput : "غير متصل"}
          </div>
          {user && (
            <button onClick={logout} className="text-purple-400/30 hover:text-red-400 transition-colors">خروج</button>
          )}
        </div>
      </header>

      {/* ── MAIN CONTENT ──────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 relative z-10 overflow-y-auto">
        <AnimatePresence mode="wait">

          {/* ── IDLE ── */}
          {phase === "idle" && (
            <motion.div key="idle"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="flex flex-col items-center gap-8 w-full max-w-sm"
            >
              {/* Square image button */}
              <div className="w-full max-w-xs sm:max-w-sm aspect-square relative rounded-2xl overflow-hidden border-2 border-pink-500/50 shadow-2xl"
                style={{ boxShadow: "0 0 60px #e040fb25" }}>
                <img src="/play-now.png" alt="الشخصنة"
                  className="w-full h-full object-cover" />
                <div className="absolute inset-0"
                  style={{ background: "linear-gradient(to top, rgba(10,5,20,0.9) 30%, transparent 60%)" }} />
                <div className="absolute bottom-0 inset-x-0 flex flex-col items-center pb-6 gap-1">
                  <span className="text-4xl">🔫</span>
                  <p className="text-3xl font-black text-white drop-shadow-2xl tracking-wide">الشخصنة</p>
                </div>
              </div>

              <form onSubmit={e => { e.preventDefault(); connectTwitch(channelInput); setPhase("joining"); setPlayers([]); }}
                className="w-full space-y-3">
                <div className="flex items-center gap-2 px-4 py-3 rounded-xl border border-purple-500/30 bg-black/40">
                  <Tv2 size={16} className="text-purple-400 flex-shrink-0" />
                  <input value={channelInput} onChange={e => setChannelInput(e.target.value)}
                    placeholder="اسم قناة Twitch" required
                    className="flex-1 bg-transparent text-white placeholder-purple-400/30 focus:outline-none text-base" />
                </div>
                <motion.button type="submit"
                  whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                  className="w-full py-4 rounded-xl text-xl font-black btn-shimmer"
                  style={{ background: "linear-gradient(135deg, #e040fb, #9c27b0)", boxShadow: "0 0 30px #e040fb40" }}>
                  العب الآن 🎮
                </motion.button>
              </form>
            </motion.div>
          )}

          {/* ── JOINING ── */}
          {phase === "joining" && (
            <motion.div key="joining"
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
              className="w-full max-w-5xl space-y-6"
            >
              <div className="text-center space-y-3">
                <div className={`inline-flex items-center gap-2 px-5 py-2 rounded-full border ${twitchConnected ? "border-green-500/40 bg-green-500/10 text-green-300" : "border-gray-700 text-gray-500"}`}>
                  {twitchConnected ? <><Wifi size={14} />{channelInput}</> : <><WifiOff size={14} />جارٍ الاتصال...</>}
                </div>
                <h2 className="text-4xl sm:text-5xl font-black text-white">
                  اكتب <span className="neon-text-pink">join</span> في الشات
                </h2>
                <p className="text-purple-300/50 text-lg">{players.length} لاعب انضم حتى الآن</p>
              </div>

              <AnimatePresence>
                {joinMsg && (
                  <motion.div key={joinMsg}
                    initial={{ opacity: 0, y: -8, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }}
                    className="mx-auto max-w-xs text-center py-2.5 px-6 rounded-xl bg-green-500/15 border border-green-500/30 text-green-400 font-bold">
                    {joinMsg}
                  </motion.div>
                )}
              </AnimatePresence>

              {players.length > 0 && (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
                  <AnimatePresence>
                    {players.map(p => <PlayerCard key={p.username} player={p} />)}
                  </AnimatePresence>
                </div>
              )}

              <div className="flex gap-3 justify-center flex-wrap">
                <motion.button onClick={handleStartGame} disabled={players.length < 2}
                  whileHover={players.length >= 2 ? { scale: 1.04 } : {}} whileTap={players.length >= 2 ? { scale: 0.97 } : {}}
                  className="flex items-center gap-2 px-8 py-3.5 rounded-xl text-lg font-black disabled:opacity-30 transition-all"
                  style={{ background: "linear-gradient(135deg, #e040fb, #9c27b0)", boxShadow: "0 0 25px #e040fb30" }}>
                  <Play size={20} fill="white" /> ابدأ اللعبة ({players.length})
                </motion.button>
                <button onClick={() => { wsRef.current?.close(); setPhase("idle"); }}
                  className="px-5 py-3.5 rounded-xl text-sm font-bold border border-gray-700 text-gray-500 hover:border-red-500/40 hover:text-red-400 transition-all">
                  إلغاء
                </button>
              </div>
            </motion.div>
          )}

          {/* ── ROULETTE ── */}
          {phase === "roulette" && (
            <motion.div key="roulette"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="w-full max-w-5xl space-y-6"
            >
              <h2 className="text-3xl sm:text-4xl font-black text-center text-white">🎰 من يطلق الرصاصة؟</h2>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
                {players.filter(p => p.alive).map(p => (
                  <motion.div key={p.username}
                    animate={rouletteHL === p.username
                      ? { scale: 1.12, boxShadow: "0 0 28px #ffd600" }
                      : { scale: 1, boxShadow: "0 0 0px transparent" }}
                    transition={{ duration: 0.1 }}
                    className="rounded-2xl overflow-hidden border-2 transition-colors"
                    style={{ borderColor: rouletteHL === p.username ? "#ffd600" : "#2d1450" }}>
                    <img src={p.avatar} alt={p.displayName} className="w-full aspect-square object-cover"
                      onError={e => { (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${p.username}`; }} />
                    <p className="text-center text-xs font-bold py-1 px-1 truncate"
                      style={{ color: rouletteHL === p.username ? "#ffd600" : "#c4a8e0" }}>
                      {p.displayName}
                    </p>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {/* ── WAITING FOR TARGET ── */}
          {phase === "waiting_target" && shooter && (
            <motion.div key="waiting"
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
              className="w-full max-w-5xl space-y-5"
            >
              <div className="text-center space-y-4">
                <div className="flex items-center justify-center gap-5">
                  <div className="relative w-24 h-24 rounded-2xl overflow-hidden border-4 border-yellow-400"
                    style={{ boxShadow: "0 0 30px #ffd600" }}>
                    <img src={shooter.avatar} alt={shooter.displayName} className="w-full h-full object-cover"
                      onError={e => { (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${shooter.username}`; }} />
                  </div>
                  <div className="text-right">
                    <p className="text-purple-300/50 text-sm">دور اللاعب</p>
                    <p className="text-3xl font-black text-yellow-400">{shooter.displayName}</p>
                    <p className="text-2xl mt-1">🔫</p>
                  </div>
                </div>
                <div className="inline-block px-6 py-3 rounded-2xl border border-orange-500/40 bg-orange-500/10">
                  <p className="text-xl font-black text-orange-200">
                    يا <span className="text-yellow-400">{shooter.displayName}</span> — اكتب رقم هدفك في الشات
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
                {players.map(p => (
                  <PlayerCard key={p.username} player={p} isShooter={p.username === shooter.username} />
                ))}
              </div>
            </motion.div>
          )}

          {/* ── SHOOTING ── */}
          {phase === "shooting" && shooter && target && (
            <motion.div key="shooting"
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
              className="w-full max-w-2xl"
            >
              <div className="rounded-3xl border border-red-500/30 overflow-hidden"
                style={{ background: "linear-gradient(135deg, rgba(30,5,35,0.98), rgba(10,5,42,0.98))" }}>
                <div className="h-[3px]" style={{ background: "linear-gradient(90deg, #e040fb, #ef4444, #ff6d00)" }} />
                <div className="flex items-center justify-between px-6 sm:px-10 py-8 gap-4">
                  {/* Shooter */}
                  <div className="flex flex-col items-center gap-3">
                    <div className="relative w-28 h-28 sm:w-36 sm:h-36 rounded-2xl overflow-hidden border-2 border-yellow-400"
                      style={{ boxShadow: "0 0 25px #ffd60040" }}>
                      <img src={shooter.avatar} alt={shooter.displayName} className="w-full h-full object-cover"
                        onError={e => { (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${shooter.username}`; }} />
                    </div>
                    <p className="text-yellow-400 font-black text-base">{shooter.displayName}</p>
                    <span className="text-4xl">🔫</span>
                  </div>

                  {/* Center: bullets */}
                  <div className="flex flex-col items-center gap-4 flex-shrink-0">
                    <div className="flex gap-2 flex-wrap justify-center max-w-[120px]">
                      {[...Array(totalBullets)].map((_, i) => (
                        <motion.div key={i}
                          initial={{ scale: 0 }}
                          animate={{ scale: 1, background: i < currentBullet ? "#ef4444" : "#2d1450" }}
                          transition={{ delay: i * 0.05 }}
                          className="w-4 h-4 rounded-full border border-red-900/50" />
                      ))}
                    </div>
                    {currentBullet > 0 && (
                      <motion.div key={currentBullet}
                        initial={{ x: -60, opacity: 1, scale: 1.4 }}
                        animate={{ x: 60, opacity: 0, scale: 0.8 }}
                        transition={{ duration: 0.32 }}
                        className="text-2xl">🔴</motion.div>
                    )}
                    <p className="text-red-500/60 text-sm font-bold">{currentBullet}/{totalBullets}</p>
                  </div>

                  {/* Target */}
                  <div className="flex flex-col items-center gap-3">
                    <motion.div
                      animate={currentBullet > 0 ? { x: [-4, 4, -3, 3, 0] } : {}}
                      transition={{ duration: 0.3 }}
                      className="relative w-28 h-28 sm:w-36 sm:h-36 rounded-2xl overflow-hidden border-2 border-red-500"
                      style={{ boxShadow: "0 0 25px #ef444440" }}>
                      <img src={target.avatar} alt={target.displayName} className="w-full h-full object-cover"
                        onError={e => { (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${target.username}`; }} />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-4xl opacity-70">🎯</span>
                      </div>
                    </motion.div>
                    <p className="text-red-400 font-black text-base">{target.displayName}</p>
                    <span className="text-4xl">😰</span>
                  </div>
                </div>

                <AnimatePresence>
                  {funnyMsg && (
                    <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                      className="text-center text-2xl sm:text-3xl font-black pb-6 text-yellow-300 px-4">
                      {funnyMsg}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )}

          {/* ── RESULT ── */}
          {phase === "result" && target && survived !== null && (
            <motion.div key="result"
              initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
              className="w-full max-w-5xl space-y-6 text-center"
            >
              <motion.div initial={{ y: -15 }} animate={{ y: 0 }}
                className={`inline-block px-8 py-4 rounded-2xl border text-2xl sm:text-3xl font-black ${
                  survived ? "border-green-500/50 bg-green-500/15 text-green-400" : "border-red-500/50 bg-red-500/15 text-red-400"
                }`}>
                {survived ? `😏 ${target.displayName} نجا من الموت!` : `💀 ${target.displayName} لقي ربه!`}
              </motion.div>

              {funnyMsg && <p className="text-2xl font-black text-yellow-300">{funnyMsg}</p>}

              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
                {players.map(p => (
                  <PlayerCard key={p.username} player={p}
                    isShooter={p.username === shooter?.username}
                    isTarget={p.username === target.username} />
                ))}
              </div>

              <div className="flex gap-3 justify-center items-center flex-wrap">
                <span className="text-purple-300/50 text-sm">
                  <Users size={14} className="inline ml-1" />{alivePlayers.length} لاعب حي
                </span>
                <motion.button onClick={handleNextTurn}
                  whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
                  className="flex items-center gap-2 px-8 py-4 rounded-xl text-xl font-black btn-shimmer"
                  style={{ background: "linear-gradient(135deg, #e040fb, #9c27b0)", boxShadow: "0 0 30px #e040fb40" }}>
                  <Play size={22} fill="white" />
                  {alivePlayers.length > 1 ? "الجولة التالية 🔫" : "النهاية 🏆"}
                </motion.button>
              </div>
            </motion.div>
          )}

          {/* ── GAME OVER ── */}
          {phase === "game_over" && (
            <motion.div key="gameover"
              initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
              className="text-center space-y-6"
            >
              {winner && (
                <motion.div animate={{ y: [0, -12, 0] }} transition={{ repeat: Infinity, duration: 2.2 }}
                  className="relative w-44 h-44 rounded-3xl overflow-hidden border-4 border-yellow-400 mx-auto shadow-2xl"
                  style={{ boxShadow: "0 0 60px #ffd600" }}>
                  <img src={winner.avatar} alt={winner.displayName} className="w-full h-full object-cover"
                    onError={e => { (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${winner.username}`; }} />
                  <div className="absolute inset-0 flex items-end justify-center pb-3">
                    <span className="text-4xl">👑</span>
                  </div>
                </motion.div>
              )}
              <div>
                <p className="text-purple-300/50 text-lg font-bold">البطل</p>
                <h2 className="text-5xl sm:text-6xl font-black neon-text-pink mt-1">
                  {winner?.displayName ?? "لا أحد"}
                </h2>
                <p className="text-yellow-400 text-2xl mt-2">🏆 آخر من بقي!</p>
              </div>
              <div className="flex gap-3 justify-center flex-wrap">
                <motion.button onClick={resetGame}
                  whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
                  className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-lg"
                  style={{ background: "#e040fb20", border: "1px solid #e040fb40", color: "#e040fb" }}>
                  <RefreshCw size={18} /> جولة جديدة
                </motion.button>
                <button onClick={() => { wsRef.current?.close(); setTwitchConnected(false); setPhase("idle"); }}
                  className="px-6 py-3 rounded-xl font-bold text-lg border border-gray-700 text-gray-500 hover:text-red-400 hover:border-red-500/40 transition-all">
                  خروج
                </button>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>

      {/* Bottom status bar during game */}
      {["waiting_target", "roulette", "result"].includes(phase) && (
        <div className="flex-shrink-0 border-t border-purple-500/20 px-5 py-2 flex items-center justify-between text-xs z-10"
          style={{ background: "rgba(10,5,20,0.85)" }}>
          <span className="flex items-center gap-1.5 text-purple-400/50">
            <Users size={11} /> {alivePlayers.length} حي / {players.filter(p => !p.alive).length} 💀
          </span>
          <div className={`flex items-center gap-1.5 ${twitchConnected ? "text-purple-300/50" : "text-gray-600"}`}>
            <Tv2 size={11} /> {twitchConnected ? `#${channelInput}` : "غير متصل"}
          </div>
        </div>
      )}
    </motion.div>
  );
}
