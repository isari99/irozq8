import { Router, type IRouter } from "express";
import { db, questionsTable, quizSessionsTable, userAnswersTable, userScoresTable, chatMessagesTable } from "@workspace/db";
import { eq, desc, and, sql } from "drizzle-orm";
import { broadcast } from "../lib/wsManager";

const router: IRouter = Router();

// Middleware: require auth
function requireAuth(req: any, res: any, next: any) {
  if (!req.session?.userId) {
    res.status(401).json({ error: "يجب تسجيل الدخول أولاً" });
    return;
  }
  next();
}

// GET /quiz/current
router.get("/quiz/current", requireAuth, async (req, res): Promise<void> => {
  const session = (req as any).session;

  const [activeSession] = await db.select()
    .from(quizSessionsTable)
    .where(eq(quizSessionsTable.active, true))
    .orderBy(desc(quizSessionsTable.id))
    .limit(1);

  if (!activeSession) {
    res.status(404).json({ error: "لا يوجد سؤال نشط حالياً" });
    return;
  }

  const [question] = await db.select()
    .from(questionsTable)
    .where(eq(questionsTable.id, activeSession.questionId))
    .limit(1);

  if (!question) {
    res.status(404).json({ error: "السؤال غير موجود" });
    return;
  }

  // Has user answered?
  const [existingAnswer] = await db.select()
    .from(userAnswersTable)
    .where(and(
      eq(userAnswersTable.sessionId, activeSession.id),
      eq(userAnswersTable.userId, session.userId)
    ))
    .limit(1);

  // How many answered?
  const [countResult] = await db.select({ count: sql<number>`count(*)` })
    .from(userAnswersTable)
    .where(eq(userAnswersTable.sessionId, activeSession.id));

  res.json({
    sessionId: activeSession.id,
    questionId: question.id,
    text: question.text,
    choices: question.choices,
    category: question.category,
    hasAnswered: !!existingAnswer,
    answeredCount: Number(countResult?.count ?? 0),
  });
});

// POST /quiz/next - move to next question
router.post("/quiz/next", requireAuth, async (req, res): Promise<void> => {
  // Deactivate current session
  await db.update(quizSessionsTable)
    .set({ active: false })
    .where(eq(quizSessionsTable.active, true));

  // Pick a random question not recently used
  const allQuestions = await db.select().from(questionsTable);
  if (allQuestions.length === 0) {
    res.status(404).json({ error: "لا توجد أسئلة في البنك" });
    return;
  }

  // Get last 5 used question IDs to avoid repeats
  const recentSessions = await db.select({ questionId: quizSessionsTable.questionId })
    .from(quizSessionsTable)
    .orderBy(desc(quizSessionsTable.id))
    .limit(5);
  const recentIds = new Set(recentSessions.map(s => s.questionId));

  let candidates = allQuestions.filter(q => !recentIds.has(q.id));
  if (candidates.length === 0) candidates = allQuestions;

  const question = candidates[Math.floor(Math.random() * candidates.length)];

  const [newSession] = await db.insert(quizSessionsTable).values({
    questionId: question.id,
    active: true,
  }).returning();

  // Broadcast to all clients
  broadcast({
    type: "new_question",
    sessionId: newSession.id,
    questionId: question.id,
    text: question.text,
    choices: question.choices as string[],
    category: question.category,
  });

  res.json({
    sessionId: newSession.id,
    questionId: question.id,
    text: question.text,
    choices: question.choices,
    category: question.category,
    hasAnswered: false,
    answeredCount: 0,
  });
});

