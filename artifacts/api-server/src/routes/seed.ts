import { Router, type IRouter } from "express";
import { db, questionsTable } from "@workspace/db";

const router: IRouter = Router();

const QUESTIONS = [
  // ─── الدين ───────────────────────────────────────────────────────────────
  { text: "كم عدد أركان الإسلام؟", choices: ["3", "4", "5", "6"], correctAnswer: 3, category: "ديني" },
  { text: "كم عدد الصلوات المفروضة في اليوم؟", choices: ["3", "4", "5", "6"], correctAnswer: 3, category: "ديني" },
  { text: "ما هي أول سورة في القرآن الكريم؟", choices: ["البقرة", "الفاتحة", "الإخلاص", "الناس"], correctAnswer: 2, category: "ديني" },
  { text: "في أي شهر يصوم المسلمون؟", choices: ["محرم", "رجب", "رمضان", "شعبان"], correctAnswer: 3, category: "ديني" },
  { text: "أين تقع الكعبة المشرفة؟", choices: ["المدينة المنورة", "الرياض", "مكة المكرمة", "جدة"], correctAnswer: 3, category: "ديني" },
  { text: "كم عدد أجزاء القرآن الكريم؟", choices: ["20", "25", "28", "30"], correctAnswer: 4, category: "ديني" },
  { text: "ما اسم نبي الله الذي ابتُلع بالحوت؟", choices: ["موسى", "يونس", "إبراهيم", "عيسى"], correctAnswer: 2, category: "ديني" },
  { text: "كم عدد أنبياء الله المذكورين في القرآن؟", choices: ["20", "25", "30", "35"], correctAnswer: 2, category: "ديني" },
  { text: "ما هي أطول سورة في القرآن الكريم؟", choices: ["آل عمران", "النساء", "البقرة", "المائدة"], correctAnswer: 3, category: "ديني" },
  { text: "ما هو أقصر سورة في القرآن الكريم؟", choices: ["الإخلاص", "الفاتحة", "الكوثر", "الناس"], correctAnswer: 3, category: "ديني" },
  { text: "من بنى السفينة بأمر من الله؟", choices: ["إبراهيم", "نوح", "آدم", "هود"], correctAnswer: 2, category: "ديني" },
  { text: "ما هو ركن الإسلام الرابع؟", choices: ["الصلاة", "الصوم", "الزكاة", "الحج"], correctAnswer: 2, category: "ديني" },
  { text: "في أي عام هُجر النبي ﷺ من مكة للمدينة؟", choices: ["600م", "622م", "650م", "700م"], correctAnswer: 2, category: "ديني" },
  { text: "ما اسم زوجة النبي الأولى؟", choices: ["عائشة", "فاطمة", "خديجة", "زينب"], correctAnswer: 3, category: "ديني" },

  // ─── حيوانات ─────────────────────────────────────────────────────────────
  { text: "ما هو أكبر حيوان في العالم؟", choices: ["الفيل", "الحوت الأزرق", "القرش", "الزرافة"], correctAnswer: 2, category: "حيوانات" },
  { text: "ما هو أسرع حيوان بري في العالم؟", choices: ["الأسد", "الحصان", "الفهد", "النمر"], correctAnswer: 3, category: "حيوانات" },
  { text: "ما لقب الجمل؟", choices: ["ملك الغابة", "سفينة الصحراء", "سيد الفلوات", "فرس البحر"], correctAnswer: 2, category: "حيوانات" },
  { text: "ما هو الحيوان الأكثر قتلاً للبشر؟", choices: ["الأسد", "التمساح", "البعوضة", "الثعبان"], correctAnswer: 3, category: "حيوانات" },
  { text: "كم عدد أرجل الأخطبوط؟", choices: ["6", "7", "8", "10"], correctAnswer: 3, category: "حيوانات" },
  { text: "ما هو أطول حيوان في العالم؟", choices: ["الفيل", "الزرافة", "الجمل", "الحصان"], correctAnswer: 2, category: "حيوانات" },
  { text: "أي هذه الحيوانات لا يشرب الماء مباشرة؟", choices: ["الجمل", "الكنغر", "الكوالا", "القط"], correctAnswer: 3, category: "حيوانات" },
  { text: "كم سنة يعيش الفيل تقريباً؟", choices: ["30", "50", "70", "100"], correctAnswer: 3, category: "حيوانات" },
  { text: "ما اسم صوت الضفادع؟", choices: ["زقزقة", "نعيق", "نقيق", "هديل"], correctAnswer: 3, category: "حيوانات" },
  { text: "ما هو الحيوان الوحيد الذي لا يستطيع القفز؟", choices: ["الزرافة", "الفيل", "الحمار", "الأرنب"], correctAnswer: 2, category: "حيوانات" },
  { text: "كم عدد المعدات في الجمل؟", choices: ["1", "2", "3", "4"], correctAnswer: 1, category: "حيوانات" },
  { text: "ما اسم الحيوان المائي الثديي الأكبر؟", choices: ["القرش الحوتي", "الحوت الأزرق", "الدلفين العملاق", "خيل البحر"], correctAnswer: 2, category: "حيوانات" },

  // ─── علوم ────────────────────────────────────────────────────────────────
  { text: "ما هو الكوكب الأقرب للشمس؟", choices: ["الأرض", "الزهرة", "المريخ", "عطارد"], correctAnswer: 4, category: "علوم" },
  { text: "كم يبلغ عدد عظام جسم الإنسان البالغ؟", choices: ["156", "206", "256", "306"], correctAnswer: 2, category: "علوم" },
  { text: "ما هو أكثر غاز في الغلاف الجوي؟", choices: ["الأكسجين", "ثاني أكسيد الكربون", "النيتروجين", "الهيليوم"], correctAnswer: 3, category: "علوم" },
  { text: "ما هو الرمز الكيميائي للذهب؟", choices: ["Go", "Gd", "Au", "Ag"], correctAnswer: 3, category: "علوم" },
  { text: "كم سرعة الضوء في الثانية تقريباً؟", choices: ["30 ألف كم", "300 ألف كم", "3 مليون كم", "30 مليون كم"], correctAnswer: 2, category: "علوم" },
  { text: "ما هو الكوكب الأكبر في المجموعة الشمسية؟", choices: ["زحل", "المشتري", "أورانوس", "نبتون"], correctAnswer: 2, category: "علوم" },
  { text: "ماذا يُقاس بالمقياس الريختر؟", choices: ["درجة الحرارة", "قوة الزلازل", "سرعة الرياح", "الضغط الجوي"], correctAnswer: 2, category: "علوم" },
  { text: "أي عضو ينتج الصفراء؟", choices: ["البنكرياس", "الكلية", "الكبد", "المعدة"], correctAnswer: 3, category: "علوم" },
  { text: "ما درجة غليان الماء بالسيلزيوس؟", choices: ["50", "75", "90", "100"], correctAnswer: 4, category: "علوم" },
  { text: "ما اسم العالم الذي اكتشف الجاذبية؟", choices: ["أينشتاين", "نيوتن", "غاليليو", "باسكال"], correctAnswer: 2, category: "علوم" },
  { text: "ما هو الرمز الكيميائي للماء؟", choices: ["HO", "H2O", "CO2", "H2O2"], correctAnswer: 2, category: "علوم" },
  { text: "كم عدد ألوان الطيف الضوئي؟", choices: ["5", "6", "7", "8"], correctAnswer: 3, category: "علوم" },
  { text: "ما هو أصغر جسيم في الذرة؟", choices: ["البروتون", "النيوترون", "الإلكترون", "النواة"], correctAnswer: 3, category: "علوم" },

  // ─── ثقافة عامة ──────────────────────────────────────────────────────────
  { text: "ما هي عاصمة فرنسا؟", choices: ["برلين", "مدريد", "روما", "باريس"], correctAnswer: 4, category: "ثقافة عامة" },
  { text: "كم عدد الألوان في قوس قزح؟", choices: ["5", "6", "7", "8"], correctAnswer: 3, category: "ثقافة عامة" },
  { text: "ما هي أصغر دولة في العالم؟", choices: ["موناكو", "سان مارينو", "الفاتيكان", "ليختنشتاين"], correctAnswer: 3, category: "ثقافة عامة" },
  { text: "من هو مؤلف رواية الجريمة والعقاب؟", choices: ["تولستوي", "دوستويفسكي", "تشيخوف", "بوشكين"], correctAnswer: 2, category: "ثقافة عامة" },
  { text: "في أي مدينة توجد برج إيفل؟", choices: ["لندن", "روما", "باريس", "مدريد"], correctAnswer: 3, category: "ثقافة عامة" },
  { text: "ما هو طول سور الصين العظيم تقريباً؟", choices: ["5000 كم", "10000 كم", "21000 كم", "50000 كم"], correctAnswer: 3, category: "ثقافة عامة" },
  { text: "من رسم لوحة الموناليزا؟", choices: ["ميكيلانجيلو", "رفائيل", "ليوناردو دافنشي", "رامبرانت"], correctAnswer: 3, category: "ثقافة عامة" },
  { text: "كم لغة رسمية للأمم المتحدة؟", choices: ["4", "5", "6", "7"], correctAnswer: 3, category: "ثقافة عامة" },

  // ─── تاريخ ───────────────────────────────────────────────────────────────
  { text: "في أي عام انتهت الحرب العالمية الثانية؟", choices: ["1942", "1943", "1945", "1950"], correctAnswer: 3, category: "تاريخ" },
  { text: "من اخترع الطائرة؟", choices: ["إديسون", "الأخوان رايت", "نيوتن", "غراهام بيل"], correctAnswer: 2, category: "تاريخ" },
  { text: "أين وُلد النبي محمد ﷺ؟", choices: ["المدينة المنورة", "الطائف", "مكة المكرمة", "جدة"], correctAnswer: 3, category: "تاريخ" },
  { text: "من بنى الأهرامات؟", choices: ["الرومان", "الإغريق", "المصريون القدماء", "الفينيقيون"], correctAnswer: 3, category: "تاريخ" },
  { text: "متى اكتشف كولومبوس أمريكا؟", choices: ["1392", "1492", "1592", "1692"], correctAnswer: 2, category: "تاريخ" },
  { text: "ما هو أقدم حضارة في التاريخ؟", choices: ["الرومانية", "المصرية", "السومرية", "الفارسية"], correctAnswer: 3, category: "تاريخ" },
  { text: "في أي عام سقط جدار برلين؟", choices: ["1985", "1987", "1989", "1991"], correctAnswer: 3, category: "تاريخ" },
  { text: "من اخترع التلفون؟", choices: ["إديسون", "غراهام بيل", "فاراداي", "ماركوني"], correctAnswer: 2, category: "تاريخ" },
  { text: "في أي دولة قامت ثورة أكتوبر عام 1917؟", choices: ["فرنسا", "ألمانيا", "روسيا", "بريطانيا"], correctAnswer: 3, category: "تاريخ" },
  { text: "من كان أول رئيس للولايات المتحدة؟", choices: ["أبراهام لينكولن", "جورج واشنطن", "توماس جيفرسون", "جون آدمز"], correctAnswer: 2, category: "تاريخ" },

  // ─── جغرافيا ─────────────────────────────────────────────────────────────
  { text: "ما هي أكبر قارة في العالم؟", choices: ["أفريقيا", "أمريكا", "آسيا", "أوروبا"], correctAnswer: 3, category: "جغرافيا" },
  { text: "ما هو أطول نهر في العالم؟", choices: ["الأمازون", "النيل", "الفرات", "دجلة"], correctAnswer: 2, category: "جغرافيا" },
  { text: "ما هو أعمق محيط في العالم؟", choices: ["الأطلسي", "الهندي", "الهادئ", "المتجمد الشمالي"], correctAnswer: 3, category: "جغرافيا" },
  { text: "ما هي عاصمة اليابان؟", choices: ["بكين", "سيول", "طوكيو", "بانكوك"], correctAnswer: 3, category: "جغرافيا" },
  { text: "في أي قارة توجد مصر؟", choices: ["آسيا", "أوروبا", "أفريقيا", "أمريكا"], correctAnswer: 3, category: "جغرافيا" },
  { text: "ما هي أعلى قمة جبلية في العالم؟", choices: ["ألبس", "أوليمبوس", "إيفرست", "كيليمنجارو"], correctAnswer: 3, category: "جغرافيا" },
  { text: "ما هي عاصمة أستراليا؟", choices: ["سيدني", "ملبورن", "كانبيرا", "بريزبين"], correctAnswer: 3, category: "جغرافيا" },
  { text: "ما هو أكبر صحراء في العالم؟", choices: ["الربع الخالي", "الصحراء الكبرى", "كالاهاري", "القطب الجنوبي"], correctAnswer: 4, category: "جغرافيا" },
  { text: "ما هي الدولة الأكبر مساحةً في العالم؟", choices: ["الصين", "كندا", "روسيا", "الولايات المتحدة"], correctAnswer: 3, category: "جغرافيا" },
  { text: "أين يقع برج بيزا المائل؟", choices: ["فرنسا", "إسبانيا", "إيطاليا", "اليونان"], correctAnswer: 3, category: "جغرافيا" },

  // ─── رياضة ───────────────────────────────────────────────────────────────
  { text: "كم عدد لاعبي كرة القدم في كل فريق؟", choices: ["9", "10", "11", "12"], correctAnswer: 3, category: "رياضة" },
  { text: "كم مرة فازت البرازيل بكأس العالم؟", choices: ["3", "4", "5", "6"], correctAnswer: 3, category: "رياضة" },
  { text: "كم حلقة في شعار الأولمبياد؟", choices: ["4", "5", "6", "7"], correctAnswer: 2, category: "رياضة" },
  { text: "أين أُقيمت أول بطولة كأس عالم؟", choices: ["البرازيل", "فرنسا", "الأرجنتين", "أوروغواي"], correctAnswer: 4, category: "رياضة" },
  { text: "ما هو أطول سباق في ألعاب القوى؟", choices: ["5 كم", "10 كم", "21 كم", "42 كم"], correctAnswer: 4, category: "رياضة" },
  { text: "ما هو الرياضي الذي يُلقّب بـ 'الملك'؟", choices: ["محمد علي", "بيليه", "ماراديونا", "رونالدو"], correctAnswer: 2, category: "رياضة" },
  { text: "في أي رياضة يُستخدم المضرب والريشة؟", choices: ["التنس", "الريشة الطائرة", "تنس الطاولة", "الاسكواش"], correctAnswer: 2, category: "رياضة" },
  { text: "كم نقطة يكون التعادل في كرة القدم للجانبين؟", choices: ["0-0 فقط", "أي نتيجة متساوية", "1-1 فقط", "0-0 أو 1-1"], correctAnswer: 2, category: "رياضة" },
  { text: "ما اسم بطولة دوري أبطال أوروبا قديماً؟", choices: ["كأس الاتحاد", "الكأس الأوروبية للأبطال", "كأس UEFA", "درع الاتحاد"], correctAnswer: 2, category: "رياضة" },
  { text: "ما هو الفريق الأكثر تتويجاً بدوري أبطال أوروبا؟", choices: ["برشلونة", "بايرن ميونخ", "ريال مدريد", "يوفنتوس"], correctAnswer: 3, category: "رياضة" },

  // ─── تقنية ───────────────────────────────────────────────────────────────
  { text: "ما هو اختصار CPU؟", choices: ["Central Power Unit", "Central Processing Unit", "Computer Power Unit", "Core Processing Unit"], correctAnswer: 2, category: "تقنية" },
  { text: "من أسّس شركة Apple؟", choices: ["بيل غيتس", "ستيف جوبز", "مارك زوكربرغ", "جيف بيزوس"], correctAnswer: 2, category: "تقنية" },
  { text: "في أي عام تأسّست Google؟", choices: ["1994", "1996", "1998", "2000"], correctAnswer: 3, category: "تقنية" },
  { text: "ما هو امتداد ملفات الصور الأكثر شيوعاً؟", choices: ["MP3", "PDF", "JPG", "DOC"], correctAnswer: 3, category: "تقنية" },
  { text: "ما هو الموقع الأكثر زيارة في العالم؟", choices: ["Facebook", "YouTube", "Google", "Twitter"], correctAnswer: 3, category: "تقنية" },
  { text: "ما معنى WWW في عناوين الإنترنت؟", choices: ["World Wide Web", "World Web Window", "Wide World Web", "Web World Window"], correctAnswer: 1, category: "تقنية" },
  { text: "ما هو نظام التشغيل الذي طوّرته Microsoft؟", choices: ["macOS", "Linux", "Windows", "Android"], correctAnswer: 3, category: "تقنية" },
  { text: "من اخترع الإنترنت؟", choices: ["بيل غيتس", "ستيف جوبز", "تيم بيرنرز-لي", "مارك زوكربرغ"], correctAnswer: 3, category: "تقنية" },

  // ─── أفلام ومسلسلات ─────────────────────────────────────────────────────
  { text: "من أخرج فيلم Titanic؟", choices: ["ستيفن سبيلبرغ", "جيمس كاميرون", "كريستوفر نولان", "رايدلي سكوت"], correctAnswer: 2, category: "أفلام ومسلسلات" },
  { text: "ما اسم البطل في فيلم The Lion King؟", choices: ["أكيلي", "سيمبا", "موانا", "بامبي"], correctAnswer: 2, category: "أفلام ومسلسلات" },
  { text: "كم عدد أفلام سلسلة Star Wars الأصلية؟", choices: ["3", "4", "6", "9"], correctAnswer: 1, category: "أفلام ومسلسلات" },
  { text: "من يُمثّل شخصية Iron Man؟", choices: ["كريس هيمسورث", "رادي بنيديكت", "روبرت داوني جونيور", "كريس إيفانز"], correctAnswer: 3, category: "أفلام ومسلسلات" },
  { text: "أي من هذه المسلسلات يدور في عالم خيالي؟", choices: ["Breaking Bad", "Game of Thrones", "Friends", "The Office"], correctAnswer: 2, category: "أفلام ومسلسلات" },
  { text: "ما هو الفيلم الأعلى ربحاً في تاريخ السينما؟", choices: ["Avengers: Endgame", "Titanic", "Avatar", "The Lion King"], correctAnswer: 3, category: "أفلام ومسلسلات" },
  { text: "ما اسم قرية عائلة Simpson في المسلسل الشهير؟", choices: ["Springfield", "Shelbyville", "Capital City", "Ogdenville"], correctAnswer: 1, category: "أفلام ومسلسلات" },
  { text: "من يقرأ صوت شخصية Mufasa في The Lion King 1994؟", choices: ["جيمس ايرل جونز", "موربان فريمان", "دنزل واشنطن", "ويل سميث"], correctAnswer: 1, category: "أفلام ومسلسلات" },

  // ─── ألعاب ────────────────────────────────────────────────────────────────
  { text: "ما هي الشركة المطوّرة للعبة Minecraft؟", choices: ["EA", "Ubisoft", "Mojang", "Blizzard"], correctAnswer: 3, category: "ألعاب" },
  { text: "ما اسم الشخصية الرئيسية في The Legend of Zelda؟", choices: ["Zelda", "Link", "Ganon", "Epona"], correctAnswer: 2, category: "ألعاب" },
  { text: "أي من هذه الألعاب يصنّف أكشن بقاء؟", choices: ["FIFA", "Minecraft", "Tetris", "Chess"], correctAnswer: 2, category: "ألعاب" },
  { text: "ما هو الكائن الأشهر في لعبة Pokémon؟", choices: ["Charmander", "Bulbasaur", "Squirtle", "Pikachu"], correctAnswer: 4, category: "ألعاب" },
  { text: "ما اسم منصة الألعاب التي صنعتها Sony؟", choices: ["Xbox", "Nintendo Switch", "PlayStation", "Atari"], correctAnswer: 3, category: "ألعاب" },
  { text: "كم عدد لاعبي Fortnite في المباراة الواحدة؟", choices: ["50", "75", "100", "150"], correctAnswer: 3, category: "ألعاب" },

  // ─── أسئلة ذكاء ──────────────────────────────────────────────────────────
  { text: "ما الذي له أسنان لكنه لا يعض؟", choices: ["الفأس", "المنشار", "المشط", "المطرقة"], correctAnswer: 3, category: "ذكاء" },
  { text: "كلما أخذت منه كثر وامتلأ. ما هو؟", choices: ["الكيس", "الخزانة", "الحفرة", "الجيب"], correctAnswer: 3, category: "ذكاء" },
  { text: "ما الذي يمكنك مسكه بيدك اليسرى لكن لا يمكنك مسكه بيدك اليمنى؟", choices: ["الصخرة", "المرآة", "مرفق يدك اليمنى", "القلم"], correctAnswer: 3, category: "ذكاء" },
  { text: "2+2=4، 4+4=8، 8+8=16. ما هو 16+16؟", choices: ["24", "30", "32", "36"], correctAnswer: 3, category: "ذكاء" },
  { text: "ما الشيء الذي يمشي على أربع في الصباح، وعلى اثنتين في الظهر، وعلى ثلاث في المساء؟", choices: ["الكلب", "الأسد", "الإنسان", "الحصان"], correctAnswer: 3, category: "ذكاء" },
  { text: "إذا كان ثمانية رجال بنوا بيتاً في عشرة أيام، كم يوماً يحتاج أربعة رجال؟", choices: ["5", "10", "20", "15"], correctAnswer: 3, category: "ذكاء" },
  { text: "ما الذي كلما زاد نقصت الرؤية؟", choices: ["النور", "الضباب", "المطر", "الظلام"], correctAnswer: 4, category: "ذكاء" },
  { text: "أي رقم إذا ضربته بأي رقم تحصل على نفس الرقم؟", choices: ["1", "0", "2", "10"], correctAnswer: 2, category: "ذكاء" },

  // ─── خفيف ────────────────────────────────────────────────────────────────
  { text: "ما الذي يخلط الأزرق بالأصفر؟", choices: ["أحمر", "برتقالي", "أخضر", "بنفسجي"], correctAnswer: 3, category: "خفيف" },
  { text: "ما الطعام الذي تُصنع منه الشوكولاتة؟", choices: ["الكاكاو", "القهوة", "القصب", "التفاح"], correctAnswer: 1, category: "خفيف" },
  { text: "ما اسم صوت البطة؟", choices: ["مواء", "نعيق", "قرقرة", "كواك"], correctAnswer: 4, category: "خفيف" },
  { text: "ما الذي ينتج منه العسل؟", choices: ["الفراشات", "النحل", "الدود", "البعوض"], correctAnswer: 2, category: "خفيف" },
  { text: "ماذا يأكل الأرنب؟", choices: ["اللحم", "الأسماك", "الجزر والخضار", "الفراولة فقط"], correctAnswer: 3, category: "خفيف" },
  { text: "ما اسم كوكبنا؟", choices: ["المريخ", "الزهرة", "الأرض", "القمر"], correctAnswer: 3, category: "خفيف" },
  { text: "ما عدد أيام الأسبوع؟", choices: ["5", "6", "7", "8"], correctAnswer: 3, category: "خفيف" },
  { text: "أين تعيش السمكة؟", choices: ["في البر", "في الماء", "في الهواء", "في الجبال"], correctAnswer: 2, category: "خفيف" },
  { text: "ما لون التفاحة عادةً؟", choices: ["أزرق", "أصفر أو أحمر أو أخضر", "برتقالي", "بنفسجي"], correctAnswer: 2, category: "خفيف" },
  { text: "كم ساعة في اليوم؟", choices: ["12", "20", "24", "48"], correctAnswer: 3, category: "خفيف" },

  // ─── سرعة بديهة ──────────────────────────────────────────────────────────
  { text: "1 + 1 = ؟", choices: ["0", "1", "2", "3"], correctAnswer: 3, category: "سرعة بديهة" },
  { text: "ما هو نصف 100؟", choices: ["20", "40", "50", "60"], correctAnswer: 3, category: "سرعة بديهة" },
  { text: "ما هو اليوم التالي بعد الإثنين؟", choices: ["الأحد", "الثلاثاء", "الأربعاء", "السبت"], correctAnswer: 2, category: "سرعة بديهة" },
  { text: "كم يساوي 5 × 5؟", choices: ["20", "25", "30", "35"], correctAnswer: 2, category: "سرعة بديهة" },
  { text: "ما هو الشهر الثاني عشر في السنة؟", choices: ["أكتوبر", "نوفمبر", "ديسمبر", "يناير"], correctAnswer: 3, category: "سرعة بديهة" },
  { text: "كم عدد الدقائق في ساعة؟", choices: ["30", "50", "60", "100"], correctAnswer: 3, category: "سرعة بديهة" },
  { text: "ما هو عدد أيام شهر فبراير في السنة العادية؟", choices: ["27", "28", "29", "30"], correctAnswer: 2, category: "سرعة بديهة" },
  { text: "ما هو الرقم الذي يسبق الرقم مليون مباشرة؟", choices: ["99000", "999000", "999999", "1000001"], correctAnswer: 3, category: "سرعة بديهة" },

  // ─── معلومات عامة ────────────────────────────────────────────────────────
  { text: "ما هي عاصمة المملكة العربية السعودية؟", choices: ["جدة", "مكة", "الرياض", "الدمام"], correctAnswer: 3, category: "معلومات عامة" },
  { text: "ما هو أطول جسر في العالم؟", choices: ["جسر الملك فهد", "Golden Gate", "Danyang–Kunshan", "Brooklyn Bridge"], correctAnswer: 3, category: "معلومات عامة" },
  { text: "كم دولة عضو في الأمم المتحدة تقريباً؟", choices: ["100", "150", "193", "220"], correctAnswer: 3, category: "معلومات عامة" },
  { text: "ما هي أغلى عملة في العالم؟", choices: ["الدولار", "اليورو", "الدينار الكويتي", "الجنيه الإسترليني"], correctAnswer: 3, category: "معلومات عامة" },
  { text: "ما هو الجبل الأكثر ارتفاعاً في المملكة العربية السعودية؟", choices: ["جبل أحد", "جبل النور", "جبل السودة", "جبل عرفات"], correctAnswer: 3, category: "معلومات عامة" },
  { text: "ما هي لغة التخاطب الأكثر انتشاراً في العالم؟", choices: ["العربية", "الإسبانية", "الإنجليزية", "الصينية"], correctAnswer: 3, category: "معلومات عامة" },
  { text: "كم عدد الدول العربية؟", choices: ["16", "20", "22", "25"], correctAnswer: 3, category: "معلومات عامة" },
  { text: "ما هي العملة الرسمية لليابان؟", choices: ["اليوان", "الين", "الوون", "الباهت"], correctAnswer: 2, category: "معلومات عامة" },

  // ─── شخصيات مشهورة ────────────────────────────────────────────────────────
  { text: "من هو مخترع الهاتف؟", choices: ["إديسون", "غراهام بيل", "نيوتن", "ماركوني"], correctAnswer: 2, category: "شخصيات مشهورة" },
  { text: "من هو أول رائد فضاء يصل إلى القمر؟", choices: ["باز ألدرين", "نيل أرمسترونغ", "يوري غاغارين", "جون غلين"], correctAnswer: 2, category: "شخصيات مشهورة" },
  { text: "من كتب مسرحية روميو وجولييت؟", choices: ["شارلز ديكنز", "وليام شكسبير", "جورج برنارد شو", "جون ميلتون"], correctAnswer: 2, category: "شخصيات مشهورة" },
  { text: "من هو مؤسس شركة Amazon؟", choices: ["بيل غيتس", "إيلون ماسك", "جيف بيزوس", "مارك زوكربرغ"], correctAnswer: 3, category: "شخصيات مشهورة" },
  { text: "ما اسم العالم الذي طوّر نظرية النسبية؟", choices: ["نيوتن", "داروين", "أينشتاين", "فاراداي"], correctAnswer: 3, category: "شخصيات مشهورة" },
  { text: "من هو أول إنسان في الفضاء؟", choices: ["نيل أرمسترونغ", "جون غلين", "يوري غاغارين", "باز ألدرين"], correctAnswer: 3, category: "شخصيات مشهورة" },
  { text: "من هو مؤسس شركة Microsoft؟", choices: ["ستيف جوبز", "بيل غيتس", "ستيف ووزنياك", "لاري بيج"], correctAnswer: 2, category: "شخصيات مشهورة" },
  { text: "من يُلقّب بـ 'أبو الأنبياء'؟", choices: ["موسى", "نوح", "إبراهيم", "آدم"], correctAnswer: 3, category: "شخصيات مشهورة" },

  // ─── أغاني ───────────────────────────────────────────────────────────────
  { text: "من يغني أغنية 'بشرة خير'؟", choices: ["راشد الماجد", "محمد عبده", "حسين الجسمي", "ماجد المهندس"], correctAnswer: 3, category: "أغاني" },
  { text: "من يُلقّب بـ 'فنان العرب'؟", choices: ["طلال مداح", "محمد عبده", "عبادي الجوهر", "أبو بكر سالم"], correctAnswer: 2, category: "أغاني" },
  { text: "من يغني 'وينك'؟", choices: ["محمد عبده", "راشد الماجد", "ماجد المهندس", "عبدالله الرويشد"], correctAnswer: 3, category: "أغاني" },
  { text: "من يغني أغنية 'ليلة العمر'؟", choices: ["راشد الماجد", "محمد عبده", "عبادي الجوهر", "أصيل أبو بكر"], correctAnswer: 1, category: "أغاني" },
  { text: "من يغني 'سلمى يا سلامة'؟", choices: ["ماجد المهندس", "عمرو دياب", "راغب علامة", "وائل جسار"], correctAnswer: 2, category: "أغاني" },
  { text: "من تُلقّب بـ 'صوت لبنان'؟", choices: ["نانسي عجرم", "فيروز", "مايا دياب", "هيفا وهبي"], correctAnswer: 2, category: "أغاني" },
  { text: "من يغني 'قسماً'؟", choices: ["كاظم الساهر", "ناظم الغزالي", "فيروز", "أم كلثوم"], correctAnswer: 1, category: "أغاني" },
  { text: "من يغني 'حبيبي وطني'؟", choices: ["جورج وسوف", "وائل كفوري", "ماجد المهندس", "عمرو دياب"], correctAnswer: 1, category: "أغاني" },
];

// Force reseed — always delete all and re-insert fresh questions
router.post("/seed", async (req, res): Promise<void> => {
  try {
    await db.delete(questionsTable);
    await db.insert(questionsTable).values(QUESTIONS);
    res.json({ message: "تم تحديث بنك الأسئلة", count: QUESTIONS.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
