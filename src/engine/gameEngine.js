// Pure game logic for Scoundrel. No DOM access. Every exported action takes a
// GameState and returns a NEW GameState (plus an optional `message` describing
// what happened, for the UI to surface as a toast). Inputs are never mutated.

import { buildDeck, shuffle } from "./cards.js";

export const MAX_HEALTH = 20;
export const ROOM_SIZE = 4;
export const CARDS_PLAYED_PER_FULL_ROOM = 3;

/** §3 Setup Sequence */
export function createGame(rng = Math.random) {
  const dungeonDeck = shuffle(buildDeck(), rng);
  let state = {
    dungeonDeck,
    discardPile: [],
    room: [],
    carriedCard: null,
    equippedWeapon: null,
    weaponStack: [],
    health: MAX_HEALTH,
    maxHealth: MAX_HEALTH,
    potionUsedThisTurn: false,
    lastRoomAvoided: false,
    turnCount: 0,
    status: "playing",
    score: null,
    // Internal bookkeeping not in the public spec table, but required to
    // correctly implement §4.3's "leave 1 behind only when room started at 4"
    // and §7.3's "last card resolved was a potion" win bonus.
    turnRequiresCarry: false,
    lastResolvedCard: null,
    message: null,
  };
  state = formRoom(state);
  return state;
}

/** §4.1 Room formation: fills `room` up to 4 using carriedCard + draws from dungeonDeck. */
export function formRoom(state) {
  const room = [];
  if (state.carriedCard) room.push(state.carriedCard);

  const needed = ROOM_SIZE - room.length;
  const dungeonDeck = state.dungeonDeck.slice();
  const drawn = dungeonDeck.splice(0, Math.min(needed, dungeonDeck.length));
  room.push(...drawn);

  return {
    ...state,
    dungeonDeck,
    room,
    carriedCard: null,
    // UI-only marker (§6.1: "the 4th/carried card ... visually marked as
    // already in play") identifying which card in the freshly formed room,
    // if any, was held over from the previous room.
    carriedCardIdInRoom: state.carriedCard ? state.carriedCard.id : null,
    turnRequiresCarry: room.length === ROOM_SIZE,
    message: null,
    // Internal-only flag the UI uses to know a brand-new turn's room just
    // appeared (so it can re-offer the Avoid action / reset its own
    // "have I committed to this room yet" tracking).
    roomJustFormed: true,
  };
}

/** Whether the Avoid Room action should be offered right now (§4.2, §7.4). */
export function canAvoidRoom(state) {
  return (
    state.status === "playing" &&
    !state.lastRoomAvoided &&
    state.room.length > 0 &&
    state.dungeonDeck.length > 0
  );
}

/** §4.2 Avoid Room decision (the "avoid" branch). */
export function avoidRoom(state) {
  if (!canAvoidRoom(state)) return state;
  const dungeonDeck = [...state.dungeonDeck, ...state.room];
  const next = formRoom({
    ...state,
    dungeonDeck,
    room: [],
    carriedCard: null,
    lastRoomAvoided: true,
    message: "Room avoided.",
  });
  return next;
}

/** §4.2/§4.3 Commit to playing the current room (the "don't avoid" branch). */
export function commitRoom(state) {
  return {
    ...state,
    lastRoomAvoided: false,
    potionUsedThisTurn: false,
    turnCount: state.turnCount + 1,
    message: null,
  };
}

/** §5.3 durability eligibility check. Returns the max monster value the equipped weapon may still fight, or null if unrestricted/no weapon. */
export function weaponEligibilityThreshold(state) {
  if (!state.equippedWeapon) return null;
  if (state.weaponStack.length === 0) return null; // unrestricted
  return state.weaponStack[state.weaponStack.length - 1].value;
}

export function isWeaponEligibleFor(state, monster) {
  if (!state.equippedWeapon) return false;
  const threshold = weaponEligibilityThreshold(state);
  return threshold === null || monster.value <= threshold;
}

/**
 * §5 Card Resolution. Plays one of the 3 (or fewer, end-of-deck) selectable
 * cards from the room.
 *
 * @param {object} state
 * @param {string} cardId
 * @param {"barehanded"|"weapon"} [method] required for monster cards only
 */
