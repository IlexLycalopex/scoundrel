import {
  createGame,
  avoidRoom,
  commitRoom,
  canAvoidRoom,
  playCard,
  weaponEligibilityThreshold,
  isWeaponEligibleFor,
  outstandingMonsters,
  MAX_HEALTH,
} from "../engine/gameEngine.js";
import { createCardElement, preloadCardImages } from "./cardView.js";

const els = {
  healthFill: document.getElementById("health-fill"),
  healthText: document.getElementById("health-text"),
  turnText: document.getElementById("turn-text"),
  deckCount: document.getElementById("deck-count"),
  discardCount: document.getElementById("discard-count"),
  rulesBtn: document.getElementById("rules-btn"),
  weaponSlot: document.getElementById("weapon-slot"),
  weaponThreshold: document.getElementById("weapon-threshold"),
  roomCards: document.getElementById("room-cards"),
  avoidBtn: document.getElementById("avoid-btn"),
  avoidReason: document.getElementById("avoid-reason"),
  toast: document.getElementById("toast"),
  overlay: document.getElementById("modal-overlay"),
  modal: document.getElementById("modal"),
  endScreen: document.getElementById("end-screen"),
  endCard: document.getElementById("end-card"),
};

let state;
let turnCommitted = false; // has the player committed to playing the current room yet?
let toastTimer = null;

function newGame() {
  state = createGame();
  turnCommitted = false;
  closeModal();
  els.endScreen.classList.add("hidden");
  render();
}

function showToast(message) {
  if (!message) return;
  els.toast.textContent = message;
  els.toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove("visible"), 2600);
}

function flashHealth(delta) {
  els.healthFill.classList.remove("flash-damage", "flash-heal");
  if (delta < 0) els.healthFill.classList.add("flash-damage");
  if (delta > 0) els.healthFill.classList.add("flash-heal");
  setTimeout(() => els.healthFill.classList.remove("flash-damage", "flash-heal"), 350);
}

function closeModal() {
  els.overlay.classList.add("hidden");
  els.modal.innerHTML = "";
}

function openModal(buildFn) {
  els.modal.innerHTML = "";
  buildFn(els.modal);
  els.overlay.classList.remove("hidden");
}

function applyResult(nextState) {
  const prevHealth = state.health;
  state = nextState;
  if (state.health !== prevHealth) flashHealth(state.health - prevHealth);
  if (state.message) showToast(state.message);
  if (state.roomJustFormed) turnCommitted = false;
  render();
  if (state.status !== "playing") showEndScreen();
}

function ensureCommitted() {
  if (!turnCommitted) {
    state = commitRoom(state);
    turnCommitted = true;
  }
}

function resolve(cardId, method) {
  ensureCommitted();
  applyResult(playCard(state, cardId, method));
}

// --- Interaction handlers -------------------------------------------------

function handleAvoid() {
  if (!canAvoidRoom(state)) return;
  state = avoidRoom(state);
  turnCommitted = false;
  closeModal();
  render();
}

function handleCardClick(card) {
  if (card.type === "potion") {
    resolve(card.id);
    return;
  }
  if (card.type === "weapon") {
    handleWeaponClick(card);
    return;
  }
  if (card.type === "monster") {
    handleMonsterClick(card);
  }
}

function handleWeaponClick(card) {
  const hasBankedMonsters = state.equippedWeapon && state.weaponStack.length > 0;
  if (!hasBankedMonsters) {
    resolve(card.id);
    return;
  }
  openModal((modal) => {
    const h3 = document.createElement("h3");
    h3.textContent = "Replace equipped weapon?";
    const p = document.createElement("p");
    p.textContent = `Replacing your weapon will discard ${state.weaponStack.length} slain monster${state.weaponStack.length === 1 ? "" : "s"} banked against the durability rule — continue?`;
    const actions = document.createElement("div");
    actions.className = "modal-actions";
    const confirmBtn = document.createElement("button");
    confirmBtn.textContent = "Replace weapon";
    confirmBtn.addEventListener("click", () => {
      closeModal();
      resolve(card.id);
    });
    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = "Cancel";
    cancelBtn.addEventListener("click", closeModal);
    actions.append(confirmBtn, cancelBtn);
    modal.append(h3, p, actions);
  });
}

