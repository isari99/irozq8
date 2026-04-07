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
}

interface GameRoom {
  code: string;
  roomName: string;
  category: Category;
  durationMs: number;
  phase: "lobby" | "playing" | "voting" | "result";
  hostWs: ImposterWS;
  players: Map<string, RoomPlayer>;
  playerOrder: string[];
  word: string;
  imposterId: string;
  currentTurnIdx: number;
  currentTargetId: string | null;
  votes: Record<string, string>;
  gameEndAt: number;
  turnEndAt: number;
  lastAnswer: { targetId: string; answer: string } | null;
  gameTimer: ReturnType<typeof setTimeout> | null;
  turnTimer: ReturnType<typeof setTimeout> | null;
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
  if (room.hostWs !== skip && room.hostWs.readyState === WebSocket.OPEN)
    room.hostWs.send(payload);
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
    players: publicPlayers(room),
    playerOrder: room.playerOrder,
    currentTurnIdx: room.currentTurnIdx,
    currentTurnId: room.playerOrder[room.currentTurnIdx] ?? null,
    currentTargetId: room.currentTargetId,
    lastAnswer: room.lastAnswer,
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
function advanceTurn(room: GameRoom): void {
  if (room.phase !== "playing") return;
  if (room.turnTimer) clearTimeout(room.turnTimer);

  room.currentTargetId = null;
  room.lastAnswer = null;

  let next = (room.currentTurnIdx + 1) % room.playerOrder.length;
  for (let i = 0; i < room.playerOrder.length; i++) {
    const p = room.players.get(room.playerOrder[next]);
    if (p && !p.disconnected) break;
    next = (next + 1) % room.playerOrder.length;
  }
  room.currentTurnIdx = next;
  room.turnEndAt = Date.now() + 60_000;
  room.turnTimer = setTimeout(() => advanceTurn(room), 60_000);

  broadcast(room, stateMsg(room));

  const curId = room.playerOrder[room.currentTurnIdx];
  const curP = room.players.get(curId);
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
  room.players.forEach(p => { p.voted = false; });
  broadcast(room, stateMsg(room));
}

function checkVoteDone(room: GameRoom): void {
  const active = Array.from(room.players.values()).filter(p => !p.disconnected);
  if (!active.every(p => p.voted)) return;

  const counts: Record<string, number> = {};
  Object.values(room.votes).forEach(t => {
    if (t !== "skip") counts[t] = (counts[t] ?? 0) + 1;
  });

  let topId = "";
  let topCount = 0;
  Object.entries(counts).forEach(([id, c]) => { if (c > topCount) { topCount = c; topId = id; } });

  const imposter = room.players.get(room.imposterId);
  const winner = topId === room.imposterId ? "players" : "imposter";
  room.phase = "result";

  broadcast(room, {
    type: "imposter:result",
    imposterName: imposter?.name ?? "؟",
    imposterId: room.imposterId,
    word: room.word,
    winner,
    votes: room.votes,
    counts,
  });
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

    const room: GameRoom = {
      code, roomName, category, durationMs,
      phase: "lobby", hostWs: ws,
      players: new Map(), playerOrder: [],
      word: "", imposterId: "",
      currentTurnIdx: 0, currentTargetId: null,
      votes: {}, gameEndAt: 0, turnEndAt: 0, lastAnswer: null,
      gameTimer: null, turnTimer: null, timerInterval: null,
      usedWords: new Set(),
    };
    rooms.set(code, room);
    ws.roomCode = code;
    send(ws, { type: "imposter:created", code, roomName, category, durationMs });
    logger.info({ code, category, durationMins }, "برا السالفة room created");
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
    const player: RoomPlayer = { id: playerId, name, avatar, ws, voted: false, disconnected: false };
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
    if (!room || room.hostWs !== ws) return;
    if (room.players.size < 3) { send(ws, { type: "imposter:error", message: "يلزم ٣ لاعبين على الأقل" }); return; }

    room.word = pickWord(room);
    const ids = Array.from(room.players.keys());
    room.imposterId = ids[Math.floor(Math.random() * ids.length)];
    room.playerOrder = shuffle([...ids]);
    room.currentTurnIdx = 0;
    room.currentTargetId = null;
    room.lastAnswer = null;
    room.phase = "playing";
    room.gameEndAt = Date.now() + room.durationMs;
    room.turnEndAt = Date.now() + 60_000;

    // Send roles privately
    room.players.forEach(p => {
      const isImposter = p.id === room.imposterId;
      send(p.ws, {
        type: "imposter:role",
        role: isImposter ? "imposter" : "player",
        word: isImposter ? null : room.word,
      });
    });

    broadcast(room, stateMsg(room));

    // Notify first player
    const first = room.players.get(room.playerOrder[0]);
    send(first?.ws, { type: "imposter:your_turn" });

    // Timers
    room.gameTimer = setTimeout(() => startVoting(room), room.durationMs);
    room.turnTimer = setTimeout(() => advanceTurn(room), 60_000);
    room.timerInterval = setInterval(() => {
      if (room.phase !== "playing") { clearInterval(room.timerInterval!); room.timerInterval = null; return; }
      broadcast(room, {
        type: "imposter:timer",
        gameRemaining: Math.max(0, room.gameEndAt - Date.now()),
        turnRemaining: Math.max(0, room.turnEndAt - Date.now()),
      });
    }, 1_000);

    logger.info({ code: room.code, word: room.word, category: room.category }, "برا السالفة game started");
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

  // Select target
  if (type === "imposter:select_target") {
    const room = rooms.get(ws.roomCode ?? "");
    if (!room || room.phase !== "playing") return;
    const targetId = String(msg.targetId ?? "");
    const currentId = room.playerOrder[room.currentTurnIdx];
    const current = room.players.get(currentId);
    if (!current || current.ws !== ws) return;
    if (!room.players.has(targetId) || targetId === currentId) return;

    room.currentTargetId = targetId;
    broadcast(room, stateMsg(room));
    const target = room.players.get(targetId);
    send(target?.ws, { type: "imposter:answer_now" });
    return;
  }

  // Answer yes/no
  if (type === "imposter:answer") {
    const room = rooms.get(ws.roomCode ?? "");
    if (!room || room.phase !== "playing" || !room.currentTargetId) return;
    const target = room.players.get(room.currentTargetId);
    if (!target || target.ws !== ws) return;

    const answer = msg.answer === "yes" ? "yes" : "no";
    room.lastAnswer = { targetId: room.currentTargetId, answer };
    broadcast(room, { type: "imposter:answered", targetId: room.currentTargetId, answer });
    advanceTurn(room);
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
    if (!room || room.hostWs !== ws) return;
    startVoting(room);
    return;
  }

  // New round (host)
  if (type === "imposter:new_round") {
    const room = rooms.get(ws.roomCode ?? "");
    if (!room || room.hostWs !== ws) return;
    room.phase = "lobby";
    room.votes = {};
    room.word = "";
    room.imposterId = "";
    room.currentTurnIdx = 0;
    room.currentTargetId = null;
    room.lastAnswer = null;
    room.players.forEach(p => { p.voted = false; });
    broadcast(room, stateMsg(room));
    return;
  }

  // Remove player (host)
  if (type === "imposter:remove_player") {
    const room = rooms.get(ws.roomCode ?? "");
    if (!room || room.hostWs !== ws || room.phase !== "lobby") return;
    const pid = String(msg.playerId ?? "");
    const p = room.players.get(pid);
    if (p) { send(p.ws, { type: "imposter:removed" }); room.players.delete(pid); }
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

  if (room.hostWs === ws) {
    broadcast(room, { type: "imposter:host_left" });
    if (room.gameTimer) clearTimeout(room.gameTimer);
    if (room.turnTimer) clearTimeout(room.turnTimer);
    if (room.timerInterval) clearInterval(room.timerInterval);
    rooms.delete(code);
    logger.info({ code }, "برا السالفة room closed (host left)");
  } else {
    room.players.forEach(p => {
      if (p.ws === ws) { p.disconnected = true; p.ws = null; }
    });
    broadcast(room, stateMsg(room));
  }
}
