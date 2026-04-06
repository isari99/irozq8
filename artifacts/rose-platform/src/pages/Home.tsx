import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Music, Grid3X3, CircleDot, HelpCircle, LogOut } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

const games = [
  {
    id: "quiz",
    title: "لعبة الأسئلة",
    description: "",
    icon: HelpCircle,
    neonColor: "#ffd600",
    path: "/quiz",
    emoji: "❓",
    borderColor: "border-yellow-500/40",
    color: "",
    glowColor: "",
    heroImage: "/quiz-hero.png",
  },
  {
    id: "song-game",
    title: "لعبة الأغاني",
    description: "خمّن الأغنية وفوز بالنقاط لفريقك",
    icon: Music,
    color: "from-pink-600 to-purple-700",
    borderColor: "border-pink-500/40",
    glowColor: "shadow-pink-500/30",
    neonColor: "#e040fb",
    path: "/song-game",
    emoji: "🎵",
    heroImage: "/song-hero.jpg",
  },
  {
    id: "xo-game",
    title: "لعبة XO",
    description: "",
    icon: Grid3X3,
    color: "from-cyan-600 to-blue-700",
    borderColor: "border-cyan-500/40",
    glowColor: "shadow-cyan-500/30",
    neonColor: "#00e5ff",
    path: "/xo-game",
    emoji: "❌",
    heroImage: "/xo-hero.jpg",
  },
  {
    id: "wheel-game",
    title: "الشخصنة",
    description: "",
    icon: CircleDot,
    color: "from-orange-500 to-red-600",
    borderColor: "border-pink-500/50",
    glowColor: "shadow-pink-500/30",
    neonColor: "#e040fb",
    path: "/wheel-game",
    emoji: "🔫",
    heroImage: "/shakhsana.png",
  },
  {
    id: "fruits-game",
    title: "حرب الفواكه",
    description: "صوّت لإقصاء الفواكه وافز باللعبة!",
    icon: CircleDot,
    color: "from-green-600 to-lime-600",
    borderColor: "border-green-500/40",
    glowColor: "shadow-green-500/30",
    neonColor: "#22c55e",
    path: "/fruits-game",
    emoji: "🍉",
    heroImage: "/fruits-hero.png",
  },
  {
    id: "imposter-game",
    title: "لعبة الكذابين",
    description: "اكتشف الكذاب قبل أن يكتشفك - لعبة جماعية أونلاين",
    icon: CircleDot,
    color: "from-red-600 to-pink-700",
    borderColor: "border-red-500/40",
    glowColor: "shadow-red-500/30",
    neonColor: "#ef4444",
    path: "/imposter-game",
    emoji: "🕵️",
    heroImage: "/imposter-hero.png",
  },
  {
    id: "snakes-game",
    title: "السلم والثعبان",
    description: "العب عبر الشات - اكتب join للانضمام و roll لرمي النرد",
    icon: CircleDot,
    color: "from-green-600 to-emerald-700",
    borderColor: "border-green-500/40",
    glowColor: "shadow-green-500/30",
    neonColor: "#22c55e",
    path: "/snakes-game",
    emoji: "🐍",
    heroImage: "/snakes-hero.png",
  },
];

