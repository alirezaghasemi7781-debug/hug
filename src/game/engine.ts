import {
  PATH, SLOTS, BAYS, CUSTOMS_X, STRUCTS, TDEF, SPEC, EDEF, BOSS_KINDS, SHIPS, HEROES, TECH, ISLAND_UNLOCK, CHALLENGES, CAMPAIGN_OPS, opWaves, opWeather,
  ENEMY_HP, ENEMY_BOUNTY, costOf, upgradeCost, fmt, MAX_LEVEL, TKINDS, type StructId, type TKind, type EKind, type HeroId,
} from './data';
import {
  type G, type Enemy, type Tower, type Proj, type Battle, type BattleMode, type Queued, PLEN, LLEN, pathPos, lanePos, nearestP, dist, initHeroes,
} from './state';
import { derive, econTick, towerStats, addUsd, stormActive, type Derived, type TStats } from './econ';
import { play, haptic } from './sfx';

const rnd = () => Math.random();
const slotOf = (id: string) => SLOTS.find((s) => s.id === id)!;
const stationCache: Record<string, number> = {};
const stationP = (id: string) => (stationCache[id] ??= nearestP(slotOf(id).x, slotOf(id).y));

// ---------- ابزارها ----------
export function toast(s: G, text: string) {
  s.rt.toasts.push({ id: s.rt.nextId++, text, t: 3.2 });
  if (s.rt.toasts.length > 4) s.rt.toasts.shift();
}
function floater(s: G, x: number, y: number, text: string, color: string, size = 13) {
  if (s.rt.floaters.length > 60) s.rt.floaters.shift();
  s.rt.floaters.push({ x, y, text, color, t: 0, life: 1.1, size });
}
function fx(s: G, type: 'boom' | 'line' | 'ring' | 'flash' | 'spark', x: number, y: number, o: { x2?: number; y2?: number; life?: number; color?: string; r?: number } = {}) {
  if (s.rt.fx.length > 120) s.rt.fx.shift();
  s.rt.fx.push({ type, x, y, x2: o.x2 ?? x, y2: o.y2 ?? y, t: 0, life: o.life ?? 0.4, color: o.color ?? '#fff', r: o.r ?? 20 });
}
export const heroE = (s: G) => s.rt.battle?.E ?? s.done * 0.75;

// ---------- دشمنان ----------
function mkEnemy(s: G, kind: EKind, E: number, o: { lane?: number; p?: number; hunt?: boolean; battle?: boolean; bm?: number } = {}): Enemy {
  const def = EDEF[kind];
  const hp = ENEMY_HP(def.hp, E);
  const boss = kind.startsWith('boss');
  const e: Enemy = {
    id: s.rt.nextId++, kind, hp, maxHp: hp, shield: 0, shieldMax: 0, p: o.p ?? 0, lane: o.lane ?? 0, x: 0, y: 0, ang: 0, slow: 0, stun: 0, burn: 0,
    hidden: def.sub, revealed: false, air: def.air, blockedBy: 0, cdA: boss ? 6 : 3 + rnd() * 3, cdB: 3, armorBreak: 0, hunt: !!o.hunt, hacked: 0,
    bountyMul: o.bm ?? 1, E, dead: false, battle: !!o.battle, disabled: 0, tgt: 0, loot: 0, fx: 0, fy: 0, hit: 0, pirate: false,
  };
  if (kind === 'boss3') { e.shieldMax = hp * 0.5; e.shield = e.shieldMax; }
  if (kind === 'boss5') { e.shieldMax = hp * 0.15; e.shield = e.shieldMax; }
  place(e);
  s.rt.enemies.push(e);
  return e;
}
function place(e: Enemy) {
  if (e.pirate) return;
  if (e.air) {
    const f = Math.max(0, Math.min(1, e.p / PLEN));
    const a = PATH[0], b = PATH[PATH.length - 1];
    e.x = a[0] + (b[0] - a[0]) * f + Math.sin(f * 40 + e.id) * 8 + e.lane * 10;
    e.y = a[1] + (b[1] - a[1]) * f;
    e.ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
  } else {
    const q = pathPos(e.p, e.lane * 13);
    e.x = q.x; e.y = q.y; e.ang = q.ang;
  }
}

function killEnemy(s: G, e: Enemy, silent = false) {
  if (e.dead) return;
  e.dead = true;
  const def = EDEF[e.kind];
  const boss = e.kind.startsWith('boss');
  fx(s, 'boom', e.x, e.y, { r: boss ? 70 : def.size * 2.2, life: boss ? 0.9 : 0.45, color: e.air ? '#fde68a' : '#fb923c' });
  if (silent) return;
  const b = s.rt.battle;
  const bounty = ENEMY_BOUNTY(def.bounty, e.E) * e.bountyMul;
  addUsd(s, bounty);
  floater(s, e.x, e.y - 8, '+$' + fmt(bounty), '#facc15', boss ? 18 : 12);
  play('boom');
  if (e.pirate) {
    s.security = Math.min(100, s.security + 2);
    toast(s, 'دزد دریایی منهدم شد: +۵۰ دلار، +۲ امنیت');
  }
  if (b && e.battle) {
    b.kills++; b.earned += bounty;
    if (boss) {
      s.chests++; b.lastBossKilled = true;
      toast(s, `غول‌آخر «${def.name}» نابود شد! 🎁 صندوقچه غنائم`);
      haptic([80, 40, 120]); s.rt.shake = 0.6;
    }
  }
}

export function hitEnemy(s: G, e: Enemy, dmg: number, o: { ap?: boolean; crit?: boolean; show?: boolean } = {}) {
  if (e.dead) return;
  if (e.armorBreak > 0) dmg *= 1.3;
  const def = EDEF[e.kind];
  if (!o.ap && def.armor > 0) dmg *= 1 - def.armor;
  if (e.shield > 0) { const a = Math.min(e.shield, dmg); e.shield -= a; dmg -= a; }
  e.hp -= dmg; e.hit = 0.1;
  if (o.crit || o.show) floater(s, e.x, e.y - 12, fmt(dmg), o.crit ? '#fde047' : '#fecaca', o.crit ? 15 : 12);
  if (e.hp <= 0) killEnemy(s, e);
}

function splash(s: G, x: number, y: number, r: number, dmg: number, o: { ap?: boolean; stun?: number; burn?: number; airOK?: boolean; show?: boolean; bossMul?: number } = {}) {
  fx(s, 'ring', x, y, { r, life: 0.35, color: o.burn ? '#f97316' : '#fbbf24' });
  for (const e of s.rt.enemies) {
    if (e.dead || (e.hidden && !e.revealed)) continue;
    if (e.air && !o.airOK) continue;
    const d = dist(x, y, e.x, e.y);
    if (d > r + EDEF[e.kind].size * 0.5) continue;
    const boss = e.kind.startsWith('boss');
    const m = boss && o.bossMul ? o.bossMul : 1;
    hitEnemy(s, e, dmg * m * (d < r * 0.5 ? 1 : 0.75), { ap: o.ap, show: o.show });
    if (o.stun && !e.dead && !boss) e.stun = Math.max(e.stun, o.stun);
    if (o.burn && !e.dead) { e.burn = o.burn; e.fx = Math.max(e.fx, dmg * 0.25); }
  }
}

