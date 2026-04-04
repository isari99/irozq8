import { Router, type IRouter } from "express";
import { db, questionsTable, quizSessionsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { broadcast } from "../lib/wsManager";
import { twitchClient } from "../lib/twitchClient";
import { gameState } from "../lib/gameState";

const router: IRouter = Router();

// Middleware: require auth (host only)
function requireAuth(req: any, res: any, next: any) {
  if (!req.session?.userId) {
    res.status(401).json({ error: "يجب تسجيل الدخول كهوست" });
    return;
  }
  next();
}

// Wire Twitch answers → gameState → broadcast
twitchClient.onAnswer((username, answer) => {
  const { correct, alreadyAnswered } = gameState.recordAnswer(username, answer);
  if (alreadyAnswered) return;

  broadcast({
    type: "twitch_answer",
    username,
    answer,
    correct,
    totalAnswers: gameState.totalAnswers,
    distribution: gameState.distribution,
  });

  // Broadcast updated leaderboard
  broadcast({
    type: "leaderboard_update",
    leaderboard: gameState.getLeaderboard(),
  });
});

twitchClient.onStatus((status) => {
  broadcast({ type: "twitch_status", status, channel: twitchClient.channel });
});

// ── GET /quiz/state ─────────────────────────────────────────────────────────
router.get("/quiz/state", async (req, res): Promise<void> => {
  const [activeSession] = await db.select()
    .from(quizSessionsTable)
    .where(eq(quizSessionsTable.active, true))
    .orderBy(desc(quizSessionsTable.id))
    .limit(1);

  let question = null;
  if (activeSession) {
    const [q] = await db.select()
      .from(questionsTable)
      .where(eq(questionsTable.id, activeSession.questionId))
      .limit(1);
    if (q) {
      const choices = q.choices as string[];
      question = {
        id: q.id,
        text: q.text,
        choices,
        category: q.category,
        // Only reveal correctAnswer when phase is "revealed"
        correctAnswer: gameState.phase === "revealed" ? q.correctAnswer : null,
        correctAnswerText: gameState.phase === "revealed" ? choices[q.correctAnswer - 1] : null,
      };
    }
  }

  res.json({
    phase: gameState.phase,
    question,
    leaderboard: gameState.getLeaderboard(),
    totalAnswers: gameState.totalAnswers,
    distribution: gameState.distribution,
    twitch: {
      connected: twitchClient.connected,
      channel: twitchClient.channel,
    },
  });
});

// ── POST /quiz/twitch/connect ────────────────────────────────────────────────
router.post("/quiz/twitch/connect", requireAuth, (req, res): void => {
  const { channel } = req.body;
  if (!channel || typeof channel !== "string") {
    res.status(400).json({ error: "اسم القناة مطلوب" });
    return;
  }
  twitchClient.connect(channel.trim());
  res.json({ success: true, channel: channel.trim().toLowerCase() });
});

// ── POST /quiz/twitch/disconnect ─────────────────────────────────────────────
router.post("/quiz/twitch/disconnect", requireAuth, (req, res): void => {
  twitchClient.disconnect();
  res.json({ success: true });
});

// ── POST /quiz/start ─────────────────────────────────────────────────────────
// Reset scores and mark game as started
router.post("/quiz/start", requireAuth, async (req, res): Promise<void> => {
  // Deactivate any active session
  await db.update(quizSessionsTable)
    .set({ active: false })
    .where(eq(quizSessionsTable.active, true));

  gameState.reset();
  gameState.setPhase("idle");

  broadcast({ type: "game_started", leaderboard: [] });
  res.json({ success: true });
});

// ── POST /quiz/question ──────────────────────────────────────────────────────
// Pick and broadcast the next question
router.post("/quiz/question", requireAuth, async (req, res): Promise<void> => {
  // Deactivate current
  await db.update(quizSessionsTable)
    .set({ active: false })
    .where(eq(quizSessionsTable.active, true));

  // Get all questions
  const allQuestions = await db.select().from(questionsTable);
  if (allQuestions.length === 0) {
    res.status(404).json({ error: "لا توجد أسئلة. شغّل /api/seed أولاً" });
    return;
  }

  // Avoid last 5 used
  const recent = await db.select({ questionId: quizSessionsTable.questionId })
    .from(quizSessionsTable)
    .orderBy(desc(quizSessionsTable.id))
    .limit(5);
  const recentIds = new Set(recent.map(r => r.questionId));
  let candidates = allQuestions.filter(q => !recentIds.has(q.id));
  if (candidates.length === 0) candidates = allQuestions;

  const q = candidates[Math.floor(Math.random() * candidates.length)];

  await db.insert(quizSessionsTable).values({ questionId: q.id, active: true });

  const choices = q.choices as string[];
  gameState.setQuestion(q.id, q.correctAnswer);

  broadcast({
    type: "new_question",
    questionId: q.id,
    text: q.text,
    choices,
    category: q.category,
    correctAnswer: null,
    correctAnswerText: null,
    sessionId: 0,
  });

  res.json({ success: true, question: { id: q.id, text: q.text, choices, category: q.category } });
});

// ── POST /quiz/reveal ────────────────────────────────────────────────────────
// Reveal the correct answer
router.post("/quiz/reveal", requireAuth, async (req, res): Promise<void> => {
  if (!gameState.currentQuestionId) {
    res.status(400).json({ error: "لا يوجد سؤال نشط" });
    return;
  }

  const [q] = await db.select()
    .from(questionsTable)
    .where(eq(questionsTable.id, gameState.currentQuestionId))
    .limit(1);

  if (!q) {
    res.status(404).json({ error: "السؤال غير موجود" });
    return;
  }

  gameState.reveal();
  const choices = q.choices as string[];

  broadcast({
    type: "answer_reveal",
    correctAnswer: q.correctAnswer,
    correctAnswerText: choices[q.correctAnswer - 1],
    leaderboard: gameState.getLeaderboard(),
    distribution: gameState.distribution,
    totalAnswers: gameState.totalAnswers,
  });

  // Deactivate session
  await db.update(quizSessionsTable)
    .set({ active: false })
    .where(eq(quizSessionsTable.active, true));

  res.json({
    success: true,
    correctAnswer: q.correctAnswer,
    correctAnswerText: choices[q.correctAnswer - 1],
  });
});

// ── POST /quiz/web-answer ─────────────────────────────────────────────────────
// Web players answer via button click (uses session username)
router.post("/quiz/web-answer", requireAuth, async (req, res): Promise<void> => {
  const session = (req as any).session;
  const { answer } = req.body;
  const num = parseInt(answer, 10);

  if (!num || num < 1 || num > 4) {
    res.status(400).json({ error: "الإجابة يجب أن تكون بين 1 و4" });
    return;
  }

  if (gameState.phase !== "active") {
    res.status(400).json({ error: "لا يوجد سؤال نشط" });
    return;
  }

  const username = session.username as string;
  const { correct, alreadyAnswered } = gameState.recordAnswer(username, num);

  if (alreadyAnswered) {
    res.status(409).json({ error: "أجبت بالفعل" });
    return;
  }

  broadcast({
    type: "twitch_answer",
    username,
    answer: num,
    correct,
    totalAnswers: gameState.totalAnswers,
    distribution: gameState.distribution,
  });

  broadcast({ type: "leaderboard_update", leaderboard: gameState.getLeaderboard() });

  // Find correctAnswer text
  let correctAnswerText = "";
  if (gameState.currentQuestionId) {
    const { db, questionsTable } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");
    const [q] = await db.select().from(questionsTable)
      .where(eq(questionsTable.id, gameState.currentQuestionId)).limit(1);
    if (q) {
      const choices = q.choices as string[];
      correctAnswerText = correct ? choices[num - 1] : choices[q.correctAnswer - 1];
    }
  }

  res.json({ correct, correctAnswer: gameState.currentCorrectAnswer, correctAnswerText });
});

// ── GET /quiz/leaderboard ────────────────────────────────────────────────────
router.get("/quiz/leaderboard", (req, res): void => {
  res.json(gameState.getLeaderboard());
});

export default router;
