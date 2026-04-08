import { WebSocket } from "ws";
import { logger } from "./logger";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface ImposterWS extends WebSocket {
  roomCode?: string;
  playerId?: string;
  isAlive?: boolean;
}

interface RoomPlayer {
  id: string;
  name: string;
  avatar: string;
  ws: ImposterWS | null;
  voted: boolean;
  disconnected: boolean;
  eliminated: boolean;
  role: "host" | "player";
}

interface QAEntry {
  askerId: string;
  askerName: string;
  targetId: string;
  targetName: string;
  question: string;
  answer: string | null;
  timedOut: boolean;
}

interface GameRoom {
  code: string;
  roomName: string;
  category: Category;
  durationMs: number;
  phase: "lobby" | "countdown" | "reveal" | "playing" | "voting" | "elimination" | "result";
  hostWs: ImposterWS;
  hostPlayerId: string;
  players: Map<string, RoomPlayer>;
  playerOrder: string[];
  word: string;
  imposterId: string;
  currentTurnIdx: number;
  currentTargetId: string | null;
  currentQuestion: string | null;
  qaHistory: QAEntry[];
  votes: Record<string, string>;
  voteRound: number;
  gameEndAt: number;
  turnEndAt: number;
  lastAnswer: { targetId: string; answer: string } | null;
  gameTimer: ReturnType<typeof setTimeout> | null;
  turnTimer: ReturnType<typeof setTimeout> | null;
  answerTimer: ReturnType<typeof setTimeout> | null;
  timerInterval: ReturnType<typeof setInterval> | null;
  usedWords: Set<string>;
}

// ─── Category types ───────────────────────────────────────────────────────────
export type Category = "دول" | "حيوانات" | "أكلات" | "أشياء" | "عام";

// ─── Word Bank (per category) ─────────────────────────────────────────────────
const WORD_BANK: Record<Category, string[]> = {
  دول: [
    "السعودية","مصر","الإمارات","الكويت","قطر","البحرين","عُمان","اليمن",
    "الأردن","العراق","سوريا","لبنان","المغرب","تونس","الجزائر","ليبيا",
    "السودان","تركيا","إيران","باكستان","الهند","الصين","اليابان","كوريا",
    "إندونيسيا","ماليزيا","أمريكا","كندا","المكسيك","البرازيل","الأرجنتين",
    "فرنسا","ألمانيا","إيطاليا","إسبانيا","البرتغال","هولندا","بلجيكا",
    "السويد","النرويج","الدنمارك","فنلندا","روسيا","بولندا","اليونان",
    "سويسرا","النمسا","أستراليا","نيوزيلندا","جنوب أفريقيا","نيجيريا","كينيا",
  ],
  حيوانات: [
    "أسد","نمر","فهد","دب","ذئب","ثعلب","قرد","غوريلا","فيل","زرافة",
    "وحيد القرن","حصان","جمل","بقرة","خروف","كلب","قطة","أرنب","سنجاب",
    "كنغر","قنفذ","دلفين","حوت","قرش","أخطبوط","سلحفاة","تمساح","أفعى",
    "ضفدع","طاووس","نسر","ببغاء","بطريق","نعامة","بومة","خفاش","عقرب",
    "نمل","نحل","كوبرا","ثعلب قطبي","دب قطبي","فقمة","ضبع","قندس",
  ],
  أكلات: [
    "برجر","بيتزا","سوشي","مندي","كبسة","شاورما","فلافل","شيش طاووق",
    "كباب","مطبق","جريش","مرقوق","هريس","بيريياني","تاكو","باستا",
    "لازانيا","ستيك","سمك مشوي","ربيان","حمص","متبل","فتوش","تبولة",
    "كنافة","بقلاوة","أم علي","تشيز كيك","آيس كريم","وافل","شاكشوكة",
    "فول مدمس","ملوخية","محشي","كوشري","دونات","كرواسون","كلوريا",
    "بف باستري","فرنش تواست","لقيمات","خبيصة","عصيدة","مضغوط","مكبوس",
  ],
  أشياء: [
    "موبايل","لابتوب","كاميرا","تلفزيون","سماعة","تابلت","ساعة","نظارة",
    "مفتاح","محفظة","خاتم","قلم","دفتر","كتاب","مقص","مشط","مرآة",
    "شمعة","مصباح","مروحة","مكيف","غسالة","ثلاجة","ميكروويف","كرسي",
    "طاولة","سرير","وسادة","بطانية","حقيبة","شنطة سفر","مظلة","كرة",
    "مقود","سيارة","دراجة","طائرة ورقية","لعبة بوردج","شطرنج","ورق لعب",
    "عود","جيتار","ناي","بيانو","طبلة","ميكرفون","سماعات أذن",
  ],
  عام: [
    "ديزني لاند","الكعبة المكرمة","برج إيفل","أهرام مصر","برج خليفة",
    "كرة القدم","السباحة","التنس","الغولف","الملاكمة","ركوب الخيل",
    "مطبخ","حديقة","مسجد","مستشفى","ملعب","مطار","شاطئ","جبل",
    "صحراء","غابة","نهر","بحيرة","بركان","طبيب","شرطي","طباخ",
    "رياضي","مصور","طيار","رائد فضاء","مدرسة","جامعة","سوق","مول",
    "فندق","مطعم","سينما","مسرح","حفلة","رحلة","مخيم","غطس",
  ],
};

