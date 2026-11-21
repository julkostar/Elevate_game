// ─────────────────────────────────────────────────────────────
//  ELEVATE — vertical "rarity" climber (Phaser 3)
//  Answer a question → your character floats to the planet that
//  matches how rare your answer is among everyone who's played.
// ─────────────────────────────────────────────────────────────
const CFG = window.GAME_CONFIG;
const TIERS = CFG.RARITY_LEVELS;

const VIEW_W = 800;
const VIEW_H = 600;
const TIER_GAP = 640;            // vertical distance between rarity planets
const FIRST_TIER_RISE = 380;     // ground → first planet
const GROUND_H = 72;
const WORLD_H = VIEW_H + FIRST_TIER_RISE + (TIERS.length - 1) * TIER_GAP + 260;
const GROUND_Y = WORLD_H - GROUND_H;
const PLANET_SIZE = 150;
const PX_PER_METRE = 4;

const hex = (s) => Phaser.Display.Color.HexStringToColor(s).color;

// ─────────────────────────────────────────────────────────────
class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }

  preload() {
    const bar = this.add.rectangle(VIEW_W / 2 - 150, VIEW_H / 2, 300, 8, 0x7ff6ff).setOrigin(0, 0.5).setScale(0, 1);
    this.add.text(VIEW_W / 2, VIEW_H / 2 - 24, 'loading thoughts…', { fontFamily: 'system-ui', fontSize: '14px', color: '#9a96c9' }).setOrigin(0.5);
    this.load.on('progress', (p) => (bar.scaleX = p));

    this.load.spritesheet('city', 'assets/kenney_tiny-city/Tilemap/tilemap_packed.png', { frameWidth: 16, frameHeight: 16 });
    TIERS.forEach((t) => this.load.image(t.planet, `assets/kenney_planets/Planets/${t.planet}.png`));
  }

  create() {
    // Pixel-art sheet stays crisp; planets keep smooth filtering.
    this.textures.get('city').setFilter(Phaser.Textures.FilterMode.NEAREST);

    // Soft dot used for particles.
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0xffffff, 1).fillCircle(4, 4, 4);
    g.generateTexture('dot', 8, 8);
    g.destroy();

    this.scene.start('Sky');
  }
}

// ─────────────────────────────────────────────────────────────
class SkyScene extends Phaser.Scene {
  constructor() { super('Sky'); }

  create() {
    this.tier = -1;          // -1 = on the ground
    this.busy = false;

    this.cameras.main.setBounds(0, 0, VIEW_W, WORLD_H);

    this.drawSky();
    this.buildMindMap();
    this.buildGround();
    this.createPlayer();
    this.createHud();

    this.cameras.main.startFollow(this.player, true, 0.08, 0.08, 0, 120);
    this.game.events.emit('sky-ready', this);
  }

  // ── Background: gradient from city dusk to deep space, notebook dot grid, stars
  drawSky() {
    const g = this.add.graphics().setDepth(-10);
    const stops = [ // top → bottom
      [0.00, 0x04010d], [0.35, 0x120a33], [0.70, 0x1b2560], [0.92, 0x35508f], [1.00, 0x5a7fb8],
    ];
    for (let i = 0; i < stops.length - 1; i++) {
      const [a, ca] = stops[i];
      const [b, cb] = stops[i + 1];
      g.fillGradientStyle(ca, ca, cb, cb, 1);
      g.fillRect(0, a * WORLD_H, VIEW_W, (b - a) * WORLD_H + 1);
    }

    // Mind-map "paper": faint dot grid
    const grid = this.add.graphics().setDepth(-9);
    grid.fillStyle(0xffffff, 0.07);
    for (let y = 20; y < GROUND_Y; y += 32) {
      for (let x = 16; x < VIEW_W; x += 32) grid.fillCircle(x, y, 1.2);
    }

    // Nebula blobs and stars, denser the higher you go
    const fx = this.add.graphics().setDepth(-8);
    const rnd = new Phaser.Math.RandomDataGenerator(['elevate']);
    for (let i = 0; i < 14; i++) {
      const y = rnd.between(0, GROUND_Y - 600);
      fx.fillStyle(rnd.pick([0x4aa8ff, 0xb36bff, 0xff5f7e, 0x7ff6ff]), 0.035);
      fx.fillCircle(rnd.between(0, VIEW_W), y, rnd.between(120, 260));
    }
    for (let i = 0; i < 420; i++) {
      const y = rnd.between(0, GROUND_Y - 200);
      const height01 = 1 - y / WORLD_H;
      fx.fillStyle(0xffffff, Phaser.Math.Clamp(height01 * rnd.realInRange(0.3, 1), 0.05, 0.9));
      fx.fillCircle(rnd.between(0, VIEW_W), y, rnd.realInRange(0.5, 1.8));
    }
  }

