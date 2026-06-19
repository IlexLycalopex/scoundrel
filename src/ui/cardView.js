// Renders a Card as a DOM element using the real artwork in assets/cards/,
// named "<suit>-<rank>.webp" per the spec's asset convention.

import { buildDeck } from "../engine/cards.js";

const SUIT_LABEL = { clubs: "Clubs", spades: "Spades", diamonds: "Diamonds", hearts: "Hearts" };
const TYPE_LABEL = { monster: "Monster", weapon: "Weapon", potion: "Potion" };
const FACE_RANKS = new Set(["J", "Q", "K", "A"]);
const SUIT_LETTER_GLYPH = { clubs: "♣", spades: "♠", diamonds: "♦", hearts: "♥" };

export function cardImagePath(card) {
  return `assets/cards/${card.suit}-${card.rank}.webp`;
}

// Warms the browser cache for every card face (~2.2MB total) in the
// background so cards that haven't appeared yet don't stall on first draw.
// Requests are staggered and marked low-priority so they queue behind, rather
// than compete with, the currently visible room's own image fetches on weak
// mobile connections (firing all 44 at once was starving in-flight loads and
// causing outright failures instead of just slow ones).
export function preloadCardImages() {
  const paths = buildDeck().map(cardImagePath);
  paths.push("assets/cards/back.webp");
  let i = 0;
  function loadNext() {
    if (i >= paths.length) return;
    const img = new Image();
    img.fetchPriority = "low";
    img.src = paths[i++];
    setTimeout(loadNext, 60);
  }
  loadNext();
}

function loadWithRetry(img, src, attemptsLeft = 3, delay = 600) {
  img.onerror = () => {
    if (attemptsLeft <= 0) {
      img.onerror = null;
      img.closest(".card")?.classList.add("art-failed");
      return;
    }
    setTimeout(() => {
      loadWithRetry(img, src, attemptsLeft - 1, delay * 2);
    }, delay);
  };
  img.src = src;
}

export function createCardElement(card, { onClick, disabled = false, weaponIneligible = false, carried = false, tabIndex = 0 } = {}) {
  const el = document.createElement("button");
  el.type = "button";
  el.className = `card type-${card.type}`;
  if (disabled) el.classList.add("disabled");
  if (carried) el.classList.add("carried");
  el.tabIndex = disabled ? -1 : tabIndex;
  el.dataset.cardId = card.id;

  const ariaParts = [String(card.rank), SUIT_LABEL[card.suit], TYPE_LABEL[card.type], `value ${card.value}`];
  if (carried) ariaParts.push("carried from previous room");
  el.setAttribute("aria-label", ariaParts.join(", "));

  const img = document.createElement("img");
  img.className = "card-face";
  img.alt = "";
  img.draggable = false;
  img.decoding = "async";
  img.loading = "eager";
  el.appendChild(img);
  loadWithRetry(img, cardImagePath(card));

  const fallback = document.createElement("span");
  fallback.className = "card-fallback";
  fallback.setAttribute("aria-hidden", "true");
  fallback.textContent = `${card.rank}${SUIT_LETTER_GLYPH[card.suit]}`;
  el.appendChild(fallback);

  // Face-rank monster cards (J/Q/K/A) print a letter, not the resolved
  // 11-14 value the rules actually use — surface the number explicitly
  // per the accessibility requirement that combat-relevant numbers can't
  // rely on rank-letter recognition alone.
  if (FACE_RANKS.has(card.rank)) {
    const valueBadge = document.createElement("span");
    valueBadge.className = "card-value-badge";
    valueBadge.textContent = card.value;
    el.appendChild(valueBadge);
  }

  if (weaponIneligible) {
    const badge = document.createElement("span");
    badge.className = "weapon-ineligible-badge";
    badge.title = "Weapon cannot be used on this monster";
    badge.setAttribute("aria-hidden", "true");
    badge.textContent = "✕";
    el.appendChild(badge);
  }

  if (carried) {
    const carriedTag = document.createElement("span");
    carriedTag.className = "carried-tag";
    carriedTag.textContent = "Carried";
    carriedTag.setAttribute("aria-hidden", "true");
    el.appendChild(carriedTag);
  }

  if (onClick && !disabled) {
    el.addEventListener("click", () => onClick(card));
  }

  return el;
}