// ─── Room store ────────────────────────────────────────────────────────────────
export const rooms = new Map<string, GameRoom>();

// ─── Helpers ──────────────────────────────────────────────────────────────────
function genCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function send(ws: ImposterWS | null | undefined, msg: object): void {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function broadcast(room: GameRoom, msg: object, skip?: ImposterWS): void {
  const payload = JSON.stringify(msg);
  room.players.forEach(p => {
    if (p.ws && p.ws !== skip && p.ws.readyState === WebSocket.OPEN)
      p.ws.send(payload);
  });
}

function publicPlayers(room: GameRoom) {
  return Array.from(room.players.values()).map(p => ({
    id: p.id, name: p.name, avatar: p.avatar,
    connected: !!(p.ws && p.ws.readyState === WebSocket.OPEN),
    voted: p.voted, disconnected: p.disconnected,
    eliminated: p.eliminated,
    role: p.role,
  }));
}

function stateMsg(room: GameRoom) {
  return {
    type: "imposter:state",
    code: room.code,
    roomName: room.roomName,
    category: room.category,
    durationMs: room.durationMs,
    phase: room.phase,
    word: room.word,
    hostPlayerId: room.hostPlayerId,
    players: publicPlayers(room),
    playerOrder: room.playerOrder,
    currentTurnIdx: room.currentTurnIdx,
    currentTurnId: room.playerOrder[room.currentTurnIdx] ?? null,
    currentTargetId: room.currentTargetId,
    currentQuestion: room.currentQuestion,
    qaHistory: room.qaHistory,
    lastAnswer: room.lastAnswer,
    voteRound: room.voteRound,
    gameRemaining: room.gameEndAt ? Math.max(0, room.gameEndAt - Date.now()) : 0,
    turnRemaining: room.turnEndAt ? Math.max(0, room.turnEndAt - Date.now()) : 0,
  };
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Pick a random word from the category, avoiding previously used words in this session. */
function pickWord(room: GameRoom): string {
  const bank = WORD_BANK[room.category] ?? WORD_BANK["عام"];
  const available = bank.filter(w => !room.usedWords.has(w));
  const pool = available.length > 0 ? available : bank; // reset if exhausted
  const word = pool[Math.floor(Math.random() * pool.length)];
  room.usedWords.add(word);
  return word;
}

// ─── Turn management ──────────────────────────────────────────────────────────
function advanceTurn(room: GameRoom, timedOut?: boolean): void {
  if (room.phase !== "playing") return;
  if (room.turnTimer)   clearTimeout(room.turnTimer);
  if (room.answerTimer) clearTimeout(room.answerTimer);
  room.answerTimer = null;

  if (timedOut && room.currentTargetId && room.currentQuestion) {
    const asker   = room.players.get(room.playerOrder[room.currentTurnIdx]);
    const target  = room.players.get(room.currentTargetId);
    room.qaHistory.push({
      askerId:    room.playerOrder[room.currentTurnIdx],
      askerName:  asker?.name ?? "؟",
      targetId:   room.currentTargetId,
      targetName: target?.name ?? "؟",
      question:   room.currentQuestion,
      answer:     null,
      timedOut:   true,
    });
  }

  room.currentTargetId = null;
  room.currentQuestion = null;
  room.lastAnswer = null;

  let next = (room.currentTurnIdx + 1) % room.playerOrder.length;
  for (let i = 0; i < room.playerOrder.length; i++) {
    const p = room.players.get(room.playerOrder[next]);
    if (p && !p.disconnected && !p.eliminated) break;
    next = (next + 1) % room.playerOrder.length;
  }
  room.currentTurnIdx = next;
  room.turnEndAt = Date.now() + 75_000;
  room.turnTimer = setTimeout(() => advanceTurn(room, true), 75_000);

  broadcast(room, stateMsg(room));

  const curId = room.playerOrder[room.currentTurnIdx];
  const curP  = room.players.get(curId);
  send(curP?.ws, { type: "imposter:your_turn" });
}

// ─── Voting ───────────────────────────────────────────────────────────────────
function startVoting(room: GameRoom): void {
  if (room.gameTimer) clearTimeout(room.gameTimer);
  if (room.turnTimer) clearTimeout(room.turnTimer);
  if (room.timerInterval) clearInterval(room.timerInterval);
  room.gameTimer = null; room.turnTimer = null; room.timerInterval = null;

  room.phase = "voting";
  room.votes = {};
  room.lastAnswer = null;
  // Eliminated players are auto-considered voted so they don't block completion
  room.players.forEach(p => { p.voted = p.eliminated || p.disconnected; });
  broadcast(room, stateMsg(room));
}

function checkVoteDone(room: GameRoom): void {
  // Only non-eliminated, non-disconnected players need to cast a vote
  const active = Array.from(room.players.values()).filter(p => !p.disconnected && !p.eliminated);
  if (!active.every(p => p.voted)) return;

  // Tally votes (skip "skip" entries)
  const counts: Record<string, number> = {};
  Object.values(room.votes).forEach(t => {
    if (t !== "skip") counts[t] = (counts[t] ?? 0) + 1;
  });

  let topId = "";
  let topCount = 0;
  Object.entries(counts).forEach(([id, c]) => { if (c > topCount) { topCount = c; topId = id; } });

  const imposter = room.players.get(room.imposterId);

  // ── Case 1: Correct! Imposter was voted out ────────────────────────────────
  if (topId === room.imposterId) {
    room.phase = "result";
    broadcast(room, stateMsg(room)); // ← CRITICAL: update phase on all clients
    broadcast(room, {
      type: "imposter:result",
      imposterName: imposter?.name ?? "؟",
      imposterId: room.imposterId,
      word: room.word,
      winner: "players",
      votes: room.votes,
      counts,
    });
    return;
  }

  // ── Case 2: All skipped or nobody selected → imposter wins ────────────────
  if (!topId) {
    room.phase = "result";
    broadcast(room, stateMsg(room)); // ← CRITICAL
    broadcast(room, {
      type: "imposter:result",
      imposterName: imposter?.name ?? "؟",
      imposterId: room.imposterId,
      word: room.word,
      winner: "imposter",
      votes: room.votes,
      counts,
    });
    return;
  }

  // ── Case 3: Wrong person was voted out ────────────────────────────────────
  const eliminatedPlayer = room.players.get(topId);
  if (eliminatedPlayer) eliminatedPlayer.eliminated = true;
  room.voteRound += 1;

  // Count remaining active players after elimination
  const remaining = Array.from(room.players.values()).filter(p => !p.disconnected && !p.eliminated);

  // End condition: too few players (<3 means imposter vs ≤1 innocent) OR used 2 vote rounds
  const MAX_VOTE_ROUNDS = 2;
  if (remaining.length < 3 || room.voteRound >= MAX_VOTE_ROUNDS) {
    const imposter = room.players.get(room.imposterId);
    room.phase = "result";
    broadcast(room, stateMsg(room));
    broadcast(room, {
      type: "imposter:result",
      imposterName: imposter?.name ?? "؟",
      imposterId: room.imposterId,
      word: room.word,
      winner: "imposter",
      eliminatedName: eliminatedPlayer?.name ?? "؟",
      votes: room.votes,
      counts,
    });
    return;
  }

  // Show elimination screen then resume
  room.phase = "elimination";
  broadcast(room, stateMsg(room)); // update phase + eliminated flag for all clients
  broadcast(room, {
    type: "imposter:elimination",
    eliminatedId: topId,
    eliminatedName: eliminatedPlayer?.name ?? "؟",
    votes: room.votes,
    counts,
  });

  // Auto-resume after 4 seconds
  setTimeout(() => resumeAfterElimination(room), 4_000);
}

function resumeAfterElimination(room: GameRoom): void {
  if (room.phase !== "elimination") return;

  // Remove eliminated / disconnected players from turn order
  room.playerOrder = room.playerOrder.filter(id => {
    const p = room.players.get(id);
    return p && !p.eliminated && !p.disconnected;
  });

  // Resume playing phase — fresh Q&A round, keep game timer running
  room.phase = "playing";
  room.votes = {};
  room.qaHistory = [];
  room.currentTurnIdx = 0;
  room.currentTargetId = null;
  room.currentQuestion = null;
  room.lastAnswer = null;

  // Restart game timer (remaining duration)
  const timeLeft = Math.max(30_000, room.gameEndAt - Date.now());
  room.gameTimer = setTimeout(() => startVoting(room), timeLeft);

  // Restart turn timers
  room.turnEndAt = Date.now() + 75_000;
  room.turnTimer = setTimeout(() => advanceTurn(room, true), 75_000);
  room.timerInterval = setInterval(() => {
    if (room.phase !== "playing") { clearInterval(room.timerInterval!); room.timerInterval = null; return; }
    broadcast(room, {
      type: "imposter:timer",
      gameRemaining: Math.max(0, room.gameEndAt - Date.now()),
      turnRemaining: Math.max(0, room.turnEndAt - Date.now()),
    });
  }, 1_000);

  broadcast(room, stateMsg(room));

  const firstId = room.playerOrder[0];
  const firstP = room.players.get(firstId);
  send(firstP?.ws, { type: "imposter:your_turn" });
}

// ─── Message handler ──────────────────────────────────────────────────────────
export function handleImposterMessage(ws: ImposterWS, msg: Record<string, unknown>): void {
  const type = msg.type as string;

  // Create room
  if (type === "imposter:create") {
    let code = genCode();
    while (rooms.has(code)) code = genCode();

    const rawCat = String(msg.category ?? "عام");
    const category: Category = (["دول","حيوانات","أكلات","أشياء","عام"] as Category[]).includes(rawCat as Category)
      ? (rawCat as Category) : "عام";

    const rawDur = Number(msg.duration ?? 5);
    const durationMins = [5, 10, 15, 20].includes(rawDur) ? rawDur : 5;
    const durationMs = durationMins * 60_000;

    const roomName = String(msg.roomName ?? "برا السالفة").slice(0, 30);
    const hostName = String(msg.hostName ?? "المضيف").trim().slice(0, 20) || "المضيف";
    const hostAvatar = String(msg.hostAvatar ?? `https://api.dicebear.com/7.x/pixel-art/svg?seed=${encodeURIComponent(hostName)}`);
    const hostPlayerId = `host_${Date.now().toString(36)}`;

    const hostPlayer: RoomPlayer = {
      id: hostPlayerId, name: hostName, avatar: hostAvatar,
      ws, voted: false, disconnected: false, eliminated: false, role: "host",
    };

    const room: GameRoom = {
      code, roomName, category, durationMs,
      phase: "lobby", hostWs: ws, hostPlayerId,
      players: new Map([[hostPlayerId, hostPlayer]]),
      playerOrder: [hostPlayerId],
      word: "", imposterId: "",
      currentTurnIdx: 0, currentTargetId: null, currentQuestion: null,
      qaHistory: [],
      votes: {}, voteRound: 0, gameEndAt: 0, turnEndAt: 0, lastAnswer: null,
      gameTimer: null, turnTimer: null, answerTimer: null, timerInterval: null,
      usedWords: new Set(),
    };
    rooms.set(code, room);
    ws.roomCode = code;
    ws.playerId = hostPlayerId;
    send(ws, { type: "imposter:created", code, roomName, category, durationMs, hostPlayerId });
    send(ws, stateMsg(room)); // send full state so host sees themselves in lobby immediately
    logger.info({ code, category, durationMins, hostName }, "برا السالفة room created");
    return;
  }

  // Join room
  if (type === "imposter:join") {
    const code = String(msg.room ?? "").toUpperCase();
    const name = String(msg.name ?? "لاعب").slice(0, 20);
    const avatar = String(msg.avatar ?? `https://api.dicebear.com/7.x/pixel-art/svg?seed=${name}`);

    const room = rooms.get(code);
    if (!room) { send(ws, { type: "imposter:error", message: "الغرفة غير موجودة" }); return; }
    if (room.phase !== "lobby") { send(ws, { type: "imposter:error", message: "اللعبة بدأت بالفعل" }); return; }

    const playerId = `${name.toLowerCase().replace(/\s+/g,"_")}_${Date.now().toString(36)}`;
    const player: RoomPlayer = { id: playerId, name, avatar, ws, voted: false, disconnected: false, eliminated: false, role: "player" };
    room.players.set(playerId, player);
    room.playerOrder.push(playerId);
    ws.roomCode = code;
    ws.playerId = playerId;

    send(ws, { type: "imposter:joined", playerId, code, roomName: room.roomName });
    broadcast(room, stateMsg(room));
    return;
  }

  // Get state
  if (type === "imposter:get_state") {
    const code = String(msg.room ?? ws.roomCode ?? "").toUpperCase();
    const room = rooms.get(code);
    if (!room) { send(ws, { type: "imposter:error", message: "الغرفة غير موجودة" }); return; }
    send(ws, stateMsg(room));
    return;
  }

  // Start game (host only)
  if (type === "imposter:start") {
    const room = rooms.get(ws.roomCode ?? "");
    if (!room || ws.playerId !== room.hostPlayerId) return;
    if (room.players.size < 3) { send(ws, { type: "imposter:error", message: "يلزم ٣ لاعبين على الأقل" }); return; }

    // Pick word + imposter immediately
    room.word      = pickWord(room);
    const ids      = Array.from(room.players.keys());
    room.imposterId   = ids[Math.floor(Math.random() * ids.length)];
    room.playerOrder  = shuffle([...ids]);
    room.currentTurnIdx  = 0;
    room.currentTargetId = null;
    room.currentQuestion = null;
    room.qaHistory       = [];
    room.lastAnswer      = null;
    room.voteRound = 0;
    room.players.forEach(p => { p.voted = false; p.eliminated = false; });

    // ── Phase 1: COUNTDOWN (5 s) ──────────────────────────────────────────────
    room.phase = "countdown";
    broadcast(room, stateMsg(room));

    setTimeout(() => {
      if (!rooms.has(room.code)) return;

      // ── Phase 2: REVEAL (3 s) ──────────────────────────────────────────────
      room.phase = "reveal";
      // Send role privately to each player
      room.players.forEach(p => {
        const isImposter = p.id === room.imposterId;
        send(p.ws, {
          type: "imposter:role",
          role: isImposter ? "imposter" : "player",
          word: isImposter ? null : room.word,
        });
      });
      broadcast(room, stateMsg(room));

      setTimeout(() => {
        if (!rooms.has(room.code)) return;

        // ── Phase 3: PLAYING ──────────────────────────────────────────────────
        room.phase      = "playing";
        room.gameEndAt  = Date.now() + room.durationMs;
        room.turnEndAt  = Date.now() + 75_000;
        broadcast(room, stateMsg(room));

        // Notify first player
        const first = room.players.get(room.playerOrder[0]);
        send(first?.ws, { type: "imposter:your_turn" });

        // Timers
        room.gameTimer = setTimeout(() => startVoting(room), room.durationMs);
        room.turnTimer = setTimeout(() => advanceTurn(room, true), 75_000);
        room.timerInterval = setInterval(() => {
          if (room.phase !== "playing") { clearInterval(room.timerInterval!); room.timerInterval = null; return; }
          broadcast(room, {
            type: "imposter:timer",
            gameRemaining: Math.max(0, room.gameEndAt - Date.now()),
            turnRemaining: Math.max(0, room.turnEndAt - Date.now()),
          });
        }, 1_000);

        logger.info({ code: room.code, word: room.word, category: room.category }, "برا السالفة game started");
      }, 3_000);
    }, 5_000);

    return;
  }

  // Change avatar
  if (type === "imposter:change_avatar") {
    const code = ws.roomCode;
    const pid  = ws.playerId;
    if (!code || !pid) return;
    const room = rooms.get(code);
    if (!room) return;
    const player = room.players.get(pid);
    if (!player) return;
    const newAvatar = String(msg.avatar ?? "").slice(0, 300);
    if (!newAvatar.startsWith("https://")) return;
    player.avatar = newAvatar;
    broadcast(room, stateMsg(room));
    return;
  }

  // Send question (current turn player → selects target + writes question)
  if (type === "imposter:send_question") {
    const room = rooms.get(ws.roomCode ?? "");
    if (!room || room.phase !== "playing") return;
    const targetId  = String(msg.targetId ?? "");
    const question  = String(msg.question  ?? "").trim().slice(0, 200);
    if (!question) return;
    const currentId = room.playerOrder[room.currentTurnIdx];
    const current   = room.players.get(currentId);
    if (!current || current.ws !== ws || current.eliminated) return;
    const targetPlayer = room.players.get(targetId);
    if (!targetPlayer || targetId === currentId || targetPlayer.eliminated || targetPlayer.disconnected) return;

    if (room.turnTimer)   clearTimeout(room.turnTimer);
    room.currentTargetId = targetId;
    room.currentQuestion = question;
    broadcast(room, stateMsg(room));

    const target = room.players.get(targetId);
    send(target?.ws, { type: "imposter:answer_now" });

    // Answer timer: 45 seconds
    room.answerTimer = setTimeout(() => advanceTurn(room, true), 45_000);
    return;
  }

  // Send answer (target player → نعم / لا)
  if (type === "imposter:send_answer_text") {
    const room = rooms.get(ws.roomCode ?? "");
    if (!room || room.phase !== "playing" || !room.currentTargetId || !room.currentQuestion) return;
    const target = room.players.get(room.currentTargetId);
    if (!target || target.ws !== ws || target.eliminated) return;

    const raw = String(msg.answer ?? "").trim();
    const answer = raw === "yes" ? "نعم" : raw === "no" ? "لا" : "";
    if (!answer) return;

    if (room.answerTimer) clearTimeout(room.answerTimer);
    room.answerTimer = null;

    const asker = room.players.get(room.playerOrder[room.currentTurnIdx]);
    room.qaHistory.push({
      askerId:    room.playerOrder[room.currentTurnIdx],
      askerName:  asker?.name ?? "؟",
      targetId:   room.currentTargetId,
      targetName: target.name,
      question:   room.currentQuestion,
      answer,
      timedOut:   false,
    });
    room.lastAnswer = { targetId: room.currentTargetId, answer };
    broadcast(room, stateMsg(room));
    setTimeout(() => advanceTurn(room), 1_500);
    return;
  }

  // Vote
  if (type === "imposter:vote") {
    const room = rooms.get(ws.roomCode ?? "");
    if (!room || room.phase !== "voting") return;
    const voterId = String(msg.voterId ?? ws.playerId ?? "");
    const voter = room.players.get(voterId);
    if (!voter || voter.ws !== ws || voter.voted) return;
    const targetId = String(msg.targetId ?? "skip");
    room.votes[voterId] = targetId;
    voter.voted = true;
    broadcast(room, stateMsg(room));
    checkVoteDone(room);
    return;
  }

  // Force voting (host)
  if (type === "imposter:force_vote") {
    const room = rooms.get(ws.roomCode ?? "");
    if (!room || ws.playerId !== room.hostPlayerId) return;
    startVoting(room);
    return;
  }

  // New round (host)
  if (type === "imposter:new_round") {
    const room = rooms.get(ws.roomCode ?? "");
    if (!room || ws.playerId !== room.hostPlayerId) return;
    if (room.gameTimer)   clearTimeout(room.gameTimer);
    if (room.turnTimer)   clearTimeout(room.turnTimer);
    if (room.answerTimer) clearTimeout(room.answerTimer);
    if (room.timerInterval) clearInterval(room.timerInterval);
    room.gameTimer = null; room.turnTimer = null; room.answerTimer = null; room.timerInterval = null;
    room.phase = "lobby";
    room.votes = {};
    room.word = "";
    room.imposterId = "";
    room.currentTurnIdx = 0;
    room.currentTargetId = null;
    room.currentQuestion = null;
    room.qaHistory = [];
    room.lastAnswer = null;
    room.gameEndAt = 0; room.turnEndAt = 0;
    room.voteRound = 0;
    room.players.forEach(p => { p.voted = false; p.eliminated = false; });
    broadcast(room, stateMsg(room));
    return;
  }

  // Kick player (host only — works in lobby or during game)
  if (type === "imposter:kick") {
    const room = rooms.get(ws.roomCode ?? "");
    if (!room || ws.playerId !== room.hostPlayerId) return;
    const pid = String(msg.playerId ?? "");
    const target = room.players.get(pid);
    if (!target) return;

    if (pid === room.hostPlayerId) {
      // Host kicking themselves → close the room
      broadcast(room, { type: "imposter:host_left" });
      if (room.gameTimer)     clearTimeout(room.gameTimer);
      if (room.turnTimer)     clearTimeout(room.turnTimer);
      if (room.answerTimer)   clearTimeout(room.answerTimer);
      if (room.timerInterval) clearInterval(room.timerInterval);
      rooms.delete(room.code);
      logger.info({ code: room.code }, "برا السالفة room closed (host left via kick self)");
      return;
    }

    send(target.ws, { type: "imposter:removed" });
    if (target.ws) target.ws.close();
    room.players.delete(pid);
    room.playerOrder = room.playerOrder.filter(id => id !== pid);
    broadcast(room, stateMsg(room));
    logger.info({ code: room.code, pid, name: target.name }, "player kicked");
    return;
  }

  // Legacy: remove_player (kept for compatibility, delegates to kick)
  if (type === "imposter:remove_player") {
    const room = rooms.get(ws.roomCode ?? "");
    if (!room || ws.playerId !== room.hostPlayerId || room.phase !== "lobby") return;
    const pid = String(msg.playerId ?? "");
    const p = room.players.get(pid);
    if (p && pid !== room.hostPlayerId) {
      send(p.ws, { type: "imposter:removed" });
      if (p.ws) p.ws.close();
      room.players.delete(pid);
    }
    room.playerOrder = room.playerOrder.filter(id => id !== pid);
    broadcast(room, stateMsg(room));
    return;
  }
}

// ─── Disconnect ────────────────────────────────────────────────────────────────
export function handleImposterDisconnect(ws: ImposterWS): void {
  const code = ws.roomCode;
  if (!code) return;
  const room = rooms.get(code);
  if (!room) return;

  if (ws.playerId === room.hostPlayerId) {
    // Host disconnected → close room for everyone
    // Mark host as disconnected first so broadcast skips them
    const hostPlayer = room.players.get(room.hostPlayerId);
    if (hostPlayer) { hostPlayer.ws = null; hostPlayer.disconnected = true; }
    broadcast(room, { type: "imposter:host_left" });
    if (room.gameTimer)     clearTimeout(room.gameTimer);
    if (room.turnTimer)     clearTimeout(room.turnTimer);
    if (room.answerTimer)   clearTimeout(room.answerTimer);
    if (room.timerInterval) clearInterval(room.timerInterval);
    rooms.delete(code);
    logger.info({ code }, "برا السالفة room closed (host disconnected)");
  } else {
    room.players.forEach(p => {
      if (p.ws === ws) { p.disconnected = true; p.ws = null; }
    });
    broadcast(room, stateMsg(room));
  }
}