// POST /quiz/answer
router.post("/quiz/answer", requireAuth, async (req, res): Promise<void> => {
  const session = (req as any).session;
  const { answer } = req.body;

  if (!answer || answer < 1 || answer > 4) {
    res.status(400).json({ error: "الإجابة يجب أن تكون بين 1 و4" });
    return;
  }

  const [activeSession] = await db.select()
    .from(quizSessionsTable)
    .where(eq(quizSessionsTable.active, true))
    .orderBy(desc(quizSessionsTable.id))
    .limit(1);

  if (!activeSession) {
    res.status(400).json({ error: "لا يوجد سؤال نشط حالياً" });
    return;
  }

  // Check if already answered
  const [existing] = await db.select()
    .from(userAnswersTable)
    .where(and(
      eq(userAnswersTable.sessionId, activeSession.id),
      eq(userAnswersTable.userId, session.userId)
    ))
    .limit(1);

  if (existing) {
    res.status(409).json({ error: "لقد أجبت على هذا السؤال بالفعل" });
    return;
  }

  const [question] = await db.select()
    .from(questionsTable)
    .where(eq(questionsTable.id, activeSession.questionId))
    .limit(1);

  const correct = answer === question.correctAnswer;

  await db.insert(userAnswersTable).values({
    userId: session.userId,
    sessionId: activeSession.id,
    answer,
    correct,
  });

  // Update score
  let newScore = 0;
  if (correct) {
    const [updated] = await db.update(userScoresTable)
      .set({
        score: sql`${userScoresTable.score} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(userScoresTable.userId, session.userId))
      .returning();
    newScore = updated?.score ?? 1;
  } else {
    const [current] = await db.select().from(userScoresTable).where(eq(userScoresTable.userId, session.userId)).limit(1);
    newScore = current?.score ?? 0;
  }

  // Broadcast answer event + leaderboard update
  broadcast({
    type: "answer",
    userId: session.userId,
    username: session.username,
    answer,
    correct,
    newScore,
  });

  // Recompute stats and broadcast
  const answers = await db.select().from(userAnswersTable).where(eq(userAnswersTable.sessionId, activeSession.id));
  const distribution: Record<string, number> = { "1": 0, "2": 0, "3": 0, "4": 0 };
  let correctCount = 0;
  answers.forEach(a => {
    distribution[String(a.answer)] = (distribution[String(a.answer)] || 0) + 1;
    if (a.correct) correctCount++;
  });

  broadcast({
    type: "stats_update",
    totalAnswers: answers.length,
    correctAnswers: correctCount,
    distribution,
  });

  // Broadcast leaderboard
  const leaderboard = await db.select()
    .from(userScoresTable)
    .orderBy(desc(userScoresTable.score))
    .limit(10);

  broadcast({
    type: "leaderboard_update",
    leaderboard: leaderboard.map((e, i) => ({
      userId: e.userId,
      username: e.username,
      score: e.score,
      rank: i + 1,
    })),
  });

  const choices = question.choices as string[];
  res.json({
    correct,
    correctAnswer: question.correctAnswer,
    correctAnswerText: choices[question.correctAnswer - 1],
    newScore,
  });
});

// GET /quiz/leaderboard
router.get("/quiz/leaderboard", requireAuth, async (req, res): Promise<void> => {
  const entries = await db.select()
    .from(userScoresTable)
    .orderBy(desc(userScoresTable.score))
    .limit(20);

  res.json(entries.map((e, i) => ({
    userId: e.userId,
    username: e.username,
    score: e.score,
    rank: i + 1,
  })));
});

// GET /quiz/chat
router.get("/quiz/chat", requireAuth, async (req, res): Promise<void> => {
  const messages = await db.select()
    .from(chatMessagesTable)
    .orderBy(desc(chatMessagesTable.createdAt))
    .limit(50);

  res.json(messages.reverse().map(m => ({
    id: m.id,
    userId: m.userId,
    username: m.username,
    message: m.message,
    createdAt: m.createdAt.toISOString(),
  })));
});

// POST /quiz/chat - save chat message
router.post("/quiz/chat", requireAuth, async (req, res): Promise<void> => {
  const session = (req as any).session;
  const { message } = req.body;

  if (!message || typeof message !== "string" || message.trim().length === 0) {
    res.status(400).json({ error: "الرسالة فارغة" });
    return;
  }

  await db.insert(chatMessagesTable).values({
    userId: session.userId,
    username: session.username,
    message: message.trim().slice(0, 200),
  });

  res.json({ success: true });
});

// GET /quiz/stats
router.get("/quiz/stats", requireAuth, async (req, res): Promise<void> => {
  const [activeSession] = await db.select()
    .from(quizSessionsTable)
    .where(eq(quizSessionsTable.active, true))
    .orderBy(desc(quizSessionsTable.id))
    .limit(1);

  if (!activeSession) {
    res.json({ totalAnswers: 0, correctAnswers: 0, distribution: { "1": 0, "2": 0, "3": 0, "4": 0 } });
    return;
  }

  const answers = await db.select()
    .from(userAnswersTable)
    .where(eq(userAnswersTable.sessionId, activeSession.id));

  const distribution: Record<string, number> = { "1": 0, "2": 0, "3": 0, "4": 0 };
  let correctCount = 0;
  answers.forEach(a => {
    distribution[String(a.answer)] = (distribution[String(a.answer)] || 0) + 1;
    if (a.correct) correctCount++;
  });

  res.json({
    totalAnswers: answers.length,
    correctAnswers: correctCount,
    distribution,
  });
});

export default router;
