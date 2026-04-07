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
    <div
      className="min-h-screen gradient-bg relative overflow-hidden flex items-center justify-center"
      dir="rtl"
    >
      {/* Background glows */}
      <div
        className="absolute top-[-200px] right-[-200px] w-[500px] h-[500px] rounded-full opacity-15"
        style={{ background: "radial-gradient(circle, #e040fb, transparent)" }}
      />
      <div
        className="absolute bottom-[-200px] left-[-200px] w-[500px] h-[500px] rounded-full opacity-15"
        style={{ background: "radial-gradient(circle, #00e5ff, transparent)" }}
      />

      {/* Floating particles */}
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
            transition={{
              duration: Math.random() * 3 + 2,
              repeat: Infinity,
              delay: Math.random() * 2,
            }}
          />
        ))}
      </div>

      {/* ── Main card (two-column: logo left | form right) ── */}
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 30 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="relative z-10 w-full mx-4 flex overflow-hidden rounded-3xl"
        style={{
          maxWidth: 760,
          minHeight: 480,
          border: "1px solid rgba(139,92,246,0.3)",
          background: "linear-gradient(160deg, rgba(26,10,46,0.97), rgba(10,18,46,0.97))",
          boxShadow: "0 0 60px rgba(224,64,251,0.12), 0 0 120px rgba(0,229,255,0.06)",
          direction: "ltr",
        }}
      >
        {/* ════ LEFT PANEL — animated logo ════ */}
        <div
          className="relative flex-shrink-0 overflow-hidden"
          style={{ width: "42%", minHeight: 480 }}
        >
          {/* Video fills container — landscape cropped to portrait via object-cover */}
          <video
            src="/rose-logo-anim.mp4"
            autoPlay
            loop
            muted
            playsInline
            className="absolute inset-0 w-full h-full object-cover"
            style={{ objectPosition: "55% top" }}
          />

          {/* Right-edge gradient fade into form */}
          <div
            className="absolute inset-y-0 right-0 w-16 pointer-events-none"
            style={{
              background:
                "linear-gradient(to right, transparent, rgba(18,8,36,0.98))",
            }}
          />

          {/* Bottom fade */}
          <div
            className="absolute bottom-0 left-0 right-0 h-24 pointer-events-none"
            style={{
              background:
                "linear-gradient(to top, rgba(10,18,46,0.9), transparent)",
            }}
          />

          {/* Neon left border */}
          <div
            className="absolute left-0 top-0 bottom-0 w-px pointer-events-none"
            style={{
              background:
                "linear-gradient(to bottom, transparent, #e040fb60, #00e5ff40, #e040fb60, transparent)",
            }}
          />

          {/* "روز" label at the bottom of the logo panel */}
          <div className="absolute bottom-6 left-0 right-0 flex flex-col items-center pointer-events-none">
            <span
              className="text-2xl font-black neon-text-pink"
              style={{ fontFamily: "'Cairo', sans-serif", letterSpacing: "0.06em" }}
            >
              روز
            </span>
            <span
              className="text-purple-300/50 text-xs mt-0.5"
              style={{ fontFamily: "'Cairo', sans-serif" }}
            >
              منصة ألعاب البث التفاعلي
            </span>
          </div>
        </div>

        {/* ════ RIGHT PANEL — form ════ */}
        <div className="flex-1 flex flex-col justify-center px-8 py-10" style={{ direction: "rtl" }}>

          {/* Tab switcher */}
          <div
            className="grid grid-cols-2 gap-2 mb-7 p-1 rounded-xl"
            style={{ background: "#0a0a1a" }}
          >
            {[
              { key: "login", label: "تسجيل الدخول", Icon: LogIn },
              { key: "register", label: "حساب جديد", Icon: UserPlus },
            ].map(({ key, label, Icon }) => (
              <button
                key={key}
                onClick={() => { setMode(key as any); setError(""); }}
                className="flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold transition-all"
                style={{
                  background: mode === key ? "#e040fb20" : "transparent",
                  border:
                    mode === key
                      ? "1px solid #e040fb50"
                      : "1px solid transparent",
                  color: mode === key ? "#e040fb" : "#9b59b6",
                  fontFamily: "'Cairo', sans-serif",
                }}
              >
                <Icon size={14} />
                {label}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Username */}
            <div className="relative">
              <User
                size={15}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-purple-400"
              />
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="اسم المستخدم"
                className="w-full pr-9 pl-4 py-3 rounded-xl bg-black/30 border border-purple-500/30 text-white placeholder-purple-400/40 font-medium focus:outline-none focus:border-pink-400/60 transition-colors text-sm"
                style={{ fontFamily: "'Cairo', sans-serif" }}
                required
                autoComplete="username"
              />
            </div>

            {/* Password */}
            <div className="relative">
              <Lock
                size={15}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-purple-400"
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="كلمة المرور"
                className="w-full pr-9 pl-4 py-3 rounded-xl bg-black/30 border border-purple-500/30 text-white placeholder-purple-400/40 font-medium focus:outline-none focus:border-pink-400/60 transition-colors text-sm"
                style={{ fontFamily: "'Cairo', sans-serif" }}
                required
                autoComplete={
                  mode === "register" ? "new-password" : "current-password"
                }
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
                  style={{ fontFamily: "'Cairo', sans-serif" }}
                >
                  {error}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Submit */}
            <motion.button
              type="submit"
              disabled={loading}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="w-full py-3.5 rounded-xl text-base font-black btn-shimmer disabled:opacity-50 transition-all mt-2"
              style={{
                background: "linear-gradient(135deg, #e040fb, #9c27b0)",
                boxShadow: "0 0 25px #e040fb40",
                fontFamily: "'Cairo', sans-serif",
              }}
            >
              {loading
                ? "جارٍ التحميل..."
                : mode === "login"
                ? "دخول"
                : "إنشاء حساب"}
            </motion.button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