export default function Home() {
  const [, navigate] = useLocation();
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen gradient-bg relative overflow-hidden" dir="rtl">
      {/* Background particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(20)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute rounded-full"
            style={{
              width: Math.random() * 4 + 1,
              height: Math.random() * 4 + 1,
              background: i % 2 === 0 ? "#e040fb" : "#00e5ff",
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
            }}
            animate={{
              opacity: [0.2, 0.8, 0.2],
              scale: [1, 1.5, 1],
            }}
            transition={{
              duration: Math.random() * 3 + 2,
              repeat: Infinity,
              delay: Math.random() * 2,
            }}
          />
        ))}
      </div>

      {/* Decorative gradient circles */}
      <div className="absolute top-[-200px] right-[-200px] w-[500px] h-[500px] rounded-full opacity-10"
        style={{ background: "radial-gradient(circle, #e040fb, transparent)" }} />
      <div className="absolute bottom-[-200px] left-[-200px] w-[500px] h-[500px] rounded-full opacity-10"
        style={{ background: "radial-gradient(circle, #00e5ff, transparent)" }} />

      <div className="relative z-10 flex flex-col items-center min-h-screen px-4 py-12">
        {/* User bar */}
        {user && (
          <div className="absolute top-4 left-4 flex items-center gap-3">
            <span className="text-sm text-purple-300/70">مرحباً، <span className="text-pink-400 font-bold">{user.username}</span></span>
            <button
              onClick={logout}
              className="flex items-center gap-1.5 text-xs text-purple-400/60 hover:text-red-400 transition-colors px-2 py-1 rounded-lg border border-purple-500/20 hover:border-red-400/30"
            >
              <LogOut size={12} /> خروج
            </button>
          </div>
        )}

        {/* Logo section */}
        <motion.div
          initial={{ opacity: 0, y: -50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="flex flex-col items-center mb-16"
        >
          <motion.div
            className="relative mb-6"
            animate={{ y: [0, -10, 0] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          >
            <div className="absolute inset-0 rounded-full blur-2xl opacity-40"
              style={{ background: "radial-gradient(circle, #e040fb, #00e5ff)", transform: "scale(1.2)" }} />
            <img
              src="/rose-logo.png"
              alt="روز"
              className="relative w-32 h-32 rounded-full object-cover border-2 border-pink-400/50 animate-logo-glow"
              style={{ filter: "drop-shadow(0 0 20px #e040fb) drop-shadow(0 0 40px #00e5ff40)" }}
            />
          </motion.div>

          <motion.h1
            className="text-6xl font-black mb-3 neon-text-pink"
            style={{ fontFamily: "'Cairo', sans-serif", letterSpacing: "0.05em" }}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3, duration: 0.6 }}
          >
            روز
          </motion.h1>
          <motion.p
            className="text-lg text-purple-300/80 text-center max-w-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.6 }}
          >
            منصة الألعاب التفاعلية للبث المباشر
          </motion.p>

          {/* Divider */}
          <motion.div
            className="mt-6 w-64 h-px"
            style={{ background: "linear-gradient(90deg, transparent, #e040fb, #00e5ff, transparent)" }}
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ delay: 0.7, duration: 0.8 }}
          />
        </motion.div>

        {/* Game cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-5xl">
          {games.map((game, index) => {
            const heroImage = (game as any).heroImage as string | undefined;

            if (heroImage) {
              /* ── Hero card: image fills card, button sits below ── */
              return (
                <motion.div key={game.id}
                  initial={{ opacity: 0, y: 60 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 + index * 0.15, duration: 0.6, ease: "easeOut" }}
                  className="flex flex-col gap-3">
                  {/* Card — pure image, no button inside */}
                  <motion.div
                    onClick={() => navigate(game.path)}
                    className={`game-card cursor-pointer rounded-2xl border ${game.borderColor} relative overflow-hidden group`}
                    style={{ boxShadow: `0 8px 32px ${game.neonColor}20`, aspectRatio: "1 / 1" }}
                    whileHover={{ scale: 1.03, y: -6 }} whileTap={{ scale: 0.97 }}>
                    <img src={heroImage} alt={game.title}
                      className="absolute inset-0 w-full h-full object-cover"
                      style={{ objectPosition: "center center" }} />
                    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-2xl"
                      style={{ boxShadow: `inset 0 0 50px ${game.neonColor}25` }} />
                  </motion.div>
                  {/* Button — completely outside and below the card */}
                  <motion.button
                    onClick={() => navigate(game.path)}
                    className="w-full py-3 rounded-xl text-base font-black btn-shimmer"
                    style={{
                      background: `linear-gradient(135deg, ${game.neonColor}40, ${game.neonColor}20)`,
                      border: `1px solid ${game.neonColor}60`,
                      color: "#fff",
                      boxShadow: `0 4px 20px ${game.neonColor}25`,
                    }}
                    whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
                    العب الآن
                  </motion.button>
                  {/* Game title below button */}
                  <p className="text-center text-sm font-black"
                    style={{ color: game.neonColor, textShadow: `0 0 12px ${game.neonColor}60` }}>
                    {game.title}
                  </p>
                </motion.div>
              );
            }

            return (
              <motion.div
                key={game.id}
                initial={{ opacity: 0, y: 60 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 + index * 0.15, duration: 0.6, ease: "easeOut" }}
                onClick={() => navigate(game.path)}
                className={`game-card cursor-pointer rounded-2xl border ${game.borderColor} relative overflow-hidden group p-6 flex flex-col items-center gap-4`}
                style={{
                  background: "linear-gradient(135deg, rgba(26,10,46,0.9), rgba(10,26,46,0.9))",
                  boxShadow: `0 8px 32px ${game.neonColor}20`,
                }}
                whileHover={{ scale: 1.04, y: -8 }}
                whileTap={{ scale: 0.97 }}
              >
                {(
                  /* ── Standard card ── */
                  <>
                    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-2xl"
                      style={{ background: `radial-gradient(circle at center, ${game.neonColor}15, transparent 70%)` }} />
                    <div className="absolute top-0 left-0 right-0 h-[2px] rounded-t-2xl"
                      style={{ background: `linear-gradient(90deg, transparent, ${game.neonColor}, transparent)` }} />
                    <motion.div className="relative"
                      animate={{ y: [0, -5, 0] }}
                      transition={{ duration: 3, repeat: Infinity, delay: index * 0.5 }}>
                      <div className="absolute inset-0 blur-xl opacity-60 rounded-full" style={{ background: game.neonColor }} />
                      <img src="/rose-logo.png" alt="روز" className="relative w-20 h-20 rounded-full object-cover border-2"
                        style={{ borderColor: `${game.neonColor}60`, filter: `drop-shadow(0 0 10px ${game.neonColor})` }} />
                      <div className="absolute -top-1 -right-1 text-2xl">{game.emoji}</div>
                    </motion.div>
                    <div className="text-center z-10">
                      <h3 className="text-2xl font-bold mb-2"
                        style={{ color: game.neonColor, textShadow: `0 0 15px ${game.neonColor}` }}>
                        {game.title}
                      </h3>
                      <p className="text-purple-300/70 text-sm leading-relaxed">{game.description}</p>
                    </div>
                    <motion.div className="mt-2 px-8 py-2.5 rounded-xl text-sm font-bold z-10 btn-shimmer"
                      style={{
                        background: `linear-gradient(135deg, ${game.neonColor}30, ${game.neonColor}10)`,
                        border: `1px solid ${game.neonColor}50`,
                        color: game.neonColor,
                      }}
                      whileHover={{ scale: 1.05 }}>
                      العب الآن
                    </motion.div>
                  </>
                )}
              </motion.div>
            );
          })}
        </div>

        {/* Footer */}
        <motion.p
          className="mt-16 text-purple-400/40 text-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2 }}
        >
          Rose Platform — منصة ألعاب البث التفاعلي
        </motion.p>
      </div>
    </div>
  );
}
