import { Router, type IRouter } from "express";
import { db, questionsTable, quizSessionsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { broadcast } from "../lib/wsManager";
import { twitchClient } from "../lib/twitchClient";
import { gameState } from "../lib/gameState";

const router: IRouter = Router();

function requireAuth(req: any, res: any, next: any) {
  if (!req.session?.userId) {
    res.status(401).json({ error: "يجب تسجيل الدخول كهوست" });
    return;
  }
  next();
}

// Wire Twitch messages → gameState → broadcast
// Auto-register: any chat message during active counts as potential answer
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
    currentRound: gameState.currentRound,
    totalRounds: gameState.totalRounds,
    questionTime: gameState.questionTime,
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
// Accept rounds + questionTime config, reset and begin
router.post("/quiz/start", requireAuth, async (req, res): Promise<void> => {
  const rounds = parseInt(req.body?.rounds ?? "10", 10);
  const questionTime = parseInt(req.body?.questionTime ?? "20", 10);

  const validRounds = [10, 15, 20, 25, 30].includes(rounds) ? rounds : 10;
  const validTime = [15, 20, 30].includes(questionTime) ? questionTime : 20;

  await db.update(quizSessionsTable)
    .set({ active: false })
    .where(eq(quizSessionsTable.active, true));

  gameState.reset();
  gameState.configure(validRounds, validTime);
  gameState.setPhase("idle");

  broadcast({
    type: "game_started",
    totalRounds: validRounds,
    questionTime: validTime,
    leaderboard: [],
  });
  res.json({ success: true, totalRounds: validRounds, questionTime: validTime });
});

// ── POST /quiz/question ──────────────────────────────────────────────────────
router.post("/quiz/question", requireAuth, async (req, res): Promise<void> => {
  await db.update(quizSessionsTable)
    .set({ active: false })
    .where(eq(quizSessionsTable.active, true));

  const currentRound = gameState.nextRound();
  const totalRounds = gameState.totalRounds;

  const allQuestions = await db.select().from(questionsTable);
  if (allQuestions.length === 0) {
    res.status(404).json({ error: "لا توجد أسئلة. شغّل /api/seed أولاً" });
    return;
  }

  // Avoid recent questions
  const recent = await db.select({ questionId: quizSessionsTable.questionId })
    .from(quizSessionsTable)
    .orderBy(desc(quizSessionsTable.id))
    .limit(Math.min(allQuestions.length - 1, 10));
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
    currentRound,
    totalRounds,
    questionTime: gameState.questionTime,
  });

  res.json({ success: true, question: { id: q.id, text: q.text, choices, category: q.category }, currentRound, totalRounds });
});

// ── POST /quiz/reveal ────────────────────────────────────────────────────────
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

  const questionResults = gameState.reveal();
  const choices = q.choices as string[];
  const isLastRound = gameState.isLastRound();
  const leaderboard = gameState.getLeaderboard();

  broadcast({
    type: "answer_reveal",
    correctAnswer: q.correctAnswer,
    correctAnswerText: choices[q.correctAnswer - 1],
    leaderboard,
    distribution: gameState.distribution,
    totalAnswers: gameState.totalAnswers,
    questionResults,
    currentRound: gameState.currentRound,
    totalRounds: gameState.totalRounds,
    isLastRound,
  });

  await db.update(quizSessionsTable)
    .set({ active: false })
    .where(eq(quizSessionsTable.active, true));

  if (isLastRound) {
    gameState.setPhase("finished");
    broadcast({
      type: "game_finished",
      leaderboard,
    });
  }

  res.json({
    success: true,
    correctAnswer: q.correctAnswer,
    correctAnswerText: choices[q.correctAnswer - 1],
    isLastRound,
  });
});

// ── GET /quiz/leaderboard ────────────────────────────────────────────────────
router.get("/quiz/leaderboard", (req, res): void => {
  res.json(gameState.getLeaderboard());
});

export default router;
