import { WebSocket } from "ws";
import { logger } from "./logger";

// ─── WebSocket Extension ──────────────────────────────────────────────────────
export interface UnoWS extends WebSocket {
  unoRoomCode?: string;
  unoPlayerId?: string;
  isAlive?: boolean;
}

// ─── Types ────────────────────────────────────────────────────────────────────
type Color = "red" | "blue" | "green" | "yellow";
type WildColor = Color | "wild";
type Difficulty = "easy" | "medium" | "hard";

export interface UnoCard {
  id: string;
  color: WildColor;
  type: "number" | "skip" | "reverse" | "draw2" | "wild" | "wild4";
  value?: number;
}

interface UnoPlayer {
  id: string;
  ws: UnoWS | null;
  name: string;
  hand: UnoCard[];
  saidUno: boolean;
  isHost: boolean;
  isConnected: boolean;
  score: number;
  isBot: boolean;
  difficulty: Difficulty;
}

interface ChatMsg {
  playerId: string;
  name: string;
  text: string;
  ts: number;
}

interface UnoRoom {
  code: string;
  players: UnoPlayer[];
  phase: "lobby" | "playing" | "gameover";
  currentPlayerIndex: number;
  direction: 1 | -1;
  deck: UnoCard[];
  discardPile: UnoCard[];
  currentColor: Color;
  drawStack: number;
  pendingWild: boolean;
  winner: string | null;
  lastAction: string;
  chat: ChatMsg[];
  unoTimers: Map<string, ReturnType<typeof setTimeout>>;
  botTimers: Map<string, ReturnType<typeof setTimeout>>;
}

const rooms = new Map<string, UnoRoom>();

