import { WebSocket } from "ws";
import { logger } from "./logger";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface ConvinceWS extends WebSocket {
  convinceRoomCode?: string;
  convincePlayerId?: string;
  isAlive?: boolean;
}

const PLAYER_COLORS = [
  "#e040fb","#00e5ff","#ffd600","#f87171","#4ade80",
  "#fb923c","#a78bfa","#34d399","#f472b6","#60a5fa",
  "#facc15","#38bdf8","#fb7185","#86efac","#c084fc",
];

interface ConvincePlayer {
  id: string;
  name: string;
  color: string;
  avatar: string;
  ws: ConvinceWS | null;
  score: number;
  disconnected: boolean;
  isHost: boolean;
  joinOrder: number;
  isBot: boolean;
}

interface ConvinceRoom {
  code: string;
  hostId: string;
  settings: { timerSecs: number; targetScore: number; hideWriting: boolean };
  players: Map<string, ConvincePlayer>;
  phase: "lobby" | "answering" | "revealing" | "rating" | "leaderboard" | "winner";
  currentQuestion: string;
  usedQuestions: Set<string>;
  answers: Map<string, string>;
  currentReviewId: string | null;
  reviewQueue: string[];
  reviewedIds: string[];
  ratings: Map<string, Map<string, number>>;
  timerEnd: number;
  timerHandle: ReturnType<typeof setTimeout> | null;
  roundNum: number;
  winnerId: string | null;
}

// ─── Bot Answers Pool ─────────────────────────────────────────────────────────
const BOT_ANSWERS = [
  "الأدلة العلمية تثبت ذلك بشكل قاطع",
  "كل من جرّب هذا يوافق عليه تماماً",
  "المنطق البسيط يقول إن هذا هو الصواب",
  "الحياة تعلمنا أن هذا الخيار دائماً أفضل",
  "التاريخ يثبت ذلك مراراً وتكراراً",
  "كل الحكماء يؤكدون هذه الحقيقة",
  "جرّب ذلك بنفسك وستقتنع فوراً",
  "الأرقام والإحصاءات تدعم هذا الرأي",
  "هذه حقيقة واضحة يعرفها الجميع",
  "المنطق والعقل يؤيدان هذا الطرح بشكل كامل",
  "هذا ما أثبتته التجربة الشخصية لكثيرين",
  "لا يوجد حجة أقوى من هذه الحقيقة البديهية",
  "العلم الحديث يدعم هذا الطرح بكل وضوح",
];

// ─── Question Bank ────────────────────────────────────────────────────────────
const QUESTIONS: string[] = [
  "أقنعني أن النوم المبكر أفضل من السهر",
  "أقنعني أن القهوة أفضل من الشاي",
  "أقنعني أن الصيف أفضل من الشتاء",
  "أقنعني أن الأكل في المنزل أفضل من المطعم",
  "أقنعني أن السفر بالطيارة أفضل من السيارة",
  "أقنعني أن العيش في المدينة أفضل من الريف",
  "أقنعني أن القراءة أفضل من مشاهدة الأفلام",
  "أقنعني أن امتلاك كلب أفضل من امتلاك قطة",
  "أقنعني أن التطور التكنولوجي يضر أكثر مما ينفع",
  "أقنعني أن لعب الفيديو جيم مفيد للعقل",
  "أقنعني أن العمل من المنزل أفضل من المكتب",
  "أقنعني أن المشي أفضل وسيلة رياضة",
  "أقنعني أن وسائل التواصل الاجتماعي تدمر العلاقات",
  "أقنعني أن الامتحانات لا تقيس الذكاء الحقيقي",
  "أقنعني أن التسوق أونلاين أفضل من المراكز التجارية",
  "أقنعني أن المال لا يشتري السعادة",
  "أقنعني أن الأفلام الكلاسيكية أفضل من الحديثة",
  "أقنعني أن الصداقة أهم من الحب الرومانسي",
  "أقنعني أن اللعب في الطفولة أهم من الدراسة",
  "أقنعني أن الضغط يجعل الناس أكثر إنتاجية",
  "أقنعني أن الكذبة البيضاء مقبولة أحيانًا",
  "أقنعني أن التغيير دائمًا للأفضل",
  "أقنعني أن المدرسة لا تعلمك أهم مهارات الحياة",
  "أقنعني أن الشخص الانطوائي أكثر نجاحًا من الاجتماعي",
  "أقنعني أن الأشخاص الكسالى في بعض الأحيان أذكى",
  "أقنعني أن الغذاء النباتي أفضل للصحة",
  "أقنعني أن الوقت الحر أهم من وقت العمل",
  "أقنعني أن قضاء الوقت وحيدًا أفضل من التجمعات",
  "أقنعني أن الغيرة علامة صحية في العلاقات",
  "أقنعني أن الرياضة الجماعية أفضل من الفردية",
  "أقنعني أن الموسيقى تزيد الإنتاجية",
  "أقنعني أن الذكاء الاصطناعي سيأخذ وظائفنا",
  "أقنعني أن الطعام الحار أفضل من الخفيف",
  "أقنعني أن أفلام الرعب ممتعة",
  "أقنعني أن الصور الذاتية ظاهرة ضارة",
  "أقنعني أن الحياة في الخارج أفضل من البلد الأصلي",
  "أقنعني أن التفاؤل الزائد يضر أحيانًا",
  "أقنعني أن العزلة الاختيارية صحية للعقل",
  "أقنعني أن الفشل أفضل معلم من النجاح",
  "أقنعني أن الصمت أقوى من الكلام في بعض المواقف",
];

