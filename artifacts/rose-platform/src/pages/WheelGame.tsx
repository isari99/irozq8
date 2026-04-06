import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence, useAnimate } from "framer-motion";
import { ArrowRight, Wifi, WifiOff, Users, Play, RefreshCw, Tv2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Player {
  username: string;
  displayName: string;
  avatar: string;
  number: number;
  alive: boolean;
  hits: number;
  revivedCount: number;
  usedRevive: boolean;
}
type Phase = "joining" | "spinning" | "waiting_target" | "shooting" | "game_over";

const MAX_HITS = 7;

// ─── Sound Engine ─────────────────────────────────────────────────────────────
class SoundEngine {
  private ctx: AudioContext | null = null;
  private get() {
    if (!this.ctx) this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    return this.ctx;
  }
  gunshot() {
    const ctx = this.get();
    const osc = ctx.createOscillator(); const g = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(220, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(55, ctx.currentTime + 0.12);
    g.gain.setValueAtTime(0.45, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
    osc.connect(g); g.connect(ctx.destination);
    osc.start(); osc.stop(ctx.currentTime + 0.18);
  }
  death() {
    const ctx = this.get();
    [90, 68, 50].forEach((f, i) => {
      const osc = ctx.createOscillator(); const g = ctx.createGain();
      osc.frequency.value = f;
      g.gain.setValueAtTime(0.28, ctx.currentTime + i * 0.14);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.14 + 0.3);
      osc.connect(g); g.connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.14); osc.stop(ctx.currentTime + i * 0.14 + 0.32);
    });
  }
  survive() {
    const ctx = this.get();
    [440, 550, 660].forEach((f, i) => {
      const osc = ctx.createOscillator(); const g = ctx.createGain();
      osc.type = "sine"; osc.frequency.value = f;
      g.gain.setValueAtTime(0.2, ctx.currentTime + i * 0.09);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.09 + 0.18);
      osc.connect(g); g.connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.09); osc.stop(ctx.currentTime + i * 0.09 + 0.2);
    });
  }
  revive() {
    const ctx = this.get();
    [330, 440, 550, 660].forEach((f, i) => {
      const osc = ctx.createOscillator(); const g = ctx.createGain();
      osc.type = "sine"; osc.frequency.value = f;
      g.gain.setValueAtTime(0.22, ctx.currentTime + i * 0.08);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.08 + 0.14);
      osc.connect(g); g.connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.08); osc.stop(ctx.currentTime + i * 0.08 + 0.16);
    });
  }
  spinTick(pitch = 900) {
    const ctx = this.get();
    const osc = ctx.createOscillator(); const g = ctx.createGain();
    osc.frequency.value = pitch;
    g.gain.setValueAtTime(0.07, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);
    osc.connect(g); g.connect(ctx.destination);
    osc.start(); osc.stop(ctx.currentTime + 0.04);
  }
  tension() {
    const ctx = this.get();
    const osc = ctx.createOscillator(); const g = ctx.createGain();
    osc.type = "sawtooth"; osc.frequency.value = 110;
    g.gain.setValueAtTime(0.0, ctx.currentTime);
    g.gain.linearRampToValueAtTime(0.08, ctx.currentTime + 0.5);
    g.gain.linearRampToValueAtTime(0.12, ctx.currentTime + 1.5);
    g.gain.linearRampToValueAtTime(0.0, ctx.currentTime + 2.2);
    osc.connect(g); g.connect(ctx.destination);
    osc.start(); osc.stop(ctx.currentTime + 2.3);
  }
}
const sound = new SoundEngine();

// ─── Blood Effect ─────────────────────────────────────────────────────────────
const BloodEffect = () => (
  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
    className="absolute inset-0 pointer-events-none overflow-hidden rounded-2xl z-10">
    {[...Array(7)].map((_, i) => (
      <motion.div key={i} className="absolute rounded-full"
        style={{
          background: "radial-gradient(circle, #cc0000, #7a0000)",
          width: `${Math.random() * 35 + 12}px`, height: `${Math.random() * 24 + 9}px`,
          left: `${Math.random() * 80 + 5}%`, top: `${Math.random() * 80 + 5}%`,
          transform: `rotate(${Math.random() * 360}deg)`,
        }}
        initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 0.9 }}
        transition={{ delay: i * 0.04, duration: 0.15 }} />
    ))}
    <motion.div className="absolute inset-0 rounded-2xl"
      initial={{ opacity: 0 }} animate={{ opacity: 0.5 }}
      style={{ background: "rgba(150,0,0,0.5)" }} />
    <div className="absolute inset-0 flex items-center justify-center">
      <span className="text-5xl">💀</span>
    </div>
  </motion.div>
);