function leak(s: G, e: Enemy) {
  e.dead = true;
  const def = EDEF[e.kind];
  const b = s.rt.battle;
  s.security = Math.max(0, s.security - def.leak * (b && e.battle ? 1 : 2));
  if (b && e.battle && !b.over) {
    b.hearts = Math.max(0, b.hearts - def.leak);
    toast(s, `⚠️ ${def.name} از خط دفاع عبور کرد! -${def.leak} ❤️`);
    play('leak'); haptic(200); s.rt.shake = 0.4;
    if (b.hearts <= 0) endBattle(s, false);
  } else if (!e.battle) {
    toast(s, `${def.name} به بندر رسید! امنیت تنگه کاهش یافت`);
    play('leak');
  }
  fx(s, 'boom', e.x, e.y, { r: 40, color: '#ef4444' });
}

// ---------- موج‌ها ----------
function computeE(b: Battle, w: number) {
  if (b.mode === 'campaign') return 0.75 * (b.op - 1) + 0.35 * w;
  if (b.mode === 'infinite') return 0.9 * w;
  const ch = CHALLENGES.find((c) => c.id === b.chId)!;
  return ch.E0 + 0.5 * w;
}
function bossFor(b: Battle, w: number): EKind | null {
  if (b.mode === 'campaign') return b.op % 5 === 0 && w === b.total ? BOSS_KINDS[b.op / 5 - 1] : null;
  if (b.mode === 'infinite') return w % 5 === 0 ? BOSS_KINDS[(w / 5 - 1) % 5] : null;
  return w === b.total ? BOSS_KINDS[b.chId % 3] : null;
}
function buildWave(E: number, boss: EKind | null, bm: number): Queued[] {
  const q: Queued[] = [];
  let budget = 8 + 2.2 * E;
  let t = 1;
  if (boss) { q.push({ t: 1, kind: boss, lane: 0, boss: true, bm }); budget *= 0.45; t = 4; }
  const pool: [EKind, number, number][] = [['speed', 4, 0], ['corv', 3, 1.5], ['air', 3, 2.5], ['sub', 2, 4], ['dest', 1.6, 6]];
  const av = pool.filter((p) => E >= p[2]);
  const tw = av.reduce((a, b) => a + b[1], 0);
  while (budget > 0 && q.length < 90) {
    let r = rnd() * tw, k: EKind = 'speed';
    for (const p of av) { r -= p[1]; if (r <= 0) { k = p[0]; break; } }
    budget -= EDEF[k].cost;
    q.push({ t, kind: k, lane: Math.floor(rnd() * 3) - 1, boss: false, bm });
    t += 0.7 + rnd() * 0.7;
  }
  return q;
}

export function startBattle(s: G, mode: BattleMode, arg = 1): boolean {
  if (s.rt.battle) return false;
  let b: Battle;
  const base = { wave: 0, hearts: 20, queue: [], timer: 8, clock: 0, kills: 0, earned: 0, early: false, over: '' as const, E: 0, lastBossKilled: false, reward: '' };
  if (mode === 'campaign') {
    b = { ...base, mode, op: arg, chId: 0, total: opWaves(arg), weather: opWeather(arg), rangeMul: 1, ban: [] };
  } else if (mode === 'infinite') {
    b = { ...base, mode, op: 0, chId: 0, total: 9999, weather: 'clear', rangeMul: 1, ban: [] };
  } else {
    const ch = CHALLENGES.find((c) => c.id === arg)!;
    b = { ...base, mode, op: 0, chId: arg, total: ch.waves, weather: ch.weather, rangeMul: ch.rangeMul, ban: ch.ban };
  }
  b.E = computeE(b, 1);
  const rt = s.rt;
  rt.battle = b; rt.spellCd = [0, 0, 0]; rt.over = 0; rt.enemies = rt.enemies.filter((e) => e.pirate);
  rt.projs = []; rt.eprojs = []; rt.mines = [];
  initHeroes(s);
  toast(s, 'نبرد آغاز شد! برجک‌ها را آماده کنید');
  play('alert'); haptic(100);
  return true;
}

function nextWave(s: G, early: boolean) {
  const b = s.rt.battle!;
  const w = b.wave + 1;
  b.wave = w;
  b.E = computeE(b, w);
  const boss = bossFor(b, w);
  const bm = early ? 1.25 : 1;
  b.queue = buildWave(b.E, boss, bm);
  if (early) {
    const sum = b.queue.reduce((a, q) => a + ENEMY_BOUNTY(EDEF[q.kind].bounty, b.E), 0) * 0.25;
    addUsd(s, sum); s.ord += 20 + 5 * b.E;
    toast(s, `فراخوانی زودهنگام! +${fmt(sum)} دلار و مهمات`);
  }
  toast(s, boss ? `☠️ موج ${w}: ${EDEF[boss].name}!` : `🌊 موج ${w}${b.mode === 'infinite' ? '' : '/' + b.total}`);
  if (boss) { play('alert'); haptic([100, 50, 100]); }
  b.timer = 25;
}
export function callWaveEarly(s: G) {
  const b = s.rt.battle;
  if (!b || b.over) return false;
  if (b.queue.length > 0) return false;
  if (b.mode !== 'infinite' && b.wave >= b.total) return false;
  nextWave(s, true);
  return true;
}

export function endBattle(s: G, win: boolean) {
  const b = s.rt.battle;
  if (!b || b.over) return;
  b.over = win ? 'win' : 'lose';
  let r = '';
  if (b.mode === 'campaign') {
    if (win) {
      const usd = 800 * Math.pow(1.3, b.op);
      addUsd(s, usd);
      r = `+${fmt(usd)} دلار`;
      if (b.op > s.done) { s.done = b.op; s.chests += b.op % 5 === 0 ? 2 : 1; r += ' • 🎁 صندوقچه غنائم'; }
      if (b.op === CAMPAIGN_OPS) r += ' • پایان کمپین!';
    }
  } else if (b.mode === 'challenge') {
    if (win) {
      const usd = 15000 * b.chId;
      addUsd(s, usd); r = `+${fmt(usd)} دلار`;
      if (!s.chDone.includes(b.chId)) { s.chDone.push(b.chId); s.chests += 2; r += ' • 🎁 ۲ صندوقچه (فناوری کمیاب)'; }
    }
  } else {
    const w = Math.max(0, b.wave - 1);
    if (w > s.bestWave) s.bestWave = w;
    const usd = 300 * Math.pow(1.17, w);
    addUsd(s, usd);
    const ch = Math.floor(w / 10);
    s.chests += ch;
    r = `مقاومت تا موج ${w} • +${fmt(usd)} دلار` + (ch ? ` • 🎁 ×${ch}` : '');
    postScore(s, w);
  }
  b.reward = r;
  play(win ? 'win' : 'lose'); haptic(win ? [60, 40, 60] : 300);
}
function postScore(s: G, wave: number) {
  if (wave < 1 || typeof fetch === 'undefined') return;
  fetch('/api/scores', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: s.name.slice(0, 20), wave }) }).catch(() => {});
}
export function closeBattle(s: G) {
  const rt = s.rt;
  rt.battle = null;
  rt.enemies = rt.enemies.filter((e) => e.pirate);
  rt.projs = []; rt.eprojs = []; rt.mines = rt.mines.filter((m) => m.owner !== 'spell'); rt.over = 0;
  for (const bt of rt.boats) { bt.hp = bt.maxHp; bt.respawn = 0; bt.eng = 0; }
}
export function abortBattle(s: G) {
  const b = s.rt.battle;
  if (!b) return;
  if (!b.over) endBattle(s, false);
  closeBattle(s);
}

// ---------- گام اصلی ----------
export function tick(s: G, rdt: number) {
  rdt = Math.min(rdt, 0.25);
  let rem = rdt * s.speed;
  while (rem > 1e-6) {
    const dt = Math.min(0.1, rem);
    rem -= dt;
    step(s, dt);
  }
  s.rt.speedMul = s.speed;
}