// ─── Deck ─────────────────────────────────────────────────────────────────────
function createDeck(): UnoCard[] {
  const cards: UnoCard[] = [];
  const colors: Color[] = ["red", "blue", "green", "yellow"];
  let id = 0;
  for (const color of colors) {
    cards.push({ id: `c${id++}`, color, type: "number", value: 0 });
    for (let v = 1; v <= 9; v++) {
      cards.push({ id: `c${id++}`, color, type: "number", value: v });
      cards.push({ id: `c${id++}`, color, type: "number", value: v });
    }
    for (let i = 0; i < 2; i++) {
      cards.push({ id: `c${id++}`, color, type: "skip" });
      cards.push({ id: `c${id++}`, color, type: "reverse" });
      cards.push({ id: `c${id++}`, color, type: "draw2" });
    }
  }
  for (let i = 0; i < 4; i++) {
    cards.push({ id: `c${id++}`, color: "wild", type: "wild" });
    cards.push({ id: `c${id++}`, color: "wild", type: "wild4" });
  }
  return shuffle(cards);
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// ─── Game Helpers ─────────────────────────────────────────────────────────────
function drawFrom(room: UnoRoom, count: number): UnoCard[] {
  const drawn: UnoCard[] = [];
  for (let i = 0; i < count; i++) {
    if (room.deck.length === 0) {
      if (room.discardPile.length <= 1) break;
      const top = room.discardPile.pop()!;
      room.deck = shuffle(room.discardPile);
      room.discardPile = [top];
    }
    const card = room.deck.pop();
    if (card) drawn.push(card);
  }
  return drawn;
}

function topCard(room: UnoRoom): UnoCard | null {
  return room.discardPile[room.discardPile.length - 1] ?? null;
}

function canPlay(card: UnoCard, top: UnoCard, activeColor: Color): boolean {
  if (card.type === "wild" || card.type === "wild4") return true;
  if (card.color === activeColor) return true;
  if (top.type === card.type) return true;
  if (card.type === "number" && top.type === "number" && card.value === top.value) return true;
  return false;
}

function advance(room: UnoRoom, steps = 1): number {
  const n = room.players.length;
  let idx = room.currentPlayerIndex;
  for (let i = 0; i < steps; i++) {
    idx = ((idx + room.direction) % n + n) % n;
  }
  return idx;
}

function peekNext(room: UnoRoom): UnoPlayer | null {
  return room.players[advance(room, 1)] ?? null;
}

// ─── Broadcast ────────────────────────────────────────────────────────────────
function broadcast(room: UnoRoom) {
  room.players.forEach((player, myIdx) => {
    if (!player.ws || player.ws.readyState !== WebSocket.OPEN) return;
    const isCurrentPlayer = myIdx === room.currentPlayerIndex;
    const top = topCard(room);

    const state = {
      type: "uno:state",
      roomCode: room.code,
      phase: room.phase,
      players: room.players.map((p, i) => ({
        id: p.id,
        name: p.name,
        cardCount: p.hand.length,
        saidUno: p.saidUno,
        isHost: p.isHost,
        isConnected: p.isConnected,
        isCurrentPlayer: i === room.currentPlayerIndex,
        score: p.score,
        isBot: p.isBot,
        difficulty: p.difficulty,
      })),
      myHand: player.hand,
      myPlayerIndex: myIdx,
      myId: player.id,
      topCard: top,
      currentColor: room.currentColor,
      currentPlayerIndex: room.currentPlayerIndex,
      direction: room.direction,
      deckCount: room.deck.length,
      drawStack: room.drawStack,
      pendingWild: room.pendingWild && isCurrentPlayer,
      winner: room.winner,
      winnerName: room.winner ? room.players.find(p => p.id === room.winner)?.name ?? null : null,
      lastAction: room.lastAction,
      chat: room.chat.slice(-60),
    };
    player.ws.send(JSON.stringify(state));
  });
}

// ─── UNO Window ──────────────────────────────────────────────────────────────
function scheduleUnoPenalty(room: UnoRoom, playerId: string) {
  const player = room.players.find(p => p.id === playerId);
  if (!player || player.hand.length !== 1 || player.saidUno || player.isBot) return;

  const timer = setTimeout(() => {
    room.unoTimers.delete(playerId);
    const p = room.players.find(x => x.id === playerId);
    if (!p || p.hand.length !== 1 || p.saidUno) return;
    const drawn = drawFrom(room, 2);
    p.hand.push(...drawn);
    room.lastAction = `${p.name} نسي يقول UNO! سحب ورقتين 😅`;
    broadcast(room);
  }, 4000);

  if (room.unoTimers.has(playerId)) clearTimeout(room.unoTimers.get(playerId));
  room.unoTimers.set(playerId, timer);
}

// ─── Bot AI ───────────────────────────────────────────────────────────────────
function pickBotColor(bot: UnoPlayer): Color {
  const colorCount: Record<Color, number> = { red: 0, blue: 0, green: 0, yellow: 0 };
  bot.hand.forEach(c => { if (c.color !== "wild") colorCount[c.color as Color]++; });
  const sorted = (Object.entries(colorCount) as [Color, number][]).sort((a, b) => b[1] - a[1]);
  return sorted[0]?.[0] ?? "red";
}

function botAI(room: UnoRoom, bot: UnoPlayer): void {
  const top = topCard(room);
  if (!top) return;

  // ── Handle pending wild (color choice) ──
  if (room.pendingWild) {
    const chosenColor = pickBotColor(bot);
    room.currentColor = chosenColor;
    room.pendingWild = false;

    if (room.drawStack > 0) {
      room.currentPlayerIndex = advance(room, 1);
      const nextP = room.players[room.currentPlayerIndex];
      if (nextP) {
        const drawn = drawFrom(room, room.drawStack);
        nextP.hand.push(...drawn);
        room.lastAction = `${bot.name} اختار ${colorLabel(chosenColor)} - ${nextP.name} سحب ${room.drawStack} أوراق! 💀`;
        room.drawStack = 0;
        room.currentPlayerIndex = advance(room, 1);
      }
    } else {
      room.currentPlayerIndex = advance(room, 1);
      room.lastAction = `${bot.name} اختار ${colorLabel(chosenColor)} 🎨`;
    }
    return;
  }

  // ── Find playable cards ──
  let playable = bot.hand.filter(c => canPlay(c, top, room.currentColor));
  if (room.drawStack > 0) {
    playable = playable.filter(c => (c.type === "draw2" && top.type === "draw2") || c.type === "wild4");
  }

  // ── No playable card → draw ──
  if (playable.length === 0) {
    if (room.drawStack > 0) {
      const drawn = drawFrom(room, room.drawStack);
      bot.hand.push(...drawn);
      room.lastAction = `${bot.name} سحب ${drawn.length} أوراق 💀`;
      room.drawStack = 0;
      room.currentPlayerIndex = advance(room, 1);
    } else {
      const drawn = drawFrom(room, 1);
      bot.hand.push(...drawn);
      const drawnCard = drawn[0];
      if (drawnCard && canPlay(drawnCard, top, room.currentColor)) {
        // Play the drawn card immediately
        bot.hand.splice(bot.hand.length - 1, 1);
        bot.saidUno = false;
        room.discardPile.push(drawnCard);
        if (drawnCard.color !== "wild") room.currentColor = drawnCard.color as Color;
        if (bot.hand.length === 0) {
          room.winner = bot.id;
          room.phase = "gameover";
          bot.score += 1;
          room.lastAction = `🎉 ${bot.name} فاز! UNO! 🎉`;
          return;
        }
        if (bot.hand.length === 1) { bot.saidUno = true; }
        applyCard(room, drawnCard, bot);
      } else {
        room.lastAction = `${bot.name} سحب ورقة وانتهى دوره`;
        room.currentPlayerIndex = advance(room, 1);
      }
    }
    return;
  }

  // ── Choose card by difficulty ──
  let chosen: UnoCard;

  if (bot.difficulty === "easy") {
    chosen = playable[Math.floor(Math.random() * playable.length)];

  } else if (bot.difficulty === "medium") {
    const actions = playable.filter(c => c.type !== "number");
    const pool = actions.length > 0 ? actions : playable;
    chosen = pool[Math.floor(Math.random() * pool.length)];

  } else {
    // Hard: prefer same-color action > same-color number > wild > wild4
    const sameColor = playable.filter(c => c.color === room.currentColor);
    const sameColorActions = sameColor.filter(c => c.type !== "number");
    const nonWild4 = playable.filter(c => c.type !== "wild4");
    if (sameColorActions.length > 0) {
      chosen = sameColorActions[Math.floor(Math.random() * sameColorActions.length)];
    } else if (sameColor.length > 0) {
      chosen = sameColor[Math.floor(Math.random() * sameColor.length)];
    } else if (nonWild4.length > 0) {
      chosen = nonWild4[Math.floor(Math.random() * nonWild4.length)];
    } else {
      chosen = playable[0];
    }
  }

  // ── Play the card ──
  const cardIdx = bot.hand.findIndex(c => c.id === chosen.id);
  if (cardIdx < 0) return;

  bot.hand.splice(cardIdx, 1);
  bot.saidUno = false;
  room.discardPile.push(chosen);
  if (chosen.color !== "wild") room.currentColor = chosen.color as Color;

  // Win check
  if (bot.hand.length === 0) {
    room.winner = bot.id;
    room.phase = "gameover";
    bot.score += 1;
    room.lastAction = `🎉 ${bot.name} فاز! UNO! 🎉`;
    return;
  }

  // Bots always call UNO
  if (bot.hand.length === 1) {
    bot.saidUno = true;
    room.lastAction = `${bot.name} قال UNO! 🎉`;
  }

  applyCard(room, chosen, bot);
}

// ─── Bot Turn Scheduler ───────────────────────────────────────────────────────
function scheduleBotTurn(room: UnoRoom) {
  if (room.phase !== "playing") return;

  const currentPlayer = room.players[room.currentPlayerIndex];
  if (!currentPlayer?.isBot) return;

  // Clear existing timer for this bot if any
  const existingTimer = room.botTimers.get(currentPlayer.id);
  if (existingTimer) clearTimeout(existingTimer);

  const delay: Record<Difficulty, number> = { easy: 1600, medium: 1200, hard: 800 };
  const ms = delay[currentPlayer.difficulty] + Math.random() * 400;

  const timer = setTimeout(() => {
    room.botTimers.delete(currentPlayer.id);
    if (!rooms.has(room.code)) return;
    if (room.phase !== "playing") return;
    if (room.players[room.currentPlayerIndex]?.id !== currentPlayer.id) return;

    botAI(room, currentPlayer);

    if (room.phase === "gameover") {
      broadcast(room);
      return;
    }

    broadcast(room);
    scheduleBotTurn(room); // chain to next bot if applicable
  }, ms);

  room.botTimers.set(currentPlayer.id, timer);
}

// ─── Start Game ───────────────────────────────────────────────────────────────
function startGame(room: UnoRoom) {
  room.deck = createDeck();
  room.discardPile = [];
  room.direction = 1;
  room.drawStack = 0;
  room.pendingWild = false;
  room.winner = null;
  room.phase = "playing";
  room.currentPlayerIndex = 0;

  room.players.forEach(p => {
    p.hand = drawFrom(room, 7);
    p.saidUno = false;
  });

  // First card must be a number card
  let first = drawFrom(room, 1)[0];
  let attempts = 0;
  while (first && (first.type === "wild" || first.type === "wild4") && attempts < 30) {
    room.deck.unshift(first);
    first = drawFrom(room, 1)[0];
    attempts++;
  }
  if (!first) first = { id: "fallback", color: "red", type: "number", value: 5 };

  room.discardPile.push(first);
  room.currentColor = first.color !== "wild" ? first.color as Color : "red";
  room.lastAction = "🎮 اللعبة بدأت! حظ موفق للجميع";

  if (first.type === "skip") {
    room.currentPlayerIndex = advance(room, 2);
    room.lastAction = "الكرت الأول Skip! تم تخطي اللاعب الأول";
  } else if (first.type === "reverse") {
    room.direction = -1;
    room.currentPlayerIndex = advance(room, 1);
    room.lastAction = "الكرت الأول Reverse! الاتجاه انعكس";
  } else if (first.type === "draw2") {
    const first_player = room.players[0];
    const drawn = drawFrom(room, 2);
    first_player.hand.push(...drawn);
    room.currentPlayerIndex = advance(room, 1);
    room.lastAction = "الكرت الأول +2! اللاعب الأول سحب ورقتين";
  }
}

// ─── Apply card effects after playing ─────────────────────────────────────────
function applyCard(room: UnoRoom, card: UnoCard, player: UnoPlayer) {
  switch (card.type) {
    case "skip": {
      const skipped = peekNext(room);
      room.currentPlayerIndex = advance(room, 2);
      room.lastAction = `${player.name} لعب Skip على ${skipped?.name ?? ""}!`;
      break;
    }
    case "reverse": {
      room.direction *= -1;
      if (room.players.length === 2) {
        room.currentPlayerIndex = advance(room, 2);
        room.lastAction = `${player.name} لعب Reverse (يعمل Skip مع لاعبين)!`;
      } else {
        room.currentPlayerIndex = advance(room, 1);
        room.lastAction = `${player.name} عكس الاتجاه! 🔄`;
      }
      break;
    }
    case "draw2": {
      room.drawStack += 2;
      room.currentPlayerIndex = advance(room, 1);
      room.lastAction = `${player.name} لعب +2! التراكم: ${room.drawStack}`;
      break;
    }
    case "wild": {
      room.pendingWild = true;
      room.lastAction = `${player.name} لعب Wild - يختار اللون...`;
      break;
    }
    case "wild4": {
      room.drawStack += 4;
      room.pendingWild = true;
      room.lastAction = `${player.name} لعب Wild +4! التراكم: ${room.drawStack}`;
      break;
    }
    default: {
      room.currentPlayerIndex = advance(room, 1);
      room.lastAction = `${player.name} لعب ${cardLabel(card)}`;
    }
  }
}

// ─── Message Handler ──────────────────────────────────────────────────────────
export function handleUnoMessage(ws: UnoWS, msg: Record<string, unknown>) {
  const type = msg.type as string;

  // ── Create Room ──
  if (type === "uno:create") {
    const name = ((msg.name as string) ?? "لاعب").trim().slice(0, 20) || "لاعب";
    let code = generateCode();
    let attempts = 0;
    while (rooms.has(code) && attempts++ < 100) code = generateCode();

    const playerId = Math.random().toString(36).slice(2, 10);
    ws.unoRoomCode = code;
    ws.unoPlayerId = playerId;

    const room: UnoRoom = {
      code,
      players: [{
        id: playerId, ws, name, hand: [], saidUno: false,
        isHost: true, isConnected: true, score: 0,
        isBot: false, difficulty: "easy",
      }],
      phase: "lobby",
      currentPlayerIndex: 0,
      direction: 1,
      deck: [],
      discardPile: [],
      currentColor: "red",
      drawStack: 0,
      pendingWild: false,
      winner: null,
      lastAction: "",
      chat: [],
      unoTimers: new Map(),
      botTimers: new Map(),
    };

    rooms.set(code, room);
    ws.send(JSON.stringify({ type: "uno:created", code, playerId }));
    broadcast(room);
    logger.info({ code, name }, "UNO room created");
    return;
  }

  // ── Join Room ──
  if (type === "uno:join") {
    const name = ((msg.name as string) ?? "لاعب").trim().slice(0, 20) || "لاعب";
    const code = ((msg.code as string) ?? "").toUpperCase().trim();
    const room = rooms.get(code);

    if (!room) { ws.send(JSON.stringify({ type: "uno:error", message: "كود الغرفة غير موجود" })); return; }
    if (room.phase !== "lobby") { ws.send(JSON.stringify({ type: "uno:error", message: "اللعبة بدأت بالفعل" })); return; }
    if (room.players.length >= 10) { ws.send(JSON.stringify({ type: "uno:error", message: "الغرفة ممتلئة (الحد الأقصى 10 لاعبين)" })); return; }

    const playerId = Math.random().toString(36).slice(2, 10);
    ws.unoRoomCode = code;
    ws.unoPlayerId = playerId;

    room.players.push({
      id: playerId, ws, name, hand: [], saidUno: false,
      isHost: false, isConnected: true, score: 0,
      isBot: false, difficulty: "easy",
    });
    ws.send(JSON.stringify({ type: "uno:joined", code, playerId }));
    broadcast(room);
    return;
  }

  // All other messages require room context
  const room = ws.unoRoomCode ? rooms.get(ws.unoRoomCode) : null;
  if (!room) return;
  const player = room.players.find(p => p.id === ws.unoPlayerId);
  if (!player) return;

  // ── Add Bot ──
  if (type === "uno:add_bot") {
    if (!player.isHost || room.phase !== "lobby") return;
    if (room.players.length >= 10) {
      ws.send(JSON.stringify({ type: "uno:error", message: "الغرفة ممتلئة (الحد الأقصى 10 لاعبين)" }));
      return;
    }

    const difficulty = (msg.difficulty as Difficulty) ?? "easy";
    const botCount = room.players.filter(p => p.isBot).length + 1;
    const botId = `bot_${Math.random().toString(36).slice(2, 8)}`;
    const diffLabel: Record<Difficulty, string> = { easy: "سهل", medium: "متوسط", hard: "صعب" };

    room.players.push({
      id: botId,
      ws: null,
      name: `Bot ${botCount}`,
      hand: [],
      saidUno: false,
      isHost: false,
      isConnected: true,
      score: 0,
      isBot: true,
      difficulty,
    });

    room.lastAction = `تم إضافة بوت (${diffLabel[difficulty]}) 🤖`;
    broadcast(room);
    return;
  }

  // ── Remove Bot ──
  if (type === "uno:remove_bot") {
    if (!player.isHost || room.phase !== "lobby") return;
    const botId = msg.botId as string;
    const bot = room.players.find(p => p.id === botId && p.isBot);
    if (!bot) return;

    room.players = room.players.filter(p => p.id !== botId);
    // Re-number remaining bots
    let botNum = 1;
    room.players.forEach(p => { if (p.isBot) p.name = `Bot ${botNum++}`; });

    room.lastAction = `تم حذف ${bot.name} 🗑`;
    broadcast(room);
    return;
  }

  // ── Start Game ──
  if (type === "uno:start") {
    if (!player.isHost || room.phase !== "lobby" || room.players.length < 2) return;
    startGame(room);
    broadcast(room);
    scheduleBotTurn(room);
    return;
  }

  // ── Chat ──
  if (type === "uno:chat") {
    const text = ((msg.text as string) ?? "").trim().slice(0, 200);
    if (!text) return;
    room.chat.push({ playerId: player.id, name: player.name, text, ts: Date.now() });
    broadcast(room);
    return;
  }

  // ── Say UNO ──
  if (type === "uno:say_uno") {
    if (player.hand.length <= 2) {
      player.saidUno = true;
      if (room.unoTimers.has(player.id)) {
        clearTimeout(room.unoTimers.get(player.id));
        room.unoTimers.delete(player.id);
      }
      room.lastAction = `${player.name} قال UNO! 🎉`;
      broadcast(room);
    }
    return;
  }

  // ── Play Again ──
  if (type === "uno:play_again") {
    if (!player.isHost || room.phase !== "gameover") return;
    room.chat = [];
    startGame(room);
    broadcast(room);
    scheduleBotTurn(room);
    return;
  }

  if (room.phase !== "playing") return;

  const currentPlayer = room.players[room.currentPlayerIndex];
  const top = topCard(room);

  // ── Choose Color (after Wild) ──
  if (type === "uno:choose_color") {
    if (currentPlayer?.id !== player.id || !room.pendingWild) return;
    const color = msg.color as Color;
    if (!["red", "blue", "green", "yellow"].includes(color)) return;

    room.currentColor = color;
    room.pendingWild = false;

    if (room.drawStack > 0) {
      room.currentPlayerIndex = advance(room, 1);
      const nextP = room.players[room.currentPlayerIndex];
      if (nextP) {
        const drawn = drawFrom(room, room.drawStack);
        nextP.hand.push(...drawn);
        room.lastAction = `${player.name} اختار ${colorLabel(color)} - ${nextP.name} سحب ${room.drawStack} أوراق! 💀`;
        room.drawStack = 0;
        room.currentPlayerIndex = advance(room, 1);
      }
    } else {
      room.currentPlayerIndex = advance(room, 1);
      room.lastAction = `${player.name} اختار ${colorLabel(color)} 🎨`;
    }

    scheduleUnoPenalty(room, player.id);
    broadcast(room);
    scheduleBotTurn(room);
    return;
  }

  // ── Play Card ──
  if (type === "uno:play_card") {
    if (currentPlayer?.id !== player.id || room.pendingWild || !top) return;

    const cardId = msg.cardId as string;
    const cardIdx = player.hand.findIndex(c => c.id === cardId);
    if (cardIdx < 0) return;
    const card = player.hand[cardIdx];

    if (!canPlay(card, top, room.currentColor)) {
      ws.send(JSON.stringify({ type: "uno:error", message: "هذه الورقة لا تطابق اللون أو الرقم أو النوع" }));
      return;
    }

    if (room.drawStack > 0) {
      const validStack = (card.type === "draw2" && top.type === "draw2") || card.type === "wild4";
      if (!validStack) {
        ws.send(JSON.stringify({ type: "uno:error", message: "يجب مواجهة بـ +2/Wild+4 أو السحب" }));
        return;
      }
    }

    player.hand.splice(cardIdx, 1);
    player.saidUno = false;
    room.discardPile.push(card);
    if (card.color !== "wild") room.currentColor = card.color as Color;

    if (player.hand.length === 0) {
      room.winner = player.id;
      room.phase = "gameover";
      player.score += 1;
      room.lastAction = `🎉 ${player.name} فاز! UNO! 🎉`;
      broadcast(room);
      return;
    }

    applyCard(room, card, player);
    scheduleUnoPenalty(room, player.id);
    broadcast(room);
    scheduleBotTurn(room);
    return;
  }

  // ── Draw Card(s) ──
  if (type === "uno:draw") {
    if (currentPlayer?.id !== player.id || room.pendingWild) return;

    if (room.drawStack > 0) {
      const drawn = drawFrom(room, room.drawStack);
      player.hand.push(...drawn);
      room.lastAction = `${player.name} سحب ${drawn.length} أوراق 💀`;
      room.drawStack = 0;
      room.currentPlayerIndex = advance(room, 1);
    } else {
      const drawn = drawFrom(room, 1);
      player.hand.push(...drawn);
      const drawnCard = drawn[0];
      if (drawnCard && top && canPlay(drawnCard, top, room.currentColor)) {
        room.lastAction = `${player.name} سحب ورقة (يمكنك لعبها)`;
      } else {
        room.lastAction = `${player.name} سحب ورقة وانتهى دوره`;
        room.currentPlayerIndex = advance(room, 1);
      }
    }

    broadcast(room);
    scheduleBotTurn(room);
    return;
  }
}

// ─── Disconnect Handler ───────────────────────────────────────────────────────
export function handleUnoDisconnect(ws: UnoWS) {
  const code = ws.unoRoomCode;
  const playerId = ws.unoPlayerId;
  if (!code || !playerId) return;

  const room = rooms.get(code);
  if (!room) return;

  const player = room.players.find(p => p.id === playerId);
  if (player) player.isConnected = false;

  if (room.phase === "lobby") {
    room.players = room.players.filter(p => p.id !== playerId);
    if (room.players.length === 0) { rooms.delete(code); return; }
    if (player?.isHost) {
      const nextHuman = room.players.find(p => !p.isBot);
      if (nextHuman) nextHuman.isHost = true;
      else if (room.players.length > 0) room.players[0].isHost = true;
    }
  }

  if (room.phase === "playing") {
    if (room.players[room.currentPlayerIndex]?.id === playerId) {
      room.currentPlayerIndex = advance(room, 1);
      room.lastAction = `${player?.name} انقطع اتصاله، الدور انتقل`;
      scheduleBotTurn(room);
    }
    const connected = room.players.filter(p => p.isConnected && p.id !== playerId);
    if (connected.length < 1) {
      setTimeout(() => {
        if (rooms.has(code) && room.players.every(p => !p.isConnected && !p.isBot)) rooms.delete(code);
      }, 120_000);
    }
  }

  broadcast(room);
}

// ─── Labels ───────────────────────────────────────────────────────────────────
function colorLabel(c: Color): string {
  return { red: "🔴 أحمر", blue: "🔵 أزرق", green: "🟢 أخضر", yellow: "🟡 أصفر" }[c] ?? c;
}

function cardLabel(card: UnoCard): string {
  if (card.type === "number") return `${card.value}`;
  if (card.type === "skip") return "Skip ⏭";
  if (card.type === "reverse") return "Reverse 🔄";
  if (card.type === "draw2") return "+2 💀";
  if (card.type === "wild") return "Wild 🌈";
  if (card.type === "wild4") return "Wild +4 💀";
  return "ورقة";
}