// ─── Player Card ──────────────────────────────────────────────────────────────
const PlayerCard = ({ player, isShooter, isTarget }: {
  player: Player; isShooter?: boolean; isTarget?: boolean;
}) => (
  <motion.div layout
    initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: player.alive ? 1 : 0.3, scale: 1 }}
    className="relative rounded-2xl border overflow-hidden"
    style={{
      borderColor: isShooter ? "#ffd600" : isTarget ? "#ef4444" : player.alive ? "#3d1860" : "#1a0a2a",
      background: isShooter ? "#ffd60015" : isTarget ? "#ef444415" : "rgba(26,10,46,0.85)",
      boxShadow: isShooter ? "0 0 18px #ffd60035" : isTarget ? "0 0 18px #ef444435" : "none",
    }}>
    {!player.alive && <BloodEffect />}
    {player.alive && player.hits > 0 && (
      <div className="absolute top-1 right-1 z-10 flex gap-0.5 flex-wrap justify-end max-w-[80%]">
        {[...Array(Math.min(player.hits, 7))].map((_, i) => <span key={i} className="text-[10px]">🩸</span>)}
      </div>
    )}
    {isShooter && <div className="absolute top-1 left-1 z-10 text-base leading-none">👑</div>}
    {isTarget && <div className="absolute top-1 left-1 z-10 text-base leading-none">🎯</div>}
    <div className="relative aspect-square overflow-hidden">
      <img src={player.avatar} alt={player.displayName} className="w-full h-full object-cover"
        onError={e => { (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${player.username}`; }} />
      <div className="absolute bottom-1 right-1 w-6 h-6 rounded-full flex items-center justify-center font-black text-[11px] border-2"
        style={{ background: isShooter ? "#ffd600" : isTarget ? "#ef4444" : "#e040fb", borderColor: "#0a0a1a", color: isShooter ? "#0a0a1a" : "#fff" }}>
        {player.number}
      </div>
    </div>
    <div className="px-1 py-1 text-center">
      <p className="text-[11px] font-bold truncate"
        style={{ color: !player.alive ? "#374151" : isShooter ? "#ffd600" : isTarget ? "#ef4444" : "#e2d0f0", textDecoration: !player.alive ? "line-through" : "none" }}>
        {player.displayName}
      </p>
    </div>
  </motion.div>
);

// ─── Spinning Wheel ───────────────────────────────────────────────────────────
const SpinningWheel = ({ players, wheelDeg, isSpinning }: {
  players: Player[]; wheelDeg: number; isSpinning: boolean;
}) => {
  const N = players.length;
  if (N === 0) return null;
  const size = 400;
  const radius = N <= 3 ? 135 : N <= 5 ? 152 : N <= 7 ? 165 : 178;
  const avatarSize = N <= 3 ? 80 : N <= 5 ? 68 : N <= 7 ? 58 : 48;
  const cx = size / 2; const cy = size / 2;

  return (
    <div className="relative mx-auto flex-shrink-0" style={{ width: size, height: size }}>
      <div className="absolute inset-0 rounded-full border border-pink-500/20 pointer-events-none" />
      <div className="absolute rounded-full border border-purple-500/10 pointer-events-none"
        style={{ inset: avatarSize / 2 + 6 }} />
      <svg className="absolute inset-0 pointer-events-none" width={size} height={size}>
        {players.map((_, i) => {
          const a = ((2 * Math.PI) / N) * i - Math.PI / 2;
          return <line key={i} x1={cx} y1={cy} x2={cx + radius * Math.cos(a)} y2={cy + radius * Math.sin(a)} stroke="#e040fb08" strokeWidth="1" />;
        })}
        <circle cx={cx} cy={cy} r={radius} fill="none" stroke="#e040fb10" strokeWidth="1" />
      </svg>
      {/* Fixed pointer */}
      <div className="absolute z-30 pointer-events-none" style={{ top: 2, left: cx - 14, width: 28 }}>
        <motion.div animate={isSpinning ? { scale: [1, 1.3, 1] } : { scale: 1 }}
          transition={{ repeat: Infinity, duration: 0.25 }}
          className="text-2xl text-center leading-none" style={{ color: "#e040fb", filter: "drop-shadow(0 0 8px #e040fb)" }}>
          ▼
        </motion.div>
      </div>
      {/* Rotating player ring */}
      <motion.div className="absolute inset-0"
        animate={{ rotate: wheelDeg }}
        transition={isSpinning
          ? { duration: 3.6, ease: [0.15, 0.6, 0.3, 1.0] }
          : { duration: 0 }}>
        {players.map((p, i) => {
          const a = ((2 * Math.PI) / N) * i;
          const px = cx + radius * Math.sin(a) - avatarSize / 2;
          const py = cy - radius * Math.cos(a) - avatarSize / 2;
          return (
            <div key={p.username} className="absolute" style={{ left: px, top: py, width: avatarSize, height: avatarSize }}>
              <div className="relative w-full h-full">
                <div className={`w-full h-full rounded-full overflow-hidden border-2 ${p.alive ? "" : "opacity-30"}`}
                  style={{ borderColor: p.alive ? "#e040fb80" : "#1a0000", boxShadow: p.alive ? "0 0 8px #e040fb30" : "none" }}>
                  <img src={p.avatar} alt={p.displayName} className="w-full h-full object-cover"
                    onError={e => { (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${p.username}`; }} />
                </div>
                {!p.alive && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/70">
                    <span style={{ fontSize: avatarSize * 0.38 }}>💀</span>
                  </div>
                )}
                <div className="absolute -bottom-1 -right-1 rounded-full bg-pink-600 text-white font-black flex items-center justify-center border-2 border-black"
                  style={{ width: Math.max(17, avatarSize * 0.28), height: Math.max(17, avatarSize * 0.28), fontSize: Math.max(8, avatarSize * 0.14) }}>
                  {p.number}
                </div>
                {p.alive && p.hits > 0 && (
                  <div className="absolute -top-1 -left-1 w-4 h-4 rounded-full bg-red-600/80 text-white flex items-center justify-center border border-black" style={{ fontSize: 8 }}>
                    {p.hits}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </motion.div>
      {/* Center hub */}
      <div className="absolute z-20 rounded-full bg-black/90 border-2 border-pink-500/60 flex items-center justify-center"
        style={{ width: 76, height: 76, left: cx - 38, top: cy - 38, boxShadow: "0 0 24px #e040fb50" }}>
        <motion.span
          animate={isSpinning ? { rotate: -720 } : { rotate: 0 }}
          transition={isSpinning ? { duration: 3.6, ease: "easeOut" } : { duration: 0 }}
          className="text-4xl">🔫</motion.span>
      </div>
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────
export default function WheelGame() {
  const [, navigate] = useLocation();
  const { user, logout } = useAuth();
  const [scope, animate] = useAnimate();

  const [phase, setPhase] = useState<Phase>("joining");
  const [players, setPlayers] = useState<Player[]>([]);
  const [shooter, setShooter] = useState<Player | null>(null);
  const [target, setTarget] = useState<Player | null>(null);
  const [wheelDeg, setWheelDeg] = useState(0);
  const [isSpinning, setIsSpinning] = useState(false);

  // Shooting animation states
  const [shootCountdown, setShootCountdown] = useState<number | null>(null);
  const [hasFired, setHasFired] = useState(false);
  const [shootResult, setShootResult] = useState<{ survived: boolean; msg: string; funny: string } | null>(null);
  const [isReviveAction, setIsReviveAction] = useState(false);
  const [flashScreen, setFlashScreen] = useState(false);

  const [joinMsg, setJoinMsg] = useState("");
  const [twitchConnected, setTwitchConnected] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const phaseRef = useRef<Phase>("joining");
  const shooterRef = useRef<Player | null>(null);
  const playersRef = useRef<Player[]>([]);
  const wheelDegRef = useRef(0);
  const lastShooterRef = useRef<string | null>(null);
  const spinningRef = useRef(false);

  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { shooterRef.current = shooter; }, [shooter]);
  useEffect(() => { playersRef.current = players; }, [players]);

  // ── Twitch IRC ────────────────────────────────────────────────────────────
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
  }, []);

  useEffect(() => {
    if (user?.username) connectTwitch(user.username);
    return () => { wsRef.current?.close(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.username]);

  // ── Chat handler ──────────────────────────────────────────────────────────
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
        return [...prev, { username, displayName: username, avatar: `https://unavatar.io/twitch/${username}`, number: num, alive: true, hits: 0, revivedCount: 0, usedRevive: false }];
      });
      return;
    }

    if (ph === "waiting_target" && sh && username === sh.username) {
      const num = parseInt(msg, 10);
      if (isNaN(num) || num < 1) return;
      const found = pl.find(p => p.number === num);
      if (!found) return;
      if (found.alive && found.username !== sh.username) {
        runShootingSequence(sh, found);
      } else if (!found.alive && found.revivedCount === 0 && !sh.usedRevive) {
        runRevive(sh, found);
      }
    }
  }, []);

  // ── Screen shake ──────────────────────────────────────────────────────────
  const shakeScreen = () => {
    if (scope.current) animate(scope.current, { x: [0, -12, 12, -8, 8, -4, 4, 0] }, { duration: 0.4 });
  };

  // ── Spin wheel (manual trigger) ───────────────────────────────────────────
  const handleSpinWheel = useCallback(() => {
    if (spinningRef.current) return;
    spinningRef.current = true;
    setIsSpinning(true);

    const alive = playersRef.current.filter(p => p.alive);
    if (alive.length < 2) return;

    let candidates = alive;
    if (alive.length > 1 && lastShooterRef.current) {
      const nonRepeat = alive.filter(p => p.username !== lastShooterRef.current);
      if (nonRepeat.length > 0) candidates = nonRepeat;
    }
    const chosen = candidates[Math.floor(Math.random() * candidates.length)];
    const all = playersRef.current;
    const chosenIdx = all.findIndex(p => p.username === chosen.username);
    const N = all.length;
    const anglePerPlayer = 360 / N;
    const currentMod = ((wheelDegRef.current % 360) + 360) % 360;
    const targetMod = ((-chosenIdx * anglePerPlayer) % 360 + 360) % 360;
    let delta = (targetMod - currentMod + 360) % 360;
    if (delta < 15) delta += 360;
    const extraSpins = (Math.floor(Math.random() * 3) + 5) * 360;
    const newDeg = wheelDegRef.current + extraSpins + delta;
    wheelDegRef.current = newDeg;
    setWheelDeg(newDeg);

    // Tick sounds (accelerating then slowing)
    let elapsed = 0; let tickInterval = 75;
    const doTick = () => {
      sound.spinTick(600 + Math.random() * 400);
      elapsed += tickInterval;
      tickInterval = Math.min(tickInterval * 1.13, 400);
      if (elapsed < 3600) setTimeout(doTick, tickInterval);
    };
    doTick();

    setTimeout(() => {
      setIsSpinning(false);
      spinningRef.current = false;
      lastShooterRef.current = chosen.username;
      setShooter(chosen);
      setPhase("waiting_target");
    }, 3800);
  }, []);

  // ── Revive ────────────────────────────────────────────────────────────────
  const runRevive = useCallback((sh: Player, revived: Player) => {
    setTarget(revived);
    setIsReviveAction(true);
    setHasFired(false);
    setShootCountdown(null);
    setShootResult(null);
    setPhase("shooting");
    sound.revive();

    // Brief aiming then instantly show revival
    setTimeout(() => {
      setHasFired(true);
      setPlayers(prev => prev.map(p => {
        if (p.username === revived.username) return { ...p, alive: true, revivedCount: 1 };
        if (p.username === sh.username) return { ...p, usedRevive: true };
        return p;
      }));
      setShootResult({ survived: true, msg: `💚 ${revived.displayName} رجع للحياة!`, funny: "😏 لا تجحدها!" });

      // Auto-return to spinning after 3s
      setTimeout(autoReturnToSpin, 3000);
    }, 1200);
  }, []);

  // ── Auto-return to spinning ────────────────────────────────────────────────
  const autoReturnToSpin = () => {
    const alive = playersRef.current.filter(p => p.alive);
    if (alive.length <= 1) {
      setPhase("game_over");
    } else {
      setPhase("spinning");
      setIsSpinning(false);
      setShooter(null); setTarget(null);
      setShootResult(null); setHasFired(false);
      setShootCountdown(null); setIsReviveAction(false);
    }
  };

  // ── Shooting Sequence (with aiming countdown) ─────────────────────────────
  const runShootingSequence = useCallback((sh: Player, tgt: Player) => {
    setTarget(tgt);
    setIsReviveAction(false);
    setHasFired(false);
    setShootResult(null);
    setShootCountdown(3);
    setPhase("shooting");
    sound.tension();

    // Countdown: 3 → 2 → 1 → FIRE
    setTimeout(() => setShootCountdown(2), 900);
    setTimeout(() => setShootCountdown(1), 1800);
    setTimeout(() => {
      setShootCountdown(0);

      // FIRE
      setFlashScreen(true);
      setTimeout(() => setFlashScreen(false), 90);
      sound.gunshot();
      shakeScreen();

      const newHits = tgt.hits + 1;
      const dies = newHits >= MAX_HITS || Math.random() < 0.38;

      setTimeout(() => {
        setHasFired(true);

        if (dies) {
          sound.death();
          setPlayers(prev => prev.map(p => p.username === tgt.username ? { ...p, alive: false, hits: newHits } : p));
          setShootResult({ survived: false, msg: "GG تعيش وتأكل غيرها", funny: "💀" });
        } else {
          sound.survive();
          setPlayers(prev => prev.map(p => p.username === tgt.username ? { ...p, hits: newHits } : p));
          const funnyMsg = newHits >= 3 ? "😂 بس بسبع أرواح!" : "نجا! 🥵";
          setShootResult({ survived: true, msg: funnyMsg, funny: newHits >= 3 ? "بس بسبع أرواح 😂" : "" });
        }

        // Auto-return to spinning after 3s
        setTimeout(autoReturnToSpin, 3000);
      }, 300);
    }, 2700);
  }, []);

  const handleStartGame = () => {
    if (players.filter(p => p.alive).length < 2) return;
    setShooter(null); setTarget(null);
    setShootResult(null); setHasFired(false);
    setShootCountdown(null);
    setPhase("spinning");
  };

  const resetGame = () => {
    setPhase("joining"); setPlayers([]);
    setShooter(null); setTarget(null);
    setShootResult(null); setHasFired(false);
    setShootCountdown(null); setIsReviveAction(false);
    setIsSpinning(false); spinningRef.current = false;
    wheelDegRef.current = 0; setWheelDeg(0);
    lastShooterRef.current = null;
  };

  const alivePlayers = players.filter(p => p.alive);
  const winner = alivePlayers.length === 1 ? alivePlayers[0] : null;

  return (
    <motion.div ref={scope} className="min-h-screen gradient-bg relative overflow-hidden flex flex-col" dir="rtl">

      {/* Flash */}
      <AnimatePresence>
        {flashScreen && (
          <motion.div key="flash" initial={{ opacity: 0.9 }} animate={{ opacity: 0 }}
            transition={{ duration: 0.1 }}
            className="fixed inset-0 bg-white z-[100] pointer-events-none" />
        )}
      </AnimatePresence>

      {/* Background glows */}
      <div className="absolute top-0 right-0 w-[450px] h-[450px] rounded-full opacity-10 pointer-events-none"
        style={{ background: "radial-gradient(circle, #e040fb, transparent)", filter: "blur(80px)" }} />
      <div className="absolute bottom-0 left-0 w-[450px] h-[450px] rounded-full opacity-10 pointer-events-none"
        style={{ background: "radial-gradient(circle, #ff4444, transparent)", filter: "blur(80px)" }} />

      {/* ── HEADER ─────────────────────────────────────────────────────── */}
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
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${twitchConnected ? "border-purple-500/40 bg-purple-500/10 text-purple-300" : "border-gray-700 text-gray-600"}`}>
            {twitchConnected ? <Wifi size={11} /> : <WifiOff size={11} />}
            {twitchConnected ? `#${user?.username}` : "جارٍ الاتصال..."}
          </div>
          {user && <button onClick={logout} className="text-purple-400/30 hover:text-red-400 transition-colors">خروج</button>}
        </div>
      </header>

      {/* ── CONTENT ────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 relative z-10 overflow-y-auto">
        <AnimatePresence mode="wait">

          {/* ─ JOINING ─ */}
          {phase === "joining" && (
            <motion.div key="joining"
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
              className="w-full max-w-5xl space-y-5">
              <div className="text-center space-y-3">
                <div className={`inline-flex items-center gap-2 px-5 py-2 rounded-full border ${twitchConnected ? "border-green-500/40 bg-green-500/10 text-green-300" : "border-gray-700 text-gray-500"}`}>
                  {twitchConnected ? <><Wifi size={14} />#{user?.username} متصل</> : <><WifiOff size={14} />جارٍ الاتصال...</>}
                </div>
                <h2 className="text-4xl sm:text-5xl font-black text-white">
                  اكتب <span className="neon-text-pink">join</span> في الشات
                </h2>
                <p className="text-purple-300/50 text-lg">{players.length} لاعب انضم</p>
              </div>

              <AnimatePresence>
                {joinMsg && (
                  <motion.div key={joinMsg}
                    initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    className="mx-auto max-w-xs text-center py-2.5 px-6 rounded-xl bg-green-500/15 border border-green-500/30 text-green-400 font-bold">
                    {joinMsg}
                  </motion.div>
                )}
              </AnimatePresence>

              {players.length > 0 && (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
                  <AnimatePresence>{players.map(p => <PlayerCard key={p.username} player={p} />)}</AnimatePresence>
                </div>
              )}

              <div className="flex justify-center">
                <motion.button onClick={handleStartGame} disabled={players.length < 2}
                  whileHover={players.length >= 2 ? { scale: 1.04 } : {}} whileTap={players.length >= 2 ? { scale: 0.97 } : {}}
                  className="flex items-center gap-2 px-8 py-3.5 rounded-xl text-lg font-black disabled:opacity-30"
                  style={{ background: "linear-gradient(135deg, #e040fb, #9c27b0)", boxShadow: "0 0 25px #e040fb30" }}>
                  <Play size={20} fill="white" /> ابدأ اللعبة ({players.length})
                </motion.button>
              </div>
            </motion.div>
          )}

          {/* ─ SPINNING (manual control) ─ */}
          {phase === "spinning" && (
            <motion.div key="spinning"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="w-full max-w-5xl flex flex-col items-center gap-6">
              <div className="text-center space-y-1">
                <h2 className="text-3xl font-black text-white">
                  {isSpinning ? "🎰 العجلة تدور..." : "🎰 جاهز للف"}
                </h2>
                <p className="text-purple-300/40 text-sm">
                  <Users size={12} className="inline ml-1" />{alivePlayers.length} لاعب حي
                </p>
              </div>

              <SpinningWheel players={players} wheelDeg={wheelDeg} isSpinning={isSpinning} />

              {/* Manual spin button */}
              {!isSpinning && (
                <motion.button onClick={handleSpinWheel}
                  initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                  whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.95 }}
                  className="flex items-center gap-3 px-10 py-4 rounded-2xl text-2xl font-black"
                  style={{ background: "linear-gradient(135deg, #e040fb, #9c27b0)", boxShadow: "0 0 35px #e040fb50" }}>
                  🎰 لف العجلة
                </motion.button>
              )}
            </motion.div>
          )}

          {/* ─ WAITING TARGET (grid only, no wheel) ─ */}
          {phase === "waiting_target" && shooter && (
            <motion.div key="waiting"
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
              className="w-full max-w-5xl space-y-5">
              <div className="text-center space-y-4">
                <div className="flex items-center justify-center gap-4 flex-wrap">
                  <div className="relative w-20 h-20 rounded-2xl overflow-hidden border-2 border-yellow-400 flex-shrink-0"
                    style={{ boxShadow: "0 0 28px #ffd60050" }}>
                    <img src={shooter.avatar} alt={shooter.displayName} className="w-full h-full object-cover"
                      onError={e => { (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${shooter.username}`; }} />
                  </div>
                  <div className="text-right">
                    <p className="text-purple-300/50 text-sm">دور اللاعب</p>
                    <p className="text-3xl font-black text-yellow-400">{shooter.displayName}</p>
                    <p className="text-xl">🔫 يطلق النار</p>
                  </div>
                </div>
                <div className="inline-block px-6 py-3 rounded-2xl border border-orange-500/40 bg-orange-500/10">
                  <p className="text-xl font-black text-orange-200">
                    اكتب <span className="text-yellow-300">رقم اللاعب</span> في الشات
                  </p>
                  {!shooter.usedRevive && players.some(p => !p.alive && p.revivedCount === 0) && (
                    <p className="text-sm text-green-400/70 mt-1">
                      💚 أو اكتب رقم لاعب ميت لإنعاشه (مرة واحدة)
                    </p>
                  )}
                </div>
              </div>

              {/* Players grid only */}
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
                {players.map(p => <PlayerCard key={p.username} player={p} isShooter={p.username === shooter.username} />)}
              </div>
            </motion.div>
          )}

          {/* ─ SHOOTING (aiming animation + result) ─ */}
          {phase === "shooting" && shooter && target && (
            <motion.div key="shooting"
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
              className="w-full max-w-2xl">
              <div className="rounded-3xl border overflow-hidden"
                style={{
                  borderColor: hasFired ? (shootResult?.survived ? "#22c55e" : "#ef4444") : "#ffd600",
                  background: "linear-gradient(135deg, rgba(22,5,35,0.99), rgba(8,5,42,0.99))",
                  boxShadow: hasFired
                    ? (shootResult?.survived ? "0 0 40px #22c55e30" : "0 0 40px #ef444430")
                    : "0 0 40px #ffd60025",
                }}>
                {/* Top accent */}
                <div className="h-[3px]"
                  style={{
                    background: hasFired
                      ? (isReviveAction ? "linear-gradient(90deg,#22c55e,#16a34a)" : shootResult?.survived ? "linear-gradient(90deg,#00e5ff,#22c55e)" : "linear-gradient(90deg,#e040fb,#ef4444)")
                      : "linear-gradient(90deg,#ffd600,#e040fb,#ffd600)"
                  }} />

                {!hasFired ? (
                  /* ── AIMING PHASE ── */
                  <div className="p-8 space-y-6">
                    <div className="flex items-center justify-between gap-4">
                      {/* Shooter */}
                      <div className="flex flex-col items-center gap-3 flex-1">
                        <motion.div
                          animate={{ x: [0, 4, 0] }}
                          transition={{ repeat: Infinity, duration: 0.6 }}
                          className="w-28 h-28 rounded-2xl overflow-hidden border-2 border-yellow-400"
                          style={{ boxShadow: "0 0 20px #ffd60040" }}>
                          <img src={shooter.avatar} alt={shooter.displayName} className="w-full h-full object-cover"
                            onError={e => { (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${shooter.username}`; }} />
                        </motion.div>
                        <p className="text-yellow-400 font-black">{shooter.displayName}</p>
                        <motion.div
                          animate={{ x: [0, 8, 0], scale: [1, 1.1, 1] }}
                          transition={{ repeat: Infinity, duration: 0.5 }}
                          className="text-4xl">🔫</motion.div>
                      </div>

                      {/* Countdown center */}
                      <div className="flex flex-col items-center gap-3 flex-shrink-0">
                        <AnimatePresence mode="wait">
                          <motion.div key={shootCountdown}
                            initial={{ scale: 2, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0, opacity: 0 }}
                            transition={{ duration: 0.3 }}
                            className="text-6xl font-black"
                            style={{
                              color: shootCountdown === 1 ? "#ef4444" : shootCountdown === 2 ? "#ffd600" : "#ffffff",
                              textShadow: shootCountdown === 1 ? "0 0 20px #ef4444" : shootCountdown === 2 ? "0 0 20px #ffd600" : "0 0 20px #fff",
                            }}>
                            {shootCountdown === 0 ? "💥" : shootCountdown}
                          </motion.div>
                        </AnimatePresence>
                        <motion.div
                          animate={{ scaleX: [1, 0] }}
                          transition={{ duration: 2.7, ease: "linear" }}
                          className="w-16 h-1 rounded-full bg-pink-500/50 origin-right" />
                      </div>

                      {/* Target */}
                      <div className="flex flex-col items-center gap-3 flex-1">
                        <motion.div
                          animate={shootCountdown === 1 ? { x: [-4, 4, -3, 3, -2, 2, 0] } : { x: [0, -2, 2, 0] }}
                          transition={{ repeat: Infinity, duration: shootCountdown === 1 ? 0.2 : 1 }}
                          className="w-28 h-28 rounded-2xl overflow-hidden border-2 relative"
                          style={{ borderColor: "#ef4444", boxShadow: "0 0 20px #ef444440" }}>
                          <img src={target.avatar} alt={target.displayName} className="w-full h-full object-cover"
                            onError={e => { (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${target.username}`; }} />
                          {/* Crosshair overlay */}
                          <motion.div
                            animate={{ opacity: [0.6, 1, 0.6] }}
                            transition={{ repeat: Infinity, duration: 0.4 }}
                            className="absolute inset-0 flex items-center justify-center"
                            style={{ background: "rgba(239,68,68,0.15)" }}>
                            <div className="relative w-16 h-16">
                              <div className="absolute inset-0 rounded-full border-2 border-red-500" />
                              <div className="absolute top-1/2 left-0 right-0 h-px bg-red-500 -translate-y-0.5" />
                              <div className="absolute left-1/2 top-0 bottom-0 w-px bg-red-500 -translate-x-0.5" />
                            </div>
                          </motion.div>
                          {/* Number badge */}
                          <div className="absolute top-1 left-1 w-7 h-7 rounded-full bg-red-600 text-white font-black text-sm flex items-center justify-center border-2 border-black">
                            {target.number}
                          </div>
                        </motion.div>
                        <p className="text-red-400 font-black">{target.displayName}</p>
                        <motion.div
                          animate={{ opacity: [0.5, 1, 0.5] }}
                          transition={{ repeat: Infinity, duration: 0.5 }}>
                          <span className="text-3xl">😰</span>
                        </motion.div>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* ── RESULT PHASE ── */
                  <div className="p-8 text-center space-y-5">
                    {isReviveAction ? (
                      <>
                        <div className="text-5xl mb-2">💚</div>
                        <h3 className="text-3xl font-black text-green-400">{shootResult?.msg}</h3>
                        <p className="text-green-400/60">{shootResult?.funny}</p>
                      </>
                    ) : shootResult?.survived ? (
                      <>
                        <div className="text-5xl mb-2">😅</div>
                        <h3 className="text-3xl font-black text-cyan-300">{shootResult.msg}</h3>
                        {shootResult.funny && <p className="text-yellow-300 text-lg font-bold">{shootResult.funny}</p>}
                      </>
                    ) : (
                      <>
                        <div className="text-5xl mb-2">💀</div>
                        <h3 className="text-3xl font-black text-red-400">{shootResult?.msg}</h3>
                        {/* Target card with blood */}
                        <div className="flex justify-center">
                          <div className="relative w-28 h-28 rounded-2xl overflow-hidden border-2 border-red-900">
                            <img src={target.avatar} alt={target.displayName} className="w-full h-full object-cover opacity-40"
                              onError={e => { (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${target.username}`; }} />
                            <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                              <span className="text-4xl">💀</span>
                            </div>
                          </div>
                        </div>
                      </>
                    )}
                    <p className="text-purple-400/40 text-sm animate-pulse">
                      يرجع للروليت تلقائياً...
                    </p>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* ─ GAME OVER ─ */}
          {phase === "game_over" && (
            <motion.div key="gameover"
              initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
              className="text-center space-y-6">
              {winner && (
                <motion.div animate={{ y: [0, -12, 0] }} transition={{ repeat: Infinity, duration: 2.2 }}
                  className="relative w-44 h-44 rounded-3xl overflow-hidden border-4 border-yellow-400 mx-auto"
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
              <div className="flex gap-3 justify-center">
                <motion.button onClick={resetGame}
                  whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
                  className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-lg"
                  style={{ background: "#e040fb20", border: "1px solid #e040fb40", color: "#e040fb" }}>
                  <RefreshCw size={18} /> جولة جديدة
                </motion.button>
                <button onClick={() => navigate("/")}
                  className="px-6 py-3 rounded-xl font-bold text-lg border border-gray-700 text-gray-500 hover:text-red-400 hover:border-red-500/40 transition-all">
                  الرئيسية
                </button>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>

      {/* Bottom status bar */}
      {phase !== "joining" && phase !== "game_over" && (
        <div className="flex-shrink-0 border-t border-purple-500/20 px-5 py-2 flex items-center justify-between text-xs z-10"
          style={{ background: "rgba(10,5,20,0.85)" }}>
          <span className="flex items-center gap-1.5 text-purple-400/50">
            <Users size={11} /> {alivePlayers.length} حي / {players.filter(p => !p.alive).length} 💀
          </span>
          <div className={`flex items-center gap-1.5 ${twitchConnected ? "text-purple-300/50" : "text-gray-600"}`}>
            <Tv2 size={11} /> {twitchConnected ? `#${user?.username}` : "غير متصل"}
          </div>
        </div>
      )}
    </motion.div>
  );
}
