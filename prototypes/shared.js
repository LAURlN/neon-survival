'use strict';
/*
 * Shared by every build-system prototype: a tiny DOM helper, the page shell,
 * and `Range` — a test arena where endless hostiles walk at the player so a
 * build can be judged by what it actually does (DPS, kills, hits taken).
 */
const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function h(tag, props, ...kids) {
  const e = document.createElement(tag);
  for (const k in props || {}) {
    const v = props[k];
    if (k === 'style') for (const s in v) s.startsWith('--') ? e.style.setProperty(s, v[s]) : (e.style[s] = v[s]);
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else e.setAttribute(k, v);
  }
  for (const c of kids.flat()) if (c != null) e.append(c);
  return e;
}

/** Row of selectable part buttons. `defs[k]` needs name/desc, optional g (glyph), col, hidden. */
function palette(defs, first, onPick) {
  let cur = first;
  const btns = {};
  const el = h('div', { class: 'palette' });
  const upd = () => { for (const k in btns) btns[k].classList.toggle('on', k === cur); };
  for (const k in defs) {
    const d = defs[k];
    if (d.hidden) continue;
    btns[k] = h('button', { onclick: () => { cur = k; upd(); if (onPick) onPick(k); } },
      h('span', { style: { color: d.col || '' } }, (d.g ? d.g + ' ' : '') + d.name),
      h('small', {}, d.desc));
    el.append(btns[k]);
  }
  upd();
  return { el, get cur() { return cur; } };
}

/** Header, builder column, rules box and test range. `onLevel` fires when the run level changes. */
function mountShell({ title, tag, color, rules, maxLevel = 8, startLevel = 3, onLevel }) {
  document.documentElement.style.setProperty('--c', color);
  document.title = title + ' — build lab';
  const lvl = { v: startLevel };
  const lvEl = h('b', {}, String(lvl.v));
  const set = (d) => { lvl.v = clamp(lvl.v + d, 1, maxLevel); lvEl.textContent = lvl.v; if (onLevel) onLevel(lvl.v); };
  const left = h('div', { class: 'build' });
  const canvas = h('canvas', { class: 'range', width: 540, height: 540 });
  const stats = h('span', {});
  const ui = { left, canvas, stats, lvl, range: null };
  const pr = h('b', {}, '1×');
  const press = (d) => { ui.range.pressure = clamp(ui.range.pressure * d, 0.5, 8); pr.textContent = ui.range.pressure + '×'; };
  document.body.append(
    h('header', {},
      h('a', { href: 'index.html' }, '← all concepts'),
      h('h1', {}, title),
      h('span', { class: 'tag' }, tag),
      h('div', { class: 'lv', title: 'Simulates how far into a run you are' }, 'RUN LEVEL',
        h('button', { onclick: () => set(-1) }, '−'), lvEl, h('button', { onclick: () => set(1) }, '+'))),
    h('main', {},
      h('section', { class: 'col' }, left,
        h('details', { class: 'rules', open: '' }, h('summary', {}, 'How it works'), h('div', { html: rules }))),
      h('section', { class: 'col' }, canvas,
        h('div', { class: 'readout' }, stats, h('span', { class: 'sp' }),
          'PRESSURE', h('button', { onclick: () => press(0.5) }, '−'), pr, h('button', { onclick: () => press(2) }, '+'),
          h('button', { onclick: () => ui.range.reset() }, 'RESET')),
        h('p', { class: 'hint' }, 'WASD / arrow keys move. Hostiles never stop coming; a touch counts as a hit taken. Raise PRESSURE to stress a build.'))));
  return ui;
}

class Range {
  constructor(ui) {
    this.cv = ui.canvas;
    this.ctx = this.cv.getContext('2d');
    this.statsEl = ui.stats;
    ui.range = this;
    this.p = { x: 0, y: 0, a: -Math.PI / 2, r: 12, speed: 150, turn: 8 };
    this.keys = new Set();
    addEventListener('keydown', (e) => { if (e.key.startsWith('Arrow')) e.preventDefault(); this.keys.add(e.key.toLowerCase()); });
    addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    addEventListener('blur', () => this.keys.clear());
    /** Hooks a prototype may set. */
    this.onTick = null;      // (dt) every simulation step
    this.onFrame = null;     // (dt) after drawing
    this.onKill = null;      // (enemy)
    this.collide = null;     // (enemy) -> 'hit' | 'block' | null
    this.drawPlayer = null;  // (ctx)
    this.pressure = 1;
    this.reset();
  }