function step(s: G, dt: number) {
  const rt = s.rt;
  const d = derive(s);
  s.clock += dt;
  econTick(s, dt, d);
  rt.incWin += dt;
  if (rt.incWin >= 2) { rt.incRate = rt.incAcc / rt.incWin; rt.incAcc = 0; rt.incWin = 0; }
  if (rt.shake > 0) rt.shake -= dt;
  if (rt.over > 0) rt.over -= dt;
  rt.spellCd = rt.spellCd.map((c) => Math.max(0, c - dt));
  if (rt.blocked) { rt.alertT -= dt; if (rt.alertT <= 0) { play('alert'); rt.alertT = 6; } }

  const stats: Record<string, TStats> = {};
  for (const id in s.towers) stats[id] = towerStats(s, s.towers[id], d);
  updateAuras(s);
  updateReveal(s, stats);
  updateBattle(s, dt);
  updateEnemies(s, dt, d, stats);
  updateTowers(s, dt, d, stats);
  updateBoats(s, dt, stats);
  updateProjs(s, dt, stats);
  updateHeroes(s, dt);
  updateTrade(s, dt, d, stats);
  updateEvents(s, dt, d);
  updateSpells(s, dt);

  for (const f of rt.floaters) { f.t += dt; f.y -= 18 * dt; }
  rt.floaters = rt.floaters.filter((f) => f.t < f.life);
  for (const f of rt.fx) f.t += dt;
  rt.fx = rt.fx.filter((f) => f.t < f.life);
  for (const t of rt.toasts) t.t -= dt;
  rt.toasts = rt.toasts.filter((t) => t.t > 0);
  rt.enemies = rt.enemies.filter((e) => !e.dead);
}

function updateAuras(s: G) {
  const rt = s.rt;
  const boss4 = rt.enemies.find((e) => e.kind === 'boss4' && !e.dead && e.disabled <= 0);
  for (const id in s.towers) {
    const t = s.towers[id], sl = slotOf(id);
    t.aura = 0; t.jam = 0;
    const c = rt.hero.cat;
    if (c && s.heroDep.includes('cat') && dist(c.x, c.y, sl.x, sl.y) < 175) t.aura = 0.2;
    if (boss4 && dist(boss4.x, boss4.y, sl.x, sl.y) < 190) t.jam = 1;
  }
}

function updateReveal(s: G, stats: Record<string, TStats>) {
  const rt = s.rt;
  for (const e of rt.enemies) e.revealed = false;
  const srcs: [number, number, number][] = [];
  for (const id in s.towers) {
    const t = s.towers[id];
    if (t.kind === 'ew' || t.kind === 'boat') {
      if (t.dis > 0) continue;
      const sl = slotOf(id);
      srcs.push([sl.x, sl.y, stats[id].range * (t.kind === 'boat' ? 0.8 : 1)]);
    }
  }
  const sh = rt.hero.sub;
  if (sh && s.heroDep.includes('sub')) srcs.push([sh.x, sh.y, 170]);
  for (const e of rt.enemies) {
    if (!(e.kind === 'sub' || e.kind === 'boss2')) continue;
    for (const [x, y, r] of srcs) if (dist(x, y, e.x, e.y) < r) { e.revealed = true; break; }
    e.hidden = (e.kind === 'sub' || e.p < PLEN * 0.5) && !e.revealed;
  }
}

function updateBattle(s: G, dt: number) {
  const b = s.rt.battle;
  if (!b || b.over) return;
  b.clock += dt;
  if (b.queue.length) {
    for (const q of b.queue) q.t -= dt;
    const due = b.queue.filter((q) => q.t <= 0);
    if (due.length) {
      b.queue = b.queue.filter((q) => q.t > 0);
      for (const q of due) {
        const e = mkEnemy(s, q.kind, b.E - (q.boss ? 0 : 0), { lane: q.lane, battle: true, bm: q.bm });
        if (q.boss) { fx(s, 'ring', e.x, e.y, { r: 90, life: 1, color: '#ef4444' }); }
      }
    }
    return;
  }
  const alive = s.rt.enemies.some((e) => e.battle && !e.dead);
  if (b.mode !== 'infinite' && b.wave >= b.total) {
    if (!alive) endBattle(s, true);
    return;
  }
  b.timer -= dt;
  if (b.timer <= 0) {
    if (s.tech.c4 && b.wave > 0) b.hearts = Math.min(20, b.hearts + 1);
    if (s.tech.c4) for (const bt of s.rt.boats) { bt.hp = bt.maxHp; bt.respawn = 0; }
    nextWave(s, false);
  }
}

function updateEnemies(s: G, dt: number, d: Derived, stats: Record<string, TStats>) {
  const rt = s.rt;
  const storm = stormActive(s);
  const list = rt.enemies.slice();
  for (const e of list) {
    if (e.dead) continue;
    const def = EDEF[e.kind];
    if (e.hit > 0) e.hit -= dt;
    if (e.armorBreak > 0) e.armorBreak -= dt;
    if (e.disabled > 0) e.disabled -= dt;
    if (e.burn > 0) { e.burn -= dt; hitEnemy(s, e, e.fx * dt, { ap: true }); if (e.dead) continue; } else e.fx = 0;
    if (e.pirate) { updatePirate(s, e, dt, storm); continue; }
    // سرعت
    let v = def.spd * (1 - Math.min(0.9, e.slow)) * (storm ? 0.8 : 1);
    if (e.stun > 0) { e.stun -= dt; v = 0; }
    if (e.blockedBy > 0) v = 0;
    e.blockedBy = 0; e.slow = 0;
    if (e.hacked > 0) {
      e.hacked -= dt; e.p = Math.max(0, e.p - v * dt * 0.5);
      e.cdB -= dt;
      if (e.cdB <= 0) {
        e.cdB = 0.5;
        let best: Enemy | null = null, bd = 90;
        for (const o of rt.enemies) if (o !== e && !o.dead && !o.air) { const dd = dist(e.x, e.y, o.x, o.y); if (dd < bd) { bd = dd; best = o; } }
        if (best) { hitEnemy(s, best, 30 * Math.pow(1.22, e.E), { ap: true }); fx(s, 'line', e.x, e.y, { x2: best.x, y2: best.y, color: '#a78bfa', life: 0.15 }); }
      }
      if (e.hacked <= 0) killEnemy(s, e, true);
    } else e.p += v * dt;
    place(e);
    // توانایی‌ها
    if (e.disabled <= 0 && e.stun <= 0) abilities(s, e, dt, stats);
    // شکار تانکر
    const ev = rt.ev;
    if (e.hunt && ev && ev.type === 'escort' && e.p >= ev.p - 20) {
      ev.hp -= ev.maxHp * 0.1; fx(s, 'boom', e.x, e.y, { r: 30, color: '#ef4444' });
      toast(s, '🛢️ نفتکش VIP آسیب دید!'); haptic(120);
      e.dead = true; continue;
    }
    if (e.p >= PLEN) leak(s, e);
  }
  void d;
}