  // ── Mind map: rarity planets are hub nodes on a curving trunk,
  //    each with answer "branch" bubbles and little leaf twigs.
  buildMindMap() {
    this.edgeGfx = this.add.graphics().setDepth(-5);
    this.litGfx = this.add.graphics().setDepth(-4);

    this.root = new Phaser.Math.Vector2(VIEW_W / 2, GROUND_Y - 30);
    this.hubs = [];
    this.trunk = [];

    TIERS.forEach((t, i) => {
      const side = i % 2 === 0 ? -1 : 1;
      const x = VIEW_W / 2 + side * (i === 0 ? 90 : 170);
      const y = GROUND_Y - FIRST_TIER_RISE - i * TIER_GAP;
      const color = hex(t.color);

      // trunk edge from previous node
      const prev = i === 0 ? this.root : this.hubs[i - 1].pos;
      const ctrl = new Phaser.Math.Vector2((prev.x + x) / 2 - side * 140, (prev.y + y) / 2);
      const curve = new Phaser.Curves.QuadraticBezier(prev.clone(), ctrl, new Phaser.Math.Vector2(x, y));
      this.trunk.push(curve);

      // planet hub
      const planet = this.add.image(x, y, t.planet).setDisplaySize(PLANET_SIZE, PLANET_SIZE).setDepth(0);
      this.tweens.add({ targets: planet, angle: 360 * side, duration: 90000, repeat: -1 });
      const halo = this.add.circle(x, y, PLANET_SIZE * 0.62, color, 0.08).setStrokeStyle(2, color, 0.35).setDepth(-1);
      this.tweens.add({ targets: halo, scale: 1.08, alpha: 0.5, duration: 1800, yoyo: true, repeat: -1, ease: 'Sine.inOut' });

      const label = this.add.text(x, y + PLANET_SIZE / 2 + 14, t.name.toUpperCase(), {
        fontFamily: 'system-ui', fontSize: '16px', fontStyle: 'bold', color: t.color,
      }).setOrigin(0.5).setResolution(2).setDepth(1);
      const sub = this.add.text(x, y + PLANET_SIZE / 2 + 34, `picked by ≤ ${pct(t.maxShare)}`, {
        fontFamily: 'system-ui', fontSize: '11px', color: '#c9c6f0',
      }).setOrigin(0.5).setResolution(2).setDepth(1).setAlpha(0.8);

      // answer branches fan out away from the trunk
      const branches = [];
      for (let k = 0; k < CFG.BRANCHES_PER_TIER; k++) {
        const spread = (k - (CFG.BRANCHES_PER_TIER - 1) / 2) * 0.75;
        const ang = (side < 0 ? Math.PI : 0) + spread * (side < 0 ? 1 : -1) * -1;
        const dist = 200;
        let bx = x + Math.cos(ang) * dist;
        const by = y + Math.sin(ang) * dist * 0.8 - 30;
        bx = Phaser.Math.Clamp(bx, 100, VIEW_W - 100);
        // if clamped against the wall, swing it to the other side of the planet
        if (Math.abs(bx - x) < 120) bx = x - side * 210;
        branches.push(this.makeBranch(x, y, bx, by, color));
      }

      this.hubs.push({ pos: new Phaser.Math.Vector2(x, y), planet, halo, label, sub, branches, color });
    });

    this.drawTrunk();
  }