  reset() {
    this.enemies = []; this.shots = []; this.fx = []; this.timers = [];
    this.t = 0; this.kills = 0; this.hits = 0; this.log = []; this.spawnT = 0.5; this.lastKillT = -9; this.hurtT = 0;
  }

  start() {
    let last = performance.now(), acc = 0;
    const frame = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      this.update(dt);
      this.draw();
      if (this.onFrame) this.onFrame(dt);
      if ((acc += dt) > 0.2) { acc = 0; this.stats(); }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  stats() {
    while (this.log.length && this.log[0][0] < this.t - 4) this.log.shift();
    const dps = this.log.reduce((s, l) => s + l[1], 0) / Math.max(0.5, Math.min(4, this.t));
    this.statsEl.innerHTML = `DPS <b>${dps.toFixed(0)}</b> &nbsp; KILLS <b>${this.kills}</b> &nbsp; HITS TAKEN <b>${this.hits}</b>`;
  }

  update(dt) {
    this.t += dt;
    const p = this.p, k = this.keys;
    const mx = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0);
    const my = (k.has('s') || k.has('arrowdown') ? 1 : 0) - (k.has('w') || k.has('arrowup') ? 1 : 0);
    if (mx || my) {
      const l = Math.hypot(mx, my);
      p.x += (mx / l) * p.speed * dt;
      p.y += (my / l) * p.speed * dt;
      const d = ((Math.atan2(my, mx) - p.a + Math.PI * 3) % TAU) - Math.PI;
      p.a += clamp(d, -p.turn * dt, p.turn * dt);
    }

    this.spawnT -= dt;
    if (this.spawnT <= 0 && this.enemies.length < 110) {
      this.spawnT = 0.8 / this.pressure;
      const a = rand(0, TAU), big = Math.random() < 0.12;
      this.enemies.push({ x: p.x + Math.cos(a) * 420, y: p.y + Math.sin(a) * 420, r: big ? 15 : 9,
        hp: big ? 140 : 20, max: big ? 140 : 20, speed: big ? 34 : rand(48, 62), slow: 0, flash: 0, big });
    }

    for (let i = this.timers.length - 1; i >= 0; i--) {
      if (this.timers[i].t <= this.t) { const tm = this.timers[i]; this.timers.splice(i, 1); tm.fn(); }
    }
    if (this.onTick) this.onTick(dt);

    for (const e of this.enemies) {
      if (e.dead) continue;
      e.flash -= dt; e.slow -= dt;
      const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
      const sp = e.speed * (e.slow > 0 ? 0.45 : 1);
      e.x += (dx / d) * sp * dt; e.y += (dy / d) * sp * dt;
      const res = this.collide ? this.collide(e) : (d < e.r + p.r ? 'hit' : null);
      if (res === 'hit') { this.hits++; this.hurtT = 0.25; e.dead = true; this.spark(e.x, e.y, '#ff2e4d', 8); }
      else if (res === 'block') { e.x -= (dx / d) * 34; e.y -= (dy / d) * 34; }
    }

    for (const s of this.shots) {
      if (s.dead) continue;
      s.life -= dt;
      if (s.homing) {
        const e = this.nearest(s.x, s.y, 300, s.skip);
        if (e) {
          const cur = Math.atan2(s.vy, s.vx), sp = Math.hypot(s.vx, s.vy);
          const d = ((Math.atan2(e.y - s.y, e.x - s.x) - cur + Math.PI * 3) % TAU) - Math.PI;
          const na = cur + clamp(d, -s.homing * dt, s.homing * dt);
          s.vx = Math.cos(na) * sp; s.vy = Math.sin(na) * sp;
        }
      }
      s.x += s.vx * dt; s.y += s.vy * dt;
      if (s.pulse && (s.pulseT -= dt) <= 0) { s.pulseT += s.pulse.every; s.pulse.fn(s); }
      for (const e of this.enemies) {
        if (e.dead || Math.hypot(e.x - s.x, e.y - s.y) > e.r + s.r) continue;
        const seen = s.seen.get(e);
        if (seen !== undefined && (!s.rehit || this.t - seen < s.rehit)) continue;
        s.seen.set(e, this.t);
        this.hurt(e, s.dmg);
        if (s.onHit) s.onHit(e, s);
        if (s.pierce-- <= 0) { s.life = 0; break; }
      }
      if (s.life <= 0) { s.dead = true; if (s.onEnd) s.onEnd(s); }
    }

    for (const f of this.fx) { f.life -= dt; if (f.vx !== undefined) { f.x += f.vx * dt; f.y += f.vy * dt; } }
    this.enemies = this.enemies.filter((e) => !e.dead);
    this.shots = this.shots.filter((s) => !s.dead);
    this.fx = this.fx.filter((f) => f.life > 0);
    this.hurtT -= dt;
  }