// ─── Room Store ───────────────────────────────────────────────────────────────
const rooms = new Map<string, ConvinceRoom>();

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code: string;
  do { code = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join(""); }
  while (rooms.has(code));
  return code;
}

function pickQuestion(room: ConvinceRoom): string {
  const remaining = QUESTIONS.filter(q => !room.usedQuestions.has(q));
  if (remaining.length === 0) { room.usedQuestions.clear(); return QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)]; }
  const q = remaining[Math.floor(Math.random() * remaining.length)];
  room.usedQuestions.add(q);
  return q;
}

function sendToRoom(room: ConvinceRoom, msg: Record<string, unknown>): void {
  const payload = JSON.stringify(msg);
  room.players.forEach(p => {
    if (p.ws && p.ws.readyState === WebSocket.OPEN) p.ws.send(payload);
  });
}

// ─── Bot Helpers ──────────────────────────────────────────────────────────────
function scheduleBotAnswers(room: ConvinceRoom): void {
  room.players.forEach(bot => {
    if (!bot.isBot || bot.disconnected) return;
    const delay = 2000 + Math.random() * 4000;
    setTimeout(() => {
      if (room.phase !== "answering") return;
      if (room.answers.has(bot.id)) return;
      const answer = BOT_ANSWERS[Math.floor(Math.random() * BOT_ANSWERS.length)];
      room.answers.set(bot.id, answer);
      broadcastState(room);
      const eligible = Array.from(room.players.values()).filter(p => !p.disconnected);
      if (eligible.every(p => room.answers.has(p.id))) endAnswering(room);
    }, delay);
  });
}

function scheduleBotRatings(room: ConvinceRoom, reviewedPlayerId: string): void {
  room.players.forEach(bot => {
    if (!bot.isBot || bot.disconnected || bot.id === reviewedPlayerId) return;
    const delay = 800 + Math.random() * 2000;
    setTimeout(() => {
      if (room.phase !== "rating" || room.currentReviewId !== reviewedPlayerId) return;
      const ratingMap = room.ratings.get(reviewedPlayerId) ?? new Map();
      room.ratings.set(reviewedPlayerId, ratingMap);
      if (ratingMap.has(bot.id)) return;
      const score = Math.floor(Math.random() * 5) + 5; // 5-9
      ratingMap.set(bot.id, score);
      broadcastState(room);
      checkRatingComplete(room);
    }, delay);
  });
}

