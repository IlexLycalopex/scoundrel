// Pure card model + deck construction. No DOM, no randomness side effects beyond an injected RNG.

const SUIT_TYPE = {
  clubs: "monster",
  spades: "monster",
  diamonds: "weapon",
  hearts: "potion",
};

const MONSTER_RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, "J", "Q", "K", "A"];
const RED_RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10];

const RANK_LETTER = {
  2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7", 8: "8", 9: "9", 10: "10",
  J: "J", Q: "Q", K: "K", A: "A",
};

const SUIT_LETTER = { clubs: "C", spades: "S", diamonds: "D", hearts: "H" };

export function rankToValue(rank) {
  if (typeof rank === "number") return rank;
  switch (rank) {
    case "J": return 11;
    case "Q": return 12;
    case "K": return 13;
    case "A": return 14;
    default: throw new Error(`Unknown rank: ${rank}`);
  }
}

export function makeCard(suit, rank) {
  return {
    id: `${SUIT_LETTER[suit]}-${RANK_LETTER[rank]}`,
    suit,
    rank,
    value: rankToValue(rank),
    type: SUIT_TYPE[suit],
    faceUp: true,
  };
}

/** Builds the canonical 44-card Scoundrel dungeon deck (unshuffled). */
export function buildDeck() {
  const deck = [];
  for (const suit of ["clubs", "spades"]) {
    for (const rank of MONSTER_RANKS) deck.push(makeCard(suit, rank));
  }
  for (const suit of ["diamonds", "hearts"]) {
    for (const rank of RED_RANKS) deck.push(makeCard(suit, rank));
  }
  return deck;
}

/** Fisher-Yates shuffle with an injectable RNG (defaults to Math.random) for testability/seeding. */
export function shuffle(array, rng = Math.random) {
  const result = array.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** Deterministic seedable RNG (mulberry32) for daily-seed/replay style features. */
export function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