  /** Returns true if the enemy died. */
  hurt(e, dmg) {
    if (e.dead || dmg <= 0) return false;
    this.log.push([this.t, Math.min(dmg, e.hp)]);
    e.hp -= dmg; e.flash = 0.08;
    if (e.hp > 0) return false;
    e.dead = true; this.kills++; this.lastKillT = this.t;
    this.spark(e.x, e.y, e.big ? '#ff9a3c' : '#ff3d6e', e.big ? 14 : 6);
    if (this.onKill) this.onKill(e);
    return true;
  }

  shoot(o) {
    if (this.shots.length > 500) return null;
    const s = Object.assign({ x: this.p.x, y: this.p.y, a: 0, speed: 520, dmg: 10, r: 4, pierce: 0, life: 1.3, color: '#5ff4ff' }, o);
    s.vx = Math.cos(s.a) * s.speed; s.vy = Math.sin(s.a) * s.speed;
    s.seen = new Map();
    if (s.skip) s.seen.set(s.skip, Infinity);
    if (s.pulse) s.pulseT = s.pulse.every;
    this.shots.push(s);
    return s;
  }

  /** Area damage. Returns the enemies it killed. */
  blast(x, y, r, dmg, color = '#ffb03c') {
    const killed = [];
    for (const e of this.enemies) if (!e.dead && Math.hypot(e.x - x, e.y - y) < r + e.r && this.hurt(e, dmg)) killed.push(e);
    this.fx.push({ kind: 'ring', x, y, r, life: 0.28, max: 0.28, color });
    return killed;
  }

  beam(x, y, a, len, dmg, color = '#ff2bd6', w = 9) {
    const cx = Math.cos(a), cy = Math.sin(a);
    for (const e of this.enemies) {
      if (e.dead) continue;
      const along = (e.x - x) * cx + (e.y - y) * cy;
      if (along < 0 || along > len) continue;
      if (Math.abs((e.x - x) * cy - (e.y - y) * cx) < w + e.r) this.hurt(e, dmg);
    }
    this.fx.push({ kind: 'line', x, y, x2: x + cx * len, y2: y + cy * len, w, life: 0.16, max: 0.16, color });
  }

  /** Arc from `from` through up to `n` further enemies. */
  chain(from, n, dmg, color = '#ffe93c') {
    const seen = new Set([from]);
    let cur = from;
    for (let i = 0; i < n; i++) {
      let best = null, bd = 130;
      for (const e of this.enemies) {
        const d = Math.hypot(e.x - cur.x, e.y - cur.y);
        if (!e.dead && !seen.has(e) && d < bd) { best = e; bd = d; }
      }
      if (!best) break;
      this.fx.push({ kind: 'line', x: cur.x, y: cur.y, x2: best.x, y2: best.y, w: 2, life: 0.18, max: 0.18, color });
      seen.add(best); this.hurt(best, dmg); cur = best;
    }
  }

