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
}

// ─── Word Bank ────────────────────────────────────────────────────────────────
const WORDS = [
  "شاي","قهوة","عصير","حليب","كولا","ماء بارد",
  "برجر","بيتزا","سوشي","مندي","كبسة","شاورما","فلافل",
  "تفاح","موز","برتقال","مانجا","فراولة","بطيخ","رمان",
  "أسد","فيل","نمر","قرد","دلفين","طاووس","زرافة","ببغاء",
  "سيارة","طيارة","قطار","باص","دراجة","سفينة","مروحية",
  "موبايل","لابتوب","كاميرا","تلفزيون","سماعة","تابلت",
  "الكعبة","برج إيفل","أهرام مصر","برج خليفة","ديزني لاند",
  "كرة القدم","كرة السلة","السباحة","التنس","الغولف",
  "ساعة","نظارة","مفتاح","محفظة","خاتم","قلم",
  "معلم","طبيب","شرطي","طباخ","رياضي","مصور","طيار",
  "مطبخ","حديقة","مسجد","مستشفى","ملعب","مطار","شاطئ",
];

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

    const room: GameRoom = {
      code, phase: "lobby", hostWs: ws,
      players: new Map(), playerOrder: [],
      word: "", imposterId: "",
      currentTurnIdx: 0, currentTargetId: null,
      votes: {}, gameEndAt: 0, turnEndAt: 0, lastAnswer: null,
      gameTimer: null, turnTimer: null, timerInterval: null,
    };
    rooms.set(code, room);
    ws.roomCode = code;
    send(ws, { type: "imposter:created", code });
    logger.info({ code }, "Imposter room created");
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

    send(ws, { type: "imposter:joined", playerId, code });
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

    room.word = WORDS[Math.floor(Math.random() * WORDS.length)];
    const ids = Array.from(room.players.keys());
    room.imposterId = ids[Math.floor(Math.random() * ids.length)];
    room.playerOrder = shuffle([...ids]);
    room.currentTurnIdx = 0;
    room.currentTargetId = null;
    room.lastAnswer = null;
    room.phase = "playing";
    room.gameEndAt = Date.now() + 5 * 60_000;
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
    room.gameTimer = setTimeout(() => startVoting(room), 5 * 60_000);
    room.turnTimer = setTimeout(() => advanceTurn(room), 60_000);
    room.timerInterval = setInterval(() => {
      if (room.phase !== "playing") { clearInterval(room.timerInterval!); room.timerInterval = null; return; }
      broadcast(room, {
        type: "imposter:timer",
        gameRemaining: Math.max(0, room.gameEndAt - Date.now()),
        turnRemaining: Math.max(0, room.turnEndAt - Date.now()),
      });
    }, 1_000);

    logger.info({ code: room.code, word: room.word, imposter: room.imposterId }, "Imposter game started");
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
    logger.info({ code }, "Imposter room closed (host left)");
  } else {
    room.players.forEach(p => {
      if (p.ws === ws) { p.disconnected = true; p.ws = null; }
    });
    broadcast(room, stateMsg(room));
  }
}
