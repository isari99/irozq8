import { Router, type IRouter } from "express";
import { db, questionsTable } from "@workspace/db";

const router: IRouter = Router();

const QUESTIONS = [
  // ─── ديني ───────────────────────────────────────────────────────────────
  { text: "كم عدد أركان الإسلام؟", choices: ["3", "4", "5", "6"], correctAnswer: 3, category: "ديني" },
  { text: "كم عدد الصلوات المفروضة في اليوم؟", choices: ["3", "4", "5", "6"], correctAnswer: 3, category: "ديني" },
  { text: "ما هي أول سورة في القرآن الكريم؟", choices: ["البقرة", "الفاتحة", "الإخلاص", "الناس"], correctAnswer: 2, category: "ديني" },
  { text: "في أي شهر يصوم المسلمون؟", choices: ["محرم", "رجب", "رمضان", "شعبان"], correctAnswer: 3, category: "ديني" },
  { text: "أين تقع الكعبة المشرفة؟", choices: ["المدينة المنورة", "الرياض", "مكة المكرمة", "جدة"], correctAnswer: 3, category: "ديني" },
  { text: "كم عدد أجزاء القرآن الكريم؟", choices: ["20", "25", "28", "30"], correctAnswer: 4, category: "ديني" },
  { text: "ما اسم نبي الله الذي بُلع بالحوت؟", choices: ["موسى", "يونس", "إبراهيم", "عيسى"], correctAnswer: 2, category: "ديني" },
  { text: "كم عدد أنبياء الله المذكورين في القرآن؟", choices: ["20", "25", "30", "35"], correctAnswer: 2, category: "ديني" },
  { text: "ما هي أطول سورة في القرآن الكريم؟", choices: ["آل عمران", "النساء", "البقرة", "المائدة"], correctAnswer: 3, category: "ديني" },
  { text: "ما هو أقصر سورة في القرآن الكريم؟", choices: ["الإخلاص", "الفاتحة", "الكوثر", "الناس"], correctAnswer: 3, category: "ديني" },
  { text: "من هو النبي المعروف ببناء السفينة؟", choices: ["إبراهيم", "نوح", "آدم", "هود"], correctAnswer: 2, category: "ديني" },
  { text: "كم سنة امتدت نبوة نوح عليه السلام؟", choices: ["500", "700", "950", "1000"], correctAnswer: 3, category: "ديني" },

  // ─── حيوانات ─────────────────────────────────────────────────────────────
  { text: "ما هو أكبر حيوان في العالم؟", choices: ["الفيل", "الحوت الأزرق", "القرش", "الزرافة"], correctAnswer: 2, category: "حيوانات" },
  { text: "ما هو أسرع حيوان بري في العالم؟", choices: ["الأسد", "الحصان", "الفهد", "النمر"], correctAnswer: 3, category: "حيوانات" },
  { text: "ما لقب الجمل؟", choices: ["ملك الغابة", "سفينة الصحراء", "سيد الفلوات", "فرس البحر"], correctAnswer: 2, category: "حيوانات" },
  { text: "كم يوماً تحمل الفيلة صغارها؟", choices: ["90 يوماً", "200 يوماً", "400 يوماً", "640 يوماً"], correctAnswer: 4, category: "حيوانات" },
  { text: "ما هو الحيوان الأكثر قتلاً للبشر؟", choices: ["الأسد", "التمساح", "البعوضة", "الثعبان"], correctAnswer: 3, category: "حيوانات" },
  { text: "كم عدد أرجل الأخطبوط؟", choices: ["6", "7", "8", "10"], correctAnswer: 3, category: "حيوانات" },
  { text: "ما هو الحيوان الذي لا ينام أبداً؟", choices: ["الدلفين", "الضفدع", "السمك القرش", "النملة"], correctAnswer: 1, category: "حيوانات" },
  { text: "كم عمر السلحفاة عادةً؟", choices: ["20 سنة", "50 سنة", "100 سنة", "200 سنة"], correctAnswer: 3, category: "حيوانات" },
  { text: "أي هذه الحيوانات لا يشرب الماء؟", choices: ["الجمل", "الكنغر", "الكوالا", "القط"], correctAnswer: 3, category: "حيوانات" },
  { text: "ما هو أطول حيوان في العالم؟", choices: ["الفيل", "الزرافة", "الجمل", "الحصان"], correctAnswer: 2, category: "حيوانات" },

  // ─── علوم ────────────────────────────────────────────────────────────────
  { text: "ما هو الكوكب الأقرب للشمس؟", choices: ["الأرض", "الزهرة", "المريخ", "عطارد"], correctAnswer: 4, category: "علوم" },
  { text: "كم يبلغ عدد عظام جسم الإنسان البالغ؟", choices: ["156", "206", "256", "306"], correctAnswer: 2, category: "علوم" },
  { text: "ما هو أكثر غاز في الغلاف الجوي؟", choices: ["الأكسجين", "ثاني أكسيد الكربون", "النيتروجين", "الهيليوم"], correctAnswer: 3, category: "علوم" },
  { text: "ما هو الجهاز الذي يضخ الدم في الجسم؟", choices: ["الرئة", "الكلية", "القلب", "الكبد"], correctAnswer: 3, category: "علوم" },
  { text: "ما هو الكوكب الأكبر في المجموعة الشمسية؟", choices: ["زحل", "المشتري", "أورانوس", "نبتون"], correctAnswer: 2, category: "علوم" },
  { text: "ماذا يُقاس بالمقياس الريختر؟", choices: ["درجة الحرارة", "قوة الزلازل", "سرعة الرياح", "الضغط الجوي"], correctAnswer: 2, category: "علوم" },
  { text: "ما هو الرمز الكيميائي للذهب؟", choices: ["Go", "Gd", "Au", "Ag"], correctAnswer: 3, category: "علوم" },
  { text: "كم سرعة الضوء في الثانية تقريباً؟", choices: ["30 ألف كم", "300 ألف كم", "3 مليون كم", "30 مليون كم"], correctAnswer: 2, category: "علوم" },
  { text: "أي عضو في الجسم ينتج الصفراء؟", choices: ["البنكرياس", "الكلية", "الكبد", "المعدة"], correctAnswer: 3, category: "علوم" },
  { text: "ما هي درجة غليان الماء بالسيلزيوس؟", choices: ["50", "75", "90", "100"], correctAnswer: 4, category: "علوم" },

  // ─── عام ─────────────────────────────────────────────────────────────────
  { text: "كم عدد قارات العالم؟", choices: ["5", "6", "7", "8"], correctAnswer: 3, category: "عام" },
  { text: "ما هي أكبر قارة في العالم؟", choices: ["أفريقيا", "أمريكا", "آسيا", "أوروبا"], correctAnswer: 3, category: "عام" },
  { text: "ما هو أطول نهر في العالم؟", choices: ["الأمازون", "النيل", "الفرات", "دجلة"], correctAnswer: 2, category: "عام" },
  { text: "ما هي عاصمة فرنسا؟", choices: ["برلين", "مدريد", "روما", "باريس"], correctAnswer: 4, category: "عام" },
  { text: "كم عدد الألوان في قوس قزح؟", choices: ["5", "6", "7", "8"], correctAnswer: 3, category: "عام" },
  { text: "ما هي أصغر دولة في العالم؟", choices: ["موناكو", "سان مارينو", "الفاتيكان", "ليختنشتاين"], correctAnswer: 3, category: "عام" },
  { text: "كم دقيقة في الساعة؟", choices: ["30", "50", "60", "100"], correctAnswer: 3, category: "عام" },
  { text: "ما هي أعلى قمة جبلية في العالم؟", choices: ["جبل ألبس", "جبل أوليمبوس", "جبل إيفرست", "جبل كيليمنجارو"], correctAnswer: 3, category: "عام" },
  { text: "ما هي عاصمة اليابان؟", choices: ["بكين", "سيول", "طوكيو", "بانكوك"], correctAnswer: 3, category: "عام" },
  { text: "ما هو أكبر محيط في العالم؟", choices: ["الأطلسي", "الهندي", "الهادئ", "المتجمد الشمالي"], correctAnswer: 3, category: "عام" },
  { text: "في أي قارة توجد مصر؟", choices: ["آسيا", "أوروبا", "أفريقيا", "أمريكا"], correctAnswer: 3, category: "عام" },
  { text: "كم عدد أيام شهر فبراير في السنة العادية؟", choices: ["27", "28", "29", "30"], correctAnswer: 2, category: "عام" },
  { text: "ما هي عاصمة المملكة العربية السعودية؟", choices: ["جدة", "مكة", "الرياض", "الدمام"], correctAnswer: 3, category: "عام" },

  // ─── خفيف ────────────────────────────────────────────────────────────────
  { text: "ما الذي يحدث عندما تخلط الأزرق بالأصفر؟", choices: ["أحمر", "برتقالي", "أخضر", "بنفسجي"], correctAnswer: 3, category: "خفيف" },
  { text: "ما هو الطعام الذي يُصنع منه الشوكولاتة؟", choices: ["الكاكاو", "القهوة", "القصب", "التفاح"], correctAnswer: 1, category: "خفيف" },
  { text: "كم قدماً للإنسان؟", choices: ["1", "2", "3", "4"], correctAnswer: 2, category: "خفيف" },
  { text: "ما اسم صوت البطة؟", choices: ["مواء", "نعيق", "قرقرة", "كواك"], correctAnswer: 4, category: "خفيف" },
  { text: "ما الذي يكثر في الصحراء؟", choices: ["الثلج", "الأمطار", "الرمال", "الأشجار"], correctAnswer: 3, category: "خفيف" },
  { text: "أين تعيش السمكة؟", choices: ["في البر", "في الماء", "في الهواء", "في الجبال"], correctAnswer: 2, category: "خفيف" },
  { text: "ما اسم كوكبنا؟", choices: ["المريخ", "الزهرة", "الأرض", "القمر"], correctAnswer: 3, category: "خفيف" },
  { text: "ما الذي ينتج منه العسل؟", choices: ["الفراشات", "النحل", "الدود", "البعوض"], correctAnswer: 2, category: "خفيف" },
  { text: "كم لون يحتوي عليه العلم العربي السعودي؟", choices: ["1", "2", "3", "4"], correctAnswer: 2, category: "خفيف" },
  { text: "ماذا يأكل الأرنب؟", choices: ["اللحم", "الأسماك", "الجزر والخضار", "الفراولة فقط"], correctAnswer: 3, category: "خفيف" },

  // ─── أغاني ───────────────────────────────────────────────────────────────
  { text: "من يغني أغنية 'بشرة خير'؟", choices: ["راشد الماجد", "محمد عبده", "حسين الجسمي", "ماجد المهندس"], correctAnswer: 3, category: "أغاني" },
  { text: "من يُلقّب بـ 'فنان العرب'؟", choices: ["طلال مداح", "محمد عبده", "عبادي الجوهر", "أبو بكر سالم"], correctAnswer: 2, category: "أغاني" },
  { text: "من يغني 'يا مال الشام'؟", choices: ["عبادي الجوهر", "طلال مداح", "محمد عبده", "أبو بكر سالم"], correctAnswer: 3, category: "أغاني" },
  { text: "من يغني 'وينك'؟", choices: ["محمد عبده", "راشد الماجد", "ماجد المهندس", "عبدالله الرويشد"], correctAnswer: 3, category: "أغاني" },
  { text: "من يغني أغنية 'ليلة العمر'؟", choices: ["راشد الماجد", "محمد عبده", "عبادي الجوهر", "أصيل أبو بكر"], correctAnswer: 1, category: "أغاني" },
  { text: "من يغني 'سلمى يا سلامة'؟", choices: ["ماجد المهندس", "عمرو دياب", "راغب علامة", "وائل جسار"], correctAnswer: 2, category: "أغاني" },
  { text: "من يغني 'قسماً'؟", choices: ["كاظم الساهر", "ناظم الغزالي", "فيروز", "أم كلثوم"], correctAnswer: 1, category: "أغاني" },
  { text: "من تغني 'بوسى الوجوه'؟", choices: ["أصالة", "نوال الزغبي", "إليسا", "نانسي عجرم"], correctAnswer: 4, category: "أغاني" },
  { text: "من تُلقّب بـ 'صوت لبنان'؟", choices: ["نانسي عجرم", "فيروز", "مايا دياب", "هيفا وهبي"], correctAnswer: 2, category: "أغاني" },
  { text: "من يغني 'حبيبي وطني'؟", choices: ["جورج وسوف", "وائل كفوري", "ماجد المهندس", "عمرو دياب"], correctAnswer: 1, category: "أغاني" },
];

// Force reseed: delete all questions and re-insert
router.post("/seed", async (req, res): Promise<void> => {
  try {
    // Clear existing questions
    await db.delete(questionsTable);
    // Insert all questions
    await db.insert(questionsTable).values(QUESTIONS);
    res.json({ message: "تم تحديث بنك الأسئلة بنجاح", count: QUESTIONS.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