  nearest(x, y, max = 1e9, skip) {
    let best = null;
    for (const e of this.enemies) {
      const d = Math.hypot(e.x - x, e.y - y);
      if (!e.dead && e !== skip && d < max) { best = e; max = d; }
    }
    return best;
  }

  /** Angle from (x, y) to the nearest enemy, or the player's facing if there is none. */
  aim(x, y, skip) {
    const e = this.nearest(x, y, 1e9, skip);
    return e ? Math.atan2(e.y - y, e.x - x) : this.p.a;
  }

  after(sec, fn) { this.timers.push({ t: this.t + sec, fn }); }

  spark(x, y, color, n = 6) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), v = rand(40, 160);
      this.fx.push({ kind: 'dot', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(0.15, 0.4), max: 0.4, color });
    }
  }

  draw() {
    const c = this.ctx, W = this.cv.width, H = this.cv.height, p = this.p;
    c.globalCompositeOperation = 'source-over';
    c.fillStyle = '#05060c';
    c.fillRect(0, 0, W, H);
    c.save();
    c.translate(W / 2 - p.x, H / 2 - p.y);
    c.strokeStyle = '#111a30'; c.lineWidth = 1; c.beginPath();
    for (let x = Math.floor((p.x - W / 2) / 40) * 40; x < p.x + W / 2; x += 40) { c.moveTo(x, p.y - H / 2); c.lineTo(x, p.y + H / 2); }
    for (let y = Math.floor((p.y - H / 2) / 40) * 40; y < p.y + H / 2; y += 40) { c.moveTo(p.x - W / 2, y); c.lineTo(p.x + W / 2, y); }
    c.stroke();

    for (const e of this.enemies) {
      c.fillStyle = e.flash > 0 ? '#fff' : e.slow > 0 ? '#7fd0ff' : e.big ? '#ff9a3c' : '#ff3d6e';
      c.beginPath(); c.moveTo(e.x, e.y - e.r); c.lineTo(e.x + e.r, e.y); c.lineTo(e.x, e.y + e.r); c.lineTo(e.x - e.r, e.y); c.fill();
      if (e.big && e.hp < e.max) { c.fillStyle = '#fff'; c.fillRect(e.x - 14, e.y - e.r - 6, 28 * (e.hp / e.max), 2); }
    }

    c.globalCompositeOperation = 'lighter';
    for (const s of this.shots) {
      c.fillStyle = s.color;
      c.globalAlpha = 0.25; c.beginPath(); c.arc(s.x, s.y, s.r * 2.4, 0, TAU); c.fill();
      c.globalAlpha = 1; c.beginPath(); c.arc(s.x, s.y, s.r, 0, TAU); c.fill();
    }
    for (const f of this.fx) {
      const k = clamp(f.life / f.max, 0, 1);
      c.globalAlpha = k; c.strokeStyle = c.fillStyle = f.color;
      if (f.kind === 'ring') { c.lineWidth = 2 + 4 * k; c.beginPath(); c.arc(f.x, f.y, f.r * (1 - 0.35 * k), 0, TAU); c.stroke(); }
      else if (f.kind === 'line') { c.lineWidth = f.w * k + 1; c.beginPath(); c.moveTo(f.x, f.y); c.lineTo(f.x2, f.y2); c.stroke(); }
      else c.fillRect(f.x - 1.5, f.y - 1.5, 3, 3);
    }
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';

    if (this.drawPlayer) this.drawPlayer(c);
    else {
      c.save(); c.translate(p.x, p.y); c.rotate(p.a);
      c.fillStyle = '#e6f1ff'; c.strokeStyle = '#5ff4ff'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(14, 0); c.lineTo(-9, 9); c.lineTo(-5, 0); c.lineTo(-9, -9); c.closePath(); c.fill(); c.stroke();
      c.restore();
    }
    c.restore();
    if (this.hurtT > 0) { c.fillStyle = `rgba(255,46,77,${this.hurtT * 0.9})`; c.fillRect(0, 0, W, H); }
  }
}
