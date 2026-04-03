import { useLocation } from "wouter";
import { motion } from "framer-motion";

export default function NotFound() {
  const [, navigate] = useLocation();
  return (
    <div className="min-h-screen gradient-bg flex flex-col items-center justify-center gap-6" dir="rtl">
      <motion.div
        animate={{ y: [0, -10, 0] }}
        transition={{ repeat: Infinity, duration: 3 }}
        className="text-8xl"
      >
        🌹
      </motion.div>
      <h1 className="text-4xl font-black neon-text-pink">الصفحة غير موجودة</h1>
      <button
        onClick={() => navigate("/")}
        className="px-8 py-3 rounded-xl font-bold btn-shimmer"
        style={{ background: "#e040fb20", border: "1px solid #e040fb50", color: "#e040fb" }}
      >
        العودة للرئيسية
      </button>
    </div>
  );
}