  makeBranch(hx, hy, bx, by, color) {
    const g = this.edgeGfx;
    const ctrl = { x: (hx + bx) / 2, y: Math.min(hy, by) - 40 };
    const curve = new Phaser.Curves.QuadraticBezier(
      new Phaser.Math.Vector2(hx, hy), new Phaser.Math.Vector2(ctrl.x, ctrl.y), new Phaser.Math.Vector2(bx, by));
    g.lineStyle(2, color, 0.35);
    curve.draw(g, 32);

    // leaf twigs
    for (let j = 0; j < 2; j++) {
      const lx = bx + (j === 0 ? -1 : 1) * Phaser.Math.Between(40, 60);
      const ly = by + Phaser.Math.Between(40, 60) * (j === 0 ? -1 : 1) * 0.8;
      g.lineStyle(1, color, 0.25).lineBetween(bx, by, lx, ly);
      g.fillStyle(color, 0.45).fillCircle(lx, ly, 3);
    }

    // bubble node
    const w = 120, h = 32;
    const box = this.add.graphics().setDepth(2);
    const draw = (filled) => {
      box.clear();
      box.fillStyle(filled ? color : 0x0f0d2b, filled ? 0.9 : 0.85);
      box.fillRoundedRect(bx - w / 2, by - h / 2, w, h, 16);
      box.lineStyle(2, color, filled ? 1 : 0.6);
      box.strokeRoundedRect(bx - w / 2, by - h / 2, w, h, 16);
    };
    draw(false);
    const text = this.add.text(bx, by, '…', {
      fontFamily: 'system-ui', fontSize: '12px', fontStyle: 'bold', color: '#e8e6ff',
    }).setOrigin(0.5).setResolution(2).setDepth(3);

    return { x: bx, y: by, box, text, draw, filled: false };
  }

  drawTrunk() {
    this.edgeGfx.lineStyle(10, 0xffffff, 0.04);
    this.trunk.forEach((c) => c.draw(this.edgeGfx, 64));
    this.trunk.forEach((c, i) => {
      this.edgeGfx.lineStyle(3, hex(TIERS[i].color), 0.3);
      c.draw(this.edgeGfx, 64);
    });
  }

  lightTrunk() {
    this.litGfx.clear();
    for (let i = 0; i <= this.tier; i++) {
      const col = hex(TIERS[i].color);
      this.litGfx.lineStyle(12, col, 0.15);
      this.trunk[i].draw(this.litGfx, 64);
      this.litGfx.lineStyle(4, col, 1);
      this.trunk[i].draw(this.litGfx, 64);
    }
  }

  // ── Ground: a strip of Tiny City
  buildGround() {
    const S = 3, T = 16 * S;
    this.add.rectangle(0, GROUND_Y, VIEW_W, GROUND_H + 10, 0x2b2740).setOrigin(0).setDepth(4);
    for (let x = 0; x < VIEW_W + T; x += T) {
      this.add.image(x, GROUND_Y, 'city', 74).setOrigin(0).setScale(S).setDepth(5);
    }
    const decor = [[60, 67], [120, 68], [190, 86], [600, 86], [670, 70], [735, 71], [300, 81], [500, 83]];
    decor.forEach(([x, f]) => this.add.image(x, GROUND_Y, 'city', f).setOrigin(0.5, 1).setScale(S).setDepth(5));

    // root node of the mind map
    this.add.circle(this.root.x, this.root.y, 8, 0x7ff6ff).setDepth(6);
    this.add.text(this.root.x, GROUND_Y + 30, 'START', {
      fontFamily: 'system-ui', fontSize: '12px', fontStyle: 'bold', color: '#e8e6ff',
    }).setOrigin(0.5).setResolution(2).setDepth(6);
  }

