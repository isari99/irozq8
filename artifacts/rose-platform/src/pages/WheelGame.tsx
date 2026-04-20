import { useState, useRef, useCallback } from "react";
import { fetchTwitchAvatar, fallbackAvatar } from "@/lib/twitchUser";
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

// ─── Gun SVG (barrel points RIGHT — toward target) ────────────────────────────
const GunSVG = ({
  w = 120,
  color = "#c8c8c8",
  className = "",
  style = {},
}: {
  w?: number;
  color?: string;
  className?: string;
  style?: React.CSSProperties;
}) => (
  <svg
    width={w}
    height={Math.round(w * 0.56)}
    viewBox="0 0 160 90"
    className={className}
    style={style}
    fill={color}
  >
    {/* Slide (top) */}
    <rect x="28" y="5" width="116" height="26" rx="5" />
    {/* Barrel extension at muzzle */}
    <rect x="142" y="9" width="16" height="18" rx="3" />
    {/* Ejection port cutout */}
    <rect x="88" y="7" width="36" height="10" rx="2" fill="rgba(0,0,0,0.28)" />
    {/* Frame body */}
    <rect x="28" y="29" width="70" height="16" />
    {/* Grip */}
    <path d="M28,43 L51,43 L47,86 L25,86 Q17,86 20,80 Z" />
    {/* Trigger guard */}
    <path d="M52,43 Q50,64 39,67 Q32,67 31,76 L46,76 L46,86 L51,86 L52,43 Z" />
    {/* Trigger */}
    <rect x="55" y="47" width="4" height="13" rx="2" fill="rgba(0,0,0,0.4)" />
    {/* Rear sight */}
    <rect x="30" y="2" width="12" height="5" rx="1" />
    <rect x="33" y="0" width="6" height="3" rx="1" fill="rgba(0,0,0,0.4)" />
    {/* Front sight */}
    <rect x="144" y="2" width="7" height="5" rx="1" />
    {/* Grip texture dots */}
    <circle cx="37" cy="60" r="2" fill="rgba(0,0,0,0.18)" />
    <circle cx="37" cy="72" r="2" fill="rgba(0,0,0,0.18)" />
    <circle cx="44" cy="66" r="2" fill="rgba(0,0,0,0.18)" />
  </svg>
);

// ─── Muzzle Flash (appears at the RIGHT side — muzzle end) ────────────────────
const MuzzleFlash = ({ show }: { show: boolean }) => (
  <AnimatePresence>
    {show && (
      <motion.div
        key="muzzle"
        initial={{ scale: 0, opacity: 1 }}
        animate={{ scale: 2, opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="absolute pointer-events-none z-30"
        style={{ left: "100%", top: "0%", width: 52, height: 52, marginLeft: -8 }}
      >
        <svg viewBox="0 0 52 52" fill="none">
          {[0, 40, 80, 120, 160, 200, 240, 280, 320].map((deg, i) => (
            <line
              key={i}
              x1="26" y1="26"
              x2={26 + 23 * Math.cos((deg * Math.PI) / 180)}
              y2={26 + 23 * Math.sin((deg * Math.PI) / 180)}
              stroke={i % 2 === 0 ? "#fffde7" : "#ffd600"}
              strokeWidth={i % 2 === 0 ? "3.5" : "2"}
              strokeLinecap="round"
            />
          ))}
          <circle cx="26" cy="26" r="8" fill="white" />
          <circle cx="26" cy="26" r="4" fill="#ffd600" />
        </svg>
      </motion.div>
    )}
  </AnimatePresence>
);

// ─── Sound Engine ─────────────────────────────────────────────────────────────
class SoundEngine {
  private ctx: AudioContext | null = null;
  private get() {
    if (!this.ctx)
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    return this.ctx;
  }
  gunshot() {
    const ctx = this.get();
    const dur = 0.3;
    const sr = ctx.sampleRate;
    const buf = ctx.createBuffer(1, sr * dur, sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      d[i] = (Math.random() * 2 - 1) * Math.exp(-t * 26);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 850; lp.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.35, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    src.connect(lp); lp.connect(g); g.connect(ctx.destination);
    src.start(); src.stop(ctx.currentTime + dur);
    // Bass thump
    const osc = ctx.createOscillator();
    const og = ctx.createGain();
    osc.frequency.setValueAtTime(150, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(38, ctx.currentTime + 0.12);
    og.gain.setValueAtTime(0.28, ctx.currentTime);
    og.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.16);
    osc.connect(og); og.connect(ctx.destination);
    osc.start(); osc.stop(ctx.currentTime + 0.18);
  }
  death() {
    const ctx = this.get();
    [75, 58, 44].forEach((f, i) => {
      const osc = ctx.createOscillator(); const g = ctx.createGain();
      osc.frequency.value = f;
      g.gain.setValueAtTime(0.2, ctx.currentTime + i * 0.13);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.13 + 0.3);
      osc.connect(g); g.connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.13); osc.stop(ctx.currentTime + i * 0.13 + 0.32);
    });
  }
  survive() {
    const ctx = this.get();
    [440, 528, 660].forEach((f, i) => {
      const osc = ctx.createOscillator(); const g = ctx.createGain();
      osc.type = "sine"; osc.frequency.value = f;
      g.gain.setValueAtTime(0.14, ctx.currentTime + i * 0.1);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.1 + 0.18);
      osc.connect(g); g.connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.1); osc.stop(ctx.currentTime + i * 0.1 + 0.2);
    });
  }
  revive() {
    const ctx = this.get();
    [330, 440, 550, 660].forEach((f, i) => {
      const osc = ctx.createOscillator(); const g = ctx.createGain();
      osc.type = "sine"; osc.frequency.value = f;
      g.gain.setValueAtTime(0.16, ctx.currentTime + i * 0.08);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.08 + 0.14);
      osc.connect(g); g.connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.08); osc.stop(ctx.currentTime + i * 0.08 + 0.16);
    });
  }
  spinTick(pitch = 900) {
    const ctx = this.get();
    const osc = ctx.createOscillator(); const g = ctx.createGain();
    osc.frequency.value = pitch;
    g.gain.setValueAtTime(0.06, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);
    osc.connect(g); g.connect(ctx.destination);
    osc.start(); osc.stop(ctx.currentTime + 0.04);
  }
}
const sound = new SoundEngine();

