import { Router, type IRouter } from "express";
import { db, questionsTable } from "@workspace/db";

const router: IRouter = Router();

const QUESTIONS = [
  // --- ديني ---
  {
    text: "كم عدد أركان الإسلام؟",
    choices: ["3", "5", "7", "10"],
    correctAnswer: 2,
    category: "ديني",
  },
  {
    text: "كم عدد الصلوات المفروضة في اليوم؟",
    choices: ["3", "4", "5", "6"],
    correctAnswer: 3,
    category: "ديني",
  },
  {
    text: "ما هي أول سورة في القرآن الكريم؟",
    choices: ["البقرة", "الفاتحة", "الإخلاص", "الناس"],
    correctAnswer: 2,
    category: "ديني",
  },
  {
    text: "في أي شهر يصوم المسلمون؟",
    choices: ["محرم", "رجب", "رمضان", "شعبان"],
    correctAnswer: 3,
    category: "ديني",
  },
  {
    text: "أين تقع الكعبة المشرفة؟",
    choices: ["المدينة المنورة", "الرياض", "مكة المكرمة", "جدة"],
    correctAnswer: 3,
    category: "ديني",
  },
  {
    text: "كم عدد أجزاء القرآن الكريم؟",
    choices: ["20", "25", "28", "30"],
    correctAnswer: 4,
    category: "ديني",
  },
  // --- عام ---
  {
    text: "كم عدد أيام الأسبوع؟",
    choices: ["5", "6", "7", "8"],
    correctAnswer: 3,
    category: "عام",
  },
  {
    text: "كم عدد قارات العالم؟",
    choices: ["5", "6", "7", "8"],
    correctAnswer: 3,
    category: "عام",
  },
  {
    text: "ما هو الكوكب الأقرب للشمس؟",
    choices: ["الأرض", "الزهرة", "المريخ", "عطارد"],
    correctAnswer: 4,
    category: "عام",
  },
  {
    text: "ما لقب الجمل؟",
    choices: ["ملك الغابة", "سفينة الصحراء", "سيد الفلوات", "فرس البحر"],
    correctAnswer: 2,
    category: "عام",
  },
  {
    text: "كم عدد ساعات اليوم؟",
    choices: ["12", "20", "24", "48"],
    correctAnswer: 3,
    category: "عام",
  },
  {
    text: "ما هي أكبر قارة في العالم؟",
    choices: ["أفريقيا", "أمريكا", "آسيا", "أوروبا"],
    correctAnswer: 3,
    category: "عام",
  },
  {
    text: "كم عدد الألوان الأساسية؟",
    choices: ["2", "3", "4", "5"],
    correctAnswer: 2,
    category: "عام",
  },
  {
    text: "ما هو أطول نهر في العالم؟",
    choices: ["الأمازون", "النيل", "الفرات", "دجلة"],
    correctAnswer: 2,
    category: "عام",
  },
  // --- أغاني ---
  {
    text: "من يغني أغنية 'بشرة خير'؟",
    choices: ["راشد الماجد", "محمد عبده", "حسين الجسمي", "ماجد المهندس"],
    correctAnswer: 3,
    category: "أغاني",
  },
  {
    text: "من يغني أغنية 'يا مال الشام'؟",
    choices: ["عبادي الجوهر", "طلال مداح", "محمد عبده", "أبو بكر سالم"],
    correctAnswer: 3,
    category: "أغاني",
  },
  {
    text: "من يغني 'وينك'؟",
    choices: ["محمد عبده", "راشد الماجد", "ماجد المهندس", "عبدالله الرويشد"],
    correctAnswer: 3,
    category: "أغاني",
  },
  {
    text: "من يغني أغنية 'ليلة العمر'؟",
    choices: ["راشد الماجد", "محمد عبده", "عبادي الجوهر", "أصيل أبو بكر"],
    correctAnswer: 1,
    category: "أغاني",
  },
  {
    text: "من يُلقّب بـ 'فنان العرب'؟",
    choices: ["طلال مداح", "محمد عبده", "عبادي الجوهر", "أبو بكر سالم"],
    correctAnswer: 2,
    category: "أغاني",
  },
  {
    text: "من يغني 'عيون الغزال'؟",
    choices: ["عبدالكريم عبدالقادر", "طلال مداح", "راشد الماجد", "مطرف المطرف"],
    correctAnswer: 1,
    category: "أغاني",
  },
  {
    text: "من يغني 'سلمى يا سلامة'؟",
    choices: ["ماجد المهندس", "عمرو دياب", "راغب علامة", "وائل جسار"],
    correctAnswer: 2,
    category: "أغاني",
  },
];

// One-time seed endpoint
router.post("/seed", async (req, res): Promise<void> => {
  const existing = await db.select().from(questionsTable).limit(1);
  if (existing.length > 0) {
    res.json({ message: "البنك ممتلئ بالفعل", count: existing.length });
    return;
  }

  await db.insert(questionsTable).values(QUESTIONS);
  res.json({ message: "تم إضافة الأسئلة بنجاح", count: QUESTIONS.length });
});

export default router;