function roomState(room: ConvinceRoom, forPlayerId?: string): Record<string, unknown> {
  const players = Array.from(room.players.values())
    .sort((a, b) => b.score - a.score || a.joinOrder - b.joinOrder)
    .map(p => ({
      id: p.id, name: p.name, color: p.color, avatar: p.avatar, score: p.score,
      isHost: p.isHost, disconnected: p.disconnected,
      hasAnswered: room.answers.has(p.id), isBot: p.isBot,
    }));

  let currentReview: Record<string, unknown> | null = null;
  if (room.currentReviewId) {
    const rp = room.players.get(room.currentReviewId);
    if (rp) currentReview = {
      id: rp.id, name: rp.name, color: rp.color, avatar: rp.avatar,
      answer: room.phase === "revealing" ? null : (room.answers.get(rp.id) ?? ""),
      myRating: forPlayerId ? (room.ratings.get(rp.id)?.get(forPlayerId) ?? null) : null,
      ratingsCount: room.ratings.get(rp.id)?.size ?? 0,
      totalRaters: Array.from(room.players.values()).filter(p => p.id !== rp.id && !p.disconnected).length,
    };
  }

  const winner = room.winnerId ? room.players.get(room.winnerId) : null;

  return {
    type: "convince:state",
    code: room.code,
    phase: room.phase,
    roundNum: room.roundNum,
    question: room.currentQuestion,
    players,
    currentReview,
    reviewedIds: room.reviewedIds,
    reviewQueueLength: room.reviewQueue.length,
    timerEnd: room.timerEnd,
    settings: room.settings,
    winner: winner ? { id: winner.id, name: winner.name, color: winner.color, avatar: winner.avatar } : null,
  };
}

function broadcastState(room: ConvinceRoom): void {
  room.players.forEach(p => {
    if (p.ws && p.ws.readyState === WebSocket.OPEN) {
      p.ws.send(JSON.stringify(roomState(room, p.id)));
    }
  });
}

function checkRatingComplete(room: ConvinceRoom): void {
  const reviewId = room.currentReviewId;
  if (!reviewId) return;
  const ratingMap = room.ratings.get(reviewId) ?? new Map();
  const eligible = Array.from(room.players.values()).filter(p => p.id !== reviewId && !p.disconnected);
  if (ratingMap.size < eligible.length) return;

  // Tally: sum of ratings × (targetScore / max_possible) to normalize
  const total = Array.from(ratingMap.values()).reduce((s, v) => s + v, 0);
  const ratedPlayer = room.players.get(reviewId)!;
  ratedPlayer.score += total;

  room.reviewedIds.push(reviewId);
  room.currentReviewId = null;

  // Check winner
  if (ratedPlayer.score >= room.settings.targetScore) {
    room.phase = "winner";
    room.winnerId = reviewId;
    broadcastState(room);
    return;
  }

  // Return to revealing if more players remain, otherwise start next round
  if (room.reviewQueue.length > 0) {
    room.phase = "revealing";
    broadcastState(room);
  } else {
    startNextRound(room);
  }
}

