// ─────────────────────────────────────────────────────────────
//  ELEVATE server — serves the game and stores players + responses
//  in SQLite (data/elevate.db). No dependencies: needs Node 22.13+.
//
//    node server.js            → http://localhost:8000
//    PORT=3000 node server.js  → custom port
// ─────────────────────────────────────────────────────────────
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { DatabaseSync } = require('node:sqlite');

const PORT = Number(process.env.PORT) || 8000;
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');

// ── Config: reuse the browser's config.js so there is one source of truth
function loadConfig() {
  const ctx = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'config.js'), 'utf8'), ctx);
  return ctx.window.GAME_CONFIG;
}
const CFG = loadConfig();
const QUESTIONS = new Map(CFG.QUESTIONS.map((q) => [q.id, q]));

// ── Database
fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(path.join(DATA_DIR, 'elevate.db'));
db.exec(`
  CREATE TABLE IF NOT EXISTS players (
    id         INTEGER PRIMARY KEY,
    name       TEXT NOT NULL UNIQUE COLLATE NOCASE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS responses (
    id          INTEGER PRIMARY KEY,
    player_id   INTEGER NOT NULL REFERENCES players(id),
    question_id TEXT NOT NULL,
    answer      TEXT NOT NULL,
    share       REAL NOT NULL,     -- fraction of players who had picked this answer, at the time
    points      INTEGER NOT NULL,  -- rarity points earned (0–100)
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (player_id, question_id)
  );
`);

const q = {
  findPlayer:   db.prepare('SELECT id, name FROM players WHERE name = ?'),
  addPlayer:    db.prepare('INSERT INTO players (name) VALUES (?)'),
  playerStats:  db.prepare('SELECT COALESCE(SUM(points), 0) AS points FROM responses WHERE player_id = ?'),
  answered:     db.prepare('SELECT question_id, answer, points FROM responses WHERE player_id = ?'),
  findResponse: db.prepare('SELECT answer, share, points FROM responses WHERE player_id = ? AND question_id = ?'),
  counts:       db.prepare('SELECT answer, COUNT(*) AS n FROM responses WHERE question_id = ? GROUP BY answer'),
  addResponse:  db.prepare('INSERT INTO responses (player_id, question_id, answer, share, points) VALUES (?, ?, ?, ?, ?)'),
  leaderboard:  db.prepare(`
    SELECT p.name, SUM(r.points) AS points, COUNT(*) AS answers
    FROM responses r JOIN players p ON p.id = r.player_id
    GROUP BY p.id ORDER BY points DESC, answers ASC LIMIT 10`),
};

function getOrCreatePlayer(name) {
  let p = q.findPlayer.get(name);
  if (!p) {
    q.addPlayer.run(name);
    p = q.findPlayer.get(name);
  }
  return p;
}

// Response counts for every option: seed (pretend) counts from config.js
// plus real answers from the database.
function countsFor(question) {
  const counts = {};
  for (const [opt, seed] of Object.entries(question.options)) counts[opt] = CFG.USE_SEEDS ? Number(seed) || 0 : 0;
  for (const row of q.counts.all(question.id)) if (row.answer in counts) counts[row.answer] += row.n;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return { counts, total };
}

// Smoothed share: every option starts with one imaginary vote, so the
// very first player isn't automatically "Common" at 100%.
function shareOf(answer, counts, total, nOptions) {
  return (counts[answer] + 1) / (total + nOptions);
}

// ── API
function cleanName(raw) {
  const name = String(raw ?? '').trim().replace(/\s+/g, ' ');
  return name.length >= 1 && name.length <= 24 ? name : null;
}

const api = {
  'POST /api/players'(body) {
    const name = cleanName(body.name);
    if (!name) return [400, { error: 'Name must be 1–24 characters.' }];
    const p = getOrCreatePlayer(name);
    return [200, {
      name: p.name,
      points: q.playerStats.get(p.id).points,
      answered: q.answered.all(p.id).map((r) => r.question_id),
    }];
  },

  'POST /api/responses'(body) {
    const name = cleanName(body.name);
    const question = QUESTIONS.get(body.questionId);
    if (!name) return [400, { error: 'Missing name.' }];
    if (!question) return [400, { error: 'Unknown question.' }];
    if (!Object.hasOwn(question.options, String(body.answer))) return [400, { error: 'Not one of the options.' }];

    const p = getOrCreatePlayer(name);
    const existing = q.findResponse.get(p.id, question.id);
    let answer, share, points;

    if (existing) {
      ({ answer, share, points } = existing);
    } else {
      answer = body.answer;
      const { counts, total } = countsFor(question);
      counts[answer] += 1; // include this player's own vote
      share = shareOf(answer, counts, total + 1, Object.keys(question.options).length);
      points = Math.round(100 * (1 - share));
      q.addResponse.run(p.id, question.id, answer, share, points);
    }

    const { counts, total } = countsFor(question);
    return [200, {
      answer, share, points, counts, total,
      alreadyAnswered: Boolean(existing),
      totalPoints: q.playerStats.get(p.id).points,
    }];
  },

  'GET /api/leaderboard'() {
    return [200, q.leaderboard.all()];
  },
};

// ── HTTP
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json', '.ico': 'image/x-icon',
};

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type });
  res.end(type.startsWith('application/json') ? JSON.stringify(body) : body);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 10_000) { reject(new Error('Body too large')); req.destroy(); } });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { reject(new Error('Invalid JSON')); } });
  });
}

function serveStatic(req, res, urlPath) {
  const rel = decodeURIComponent(urlPath === '/' ? '/index.html' : urlPath);
  const file = path.normalize(path.join(ROOT, rel));
  // Only files inside the project, never the database or server source.
  if (!file.startsWith(ROOT + path.sep) || file.startsWith(DATA_DIR) || path.basename(file) === 'server.js') {
    return send(res, 404, 'Not found', 'text/plain');
  }
  fs.readFile(file, (err, buf) => {
    if (err) return send(res, 404, 'Not found', 'text/plain');
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(buf);
  });
}

http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  const handler = api[`${req.method} ${pathname}`];
  if (!handler) {
    if (pathname.startsWith('/api/')) return send(res, 404, { error: 'Not found' });
    if (req.method !== 'GET') return send(res, 405, 'Method not allowed', 'text/plain');
    return serveStatic(req, res, pathname);
  }
  try {
    const body = req.method === 'POST' ? await readJson(req) : {};
    const [status, payload] = handler(body);
    send(res, status, payload);
  } catch (e) {
    send(res, 400, { error: e.message });
  }
}).listen(PORT, () => console.log(`Elevate running at http://localhost:${PORT}`));