function abilities(s: G, e: Enemy, dt: number, stats: Record<string, TStats>) {
  const rt = s.rt;
  e.cdA -= dt;
  if (e.kind === 'boss1' && e.cdA <= 0) {
    e.cdA = 10;
    for (let i = 0; i < 4; i++) mkEnemy(s, 'speed', Math.max(0, e.E - 2), { p: e.p - i * 12, lane: (i % 3) - 1, battle: e.battle });
    for (let i = 0; i < 2; i++) mkEnemy(s, 'air', Math.max(0, e.E - 2), { p: e.p, lane: i, battle: e.battle });
    fx(s, 'ring', e.x, e.y, { r: 60, life: 0.6, color: '#fca5a5' });
  } else if (e.kind === 'boss2' && e.cdA <= 0) {
    e.cdA = 8;
    let best = '', bd = 320;
    for (const id in s.towers) { const sl = slotOf(id); const dd = dist(e.x, e.y, sl.x, sl.y); if (dd < bd && s.towers[id].dis <= 0) { bd = dd; best = id; } }
    if (best) rt.eprojs.push({ x: e.x, y: e.y, slot: best, speed: 160 });
  } else if (e.kind === 'boss3') {
    e.cdB -= dt;
    if (e.cdB <= 0) { e.cdB = 15; e.shield = e.shieldMax; fx(s, 'ring', e.x, e.y, { r: 50, life: 0.6, color: '#38bdf8' }); }
  } else if (e.kind === 'boss4' && e.cdA <= 0) {
    e.cdA = 12;
    for (let i = 0; i < 5; i++) mkEnemy(s, 'air', Math.max(0, e.E - 2.5), { p: e.p + i * 4, lane: (i % 3) - 1, battle: e.battle });
  } else if (e.kind === 'boss5' && e.cdA <= 0) {
    e.cdA = 10;
    for (const l of [-1, 0, 1]) mkEnemy(s, l === 0 ? 'dest' : 'corv', Math.max(0, e.E - 3.5), { p: e.p - 20, lane: l, battle: e.battle });
    mkEnemy(s, 'air', Math.max(0, e.E - 3.5), { p: e.p, battle: e.battle });
  } else if (e.kind === 'dest') {
    // ایجیس: شمارنده در updateProjs
    if (e.cdA < 0) e.cdA = 0;
  }
  void stats;
}

function updatePirate(s: G, e: Enemy, dt: number, storm: boolean) {
  const rt = s.rt;
  let ship = rt.trade.find((x) => x.id === e.tgt && !x.dead);
  if (!ship) {
    const alive = rt.trade.filter((x) => !x.dead);
    if (!alive.length) { e.dead = true; return; }
    ship = alive[Math.floor(rnd() * alive.length)];
    e.tgt = ship.id;
  }
  const dx = ship.x - e.x, dy = ship.y - e.y, dd = Math.hypot(dx, dy);
  if (e.stun > 0) { e.stun -= dt; return; }
  if (dd > 22) {
    const v = EDEF.pirate.spd * (1 - Math.min(0.9, e.slow)) * (storm ? 0.8 : 1);
    e.x += (dx / dd) * v * dt; e.y += (dy / dd) * v * dt; e.ang = Math.atan2(dy, dx);
  } else {
    e.loot += dt;
    if (e.loot > 2.5) {
      ship.dead = true; ship.plunder = 1;
      s.security = Math.max(0, s.security - 15);
      toast(s, '🏴‍☠️ دزدان دریایی یک کشتی تجاری را غارت کردند! -۱۵ امنیت');
      fx(s, 'boom', ship.x, ship.y, { r: 40, color: '#ef4444' });
      haptic(150); play('leak');
      e.dead = true;
    }
  }
  e.slow = 0;
}

// ---------- برجک‌ها ----------
function canTarget(e: Enemy, st: TStats) {
  if (e.dead || (e.hidden && !e.revealed)) return false;
  return e.air ? st.air : st.sea;
}
function candidates(s: G, x: number, y: number, st: TStats): Enemy[] {
  const out: Enemy[] = [];
  for (const e of s.rt.enemies) if (canTarget(e, st) && dist(x, y, e.x, e.y) <= st.range + 4) out.push(e);
  return out;
}
function pick(c: Enemy[], prio: number): Enemy | null {
  if (!c.length) return null;
  let best = c[0];
  const score = (e: Enemy) => (prio === 1 ? e.hp : prio === 2 ? -e.hp : prio === 3 ? (e.air ? 1e6 : 0) + e.p : e.pirate ? 5000 : e.p);
  let bs = score(best);
  for (const e of c) { const sc = score(e); if (sc > bs) { bs = sc; best = e; } }
  return best;
}

function updateTowers(s: G, dt: number, d: Derived, stats: Record<string, TStats>) {
  const rt = s.rt;
  const critBase = s.tech.t7 ? 0.1 : 0;
  for (const id in s.towers) {
    const t = s.towers[id], st = stats[id], sl = slotOf(id);
    if (t.flash > 0) t.flash -= dt;
    if (t.dis > 0) { t.dis -= dt; continue; }
    if (st.mode === 'boats') {
      if (t.sp === 2) {
        t.mineCd -= dt;
        const mine = rt.mines.filter((m) => m.owner === id).length;
        if (t.mineCd <= 0 && mine < 4 && rt.enemies.some((e) => !e.air && !e.dead && dist(sl.x, sl.y, e.x, e.y) < st.range * 1.4)) {
          t.mineCd = 5;
          const p = Math.max(10, Math.min(PLEN - 10, stationP(id) + (rnd() - 0.5) * 140));
          const q = pathPos(p);
          rt.mines.push({ p, x: q.x, y: q.y, dmg: st.dmg * 7, owner: id });
        }
      }
      continue;
    }
    if (st.mode === 'ew') {
      const slow = (t.sp === 1 ? 0.6 : 0.35) * d.grid;
      for (const e of rt.enemies) {
        if (e.dead || (e.hidden && !e.revealed) || dist(sl.x, sl.y, e.x, e.y) > st.range) continue;
        e.slow = Math.max(e.slow, slow);
        if (t.sp === 1) e.disabled = Math.max(e.disabled, 0.3);
        if (t.sp === 2 && e.air && e.hacked <= 0 && !e.kind.startsWith('boss') && rnd() < dt * 0.6) { e.hacked = 6; fx(s, 'line', sl.x, sl.y, { x2: e.x, y2: e.y, color: '#a78bfa', life: 0.25 }); }
      }
      continue;
    }
    // رهگیری موشک (فالانکس / S-400)
    if ((t.kind === 'auto' || t.kind === 'aa') && t.sp === 1) {
      t.icd -= dt;
      if (t.icd <= 0) {
        const i = rt.eprojs.findIndex((p) => dist(sl.x, sl.y, p.x, p.y) < st.range);
        if (i >= 0) { const p = rt.eprojs[i]; fx(s, 'line', sl.x, sl.y, { x2: p.x, y2: p.y, color: '#fde047', life: 0.12 }); fx(s, 'boom', p.x, p.y, { r: 14 }); rt.eprojs.splice(i, 1); t.icd = 0.3; }
      }
    }
    const c = candidates(s, sl.x, sl.y, st);
    const tg = pick(c, t.prio);
    if (!tg) { t.laserId = 0; t.laserT = 0; t.cd = Math.min(t.cd, 0); continue; }
    t.ang = Math.atan2(tg.y - sl.y, tg.x - sl.x);
    if (st.mode === 'hel') {
      if (t.laserId === tg.id) t.laserT += dt; else { t.laserId = tg.id; t.laserT = 0; }
      const ramp = Math.min(5, 1 + t.laserT);
      hitEnemy(s, tg, st.dmg * st.rate * ramp * dt, { ap: true });
      fx(s, 'line', sl.x, sl.y, { x2: tg.x, y2: tg.y, color: ramp > 3 ? '#fb7185' : '#f472b6', life: 0.06 });
      continue;
    }
    // مهمات
    const free = rt.over > 0;
    const ammoOK = free || st.ammo <= 0 || s.ord >= st.ammo;
    t.cd -= dt * (ammoOK ? 1 : 1 / 3);
    let guard = 0;
    while (t.cd <= 0 && guard++ < 4) {
      if (!free && st.ammo > 0 && s.ord >= st.ammo) s.ord -= st.ammo;
      t.cd += 1 / Math.max(0.05, st.rate);
      t.flash = 0.1;
      const crit = rnd() < critBase + (t.kind === 'cruise' && t.sp === 1 ? 0.4 : 0);
      fire(s, t, st, sl.x, sl.y, tg, c, crit);
    }
  }
  void d;
}