// ─── Message Handlers ─────────────────────────────────────────────────────────
export function handleConvinceMessage(ws: ConvinceWS, msg: Record<string, unknown>): void {
  const type = msg.type as string;

  // ── Create Room ──────────────────────────────────────────────────────────
  if (type === "convince:create") {
    const name = String(msg.name || "الهوست");
    const timerSecs = Number(msg.timerSecs ?? 30);
    const targetScore = Number(msg.targetScore ?? 50);
    const hideWriting = Boolean(msg.hideWriting ?? false);

    const code = generateCode();
    const playerId = `${name}_${Date.now()}`;

    const room: ConvinceRoom = {
      code, hostId: playerId,
      settings: { timerSecs, targetScore, hideWriting },
      players: new Map(),
      phase: "lobby",
      currentQuestion: "",
      usedQuestions: new Set(),
      answers: new Map(),
      currentReviewId: null,
      reviewQueue: [],
      reviewedIds: [],
      ratings: new Map(),
      timerEnd: 0,
      timerHandle: null,
      roundNum: 0,
      winnerId: null,
    };

    const avatar = String(msg.avatar ?? "");
    const colorIdx = 0;
    room.players.set(playerId, {
      id: playerId, name, color: PLAYER_COLORS[colorIdx % PLAYER_COLORS.length],
      avatar, ws, score: 0, disconnected: false, isHost: true, joinOrder: 0, isBot: false,
    });

    ws.convinceRoomCode = code;
    ws.convincePlayerId = playerId;
    rooms.set(code, room);

    ws.send(JSON.stringify({ type: "convince:created", code, playerId }));
    broadcastState(room);
    logger.info({ code, name }, "Convince room created");
    return;
  }

  // ── Join Room ────────────────────────────────────────────────────────────
  if (type === "convince:join") {
    const code = String(msg.code || "").toUpperCase().trim();
    const name = String(msg.name || "لاعب").slice(0, 20).trim() || "لاعب";

    const room = rooms.get(code);
    if (!room) { ws.send(JSON.stringify({ type: "convince:error", message: "الغرفة غير موجودة أو انتهت" })); return; }
    if (room.phase !== "lobby") { ws.send(JSON.stringify({ type: "convince:error", message: "اللعبة بدأت بالفعل" })); return; }

    const playerId = `${name}_${Date.now()}`;
    const colorIdx = room.players.size;
    const avatar = String(msg.avatar ?? "");
    room.players.set(playerId, {
      id: playerId, name, color: PLAYER_COLORS[colorIdx % PLAYER_COLORS.length],
      avatar, ws, score: 0, disconnected: false, isHost: false, joinOrder: colorIdx, isBot: false,
    });

    ws.convinceRoomCode = code;
    ws.convincePlayerId = playerId;

    ws.send(JSON.stringify({ type: "convince:joined", code, playerId }));
    broadcastState(room);
    logger.info({ code, name }, "Player joined convince room");
    return;
  }

  // ── Rest require existing room ────────────────────────────────────────────
  const roomCode = ws.convinceRoomCode;
  const playerId = ws.convincePlayerId;
  if (!roomCode || !playerId) return;
  const room = rooms.get(roomCode);
  if (!room) return;
  const player = room.players.get(playerId);
  if (!player) return;

  // ── Add Bot ───────────────────────────────────────────────────────────────
  if (type === "convince:add_bot") {
    if (!player.isHost || room.phase !== "lobby") return;
    if (room.players.size >= 10) {
      ws.send(JSON.stringify({ type: "convince:error", message: "الغرفة ممتلئة (الحد الأقصى 10 لاعبين)" }));
      return;
    }
    const botCount = Array.from(room.players.values()).filter(p => p.isBot).length + 1;
    const botId = `bot_${Date.now()}_${botCount}`;
    const colorIdx = room.players.size;
    room.players.set(botId, {
      id: botId, name: `Bot ${botCount}`,
      color: PLAYER_COLORS[colorIdx % PLAYER_COLORS.length],
      avatar: "🤖", ws: null, score: 0, disconnected: false, isHost: false,
      joinOrder: colorIdx, isBot: true,
    });
    broadcastState(room);
    return;
  }

  // ── Remove Bot ────────────────────────────────────────────────────────────
  if (type === "convince:remove_bot") {
    if (!player.isHost || room.phase !== "lobby") return;
    const botId = String(msg.botId ?? "");
    const bot = room.players.get(botId);
    if (!bot || !bot.isBot) return;
    room.players.delete(botId);
    // Re-number remaining bots
    let botNum = 1;
    room.players.forEach(p => { if (p.isBot) p.name = `Bot ${botNum++}`; });
    broadcastState(room);
    return;
  }

  // ── Start Game ───────────────────────────────────────────────────────────
  if (type === "convince:start") {
    if (!player.isHost) return;
    if (room.players.size < 2) { ws.send(JSON.stringify({ type: "convince:error", message: "تحتاج لاعبَين على الأقل" })); return; }

    room.phase = "answering";
    room.roundNum++;
    room.currentQuestion = pickQuestion(room);
    room.answers.clear();
    room.currentReviewId = null;
    room.reviewQueue = Array.from(room.players.values()).filter(p => !p.disconnected).map(p => p.id);
    room.reviewedIds = [];
    room.ratings.clear();
    room.timerEnd = Date.now() + room.settings.timerSecs * 1000;

    if (room.timerHandle) clearTimeout(room.timerHandle);
    room.timerHandle = setTimeout(() => endAnswering(room), room.settings.timerSecs * 1000 + 500);

    broadcastState(room);
    scheduleBotAnswers(room);
    return;
  }

  // ── Submit Answer ─────────────────────────────────────────────────────────
  if (type === "convince:answer") {
    if (room.phase !== "answering") return;
    const answer = String(msg.answer || "").slice(0, 500).trim();
    if (!answer) return;
    room.answers.set(playerId, answer);
    broadcastState(room);

    // Auto-advance if everyone answered
    const eligible = Array.from(room.players.values()).filter(p => !p.disconnected);
    if (eligible.every(p => room.answers.has(p.id))) endAnswering(room);
    return;
  }

  // ── Show Player (host picks who to reveal) ────────────────────────────────
  if (type === "convince:show_player") {
    if (!player.isHost) return;
    if (room.phase !== "revealing" && room.phase !== "leaderboard") return;
    const targetId = String(msg.targetId || "");
    if (!room.reviewQueue.includes(targetId)) return;

    room.currentReviewId = targetId;
    room.reviewQueue = room.reviewQueue.filter(id => id !== targetId);
    room.ratings.set(targetId, new Map());
    room.phase = "rating";
    broadcastState(room);
    scheduleBotRatings(room, targetId);
    return;
  }

  // ── Rate a Player ─────────────────────────────────────────────────────────
  if (type === "convince:rate") {
    if (room.phase !== "rating") return;
    if (!room.currentReviewId) return;
    if (playerId === room.currentReviewId) return; // can't rate yourself
    const score = Math.max(1, Math.min(10, Number(msg.score ?? 5)));
    const ratingMap = room.ratings.get(room.currentReviewId) ?? new Map();
    room.ratings.set(room.currentReviewId, ratingMap);
    ratingMap.set(playerId, score);
    broadcastState(room);
    checkRatingComplete(room);
    return;
  }

  // ── Next Player (host advances from leaderboard) ──────────────────────────
  if (type === "convince:next_player") {
    if (!player.isHost) return;
    if (room.phase !== "leaderboard") return;
    if (room.reviewQueue.length > 0) {
      room.phase = "revealing";
      broadcastState(room);
    } else {
      // All reviewed → next round
      startNextRound(room);
    }
    return;
  }

  // ── Play Again ────────────────────────────────────────────────────────────
  if (type === "convince:play_again") {
    if (!player.isHost) return;
    room.players.forEach(p => { p.score = 0; });
    room.phase = "lobby";
    room.answers.clear();
    room.currentReviewId = null;
    room.reviewQueue = [];
    room.reviewedIds = [];
    room.ratings.clear();
    room.currentQuestion = "";
    room.roundNum = 0;
    room.winnerId = null;
    room.usedQuestions.clear();
    if (room.timerHandle) clearTimeout(room.timerHandle);
    broadcastState(room);
    return;
  }

  // ── Update Settings ───────────────────────────────────────────────────────
  if (type === "convince:settings") {
    if (!player.isHost || room.phase !== "lobby") return;
    if (msg.timerSecs) room.settings.timerSecs = Number(msg.timerSecs);
    if (msg.targetScore) room.settings.targetScore = Number(msg.targetScore);
    if (typeof msg.hideWriting === "boolean") room.settings.hideWriting = msg.hideWriting;
    broadcastState(room);
    return;
  }
}

