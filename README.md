# Elevate

A multiple-choice question game where **rarer answers rank higher**. Enter your name, pick an answer, and your character floats up to the planet that matches how few people chose the same thing. Every player and response is saved to a SQLite database.

## Run it

Requires **Node.js 22.13 or newer** (for the built-in `node:sqlite`). There's nothing to install.

```bash
node server.js
```

Open **http://localhost:8000**. To use another port: `PORT=3000 node server.js` (PowerShell: `$env:PORT=3000; node server.js`).

> Phaser loads from the jsDelivr CDN, so you need an internet connection the first time.
> Don't open `index.html` directly or use another static server. The game needs `server.js` for the database.

## How it works

1. Enter a name. It's saved, so you pick up where you left off if you come back.
2. Answer each question by picking one option. Each player can answer a question once.
3. The server counts how many people picked each option and works out the **share** for your answer.
4. The smaller the share, the higher your tier and the more points you get (`100 × (1 − share)`).
5. You see every option **ranked rarest first**, and the leaderboard updates.

| Tier | Answer picked by |
| --- | --- |
| Transcendent | ≤ 2% |
| Mythic | ≤ 5% |
| Legendary | ≤ 10% |
| Epic | ≤ 20% |
| Rare | ≤ 35% |
| Uncommon | ≤ 50% |
| Common | anything else |

### Seed counts (pretend answers)

Each option in [config.js](config.js) has a **seed count**: pretend responses it starts with. These are added to the real answers when the server works out rarity, so the ranking means something even for the very first player. Seeds are never written to the database.

```js
{ id: 'fruit', text: 'Pick a fruit.', options: {
  'Apple': 40, 'Banana': 30, 'Mango': 18, 'Kiwi': 8, 'Dragonfruit': 3, 'Durian': 1 } },
```

Set `USE_SEEDS: false` to rank on real answers only.

### Trial data

To fill the database and leaderboard with fake players, run this while the server is running:

```bash
node seed-demo.js        # 30 demo players
node seed-demo.js 100    # or any number
```

Demo players are named like `Nova 1 (demo)`. Their answers are picked at random, weighted by the seed counts, and are stored like real answers. Delete `data/` to clear them.

> **Getting error 501?** You're running a plain static server such as `python -m http.server`, which can't handle the game's save requests. Stop it and run `node server.js`.

## Configure

Edit [config.js](config.js), then **restart the server**:

| Setting | What it controls |
| --- | --- |
| `QUESTIONS` | `id`, `text`, and `options` as `{ answer: seedCount }`. Don't rename an `id` once people have answered. |
| `USE_SEEDS` | Turn the pretend counts on or off |
| `RARITY_LEVELS` | Tier names, colours, planet sprites, and `maxShare` thresholds |
| `PLAYER_FRAME` | Player sprite (frame index into the tiny-city tilemap) |
| `BRANCHES_PER_TIER` | Answer bubbles drawn off each planet |

## Data

The database is `data/elevate.db`, created on first run. It has two tables:

- `players`: `id`, `name` (unique, case-insensitive), `created_at`
- `responses`: `player_id`, `question_id`, `answer`, `share`, `points`, `created_at`

To reset everything, stop the server and delete the `data/` folder.

API: `POST /api/players {name}`, `POST /api/responses {name, questionId, answer}`, `GET /api/leaderboard`.

## Files

```
server.js    Node server: static files + API + SQLite
index.html   page layout and side panel
config.js    questions, seeds, tiers (shared by browser and server)
main.js      Phaser scene and panel logic
style.css    styles
assets/      Kenney asset packs (CC0)
```