  // ── Player
  createPlayer() {
    this.player = this.add.sprite(VIEW_W / 2, GROUND_Y, 'city', CFG.PLAYER_FRAME)
      .setOrigin(0.5, 1).setScale(3).setDepth(10);
    this.nameTag = this.add.text(this.player.x, this.player.y - 56, '', {
      fontFamily: 'system-ui', fontSize: '12px', fontStyle: 'bold', color: '#ffffff',
      backgroundColor: '#00000077', padding: { x: 6, y: 2 },
    }).setOrigin(0.5, 1).setResolution(2).setDepth(11);
    this.startIdle();

    this.trail = this.add.particles(0, 0, 'dot', {
      speed: { min: 10, max: 40 }, lifespan: 700, frequency: 25,
      scale: { start: 0.9, end: 0 }, alpha: { start: 0.9, end: 0 },
      tint: 0x7ff6ff, blendMode: 'ADD', emitting: false,
    }).setDepth(9);
    this.trail.startFollow(this.player, 0, -20);
  }

  startIdle() {
    this.idle?.remove();
    this.baseY = this.player.y;
    this.idle = this.tweens.add({
      targets: this.player, y: this.baseY - 4, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.inOut',
    });
  }

  setPlayerName(name) { this.nameTag.setText(name || ''); this.nameTag.setVisible(Boolean(name)); }

