import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const quizSessionsTable = pgTable("quiz_sessions", {
  id: serial("id").primaryKey(),
  questionId: integer("question_id").notNull(),
  active: boolean("active").notNull().default(true),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
});

export const userAnswersTable = pgTable("user_answers", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  sessionId: integer("session_id").notNull(),
  answer: integer("answer").notNull(),
  correct: boolean("correct").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const userScoresTable = pgTable("user_scores", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().unique(),
  username: text("username").notNull(),
  score: integer("score").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const chatMessagesTable = pgTable("chat_messages", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  username: text("username").notNull(),
  message: text("message").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertQuizSessionSchema = createInsertSchema(quizSessionsTable).omit({ id: true, startedAt: true });
export type InsertQuizSession = z.infer<typeof insertQuizSessionSchema>;
export type QuizSession = typeof quizSessionsTable.$inferSelect;

export const insertUserAnswerSchema = createInsertSchema(userAnswersTable).omit({ id: true, createdAt: true });
export type InsertUserAnswer = z.infer<typeof insertUserAnswerSchema>;
export type UserAnswer = typeof userAnswersTable.$inferSelect;
