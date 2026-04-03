import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable, userScoresTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

router.post("/auth/register", async (req, res): Promise<void> => {
  const { username, password } = req.body;

  if (!username || !password || username.length < 3 || password.length < 4) {
    res.status(400).json({ error: "اسم المستخدم يجب أن يكون 3 أحرف على الأقل وكلمة المرور 4 أحرف" });
    return;
  }

  const existing = await db.select().from(usersTable).where(eq(usersTable.username, username.trim())).limit(1);
  if (existing.length > 0) {
    res.status(409).json({ error: "اسم المستخدم محجوز، اختر اسمًا آخر" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const [user] = await db.insert(usersTable).values({
    username: username.trim(),
    passwordHash,
  }).returning();

  // Initialize score row
  await db.insert(userScoresTable).values({
    userId: user.id,
    username: user.username,
    score: 0,
  }).onConflictDoNothing();

  const session = (req as any).session;
  session.userId = user.id;
  session.username = user.username;

  res.status(201).json({ id: user.id, username: user.username });
});

router.post("/auth/login", async (req, res): Promise<void> => {
  const { username, password } = req.body;

  if (!username || !password) {
    res.status(400).json({ error: "أدخل اسم المستخدم وكلمة المرور" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.username, username.trim())).limit(1);
  if (!user) {
    res.status(401).json({ error: "اسم المستخدم أو كلمة المرور غير صحيحة" });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "اسم المستخدم أو كلمة المرور غير صحيحة" });
    return;
  }

  // Ensure score row
  await db.insert(userScoresTable).values({
    userId: user.id,
    username: user.username,
    score: 0,
  }).onConflictDoNothing();

  const session = (req as any).session;
  session.userId = user.id;
  session.username = user.username;

  res.json({ id: user.id, username: user.username });
});

router.post("/auth/logout", async (req, res): Promise<void> => {
  (req as any).session.destroy(() => {
    res.json({ success: true });
  });
});

router.get("/auth/me", async (req, res): Promise<void> => {
  const session = (req as any).session;
  if (!session.userId) {
    res.status(401).json({ error: "غير مسجل الدخول" });
    return;
  }
  res.json({ id: session.userId, username: session.username });
});

export default router;
