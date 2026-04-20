import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight, Play, Pause, Trophy, Music2, SkipForward, Zap,
  RotateCcw, RefreshCw, Eye, Volume2, VolumeX, Timer, Star, Users,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
type Phase = "settings" | "control" | "play" | "ended";

interface Clip { start: number; end: number; }

interface Song {
  id: number;
  title: string;
  artist: string;
  youtubeId: string;
  clips: Clip[];
}

interface GameClip { song: Song; clip: Clip; }

function makeClips(duration: number, count = 14): Clip[] {
  const len = 18;
  const skip = 12;
  const usable = duration - skip - 15;
  const step = Math.floor(usable / count);
  return Array.from({ length: count }, (_, i) => {
    const start = skip + i * step;
    return { start, end: Math.min(start + len, duration - 5) };
  });
}

// ─── Smart shuffle: no repeats, artist quota cap, no consecutive same artist ──
function buildGameQueue(songs: Song[], count: number): GameClip[] {
  // 1. Group by artist and shuffle each group internally
  const byArtist = new Map<string, Song[]>();
  for (const song of songs) {
    if (!byArtist.has(song.artist)) byArtist.set(song.artist, []);
    byArtist.get(song.artist)!.push(song);
  }
  for (const [, g] of byArtist) {
    for (let i = g.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [g[i], g[j]] = [g[j], g[i]];
    }
  }

  // 2. Find minimum per-artist cap so total available >= count
  //    This prevents one artist from dominating (e.g. نانسي عجرم has 37 songs)
  let cap = 1;
  while (true) {
    const total = [...byArtist.values()].reduce((s, g) => s + Math.min(g.length, cap), 0);
    if (total >= count || cap > 100) break;
    cap++;
  }

  // 3. Build capped bucket from all artists
  const bucket: Song[] = [];
  for (const [, g] of byArtist) bucket.push(...g.slice(0, cap));

  // 4. Shuffle the bucket
  for (let i = bucket.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [bucket[i], bucket[j]] = [bucket[j], bucket[i]];
  }

  // 5. Take exactly the number of songs needed (no song repeats)
  const selected = bucket.slice(0, Math.min(count, bucket.length));

  // 6. Greedy rearrange to minimize consecutive same-artist songs
  //    Always pick from different-artist candidates first;
  //    fall back to same artist only when no other choice remains
  const arranged: Song[] = [];
  const remaining = [...selected];
  while (remaining.length > 0) {
    const lastArtist = arranged.length > 0 ? arranged[arranged.length - 1].artist : null;
    const candidates = remaining.filter(s => s.artist !== lastArtist);
    const pickFrom = candidates.length > 0 ? candidates : remaining;
    const idx = Math.floor(Math.random() * pickFrom.length);
    const chosen = pickFrom[idx];
    arranged.push(chosen);
    remaining.splice(remaining.indexOf(chosen), 1);
  }

  // 7. Assign one random clip per song
  return arranged.map(song => ({
    song,
    clip: song.clips[Math.floor(Math.random() * song.clips.length)],
  }));
}

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady?: () => void;
    _ytApiReady?: boolean;
  }
}

