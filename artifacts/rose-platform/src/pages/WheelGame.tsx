import { useState, useRef, useCallback } from "react";
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

// ─── Realistic Gun SVG ────────────────────────────────────────────────────────
const GunSVG = ({ w = 120, color = "#c0c0c0", className = "" }: { w?: number; color?: string; className?: string }) => (
  <svg width={w} height={w * 0.56} viewBox="0 0 160 90" className={className} fill={color}>
    {/* Slide */}
    <rect x="42" y="4" width="108" height="27" rx="5" />
    {/* Barrel tip */}
    <rect x="146" y="8" width="12" height="19" rx="3" />
    {/* Ejection port */}
    <rect x="95" y="6" width="34" height="11" rx="2" fill="rgba(0,0,0,0.3)" />
    {/* Frame */}
    <rect x="42" y="29" width="62" height="16" />
    {/* Grip */}
    <path d="M42,43 L63,43 L59,86 L38,86 Q30,86 32,80 Z" />
    {/* Trigger guard */}
    <path d="M64,43 Q61,64 50,67 Q43,67 42,76 L58,76 L58,86 L62,86 L62,43Z" />
    {/* Trigger */}
    <rect x="67" y="47" width="4" height="13" rx="2" fill="rgba(0,0,0,0.35)" />
    {/* Rear sight */}
    <rect x="44" y="1" width="11" height="5" rx="1" />
    <rect x="46" y="0" width="7" height="3" fill="rgba(0,0,0,0.4)" rx="1" />
    {/* Front sight */}
    <rect x="148" y="1" width="6" height="5" rx="1" />
    {/* Screws/detail */}
    <circle cx="52" cy="60" r="2.5" fill="rgba(0,0,0,0.2)" />
    <circle cx="52" cy="73" r="2.5" fill="rgba(0,0,0,0.2)" />
  </svg>
);

// Muzzle flash
const MuzzleFlash = ({ show }: { show: boolean }) => (
  <AnimatePresence>
    {show && (
      <motion.div key="flash-muzzle"
        initial={{ scale: 0, opacity: 1 }}
        animate={{ scale: 1.8, opacity: 0 }}
        transition={{ duration: 0.18 }}
        className="absolute pointer-events-none"
        style={{ right: -10, top: "20%", width: 48, height: 48 }}>
        <svg viewBox="0 0 48 48" fill="none">
          {[0, 45, 90, 135, 180, 225, 270, 315].map((deg, i) => (
            <line key={i}
              x1="24" y1="24"
              x2={24 + 22 * Math.cos((deg * Math.PI) / 180)}
              y2={24 + 22 * Math.sin((deg * Math.PI) / 180)}
              stroke={i % 2 === 0 ? "#fff7a0" : "#ffd600"}
              strokeWidth={i % 2 === 0 ? "3" : "1.5"}
              strokeLinecap="round" />
          ))}
          <circle cx="24" cy="24" r="7" fill="#fff" />
        </svg>
      </motion.div>
    )}
  </AnimatePresence>
);