// ─── Bullet Bar (shown in waiting_target only) ────────────────────────────────
const BulletBar = ({ hits }: { hits: number }) => (
  <div className="flex gap-0.5 justify-center mt-0.5 flex-wrap">
    {Array.from({ length: MAX_HITS }).map((_, i) => (
      <div
        key={i}
        className="rounded-full"
        style={{
          width: 6, height: 6,
          background: i < hits ? "#ef4444" : "rgba(255,255,255,0.12)",
          boxShadow: i < hits ? "0 0 4px #ef4444" : "none",
        }}
      />
    ))}
  </div>
);

// ─── Player Card ──────────────────────────────────────────────────────────────
const PlayerCard = ({
  player, isShooter, isTarget, showBullets = false,
}: {
  player: Player; isShooter?: boolean; isTarget?: boolean; showBullets?: boolean;
}) => (
  <motion.div
    layout
    initial={{ opacity: 0, scale: 0.8 }}
    animate={{ opacity: player.alive ? 1 : 0.25, scale: 1 }}
    className="relative rounded-2xl border overflow-hidden"
    style={{
      borderColor: isShooter ? "#ffd600" : isTarget ? "#ef4444" : player.alive ? "#3d1860" : "#1a0a2a",
      background: isShooter
        ? "rgba(255,214,0,0.07)"
        : isTarget
        ? "rgba(239,68,68,0.07)"
        : "rgba(26,10,46,0.85)",
      boxShadow: isShooter
        ? "0 0 16px rgba(255,214,0,0.2)"
        : isTarget
        ? "0 0 16px rgba(239,68,68,0.25)"
        : "none",
    }}
  >
    {isShooter && (
      <div className="absolute top-1 left-1 z-10 w-5 h-5 rounded-full bg-yellow-400 flex items-center justify-center text-[10px] font-black text-black">
        S
      </div>
    )}
    {isTarget && (
      <div className="absolute top-1 left-1 z-10 w-5 h-5 rounded-full bg-red-500 flex items-center justify-center text-[10px] font-black text-white">
        T
      </div>
    )}
    <div className="relative aspect-square overflow-hidden">
      <img
        src={player.avatar}
        alt={player.displayName}
        className="w-full h-full object-cover"
        onError={e => {
          (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${player.username}`;
        }}
      />
      {!player.alive && (
        <div className="absolute inset-0 bg-black/72 flex items-center justify-center">
          <div className="relative w-8 h-8">
            <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-red-600 rotate-45 -translate-y-0.5" />
            <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-red-600 -rotate-45 -translate-y-0.5" />
          </div>
        </div>
      )}
      <div
        className="absolute bottom-1 right-1 w-6 h-6 rounded-full flex items-center justify-center font-black text-[11px] border-2"
        style={{
          background: isShooter ? "#ffd600" : isTarget ? "#ef4444" : "#e040fb",
          borderColor: "#0a0a1a",
          color: isShooter ? "#0a0a1a" : "#fff",
        }}
      >
        {player.number}
      </div>
    </div>
    <div className="px-1 pt-1 pb-1.5 text-center">
      <p
        className="text-[11px] font-bold truncate"
        style={{
          color: !player.alive
            ? "#374151"
            : isShooter
            ? "#ffd600"
            : isTarget
            ? "#ef4444"
            : "#e2d0f0",
          textDecoration: !player.alive ? "line-through" : "none",
        }}
      >
        {player.displayName}
      </p>
      {/* Bullet count — only shown in waiting_target */}
      {showBullets && player.alive && <BulletBar hits={player.hits} />}
      {showBullets && !player.alive && (
        <p className="text-[9px] text-red-800 font-bold mt-0.5">خرج</p>
      )}
    </div>
  </motion.div>
);

// ─── Spinning Wheel ───────────────────────────────────────────────────────────
// Note: no hit-count badges here — clean wheel only
const SpinningWheel = ({
  players,
  wheelDeg,
  isSpinning,
}: {
  players: Player[];
  wheelDeg: number;
  isSpinning: boolean;
}) => {
  const N = players.length;
  if (N === 0) return null;
  const size = 420;
  const radius = N <= 3 ? 138 : N <= 5 ? 155 : N <= 7 ? 168 : 180;
  const avatarSize = N <= 3 ? 82 : N <= 5 ? 70 : N <= 7 ? 60 : 50;
  const cx = size / 2;
  const cy = size / 2;

  return (
    <div className="relative mx-auto flex-shrink-0" style={{ width: size, height: size }}>
      {/* Outer ring */}
      <div
        className="absolute inset-0 rounded-full pointer-events-none"
        style={{ border: "1px solid rgba(224,64,251,0.18)" }}
      />
      {/* Spoke guides */}
      <svg className="absolute inset-0 pointer-events-none" width={size} height={size}>
        {players.map((_, i) => {
          const a = ((2 * Math.PI) / N) * i - Math.PI / 2;
          return (
            <line key={i} x1={cx} y1={cy}
              x2={cx + radius * Math.cos(a)} y2={cy + radius * Math.sin(a)}
              stroke="#e040fb06" strokeWidth="1" />
          );
        })}
        <circle cx={cx} cy={cy} r={radius} fill="none" stroke="#e040fb08" strokeWidth="1" />
      </svg>

      {/* Top pointer */}
      <div
        className="absolute z-30 pointer-events-none"
        style={{ top: 0, left: cx - 14, width: 28, textAlign: "center" }}
      >
        <motion.div
          animate={isSpinning ? { scale: [1, 1.5, 1] } : { scale: 1 }}
          transition={{ repeat: Infinity, duration: 0.22 }}
          style={{
            color: "#e040fb",
            filter: "drop-shadow(0 0 6px #e040fb)",
            fontSize: 22,
            lineHeight: 1,
          }}
        >
          ▼
        </motion.div>
      </div>

      {/* Rotating player ring */}
      <motion.div
        className="absolute inset-0"
        animate={{ rotate: wheelDeg }}
        transition={{ duration: 6.2, ease: [0.1, 0.5, 0.25, 1.0] }}
      >
        {players.map((p, i) => {
          const a = ((2 * Math.PI) / N) * i;
          const px = cx + radius * Math.sin(a) - avatarSize / 2;
          const py = cy - radius * Math.cos(a) - avatarSize / 2;
          return (
            <div key={p.username} className="absolute" style={{ left: px, top: py, width: avatarSize, height: avatarSize }}>
              <div className="relative w-full h-full">
                <div
                  className={`w-full h-full rounded-full overflow-hidden border-2 ${p.alive ? "" : "opacity-22"}`}
                  style={{
                    borderColor: p.alive ? "#e040fb70" : "#1a0000",
                    boxShadow: p.alive ? "0 0 8px rgba(224,64,251,0.2)" : "none",
                  }}
                >
                  <img
                    src={p.avatar} alt={p.displayName}
                    className="w-full h-full object-cover"
                    onError={e => {
                      (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${p.username}`;
                    }}
                  />
                </div>
                {!p.alive && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/70">
                    <div className="relative w-5 h-5">
                      <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-red-700 rotate-45" />
                      <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-red-700 -rotate-45" />
                    </div>
                  </div>
                )}
                {/* Number badge only — no hit count */}
                <div
                  className="absolute -bottom-1 -right-1 rounded-full bg-pink-600 text-white font-black flex items-center justify-center border-2 border-black"
                  style={{
                    width: Math.max(17, avatarSize * 0.28),
                    height: Math.max(17, avatarSize * 0.28),
                    fontSize: Math.max(8, avatarSize * 0.14),
                  }}
                >
                  {p.number}
                </div>
              </div>
            </div>
          );
        })}
      </motion.div>

      {/* Center gun hub — no dark border, transparent background */}
      <div
        className="absolute z-20 flex items-center justify-center"
        style={{
          width: 88, height: 88,
          left: cx - 44, top: cy - 44,
          background: "radial-gradient(circle, rgba(10,5,20,0.85), rgba(6,3,14,0.6))",
          borderRadius: "50%",
          boxShadow: "0 0 32px rgba(224,64,251,0.3)",
        }}
      >
        <motion.div
          animate={isSpinning ? { x: [-2, 2, -1, 1, 0] } : { x: 0 }}
          transition={{ repeat: Infinity, duration: 0.3 }}
        >
          <GunSVG w={58} color="#d4d4d4" />
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
  const [shootResult, setShootResult] = useState<{
    survived: boolean;
    msg: string;
    sub: string;
  } | null>(null);
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
  const connectedRef = useRef(false);

  const syncPhase = (p: Phase) => { phaseRef.current = p; setPhase(p); };
  const syncShooter = (s: Player | null) => { shooterRef.current = s; setShooter(s); };
  const syncPlayers = (fn: (prev: Player[]) => Player[]) => {
    setPlayers(prev => {
      const next = fn(prev);
      playersRef.current = next;
      return next;
    });
  };

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

  // Connect once on mount
  if (!connectedRef.current && user?.username) {
    connectedRef.current = true;
    setTimeout(() => connectTwitch(user.username), 80);
  }

  // ── Chat handler ───────────────────────────────────────────────────────────
  const handleChatMsg = useCallback((username: string, text: string) => {
    const msg = text.trim().toLowerCase();
    const ph = phaseRef.current;
    const sh = shooterRef.current;
    const pl = playersRef.current;

    if (msg === "join" && ph === "joining") {
      if (playersRef.current.find(p => p.username === username)) return;
      const num = playersRef.current.length + 1;
      const np = {
        username, displayName: username,
        avatar: fallbackAvatar(username),
        number: num, alive: true, hits: 0, revivedCount: 0, usedRevive: false,
      };
      const next = [...playersRef.current, np];
      playersRef.current = next;
      setPlayers(next);
      setJoinMsg(username);
      setTimeout(() => setJoinMsg(""), 2400);
      fetchTwitchAvatar(username).then(avatar =>
        setPlayers(prev => prev.map(p => p.username === username ? { ...p, avatar } : p))
      );
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

  // ── Screen shake ───────────────────────────────────────────────────────────
  const shakeScreen = () => {
    if (scope.current) {
      animate(scope.current, { x: [0, -15, 15, -10, 10, -5, 5, 0] }, { duration: 0.45 });
    }
  };

  // ── Auto-return to spin ────────────────────────────────────────────────────
  const autoReturnToSpin = () => {
    const alive = playersRef.current.filter(p => p.alive);
    if (alive.length <= 1) {
      syncPhase("game_over");
    } else {
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

  // ── Spin wheel (manual) ────────────────────────────────────────────────────
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
    const extraSpins = (Math.floor(Math.random() * 3) + 6) * 360;
    const newDeg = wheelDegRef.current + extraSpins + delta;
    wheelDegRef.current = newDeg;
    setWheelDeg(newDeg);

    // Tick sounds: fast then gradually slower
    let elapsed = 0;
    let tickInterval = 60;
    const doTick = () => {
      const progress = elapsed / 6200;
      sound.spinTick(900 - progress * 450);
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

  // ── Revive ─────────────────────────────────────────────────────────────────
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
      syncPlayers(prev =>
        prev.map(p => {
          if (p.username === revived.username) return { ...p, alive: true, revivedCount: 1 };
          if (p.username === sh.username) return { ...p, usedRevive: true };
          return p;
        })
      );
      setShootResult({
        survived: true,
        msg: `${revived.displayName} رجع للحياة`,
        sub: "تم الإنعاش بنجاح",
      });
      setTimeout(autoReturnToSpin, 4000);
    }, 1000);
  }, []);

  // ── Shooting sequence — 5-second countdown ─────────────────────────────────
  const runShootingSequence = useCallback((sh: Player, tgt: Player) => {
    setTarget(tgt);
    setIsReviveAction(false);
    setHasFired(false);
    setShootResult(null);
    setShowMuzzle(false);
    setShootCountdown(5);
    syncPhase("shooting");

    // 5 → 4 → 3 → 2 → 1 → FIRE (1 second each)
    setTimeout(() => setShootCountdown(4), 1000);
    setTimeout(() => setShootCountdown(3), 2000);
    setTimeout(() => setShootCountdown(2), 3000);
    setTimeout(() => setShootCountdown(1), 4000);
    setTimeout(() => {
      setShootCountdown(0);

      // FIRE
      setFlashScreen(true);
      setTimeout(() => setFlashScreen(false), 90);
      setShowMuzzle(true);
      setTimeout(() => setShowMuzzle(false), 260);
      sound.gunshot();
      shakeScreen();

      const newHits = tgt.hits + 1;
      const dies = newHits >= MAX_HITS || Math.random() < 0.38;

      setTimeout(() => {
        setHasFired(true);
        if (dies) {
          sound.death();
          syncPlayers(prev =>
            prev.map(p =>
              p.username === tgt.username ? { ...p, alive: false, hits: newHits } : p
            )
          );
          setShootResult({
            survived: false,
            msg: "GG تعيش وتأكل غيرها",
            sub: `${tgt.displayName} خرج من اللعبة`,
          });
        } else {
          sound.survive();
          syncPlayers(prev =>
            prev.map(p =>
              p.username === tgt.username ? { ...p, hits: newHits } : p
            )
          );
          setShootResult({
            survived: true,
            msg: newHits >= 3 ? "بس بسبع أرواح" : "نجا هالمرة",
            sub: `طلقة ${newHits} من ${MAX_HITS}`,
          });
        }
        // Show result for 5 seconds before returning
        setTimeout(autoReturnToSpin, 5000);
      }, 350);
    }, 5000);
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
    <motion.div
      ref={scope}
      className="min-h-screen gradient-bg relative overflow-hidden flex flex-col"
      dir="rtl"
    >
      {/* White flash on fire */}
      <AnimatePresence>
        {flashScreen && (
          <motion.div key="flash"
            initial={{ opacity: 0.85 }} animate={{ opacity: 0 }} transition={{ duration: 0.1 }}
            className="fixed inset-0 bg-white z-[100] pointer-events-none"
          />
        )}
      </AnimatePresence>

      {/* Background glows */}
      <div className="absolute top-0 right-0 w-[450px] h-[450px] rounded-full opacity-10 pointer-events-none"
        style={{ background: "radial-gradient(circle, #e040fb, transparent)", filter: "blur(80px)" }} />
      <div className="absolute bottom-0 left-0 w-[450px] h-[450px] rounded-full opacity-10 pointer-events-none"
        style={{ background: "radial-gradient(circle, #ff4444, transparent)", filter: "blur(80px)" }} />

      {/* ── HEADER ──────────────────────────────────────────────────────── */}
      <header
        className="flex items-center justify-between px-5 py-3 border-b border-purple-500/20 flex-shrink-0 z-10"
        style={{ background: "rgba(10,5,20,0.92)", backdropFilter: "blur(16px)" }}
      >
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-1.5 text-purple-300/60 hover:text-pink-400 transition-colors text-sm"
        >
          <ArrowRight size={16} /> العودة
        </button>
        <div className="flex items-center gap-3">
          <GunSVG w={34} color="#e040fb" />
          <h1 className="text-xl font-black neon-text-pink">الشخصنة</h1>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${
              twitchConnected
                ? "border-purple-500/40 bg-purple-500/10 text-purple-300"
                : "border-gray-700 text-gray-600"
            }`}
          >
            {twitchConnected ? <Wifi size={11} /> : <WifiOff size={11} />}
            {twitchConnected ? `#${user?.username}` : "جارٍ الاتصال..."}
          </div>
          {user && (
            <button onClick={logout} className="text-purple-400/30 hover:text-red-400 transition-colors">
              خروج
            </button>
          )}
        </div>
      </header>

      {/* ── CONTENT ─────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 relative z-10 overflow-y-auto">
        <AnimatePresence mode="wait">

          {/* ── JOINING ── */}
          {phase === "joining" && (
            <motion.div key="joining"
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
              className="w-full max-w-5xl space-y-5"
            >
              <div className="text-center space-y-3">
                <div
                  className={`inline-flex items-center gap-2 px-5 py-2 rounded-full border ${
                    twitchConnected
                      ? "border-green-500/40 bg-green-500/10 text-green-300"
                      : "border-gray-700 text-gray-500"
                  }`}
                >
                  {twitchConnected ? (
                    <><Wifi size={14} /> #{user?.username} متصل</>
                  ) : (
                    <><WifiOff size={14} /> جارٍ الاتصال...</>
                  )}
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
                    className="mx-auto max-w-xs text-center py-2.5 px-6 rounded-xl bg-green-500/12 border border-green-500/30 text-green-400 font-bold"
                  >
                    {joinMsg} انضم
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

              <div className="flex justify-center">
                <motion.button
                  onClick={handleStartGame}
                  disabled={players.length < 2}
                  whileHover={players.length >= 2 ? { scale: 1.04 } : {}}
                  whileTap={players.length >= 2 ? { scale: 0.97 } : {}}
                  className="flex items-center gap-2 px-8 py-3.5 rounded-xl text-lg font-black disabled:opacity-30"
                  style={{ background: "linear-gradient(135deg, #e040fb, #9c27b0)", boxShadow: "0 0 25px #e040fb30" }}
                >
                  <Play size={20} fill="white" /> ابدأ اللعبة ({players.length})
                </motion.button>
              </div>
            </motion.div>
          )}

          {/* ── SPINNING — wheel only, no bullets/results ── */}
          {phase === "spinning" && (
            <motion.div key="spinning"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="w-full max-w-5xl flex flex-col items-center gap-6"
            >
              <div className="text-center space-y-1">
                <h2 className="text-3xl font-black text-white">
                  {isSpinning ? "العجلة تدور..." : "جاهز"}
                </h2>
                <p className="text-purple-300/40 text-sm">
                  <Users size={12} className="inline ml-1" />
                  {alivePlayers.length} لاعب حي
                </p>
              </div>

              {/* Clean wheel, no bullet badges */}
              <SpinningWheel players={players} wheelDeg={wheelDeg} isSpinning={isSpinning} />

              {!isSpinning && (
                <motion.button
                  onClick={handleSpinWheel}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  whileHover={{ scale: 1.06 }}
                  whileTap={{ scale: 0.95 }}
                  className="flex items-center gap-3 px-10 py-4 rounded-2xl text-2xl font-black"
                  style={{
                    background: "linear-gradient(135deg, #e040fb, #9c27b0)",
                    boxShadow: "0 0 35px #e040fb50",
                  }}
                >
                  <GunSVG w={38} color="white" /> لف العجلة
                </motion.button>
              )}
            </motion.div>
          )}

          {/* ── WAITING TARGET — grid with bullet bars ── */}
          {phase === "waiting_target" && shooter && (
            <motion.div key="waiting"
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
              className="w-full max-w-5xl space-y-5"
            >
              <div className="text-center space-y-4">
                <div className="flex items-center justify-center gap-4 flex-wrap">
                  <div
                    className="relative w-20 h-20 rounded-2xl overflow-hidden border-2 border-yellow-400 flex-shrink-0"
                    style={{ boxShadow: "0 0 22px rgba(255,214,0,0.35)" }}
                  >
                    <img
                      src={shooter.avatar} alt={shooter.displayName}
                      className="w-full h-full object-cover"
                      onError={e => {
                        (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${shooter.username}`;
                      }}
                    />
                  </div>
                  <div className="text-right">
                    <p className="text-purple-300/50 text-sm">دور اللاعب</p>
                    <p className="text-3xl font-black text-yellow-400">{shooter.displayName}</p>
                    <div className="flex items-center gap-2 justify-end mt-1">
                      <GunSVG w={30} color="#c8c8c8" />
                      <span className="text-purple-300/50 text-xs">اختر هدفك</span>
                    </div>
                  </div>
                </div>

                <div className="inline-block px-6 py-3 rounded-2xl border border-orange-500/35 bg-orange-500/08">
                  <p className="text-xl font-black text-orange-200">
                    اكتب <span className="text-yellow-300 font-black">رقم اللاعب</span> في الشات
                  </p>
                  {!shooter.usedRevive && players.some(p => !p.alive && p.revivedCount === 0) && (
                    <p className="text-xs text-green-400/60 mt-1">
                      أو اكتب رقم لاعب خرج لإنعاشه — مرة واحدة فقط
                    </p>
                  )}
                </div>
              </div>

              {/* Player grid — showBullets=true shows hit count bars */}
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
                {players.map(p => (
                  <PlayerCard
                    key={p.username}
                    player={p}
                    isShooter={p.username === shooter.username}
                    showBullets={true}
                  />
                ))}
              </div>
            </motion.div>
          )}

          {/* ── SHOOTING — aiming + result ── */}
          {phase === "shooting" && shooter && target && (
            <motion.div key="shooting"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="w-full max-w-2xl"
            >
              <div
                className="rounded-3xl overflow-hidden"
                style={{
                  border: `1px solid ${
                    hasFired
                      ? shootResult?.survived
                        ? "rgba(34,197,94,0.45)"
                        : "rgba(239,68,68,0.45)"
                      : "rgba(224,64,251,0.35)"
                  }`,
                  background: "linear-gradient(145deg, rgba(12,4,24,0.99), rgba(5,3,20,0.99))",
                  boxShadow: hasFired
                    ? shootResult?.survived
                      ? "0 0 50px rgba(34,197,94,0.18)"
                      : "0 0 50px rgba(239,68,68,0.22)"
                    : "0 0 50px rgba(224,64,251,0.12)",
                }}
              >
                {/* Top accent bar */}
                <div
                  className="h-[2px]"
                  style={{
                    background: hasFired
                      ? isReviveAction
                        ? "linear-gradient(90deg,#22c55e,#16a34a)"
                        : shootResult?.survived
                        ? "linear-gradient(90deg,#00e5ff,#22c55e)"
                        : "linear-gradient(90deg,#e040fb,#ef4444)"
                      : "linear-gradient(90deg,#e040fb60,#ffd60060,#e040fb60)",
                  }}
                />

                {!hasFired ? (
                  /* ── AIMING SCENE (LTR so gun naturally points right toward target) ── */
                  <div className="p-8" dir="ltr">
                    <div className="flex items-center justify-between gap-4">

                      {/* LEFT: Shooter */}
                      <div className="flex flex-col items-center gap-3 flex-1">
                        <motion.div
                          animate={{ x: [0, 3, 0] }}
                          transition={{ repeat: Infinity, duration: 0.55 }}
                          className="w-28 h-28 rounded-2xl overflow-hidden border-2 border-yellow-500"
                          style={{ boxShadow: "0 0 18px rgba(255,214,0,0.25)" }}
                        >
                          <img
                            src={shooter.avatar} alt={shooter.displayName}
                            className="w-full h-full object-cover"
                            onError={e => {
                              (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${shooter.username}`;
                            }}
                          />
                        </motion.div>
                        <p className="text-yellow-400 font-black text-sm">{shooter.displayName}</p>
                        {/* Gun pointing RIGHT toward target */}
                        <div className="relative">
                          <motion.div
                            animate={{ x: [0, 5, 0] }}
                            transition={{ repeat: Infinity, duration: 0.5 }}
                          >
                            <GunSVG w={90} color="#d4d4d4" />
                          </motion.div>
                          {/* Muzzle flash at the RIGHT end */}
                          <MuzzleFlash show={showMuzzle} />
                        </div>
                      </div>

                      {/* CENTER: Countdown */}
                      <div className="flex flex-col items-center justify-center gap-3 flex-shrink-0 px-2">
                        <AnimatePresence mode="wait">
                          <motion.div
                            key={shootCountdown}
                            initial={{ scale: 2.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.2, opacity: 0 }}
                            transition={{ duration: 0.28, ease: "easeOut" }}
                            className="font-black tabular-nums"
                            style={{
                              fontSize: 68,
                              lineHeight: 1,
                              color:
                                shootCountdown === 0
                                  ? "#ef4444"
                                  : shootCountdown === 1
                                  ? "#ff6d00"
                                  : shootCountdown === 2
                                  ? "#ffd600"
                                  : "#ffffff",
                              textShadow:
                                shootCountdown === 0
                                  ? "0 0 30px #ef4444"
                                  : shootCountdown === 1
                                  ? "0 0 20px #ff6d00"
                                  : "0 0 8px rgba(255,255,255,0.4)",
                            }}
                          >
                            {shootCountdown === 0 ? "!" : shootCountdown}
                          </motion.div>
                        </AnimatePresence>
                        {/* Depletion bar */}
                        <motion.div
                          className="w-1.5 rounded-full bg-pink-500/25 origin-bottom"
                          style={{ height: 56 }}
                          animate={{ scaleY: [1, 0] }}
                          transition={{ duration: 5, ease: "linear" }}
                        />
                      </div>

                      {/* RIGHT: Target */}
                      <div className="flex flex-col items-center gap-3 flex-1">
                        <motion.div
                          animate={
                            shootCountdown !== null && shootCountdown <= 2
                              ? { x: [-5, 5, -4, 4, -2, 2, 0] }
                              : { x: [0, -1.5, 1.5, 0] }
                          }
                          transition={{
                            repeat: Infinity,
                            duration: shootCountdown !== null && shootCountdown <= 1 ? 0.18 : 1.2,
                          }}
                          className="w-28 h-28 rounded-2xl overflow-hidden border-2 relative"
                          style={{
                            borderColor: "rgba(239,68,68,0.6)",
                            boxShadow: "0 0 18px rgba(239,68,68,0.28)",
                          }}
                        >
                          <img
                            src={target.avatar} alt={target.displayName}
                            className="w-full h-full object-cover"
                            onError={e => {
                              (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${target.username}`;
                            }}
                          />
                          {/* Crosshair overlay */}
                          <motion.div
                            animate={{ opacity: [0.45, 1, 0.45] }}
                            transition={{ repeat: Infinity, duration: 0.4 }}
                            className="absolute inset-0 flex items-center justify-center"
                            style={{ background: "rgba(239,68,68,0.1)" }}
                          >
                            <div className="relative w-14 h-14">
                              <div className="absolute inset-0 rounded-full border-2 border-red-500/70" />
                              <div
                                className="absolute inset-0 rounded-full border border-red-500/35"
                                style={{ margin: 5 }}
                              />
                              <div className="absolute top-1/2 left-0 right-0 h-px bg-red-500/55" />
                              <div className="absolute left-1/2 top-0 bottom-0 w-px bg-red-500/55" />
                            </div>
                          </motion.div>
                          {/* Number */}
                          <div className="absolute top-1 left-1 w-6 h-6 rounded-full bg-red-600 text-white font-black text-xs flex items-center justify-center border-2 border-black">
                            {target.number}
                          </div>
                        </motion.div>
                        <p className="text-red-400 font-black text-sm">{target.displayName}</p>
                        <p className="text-purple-400/35 text-xs">هدف</p>
                      </div>

                    </div>
                  </div>
                ) : (
                  /* ── RESULT ── */
                  <div className="p-10 text-center space-y-4" dir="rtl">
                    {isReviveAction ? (
                      <>
                        <div className="w-16 h-16 rounded-full border-2 border-green-500 bg-green-500/12 flex items-center justify-center mx-auto mb-4">
                          <div className="text-green-400 font-black text-3xl leading-none">+</div>
                        </div>
                        <h3 className="text-3xl font-black text-green-400">{shootResult?.msg}</h3>
                        <p className="text-green-400/45 text-sm">{shootResult?.sub}</p>
                      </>
                    ) : shootResult?.survived ? (
                      <>
                        <div className="w-16 h-16 rounded-full border-2 border-cyan-500 bg-cyan-500/10 flex items-center justify-center mx-auto mb-4">
                          <div className="w-6 h-6 rounded-full border-2 border-cyan-400" />
                        </div>
                        <h3 className="text-3xl font-black text-cyan-300">{shootResult?.msg}</h3>
                        <p className="text-purple-400/45 text-sm">{shootResult?.sub}</p>
                        <div className="w-28 h-28 rounded-2xl overflow-hidden border border-cyan-500/30 mx-auto">
                          <img
                            src={target.avatar} alt={target.displayName}
                            className="w-full h-full object-cover"
                            onError={e => {
                              (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${target.username}`;
                            }}
                          />
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="w-16 h-16 rounded-full border-2 border-red-700 bg-red-900/18 flex items-center justify-center mx-auto mb-4">
                          <div className="relative w-8 h-8 flex items-center justify-center">
                            <div className="absolute w-7 h-0.5 bg-red-500 rotate-45" />
                            <div className="absolute w-7 h-0.5 bg-red-500 -rotate-45" />
                          </div>
                        </div>
                        <h3 className="text-3xl font-black text-red-400">{shootResult?.msg}</h3>
                        <p className="text-purple-400/45 text-sm">{shootResult?.sub}</p>
                        <div className="w-28 h-28 rounded-2xl overflow-hidden border border-red-900/40 mx-auto relative">
                          <img
                            src={target.avatar} alt={target.displayName}
                            className="w-full h-full object-cover opacity-30"
                            onError={e => {
                              (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${target.username}`;
                            }}
                          />
                          <div className="absolute inset-0 bg-red-950/65 flex items-center justify-center">
                            <div className="relative w-10 h-10 flex items-center justify-center">
                              <div className="absolute w-9 h-0.5 bg-red-600 rotate-45" />
                              <div className="absolute w-9 h-0.5 bg-red-600 -rotate-45" />
                            </div>
                          </div>
                        </div>
                      </>
                    )}
                    <p className="text-purple-500/28 text-xs pt-2 animate-pulse">
                      يرجع للروليت تلقائياً...
                    </p>
                  </div>
                )}
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
                <motion.div
                  animate={{ y: [0, -12, 0] }}
                  transition={{ repeat: Infinity, duration: 2.2 }}
                  className="relative w-44 h-44 rounded-3xl overflow-hidden border-4 border-yellow-400 mx-auto"
                  style={{ boxShadow: "0 0 60px rgba(255,214,0,0.55)" }}
                >
                  <img
                    src={winner.avatar} alt={winner.displayName}
                    className="w-full h-full object-cover"
                    onError={e => {
                      (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${winner.username}`;
                    }}
                  />
                  <div
                    className="absolute bottom-0 inset-x-0 py-1 text-center text-xs font-black text-yellow-300"
                    style={{ background: "rgba(0,0,0,0.72)" }}
                  >
                    البطل
                  </div>
                </motion.div>
              )}
              <div>
                <h2 className="text-5xl sm:text-6xl font-black neon-text-pink mt-1">
                  {winner?.displayName ?? "لا أحد"}
                </h2>
                <p className="text-yellow-400/75 text-xl mt-2">آخر من بقي</p>
              </div>
              <div className="flex gap-3 justify-center">
                <motion.button
                  onClick={resetGame}
                  whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
                  className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-base"
                  style={{ background: "#e040fb16", border: "1px solid #e040fb40", color: "#e040fb" }}
                >
                  <RefreshCw size={16} /> جولة جديدة
                </motion.button>
                <button
                  onClick={() => navigate("/")}
                  className="px-6 py-3 rounded-xl font-bold text-base border border-gray-700/50 text-gray-500 hover:text-red-400 hover:border-red-500/40 transition-all"
                >
                  الرئيسية
                </button>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>

      {/* Status bar */}
      {phase !== "joining" && phase !== "game_over" && (
        <div
          className="flex-shrink-0 border-t border-purple-500/15 px-5 py-2 flex items-center justify-between text-xs z-10"
          style={{ background: "rgba(8,4,16,0.88)" }}
        >
          <span className="flex items-center gap-1.5 text-purple-400/40">
            <Users size={11} />
            {alivePlayers.length} حي · {players.filter(p => !p.alive).length} خرج
          </span>
          <div className={`flex items-center gap-1.5 ${twitchConnected ? "text-purple-400/40" : "text-gray-700"}`}>
            <Tv2 size={11} /> {twitchConnected ? `#${user?.username}` : "غير متصل"}
          </div>
        </div>
      )}
    </motion.div>
  );
}
