import { WebSocket } from "ws";
import { logger } from "./logger";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface BarWS extends WebSocket {
  barRoomCode?: string;
  barPlayerId?: string;
  isAlive?: boolean;
}

type CardValue = "Ace" | "King" | "Queen" | "Jack" | "Joker";
type CardType  = "Ace" | "King" | "Queen" | "Jack";
type PlayState = "waiting_play" | "waiting_challenge";

interface BarCard {
  id:    string;
  value: CardValue;
}

interface BarPlayer {
  id:           string;
  name:         string;
  avatar:       string;
  character:    number;          // 0-3
  hp:           number;         // starts at 6
  hand:         BarCard[];
  ws:           BarWS | null;
  role:         "host" | "player";
  eliminated:   boolean;
  charSelected: boolean;
}

interface BarRoom {
  code:            string;
  hostId:          string;
  phase:           "lobby" | "char_select" | "playing" | "end";
  players:         Map<string, BarPlayer>;
  playerOrder:     string[];     // active player ids in seat order
  currentTurnIdx:  number;      // index into active players
  playState:       PlayState;
  currentCardType: CardType;
  tableCards:      BarCard[];   // face-down played cards
  tableClaim:      { playerId: string; count: number } | null;
  roundNum:        number;
  winnerId:        string | null;
  charSelectTimer: ReturnType<typeof setTimeout> | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const CARD_ROTATION: CardType[] = ["Ace", "King", "Queen", "Jack"];
const MAX_HP = 6;
const MAX_PLAYERS = 4;
const MIN_PLAYERS = 2;
const HAND_SIZE = 5;

// ─── Store ────────────────────────────────────────────────────────────────────
export const barRooms = new Map<string, BarRoom>();

// ─── Helpers ──────────────────────────────────────────────────────────────────
function genCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function send(ws: BarWS | null | undefined, msg: object): void {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function broadcastRoom(room: BarRoom, msg: object, skip?: BarWS): void {
  const payload = JSON.stringify(msg);
  room.players.forEach(p => {
    if (p.ws && p.ws !== skip && p.ws.readyState === WebSocket.OPEN)
      p.ws.send(payload);
  });
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildDeck(): BarCard[] {
  const counts: Record<CardValue, number> = { Ace: 6, King: 6, Queen: 6, Jack: 6, Joker: 2 };
  const deck: BarCard[] = [];
  let id = 0;
  for (const [val, cnt] of Object.entries(counts) as [CardValue, number][]) {
    for (let i = 0; i < cnt; i++) deck.push({ id: `${val}-${id++}`, value: val });
  }
  return shuffle(deck);
}

function dealHands(room: BarRoom): void {
  const deck = buildDeck();
  const active = activePlayers(room);
  active.forEach(p => {
    p.hand = deck.splice(0, HAND_SIZE);
  });
}

function activePlayers(room: BarRoom): BarPlayer[] {
  return room.playerOrder
    .map(id => room.players.get(id))
    .filter((p): p is BarPlayer => !!p && !p.eliminated);
}

function publicPlayer(p: BarPlayer) {
  return {
    id:          p.id,
    name:        p.name,
    avatar:      p.avatar,
    character:   p.character,
    hp:          p.hp,
    cardCount:   p.hand.length,
    role:        p.role,
    eliminated:  p.eliminated,
    charSelected: p.charSelected,
    connected:   !!(p.ws && p.ws.readyState === WebSocket.OPEN),
  };
}

function publicState(room: BarRoom) {
  const active = activePlayers(room);
  const currentId = active[room.currentTurnIdx]?.id ?? null;
  const nextIdx = active.length > 0 ? (room.currentTurnIdx + 1) % active.length : 0;
  const nextId  = active.length > 1 ? active[nextIdx]?.id : null;
  return {
    type:            "bar:state",
    code:            room.code,
    phase:           room.phase,
    hostId:          room.hostId,
    players:         Array.from(room.players.values()).map(publicPlayer),
    playerOrder:     room.playerOrder,
    currentTurnId:   currentId,
    nextPlayerId:    nextId,
    playState:       room.playState,
    currentCardType: room.currentCardType,
    tableClaim:      room.tableClaim,
    tableCardCount:  room.tableCards.length,
    roundNum:        room.roundNum,
    winnerId:        room.winnerId,
  };
}

function sendHand(room: BarRoom, playerId: string): void {
  const p = room.players.get(playerId);
  if (!p) return;
  send(p.ws, { type: "bar:hand", hand: p.hand });
}

function broadcastState(room: BarRoom): void {
  broadcastRoom(room, publicState(room));
}

function checkWin(room: BarRoom): boolean {
  const alive = activePlayers(room);
  if (alive.length <= 1) {
    room.phase = "end";
    room.winnerId = alive[0]?.id ?? null;
    broadcastState(room);
    broadcastRoom(room, { type: "bar:game_over", winnerId: room.winnerId, winnerName: room.players.get(room.winnerId ?? "")?.name ?? "?" });
    return true;
  }
  return false;
}

function nextTurn(room: BarRoom): void {
  room.tableCards = [];
  room.tableClaim = null;
  const active = activePlayers(room);
  if (active.length === 0) return;
  room.currentTurnIdx = room.currentTurnIdx % active.length;
  room.playState = "waiting_play";
  broadcastState(room);
  // Notify current player it's their turn
  const cur = active[room.currentTurnIdx];
  if (cur) send(cur.ws, { type: "bar:your_turn", cardType: room.currentCardType });
}

// ─── Main Handler ─────────────────────────────────────────────────────────────
export function handleBarMessage(ws: BarWS, msg: Record<string, unknown>): void {
  const type = msg.type as string;

  // ── Join / Create room ──
  if (type === "bar:join") {
    const name   = String(msg.name ?? "لاعب").slice(0, 20);
    const avatar = String(msg.avatar ?? "");
    let   code   = String(msg.code ?? "").trim().toUpperCase();

    // Try to find existing room
    let room = code ? barRooms.get(code) : undefined;

    if (!room) {
      // Create new room
      code = genCode();
      while (barRooms.has(code)) code = genCode();
      const playerId = `p-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const hostPlayer: BarPlayer = {
        id: playerId, name, avatar, character: 0, hp: MAX_HP,
        hand: [], ws, role: "host", eliminated: false, charSelected: false,
      };
      room = {
        code, hostId: playerId, phase: "lobby",
        players: new Map([[playerId, hostPlayer]]),
        playerOrder: [playerId],
        currentTurnIdx: 0, playState: "waiting_play",
        currentCardType: "Ace", tableCards: [], tableClaim: null,
        roundNum: 1, winnerId: null, charSelectTimer: null,
      };
      barRooms.set(code, room);
      ws.barRoomCode  = code;
      ws.barPlayerId  = playerId;
      send(ws, { type: "bar:joined", code, playerId, role: "host" });
      broadcastState(room);
      return;
    }

    // Join existing room
    if (room.phase !== "lobby") { send(ws, { type: "bar:error", msg: "اللعبة بدأت بالفعل" }); return; }
    if (room.players.size >= MAX_PLAYERS) { send(ws, { type: "bar:error", msg: "الغرفة ممتلئة (4 لاعبين)" }); return; }

    // Check reconnect
    const existing = Array.from(room.players.values()).find(p => p.name === name);
    if (existing && existing.eliminated === false) {
      existing.ws     = ws;
      ws.barRoomCode  = code;
      ws.barPlayerId  = existing.id;
      send(ws, { type: "bar:joined", code, playerId: existing.id, role: existing.role });
      broadcastState(room);
      sendHand(room, existing.id);
      return;
    }

    const playerId = `p-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const player: BarPlayer = {
      id: playerId, name, avatar, character: -1, hp: MAX_HP,
      hand: [], ws, role: "player", eliminated: false, charSelected: false,
    };
    room.players.set(playerId, player);
    room.playerOrder.push(playerId);
    ws.barRoomCode = code;
    ws.barPlayerId = playerId;
    send(ws, { type: "bar:joined", code, playerId, role: "player" });
    broadcastState(room);
    return;
  }

  // All other messages need room + player
  const code = ws.barRoomCode;
  const pid  = ws.barPlayerId;
  if (!code || !pid) { send(ws, { type: "bar:error", msg: "لم تنضم إلى غرفة" }); return; }
  const room = barRooms.get(code);
  if (!room) { send(ws, { type: "bar:error", msg: "الغرفة غير موجودة" }); return; }
  const player = room.players.get(pid);
  if (!player) { send(ws, { type: "bar:error", msg: "لاعب غير موجود" }); return; }

  // ── Character select ──
  if (type === "bar:char_select") {
    const charIdx = Number(msg.charIdx ?? -1);
    if (charIdx < 0 || charIdx > 3) return;
    // Check if character already taken
    const taken = Array.from(room.players.values()).some(p => p.id !== pid && p.character === charIdx);
    if (taken) { send(ws, { type: "bar:error", msg: "هذه الشخصية محجوزة" }); return; }
    player.character = charIdx;
    player.charSelected = true;
    broadcastState(room);
    // If all selected, move to playing
    const allSelected = Array.from(room.players.values()).every(p => p.charSelected);
    if (allSelected && room.phase === "char_select") {
      if (room.charSelectTimer) clearTimeout(room.charSelectTimer);
      startGame(room);
    }
    return;
  }

  // ── Host starts game ──
  if (type === "bar:start") {
    if (player.role !== "host") { send(ws, { type: "bar:error", msg: "أنت لست المضيف" }); return; }
    if (room.phase !== "lobby") { send(ws, { type: "bar:error", msg: "اللعبة ليست في طور الانتظار" }); return; }
    if (room.players.size < MIN_PLAYERS) { send(ws, { type: "bar:error", msg: `يلزم ${MIN_PLAYERS} لاعبين على الأقل` }); return; }
    room.phase = "char_select";
    broadcastState(room);
    // Auto-assign characters after 20s if not selected
    room.charSelectTimer = setTimeout(() => {
      if (room.phase !== "char_select") return;
      let nextChar = 0;
      room.players.forEach(p => {
        if (!p.charSelected) {
          while (Array.from(room.players.values()).some(op => op.id !== p.id && op.character === nextChar)) nextChar++;
          p.character = nextChar++;
          p.charSelected = true;
        }
      });
      startGame(room);
    }, 20_000);
    return;
  }

  // ── Play cards ──
  if (type === "bar:play") {
    if (room.phase !== "playing") return;
    if (room.playState !== "waiting_play") { send(ws, { type: "bar:error", msg: "ليس دورك للعب" }); return; }
    const active = activePlayers(room);
    const curPlayer = active[room.currentTurnIdx];
    if (!curPlayer || curPlayer.id !== pid) { send(ws, { type: "bar:error", msg: "ليس دورك" }); return; }

    const cardIds = (msg.cardIds as string[] ?? []).slice(0, 3);
    if (cardIds.length < 1) { send(ws, { type: "bar:error", msg: "اختر ورقة واحدة على الأقل" }); return; }

    // Verify player has those cards
    const toPlay = cardIds.map(id => player.hand.find(c => c.id === id)).filter(Boolean) as BarCard[];
    if (toPlay.length !== cardIds.length) { send(ws, { type: "bar:error", msg: "أوراق غير صحيحة" }); return; }

    // Remove from hand
    player.hand = player.hand.filter(c => !cardIds.includes(c.id));
    room.tableCards = toPlay;
    room.tableClaim = { playerId: pid, count: toPlay.length };
    room.playState  = "waiting_challenge";
    sendHand(room, pid);
    broadcastState(room);

    // Tell next player it's their challenge turn
    const nextIdx   = (room.currentTurnIdx + 1) % active.length;
    const nextPlayer = active[nextIdx];
    if (nextPlayer) {
      send(nextPlayer.ws, {
        type: "bar:challenge_turn",
        claim: { playerId: pid, playerName: player.name, count: toPlay.length, cardType: room.currentCardType },
      });
    }
    return;
  }

  // ── Pass challenge ──
  if (type === "bar:pass_challenge") {
    if (room.phase !== "playing" || room.playState !== "waiting_challenge") return;
    const active = activePlayers(room);
    const nextIdx = (room.currentTurnIdx + 1) % active.length;
    if (active[nextIdx]?.id !== pid) { send(ws, { type: "bar:error", msg: "ليس دورك للتحدي" }); return; }
    // Move turn to next player (the challenger becomes the player)
    room.currentTurnIdx = nextIdx;
    room.tableCards = [];
    room.tableClaim = null;
    room.playState  = "waiting_play";
    broadcastState(room);
    const cur = active[nextIdx];
    if (cur) send(cur.ws, { type: "bar:your_turn", cardType: room.currentCardType });
    return;
  }

  // ── Call bluff ──
  if (type === "bar:call_bluff") {
    if (room.phase !== "playing" || room.playState !== "waiting_challenge") return;
    const active = activePlayers(room);
    const nextIdx = (room.currentTurnIdx + 1) % active.length;
    if (active[nextIdx]?.id !== pid) { send(ws, { type: "bar:error", msg: "ليس دورك للتحدي" }); return; }

    const playerId = room.tableClaim?.playerId;
    const accused  = playerId ? room.players.get(playerId) : null;
    const challenger = player;
    const played   = room.tableCards;

    // Determine if bluff: any card that is NOT currentCardType AND NOT Joker
    const isBluff = played.some(c => c.value !== room.currentCardType && c.value !== "Joker");

    broadcastRoom(room, {
      type: "bar:bluff_reveal",
      cards:       played,
      claim:       { count: played.length, cardType: room.currentCardType },
      accusedId:   accused?.id,
      accusedName: accused?.name,
      challengerId:   challenger.id,
      challengerName: challenger.name,
      isBluff,
    });

    if (isBluff) {
      // Accused was lying → accused loses HP
      if (accused) {
        accused.hp = Math.max(0, accused.hp - 1);
        if (accused.hp === 0) {
          accused.eliminated = true;
          room.playerOrder = room.playerOrder.filter(id => id !== accused.id);
          broadcastRoom(room, { type: "bar:eliminated", playerId: accused.id, playerName: accused.name });
        }
      }
    } else {
      // Accused was honest → challenger loses HP
      challenger.hp = Math.max(0, challenger.hp - 1);
      if (challenger.hp === 0) {
        challenger.eliminated = true;
        room.playerOrder = room.playerOrder.filter(id => id !== challenger.id);
        broadcastRoom(room, { type: "bar:eliminated", playerId: challenger.id, playerName: challenger.name });
      }
    }

    if (checkWin(room)) return;

    // New round: redeal, rotate card type
    room.roundNum++;
    room.currentCardType = CARD_ROTATION[room.roundNum % CARD_ROTATION.length];
    dealHands(room);
    // Set next turn to accused (or challenger if accused eliminated), then normalize
    const aliveAfter = activePlayers(room);
    let newIdx = 0;
    if (!isBluff && accused) {
      // Challenger loses → next player after challenged should be accused
      newIdx = aliveAfter.findIndex(p => p.id === accused.id);
      if (newIdx < 0) newIdx = 0;
    } else if (accused) {
      // Accused loses → next player after them
      newIdx = aliveAfter.findIndex(p => p.id === challenger.id);
      if (newIdx < 0) newIdx = 0;
    }
    room.currentTurnIdx = newIdx % aliveAfter.length;
    room.tableCards = [];
    room.tableClaim = null;
    room.playState  = "waiting_play";
    broadcastState(room);
    aliveAfter.forEach(p => sendHand(room, p.id));

    const cur = aliveAfter[room.currentTurnIdx];
    if (cur) send(cur.ws, { type: "bar:your_turn", cardType: room.currentCardType });
    return;
  }

  // ── Request state (reconnect) ──
  if (type === "bar:sync") {
    broadcastState(room);
    sendHand(room, pid);
    return;
  }
}

function startGame(room: BarRoom): void {
  room.phase = "playing";
  room.currentCardType = CARD_ROTATION[0];
  room.roundNum = 1;
  room.currentTurnIdx = 0;
  room.playState = "waiting_play";
  room.tableCards = [];
  room.tableClaim = null;
  dealHands(room);
  broadcastState(room);
  room.players.forEach((_, pid) => sendHand(room, pid));
  const active = activePlayers(room);
  const cur = active[0];
  if (cur) send(cur.ws, { type: "bar:your_turn", cardType: room.currentCardType });
}

export function handleBarDisconnect(ws: BarWS): void {
  const code = ws.barRoomCode;
  const pid  = ws.barPlayerId;
  if (!code || !pid) return;
  const room = barRooms.get(code);
  if (!room) return;
  const player = room.players.get(pid);
  if (player) {
    player.ws = null;
    broadcastRoom(room, { type: "bar:state", ...publicState(room) });
  }
}
