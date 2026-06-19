// Renders a Card as a DOM element. No art assets required: faces are drawn
// from rank/suit/value text + icon, following the <suit>-<rank> naming
// convention in spirit so real art (e.g. assets/cards/clubs-7.png) can be
// dropped in later by swapping the background-image here without touching
// any game logic.

const SUIT_GLYPH = { clubs: "♣", spades: "♠", diamonds: "♦", hearts: "♥" };
const SUIT_LABEL = { clubs: "Clubs", spades: "Spades", diamonds: "Diamonds", hearts: "Hearts" };
const TYPE_LABEL = { monster: "Monster", weapon: "Weapon", potion: "Potion" };

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

  const topRow = document.createElement("div");
  topRow.className = "card-suit-row";
  const glyph = document.createElement("span");
  glyph.textContent = SUIT_GLYPH[card.suit];
  glyph.setAttribute("aria-hidden", "true");
  const letter = document.createElement("span");
  letter.textContent = card.suit[0].toUpperCase();
  letter.setAttribute("aria-hidden", "true");
  topRow.append(glyph, letter);

  const rank = document.createElement("div");
  rank.className = "card-rank";
  rank.textContent = String(card.rank);
  rank.setAttribute("aria-hidden", "true");

  const footer = document.createElement("div");
  footer.className = "card-footer";

  const typeLabel = document.createElement("span");
  typeLabel.className = "card-type-label";
  typeLabel.textContent = TYPE_LABEL[card.type];

  const valueBadge = document.createElement("span");
  valueBadge.className = "card-value-badge";
  valueBadge.textContent = `v${card.value}`;
  valueBadge.setAttribute("aria-hidden", "true");

  footer.append(typeLabel, valueBadge);
  el.append(topRow, rank, footer);

  if (weaponIneligible) {
    const badge = document.createElement("span");
    badge.className = "weapon-ineligible-badge";
    badge.title = "Weapon cannot be used on this monster";
    badge.setAttribute("aria-hidden", "true");
    badge.textContent = "✕";
    el.appendChild(badge);
  }

  if (onClick && !disabled) {
    el.addEventListener("click", () => onClick(card));
  }

  return el;
}

export function createPileElement(label) {
  const el = document.createElement("div");
  el.className = "pile card-back";
  el.setAttribute("role", "img");
  el.setAttribute("aria-label", label);
  return el;
}