// ─── Sound Engine ─────────────────────────────────────────────────────────────
class SoundEngine {
  private ctx: AudioContext | null = null;
  private get() {
    if (!this.ctx) this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    return this.ctx;
  }
  // Realistic noise-based gunshot (quiet, not jarring)
  gunshot() {
    const ctx = this.get();
    const dur = 0.28;
    const sr = ctx.sampleRate;
    const buf = ctx.createBuffer(1, sr * dur, sr);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const t = i / sr;
      data[i] = (Math.random() * 2 - 1) * Math.exp(-t * 28);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 900; lp.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.38, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    src.connect(lp); lp.connect(g); g.connect(ctx.destination);
    src.start(); src.stop(ctx.currentTime + dur);
    // Low thump
    const osc = ctx.createOscillator(); const og = ctx.createGain();
    osc.frequency.setValueAtTime(160, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.1);
    og.gain.setValueAtTime(0.3, ctx.currentTime);
    og.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    osc.connect(og); og.connect(ctx.destination);
    osc.start(); osc.stop(ctx.currentTime + 0.16);
  }
  death() {
    const ctx = this.get();
    [80, 60, 45].forEach((f, i) => {
      const osc = ctx.createOscillator(); const g = ctx.createGain();
      osc.frequency.value = f;
      g.gain.setValueAtTime(0.22, ctx.currentTime + i * 0.14);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.14 + 0.28);
      osc.connect(g); g.connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.14); osc.stop(ctx.currentTime + i * 0.14 + 0.3);
    });
  }
  survive() {
    const ctx = this.get();
    [440, 520, 660].forEach((f, i) => {
      const osc = ctx.createOscillator(); const g = ctx.createGain();
      osc.type = "sine"; osc.frequency.value = f;
      g.gain.setValueAtTime(0.16, ctx.currentTime + i * 0.09);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.09 + 0.16);
      osc.connect(g); g.connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.09); osc.stop(ctx.currentTime + i * 0.09 + 0.18);
    });
  }
  revive() {
    const ctx = this.get();
    [330, 440, 550, 660].forEach((f, i) => {
      const osc = ctx.createOscillator(); const g = ctx.createGain();
      osc.type = "sine"; osc.frequency.value = f;
      g.gain.setValueAtTime(0.18, ctx.currentTime + i * 0.08);
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
}
const sound = new SoundEngine();

// ─── Player Card ──────────────────────────────────────────────────────────────
const PlayerCard = ({ player, isShooter, isTarget }: {
  player: Player; isShooter?: boolean; isTarget?: boolean;
}) => (
  <motion.div layout
    initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: player.alive ? 1 : 0.25, scale: 1 }}
    className="relative rounded-2xl border overflow-hidden"
    style={{
      borderColor: isShooter ? "#ffd600" : isTarget ? "#ef4444" : player.alive ? "#3d1860" : "#1a0a2a",
      background: isShooter ? "rgba(255,214,0,0.08)" : isTarget ? "rgba(239,68,68,0.08)" : "rgba(26,10,46,0.85)",
      boxShadow: isShooter ? "0 0 18px rgba(255,214,0,0.2)" : isTarget ? "0 0 18px rgba(239,68,68,0.2)" : "none",
    }}>
    {player.alive && player.hits > 0 && (
      <div className="absolute top-1 right-1 z-10 bg-black/60 rounded-full px-1.5 py-0.5 text-[9px] font-bold text-red-400 border border-red-900/50">
        {player.hits}×
      </div>
    )}
    {isShooter && <div className="absolute top-1 left-1 z-10 w-5 h-5 rounded-full bg-yellow-400 flex items-center justify-center text-[10px] font-black text-black">S</div>}
    {isTarget && <div className="absolute top-1 left-1 z-10 w-5 h-5 rounded-full bg-red-500 flex items-center justify-center text-[10px] font-black text-white">T</div>}
    <div className="relative aspect-square overflow-hidden">
      <img src={player.avatar} alt={player.displayName} className="w-full h-full object-cover"
        onError={e => { (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${player.username}`; }} />
      {!player.alive && (
        <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
          <div className="w-8 h-8 rounded-full border-2 border-red-700 flex items-center justify-center">
            <div className="w-5 h-0.5 bg-red-600 rotate-45 absolute" />
            <div className="w-5 h-0.5 bg-red-600 -rotate-45 absolute" />
          </div>
        </div>
      )}
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
  const size = 420;
  const radius = N <= 3 ? 138 : N <= 5 ? 155 : N <= 7 ? 168 : 180;
  const avatarSize = N <= 3 ? 82 : N <= 5 ? 70 : N <= 7 ? 60 : 50;
  const cx = size / 2; const cy = size / 2;

  return (
    <div className="relative mx-auto flex-shrink-0" style={{ width: size, height: size }}>
      <div className="absolute inset-0 rounded-full border border-pink-500/20 pointer-events-none" />
      <div className="absolute rounded-full border border-purple-500/10 pointer-events-none"
        style={{ inset: avatarSize / 2 + 8 }} />
      <svg className="absolute inset-0 pointer-events-none" width={size} height={size}>
        {players.map((_, i) => {
          const a = ((2 * Math.PI) / N) * i - Math.PI / 2;
          return <line key={i} x1={cx} y1={cy} x2={cx + radius * Math.cos(a)} y2={cy + radius * Math.sin(a)} stroke="#e040fb07" strokeWidth="1" />;
        })}
        <circle cx={cx} cy={cy} r={radius} fill="none" stroke="#e040fb10" strokeWidth="1" />
      </svg>

      {/* Fixed pointer */}
      <div className="absolute z-30 pointer-events-none flex flex-col items-center" style={{ top: 0, left: cx - 14, width: 28 }}>
        <motion.div animate={isSpinning ? { scale: [1, 1.4, 1] } : { scale: 1 }}
          transition={{ repeat: Infinity, duration: 0.22 }}
          className="text-2xl text-center leading-tight"
          style={{ color: "#e040fb", filter: "drop-shadow(0 0 8px #e040fb)", lineHeight: 1 }}>
          ▼
        </motion.div>
      </div>

      {/* Rotating ring */}
      <motion.div className="absolute inset-0"
        animate={{ rotate: wheelDeg }}
        transition={{ duration: 6.2, ease: [0.1, 0.5, 0.25, 1.0] }}>
        {players.map((p, i) => {
          const a = ((2 * Math.PI) / N) * i;
          const px = cx + radius * Math.sin(a) - avatarSize / 2;
          const py = cy - radius * Math.cos(a) - avatarSize / 2;
          return (
            <div key={p.username} className="absolute" style={{ left: px, top: py, width: avatarSize, height: avatarSize }}>
              <div className="relative w-full h-full">
                <div className={`w-full h-full rounded-full overflow-hidden border-2 ${p.alive ? "" : "opacity-25"}`}
                  style={{ borderColor: p.alive ? "#e040fb80" : "#1a0000", boxShadow: p.alive ? "0 0 8px #e040fb25" : "none" }}>
                  <img src={p.avatar} alt={p.displayName} className="w-full h-full object-cover"
                    onError={e => { (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${p.username}`; }} />
                </div>
                {!p.alive && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/75">
                    <div className="relative">
                      <div className="absolute w-5 h-0.5 bg-red-700 rotate-45 top-0 left-0" />
                      <div className="absolute w-5 h-0.5 bg-red-700 -rotate-45 top-0 left-0" />
                    </div>
                  </div>
                )}
                <div className="absolute -bottom-1 -right-1 rounded-full bg-pink-600 text-white font-black flex items-center justify-center border-2 border-black"
                  style={{ width: Math.max(17, avatarSize * 0.28), height: Math.max(17, avatarSize * 0.28), fontSize: Math.max(8, avatarSize * 0.14) }}>
                  {p.number}
                </div>
                {p.alive && p.hits > 0 && (
                  <div className="absolute -top-1 -left-1 w-4 h-4 rounded-full bg-red-800 text-white flex items-center justify-center border border-black" style={{ fontSize: 8 }}>
                    {p.hits}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </motion.div>

      {/* Center hub with gun SVG */}
      <div className="absolute z-20 rounded-full bg-[#0a0510] border-2 border-pink-500/50 flex items-center justify-center"
        style={{ width: 86, height: 86, left: cx - 43, top: cy - 43, boxShadow: "0 0 28px #e040fb40, inset 0 0 20px #00000090" }}>
        <motion.div
          animate={isSpinning ? { rotate: [-5, 5, -4, 4, -2, 2, 0] } : { rotate: 0 }}
          transition={isSpinning ? { repeat: Infinity, duration: 0.3 } : {}}>
          <GunSVG w={56} color="#c8c8c8" />
        </motion.div>
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

  const [shootCountdown, setShootCountdown] = useState<number | null>(null);
  const [hasFired, setHasFired] = useState(false);
  const [showMuzzle, setShowMuzzle] = useState(false);
  const [shootResult, setShootResult] = useState<{ survived: boolean; msg: string; sub: string } | null>(null);
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

  const syncPhase = (p: Phase) => { phaseRef.current = p; setPhase(p); };
  const syncShooter = (s: Player | null) => { shooterRef.current = s; setShooter(s); };
  const syncPlayers = (fn: (prev: Player[]) => Player[]) => {
    setPlayers(prev => { const next = fn(prev); playersRef.current = next; return next; });
  };

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

  // useEffect for connecting
  const connectedRef = useRef(false);
  if (!connectedRef.current && user?.username) {
    connectedRef.current = true;
    setTimeout(() => connectTwitch(user.username), 100);
  }

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
        const next = [...prev, { username, displayName: username, avatar: `https://unavatar.io/twitch/${username}`, number: num, alive: true, hits: 0, revivedCount: 0, usedRevive: false }];
        playersRef.current = next;
        setJoinMsg(`${username} انضم`);
        setTimeout(() => setJoinMsg(""), 2500);
        return next;
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
    if (scope.current) animate(scope.current, { x: [0, -14, 14, -9, 9, -5, 5, 0] }, { duration: 0.45 });
  };

  // ── Auto-return to spin ───────────────────────────────────────────────────
  const autoReturnToSpin = () => {
    const alive = playersRef.current.filter(p => p.alive);
    if (alive.length <= 1) { syncPhase("game_over"); }
    else {
      syncPhase("spinning");
      setIsSpinning(false);
      spinningRef.current = false;
      syncShooter(null);
      setTarget(null);
      setShootResult(null);
      setHasFired(false);
      setShootCountdown(null);
      setShowMuzzle(false);
      setIsReviveAction(false);
    }
  };

  // ── Spin wheel (manual) ───────────────────────────────────────────────────
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
    const N = all.length;
    const chosenIdx = all.findIndex(p => p.username === chosen.username);
    const anglePerPlayer = 360 / N;
    const currentMod = ((wheelDegRef.current % 360) + 360) % 360;
    const targetMod = ((-chosenIdx * anglePerPlayer) % 360 + 360) % 360;
    let delta = (targetMod - currentMod + 360) % 360;
    if (delta < 15) delta += 360;
    const extraSpins = (Math.floor(Math.random() * 3) + 6) * 360; // 6-8 full rotations
    const newDeg = wheelDegRef.current + extraSpins + delta;
    wheelDegRef.current = newDeg;
    setWheelDeg(newDeg);

    // Tick sounds — start fast, slow down
    let elapsed = 0; let tickInterval = 60;
    const doTick = () => {
      const progress = elapsed / 6200;
      const pitch = 900 - progress * 500;
      sound.spinTick(Math.max(400, pitch));
      elapsed += tickInterval;
      tickInterval = Math.min(tickInterval * 1.10, 500);
      if (elapsed < 6100) setTimeout(doTick, tickInterval);
    };
    doTick();

    setTimeout(() => {
      setIsSpinning(false);
      spinningRef.current = false;
      lastShooterRef.current = chosen.username;
      syncShooter(chosen);
      syncPhase("waiting_target");
    }, 6400);
  }, []);

  // ── Revive ────────────────────────────────────────────────────────────────
  const runRevive = useCallback((sh: Player, revived: Player) => {
    setTarget(revived);
    setIsReviveAction(true);
    setHasFired(false);
    setShootCountdown(null);
    setShootResult(null);
    syncPhase("shooting");
    sound.revive();
    setTimeout(() => {
      setHasFired(true);
      syncPlayers(prev => prev.map(p => {
        if (p.username === revived.username) return { ...p, alive: true, revivedCount: 1 };
        if (p.username === sh.username) return { ...p, usedRevive: true };
        return p;
      }));
      setShootResult({ survived: true, msg: `${revived.displayName} رجع للحياة`, sub: "تم الإنعاش بنجاح" });
      setTimeout(autoReturnToSpin, 3000);
    }, 1200);
  }, []);

  // ── Shooting sequence ─────────────────────────────────────────────────────
  const runShootingSequence = useCallback((sh: Player, tgt: Player) => {
    setTarget(tgt);
    setIsReviveAction(false);
    setHasFired(false);
    setShootResult(null);
    setShootCountdown(3);
    setShowMuzzle(false);
    syncPhase("shooting");

    // Countdown
    setTimeout(() => setShootCountdown(2), 900);
    setTimeout(() => setShootCountdown(1), 1800);
    setTimeout(() => {
      setShootCountdown(0);
      // FIRE
      setFlashScreen(true);
      setTimeout(() => setFlashScreen(false), 90);
      setShowMuzzle(true);
      setTimeout(() => setShowMuzzle(false), 250);
      sound.gunshot();
      shakeScreen();

      const newHits = tgt.hits + 1;
      const dies = newHits >= MAX_HITS || Math.random() < 0.38;

      setTimeout(() => {
        setHasFired(true);
        if (dies) {
          sound.death();
          syncPlayers(prev => prev.map(p => p.username === tgt.username ? { ...p, alive: false, hits: newHits } : p));
          setShootResult({
            survived: false,
            msg: "GG تعيش وتأكل غيرها",
            sub: `${tgt.displayName} خرج من اللعبة`
          });
        } else {
          sound.survive();
          syncPlayers(prev => prev.map(p => p.username === tgt.username ? { ...p, hits: newHits } : p));
          setShootResult({
            survived: true,
            msg: newHits >= 3 ? "بس بسبع أرواح" : "نجا هالمرة",
            sub: newHits >= 3 ? `تعرض لـ ${newHits} طلقات` : `طلقة ${newHits} من ${MAX_HITS}`
          });
        }
        setTimeout(autoReturnToSpin, 3200);
      }, 300);
    }, 2700);
  }, []);

  const handleStartGame = () => {
    if (players.filter(p => p.alive).length < 2) return;
    syncShooter(null); setTarget(null);
    setShootResult(null); setHasFired(false); setShootCountdown(null);
    syncPhase("spinning");
  };

  const resetGame = () => {
    syncPhase("joining");
    setPlayers([]); playersRef.current = [];
    syncShooter(null); setTarget(null);
    setShootResult(null); setHasFired(false); setShootCountdown(null);
    setIsReviveAction(false); setIsSpinning(false);
    spinningRef.current = false;
    wheelDegRef.current = 0; setWheelDeg(0);
    lastShooterRef.current = null;
  };

  const alivePlayers = players.filter(p => p.alive);
  const winner = alivePlayers.length === 1 ? alivePlayers[0] : null;

  return (
    <motion.div ref={scope} className="min-h-screen gradient-bg relative overflow-hidden flex flex-col" dir="rtl">

      {/* White flash */}
      <AnimatePresence>
        {flashScreen && (
          <motion.div key="flash" initial={{ opacity: 0.85 }} animate={{ opacity: 0 }}
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
        style={{ background: "rgba(10,5,20,0.92)", backdropFilter: "blur(16px)" }}>
        <button onClick={() => navigate("/")}
          className="flex items-center gap-1.5 text-purple-300/60 hover:text-pink-400 transition-colors text-sm">
          <ArrowRight size={16} /> العودة
        </button>
        <div className="flex items-center gap-3">
          <GunSVG w={36} color="#e040fb" />
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
                    {joinMsg} انضم
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

          {/* ─ SPINNING ─ */}
          {phase === "spinning" && (
            <motion.div key="spinning"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="w-full max-w-5xl flex flex-col items-center gap-6">
              <div className="text-center space-y-1">
                <h2 className="text-3xl font-black text-white">
                  {isSpinning ? "العجلة تدور..." : "جاهز"}
                </h2>
                <p className="text-purple-300/40 text-sm">
                  <Users size={12} className="inline ml-1" />{alivePlayers.length} لاعب حي
                </p>
              </div>

              <SpinningWheel players={players} wheelDeg={wheelDeg} isSpinning={isSpinning} />

              {!isSpinning && (
                <motion.button onClick={handleSpinWheel}
                  initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                  whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.95 }}
                  className="flex items-center gap-3 px-10 py-4 rounded-2xl text-2xl font-black"
                  style={{ background: "linear-gradient(135deg, #e040fb, #9c27b0)", boxShadow: "0 0 35px #e040fb50" }}>
                  <GunSVG w={36} color="white" /> لف العجلة
                </motion.button>
              )}
            </motion.div>
          )}

          {/* ─ WAITING TARGET ─ */}
          {phase === "waiting_target" && shooter && (
            <motion.div key="waiting"
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
              className="w-full max-w-5xl space-y-5">
              <div className="text-center space-y-4">
                <div className="flex items-center justify-center gap-4 flex-wrap">
                  <div className="relative w-20 h-20 rounded-2xl overflow-hidden border-2 border-yellow-400 flex-shrink-0"
                    style={{ boxShadow: "0 0 24px rgba(255,214,0,0.4)" }}>
                    <img src={shooter.avatar} alt={shooter.displayName} className="w-full h-full object-cover"
                      onError={e => { (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${shooter.username}`; }} />
                  </div>
                  <div className="text-right">
                    <p className="text-purple-300/50 text-sm">دور اللاعب</p>
                    <p className="text-3xl font-black text-yellow-400">{shooter.displayName}</p>
                    <div className="flex items-center gap-2 justify-end mt-1">
                      <GunSVG w={32} color="#e040fb" />
                      <span className="text-purple-300/70 text-sm">جاهز للتصويب</span>
                    </div>
                  </div>
                </div>
                <div className="inline-block px-6 py-3 rounded-2xl border border-orange-500/40 bg-orange-500/10">
                  <p className="text-xl font-black text-orange-200">
                    اكتب <span className="text-yellow-300 font-black">رقم اللاعب</span> في الشات للتصويب عليه
                  </p>
                  {!shooter.usedRevive && players.some(p => !p.alive && p.revivedCount === 0) && (
                    <p className="text-sm text-green-400/70 mt-1">
                      أو اكتب رقم لاعب خرج لإنعاشه — مرة واحدة فقط
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
                {players.map(p => <PlayerCard key={p.username} player={p} isShooter={p.username === shooter.username} />)}
              </div>
            </motion.div>
          )}

          {/* ─ SHOOTING ─ */}
          {phase === "shooting" && shooter && target && (
            <motion.div key="shooting"
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
              className="w-full max-w-2xl">
              <div className="rounded-3xl border overflow-hidden"
                style={{
                  borderColor: hasFired ? (shootResult?.survived ? "#22c55e50" : "#ef444450") : "#e040fb40",
                  background: "linear-gradient(145deg, rgba(14,4,28,0.99), rgba(6,4,26,0.99))",
                  boxShadow: hasFired
                    ? (shootResult?.survived ? "0 0 50px rgba(34,197,94,0.2)" : "0 0 50px rgba(239,68,68,0.25)")
                    : "0 0 50px rgba(224,64,251,0.15)",
                }}>
                <div className="h-[2px]"
                  style={{
                    background: hasFired
                      ? (isReviveAction ? "linear-gradient(90deg,#22c55e,#16a34a)" : shootResult?.survived ? "linear-gradient(90deg,#00e5ff,#22c55e)" : "linear-gradient(90deg,#e040fb,#ef4444)")
                      : "linear-gradient(90deg,#e040fb80,#ffd60080,#e040fb80)"
                  }} />

                {!hasFired ? (
                  /* AIMING */
                  <div className="p-8 space-y-6">
                    <div className="flex items-stretch justify-between gap-4">

                      {/* Shooter side */}
                      <div className="flex flex-col items-center gap-3 flex-1">
                        <motion.div animate={{ x: [0, 3, 0] }} transition={{ repeat: Infinity, duration: 0.5 }}
                          className="w-28 h-28 rounded-2xl overflow-hidden border-2 border-yellow-500"
                          style={{ boxShadow: "0 0 20px rgba(255,214,0,0.3)" }}>
                          <img src={shooter.avatar} alt={shooter.displayName} className="w-full h-full object-cover"
                            onError={e => { (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${shooter.username}`; }} />
                        </motion.div>
                        <p className="text-yellow-400 font-black text-sm">{shooter.displayName}</p>
                        {/* Gun aimed right */}
                        <motion.div animate={{ x: [0, 6, 0] }} transition={{ repeat: Infinity, duration: 0.5 }}
                          className="relative">
                          <GunSVG w={80} color="#d4d4d4" />
                          <MuzzleFlash show={showMuzzle} />
                        </motion.div>
                      </div>

                      {/* Countdown */}
                      <div className="flex flex-col items-center justify-center gap-4 flex-shrink-0 px-2">
                        <AnimatePresence mode="wait">
                          <motion.div key={shootCountdown}
                            initial={{ scale: 2.5, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.3, opacity: 0 }}
                            transition={{ duration: 0.25, ease: "easeOut" }}
                            className="text-7xl font-black tabular-nums"
                            style={{
                              color: shootCountdown === 0 ? "#ef4444" : shootCountdown === 1 ? "#ff6d00" : shootCountdown === 2 ? "#ffd600" : "#ffffff",
                              textShadow: shootCountdown === 0 ? "0 0 30px #ef4444" : shootCountdown === 1 ? "0 0 20px #ff6d00" : "0 0 10px currentColor",
                              lineHeight: 1,
                            }}>
                            {shootCountdown === 0 ? "!" : shootCountdown}
                          </motion.div>
                        </AnimatePresence>
                        {/* Progress bar */}
                        <motion.div className="w-1 rounded-full bg-pink-500/30 origin-bottom"
                          style={{ height: 60 }}
                          animate={{ scaleY: [1, 0] }}
                          transition={{ duration: 2.7, ease: "linear" }} />
                      </div>

                      {/* Target side */}
                      <div className="flex flex-col items-center gap-3 flex-1">
                        <motion.div
                          animate={shootCountdown === 1
                            ? { x: [-5, 5, -4, 4, -2, 2, 0] }
                            : { x: [0, -2, 2, 0] }}
                          transition={{ repeat: Infinity, duration: shootCountdown === 1 ? 0.18 : 1.2 }}
                          className="w-28 h-28 rounded-2xl overflow-hidden border-2 relative"
                          style={{ borderColor: "#ef444470", boxShadow: "0 0 20px rgba(239,68,68,0.3)" }}>
                          <img src={target.avatar} alt={target.displayName} className="w-full h-full object-cover"
                            onError={e => { (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${target.username}`; }} />
                          {/* Crosshair */}
                          <motion.div animate={{ opacity: [0.5, 1, 0.5] }} transition={{ repeat: Infinity, duration: 0.35 }}
                            className="absolute inset-0 flex items-center justify-center"
                            style={{ background: "rgba(239,68,68,0.12)" }}>
                            <div className="relative w-14 h-14">
                              <div className="absolute inset-0 rounded-full border-2 border-red-500/70" />
                              <div className="absolute inset-0 rounded-full border border-red-500/40" style={{ margin: 4 }} />
                              <div className="absolute top-1/2 left-0 right-0 h-px bg-red-500/60" />
                              <div className="absolute left-1/2 top-0 bottom-0 w-px bg-red-500/60" />
                            </div>
                          </motion.div>
                          <div className="absolute top-1 left-1 w-6 h-6 rounded-full bg-red-600 text-white font-black text-xs flex items-center justify-center border-2 border-black">
                            {target.number}
                          </div>
                        </motion.div>
                        <p className="text-red-400 font-black text-sm">{target.displayName}</p>
                        <p className="text-purple-400/40 text-xs">هدف</p>
                      </div>

                    </div>
                  </div>
                ) : (
                  /* RESULT */
                  <div className="p-10 text-center space-y-4">
                    {isReviveAction ? (
                      <>
                        <div className="w-16 h-16 rounded-full border-2 border-green-500 bg-green-500/15 flex items-center justify-center mx-auto mb-4">
                          <div className="text-green-400 font-black text-2xl">+</div>
                        </div>
                        <h3 className="text-3xl font-black text-green-400">{shootResult?.msg}</h3>
                        <p className="text-green-400/50 text-sm">{shootResult?.sub}</p>
                      </>
                    ) : shootResult?.survived ? (
                      <>
                        <div className="w-16 h-16 rounded-full border-2 border-cyan-500 bg-cyan-500/10 flex items-center justify-center mx-auto mb-4">
                          <div className="w-6 h-6 rounded-full border-2 border-cyan-400" />
                        </div>
                        <h3 className="text-3xl font-black text-cyan-300">{shootResult?.msg}</h3>
                        <p className="text-purple-400/50 text-sm">{shootResult?.sub}</p>
                        <div className="w-28 h-28 rounded-2xl overflow-hidden border-2 border-cyan-500/40 mx-auto">
                          <img src={target.avatar} alt={target.displayName} className="w-full h-full object-cover"
                            onError={e => { (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${target.username}`; }} />
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="w-16 h-16 rounded-full border-2 border-red-700 bg-red-900/20 flex items-center justify-center mx-auto mb-4">
                          <div className="relative w-8 h-8">
                            <div className="absolute inset-0 flex items-center justify-center">
                              <div className="w-7 h-0.5 bg-red-500 rotate-45 absolute" />
                              <div className="w-7 h-0.5 bg-red-500 -rotate-45 absolute" />
                            </div>
                          </div>
                        </div>
                        <h3 className="text-3xl font-black text-red-400">{shootResult?.msg}</h3>
                        <p className="text-purple-400/50 text-sm">{shootResult?.sub}</p>
                        <div className="w-28 h-28 rounded-2xl overflow-hidden border-2 border-red-900/50 mx-auto relative">
                          <img src={target.avatar} alt={target.displayName} className="w-full h-full object-cover opacity-35"
                            onError={e => { (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${target.username}`; }} />
                          <div className="absolute inset-0 bg-red-950/70 flex items-center justify-center">
                            <div className="relative w-10 h-10">
                              <div className="w-9 h-0.5 bg-red-600 rotate-45 absolute top-1/2 left-0" />
                              <div className="w-9 h-0.5 bg-red-600 -rotate-45 absolute top-1/2 left-0" />
                            </div>
                          </div>
                        </div>
                      </>
                    )}
                    <p className="text-purple-500/30 text-xs pt-2 animate-pulse">يرجع للروليت تلقائياً...</p>
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
                  style={{ boxShadow: "0 0 60px rgba(255,214,0,0.6)" }}>
                  <img src={winner.avatar} alt={winner.displayName} className="w-full h-full object-cover"
                    onError={e => { (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${winner.username}`; }} />
                  <div className="absolute bottom-0 inset-x-0 py-1 text-center text-xs font-black text-yellow-300"
                    style={{ background: "rgba(0,0,0,0.7)" }}>
                    البطل
                  </div>
                </motion.div>
              )}
              <div>
                <h2 className="text-5xl sm:text-6xl font-black neon-text-pink mt-1">
                  {winner?.displayName ?? "لا أحد"}
                </h2>
                <p className="text-yellow-400/80 text-xl mt-2">آخر من بقي</p>
              </div>
              <div className="flex gap-3 justify-center">
                <motion.button onClick={resetGame}
                  whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
                  className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-base"
                  style={{ background: "#e040fb18", border: "1px solid #e040fb40", color: "#e040fb" }}>
                  <RefreshCw size={16} /> جولة جديدة
                </motion.button>
                <button onClick={() => navigate("/")}
                  className="px-6 py-3 rounded-xl font-bold text-base border border-gray-700/50 text-gray-500 hover:text-red-400 hover:border-red-500/40 transition-all">
                  الرئيسية
                </button>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>

      {/* Status bar */}
      {phase !== "joining" && phase !== "game_over" && (
        <div className="flex-shrink-0 border-t border-purple-500/15 px-5 py-2 flex items-center justify-between text-xs z-10"
          style={{ background: "rgba(8,4,16,0.88)" }}>
          <span className="flex items-center gap-1.5 text-purple-400/40">
            <Users size={11} /> {alivePlayers.length} حي · {players.filter(p => !p.alive).length} خرج
          </span>
          <div className={`flex items-center gap-1.5 ${twitchConnected ? "text-purple-400/40" : "text-gray-700"}`}>
            <Tv2 size={11} /> {twitchConnected ? `#${user?.username}` : "غير متصل"}
          </div>
        </div>
      )}
    </motion.div>
  );
}