  // ── HUD (fixed to camera): altitude meter with tier ticks
  createHud() {
    const x = VIEW_W - 22, top = 70, h = VIEW_H - 140;
    const g = this.add.graphics().setScrollFactor(0).setDepth(100);
    g.fillStyle(0x000000, 0.35).fillRoundedRect(x - 10, top - 14, 20, h + 28, 10);
    g.lineStyle(2, 0xffffff, 0.2).lineBetween(x, top, x, top + h);

    const maxAlt = GROUND_Y - this.hubs[this.hubs.length - 1].pos.y;
    TIERS.forEach((t, i) => {
      const alt = GROUND_Y - this.hubs[i].pos.y;
      const ty = top + h - (alt / maxAlt) * h;
      g.fillStyle(hex(t.color), 1).fillCircle(x, ty, 4);
    });
    this.meter = { top, h, maxAlt };
    this.marker = this.add.triangle(x - 14, top + h, 10, 0, 0, -6, 0, 6, 0x7ff6ff).setScrollFactor(0).setDepth(101);

    this.altText = this.add.text(VIEW_W - 44, 16, '', {
      fontFamily: 'system-ui', fontSize: '14px', color: '#e8e6ff', backgroundColor: '#00000055', padding: { x: 8, y: 4 },
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(100).setResolution(2);

    this.toast = this.add.text(VIEW_W / 2, 60, '', {
      fontFamily: 'system-ui', fontSize: '22px', fontStyle: 'bold', color: '#ffffff', stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(100).setResolution(2).setAlpha(0);
  }

  altitude() { return Math.max(0, Math.round((GROUND_Y - this.player.y) / PX_PER_METRE)); }

  update() {
    this.nameTag.setPosition(this.player.x, this.player.y - 54);
    const altPx = GROUND_Y - this.player.y;
    const { top, h, maxAlt } = this.meter;
    this.marker.y = top + h - Phaser.Math.Clamp(altPx / maxAlt, 0, 1) * h;
    const alt = this.altitude();
    const tierName = this.tier >= 0 ? TIERS[this.tier].name : 'Ground';
    this.altText.setText(`${alt} m  ·  ${tierName}`);
    if (alt !== this.lastAlt) { this.lastAlt = alt; this.game.events.emit('altitude', alt); }
  }

  showToast(msg, color = '#ffffff') {
    this.toast.setText(msg).setColor(color).setAlpha(1).setY(60);
    this.tweens.killTweensOf(this.toast);
    this.tweens.add({ targets: this.toast, alpha: 0, y: 40, delay: 1200, duration: 600 });
  }

  // ── Gameplay hook (called from the HTML panel)
  //    Fly to the tier the answer earned — up for rarer, down for more common.
  flyTo(target, answer, onDone) {
    target = Phaser.Math.Clamp(target, 0, TIERS.length - 1);
    if (this.busy) return;

    if (target === this.tier) {
      this.fillBranch(target, answer);
      this.tweens.add({ targets: this.player, y: this.player.y - 30, duration: 220, yoyo: true, ease: 'Quad.out' });
      this.showToast(`${TIERS[target].name}!`, TIERS[target].color);
      this.game.events.emit('tierChanged', this.tier);
      onDone?.();
      return;
    }

    this.busy = true;
    this.idle?.remove();
    const up = target > this.tier;
    const path = new Phaser.Curves.Path(this.player.x, this.player.y);

    if (up) {
      const first = this.trunk[this.tier + 1];
      path.lineTo(first.p0.x, first.p0.y);
      for (let i = this.tier + 1; i <= target; i++) path.add(this.trunk[i]);
    } else {
      const from = this.hubs[this.tier].pos;
      path.lineTo(from.x, from.y);
      for (let i = this.tier; i > target; i--) {
        const c = this.trunk[i];
        path.add(new Phaser.Curves.QuadraticBezier(c.p2.clone(), c.p1.clone(), c.p0.clone()));
      }
    }
    const dest = this.hubs[target].pos;
    const landY = dest.y - PLANET_SIZE / 2 + 12;
    path.lineTo(dest.x, landY);

    const steps = Math.abs(target - this.tier);
    this.trail.setParticleTint(hex(TIERS[target].color));
    this.trail.start();

    const p = new Phaser.Math.Vector2();
    let lastX = this.player.x;
    let passed = this.tier;
    const counter = { t: 0 };
    this.tweens.add({
      targets: counter, t: 1, duration: 1100 + steps * 900, ease: 'Sine.inOut',
      onUpdate: () => {
        path.getPoint(counter.t, p);
        this.player.setPosition(p.x, p.y);
        if (Math.abs(p.x - lastX) > 0.5) this.player.setFlipX(p.x < lastX);
        lastX = p.x;
        if (up) { // light the trunk progressively as we pass each hub
          while (passed < target && p.y <= this.hubs[passed + 1].pos.y) {
            passed++;
            this.tier = passed;
            this.lightTrunk();
            this.pulse(this.hubs[passed]);
          }
        }
      },
      onComplete: () => {
        this.tier = target;
        this.lightTrunk();
        this.trail.stop();
        this.player.setPosition(dest.x, landY);
        if (up) this.cameras.main.flash(250, 255, 255, 255, false);
        this.pulse(this.hubs[target]);
        this.fillBranch(target, answer);
        this.showToast(`${TIERS[target].name.toUpperCase()}!`, TIERS[target].color);
        this.startIdle();
        this.busy = false;
        this.game.events.emit('tierChanged', this.tier);
        onDone?.();
      },
    });
  }

  pulse(hub) {
    this.tweens.add({
      targets: hub.planet, displayWidth: PLANET_SIZE * 1.12, displayHeight: PLANET_SIZE * 1.12,
      duration: 160, yoyo: true, ease: 'Quad.out',
    });
  }

  fillBranch(tierIdx, word) {
    const hub = this.hubs[tierIdx];
    let b = hub.branches.find((br) => !br.filled);
    if (!b) { // all full: recycle the oldest
      b = hub.branches.shift();
      hub.branches.push(b);
    }
    b.filled = true;
    b.draw(true);
    b.text.setText(word.length > 16 ? word.slice(0, 15) + '…' : word).setColor('#07061a');
    b.text.setScale(0);
    this.tweens.add({ targets: b.text, scale: 1, duration: 300, ease: 'Back.out' });
  }
}

// ─────────────────────────────────────────────────────────────
//  HTML panel: player name, question, rarity ranking, leaderboard
// ─────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const NAME_KEY = 'elevate.name';

async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

const UI = {
  scene: null,
  name: null,
  queue: [],       // questions this player hasn't answered yet
  current: null,
  answeredCount: 0,

  init(scene) {
    this.scene = scene;
    scene.setPlayerName('');
    this.buildRarityTable();
    this.refreshLeaderboard();

    $('name-form').addEventListener('submit', (e) => { e.preventDefault(); this.login($('name-input').value); });
    $('btn-change').onclick = () => { store.remove(NAME_KEY); location.reload(); };
    $('btn-next').onclick = () => this.nextQuestion();

    scene.game.events.on('tierChanged', (t) => this.updateRarity(t));
    scene.game.events.on('altitude', (a) => ($('altitude').textContent = `${a} m`));

    const saved = store.get(NAME_KEY);
    if (saved) this.login(saved);
    else $('name-input').focus();
  },

  async login(raw) {
    const name = raw.trim();
    $('name-error').textContent = '';
    if (!name) { $('name-error').textContent = 'Please enter a name.'; return; }
    try {
      const p = await api('POST', '/api/players', { name });
      this.name = p.name;
      store.set(NAME_KEY, p.name);
      const done = new Set(p.answered);
      this.queue = CFG.QUESTIONS.filter((q) => !done.has(q.id));
      this.answeredCount = done.size;
      $('total-points').textContent = p.points;
      $('player-name').textContent = p.name;
      $('name-form').hidden = true;
      $('player-info').hidden = false;
      this.scene.setPlayerName(p.name);
      this.nextQuestion();
    } catch (e) {
      $('name-error').textContent = serverHint(e);
    }
  },

  nextQuestion() {
    $('results').hidden = true;
    $('question').hidden = false;
    $('feedback').textContent = '';
    const opts = $('options');
    opts.innerHTML = '';

    this.current = this.queue.shift() || null;
    if (!this.current) {
      $('q-progress').textContent = '';
      $('q-text').textContent = "You've answered every question. Check the leaderboard!";
      return;
    }
    $('q-progress').textContent = `${this.answeredCount + 1} / ${CFG.QUESTIONS.length}`;
    $('q-text').textContent = this.current.text;
    Object.keys(this.current.options).forEach((o) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'option';
      btn.textContent = o;
      btn.onclick = () => this.choose(o);
      opts.appendChild(btn);
    });
  },

  async choose(answer) {
    if (this.scene.busy) return;
    const question = this.current;
    document.querySelectorAll('#options .option').forEach((b) => {
      b.disabled = true;
      b.classList.toggle('chosen', b.textContent === answer);
    });
    $('feedback').textContent = 'Checking rarity…';
    $('feedback').className = '';

    try {
      const r = await api('POST', '/api/responses', { name: this.name, questionId: question.id, answer });
      this.answeredCount++;
      const tier = tierFromShare(r.share);
      $('total-points').textContent = r.totalPoints;
      $('feedback').textContent = `${TIERS[tier].name} · +${r.points} pts`;
      $('feedback').className = 'good';
      this.scene.flyTo(tier, r.answer, () => this.showResults(question, r, tier));
      this.refreshLeaderboard();
    } catch (e) {
      $('feedback').textContent = serverHint(e);
      $('feedback').className = 'bad';
      document.querySelectorAll('#options .option').forEach((b) => (b.disabled = false));
    }
  },

  // Options ranked rarest-first. Ties share a rank.
  showResults(question, r, tier) {
    const rows = Object.keys(question.options)
      .map((o) => ({ option: o, n: r.counts[o] || 0 }))
      .sort((a, b) => a.n - b.n);
    let rank = 0, prev = -1;
    rows.forEach((row) => { if (row.n !== prev) { rank++; prev = row.n; } row.rank = rank; });
    const mine = rows.find((row) => row.option === r.answer);

    const s = $('result-summary');
    s.innerHTML = '';
    const b = document.createElement('strong');
    b.textContent = `“${r.answer}”`;
    s.append('Your answer ', b, ` is #${mine.rank} rarest of ${rows.length}. Picked by ${pct(mine.n / r.total)} of ${r.total} responses. `);
    const t = document.createElement('span');
    t.textContent = `${TIERS[tier].name} · +${r.points} pts`;
    t.style.color = TIERS[tier].color;
    s.append(t);
    if (r.alreadyAnswered) s.append(' (you answered this one before)');

    const list = $('ranking');
    list.innerHTML = '';
    const max = Math.max(1, ...rows.map((row) => row.n));
    rows.forEach((row) => {
      const li = document.createElement('li');
      if (row === mine) li.className = 'mine';
      const share = r.total ? row.n / r.total : 0;
      li.innerHTML = '<span class="rank"></span><span class="opt"></span><span class="bar"><i></i></span><span class="pct"></span>';
      li.querySelector('.rank').textContent = `#${row.rank}`;
      li.querySelector('.opt').textContent = row.option;
      li.querySelector('.bar i').style.cssText = `width:${(row.n / max) * 100}%;background:${TIERS[tierFromShare(share)].color}`;
      li.querySelector('.pct').textContent = pct(share);
      list.appendChild(li);
    });

    $('btn-next').textContent = this.queue.length ? 'Next question' : 'Finish';
    $('question').hidden = true;
    $('results').hidden = false;
  },

  async refreshLeaderboard() {
    const list = $('leaders');
    const note = (msg) => {
      list.innerHTML = '';
      const li = document.createElement('li');
      li.className = 'muted';
      li.textContent = msg;
      list.appendChild(li);
    };
    try {
      const rows = await api('GET', '/api/leaderboard');
      if (!rows.length) return note('No answers yet. Be the first!');
      list.innerHTML = '';
      rows.forEach((row) => {
        const li = document.createElement('li');
        if (row.name === this.name) li.className = 'mine';
        const n = document.createElement('span');
        n.textContent = row.name;
        const p = document.createElement('span');
        p.className = 'pts';
        p.textContent = `${row.points} pts · ${row.answers} ans`;
        li.append(n, p);
        list.appendChild(li);
      });
    } catch (e) {
      note(serverHint(e));
    }
  },

  buildRarityTable() {
    const body = document.querySelector('#rarity-table tbody');
    body.innerHTML = '';
    [...TIERS].reverse().forEach((t) => {
      const tr = document.createElement('tr');
      tr.dataset.id = t.id;
      tr.innerHTML = `<td><span class="swatch" style="background:${t.color}"></span>${t.name}</td><td>≤ ${pct(t.maxShare)}</td>`;
      body.appendChild(tr);
    });
  },

  updateRarity(tierIdx) {
    $('current-tier').textContent = tierIdx >= 0 ? TIERS[tierIdx].name : 'Ground';
    $('current-tier').style.color = tierIdx >= 0 ? TIERS[tierIdx].color : '';
    document.querySelectorAll('#rarity-table tbody tr').forEach((tr) => {
      const i = TIERS.findIndex((t) => t.id === tr.dataset.id);
      tr.classList.toggle('current', i === tierIdx);
    });
  },
};

// ── Helpers ──────────────────────────────────────────────────
// Highest tier whose maxShare still covers this share (rarer → higher).
function tierFromShare(share) {
  let idx = 0;
  TIERS.forEach((t, i) => { if (share <= t.maxShare) idx = i; });
  return idx;
}

function pct(x) {
  const v = x * 100;
  return `${v < 10 && v % 1 ? v.toFixed(1) : Math.round(v)}%`;
}

function serverHint(e) {
  return e instanceof TypeError || /JSON|Failed to fetch/.test(e.message)
    ? "Can't reach the server. Start it with: node server.js"
    : e.message;
}

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  remove(k) { try { localStorage.removeItem(k); } catch {} },
};

// ─────────────────────────────────────────────────────────────
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game-wrap',
  width: VIEW_W,
  height: VIEW_H,
  backgroundColor: '#07061a',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [BootScene, SkyScene],
});

game.events.once('sky-ready', (scene) => UI.init(scene));