// ─── Song bank — all IDs verified via YouTube oEmbed ─────────────────────────
const SONGS: Song[] = [
  // ── خليجي ─────────────────────────────────────────────────────────────────
  { id:  1, title: "يا نور العين",          artist: "مطرف المطرف",    youtubeId: "WlqefHeYYR0", clips: makeClips(253) },
  { id:  2, title: "يا طير خذ قلبي وشل",   artist: "راشد الماجد",    youtubeId: "joevqtOJFes", clips: makeClips(270) },
  { id:  3, title: "ندمان",                  artist: "نبيل شعيل",       youtubeId: "_nSq4Mtlfno", clips: makeClips(260) },
  { id:  4, title: "يا عمري انا",            artist: "فرقة ميامي",      youtubeId: "5Gi9Q9P0bVI", clips: makeClips(248) },
  { id:  5, title: "بشرة خير",               artist: "حسين الجسمي",     youtubeId: "QUBvVTNRp4Q", clips: makeClips(244) },
  // ── عمرو دياب ─────────────────────────────────────────────────────────────
  { id:  6, title: "نور العين",              artist: "عمرو دياب",       youtubeId: "KLJA-srM_yM", clips: makeClips(275) },
  { id:  7, title: "تملى معاك",              artist: "عمرو دياب",       youtubeId: "EgmXTmj62ic", clips: makeClips(265) },
  { id:  8, title: "وغلاوتك",                artist: "عمرو دياب",       youtubeId: "a_vfYHbLr7Y", clips: makeClips(248) },
  { id:  9, title: "قمرين",                  artist: "عمرو دياب",       youtubeId: "z6RC2T3Q7rs", clips: makeClips(255) },
  // ── نانسي عجرم ────────────────────────────────────────────────────────────
  { id: 10, title: "أخاصمك آه",              artist: "نانسي عجرم",      youtubeId: "qzcIKpmEBHo", clips: makeClips(230) },
  { id: 11, title: "يا سلام",                artist: "نانسي عجرم",      youtubeId: "1nlzrBWh0H8", clips: makeClips(218) },
  { id: 12, title: "يا يا سحر عيونه",        artist: "نانسي عجرم",      youtubeId: "HnTWkN79PCo", clips: makeClips(225) },
  { id: 13, title: "لون عيونك",              artist: "نانسي عجرم",      youtubeId: "jEGnvYKH18A", clips: makeClips(233) },
  { id: 14, title: "قول تاني كده",           artist: "نانسي عجرم",      youtubeId: "3ObVN3QQiZ8", clips: makeClips(240) },
  { id: 15, title: "أنا مصري",               artist: "نانسي عجرم",      youtubeId: "i0DPyHIkYGU", clips: makeClips(222) },
  { id: 16, title: "يا طبطب ودلع",           artist: "نانسي عجرم",      youtubeId: "6fCBSQjpH8U", clips: makeClips(228) },
  { id: 17, title: "ابن الجيران",             artist: "نانسي عجرم",      youtubeId: "cnxrq_ZOcoY", clips: makeClips(215) },
  { id: 18, title: "ماشي حدي",               artist: "نانسي عجرم",      youtubeId: "dGxtAViYVnU", clips: makeClips(235) },
  { id: 19, title: "من نظرة",                artist: "نانسي عجرم",      youtubeId: "UFn1-pTQ85s", clips: makeClips(220) },
  { id: 20, title: "مين ده اللي نسيك",       artist: "نانسي عجرم",      youtubeId: "sG33uGCO_eE", clips: makeClips(230) },
  { id: 21, title: "بتفكر في إيه",           artist: "نانسي عجرم",      youtubeId: "ef0nQ_BvAwg", clips: makeClips(218) },
  { id: 22, title: "إنت إيه",                artist: "نانسي عجرم",      youtubeId: "X4ICDHjGImA", clips: makeClips(225) },
  { id: 23, title: "أنا يللي بحبك",          artist: "نانسي عجرم",      youtubeId: "D_hH-bn5dD0", clips: makeClips(232) },
  { id: 24, title: "إحساس جديد",             artist: "نانسي عجرم",      youtubeId: "YRadUqAv7i8", clips: makeClips(228) },
  { id: 25, title: "اللي كان",               artist: "نانسي عجرم",      youtubeId: "c8hVPjZLJlA", clips: makeClips(222) },
  { id: 26, title: "مشتاقة ليك",             artist: "نانسي عجرم",      youtubeId: "IqdyirMu84Y", clips: makeClips(235) },
  { id: 27, title: "لمسة إيد",               artist: "نانسي عجرم",      youtubeId: "eIoFyl6AkkQ", clips: makeClips(228) },
  { id: 28, title: "شيخ الشباب",             artist: "نانسي عجرم",      youtubeId: "vZ0OFwpvIv0", clips: makeClips(240) },
  { id: 29, title: "يا كثر ما قيل",          artist: "نانسي عجرم",      youtubeId: "jcO2JJ61eHU", clips: makeClips(218) },
  { id: 30, title: "وحشاني يا مصر",          artist: "نانسي عجرم",      youtubeId: "DWVaAJ0g0jQ", clips: makeClips(225) },
  { id: 31, title: "سوبر نانسي",             artist: "نانسي عجرم",      youtubeId: "uilYWLa2h9E", clips: makeClips(232) },
  { id: 32, title: "بدك تبقى فيك",           artist: "نانسي عجرم",      youtubeId: "d9x9IVxbgFk", clips: makeClips(228) },
  { id: 33, title: "أعمل عاقلة",             artist: "نانسي عجرم",      youtubeId: "6mWD96Rx5Ds", clips: makeClips(220) },
  { id: 34, title: "ما تيجي هنا",            artist: "نانسي عجرم",      youtubeId: "UBBxGHvjNFM", clips: makeClips(215) },
  { id: 35, title: "حاسة بيك",               artist: "نانسي عجرم",      youtubeId: "bghEyqhcWzA", clips: makeClips(228) },
  { id: 36, title: "ومعاك",                  artist: "نانسي عجرم",      youtubeId: "bytVUsDTqFI", clips: makeClips(232) },
  { id: 37, title: "بدنا نولع الجو",         artist: "نانسي عجرم",      youtubeId: "iOP9PYLICK8", clips: makeClips(220) },
  { id: 38, title: "راجل ابن راجل",          artist: "نانسي عجرم",      youtubeId: "r1VKP1OvifQ", clips: makeClips(225) },
  { id: 39, title: "قلبي يا قلبي",           artist: "نانسي عجرم",      youtubeId: "dNQMH3WVMNs", clips: makeClips(218) },
  { id: 40, title: "يللا",                   artist: "نانسي عجرم",      youtubeId: "jHEYg6VZoOw", clips: makeClips(222) },
  { id: 41, title: "ما تعتذر",               artist: "نانسي عجرم",      youtubeId: "VllbR3q3v1U", clips: makeClips(228) },
  { id: 42, title: "في حاجات",               artist: "نانسي عجرم",      youtubeId: "ozmj375CR3k", clips: makeClips(232) },
  { id: 43, title: "إللي كان ومضى",          artist: "نانسي عجرم",      youtubeId: "A7Iv2FDZFwo", clips: makeClips(225) },
  { id: 44, title: "مشتاق ليك",              artist: "نانسي عجرم",      youtubeId: "EWv3jQnUy5Y", clips: makeClips(218) },
  { id: 45, title: "تيجي ننبسط",             artist: "نانسي عجرم",      youtubeId: "O-QgbPczoqM", clips: makeClips(220) },
  { id: 46, title: "شيل عيونك عني",          artist: "نانسي عجرم",      youtubeId: "153qzppIdds", clips: makeClips(215) },

  // ── عراقي / خليجي جديد ────────────────────────────────────────────────────
  { id: 47, title: "ديرتين وكأنها ديرة",     artist: "لوحة",             youtubeId: "VcfTjLHVFmM", clips: makeClips(250) },
  { id: 48, title: "إذا عندك قلب ثاني",      artist: "قيس هشام",         youtubeId: "F_N1_sp_a3A", clips: makeClips(240) },
  { id: 49, title: "ميت اني",                artist: "صباح محمود",        youtubeId: "iXeRU3F5CK8", clips: makeClips(245) },
  { id: 50, title: "ناري",                   artist: "احمد ستار",         youtubeId: "tIWr1MO3uVo", clips: makeClips(240) },
  { id: 51, title: "هذا دمعك",               artist: "تيسير السفير",      youtubeId: "FDsjIWTzJwE", clips: makeClips(250) },
  { id: 52, title: "تعبني الفراق",           artist: "بسام مهدي",         youtubeId: "JZaF8PO3B0o", clips: makeClips(245) },
  { id: 53, title: "سلم",                    artist: "سامر احمد",         youtubeId: "zNHhi-r3EFA", clips: makeClips(240) },
  { id: 54, title: "عامل ايه في حياتك",      artist: "عامر منيب",         youtubeId: "_NdDVeAXAX0", clips: makeClips(248) },
  { id: 55, title: "الله يسهلك",             artist: "علي صابر",          youtubeId: "Pd4XwhjAwyo", clips: makeClips(242) },
  { id: 56, title: "تعب الشوق",              artist: "جوزيف عطية",        youtubeId: "pDvsyefO1FM", clips: makeClips(250) },
  { id: 57, title: "شمسويلك",                artist: "قيس هشام",          youtubeId: "YGy1lIibTp4", clips: makeClips(238) },
  // ── فضل شاكر ──────────────────────────────────────────────────────────────
  { id: 58, title: "يا غايب",                artist: "فضل شاكر",          youtubeId: "qSil6ttEg30", clips: makeClips(260) },
  { id: 59, title: "وغلبني",                 artist: "فضل شاكر",          youtubeId: "GUYKNXvwHaM", clips: makeClips(258) },
  { id: 60, title: "فين لياليك",             artist: "فضل شاكر",          youtubeId: "z9EdO2xapug", clips: makeClips(252) },
  { id: 61, title: "لو على قلبي",            artist: "فضل شاكر",          youtubeId: "2wZ9OrZyvPo", clips: makeClips(255) },
  { id: 62, title: "كيفك ع فراقي",           artist: "فضل شاكر",          youtubeId: "m5IWI6xFRms", clips: makeClips(248) },
  // ── لبناني / مصري جديد ────────────────────────────────────────────────────
  { id: 63, title: "بعشق روحك",              artist: "مروان خوري",        youtubeId: "0hs8mLODmsc", clips: makeClips(258) },
  { id: 64, title: "قابلتك امتى",            artist: "احمد بتشان",        youtubeId: "Dzbded6Hlb4", clips: makeClips(242) },
  { id: 65, title: "خليني ذكرى",             artist: "وائل جسار",         youtubeId: "J8RtlJIDhdA", clips: makeClips(260) },
  { id: 66, title: "جن جنوني",               artist: "عاصي الحلاني",      youtubeId: "l0kMuiywRDE", clips: makeClips(265) },
  // ── خليجي متنوع ───────────────────────────────────────────────────────────
  { id: 67, title: "شالطاري",                artist: "سلطان خليفه",       youtubeId: "_F8AXTS26Ro", clips: makeClips(245) },
  { id: 68, title: "رفوف الذكريات",          artist: "ماجد المهندس",      youtubeId: "Oci__HXYnOs", clips: makeClips(268) },
  { id: 69, title: "إن خذاك الوقت",          artist: "جابر الكاسر",       youtubeId: "CNK_jmUM_1c", clips: makeClips(252) },
  { id: 70, title: "المحبه",                 artist: "عباس إبراهيم",      youtubeId: "xn4q19AvSU8", clips: makeClips(248) },
  { id: 71, title: "ما أرضى عليه",           artist: "جابر الكاسر",       youtubeId: "6B-1DfS-cMM", clips: makeClips(255) },
  { id: 72, title: "احتاج لك",               artist: "راشد الماجد",       youtubeId: "5JCnfvN2BiY", clips: makeClips(262) },
  { id: 73, title: "جوايا هتعيش",            artist: "رامي صبري",         youtubeId: "LOkzW46zuZc", clips: makeClips(250) },
  { id: 74, title: "جرح الهوى",              artist: "عباس إبراهيم",      youtubeId: "-y3xJgMISzU", clips: makeClips(245) },
  { id: 75, title: "جيت على بالي",           artist: "عامر منيب",         youtubeId: "ZmcmQmsy76s", clips: makeClips(252) },
  { id: 76, title: "انا مصمم",               artist: "بهاء سلطان",        youtubeId: "v0GF5QiaTpU", clips: makeClips(248) },
  { id: 77, title: "كان موضوع",              artist: "تامر عاشور",        youtubeId: "e7QhpEPf0jY", clips: makeClips(258) },
  { id: 78, title: "معقوله",                 artist: "علي صابر",           youtubeId: "J0SS6_vSy4w", clips: makeClips(242) },
  { id: 79, title: "انا بلياك",              artist: "ماجد المهندس",      youtubeId: "Pz59wizOqLw", clips: makeClips(265) },
  { id: 80, title: "منت فاهم",               artist: "عباس إبراهيم",      youtubeId: "SO8acgLRrGc", clips: makeClips(248) },
  // ── مصري شعبي / حديث ─────────────────────────────────────────────────────
  { id: 81, title: "قلت مش هتسبني",          artist: "اميمة طالب",        youtubeId: "TMzgaA-ZFF0", clips: makeClips(238) },
  { id: 82, title: "عم المجال كله",          artist: "محمود الليثي",      youtubeId: "9hEvD5rbzj0", clips: makeClips(235) },
  { id: 83, title: "بتبعد ليه",              artist: "حمزاوي",            youtubeId: "0aJ-vCuz6A4", clips: makeClips(240) },
  { id: 84, title: "انا البطل يا وحوش",      artist: "محمود الليثي",      youtubeId: "oexYI9IGKkM", clips: makeClips(235) },
  { id: 85, title: "طير انت",                artist: "ايفان ناجي",        youtubeId: "upypFsfKX4E", clips: makeClips(245) },
  { id: 86, title: "اني وانته",              artist: "هبة مسعود",         youtubeId: "I3AIcKYfvtI", clips: makeClips(248) },
  { id: 87, title: "ياهوى",                  artist: "هيثم شاكر",         youtubeId: "Gwo6Zq4yxfc", clips: makeClips(262) },
  { id: 88, title: "باشا باشا",              artist: "عماد باشا",         youtubeId: "hlT-2p6mizA", clips: makeClips(238) },
  { id: 89, title: "ثلاث دقات",              artist: "ابو ويسرا",         youtubeId: "ejvpVhvKesM", clips: makeClips(242) },
  { id: 90, title: "هيجيلي موجوع",           artist: "تامر عاشور",        youtubeId: "0a3oQGKhp24", clips: makeClips(255) },
  // ── احمد سعد ─────────────────────────────────────────────────────────────
  { id: 91, title: "اختياراتي",              artist: "احمد سعد",          youtubeId: "D9JxlYg1XVI", clips: makeClips(248) },
  { id: 92, title: "اليوم الحلو ده",          artist: "احمد سعد",          youtubeId: "Kb4fRYjtuF0", clips: makeClips(252) },
  { id: 93, title: "وسع وسع",                artist: "احمد سعد",          youtubeId: "aKCL3I5iQ18", clips: makeClips(242) },
  // ── حسين الجسمي (إضافات) ─────────────────────────────────────────────────
  { id: 94, title: "لا تقارني",              artist: "حسين الجسمي",       youtubeId: "xkdINrv0sIE", clips: makeClips(258) },
  { id: 95, title: "بلغ حبيبك",              artist: "حسين الجسمي",       youtubeId: "pyQwaJpkPUw", clips: makeClips(265) },
  { id: 96, title: "بالبنط العريض",           artist: "حسين الجسمي",       youtubeId: "M3sxUE4eIac", clips: makeClips(255) },
  // ── خليجي متنوع ───────────────────────────────────────────────────────────
  { id: 97, title: "غلط عمري",               artist: "حسام الرسام",       youtubeId: "uZSLEtqxNc4", clips: makeClips(250) },
  { id: 98, title: "انا صوتك",               artist: "فؤاد عبدالواحد",    youtubeId: "6dlkfQvSyyI", clips: makeClips(258) },
  { id: 99, title: "تجيبك الأيام",           artist: "غازي الأمير",       youtubeId: "_gMZCvW8zHU", clips: makeClips(248) },
  { id: 100, title: "عشق",                   artist: "فيصل عبدالكريم",    youtubeId: "pp49q7uh8f8", clips: makeClips(252) },
  { id: 101, title: "لا ترجع بقرارك",        artist: "جعفر الغزال",       youtubeId: "V9fL7aljFD8", clips: makeClips(245) },
  // ── خالد الحنين ──────────────────────────────────────────────────────────
  { id: 102, title: "انته بدمي",             artist: "خالد الحنين",       youtubeId: "giDZSy8ZsxU", clips: makeClips(258) },
  // ── خالد عبدالرحمن ───────────────────────────────────────────────────────
  { id: 103, title: "وشلون مغليك",           artist: "خالد عبدالرحمن",    youtubeId: "Ehmk-iBGZWU", clips: makeClips(262) },
  { id: 104, title: "عيني انا بعينها",       artist: "خالد عبدالرحمن",    youtubeId: "sEQcW0S-Bbs", clips: makeClips(258) },
  { id: 105, title: "حدي نظر",               artist: "خالد عبدالرحمن",    youtubeId: "XLKu7zwg8hg", clips: makeClips(252) },
  { id: 106, title: "صدقيني",                artist: "خالد عبدالرحمن",    youtubeId: "ILPgX_2B14Y", clips: makeClips(255) },
  { id: 107, title: "تقوى الهجر",            artist: "خالد عبدالرحمن",    youtubeId: "XWYgdu9lKrE", clips: makeClips(248) },
  // ── متنوع خليجي ──────────────────────────────────────────────────────────
  { id: 108, title: "وحشتيني",               artist: "عمر العمر",          youtubeId: "I5CTljrYcWA", clips: makeClips(250) },
  // ── عبادي الجوهر ─────────────────────────────────────────────────────────
  { id: 109, title: "قالو ترى",              artist: "عبادي الجوهر",      youtubeId: "daTrHQWom0g", clips: makeClips(265) },
  { id: 110, title: "عيونك",                 artist: "عبادي الجوهر",      youtubeId: "h0T2iOZA-LI", clips: makeClips(258) },
  // ── متنوع ────────────────────────────────────────────────────────────────
  { id: 111, title: "ياما حاولت الفراق",     artist: "عبدالعزيز الضويحي", youtubeId: "1WIvjbjbL-g", clips: makeClips(255) },
  // ── علي عبدالله ──────────────────────────────────────────────────────────
  { id: 112, title: "مسير الوقت",            artist: "علي عبدالله",        youtubeId: "ePgQ09cvPQ8", clips: makeClips(248) },
  { id: 113, title: "غارت عيوني",            artist: "علي عبدالله",        youtubeId: "rq-64-xgaQo", clips: makeClips(252) },
  // ── راشد الماجد (إضافات) ─────────────────────────────────────────────────
  { id: 114, title: "بترجعين",               artist: "راشد الماجد",        youtubeId: "IhsjqzhkfTA", clips: makeClips(258) },
  { id: 115, title: "اللي لقا احبابه",       artist: "راشد الماجد",        youtubeId: "42O51bcJyq0", clips: makeClips(262) },
  { id: 116, title: "ولهان",                 artist: "راشد الماجد",        youtubeId: "01C6_7CfQx4", clips: makeClips(255) },
  { id: 117, title: "اكثر شخص بالدنيا",      artist: "راشد الماجد",        youtubeId: "M4RZ3Z8MFcg", clips: makeClips(258) },
  { id: 118, title: "عظيم احساسي",           artist: "راشد الماجد",        youtubeId: "ZmhijyrzW08", clips: makeClips(252) },
  { id: 119, title: "سارق القلب",            artist: "راشد الماجد",        youtubeId: "xzhYtn8841Q", clips: makeClips(255) },
  { id: 120, title: "لربما",                 artist: "راشد الماجد",        youtubeId: "PyNjx-zL-bY", clips: makeClips(248) },
  { id: 121, title: "ياكل عمري",             artist: "راشد الماجد",        youtubeId: "B8w0eUMFxGs", clips: makeClips(260) },
  { id: 122, title: "الأسد",                 artist: "راشد الماجد",        youtubeId: "2cngcHQvmNg", clips: makeClips(252) },
  { id: 123, title: "يا محمد",               artist: "راشد الماجد",        youtubeId: "sSTGfpmGZLk", clips: makeClips(258) },
  { id: 124, title: "انا السما",             artist: "راشد الماجد",        youtubeId: "1_ee4CADtGM", clips: makeClips(255) },
  { id: 125, title: "تحدونا",                artist: "راشد الماجد",        youtubeId: "B09Yb9XtZJ4", clips: makeClips(248) },
  // ── نوال ─────────────────────────────────────────────────────────────────
  { id: 126, title: "القلوب الساهيه",        artist: "نوال",               youtubeId: "0XwIPLmxcNk", clips: makeClips(252) },
  { id: 127, title: "يالي ماحبيت عمري الا منك", artist: "نوال",           youtubeId: "q0bU9j0DoMs", clips: makeClips(258) },
  { id: 128, title: "اكو مثلك",              artist: "نوال",               youtubeId: "G_606bhkF3U", clips: makeClips(248) },
  { id: 129, title: "انت طيب",               artist: "نوال",               youtubeId: "ejS6q0Ezf0w", clips: makeClips(245) },
  { id: 130, title: "لقيت روحي",             artist: "نوال",               youtubeId: "UboxiJuyLW8", clips: makeClips(252) },
  // ── خليجي متنوع ──────────────────────────────────────────────────────────
  { id: 131, title: "وعرفتك",                artist: "ماجد المهندس",       youtubeId: "x0nkYuceo6c", clips: makeClips(265) },
  { id: 132, title: "مكتوب ما ارتاح",        artist: "احمد المصلاوي",     youtubeId: "kcWxws1SAE4", clips: makeClips(250) },
  { id: 133, title: "ما احبك بعد روح",       artist: "كاظم الساهر",        youtubeId: "bHAH-P45SEA", clips: makeClips(258) },
  // ── يوسف العماني ─────────────────────────────────────────────────────────
  { id: 134, title: "يعشقني",                artist: "يوسف العماني",       youtubeId: "KPrRwlrxzFY", clips: makeClips(252) },
  { id: 135, title: "مجنون",                 artist: "يوسف العماني",       youtubeId: "1JhDg3JlFCw", clips: makeClips(248) },
  // ── عمرو دياب (إضافة) ────────────────────────────────────────────────────
  { id: 136, title: "ياجمل عيون",            artist: "عمرو دياب",          youtubeId: "9Bp0S8BS7O4", clips: makeClips(258) },
  // ── عايض ─────────────────────────────────────────────────────────────────
  { id: 137, title: "والله مايرمش",          artist: "عايض",               youtubeId: "VRAnpjOjPMY", clips: makeClips(248) },
  // ── احمد ستار (إضافة) ────────────────────────────────────────────────────
  { id: 138, title: "انت حبيبي",             artist: "احمد ستار",          youtubeId: "GjhZOaU6cNk", clips: makeClips(242) },
  // ── متنوع ────────────────────────────────────────────────────────────────
  { id: 139, title: "والله حرام",            artist: "حبيب علي",           youtubeId: "zgjLvDK_v1Q", clips: makeClips(245) },
  { id: 140, title: "بحضني اتخيلك مرات",     artist: "محمد عبد الجبار",    youtubeId: "88TvNquej0I", clips: makeClips(248) },
  { id: 141, title: "هامة طويق",             artist: "علي بن محمد",        youtubeId: "4NQ1-3bgOkY", clips: makeClips(252) },
  // ── محمد شاكر ────────────────────────────────────────────────────────────
  { id: 142, title: "يا حياتي",              artist: "محمد شاكر",          youtubeId: "baa-ioULFdY", clips: makeClips(245) },
  // ── شيرين / لميس ─────────────────────────────────────────────────────────
  { id: 143, title: "الوتر الحساس",          artist: "شيرين",              youtubeId: "KZYqugtbcG0", clips: makeClips(258) },
  { id: 144, title: "مسيطرة",                artist: "لميس كان",           youtubeId: "EAo6BmLNBEI", clips: makeClips(245) },
  // ── كرار صلاح ────────────────────────────────────────────────────────────
  { id: 145, title: "تعبني حبيبي",           artist: "كرار صلاح",          youtubeId: "Gq6kkQ7NIv4", clips: makeClips(248) },
  // ── صلاح / اصيل / اصالة ──────────────────────────────────────────────────
  { id: 146, title: "ياعم جيتك لحد بيتك",   artist: "صلاح",               youtubeId: "GqEjN9lmeP4", clips: makeClips(240) },
  { id: 147, title: "سر الحياة",             artist: "اصيل هميم",          youtubeId: "uVxij4NespQ", clips: makeClips(252) },
  { id: 148, title: "سواها قلبي",            artist: "اصالة",              youtubeId: "uNozy89Wbh0", clips: makeClips(258) },
];