export function playCard(state, cardId, method) {
  if (state.status !== "playing") return state;

  const idx = state.room.findIndex((c) => c.id === cardId);
  if (idx === -1) return state;
  const card = state.room[idx];
  const roomAfter = state.room.slice(0, idx).concat(state.room.slice(idx + 1));

  let next;
  switch (card.type) {
    case "weapon":
      next = resolveWeapon(state, card, roomAfter);
      break;
    case "potion":
      next = resolvePotion(state, card, roomAfter);
      break;
    case "monster":
      next = resolveMonster(state, card, roomAfter, method);
      break;
    default:
      throw new Error(`Unknown card type: ${card.type}`);
  }

  next.lastResolvedCard = { type: card.type, value: card.value };

  next = checkDeath(next);
  if (next.status === "lost") return next;

  return advanceTurnIfRoomCleared(next);
}

/** §5.1 Weapon resolution. */
function resolveWeapon(state, card, roomAfter) {
  const discardPile = state.discardPile.slice();
  if (state.equippedWeapon) {
    discardPile.push(state.equippedWeapon, ...state.weaponStack);
  }
  return {
    ...state,
    discardPile,
    equippedWeapon: card,
    weaponStack: [],
    room: roomAfter,
    message: null,
    roomJustFormed: false,
  };
}

/** §5.2 Potion resolution. */
function resolvePotion(state, card, roomAfter) {
  if (state.potionUsedThisTurn) {
    return {
      ...state,
      discardPile: [...state.discardPile, card],
      room: roomAfter,
      message: "Potion wasted — already healed this turn.",
      roomJustFormed: false,
    };
  }
  return {
    ...state,
    health: Math.min(state.maxHealth, state.health + card.value),
    potionUsedThisTurn: true,
    discardPile: [...state.discardPile, card],
    room: roomAfter,
    message: null,
    roomJustFormed: false,
  };
}

/** §5.3 Monster resolution (barehanded or with weapon). */
function resolveMonster(state, card, roomAfter, method) {
  const useWeapon = method === "weapon";
  if (useWeapon && !isWeaponEligibleFor(state, card)) {
    throw new Error("Weapon is not eligible to fight this monster.");
  }

  if (useWeapon) {
    const damage = Math.max(0, card.value - state.equippedWeapon.value);
    return {
      ...state,
      health: state.health - damage,
      weaponStack: [...state.weaponStack, card],
      room: roomAfter,
      message: null,
      roomJustFormed: false,
    };
  }

  return {
    ...state,
    health: state.health - card.value,
    discardPile: [...state.discardPile, card],
    room: roomAfter,
    message: null,
    roomJustFormed: false,
  };
}

/** §7.2 Death timing: checked immediately after any combat resolution. */
function checkDeath(state) {
  if (state.health <= 0) {
    const lost = { ...state, health: 0, status: "lost" };
    return { ...lost, score: computeLossScore(lost) };
  }
  return state;
}

/**
 * After a card resolution, decide whether the turn/room is over and advance
 * accordingly: carry the last card over (§4.3), form the next room (§4.1),
 * or end the game if the dungeon is fully cleared (§7.3/§7.4).
 */
function advanceTurnIfRoomCleared(state) {
  if (state.turnRequiresCarry && state.room.length === 1) {
    const carried = { ...state, carriedCard: state.room[0], room: [] };
    return finishRoomOrAdvance(carried);
  }
  if (state.room.length === 0) {
    return finishRoomOrAdvance(state);
  }
  return state; // still mid-room; wait for the next playCard call
}

function finishRoomOrAdvance(state) {
  const dungeonExhausted = state.dungeonDeck.length === 0;
  const nothingLeftToCarry = state.carriedCard === null;
  if (dungeonExhausted && state.room.length === 0 && nothingLeftToCarry) {
    return computeWin(state);
  }
  return formRoom(state);
}

/** §7.3 Win scoring. */
function computeWin(state) {
  let score = state.health;
  if (
    state.health === state.maxHealth &&
    state.lastResolvedCard &&
    state.lastResolvedCard.type === "potion"
  ) {
    score += state.lastResolvedCard.value;
  }
  return { ...state, status: "won", score };
}

/** §7.3 Loss scoring: sum of every still-undefeated monster's value. */
function computeLossScore(state) {
  const piles = [state.dungeonDeck, state.room, state.carriedCard ? [state.carriedCard] : []];
  let sum = 0;
  for (const pile of piles) {
    for (const card of pile) {
      if (card.type === "monster") sum += card.value;
    }
  }
  return -sum;
}

/** Convenience for the UI: every monster value still outstanding at a loss, for the breakdown screen. */
export function outstandingMonsters(state) {
  const piles = [state.dungeonDeck, state.room, state.carriedCard ? [state.carriedCard] : []];
  const monsters = [];
  for (const pile of piles) {
    for (const card of pile) {
      if (card.type === "monster") monsters.push(card);
    }
  }
  return monsters;
}
