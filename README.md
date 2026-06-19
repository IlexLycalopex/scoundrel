# Scoundrel

A digital single-player implementation of [Scoundrel](https://www.stfj.net/art/2011/Scoundrel.pdf) (Zach Gage & Kurt Bieg, 2011) — vanilla HTML/CSS/JS, no build step, no backend.

Play it on GitHub Pages: see the repository's Pages URL under **Settings → Pages**, or run it locally:

```sh
npm run serve
# then open http://localhost:8080
```

Run the unit tests for the rules engine:

```sh
npm test
```

## Structure

- `src/engine/` — pure game rules engine (deck, shuffle, room/turn logic), no DOM dependency
- `src/ui/` — DOM rendering and interaction wiring
- `assets/cards/` — card artwork
- `test/` — unit tests (`node --test`)
- `Scoundrel-Rules.pdf` — the original rules reference