function handleMonsterClick(monster) {
  const weaponEligible = isWeaponEligibleFor(state, monster);
  if (!state.equippedWeapon || !weaponEligible) {
    resolve(monster.id, "barehanded");
    return;
  }
  openModal((modal) => {
    const h3 = document.createElement("h3");
    h3.textContent = `Fight ${monster.rank} of ${monster.suit}`;
    const p = document.createElement("p");
    p.textContent = `Value ${monster.value}. Choose how to fight.`;
    const actions = document.createElement("div");
    actions.className = "modal-actions";

    const bareBtn = document.createElement("button");
    bareBtn.textContent = `Fight barehanded (-${monster.value} HP)`;
    bareBtn.addEventListener("click", () => {
      closeModal();
      resolve(monster.id, "barehanded");
    });

    const damage = Math.max(0, monster.value - state.equippedWeapon.value);
    const weaponBtn = document.createElement("button");
    weaponBtn.textContent = `Fight with ${state.equippedWeapon.rank} of ${state.equippedWeapon.suit} (-${damage} HP)`;
    weaponBtn.addEventListener("click", () => {
      closeModal();
      resolve(monster.id, "weapon");
    });

    actions.append(bareBtn, weaponBtn);
    modal.append(h3, p, actions);
  });
}

function showRules() {
  openModal((modal) => {
    const h3 = document.createElement("h3");
    h3.textContent = "How to Play";

    const sections = [
      {
        title: "The Dungeon",
        body: "Each room reveals 4 cards from the deck. Resolve 3 of them, then the 4th carries over into the next room alongside 3 new cards.",
      },
      {
        title: "Cards",
        body: "Clubs & Spades are monsters (fight or flee). Diamonds are weapons (equip one at a time). Hearts are potions (heal HP, capped at max health).",
      },
      {
        title: "Fighting Monsters",
        body: "Fight barehanded and take damage equal to the monster's value, or fight with your equipped weapon to take damage equal to monster value minus weapon value (minimum 0).",
      },
      {
        title: "Weapon Durability",
        body: "A weapon can only be used on monsters with a value lower than or equal to the last monster it defeated — once a tougher monster slips past it, that weapon can't be used on equal-or-higher monsters again until replaced.",
      },
      {
        title: "Avoiding a Room",
        body: "Instead of playing a room, you may avoid it once — the whole room goes to the bottom of the deck. You can't avoid two rooms in a row, and can't avoid the final room.",
      },
      {
        title: "Winning & Scoring",
        body: "Clear the dungeon before your HP hits 0. Your score is remaining HP, plus a bonus if you finish at full health with a potion as your last card.",
      },
    ];

    for (const { title, body } of sections) {
      const sectionTitle = document.createElement("h4");
      sectionTitle.className = "rules-section-title";
      sectionTitle.textContent = title;
      const p = document.createElement("p");
      p.textContent = body;
      modal.append(sectionTitle, p);
    }

    const actions = document.createElement("div");
    actions.className = "modal-actions";
    const closeBtn = document.createElement("button");
    closeBtn.textContent = "Close";
    closeBtn.addEventListener("click", closeModal);
    actions.appendChild(closeBtn);

    modal.prepend(h3);
    modal.appendChild(actions);
  });
}

els.rulesBtn.addEventListener("click", showRules);

// --- Rendering -------------------------------------------------------------

function render() {
  renderHealth();
  renderPiles();
  renderWeapon();
  renderRoom();
  renderAvoidButton();
  els.turnText.textContent = `Turn ${state.turnCount}`;
}

function renderHealth() {
  const pct = Math.max(0, Math.min(100, (state.health / state.maxHealth) * 100));
  els.healthFill.style.width = `${pct}%`;
  els.healthFill.classList.toggle("warn", state.health > 0 && state.health <= 5);
  els.healthText.textContent = `${state.health} / ${state.maxHealth}`;
  els.healthFill.parentElement.setAttribute("aria-label", `Health ${state.health} of ${state.maxHealth}`);
}