function endAnswering(room: ConvinceRoom): void {
  if (room.phase !== "answering") return;
  if (room.timerHandle) { clearTimeout(room.timerHandle); room.timerHandle = null; }
  room.phase = "revealing";
  room.reviewQueue = Array.from(room.players.values()).filter(p => !p.disconnected).map(p => p.id);
  broadcastState(room);
}

function startNextRound(room: ConvinceRoom): void {
  room.phase = "answering";
  room.roundNum++;
  room.currentQuestion = pickQuestion(room);
  room.answers.clear();
  room.currentReviewId = null;
  room.reviewQueue = Array.from(room.players.values()).filter(p => !p.disconnected).map(p => p.id);
  room.reviewedIds = [];
  room.ratings.clear();
  room.timerEnd = Date.now() + room.settings.timerSecs * 1000;

  if (room.timerHandle) clearTimeout(room.timerHandle);
  room.timerHandle = setTimeout(() => endAnswering(room), room.settings.timerSecs * 1000 + 500);
  broadcastState(room);
  scheduleBotAnswers(room);
}

// ─── Disconnect Handler ───────────────────────────────────────────────────────
export function handleConvinceDisconnect(ws: ConvinceWS): void {
  const code = ws.convinceRoomCode;
  const playerId = ws.convincePlayerId;
  if (!code || !playerId) return;
  const room = rooms.get(code);
  if (!room) return;
  const player = room.players.get(playerId);
  if (!player) return;

  player.disconnected = true;
  player.ws = null;

  if (room.phase === "lobby" && player.isHost) {
    sendToRoom(room, { type: "convince:host_left" });
    rooms.delete(code);
    return;
  }

  // If in rating and current reviewer disconnected, check completion
  if (room.phase === "rating") checkRatingComplete(room);

  broadcastState(room);
  logger.debug({ code, playerId }, "Convince player disconnected");
}
