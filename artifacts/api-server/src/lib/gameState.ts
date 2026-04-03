export type GamePhase = "idle" | "active" | "revealed";

interface Player {
  username: string;
  score: number;
  answeredThisQ: boolean;
  answer: number | null;
}

interface GameState {
  phase: GamePhase;
  players: Map<string, Player>;
  currentQuestionId: number | null;
  currentCorrectAnswer: number | null;
  answerDistribution: Record<string, number>;
  totalAnswers: number;
}

class GameStateManager {
  private state: GameState = {
    phase: "idle",
    players: new Map(),
    currentQuestionId: null,
    currentCorrectAnswer: null,
    answerDistribution: { "1": 0, "2": 0, "3": 0, "4": 0 },
    totalAnswers: 0,
  };

  get phase(): GamePhase { return this.state.phase; }
  get currentQuestionId(): number | null { return this.state.currentQuestionId; }
  get currentCorrectAnswer(): number | null { return this.state.currentCorrectAnswer; }
  get distribution(): Record<string, number> { return this.state.answerDistribution; }
  get totalAnswers(): number { return this.state.totalAnswers; }

  setPhase(phase: GamePhase) { this.state.phase = phase; }

  setQuestion(questionId: number, correctAnswer: number) {
    this.state.currentQuestionId = questionId;
    this.state.currentCorrectAnswer = correctAnswer;
    this.state.phase = "active";
    this.state.answerDistribution = { "1": 0, "2": 0, "3": 0, "4": 0 };
    this.state.totalAnswers = 0;
    // Reset per-question flags
    for (const p of this.state.players.values()) {
      p.answeredThisQ = false;
      p.answer = null;
    }
  }

  recordAnswer(username: string, answer: number): { correct: boolean; alreadyAnswered: boolean } {
    if (this.state.phase !== "active") return { correct: false, alreadyAnswered: false };
    const key = username.toLowerCase();
    if (!this.state.players.has(key)) {
      this.state.players.set(key, { username, score: 0, answeredThisQ: false, answer: null });
    }
    const p = this.state.players.get(key)!;
    if (p.answeredThisQ) return { correct: false, alreadyAnswered: true };
    p.answeredThisQ = true;
    p.answer = answer;
    const correct = answer === this.state.currentCorrectAnswer;
    if (correct) p.score++;
    this.state.answerDistribution[String(answer)] = (this.state.answerDistribution[String(answer)] || 0) + 1;
    this.state.totalAnswers++;
    return { correct, alreadyAnswered: false };
  }

  reveal() {
    this.state.phase = "revealed";
  }

  getLeaderboard() {
    return Array.from(this.state.players.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, 20)
      .map((p, i) => ({ rank: i + 1, username: p.username, score: p.score }));
  }

  reset() {
    this.state.players.clear();
    this.state.phase = "idle";
    this.state.currentQuestionId = null;
    this.state.currentCorrectAnswer = null;
    this.state.answerDistribution = { "1": 0, "2": 0, "3": 0, "4": 0 };
    this.state.totalAnswers = 0;
  }
}

export const gameState = new GameStateManager();