function mkProj(s: G, x: number, y: number, tx: number, ty: number, tid: number, kind: Proj['kind'], o: Partial<Proj>) {
  s.rt.projs.push({ x, y, tx, ty, tid, speed: 280, dmg: 1, splash: 0, ap: true, missile: kind === 'missile', ign: false, stun: 0, burn: 0, color: '#fff', crit: false, ang: 0, show: false, kind, life: 6, ...o });
}

function fire(s: G, t: Tower, st: TStats, x: number, y: number, tg: Enemy, cands: Enemy[], crit: boolean) {
  const cm = crit ? 2 : 1;
  const col = TDEF[t.kind].color;
  switch (st.mode) {
    case 'bullet':
      hitEnemy(s, tg, st.dmg * cm, { crit });
      fx(s, 'line', x, y, { x2: tg.x, y2: tg.y, color: col, life: 0.07 });
      play('shot');
      break;
    case 'beam':
      hitEnemy(s, tg, st.dmg * cm * (tg.air ? 1.5 : 1), { crit });
      fx(s, 'line', x, y, { x2: tg.x, y2: tg.y, color: col, life: 0.08 });
      play('shot');
      break;
    case 'shell':
      mkProj(s, x, y, tg.x, tg.y, 0, 'shell', { speed: 240, dmg: st.dmg * cm, splash: st.splash, stun: t.sp === 2 ? 2 : 0, color: col, show: true, crit });
      play('boom');
      break;
    case 'rockets':
      for (let i = 0; i < 12; i++) {
        const a = rnd() * 6.28, r = rnd() * 50;
        mkProj(s, x, y, tg.x + Math.cos(a) * r, tg.y + Math.sin(a) * r, 0, 'rocket', { speed: 260 + rnd() * 80, dmg: st.dmg, splash: st.splash, burn: 3, color: '#fb923c' });
      }
      play('boom');
      break;
    case 'missile': {
      const hyper = t.kind === 'cruise' && t.sp === 1;
      mkProj(s, x, y, tg.x, tg.y, tg.id, 'missile', { speed: hyper ? 800 : 320, dmg: st.dmg * cm, splash: st.splash, ign: hyper, color: col, show: true, crit, ap: true });
      play('shot');
      break;
    }
    case 'swarm': {
      const sorted = cands.slice().sort((a, b) => b.p - a.p);
      for (let i = 0; i < 4; i++) {
        const e = sorted[i % sorted.length];
        mkProj(s, x, y, e.x, e.y, e.id, 'missile', { speed: 300, dmg: st.dmg * cm, color: col, show: true, crit, ang: i });
      }
      play('shot');
      break;
    }
    case 'rail': {
      const dx = Math.cos(t.ang), dy = Math.sin(t.ang);
      const len = st.range * 1.1;
      let n = 0;
      const sorted = s.rt.enemies.filter((e) => canTarget(e, st)).sort((a, b) => dist(x, y, a.x, a.y) - dist(x, y, b.x, b.y));
      for (const e of sorted) {
        const ex = e.x - x, ey = e.y - y;
        const proj = ex * dx + ey * dy;
        if (proj < 0 || proj > len) continue;
        if (Math.abs(ex * dy - ey * dx) > 14) continue;
        hitEnemy(s, e, st.dmg * cm, { ap: true, crit, show: true });
        if (++n >= 5) break;
      }
      fx(s, 'line', x, y, { x2: x + dx * len, y2: y + dy * len, color: '#e0f2fe', life: 0.18 });
      play('shot');
      break;
    }
    default: break;
  }
}

function updateProjs(s: G, dt: number, stats: Record<string, TStats>) {
  const rt = s.rt;
  const byId = new Map<number, Enemy>();
  for (const e of rt.enemies) byId.set(e.id, e);
  const dests = rt.enemies.filter((e) => e.kind === 'dest' && !e.dead);
  for (const e of dests) { if (e.cdA > 0) e.cdA -= 0; }
  const keep: Proj[] = [];
  for (const p of rt.projs) {
    p.life -= dt;
    if (p.tid) {
      const e = byId.get(p.tid);
      if (e && !e.dead) { p.tx = e.x; p.ty = e.y; }
    }
    const dx = p.tx - p.x, dy = p.ty - p.y, dd = Math.hypot(dx, dy);
    p.ang = Math.atan2(dy, dx);
    const stepL = p.speed * dt;
    // ایجیس
    if (p.missile && !p.ign) {
      let hit = false;
      for (const e of dests) {
        if (e.cdA <= 0 && e.disabled <= 0 && e.stun <= 0 && dist(e.x, e.y, p.x, p.y) < 90) { e.cdA = 5; hit = true; fx(s, 'line', e.x, e.y, { x2: p.x, y2: p.y, color: '#7dd3fc', life: 0.15 }); fx(s, 'boom', p.x, p.y, { r: 14, color: '#7dd3fc' }); break; }
      }
      if (hit) continue;
    }
    if (dd <= stepL + 3 || p.life <= 0) {
      const e = p.tid ? byId.get(p.tid) : undefined;
      if (p.splash > 0) splash(s, p.tx, p.ty, p.splash, p.dmg, { ap: p.ap, stun: p.stun, burn: p.burn, airOK: p.missile, show: p.show });
      else if (e && !e.dead) hitEnemy(s, e, p.dmg, { ap: p.ap, crit: p.crit, show: p.show });
      fx(s, 'boom', p.tx, p.ty, { r: 16, life: 0.25, color: p.color });
      continue;
    }
    p.x += (dx / dd) * stepL; p.y += (dy / dd) * stepL;
    keep.push(p);
  }
  rt.projs = keep;
  // موشک‌های دشمن
  const ek = [];
  for (const p of rt.eprojs) {
    const sl = slotOf(p.slot), t = s.towers[p.slot];
    if (!t) continue;
    const dx = sl.x - p.x, dy = sl.y - p.y, dd = Math.hypot(dx, dy);
    if (dd < 10) {
      t.dis = 4; fx(s, 'boom', sl.x, sl.y, { r: 30, color: '#ef4444' }); toast(s, 'برجک هدف موشک قرار گرفت و موقتا از کار افتاد'); haptic(80);
      continue;
    }
    p.x += (dx / dd) * p.speed * dt; p.y += (dy / dd) * p.speed * dt;
    ek.push(p);
  }
  rt.eprojs = ek;
  // مین‌ها
  rt.mines = rt.mines.filter((m) => {
    for (const e of rt.enemies) {
      if (e.dead || e.air || e.pirate || (e.hidden && !e.revealed)) continue;
      if (Math.abs(e.p - m.p) < 14) {
        splash(s, m.x, m.y, 48, m.dmg, { ap: true, show: true, bossMul: 0.4 });
        play('boom');
        return false;
      }
    }
    return true;
  });
  void stats;
}

