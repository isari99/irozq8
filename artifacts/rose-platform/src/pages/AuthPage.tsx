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
          <motion.div
            key={i}
            className="absolute rounded-full"
            style={{
              width: Math.random() * 3 + 1,
              height: Math.random() * 3 + 1,
              background: i % 2 === 0 ? "#e040fb" : "#00e5ff",
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
            }}
            animate={{ opacity: [0.2, 0.8, 0.2] }}
            transition={{ duration: Math.random() * 3 + 2, repeat: Infinity, delay: Math.random() * 2 }}
          />
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 30 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="relative z-10 w-full max-w-sm mx-4"
      >
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <motion.div
            animate={{ y: [0, -8, 0] }}
            transition={{ duration: 3, repeat: Infinity }}
            className="relative mb-4"
          >
            <div className="absolute inset-0 rounded-full blur-2xl opacity-50"
              style={{ background: "radial-gradient(circle, #e040fb, #00e5ff)", transform: "scale(1.3)" }} />
            <img
              src="/rose-logo.png"
              alt="روز"
              className="relative w-24 h-24 rounded-full object-cover border-2 border-pink-400/50"
              style={{ filter: "drop-shadow(0 0 15px #e040fb)" }}
            />
          </motion.div>
          <h1 className="text-4xl font-black neon-text-pink">روز</h1>
          <p className="text-purple-300/60 text-sm mt-1">منصة ألعاب البث التفاعلي</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-purple-500/30 p-8"
          style={{ background: "linear-gradient(135deg, rgba(26,10,46,0.95), rgba(10,26,46,0.95))" }}>

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
                }}
              >
                <Icon size={16} />
                {label}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Username */}
            <div className="relative">
              <User size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-purple-400" />
              <input
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="اسم المستخدم"
                className="w-full pr-9 pl-4 py-3 rounded-xl bg-black/30 border border-purple-500/30 text-white placeholder-purple-400/40 font-medium focus:outline-none focus:border-pink-400/60 transition-colors"
                required
                autoComplete="username"
              />
            </div>

            {/* Password */}
            <div className="relative">
              <Lock size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-purple-400" />
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="كلمة المرور"
                className="w-full pr-9 pl-4 py-3 rounded-xl bg-black/30 border border-purple-500/30 text-white placeholder-purple-400/40 font-medium focus:outline-none focus:border-pink-400/60 transition-colors"
                required
                autoComplete={mode === "register" ? "new-password" : "current-password"}
              />
            </div>

            {/* Error */}
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="p-3 rounded-xl text-sm text-red-300 border border-red-500/30 bg-red-500/10"
                >
                  {error}
                </motion.div>
              )}
            </AnimatePresence>

            <motion.button
              type="submit"
              disabled={loading}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="w-full py-3.5 rounded-xl text-lg font-black btn-shimmer disabled:opacity-50 transition-all"
              style={{
                background: "linear-gradient(135deg, #e040fb, #9c27b0)",
                boxShadow: "0 0 25px #e040fb40",
              }}
            >
              {loading ? "جارٍ التحميل..." : mode === "login" ? "دخول" : "إنشاء حساب"}
            </motion.button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
