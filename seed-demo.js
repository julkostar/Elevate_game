// ─────────────────────────────────────────────────────────────
//  Adds trial players + responses through the running server's API,
//  so they're stored and scored exactly like real players.
//
//    node server.js            (in one terminal)
//    node seed-demo.js         (in another) → 30 demo players
//    node seed-demo.js 100     → 100 demo players
//
//  Remove them later by deleting the data/ folder (resets everything).
// ─────────────────────────────────────────────────────────────
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const COUNT = Number(process.argv[2]) || 30;
const BASE = `http://localhost:${Number(process.env.PORT) || 8000}`;

const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'config.js'), 'utf8'), ctx);
const CFG = ctx.window.GAME_CONFIG;

const NAMES = ['Nova', 'Orbit', 'Comet', 'Luna', 'Atlas', 'Vega', 'Rigel', 'Lyra', 'Sol', 'Juno',
  'Pixel', 'Echo', 'Zephyr', 'Indigo', 'Quasar', 'Ember', 'Nebula', 'Cosmo', 'Halo', 'Astra'];

// Pick an option weighted by its seed count (+1 so 0-seed options still appear).
function weightedPick(options) {
  const entries = Object.entries(options).map(([o, w]) => [o, (Number(w) || 0) + 1]);
  let r = Math.random() * entries.reduce((a, [, w]) => a + w, 0);
  for (const [o, w] of entries) if ((r -= w) <= 0) return o;
  return entries[entries.length - 1][0];
}

async function post(url, body) {
  const res = await fetch(BASE + url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${url} → ${res.status} ${await res.text()}`);
  return res.json();
}

(async () => {
  let responses = 0;
  for (let i = 0; i < COUNT; i++) {
    const name = `${NAMES[i % NAMES.length]} ${Math.floor(i / NAMES.length) + 1} (demo)`;
    await post('/api/players', { name });
    // Each demo player answers a random 60–100% of the questions.
    for (const q of CFG.QUESTIONS) {
      if (Math.random() < 0.25) continue;
      await post('/api/responses', { name, questionId: q.id, answer: weightedPick(q.options) });
      responses++;
    }
  }
  console.log(`Added ${COUNT} demo players and ${responses} responses to ${BASE}`);
})().catch((e) => {
  console.error(e.cause?.code === 'ECONNREFUSED'
    ? `Can't reach ${BASE}. Start the game server first: node server.js`
    : e.message);
  process.exit(1);
});