function updateBoats(s: G, dt: number, stats: Record<string, TStats>) {
  const rt = s.rt;
  // همگام‌سازی
  const want: Record<string, number> = {};
  for (const id in s.towers) {
    const t = s.towers[id];
    if (t.kind === 'boat') want[id] = t.sp === 1 ? 5 : t.sp === 2 ? 1 : 3;
  }
  rt.boats = rt.boats.filter((b) => want[b.slot] !== undefined && b.i < want[b.slot]);
  for (const id in want) {
    const have = rt.boats.filter((b) => b.slot === id).length;
    for (let i = have; i < want[id]; i++) {
      rt.boats.push({ id: rt.nextId++, slot: id, i, p: 0, hp: 0, maxHp: 1, respawn: 0.5, eng: 0, x: 0, y: 0, sub: s.towers[id].sp === 2, off: i });
    }
  }
  for (const b of rt.boats) {
    const t = s.towers[b.slot], st = stats[b.slot];
    const n = want[b.slot];
    const sE = rt.battle ? rt.battle.E : s.done * 0.7;
    b.maxHp = (150 + 120 * (t.tier - 1)) * Math.pow(1.13, sE) * (s.tech.t8 ? 1.5 : 1) * (b.sub ? 3 : 1);
    b.p = stationP(b.slot) + (b.i - (n - 1) / 2) * 16;
    const q = pathPos(b.p, (b.i % 2 ? 1 : -1) * 6);
    b.x = q.x; b.y = q.y;
    if (t.dis > 0) continue;
    if (b.respawn > 0) { b.respawn -= dt; if (b.respawn <= 0) b.hp = b.maxHp; continue; }
    if (b.hp <= 0) { b.respawn = s.tech.c4 ? 1 : 8; b.eng = 0; continue; }
    let e = rt.enemies.find((x) => x.id === b.eng);
    if (!e || e.dead || Math.abs(e.p - b.p) > 30 || e.air) {
      e = undefined; b.eng = 0;
      for (const o of rt.enemies) {
        if (o.dead || o.air || o.pirate || (o.hidden && !o.revealed)) continue;
        if (o.kind.startsWith('boss') && !b.sub) continue;
        if (Math.abs(o.p - b.p) < 26 && dist(o.x, o.y, b.x, b.y) < 60) { e = o; b.eng = o.id; break; }
      }
    }
    if (e) {
      if (!e.kind.startsWith('boss')) e.blockedBy = b.id;
      const boss = e.kind.startsWith('boss');
      const dps = st.dmg * (b.sub && boss ? 3 : 1) * (1 + t.aura);
      hitEnemy(s, e, dps * dt, { ap: t.sp === 1 || b.sub });
      if (e.disabled <= 0) b.hp -= b.maxHp * (boss ? 0.3 : 0.16) * dt;
      if (rnd() < dt * 3) fx(s, 'spark', (b.x + e.x) / 2, (b.y + e.y) / 2, { life: 0.2, color: t.sp === 1 ? '#67e8f9' : '#fde047' });
    }
  }
}

function updateHeroes(s: G, dt: number) {
  const rt = s.rt;
  const E = heroE(s);
  const bm = 1 + 0.2 * s.badges;
  for (const id of s.heroDep) {
    const h = rt.hero[id];
    if (!h) continue;
    const dx = h.tx - h.x, dy = h.ty - h.y, dd = Math.hypot(dx, dy);
    if (dd > 3) { const v = Math.min(dd, 85 * dt); h.x += (dx / dd) * v; h.y += (dy / dd) * v; h.ang = Math.atan2(dy, dx); }
    h.cd -= dt;
    if (id === 'cat' && h.cd <= 0) {
      let best: Enemy | null = null, bd = 290;
      for (const e of rt.enemies) if (!e.dead && !(e.hidden && !e.revealed)) { const q = dist(h.x, h.y, e.x, e.y); if (q < bd) { bd = q; best = e; } }
      if (best) { h.cd = 3; mkProj(s, h.x, h.y, best.x, best.y, best.id, 'missile', { speed: 340, dmg: 90 * Math.pow(1.2, E) * bm, color: '#67e8f9', show: true }); }
    } else if (id === 'drone' && h.cd <= 0) {
      let best: Enemy | null = null;
      for (const e of rt.enemies) if (!e.dead && !e.pirate && !(e.hidden && !e.revealed) && (!best || e.hp > best.hp)) best = e;
      if (best) {
        h.cd = 15;
        for (let i = 0; i < 5; i++) mkProj(s, h.x + (i - 2) * 6, h.y, best.x, best.y, best.id, 'drone', { speed: 260 + i * 20, dmg: 110 * Math.pow(1.2, E) * bm, color: '#fde68a', show: true });
        toast(s, '🛩️ موج پهپادهای انتحاری!');
      }
    } else if (id === 'sub') {
      for (const e of rt.enemies) if (!e.dead && dist(h.x, h.y, e.x, e.y) < 170) e.armorBreak = 0.5;
      if (h.cd <= 0) {
        let best: Enemy | null = null, bd = 190;
        for (const e of rt.enemies) if (!e.dead) { const q = dist(h.x, h.y, e.x, e.y) - (e.kind.startsWith('boss') ? 60 : 0); if (q < bd) { bd = q; best = e; } }
        if (best) { h.cd = 2; hitEnemy(s, best, 60 * Math.pow(1.2, E) * bm * (best.kind.startsWith('boss') ? 2 : 1), { ap: true, show: true }); fx(s, 'line', h.x, h.y, { x2: best.x, y2: best.y, color: '#34d399', life: 0.2 }); }
      }
    }
  }
}

// ---------- تجارت ----------
function updateTrade(s: G, dt: number, d: Derived, stats: Record<string, TStats>) {
  const rt = s.rt;
  const storm = stormActive(s);
  rt.tradeT -= dt;
  if (rt.tradeT <= 0) {
    rt.tradeT = 15 - 0.1 * s.security;
    const ok = SHIPS.map((x, i) => ({ x, i })).filter((o) => s.security >= o.x.minS);
    const tw = ok.reduce((a, o) => a + o.x.w, 0);
    let r = rnd() * tw, cls = 0;
    for (const o of ok) { r -= o.x.w; if (r <= 0) { cls = o.i; break; } }
    const p = lanePos(0);
    rt.trade.push({ id: rt.nextId++, cls, d: 0, x: p.x, y: p.y, ang: p.ang, paid: false, smug: s.lv.optical > 0 && rnd() < 0.2, dead: false, plunder: 0, claimed: false });
  }
  for (const sh of rt.trade) {
    if (sh.dead) continue;
    sh.d += SHIPS[sh.cls].speed * (storm ? 0.8 : 1) * dt;
    const p = lanePos(sh.d);
    sh.x = p.x; sh.y = p.y; sh.ang = p.ang;
    if (!sh.paid && sh.x >= CUSTOMS_X) {
      sh.paid = true;
      const toll = SHIPS[sh.cls].toll * d.tollMul;
      addUsd(s, toll);
      floater(s, sh.x, sh.y - 10, '+$' + fmt(toll), '#4ade80', 12);
      play('coin');
    }
  }
  rt.trade = rt.trade.filter((x) => !x.dead && x.d < LLEN + 20);
  rt.pirateT -= dt;
  if (rt.pirateT <= 0) {
    rt.pirateT = Math.max(10, 32 - 0.12 * s.security + rnd() * 10);
    if (rt.trade.length && rt.enemies.filter((e) => e.pirate).length < 3) {
      const bay = BAYS[Math.floor(rnd() * BAYS.length)];
      const e = mkEnemy(s, 'pirate', s.done * 0.25);
      e.pirate = true; e.x = bay[0]; e.y = bay[1];
      toast(s, '🏴‍☠️ دزدان دریایی از خلیج مخفی خارج شدند!');
    }
  }
  rt.guardT -= dt;
  if (rt.guardT <= 0) {
    rt.guardT = 8 / (s.tech.c8 ? 2 : 1);
    for (const e of rt.enemies) {
      if (!e.pirate || e.dead) continue;
      let covered = false;
      for (const id in s.towers) { const sl = slotOf(id); const st = stats[id]; if (st.sea && st.mode !== 'ew' && dist(sl.x, sl.y, e.x, e.y) < st.range) { covered = true; break; } }
      if (!covered) { fx(s, 'ring', e.x, e.y, { r: 30, color: '#38bdf8', life: 0.5 }); killEnemy(s, e); break; }
    }
  }
}

