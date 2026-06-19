import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDeck } from "../src/engine/cards.js";
import {
  createGame,
  formRoom,
  avoidRoom,
  commitRoom,
  canAvoidRoom,
  playCard,
  weaponEligibilityThreshold,
  isWeaponEligibleFor,
} from "../src/engine/gameEngine.js";

const noShuffle = () => 0; // rng that never swaps -> deterministic ordering for tests

function freshGame() {
  return commitRoom(createGame(noShuffle));
}

// --- Deck composition (§2.2) ---

test("deck has 44 cards: 26 monsters, 9 weapons, 9 potions", () => {
  const deck = buildDeck();
  assert.equal(deck.length, 44);
  assert.equal(deck.filter((c) => c.type === "monster").length, 26);
  assert.equal(deck.filter((c) => c.type === "weapon").length, 9);
  assert.equal(deck.filter((c) => c.type === "potion").length, 9);
  assert.ok(deck.every((c) => c.type !== "weapon" || c.value <= 10));
  assert.ok(deck.every((c) => c.type !== "potion" || c.value <= 10));
  assert.ok(deck.some((c) => c.type === "monster" && c.value === 14)); // aces survive on black suits
});

// --- Weapon durability rule (§5.3) — most commonly mis-implemented ---

test("weapon with empty stack is eligible against any monster", () => {
  let state = freshGame();
  state = { ...state, equippedWeapon: { id: "D-5", suit: "diamonds", rank: 5, value: 5, type: "weapon" }, weaponStack: [] };
  assert.equal(weaponEligibilityThreshold(state), null);
  assert.equal(isWeaponEligibleFor(state, { value: 14, type: "monster" }), true);
});

test("weapon becomes restricted to <= last slain monster's value", () => {
  let state = freshGame();
  state = {
    ...state,
    equippedWeapon: { id: "D-5", suit: "diamonds", rank: 5, value: 5, type: "weapon" },
    weaponStack: [{ id: "C-7", suit: "clubs", rank: 7, value: 7, type: "monster" }],
  };
  assert.equal(weaponEligibilityThreshold(state), 7);
  assert.equal(isWeaponEligibleFor(state, { value: 7, type: "monster" }), true);
  assert.equal(isWeaponEligibleFor(state, { value: 8, type: "monster" }), false);
});

test("fighting with an ineligible weapon throws (UI must prevent this via the disabled option)", () => {
  let state = freshGame();
  state = {
    ...state,
    room: [{ id: "S-K", suit: "spades", rank: "K", value: 13, type: "monster" }],
    equippedWeapon: { id: "D-5", suit: "diamonds", rank: 5, value: 5, type: "weapon" },
    weaponStack: [{ id: "C-6", suit: "clubs", rank: 6, value: 6, type: "monster" }],
    turnRequiresCarry: false,
  };
  assert.throws(() => playCard(state, "S-K", "weapon"));
});

test("weapon damage formula: max(0, monster.value - weapon.value), monster banked on stack not discarded", () => {
  let state = freshGame();
  state = {
    ...state,
    health: 20,
    room: [{ id: "C-4", suit: "clubs", rank: 4, value: 4, type: "monster" }],
    equippedWeapon: { id: "D-6", suit: "diamonds", rank: 6, value: 6, type: "weapon" },
    weaponStack: [],
    turnRequiresCarry: false,
  };
  const next = playCard(state, "C-4", "weapon");
  assert.equal(next.health, 20); // 4 - 6 clamped to 0 damage
  assert.equal(next.weaponStack.length, 1);
  assert.equal(next.weaponStack[0].id, "C-4");
  assert.ok(!next.discardPile.some((c) => c.id === "C-4"));
});

test("equipping a new weapon discards the old weapon and its entire stack", () => {
  let state = freshGame();
  state = {
    ...state,
    room: [{ id: "D-3", suit: "diamonds", rank: 3, value: 3, type: "weapon" }],
    equippedWeapon: { id: "D-9", suit: "diamonds", rank: 9, value: 9, type: "weapon" },
    weaponStack: [{ id: "C-2", suit: "clubs", rank: 2, value: 2, type: "monster" }],
    turnRequiresCarry: false,
  };
  const next = playCard(state, "D-3");
  assert.equal(next.equippedWeapon.id, "D-3");
  assert.deepEqual(next.weaponStack, []);
  assert.ok(next.discardPile.some((c) => c.id === "D-9"));
  assert.ok(next.discardPile.some((c) => c.id === "C-2"));
});

// --- Potion once-per-turn rule (§5.2, §7.1) — the other commonly broken rule ---

test("first potion in a room heals; second potion in the same room is wasted", () => {
  let state = freshGame();
  state = {
    ...state,
    health: 10,
    room: [
      { id: "H-5", suit: "hearts", rank: 5, value: 5, type: "potion" },
      { id: "H-7", suit: "hearts", rank: 7, value: 7, type: "potion" },
      { id: "C-2", suit: "clubs", rank: 2, value: 2, type: "monster" },
    ],
    turnRequiresCarry: false,
  };
  let next = playCard(state, "H-5");
  assert.equal(next.health, 15);
  assert.equal(next.potionUsedThisTurn, true);

  next = playCard(next, "H-7");
  assert.equal(next.health, 15); // unchanged — wasted
  assert.equal(next.message, "Potion wasted — already healed this turn.");
  assert.ok(next.discardPile.some((c) => c.id === "H-7"));
});

