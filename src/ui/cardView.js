// Renders a Card as a DOM element using the real artwork in assets/cards/,
// named "<suit>-<rank>.webp" per the spec's asset convention.

import { buildDeck } from "../engine/cards.js";

const SUIT_LABEL = { clubs: "Clubs", spades: "Spades", diamonds: "Diamonds", hearts: "Hearts" };
const TYPE_LABEL = { monster: "Monster", weapon: "Weapon", potion: "Potion" };
const FACE_RANKS = new Set(["J", "Q", "K", "A"]);

export function cardImagePath(card) {
  return `assets/cards/${card.suit}-${card.rank}.webp`;
}

// Warms the browser cache for every card face (~2.2MB total) in the
// background so cards that haven't appeared yet don't stall on first draw.
export function preloadCardImages() {
  for (const card of buildDeck()) {
    new Image().src = cardImagePath(card);
  }
  new Image().src = "assets/cards/back.webp";
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
  img.src = cardImagePath(card);
  img.alt = "";
  img.draggable = false;
  img.decoding = "async";
  img.loading = "eager";
  el.appendChild(img);

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