// ---------- رویدادها ----------
function updateEvents(s: G, dt: number, d: Derived) {
  const rt = s.rt;
  if (!rt.ev) {
    rt.evT -= dt;
    if (rt.evT <= 0) {
      rt.evT = 170 + rnd() * 140;
      const opts: ('spill' | 'storm' | 'escort')[] = ['storm'];
      if (s.lv.oil > 0) opts.push('spill');
      if (!rt.battle && s.done >= 1) opts.push('escort');
      const type = opts[Math.floor(rnd() * opts.length)];
      if (type === 'spill') {
        rt.ev = { type, t: 60, x: STRUCTS.oil.x - 80 + rnd() * 30, y: STRUCTS.oil.y + 30 + rnd() * 60, handled: 0, hp: 0, maxHp: 0, p: 0, spawnT: 0, raiders: 0 };
        toast(s, '🛢️ بحران نشت نفت! ظرف ۶۰ ثانیه روی لکه نفتی بزنید'); play('alert'); haptic(150);
      } else if (type === 'storm') {
        rt.ev = { type, t: 90, x: 0, y: 0, handled: 0, hp: 0, maxHp: 0, p: 0, spawnT: 0, raiders: 0 };
        toast(s, '🌪️ طوفان مونسون! برد اپتیکی -۲۰٪، برق بادی +');
      } else {
        const mh = 1500 * Math.pow(1.1, s.done);
        rt.ev = { type, t: 0, x: 0, y: 0, handled: 0, hp: mh, maxHp: mh, p: 40, spawnT: 1, raiders: 0 };
        toast(s, '🛢️ اسکورت VIP: از سوپرتانکر طلایی محافظت کنید!'); play('alert'); haptic([80, 40, 80]);
      }
    }
    return;
  }
  const ev = rt.ev;
  if (ev.type === 'spill') {
    if (ev.handled > 0) {
      ev.handled -= dt;
      if (ev.handled <= 0) {
        const r = Math.max(500, rt.incRate * 40);
        addUsd(s, r); s.security = Math.min(100, s.security + 3);
        toast(s, `✅ نشت مهار شد! +${fmt(r)} دلار پاداش`); rt.ev = null; rt.evT = 200;
      }
    } else {
      ev.t -= dt;
      if (ev.t <= 0) { s.oil *= 0.7; s.security = Math.max(0, s.security - 5); toast(s, '❌ نشت نفت مهار نشد! ۳۰٪ نفت ذخیره از دست رفت'); rt.ev = null; rt.evT = 200; }
    }
  } else if (ev.type === 'storm') {
    ev.t -= dt; rt.storm = ev.t;
    if (ev.t <= 0) { rt.storm = 0; rt.ev = null; rt.evT = 200; toast(s, 'طوفان فروکش کرد'); }
  } else {
    ev.p += 30 * dt;
    ev.spawnT -= dt;
    if (ev.spawnT <= 0 && ev.raiders < 14) {
      ev.spawnT = 2.5; ev.raiders++;
      const k: EKind = ev.raiders % 4 === 0 ? 'air' : ev.raiders % 5 === 0 ? 'corv' : 'speed';
      mkEnemy(s, k, s.done * 0.6 + 0.5, { hunt: true, bm: 0.5 });
    }
    if (ev.hp <= 0) { toast(s, '💥 نفتکش VIP نابود شد! -۵ امنیت'); s.security = Math.max(0, s.security - 5); rt.ev = null; rt.evT = 200; }
    else if (ev.p >= PLEN) {
      const r = Math.max(5000, rt.incRate * 150);
      addUsd(s, r); s.chests++;
      toast(s, `🏆 نفتکش به مقصد رسید! +${fmt(r)} دلار و 🎁 صندوقچه`); play('win'); rt.ev = null; rt.evT = 220;
    }
  }
  void d;
}
export function tapSpill(s: G, x: number, y: number) {
  const ev = s.rt.ev;
  if (ev && ev.type === 'spill' && ev.handled === 0 && dist(x, y, ev.x, ev.y) < 55) { ev.handled = 5; toast(s, 'کشتی مهار اعزام شد…'); return true; }
  return false;
}
export function tapSmuggler(s: G, x: number, y: number) {
  for (const sh of s.rt.trade) {
    if (sh.smug && !sh.claimed && !sh.dead && dist(x, y, sh.x, sh.y) < 30) {
      sh.claimed = true; sh.smug = false;
      if (rnd() < 0.12) { s.chests++; toast(s, '🔍 قطعات کمیاب کشف شد! 🎁 صندوقچه'); }
      else { const v = 30 + 15 * s.lv.optical; s.steel += v; toast(s, `🔍 محموله قاچاق ضبط شد: +${v} فولاد`); }
      play('coin'); return true;
    }
  }
  return false;
}

// ---------- مهارت‌ها ----------
function updateSpells(s: G, dt: number) {
  const rt = s.rt;
  const E = heroE(s);
  for (const st of rt.strikes) st.t -= dt;
  const due = rt.strikes.filter((x) => x.t <= 0);
  if (due.length) {
    rt.strikes = rt.strikes.filter((x) => x.t > 0);
    for (const k of due) { splash(s, k.x, k.y, 62, k.dmg, { ap: true, show: true, bossMul: 0.4 }); play('boom'); rt.shake = 0.25; }
  }
  void E;
}
export function castSpell(s: G, idx: number, x = 0, y = 0): boolean {
  const rt = s.rt;
  if (!rt.battle || rt.battle.over || rt.spellCd[idx] > 0) return false;
  const E = heroE(s);
  const bm = 1 + 0.2 * s.badges;
  if (idx === 0) {
    for (let i = 0; i < 8; i++) {
      const a = rnd() * 6.28, r = rnd() * 70;
      rt.strikes.push({ t: 0.6 + i * 0.18, x: x + Math.cos(a) * r, y: y + Math.sin(a) * r, dmg: 220 * Math.pow(1.22, E) * bm });
    }
    rt.spellCd[0] = 60;
    fx(s, 'ring', x, y, { r: 80, life: 1, color: '#ef4444' });
  } else if (idx === 1) {
    for (const e of rt.enemies) if (!e.pirate) { e.stun = 6; fx(s, 'ring', e.x, e.y, { r: 25, life: 0.6, color: '#a78bfa' }); }
    const ps = rt.enemies.filter((e) => !e.air && !e.pirate).map((e) => e.p);
    for (let i = 0; i < 10; i++) {
      const base = ps.length ? ps[Math.floor(rnd() * ps.length)] : 300 + rnd() * PLEN * 0.6;
      const p = Math.max(20, Math.min(PLEN - 20, base + 20 + rnd() * 110));
      const q = pathPos(p);
      rt.mines.push({ p, x: q.x, y: q.y, dmg: 160 * Math.pow(1.22, E) * bm, owner: 'spell' });
    }
    rt.spellCd[1] = 90;
    toast(s, '⚡ بمب EMP: دشمنان منجمد شدند و ۱۰ مین ریخته شد');
  } else {
    rt.over = 10; rt.spellCd[2] = 120;
    toast(s, '🔥 اورکلاک شبکه پدافند: ۱۰ ثانیه ×۲ شلیک و مهمات رایگان');
  }
  play('spell'); haptic([60, 30, 90]);
  return true;
}
export function moveHero(s: G, id: HeroId, x: number, y: number) {
  const h = s.rt.hero[id];
  if (!h) return false;
  h.tx = x; h.ty = y;
  return true;
}