const ROUND_OPTIONS = [5, 10, 15, 20, 25];

// ─── LocalStorage key for played song IDs ─────────────────────────────────────
const PLAYED_KEY = "rose_song_played_ids";

// ─── Builds a smart queue, excluding recently-played songs across reloads ─────
// `excludeYoutubeIds` — set of IDs known to be unavailable (auto-filled at runtime)
function buildSmartQueue(count: number, excludeYoutubeIds: Set<string> = new Set()): GameClip[] {
  let playedIds: Set<number> = new Set();
  try {
    const raw = localStorage.getItem(PLAYED_KEY);
    if (raw) playedIds = new Set(JSON.parse(raw) as number[]);
  } catch {}

  // Exclude both already-played IDs and known-failed YouTube IDs
  let pool = SONGS.filter(s => !playedIds.has(s.id) && !excludeYoutubeIds.has(s.youtubeId));

  // If not enough valid songs remain, reset played history (keep failed exclusions)
  if (pool.length < count) {
    localStorage.removeItem(PLAYED_KEY);
    playedIds = new Set();
    pool = SONGS.filter(s => !excludeYoutubeIds.has(s.youtubeId));
  }

  const queue = buildGameQueue(pool, count);

  // Persist the IDs of songs selected in this session
  const newPlayed = new Set([...playedIds, ...queue.map(gc => gc.song.id)]);
  try { localStorage.setItem(PLAYED_KEY, JSON.stringify([...newPlayed])); } catch {}

  return queue;
}
const TIMER_BASE = 60;
const EXTRA_TIME = 60;

