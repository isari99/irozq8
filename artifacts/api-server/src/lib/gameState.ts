export type GamePhase = "idle" | "active" | "revealed" | "finished";

interface Player {
  username: string;
  displayName: string;
  score: number;
  answeredThisQ: boolean;
  answer: number | null;
}

export interface QuestionResult {
  username: string;
  answer: number;
  correct: boolean;
  points: number;
  rank: number;
}

interface GameState {
  phase: GamePhase;
  players: Map<string, Player>;
  currentQuestionId: number | null;
  currentCorrectAnswer: number | null;
  answerDistribution: Record<string, number>;
  totalAnswers: number;
  correctAnswerOrder: string[]; // lowercase keys, in arrival order
  // Round config
  totalRounds: number;
  currentRound: number;
  questionTime: number;
  // No-repeat shuffle tracking
  usedInSession: Set<number>;
}

class GameStateManager {
  private state: GameState = {
    phase: "idle",
    players: new Map(),
    currentQuestionId: null,
    currentCorrectAnswer: null,
    answerDistribution: { "1": 0, "2": 0, "3": 0, "4": 0 },
    totalAnswers: 0,
    correctAnswerOrder: [],
    totalRounds: 10,
    currentRound: 0,
    questionTime: 20,
    usedInSession: new Set(),
  };

  get phase(): GamePhase { return this.state.phase; }
  get currentQuestionId(): number | null { return this.state.currentQuestionId; }
  get currentCorrectAnswer(): number | null { return this.state.currentCorrectAnswer; }
  get distribution(): Record<string, number> { return this.state.answerDistribution; }
  get totalAnswers(): number { return this.state.totalAnswers; }
  get totalRounds(): number { return this.state.totalRounds; }
  get currentRound(): number { return this.state.currentRound; }
  get questionTime(): number { return this.state.questionTime; }
  get usedInSession(): Set<number> { return this.state.usedInSession; }

  markUsed(questionId: number) { this.state.usedInSession.add(questionId); }
  resetUsed() { this.state.usedInSession.clear(); }

  setPhase(phase: GamePhase) { this.state.phase = phase; }

  configure(totalRounds: number, questionTime: number) {
    this.state.totalRounds = totalRounds;
    this.state.questionTime = questionTime;
    this.state.currentRound = 0;
  }

  nextRound(): number {
    this.state.currentRound++;
    return this.state.currentRound;
  }

  isLastRound(): boolean {
    return this.state.currentRound >= this.state.totalRounds;
  }

  setQuestion(questionId: number, correctAnswer: number) {
    this.state.currentQuestionId = questionId;
    this.state.currentCorrectAnswer = correctAnswer;
    this.state.phase = "active";
    this.state.answerDistribution = { "1": 0, "2": 0, "3": 0, "4": 0 };
    this.state.totalAnswers = 0;
    this.state.correctAnswerOrder = [];
    for (const p of this.state.players.values()) {
      p.answeredThisQ = false;
      p.answer = null;
    }
  }

  recordAnswer(username: string, answer: number): { correct: boolean; alreadyAnswered: boolean } {
    if (this.state.phase !== "active") return { correct: false, alreadyAnswered: false };
    const key = username.toLowerCase();
    if (!this.state.players.has(key)) {
      this.state.players.set(key, {
        username, displayName: username, score: 0, answeredThisQ: false, answer: null,
      });
    }
    const p = this.state.players.get(key)!;
    if (p.answeredThisQ) return { correct: false, alreadyAnswered: true };
    p.answeredThisQ = true;
    p.answer = answer;
    const correct = answer === this.state.currentCorrectAnswer;
    if (correct) this.state.correctAnswerOrder.push(key);
    this.state.answerDistribution[String(answer)] = (this.state.answerDistribution[String(answer)] || 0) + 1;
    this.state.totalAnswers++;
    return { correct, alreadyAnswered: false };
  }

  reveal(): QuestionResult[] {
    this.state.phase = "revealed";
    // Award speed-based points to correct answerers: 1st=10, 2nd=9, ... min 1
    this.state.correctAnswerOrder.forEach((key, idx) => {
      const p = this.state.players.get(key);
      if (p) p.score += Math.max(10 - idx, 1);
    });
    return this.getQuestionResults();
  }

  getQuestionResults(): QuestionResult[] {
    const correct: QuestionResult[] = this.state.correctAnswerOrder.map((key, idx) => {
      const p = this.state.players.get(key)!;
      return {
        username: p.displayName,
        answer: p.answer!,
        correct: true,
        points: Math.max(10 - idx, 1),
        rank: idx + 1,
      };
    });
    const wrong: QuestionResult[] = Array.from(this.state.players.values())
      .filter(p => p.answeredThisQ && !this.state.correctAnswerOrder.includes(p.username.toLowerCase()))
      .map(p => ({
        username: p.displayName,
        answer: p.answer!,
        correct: false,
        points: 0,
        rank: 0,
      }));
    return [...correct, ...wrong];
  }

  getLeaderboard() {
    return Array.from(this.state.players.values())
      .filter(p => p.score > 0 || p.answeredThisQ)
      .sort((a, b) => b.score - a.score)
      .slice(0, 30)
      .map((p, i) => ({ rank: i + 1, username: p.displayName, score: p.score }));
  }

  reset() {
    this.state.players.clear();
    this.state.phase = "idle";
    this.state.currentQuestionId = null;
    this.state.currentCorrectAnswer = null;
    this.state.answerDistribution = { "1": 0, "2": 0, "3": 0, "4": 0 };
    this.state.totalAnswers = 0;
    this.state.correctAnswerOrder = [];
    this.state.currentRound = 0;
    this.state.usedInSession.clear();
  }
}

export const gameState = new GameStateManager();