// ---------- اقتصاد: خرید و ارتقا ----------
export function structCost(s: G, id: StructId, mode: 1 | 10 | 'max'): { n: number; cost: number } {
  const base = STRUCTS[id].cost;
  let L = s.lv[id], n = 0, cost = 0;
  const limit = mode === 'max' ? 1000 : mode;
  while (n < limit && L < MAX_LEVEL) {
    const c = costOf(base, L + 1);
    if (mode === 'max' ? cost + c > s.usd : false) break;
    cost += c; L++; n++;
  }
  if (mode === 'max' && n === 0 && L < MAX_LEVEL) return { n: 1, cost: costOf(base, L + 1) };
  return { n, cost };
}
export function buyStruct(s: G, id: StructId, mode: 1 | 10 | 'max'): boolean {
  const { n, cost } = structCost(s, id, mode);
  if (n <= 0 || s.usd < cost) { toast(s, 'دلار کافی نیست'); return false; }
  s.usd -= cost; s.lv[id] += n;
  play('build'); haptic(30);
  return true;
}

export const slotUnlocked = (s: G, slotId: string) => { const g = slotOf(slotId).group; return g === 'free' || !!s.islands[g]; };
export function buildTower(s: G, slotId: string, kind: TKind): boolean {
  if (s.towers[slotId]) return false;
  if (!slotUnlocked(s, slotId)) { toast(s, 'این جزیره هنوز آزاد نشده است'); return false; }
  if (s.rt.battle?.ban.includes(kind)) { toast(s, 'این برجک در این چالش ممنوع است'); return false; }
  const d = TDEF[kind];
  if (s.usd < d.usd || s.steel < d.steel) { toast(s, 'دلار یا فولاد کافی نیست'); return false; }
  s.usd -= d.usd; s.steel -= d.steel;
  s.towers[slotId] = { kind, tier: 1, sp: 0, prio: 0, cd: 0, ang: -Math.PI / 2, dis: 0, inv: { usd: d.usd, steel: d.steel }, laserT: 0, laserId: 0, mineCd: 2, icd: 0, aura: 0, jam: 0, flash: 0 };
  play('build'); haptic(30);
  return true;
}
export function upgradeTower(s: G, slotId: string): boolean {
  const t = s.towers[slotId];
  if (!t || t.tier >= 3) return false;
  const c = upgradeCost(t.kind, t.tier);
  if (s.usd < c.usd || s.steel < c.steel) { toast(s, 'منابع کافی نیست'); return false; }
  s.usd -= c.usd; s.steel -= c.steel; t.inv.usd += c.usd; t.inv.steel += c.steel; t.tier++;
  play('build'); haptic(30);
  return true;
}
export function evolveTower(s: G, slotId: string, sp: 1 | 2): boolean {
  const t = s.towers[slotId];
  if (!t || t.tier !== 3) return false;
  if (!s.tech.t5) { toast(s, 'ابتدا فناوری «انشعاب سطح ۴» را در پژوهشگاه باز کنید'); return false; }
  const c = upgradeCost(t.kind, 3);
  if (s.usd < c.usd || s.steel < c.steel) { toast(s, 'منابع کافی نیست'); return false; }
  s.usd -= c.usd; s.steel -= c.steel; t.inv.usd += c.usd; t.inv.steel += c.steel; t.tier = 4; t.sp = sp;
  fx(s, 'ring', slotOf(slotId).x, slotOf(slotId).y, { r: 60, life: 0.8, color: '#fbbf24' });
  toast(s, `⭐ ${SPEC[t.kind][sp - 1].name}`);
  play('spell'); haptic([40, 30, 60]);
  return true;
}
export function sellTower(s: G, slotId: string) {
  const t = s.towers[slotId];
  if (!t) return;
  const f = s.tech.t3 ? 0.8 : 0.5;
  addUsd(s, 0); s.usd += t.inv.usd * f; s.steel += t.inv.steel * f;
  delete s.towers[slotId];
  s.rt.mines = s.rt.mines.filter((m) => m.owner !== slotId);
  play('coin');
}
export function cyclePrio(s: G, slotId: string) { const t = s.towers[slotId]; if (t) t.prio = (t.prio + 1) % 4; }

// ---------- فناوری، جزایر، قهرمانان، صندوقچه ----------
export function techState(s: G, id: string): 'done' | 'open' | 'locked' {
  if (s.tech[id]) return 'done';
  const n = TECH.find((t) => t.id === id)!;
  if (n.idx === 0) return 'open';
  const prev = TECH.find((t) => t.branch === n.branch && t.idx === n.idx - 1)!;
  return s.tech[prev.id] ? 'open' : 'locked';
}
export function buyTech(s: G, id: string): boolean {
  const n = TECH.find((t) => t.id === id);
  if (!n || techState(s, id) !== 'open') return false;
  if (s.usd < n.cost) { toast(s, 'دلار کافی نیست'); return false; }
  s.usd -= n.cost; s.tech[id] = true; play('build'); toast(s, `🔬 ${n.name} تکمیل شد`);
  return true;
}
export function unlockIsland(s: G, key: string): boolean {
  const u = ISLAND_UNLOCK[key];
  if (!u || s.islands[key]) return false;
  if (s.done < u.ops) { toast(s, `ابتدا عملیات ${u.ops} کمپین را کامل کنید`); return false; }
  if (s.usd < u.cost) { toast(s, 'دلار کافی نیست'); return false; }
  s.usd -= u.cost; s.islands[key] = true; play('build'); toast(s, `🏝️ ${u.name} آزاد شد`);
  return true;
}
export function buyHero(s: G, id: HeroId): boolean {
  const h = HEROES[id];
  if (s.heroOwned[id]) return false;
  if (s.usd < h.cost) { toast(s, 'دلار کافی نیست'); return false; }
  s.usd -= h.cost; s.heroOwned[id] = true; play('build');
  return true;
}
export function toggleHero(s: G, id: HeroId) {
  if (!s.heroOwned[id]) return;
  if (s.heroDep.includes(id)) { s.heroDep = s.heroDep.filter((x) => x !== id); delete s.rt.hero[id]; }
  else if (s.heroDep.length >= 2) toast(s, 'حداکثر ۲ فرمانده قابل اعزام است');
  else { s.heroDep.push(id); initHeroes(s); }
}
export function openChest(s: G): TKind[] {
  if (s.chests <= 0) return [];
  s.chests--;
  const got: TKind[] = [];
  for (let i = 0; i < 3; i++) { const k = TKINDS[Math.floor(rnd() * TKINDS.length)]; s.cards[k]++; got.push(k); }
  play('win'); haptic([30, 30, 60]);
  return got;
}
