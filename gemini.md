# 📜 gemini.md — Project Constitution

> **This file is law.** Logic changes here before they change in code.
> Last Updated: 2026-04-22

---

## 🧭 Identity

- **Project:** Claude Code Together — VOID SIEGE (Top-Down Shooter)
- **Pilot:** System Pilot (Antigravity / B.L.A.S.T.)
- **Protocol:** B.L.A.S.T. + A.N.T. 3-Layer Architecture
- **Status:** 🟢 PHASE 3 — Building

---

## 📐 Data Schema

### Game State Schema
```json
{
  "player": { "x": 0, "y": 0, "hp": 100, "angle": 0, "invulnTimer": 0, "kills": 0 },
  "bullets": [{ "x": 0, "y": 0, "vx": 0, "vy": 0, "size": 4, "life": 2 }],
  "enemies": [{ "x": 0, "y": 0, "size": 15, "speed": 80, "color": "#ff3355" }],
  "particles": [{ "x": 0, "y": 0, "vx": 0, "vy": 0, "size": 3, "color": "#fff", "life": 0.8 }],
  "wave": { "number": 1, "timer": 60 },
  "score": 0,
  "highScore": 0,
  "gameState": "menu | playing | game_over"
}
```

### Payload Schema (localStorage)
```json
{ "voidSiege_highScore": 0 }
```

---

## 🏛️ Architectural Invariants

1. **Pure frontend.** No server, no APIs, no `.env` needed.
2. **Canvas-based rendering.** HTML5 Canvas + requestAnimationFrame.
3. **Delta-time game loop.** Frame-rate independent movement.
4. **localStorage for persistence.** High score survives browser close.
5. **Schema is law.** Game state shape matches the schema above.

---

## 📏 Behavioral Rules

- [x] Enemies deal 10 damage on contact
- [x] Player has 100 HP max
- [x] Waves spawn every 60 seconds
- [x] Kill count tracked per run
- [x] High score persists across sessions (localStorage)
- [x] Death → Game Over screen → Menu with high score
- [x] Mouse aim + click to shoot, WASD to move

---

## 🔌 Integrations Registry

| Service | Status | Notes |
|---------|--------|-------|
| None | ✅ N/A | Pure local frontend — no external services |

---

## 🗂️ Layer Map

| Layer | Directory | Purpose |
|-------|-----------|---------|
| Game UI | `index.html` + `style.css` | Structure & styling |
| Game Engine | `game.js` | All game logic, rendering, state |
| Persistence | `localStorage` | High score storage |

---

## 🔧 Maintenance Log

| Date | Change | Author |
|------|--------|--------|
| 2026-04-22 | Constitution initialized | System Pilot |
| 2026-04-22 | Discovery complete, schema locked, build started | System Pilot |