function renderPiles() {
  els.deckCount.textContent = `${state.dungeonDeck.length} card${state.dungeonDeck.length === 1 ? "" : "s"} left`;
  els.discardCount.textContent = `${state.discardPile.length} discarded`;
}

function renderWeapon() {
  els.weaponSlot.innerHTML = "";
  if (!state.equippedWeapon) {
    els.weaponThreshold.textContent = "No weapon equipped";
    return;
  }
  const weaponEl = createCardElement(state.equippedWeapon, { onClick: null, disabled: true });
  weaponEl.classList.add("weapon-stack-card");
  els.weaponSlot.appendChild(weaponEl);
  for (const monster of state.weaponStack) {
    const monsterEl = createCardElement(monster, { onClick: null, disabled: true });
    monsterEl.classList.add("weapon-stack-card");
    els.weaponSlot.appendChild(monsterEl);
  }
  const threshold = weaponEligibilityThreshold(state);
  els.weaponThreshold.textContent =
    threshold === null ? "Usable on any monster" : `Usable on monsters ≤ ${threshold}`;
}

function renderRoom() {
  els.roomCards.innerHTML = "";
  const threshold = weaponEligibilityThreshold(state);
  state.room.forEach((card) => {
    const isCarriedIn = card.id === state.carriedCardIdInRoom;
    const weaponIneligible =
      card.type === "monster" && state.equippedWeapon !== null && threshold !== null && card.value > threshold;
    const el = createCardElement(card, {
      onClick: handleCardClick,
      disabled: false,
      weaponIneligible,
      carried: isCarriedIn,
    });
    els.roomCards.appendChild(el);
  });
}

function renderAvoidButton() {
  const allowed = canAvoidRoom(state);
  els.avoidBtn.disabled = !allowed;
  els.avoidBtn.onclick = handleAvoid;
  if (state.dungeonDeck.length === 0 && state.room.length > 0) {
    els.avoidReason.textContent = "Can't avoid the final room.";
  } else if (state.lastRoomAvoided) {
    els.avoidReason.textContent = "Can't avoid two rooms in a row.";
  } else {
    els.avoidReason.textContent = "";
  }
}

// --- End screen --------------------------------------------------------

function showEndScreen() {
  els.endCard.innerHTML = "";
  const h2 = document.createElement("h2");
  const scoreP = document.createElement("p");
  const breakdown = document.createElement("div");

  if (state.status === "won") {
    h2.textContent = "Dungeon cleared!";
    scoreP.textContent = `Final score: ${state.score}`;
    const bonus =
      state.health === MAX_HEALTH && state.lastResolvedCard && state.lastResolvedCard.type === "potion"
        ? state.lastResolvedCard.value
        : 0;
    breakdown.textContent = bonus > 0
      ? `Remaining HP: ${state.health} + full-health final potion bonus: ${bonus}`
      : `Remaining HP: ${state.health}`;
  } else {
    h2.textContent = "You fell in the dungeon.";
    scoreP.textContent = `Final score: ${state.score}`;
    const list = document.createElement("ul");
    list.className = "monster-list";
    for (const m of outstandingMonsters(state)) {
      const li = document.createElement("li");
      li.textContent = `${m.rank} of ${m.suit} (value ${m.value})`;
      list.appendChild(li);
    }
    breakdown.appendChild(document.createTextNode("Undefeated monsters that counted against you:"));
    breakdown.appendChild(list);
  }

  const actions = document.createElement("div");
  actions.className = "end-actions";
  const again = document.createElement("button");
  again.textContent = "Play Again";
  again.addEventListener("click", newGame);
  actions.appendChild(again);

  els.endCard.append(h2, scoreP, breakdown, actions);
  els.endScreen.classList.remove("hidden");
}

newGame();

// Defer the full-deck warm-up until the current room's images have had a
// chance to claim the connection first.
const idle = window.requestIdleCallback || ((cb) => setTimeout(cb, 200));
idle(preloadCardImages);