test("potionUsedThisTurn resets at the start of the next room", () => {
  let state = freshGame();
  state = {
    ...state,
    health: 10,
    room: [
      { id: "H-5", suit: "hearts", rank: 5, value: 5, type: "potion" },
      { id: "C-2", suit: "clubs", rank: 2, value: 2, type: "monster" },
      { id: "C-3", suit: "clubs", rank: 3, value: 3, type: "monster" },
      { id: "C-4", suit: "clubs", rank: 4, value: 4, type: "monster" },
    ],
    dungeonDeck: [{ id: "H-9", suit: "hearts", rank: 9, value: 9, type: "potion" }],
    turnRequiresCarry: true,
  };
  let next = playCard(state, "H-5");
  next = playCard(next, "C-2");
  next = playCard(next, "C-3"); // 3 resolved, C-4 becomes carriedCard, next room forms
  assert.equal(next.carriedCard, null); // consumed into the new room by formRoom
  assert.equal(next.potionUsedThisTurn, true); // still true until commitRoom runs for the new room

  next = commitRoom(next);
  assert.equal(next.potionUsedThisTurn, false);
});

// --- Health cap at 20 ---

test("healing clamps at maxHealth", () => {
  let state = freshGame();
  state = {
    ...state,
    health: 18,
    room: [{ id: "H-8", suit: "hearts", rank: 8, value: 8, type: "potion" }],
    turnRequiresCarry: false,
  };
  const next = playCard(state, "H-8");
  assert.equal(next.health, 20);
});

// --- Avoid Room (§4.2, §7.4) ---

test("cannot avoid two rooms in a row", () => {
  let state = freshGame();
  state = avoidRoom(state);
  assert.equal(state.lastRoomAvoided, true);
  assert.equal(canAvoidRoom(state), false);
});

test("avoiding moves all 4 room cards to the bottom of the dungeon deck in order", () => {
  let state = freshGame();
  const originalRoomIds = state.room.map((c) => c.id);
  const deckLenBefore = state.dungeonDeck.length;
  state = avoidRoom(state);
  assert.equal(state.dungeonDeck.length, deckLenBefore); // 4 removed off top via formRoom, 4 avoided cards appended, net same minus newly drawn... see below
  // The 4 avoided cards should now sit right after the cards drawn for the new room, at what was originally the bottom.
  const bottomFour = state.dungeonDeck.slice(-4).map((c) => c.id);
  assert.deepEqual(bottomFour, originalRoomIds);
});

test("avoid is disabled once the dungeon deck is empty when the room is offered", () => {
  let state = freshGame();
  state = { ...state, dungeonDeck: [] };
  assert.equal(canAvoidRoom(state), false);
});

// --- Death timing (§7.2) ---

test("death is checked immediately and halts the rest of the room", () => {
  let state = freshGame();
  state = {
    ...state,
    health: 5,
    room: [
      { id: "S-A", suit: "spades", rank: "A", value: 14, type: "monster" },
      { id: "H-5", suit: "hearts", rank: 5, value: 5, type: "potion" },
      { id: "H-6", suit: "hearts", rank: 6, value: 6, type: "potion" },
      { id: "H-7", suit: "hearts", rank: 7, value: 7, type: "potion" },
    ],
    turnRequiresCarry: true,
  };
  const next = playCard(state, "S-A");
  assert.equal(next.status, "lost");
  assert.equal(next.health, 0);
  assert.ok(next.score < 0);
});

// --- Win scoring (§7.3) ---

test("win score is remaining health when the dungeon is cleared", () => {
  let state = freshGame();
  state = {
    ...state,
    health: 14,
    dungeonDeck: [],
    room: [{ id: "C-2", suit: "clubs", rank: 2, value: 2, type: "monster" }],
    turnRequiresCarry: false,
  };
  const next = playCard(state, "C-2");
  assert.equal(next.status, "won");
  assert.equal(next.score, 12); // 14 - 2 damage
});

test("win score gets a potion bonus only at full health with a final wasted-cap potion", () => {
  let state = freshGame();
  state = {
    ...state,
    health: 20,
    dungeonDeck: [],
    room: [{ id: "H-9", suit: "hearts", rank: 9, value: 9, type: "potion" }],
    turnRequiresCarry: false,
    potionUsedThisTurn: false,
  };
  const next = playCard(state, "H-9");
  assert.equal(next.status, "won");
  assert.equal(next.health, 20);
  assert.equal(next.score, 29); // 20 + 9 bonus
});

// --- End-of-deck room formation (§7.4) ---

test("final room can have fewer than 4 cards and all of them must be played", () => {
  let state = freshGame();
  state = {
    ...state,
    dungeonDeck: [],
    room: [
      { id: "C-2", suit: "clubs", rank: 2, value: 2, type: "monster" },
      { id: "C-3", suit: "clubs", rank: 3, value: 3, type: "monster" },
    ],
    health: 20,
    turnRequiresCarry: false, // room started with < 4, so no carry-over
  };
  let next = playCard(state, "C-2");
  assert.equal(next.status, "playing"); // one card left, game not over yet
  next = playCard(next, "C-3");
  assert.equal(next.status, "won");
});