// ─── YouTube API loader ───────────────────────────────────────────────────────
let ytApiPromise: Promise<void> | null = null;
function loadYouTubeAPI(): Promise<void> {
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise((resolve) => {
    if (window._ytApiReady && window.YT?.Player) { resolve(); return; }
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      window._ytApiReady = true;
      if (prev) prev();
      resolve();
    };
    if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(tag);
    }
  });
  return ytApiPromise;
}

// ─── Floating music note ─────────────────────────────────────────────────────
const Note = ({ delay, x, color, s = 26 }: { delay: number; x: number; color: string; s?: number }) => (
  <motion.span className="absolute pointer-events-none select-none font-black"
    style={{ left: `${x}%`, bottom: 0, color, fontSize: s, zIndex: 0 }}
    initial={{ y: 0, opacity: 0 }}
    animate={{ y: -240, opacity: [0, 1, 1, 0], rotate: [0, 20, -16, 4], scale: [0.4, 1.2, 1, 0.2] }}
    transition={{ duration: 3.5, delay, repeat: Infinity, repeatDelay: 0.4 }}>
    ♪
  </motion.span>
);

// ─── Main component ───────────────────────────────────────────────────────────
export default function SongGame() {
  const [, navigate] = useLocation();
  // Start directly at settings — no intermediate "setup" landing page
  const [phase, setPhase] = useState<Phase>("settings");

  // Settings
  const [team1Name, setTeam1Name] = useState("الفريق الأول");
  const [team2Name, setTeam2Name] = useState("الفريق الثاني");
  const [totalRounds, setTotalRounds] = useState(10);

  // Game state — team1Score / team2Score = independent win counters per team
  const [team1Score, setTeam1Score] = useState(0);
  const [team2Score, setTeam2Score] = useState(0);
  const [currentRound, setCurrentRound] = useState(0);
  const [currentTurn, setCurrentTurn] = useState<1 | 2>(1);
  const [team1DoubleUsed, setTeam1DoubleUsed] = useState(false);
  const [team2DoubleUsed, setTeam2DoubleUsed] = useState(false);
  const [team1ExtraUsed, setTeam1ExtraUsed] = useState(false);
  const [team2ExtraUsed, setTeam2ExtraUsed] = useState(false);
  const [doubleActive, setDoubleActive] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);

  // Shuffled game clips built at startGame; replaces currentSongIndex
  const [gameClips, setGameClips] = useState<GameClip[]>([]);
  const [currentGameIndex, setCurrentGameIndex] = useState(0);

  // Timer
  const [timeLeft, setTimeLeft] = useState(TIMER_BASE);
  const [timerRunning, setTimerRunning] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // YouTube
  const ytPlayerRef = useRef<any>(null);
  const ytContainerRef = useRef<HTMLDivElement>(null);
  const [audioState, setAudioState] = useState<"loading" | "playing" | "paused" | "stopped" | "error">("loading");
  const [volume, setVolume] = useState(60);
  const clipWatchRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Ref so timer callback can read clip without stale closure
  const activeClipRef = useRef<GameClip>({ song: SONGS[0], clip: SONGS[0].clips[0] });
  // Ref for current game queue (avoids stale closures in callbacks)
  const gameClipsRef = useRef<GameClip[]>([]);
  // Set of YouTube IDs that failed to load — skip them automatically
  const failedSongIds = useRef<Set<string>>(new Set());
  // Volume ref — used inside async YT callbacks to avoid stale closure
  const volumeRef = useRef(60);
  // Auto-skip timeout — if onReady never fires within 10 s, skip the song
  const loadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Derived ───────────────────────────────────────────────────────────────
  const currentGC: GameClip = gameClips[currentGameIndex] ?? { song: SONGS[0], clip: SONGS[0].clips[0] };
  const currentSong = currentGC.song;
  const currentClip = currentGC.clip;
  activeClipRef.current = currentGC; // keep ref in sync for timer callback
  const teamColor = (t: 1 | 2) => t === 1 ? "#e040fb" : "#00e5ff";
  const teamName = (t: 1 | 2) => t === 1 ? team1Name : team2Name;
  const currentDoubleUsed = currentTurn === 1 ? team1DoubleUsed : team2DoubleUsed;
  const currentExtraUsed = currentTurn === 1 ? team1ExtraUsed : team2ExtraUsed;
  const timerPct = Math.min((timeLeft / (TIMER_BASE + EXTRA_TIME)) * 100, 100);
  const timerColor = timeLeft <= 10 ? "#ef4444" : timeLeft <= 30 ? "#f59e0b" : "#22c55e";

  // ── Timer ─────────────────────────────────────────────────────────────────
  const stopTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setTimerRunning(false);
  }, []);

  useEffect(() => {
    if (!timerRunning) return;
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          // Stay in play — switch turn, reset timer, replay clip for new team
          setCurrentTurn(prev => prev === 1 ? 2 : 1);
          setDoubleActive(false);
          setShowAnswer(false);
          setTimeout(() => {
            const gc = activeClipRef.current;
            if (ytPlayerRef.current) {
              try {
                ytPlayerRef.current.seekTo(gc.clip.start, true);
                ytPlayerRef.current.playVideo();
                setAudioState("playing");
                startClipWatch(gc.clip);
              } catch (_) {}
            }
          }, 300);
          return TIMER_BASE; // reset timer for next team, stay in play page
        }
        return t - 1;
      });
    }, 1000);
    return () => stopTimer();
  }, [timerRunning]);

  const addExtraTime = () => {
    if (currentExtraUsed) return;
    if (currentTurn === 1) setTeam1ExtraUsed(true);
    else setTeam2ExtraUsed(true);
    setTimeLeft(t => t + EXTRA_TIME);
  };

  // ── YouTube clip ──────────────────────────────────────────────────────────
  // Keep volumeRef in sync so async YT callbacks always read the latest volume
  useEffect(() => { volumeRef.current = volume; }, [volume]);

  const clearClipWatch = () => {
    if (clipWatchRef.current) { clearInterval(clipWatchRef.current); clipWatchRef.current = null; }
  };
  const clearLoadTimeout = () => {
    if (loadTimeoutRef.current) { clearTimeout(loadTimeoutRef.current); loadTimeoutRef.current = null; }
  };
  const destroyPlayer = useCallback(() => {
    clearClipWatch();
    clearLoadTimeout();
    if (ytPlayerRef.current) {
      try { ytPlayerRef.current.destroy(); } catch (_) {}
      ytPlayerRef.current = null;
    }
  }, []);

  const startClipWatch = (clip: Clip) => {
    clearClipWatch();
    clipWatchRef.current = setInterval(() => {
      if (!ytPlayerRef.current) return;
      try {
        const t = ytPlayerRef.current.getCurrentTime?.() ?? 0;
        if (t >= clip.end) {
          clearClipWatch();
          ytPlayerRef.current.pauseVideo();
          setAudioState("stopped");
        }
      } catch (_) {}
    }, 300);
  };

  useEffect(() => {
    if (phase !== "play") { destroyPlayer(); return; }
    setAudioState("loading");

    loadYouTubeAPI().then(() => {
      if (!ytContainerRef.current) return;
      destroyPlayer();
      const gc = activeClipRef.current;

      // Safety net: if onReady never fires within 10 s, auto-skip the song
      loadTimeoutRef.current = setTimeout(() => {
        if (ytPlayerRef.current) {
          failedSongIds.current.add(gc.song.youtubeId);
          skipToNextSong();
        }
      }, 10_000);

      ytPlayerRef.current = new window.YT.Player(ytContainerRef.current, {
        height: "1", width: "1",
        videoId: gc.song.youtubeId,
        playerVars: {
          autoplay: 1, start: gc.clip.start,
          controls: 0, modestbranding: 1, rel: 0, fs: 0,
          iv_load_policy: 3, disablekb: 1, playsinline: 1,
        },
        events: {
          onReady: (e: any) => {
            clearLoadTimeout();                       // onReady fired — cancel safety timeout
            e.target.setVolume(volumeRef.current);   // use ref to avoid stale closure
            e.target.playVideo();
            setAudioState("playing");
            startClipWatch(gc.clip);
          },
          onStateChange: (e: any) => {
            const S = window.YT?.PlayerState;
            if (e.data === S?.PLAYING) setAudioState("playing");
            else if (e.data === S?.PAUSED)
              setAudioState(prev => prev === "stopped" ? "stopped" : "paused");
          },
          onError: (e: any) => {
            // ANY YouTube error → mark failed + auto-skip silently
            // Codes: 2=invalid param, 5=HTML5, 100=not found, 101/150=embed blocked
            clearLoadTimeout();
            failedSongIds.current.add(gc.song.youtubeId);
            setTimeout(() => skipToNextSong(), 600);
          },
        },
      });
    }).catch(() => {
      clearLoadTimeout();
      setAudioState("error");
    });

    return () => destroyPlayer();
  }, [phase, currentGameIndex]);

  useEffect(() => {
    if (!ytPlayerRef.current) return;
    try {
      if (volume === 0) ytPlayerRef.current.mute();
      else { ytPlayerRef.current.unMute(); ytPlayerRef.current.setVolume(volume); }
    } catch (_) {}
  }, [volume]);

  // ── Audio controls ────────────────────────────────────────────────────────
  const playAudio = () => {
    if (!ytPlayerRef.current) return;
    try { ytPlayerRef.current.playVideo(); setAudioState("playing"); startClipWatch(currentClip); } catch (_) {}
  };
  const pauseAudio = () => {
    if (!ytPlayerRef.current) return;
    try { clearClipWatch(); ytPlayerRef.current.pauseVideo(); setAudioState("paused"); } catch (_) {}
  };
  const replayAudio = () => {
    if (!ytPlayerRef.current) return;
    try {
      ytPlayerRef.current.seekTo(currentClip.start, true);
      ytPlayerRef.current.playVideo();
      setAudioState("playing");
      startClipWatch(currentClip);
    } catch (_) {}
  };

  // Keep gameClipsRef in sync so error-skip callbacks have up-to-date data
  useEffect(() => { gameClipsRef.current = gameClips; }, [gameClips]);

  // Auto-skip to next song (called when YouTube reports a fatal load error)
  const skipToNextSong = useCallback(() => {
    destroyPlayer();
    setCurrentGameIndex(i => {
      const next = i + 1;
      if (gameClipsRef.current[next]) activeClipRef.current = gameClipsRef.current[next];
      return next;
    });
    setAudioState("loading");
  }, [destroyPlayer]);

  // ── Game flow ─────────────────────────────────────────────────────────────
  const startGame = () => {
    // Build queue large enough for the longest possible game (both teams race to target)
    // Pass known-failed YouTube IDs so they are excluded from the new queue
    const queueSize = Math.min(totalRounds * 2, SONGS.length);
    const queue = buildSmartQueue(queueSize, failedSongIds.current);
    gameClipsRef.current = queue;
    setGameClips(queue);
    setCurrentGameIndex(0);
    activeClipRef.current = queue[0];

    setTeam1Score(0); setTeam2Score(0);
    setCurrentRound(0); setCurrentTurn(1);
    setTeam1DoubleUsed(false); setTeam2DoubleUsed(false);
    setTeam1ExtraUsed(false); setTeam2ExtraUsed(false);
    setDoubleActive(false); setShowAnswer(false);
    setPhase("control");
  };

  const activateDouble = () => {
    if (currentDoubleUsed) return;
    setDoubleActive(true);
    if (currentTurn === 1) setTeam1DoubleUsed(true);
    else setTeam2DoubleUsed(true);
  };

  const skipTurn = () => {
    setCurrentTurn(t => t === 1 ? 2 : 1);
    setDoubleActive(false);
    setShowAnswer(false);
  };

  const playSong = () => {
    setShowAnswer(false);
    setTimeLeft(TIMER_BASE);
    setTimerRunning(true);
    setPhase("play");
  };

  const handleShowAnswer = () => {
    pauseAudio();
    stopTimer();
    setShowAnswer(true);
  };

  const awardPoint = (team: 1 | 2) => {
    const pts = doubleActive ? 2 : 1;

    // Compute new scores before setting state so we can check win condition immediately
    const newScore1 = team === 1 ? team1Score + pts : team1Score;
    const newScore2 = team === 2 ? team2Score + pts : team2Score;

    if (team === 1) setTeam1Score(newScore1);
    else setTeam2Score(newScore2);

    setCurrentRound(r => r + 1);
    setDoubleActive(false);
    setShowAnswer(false);
    stopTimer();
    destroyPlayer();
    setCurrentGameIndex(i => {
      const next = i + 1;
      if (gameClipsRef.current[next]) activeClipRef.current = gameClipsRef.current[next];
      return next;
    });

    // End game the moment EITHER team reaches the target — no summing of both scores
    if (newScore1 >= totalRounds || newScore2 >= totalRounds) {
      setPhase("ended");
    } else {
      setCurrentTurn(t => t === 1 ? 2 : 1);
      setPhase("control");
    }
  };

  const resetFull = () => {
    stopTimer(); destroyPlayer();
    setPhase("settings");
    setGameClips([]); setCurrentGameIndex(0);
    setTeam1Name("الفريق الأول"); setTeam2Name("الفريق الثاني"); setTotalRounds(10);
  };

  const winner = team1Score > team2Score ? team1Name : team2Score > team1Score ? team2Name : "تعادل! 🤝";

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen w-full gradient-bg flex flex-col" dir="rtl"
      style={{ overflowX: "hidden" }}>

      {/* Ambient glows */}
      <div className="fixed inset-0 pointer-events-none">
        <div style={{ position: "absolute", top: 0, right: 0, width: 700, height: 700,
          background: "radial-gradient(circle, rgba(224,64,251,0.08), transparent)", filter: "blur(100px)",
          transform: "translate(30%,-30%)" }} />
        <div style={{ position: "absolute", bottom: 0, left: 0, width: 700, height: 700,
          background: "radial-gradient(circle, rgba(0,229,255,0.08), transparent)", filter: "blur(100px)",
          transform: "translate(-30%,30%)" }} />
      </div>

      {/* Hidden YouTube mount */}
      {phase === "play" && (
        <div style={{ position: "fixed", top: -2, left: -2, width: 1, height: 1, overflow: "hidden", zIndex: -10 }}>
          <div ref={ytContainerRef} />
        </div>
      )}

      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <header className="relative z-20 flex items-center justify-between px-6 py-4 border-b border-white/[0.05] flex-shrink-0"
        style={{ background: "rgba(5,2,14,0.95)", backdropFilter: "blur(20px)" }}>
        <button onClick={() => navigate("/")}
          className="flex items-center gap-2 text-purple-300/50 hover:text-pink-400 transition-colors font-bold">
          <ArrowRight size={18} />
          <span className="text-sm">العودة</span>
        </button>
        <div className="flex items-center gap-2.5">
          <Music2 className="text-pink-400" size={20} />
          <span className="text-lg font-black neon-text-pink">لعبة الأغاني</span>
        </div>
        <div className="w-24" />
      </header>

      {/* ── CONTENT ────────────────────────────────────────────────────────── */}
      <div className="relative z-10 flex-1 flex flex-col">
        <AnimatePresence mode="wait">

          {/* ════════════════════ SETTINGS (first screen) ════════════════════ */}
          {phase === "settings" && (
            <motion.div key="settings"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.35 }}
              className="flex-1 flex flex-col items-center justify-center px-5 py-8 gap-8">

              {/* Hero logo — animated circular face */}
              <motion.div
                animate={{ y: [0, -8, 0] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                className="relative">

                {/* Outer ambient glow */}
                <div className="absolute rounded-full blur-3xl opacity-40"
                  style={{ inset: -20, background: "radial-gradient(circle, #e040fb, #00e5ff)" }} />

                {/* Rotating neon ring */}
                <motion.div animate={{ rotate: 360 }} transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
                  className="absolute rounded-full" style={{ inset: -5 }}>
                  <div className="w-full h-full rounded-full" style={{
                    background: "linear-gradient(135deg, #e040fb, transparent, #00e5ff, transparent, #e040fb)",
                    mask: "radial-gradient(farthest-side, transparent calc(100% - 3px), white calc(100% - 3px))",
                    WebkitMask: "radial-gradient(farthest-side, transparent calc(100% - 3px), white calc(100% - 3px))",
                  }} />
                </motion.div>

                {/* Face video */}
                <div className="relative w-40 h-40 sm:w-52 sm:h-52 rounded-full overflow-hidden"
                  style={{
                    border: "3px solid rgba(224,64,251,0.5)",
                    boxShadow: "0 0 40px rgba(224,64,251,0.4), 0 0 80px rgba(224,64,251,0.15)",
                  }}>
                  <video src="/rose-face.mp4" autoPlay loop muted playsInline
                    className="w-full h-full object-cover"
                    style={{ objectPosition: "center top" }} />
                </div>

                {/* Floating notes */}
                <div className="absolute inset-0 overflow-visible pointer-events-none">
                  <Note delay={0}    x={-20} color="#e040fb" s={22} />
                  <Note delay={1.1}  x={110} color="#00e5ff" s={20} />
                  <Note delay={0.55} x={45}  color="#ffd600" s={18} />
                </div>
              </motion.div>

              <div className="text-center">
                <h1 className="text-3xl sm:text-4xl font-black text-white">إعداد اللعبة</h1>
                <p className="text-purple-300/40 text-base mt-1">أدخل أسماء الفريقين واختر عدد الجولات</p>
              </div>

              {/* Team name inputs */}
              <div className="w-full max-w-lg grid grid-cols-2 gap-4">
                {[
                  { val: team1Name, set: setTeam1Name, color: "#e040fb", label: "الفريق الأول" },
                  { val: team2Name, set: setTeam2Name, color: "#00e5ff", label: "الفريق الثاني" },
                ].map((t, i) => (
                  <div key={i} className="rounded-2xl border p-5 space-y-3"
                    style={{ borderColor: `${t.color}28`, background: `${t.color}07` }}>
                    <div className="flex items-center gap-2">
                      <Users size={16} style={{ color: t.color }} />
                      <label className="text-sm font-black" style={{ color: t.color }}>{t.label}</label>
                    </div>
                    <input
                      value={t.val}
                      onChange={e => t.set(e.target.value)}
                      className="w-full rounded-xl px-4 py-3 bg-black/30 border text-white font-black text-center text-lg focus:outline-none transition-all"
                      style={{ borderColor: `${t.color}28`, fontSize: 18 }}
                    />
                  </div>
                ))}
              </div>

              {/* Rounds selector */}
              <div className="w-full max-w-lg space-y-3">
                <p className="flex items-center gap-2 text-base font-black text-purple-300/60">
                  <Trophy size={16} /> عدد الجولات
                </p>
                <div className="grid grid-cols-5 gap-3">
                  {ROUND_OPTIONS.map(r => (
                    <button key={r} onClick={() => setTotalRounds(r)}
                      className="py-4 rounded-2xl font-black text-xl border transition-all"
                      style={{
                        borderColor: totalRounds === r ? "#e040fb" : "rgba(224,64,251,0.18)",
                        background: totalRounds === r ? "rgba(224,64,251,0.2)" : "rgba(224,64,251,0.04)",
                        color: totalRounds === r ? "#e040fb" : "rgba(224,64,251,0.3)",
                        boxShadow: totalRounds === r ? "0 0 20px rgba(224,64,251,0.3)" : "none",
                      }}>{r}</button>
                  ))}
                </div>
              </div>

              {/* Start button */}
              <motion.button
                onClick={startGame}
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.97 }}
                className="flex items-center justify-center gap-3 px-16 py-5 rounded-2xl font-black text-2xl"
                style={{
                  background: "linear-gradient(135deg, #e040fb, #9c27b0)",
                  boxShadow: "0 0 50px rgba(224,64,251,0.5)",
                  color: "#fff",
                  width: "100%",
                  maxWidth: 480,
                }}>
                <Play size={26} fill="white" />
                إبدأ اللعبة
              </motion.button>
            </motion.div>
          )}

          {/* ════════════════════ CONTROL ════════════════════ */}
          {phase === "control" && (
            <motion.div key="control"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="flex-1 flex flex-col items-center justify-center px-5 py-5 gap-4 relative overflow-hidden">

              {/* ── Round progress badge ── */}
              <div className="relative z-10 flex items-center gap-3">
                <div className="text-3xl font-black"
                  style={{ color: teamColor(currentTurn), textShadow: `0 0 20px ${teamColor(currentTurn)}80` }}>
                  {currentRound}
                </div>
                <div className="flex flex-col gap-1">
                  <div className="text-xs text-purple-400/40 font-bold">/ {totalRounds}</div>
                  <div className="w-16 h-1 rounded-full overflow-hidden bg-purple-900/30">
                    <div className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${(currentRound / totalRounds) * 100}%`,
                        background: "linear-gradient(90deg, #e040fb, #7c3aed, #00e5ff)" }} />
                  </div>
                </div>
              </div>

              {/* ── Score cards ── */}
              <div className="relative z-10 w-full max-w-2xl grid grid-cols-3 gap-3 items-stretch">
                {/* Team 1 */}
                <div className="rounded-3xl overflow-hidden border transition-all"
                  style={{
                    borderColor: currentTurn === 1 ? "#e040fb70" : "rgba(224,64,251,0.15)",
                    background: currentTurn === 1 ? "rgba(224,64,251,0.14)" : "rgba(8,3,18,0.80)",
                    boxShadow: currentTurn === 1 ? "0 0 40px rgba(224,64,251,0.22)" : "none",
                  }}>
                  {currentTurn === 1 && <div className="h-1" style={{ background: "linear-gradient(90deg, #e040fb, #c026d3)" }} />}
                  <div className="p-5 text-center">
                    <div className="w-12 h-12 rounded-xl mx-auto mb-3 flex items-center justify-center"
                      style={{ background: "rgba(224,64,251,0.15)", border: "1px solid rgba(224,64,251,0.3)" }}>
                      <Star size={22} style={{ color: "#e040fb" }} />
                    </div>
                    <p className="text-sm font-bold truncate" style={{ color: "#e040fb80" }}>{team1Name}</p>
                    <p className="text-6xl font-black mt-1"
                      style={{ color: "#e040fb", textShadow: "0 0 28px #e040fb80" }}>{team1Score}</p>
                    {currentTurn === 1 && (
                      <p className="text-sm font-black mt-2" style={{ color: "#e040fb" }}>⚡ دورهم</p>
                    )}
                  </div>
                </div>

                {/* Middle VS */}
                <div className="flex flex-col items-center justify-center gap-2">
                  <div className="text-2xl font-black" style={{ color: "rgba(167,139,250,0.4)" }}>VS</div>
                  <div className="w-px h-8 rounded-full" style={{ background: "rgba(167,139,250,0.18)" }} />
                  <Music2 size={16} style={{ color: "rgba(167,139,250,0.35)" }} />
                </div>

                {/* Team 2 */}
                <div className="rounded-3xl overflow-hidden border transition-all"
                  style={{
                    borderColor: currentTurn === 2 ? "#00e5ff70" : "rgba(0,229,255,0.15)",
                    background: currentTurn === 2 ? "rgba(0,229,255,0.12)" : "rgba(8,3,18,0.80)",
                    boxShadow: currentTurn === 2 ? "0 0 40px rgba(0,229,255,0.2)" : "none",
                  }}>
                  {currentTurn === 2 && <div className="h-1" style={{ background: "linear-gradient(90deg, #00e5ff, #0284c7)" }} />}
                  <div className="p-5 text-center">
                    <div className="w-12 h-12 rounded-xl mx-auto mb-3 flex items-center justify-center"
                      style={{ background: "rgba(0,229,255,0.14)", border: "1px solid rgba(0,229,255,0.3)" }}>
                      <Star size={22} style={{ color: "#00e5ff" }} />
                    </div>
                    <p className="text-sm font-bold truncate" style={{ color: "#00e5ff80" }}>{team2Name}</p>
                    <p className="text-6xl font-black mt-1"
                      style={{ color: "#00e5ff", textShadow: "0 0 28px #00e5ff80" }}>{team2Score}</p>
                    {currentTurn === 2 && (
                      <p className="text-sm font-black mt-2" style={{ color: "#00e5ff" }}>⚡ دورهم</p>
                    )}
                  </div>
                </div>
              </div>

              {/* ── Current turn banner ── */}
              <div className="relative z-10 w-full max-w-2xl rounded-2xl border py-4 text-center"
                style={{ borderColor: `${teamColor(currentTurn)}28`, background: `${teamColor(currentTurn)}08` }}>
                <p className="text-sm text-purple-300/35">الدور الحالي</p>
                <p className="text-3xl font-black mt-0.5" style={{ color: teamColor(currentTurn) }}>
                  {teamName(currentTurn)}
                </p>
              </div>

              {/* ── Action buttons ── */}
              <div className="relative z-10 w-full max-w-2xl space-y-3">
                <motion.button onClick={playSong}
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  className="w-full flex items-center justify-center gap-3 py-6 rounded-2xl font-black text-2xl"
                  style={{
                    background: "linear-gradient(135deg, #22c55e, #16a34a)",
                    boxShadow: "0 0 36px rgba(34,197,94,0.45)", color: "#fff",
                  }}>
                  <Play size={26} fill="white" /> تشغيل الأغنية
                </motion.button>

                <motion.button onClick={activateDouble} disabled={currentDoubleUsed}
                  whileHover={currentDoubleUsed ? {} : { scale: 1.02 }}
                  whileTap={currentDoubleUsed ? {} : { scale: 0.98 }}
                  className="w-full flex items-center justify-center gap-3 py-5 rounded-2xl font-black text-xl border transition-all"
                  style={{
                    background: currentDoubleUsed ? "rgba(255,214,0,0.03)" : doubleActive ? "rgba(255,214,0,0.2)" : "rgba(255,214,0,0.08)",
                    borderColor: currentDoubleUsed ? "rgba(255,214,0,0.12)" : doubleActive ? "#ffd600" : "rgba(255,214,0,0.38)",
                    color: currentDoubleUsed ? "rgba(255,214,0,0.3)" : "#ffd600",
                    boxShadow: doubleActive ? "0 0 28px rgba(255,214,0,0.4)" : "none",
                    cursor: currentDoubleUsed ? "not-allowed" : "pointer",
                  }}>
                  <Zap size={24} />
                  {currentDoubleUsed ? "الدبل مستخدم ✓" : doubleActive ? "DOUBLE مفعّل ×2 ⚡" : "تفعيل الدبل"}
                </motion.button>

                <motion.button onClick={skipTurn}
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl font-bold text-lg border border-purple-500/20 text-purple-400/55 hover:text-purple-200 hover:border-purple-500/35 transition-all">
                  <SkipForward size={22} /> تخطي الدور
                </motion.button>
              </div>

              <button onClick={resetFull}
                className="relative z-10 flex items-center gap-2 py-1.5 text-sm text-purple-500/25 hover:text-purple-400/45 transition-colors">
                <RotateCcw size={13} /> إعادة تعيين اللعبة
              </button>

            </motion.div>
          )}

          {/* ════════════════════ PLAY ════════════════════ */}
          {phase === "play" && (
            <motion.div key="play"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="flex-1 flex flex-col items-center justify-start px-5 py-5 gap-4 overflow-y-auto">

              {/* ── BIG logo section ── */}
              <div className="relative flex flex-col items-center">
                <motion.div
                  animate={{ y: [0, -7, 0] }}
                  transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                  className="relative">

                  {/* Outer ambient glow */}
                  <div className="absolute rounded-full blur-3xl opacity-40"
                    style={{ inset: -24, background: `radial-gradient(circle, ${teamColor(currentTurn)}, #e040fb)` }} />

                  {/* Rotating neon ring (team color) */}
                  <motion.div animate={{ rotate: 360 }} transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
                    className="absolute rounded-full" style={{ inset: -6 }}>
                    <div className="w-full h-full rounded-full" style={{
                      background: `linear-gradient(135deg, ${teamColor(currentTurn)}, transparent, #e040fb, transparent, ${teamColor(currentTurn)})`,
                      mask: "radial-gradient(farthest-side, transparent calc(100% - 3px), white calc(100% - 3px))",
                      WebkitMask: "radial-gradient(farthest-side, transparent calc(100% - 3px), white calc(100% - 3px))",
                    }} />
                  </motion.div>

                  {/* Face video with pulse when playing */}
                  <motion.div
                    className="relative w-36 h-36 sm:w-44 sm:h-44 rounded-full overflow-hidden"
                    style={{
                      border: `4px solid ${teamColor(currentTurn)}55`,
                      boxShadow: `0 0 50px ${teamColor(currentTurn)}45, 0 0 100px ${teamColor(currentTurn)}18`,
                    }}
                    animate={audioState === "playing" ? { scale: [1, 1.06, 1] } : {}}
                    transition={{ repeat: Infinity, duration: 1.2 }}>
                    <video src="/rose-face.mp4" autoPlay loop muted playsInline
                      className="w-full h-full object-cover"
                      style={{ objectPosition: "center top" }} />
                  </motion.div>

                  {/* Ring pulse on playing */}
                  {audioState === "playing" && (
                    <motion.div className="absolute inset-0 rounded-full"
                      animate={{ scale: [1, 1.35, 1.35], opacity: [0.55, 0, 0] }}
                      transition={{ repeat: Infinity, duration: 1.8 }}
                      style={{ border: `2px solid ${teamColor(currentTurn)}`, borderRadius: "50%" }} />
                  )}

                  {/* Floating notes around logo */}
                  <div className="absolute inset-0 overflow-visible pointer-events-none">
                    <Note delay={0}    x={-28} color="#e040fb" s={24} />
                    <Note delay={1.2}  x={115} color="#00e5ff" s={22} />
                    <Note delay={0.6}  x={40}  color="#ffd600" s={18} />
                  </div>
                </motion.div>

                {/* Audio status badge */}
                <div className="mt-3 flex items-center gap-2 px-4 py-1.5 rounded-full"
                  style={{ background: "rgba(0,0,0,0.65)", border: "1px solid rgba(255,255,255,0.07)" }}>
                  <motion.div className="w-2.5 h-2.5 rounded-full"
                    animate={audioState === "playing" ? { opacity: [1, 0.2, 1] } : {}}
                    transition={{ repeat: Infinity, duration: 0.8 }}
                    style={{ background: audioState === "playing" ? "#22c55e" : audioState === "stopped" ? "#f59e0b" : audioState === "error" ? "#ef4444" : "#6b7280" }} />
                  <span className="text-sm font-bold" style={{ color: "rgba(255,255,255,0.55)" }}>
                    {audioState === "loading" ? "جارٍ التحميل..." :
                      audioState === "playing" ? "▶ قيد التشغيل" :
                      audioState === "stopped" ? "انتهى المقطع" :
                      audioState === "error" ? "خطأ في التحميل" : "⏸ متوقف مؤقتاً"}
                  </span>
                </div>
              </div>

              {/* ── 3-column: Team 1 | Timer (center) | Team 2 ── */}
              <div className="w-full max-w-2xl grid grid-cols-3 gap-3 items-center">

                {/* Team 1 – right in RTL */}
                <div className="rounded-2xl border overflow-hidden transition-all duration-300"
                  style={{
                    borderColor: currentTurn === 1 ? "#e040fb80" : "rgba(224,64,251,0.2)",
                    background: currentTurn === 1 ? "rgba(224,64,251,0.14)" : "rgba(8,3,18,0.75)",
                    boxShadow: currentTurn === 1 ? "0 0 28px rgba(224,64,251,0.28)" : "none",
                  }}>
                  <div className="p-3 text-center">
                    <p className="text-xs font-black truncate mb-1"
                      style={{ color: currentTurn === 1 ? "#e040fb" : "rgba(224,64,251,0.5)" }}>
                      {team1Name}
                    </p>
                    <p className="text-5xl font-black"
                      style={{ color: "#e040fb", textShadow: currentTurn === 1 ? "0 0 28px #e040fb" : "0 0 12px #e040fb50" }}>
                      {team1Score}
                    </p>
                    <p className="text-xs mt-1 font-bold"
                      style={{ color: currentTurn === 1 ? "#e040fb" : "rgba(224,64,251,0.35)" }}>
                      {currentTurn === 1 ? "⚡ دورهم" : "درجات"}
                    </p>
                  </div>
                </div>

                {/* Timer – always centered */}
                <div className="flex flex-col items-center gap-1.5">
                  <div className="relative w-28 h-28">
                    <svg className="w-28 h-28 absolute inset-0"
                      style={{ transform: "rotate(-90deg)", transformOrigin: "center" }}
                      viewBox="0 0 112 112">
                      <circle cx="56" cy="56" r="48" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="7" />
                      <motion.circle cx="56" cy="56" r="48" fill="none"
                        stroke={timerColor} strokeWidth="7" strokeLinecap="round"
                        strokeDasharray={`${2 * Math.PI * 48}`}
                        strokeDashoffset={`${2 * Math.PI * 48 * (1 - timerPct / 100)}`}
                        transition={{ duration: 0.6 }} />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <motion.span className="text-4xl font-black tabular-nums"
                        animate={timeLeft <= 10 && timerRunning ? { scale: [1, 1.2, 1] } : {}}
                        transition={{ repeat: Infinity, duration: 0.8 }}
                        style={{ color: timerColor, textShadow: `0 0 18px ${timerColor}80` }}>
                        {timeLeft}
                      </motion.span>
                    </div>
                  </div>
                  <div className="text-xs text-purple-400/35 font-bold tabular-nums">
                    {currentRound}/{totalRounds}
                  </div>
                </div>

                {/* Team 2 – left in RTL */}
                <div className="rounded-2xl border overflow-hidden transition-all duration-300"
                  style={{
                    borderColor: currentTurn === 2 ? "#00e5ff80" : "rgba(0,229,255,0.2)",
                    background: currentTurn === 2 ? "rgba(0,229,255,0.12)" : "rgba(8,3,18,0.75)",
                    boxShadow: currentTurn === 2 ? "0 0 28px rgba(0,229,255,0.25)" : "none",
                  }}>
                  <div className="p-3 text-center">
                    <p className="text-xs font-black truncate mb-1"
                      style={{ color: currentTurn === 2 ? "#00e5ff" : "rgba(0,229,255,0.5)" }}>
                      {team2Name}
                    </p>
                    <p className="text-5xl font-black"
                      style={{ color: "#00e5ff", textShadow: currentTurn === 2 ? "0 0 28px #00e5ff" : "0 0 12px #00e5ff50" }}>
                      {team2Score}
                    </p>
                    <p className="text-xs mt-1 font-bold"
                      style={{ color: currentTurn === 2 ? "#00e5ff" : "rgba(0,229,255,0.35)" }}>
                      {currentTurn === 2 ? "⚡ دورهم" : "درجات"}
                    </p>
                  </div>
                </div>

              </div>

              {/* Double badge */}
              {doubleActive && (
                <motion.div
                  animate={{ scale: [1, 1.04, 1] }}
                  transition={{ repeat: Infinity, duration: 1 }}
                  className="w-full max-w-2xl rounded-2xl border-2 py-2.5 text-center font-black text-xl"
                  style={{ borderColor: "#ffd600", background: "rgba(255,214,0,0.1)", color: "#ffd600",
                    boxShadow: "0 0 24px rgba(255,214,0,0.3)" }}>
                  ⚡ DOUBLE × 2 ⚡
                </motion.div>
              )}

              {/* ── Volume bar ── */}
              <div className="w-full max-w-2xl flex items-center gap-3">
                <button onClick={() => setVolume(v => v === 0 ? 60 : 0)}
                  className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center border border-purple-500/20 text-purple-400/55 hover:text-purple-200 transition-all">
                  {volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
                </button>
                <input
                  type="range" min={0} max={100} value={volume}
                  dir="ltr"
                  onChange={e => setVolume(Number(e.target.value))}
                  className="flex-1 appearance-none h-2.5 rounded-full outline-none cursor-pointer"
                  style={{
                    background: `linear-gradient(to right, #e040fb ${volume}%, rgba(255,255,255,0.08) ${volume}%)`,
                    accentColor: "#e040fb",
                  }}
                />
                <span className="text-sm text-purple-400/45 w-8 text-left font-bold tabular-nums">{volume}</span>
              </div>

              {/* ── Playback buttons ── */}
              {!showAnswer && (
                <div className="w-full max-w-2xl grid grid-cols-3 gap-3">
                  <motion.button
                    onClick={audioState === "playing" ? pauseAudio : playAudio}
                    whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.95 }}
                    className="flex items-center justify-center gap-2 py-4 rounded-2xl font-black text-base"
                    style={{
                      background: audioState === "playing" ? "rgba(239,68,68,0.14)" : "rgba(34,197,94,0.14)",
                      border: `1px solid ${audioState === "playing" ? "rgba(239,68,68,0.4)" : "rgba(34,197,94,0.4)"}`,
                      color: audioState === "playing" ? "#ef4444" : "#22c55e",
                    }}>
                    {audioState === "playing"
                      ? <><Pause size={18} fill="currentColor" /> إيقاف</>
                      : <><Play size={18} fill="currentColor" /> تشغيل</>}
                  </motion.button>

                  <motion.button onClick={replayAudio}
                    whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.95 }}
                    className="flex items-center justify-center gap-2 py-4 rounded-2xl font-black text-base border border-purple-500/25 text-purple-300/60 hover:text-purple-200 transition-all">
                    <RefreshCw size={18} /> إعادة
                  </motion.button>

                  <motion.button onClick={handleShowAnswer}
                    whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.95 }}
                    className="flex items-center justify-center gap-2 py-4 rounded-2xl font-black text-base"
                    style={{ background: "rgba(251,146,60,0.15)", border: "1px solid rgba(251,146,60,0.45)", color: "#fb923c" }}>
                    <Eye size={18} /> الإجابة
                  </motion.button>
                </div>
              )}

              {/* ── Add minute button ── */}
              {!showAnswer && (
                <motion.button onClick={addExtraTime} disabled={currentExtraUsed}
                  whileHover={currentExtraUsed ? {} : { scale: 1.02 }}
                  whileTap={currentExtraUsed ? {} : { scale: 0.97 }}
                  className="w-full max-w-2xl flex items-center justify-center gap-3 py-4 rounded-2xl border transition-all"
                  style={{
                    background: currentExtraUsed ? "rgba(99,102,241,0.04)" : "rgba(99,102,241,0.12)",
                    borderColor: currentExtraUsed ? "rgba(99,102,241,0.14)" : "rgba(99,102,241,0.44)",
                    color: currentExtraUsed ? "rgba(129,140,248,0.3)" : "#818cf8",
                    cursor: currentExtraUsed ? "not-allowed" : "pointer",
                  }}>
                  <Timer size={18} className="flex-shrink-0" />
                  <div className="flex flex-col items-start">
                    <span className="font-black text-base leading-tight">
                      {currentExtraUsed ? "زيادة الدقيقة مستخدمة ✓" : "زيادة دقيقة (+60 ثانية)"}
                    </span>
                    {!currentExtraUsed && (
                      <span className="text-xs font-bold" style={{ color: "rgba(129,140,248,0.5)" }}>
                        استخدام مرة واحدة لكل فريق
                      </span>
                    )}
                  </div>
                </motion.button>
              )}

              {/* ── Answer reveal ── */}
              <AnimatePresence>
                {showAnswer && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    className="w-full max-w-2xl space-y-4">
                    {/* Song card */}
                    <div className="rounded-2xl border border-green-500/28 overflow-hidden"
                      style={{ background: "linear-gradient(135deg, rgba(34,197,94,0.09), rgba(16,185,129,0.05))" }}>
                      <div className="flex items-center gap-5 p-5">
                        <motion.img src="/song-logo.jpg" alt="🎵"
                          className="w-20 h-20 rounded-2xl object-cover flex-shrink-0"
                          style={{ border: "2px solid rgba(34,197,94,0.3)" }}
                          animate={{ scale: [1, 1.04, 1] }}
                          transition={{ repeat: Infinity, duration: 2.5 }} />
                        <div>
                          <p className="text-sm text-green-400/60 mb-1">الإجابة الصحيحة</p>
                          <p className="text-3xl font-black text-green-300">{currentSong.title}</p>
                          <p className="text-lg text-green-400/70 mt-0.5 font-bold">{currentSong.artist}</p>
                        </div>
                      </div>
                    </div>

                    {/* Award buttons */}
                    <div className="grid grid-cols-2 gap-4">
                      <motion.button onClick={() => awardPoint(1)}
                        whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                        className="py-6 rounded-2xl font-black text-xl"
                        style={{
                          background: "linear-gradient(135deg, rgba(224,64,251,0.22), rgba(224,64,251,0.09))",
                          border: "1px solid rgba(224,64,251,0.5)", color: "#e040fb",
                          boxShadow: "0 0 24px rgba(224,64,251,0.2)",
                        }}>
                        +{doubleActive ? 2 : 1} {team1Name}
                      </motion.button>
                      <motion.button onClick={() => awardPoint(2)}
                        whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                        className="py-6 rounded-2xl font-black text-xl"
                        style={{
                          background: "linear-gradient(135deg, rgba(0,229,255,0.18), rgba(0,229,255,0.07))",
                          border: "1px solid rgba(0,229,255,0.45)", color: "#00e5ff",
                          boxShadow: "0 0 24px rgba(0,229,255,0.18)",
                        }}>
                        +{doubleActive ? 2 : 1} {team2Name}
                      </motion.button>
                    </div>

                    <button onClick={replayAudio}
                      className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-purple-500/18 text-purple-400/35 hover:text-purple-300 transition-all text-sm">
                      <RefreshCw size={14} /> إعادة تشغيل المقطع
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

            </motion.div>
          )}

          {/* ════════════════════ ENDED ════════════════════ */}
          {phase === "ended" && (
            <motion.div key="ended"
              initial={{ opacity: 0, scale: 0.88 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4 }}
              className="flex-1 flex flex-col items-center justify-center gap-8 px-5 py-8">

              <motion.div animate={{ y: [0, -16, 0] }} transition={{ repeat: Infinity, duration: 2.4 }}>
                <Trophy size={100} className="text-yellow-400"
                  style={{ filter: "drop-shadow(0 0 32px #ffd600)" }} />
              </motion.div>

              <div className="text-center">
                <p className="text-lg text-purple-300/35 mb-2">الفائز</p>
                <h2 className="text-5xl sm:text-6xl font-black neon-text-pink">{winner}</h2>
              </div>

              <div className="flex gap-16 justify-center">
                <div className="text-center">
                  <p className="text-base font-bold mb-2" style={{ color: "#e040fb70" }}>{team1Name}</p>
                  <p className="text-6xl font-black" style={{ color: "#e040fb" }}>{team1Score}</p>
                </div>
                <div className="flex items-center text-purple-500/25 font-black text-4xl">VS</div>
                <div className="text-center">
                  <p className="text-base font-bold mb-2" style={{ color: "#00e5ff70" }}>{team2Name}</p>
                  <p className="text-6xl font-black" style={{ color: "#00e5ff" }}>{team2Score}</p>
                </div>
              </div>

              <div className="flex gap-4 mt-2">
                <motion.button onClick={resetFull}
                  whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
                  className="px-10 py-4 rounded-2xl font-black text-lg border border-pink-500/38 text-pink-400 hover:bg-pink-500/10 transition-all">
                  لعبة جديدة
                </motion.button>
                <button onClick={() => navigate("/")}
                  className="px-10 py-4 rounded-2xl font-bold text-lg border border-purple-500/18 text-purple-400/45 hover:text-purple-300 transition-all">
                  الرئيسية
                </button>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}
