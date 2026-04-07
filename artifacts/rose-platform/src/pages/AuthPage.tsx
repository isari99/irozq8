import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { User, Lock, LogIn, UserPlus } from "lucide-react";

export default function AuthPage() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "login") {
        await login(username, password);
      } else {
        await register(username, password);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen gradient-bg relative overflow-hidden flex items-center justify-center" dir="rtl">

      {/* Background glows */}
      <div className="absolute top-[-200px] right-[-200px] w-[500px] h-[500px] rounded-full opacity-15"
        style={{ background: "radial-gradient(circle, #e040fb, transparent)" }} />
      <div className="absolute bottom-[-200px] left-[-200px] w-[500px] h-[500px] rounded-full opacity-15"
        style={{ background: "radial-gradient(circle, #00e5ff, transparent)" }} />

      {/* Particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(15)].map((_, i) => (
          <motion.div key={i} className="absolute rounded-full"
            style={{
              width: Math.random() * 3 + 1, height: Math.random() * 3 + 1,
              background: i % 2 === 0 ? "#e040fb" : "#00e5ff",
              left: `${Math.random() * 100}%`, top: `${Math.random() * 100}%`,
            }}
            animate={{ opacity: [0.2, 0.8, 0.2] }}
            transition={{ duration: Math.random() * 3 + 2, repeat: Infinity, delay: Math.random() * 2 }}
          />
        ))}
      </div>

      {/* ── Login card ── */}
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 30 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="relative z-10 w-full max-w-sm mx-4"
      >
        <div className="rounded-3xl border border-purple-500/30 overflow-hidden"
          style={{ background: "linear-gradient(160deg, rgba(26,10,46,0.97), rgba(10,18,46,0.97))" }}>

          {/* ── Card header: animated face + title ── */}
          <div className="relative flex flex-col items-center pt-8 pb-6 px-6"
            style={{ borderBottom: "1px solid rgba(139,92,246,0.2)" }}>

            {/* Background glow behind face */}
            <div className="absolute inset-0 pointer-events-none"
              style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(224,64,251,0.12) 0%, transparent 70%)" }} />

            {/* Animated face */}
            <motion.div
              animate={{ y: [0, -5, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              className="relative mb-4">

              {/* Outer glow */}
              <div className="absolute inset-0 rounded-full blur-2xl opacity-60"
                style={{ background: "radial-gradient(circle, #e040fb80, transparent)", transform: "scale(1.5)" }} />

              {/* Rotating ring */}
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
                className="absolute rounded-full"
                style={{ inset: -4 }}>
                <div className="w-full h-full rounded-full"
                  style={{
                    background: "linear-gradient(135deg, #e040fb, transparent, #00e5ff, transparent, #e040fb)",
                    mask: "radial-gradient(farthest-side, transparent calc(100% - 2px), white calc(100% - 2px))",
                    WebkitMask: "radial-gradient(farthest-side, transparent calc(100% - 2px), white calc(100% - 2px))",
                  }} />
              </motion.div>

              {/* Face video */}
              <div className="relative rounded-full overflow-hidden"
                style={{
                  width: 96, height: 96,
                  border: "2px solid rgba(224,64,251,0.6)",
                  boxShadow: "0 0 24px rgba(224,64,251,0.5), 0 0 50px rgba(224,64,251,0.2)",
                }}>
                <video src="/rose-face.mp4"
                  autoPlay loop muted playsInline
                  className="w-full h-full object-cover"
                  style={{ objectPosition: "center top" }} />
              </div>
            </motion.div>

            <h1 className="text-3xl font-black neon-text-pink" style={{ fontFamily: "'Cairo', sans-serif" }}>روز</h1>
            <p className="text-purple-300/55 text-xs mt-1" style={{ fontFamily: "'Cairo', sans-serif" }}>
              منصة ألعاب البث التفاعلي
            </p>
          </div>

          {/* ── Form ── */}
          <div className="px-8 py-6">

            {/* Tab switcher */}
            <div className="grid grid-cols-2 gap-2 mb-6 p-1 rounded-xl" style={{ background: "#0a0a1a" }}>
              {[{ key: "login", label: "تسجيل الدخول", Icon: LogIn },
                { key: "register", label: "حساب جديد", Icon: UserPlus }].map(({ key, label, Icon }) => (
                <button
                  key={key}
                  onClick={() => { setMode(key as any); setError(""); }}
                  className="flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold transition-all"
                  style={{
                    background: mode === key ? "#e040fb20" : "transparent",
                    border: mode === key ? "1px solid #e040fb50" : "1px solid transparent",
                    color: mode === key ? "#e040fb" : "#9b59b6",
                    fontFamily: "'Cairo', sans-serif",
                  }}>
                  <Icon size={15} />{label}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="relative">
                <User size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-purple-400" />
                <input value={username} onChange={e => setUsername(e.target.value)}
                  placeholder="اسم المستخدم"
                  className="w-full pr-9 pl-4 py-3 rounded-xl bg-black/30 border border-purple-500/30 text-white placeholder-purple-400/40 font-medium focus:outline-none focus:border-pink-400/60 transition-colors text-sm"
                  style={{ fontFamily: "'Cairo', sans-serif" }}
                  required autoComplete="username" />
              </div>

              <div className="relative">
                <Lock size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-purple-400" />
                <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="كلمة المرور"
                  className="w-full pr-9 pl-4 py-3 rounded-xl bg-black/30 border border-purple-500/30 text-white placeholder-purple-400/40 font-medium focus:outline-none focus:border-pink-400/60 transition-colors text-sm"
                  style={{ fontFamily: "'Cairo', sans-serif" }}
                  required autoComplete={mode === "register" ? "new-password" : "current-password"} />
              </div>

              <AnimatePresence>
                {error && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                    className="p-3 rounded-xl text-sm text-red-300 border border-red-500/30 bg-red-500/10"
                    style={{ fontFamily: "'Cairo', sans-serif" }}>
                    {error}
                  </motion.div>
                )}
              </AnimatePresence>

              <motion.button type="submit" disabled={loading}
                whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                className="w-full py-3.5 rounded-xl text-base font-black btn-shimmer disabled:opacity-50 transition-all"
                style={{
                  background: "linear-gradient(135deg, #e040fb, #9c27b0)",
                  boxShadow: "0 0 25px #e040fb40",
                  fontFamily: "'Cairo', sans-serif",
                }}>
                {loading ? "جارٍ التحميل..." : mode === "login" ? "دخول" : "إنشاء حساب"}
              </motion.button>
            </form>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
