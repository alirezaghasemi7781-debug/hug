import { WORLD, PATH, LANE, LANDS, SLOTS, STRUCTS, STRUCT_ORDER, TDEF, SPEC, EDEF, SHIPS, HEROES, CUSTOMS_X, BAYS, tierOf, type TKind, type HeroId, type Land } from './data';
import { type G, type Enemy, PLEN, pathPos } from './state';
import { towerStats, stormActive, type Derived } from './econ';

export type Cam = { x: number; y: number; zoom: number };
export type UI = { sel: string | null; prevKind: TKind | null; aim: boolean; aimX: number; aimY: number; heroSel: HeroId | null };

export function darkness(s: G): number {
  const b = s.rt.battle;
  if (b?.weather === 'night') return 0.85;
  const ph = (s.clock % 360) / 360;
  const x = 0.5 + 0.5 * Math.sin(2 * Math.PI * ph - Math.PI / 2);
  let d = Math.max(0, Math.min(0.85, (x - 0.5) * 2.2));
  if (stormActive(s)) d = Math.max(d, 0.35);
  return d;
}

// کانتور جزایر
const blobCache: Record<string, [number, number][]> = {};
function blob(l: Land, k = 1): [number, number][] {
  const key = l.id + k;
  if (blobCache[key]) return blobCache[key];
  let seed = 0;
  for (let i = 0; i < l.id.length; i++) seed = (seed * 31 + l.id.charCodeAt(i)) % 1000;
  const pts: [number, number][] = [];
  const N = 44;
  const c = Math.cos(l.rot ?? 0), s = Math.sin(l.rot ?? 0);
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const n = 1 + 0.07 * Math.sin(a * 3 + seed) + 0.05 * Math.sin(a * 5 + seed * 2) + 0.03 * Math.sin(a * 9 + seed * 3);
    const ux = Math.cos(a) * l.rx * n * k, uy = Math.sin(a) * l.ry * n * k;
    pts.push([l.cx + ux * c - uy * s, l.cy + ux * s + uy * c]);
  }
  return (blobCache[key] = pts);
}
function poly(ctx: CanvasRenderingContext2D, pts: [number, number][]) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
}

const TIER_COL = ['', '#92400e', '#64748b', '#0f766e', '#4f46e5', '#10b981'];

function drawStructure(ctx: CanvasRenderingContext2D, id: string, L: number, x: number, y: number, time: number, dark: number) {
  const def = STRUCTS[id as keyof typeof STRUCTS];
  ctx.save();
  ctx.translate(x, y);
  if (L <= 0) {
    ctx.globalAlpha = 0.45;
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-13, -13, 26, 26);
    ctx.setLineDash([]);
    ctx.font = '15px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(def.icon, 0, 0);
    ctx.restore();
    return;
  }
  const t = tierOf(L);
  const col = TIER_COL[t];
  const sz = 11 + t * 2.5;
  // سکو
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(-sz + 2, -sz + 3, sz * 2, sz * 2);
  ctx.fillStyle = col;
  ctx.strokeStyle = t >= 4 ? '#67e8f9' : '#e5e7eb';
  ctx.lineWidth = t >= 4 ? 2 : 1;
  if (t >= 4) { ctx.shadowColor = '#22d3ee'; ctx.shadowBlur = dark > 0.3 ? 14 : 6; }
  ctx.beginPath();
  ctx.roundRect(-sz, -sz, sz * 2, sz * 2, t >= 5 ? sz : 4);
  ctx.fill(); ctx.stroke();
  ctx.shadowBlur = 0;
  // جزئیات سطح
  if (t >= 2) { ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(-sz + 3, -sz + 3, sz - 3, sz - 3); }
  if (t >= 3 && (id === 'oil' || id === 'refinery')) {
    const fl = 4 + Math.sin(time * 12 + x) * 1.5;
    ctx.fillStyle = '#fb923c';
    ctx.beginPath(); ctx.ellipse(sz - 3, -sz - 5, 3, fl, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#fde047';
    ctx.beginPath(); ctx.ellipse(sz - 3, -sz - 3, 1.5, fl * 0.5, 0, 0, 7); ctx.fill();
  }
  if (t >= 5) {
    ctx.strokeStyle = '#4ade80'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(0, 0, sz + 4 + Math.sin(time * 2) * 1.5, 0, 7); ctx.stroke();
  }
  ctx.font = `${10 + t * 2}px sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  ctx.fillText(def.icon, 0, 1);
  // نشان سطح
  ctx.fillStyle = 'rgba(15,23,42,0.85)';
  ctx.beginPath(); ctx.roundRect(-14, sz + 1, 28, 11, 4); ctx.fill();
  ctx.fillStyle = '#fde047';
  ctx.font = 'bold 9px sans-serif';
  ctx.fillText('L' + L, 0, sz + 6.5);
  ctx.restore();
}

function drawTower(ctx: CanvasRenderingContext2D, kind: TKind, tier: number, sp: number, ang: number, x: number, y: number, flash: number, dis: boolean, zoom: number, time: number) {
  const def = TDEF[kind];
  ctx.save();
  ctx.translate(x, y);
  const r = 11 + tier * 1.5;
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.arc(2, 3, r, 0, 7); ctx.fill();
  const base = ['', '#78716c', '#a8a29e', '#d6d3d1', '#fbbf24'][tier];
  ctx.fillStyle = base;
  ctx.strokeStyle = sp ? '#f59e0b' : '#1f2937';
  ctx.lineWidth = sp ? 3 : 1.5;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill(); ctx.stroke();
  ctx.rotate(ang);
  ctx.fillStyle = def.color;
  ctx.strokeStyle = '#111827';
  ctx.lineWidth = 1;
  switch (kind) {
    case 'auto': ctx.fillRect(2, -4, r + 4, 2.5); ctx.fillRect(2, 1.5, r + 4, 2.5); break;
    case 'how': ctx.fillRect(0, -3.5, r + 7, 7); break;
    case 'cruise': ctx.beginPath(); ctx.roundRect(-r * 0.5, -5, r * 1.3, 10, 3); ctx.fill(); ctx.stroke(); break;
    case 'aa': ctx.beginPath(); ctx.arc(2, 0, 6, -1.2, 1.2); ctx.lineTo(2, 0); ctx.fill(); ctx.fillRect(0, -1, r + 3, 2); break;
    case 'ew': ctx.rotate(-ang + time * 2); ctx.fillRect(-1.5, -r * 0.8, 3, r * 1.6); ctx.beginPath(); ctx.arc(0, 0, 4, 0, 7); ctx.fill(); break;
    case 'boat': ctx.beginPath(); ctx.moveTo(-6, -5); ctx.lineTo(8, 0); ctx.lineTo(-6, 5); ctx.closePath(); ctx.fill(); break;
  }
  ctx.rotate(-ang);
  if (flash > 0) { ctx.fillStyle = 'rgba(255,240,150,0.8)'; ctx.beginPath(); ctx.arc(Math.cos(ang) * (r + 6), Math.sin(ang) * (r + 6), 4, 0, 7); ctx.fill(); }
  // ستاره سطح
  ctx.font = '8px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fde047';
  ctx.fillText(sp ? '★' : '●'.repeat(tier), 0, r + 7);
  ctx.font = '12px sans-serif';
  ctx.fillText(sp ? SPEC[kind][sp - 1].icon : def.icon, 0, -r - 7);
  if (zoom >= 0.9) {
    ctx.font = '7px sans-serif';
    const st = (sp ? { sea: SPEC[kind][sp - 1].sea ?? def.sea, air: SPEC[kind][sp - 1].air ?? def.air } : def);
    ctx.fillText((st.sea ? '🚢' : '') + (st.air ? '✈️' : '') + (def.sub ? '⚓' : ''), 0, -r - 17);
  }
  if (dis) { ctx.fillStyle = 'rgba(239,68,68,0.5)'; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = '12px sans-serif'; ctx.fillText('⚠', 0, 0); }
  ctx.restore();
}

function hpBar(ctx: CanvasRenderingContext2D, e: Enemy, w: number, y: number) {
  if (e.hp >= e.maxHp && e.shield <= 0) return;
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(e.x - w / 2, e.y - y, w, 3);
  ctx.fillStyle = e.hp / e.maxHp > 0.4 ? '#4ade80' : '#ef4444';
  ctx.fillRect(e.x - w / 2, e.y - y, w * Math.max(0, e.hp / e.maxHp), 3);
  if (e.shieldMax > 0 && e.shield > 0) { ctx.fillStyle = '#38bdf8'; ctx.fillRect(e.x - w / 2, e.y - y - 3, w * (e.shield / e.shieldMax), 2); }
}

function drawEnemy(ctx: CanvasRenderingContext2D, e: Enemy, time: number) {
  const def = EDEF[e.kind];
  const sz = def.size;
  ctx.save();
  ctx.translate(e.x, e.y);
  const hid = e.hidden && !e.revealed;
  if (hid) ctx.globalAlpha = 0.18;
  if (e.hit > 0) ctx.globalAlpha = Math.min(ctx.globalAlpha, 0.7);
  if (e.pirate) {
    ctx.rotate(e.ang);
    ctx.fillStyle = '#111827'; ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-6, -4); ctx.lineTo(-6, 4); ctx.fill();
    ctx.rotate(-e.ang); ctx.font = '10px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('🏴‍☠️', 0, -9);
    ctx.restore(); hpBar(ctx, e, 14, 14); return;
  }
  if (e.air) {
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(6, 8, sz, sz * 0.5, 0, 0, 7); ctx.fill();
    ctx.rotate(e.ang);
    ctx.fillStyle = '#e5e7eb'; ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(sz, 0); ctx.lineTo(-sz * 0.6, -sz); ctx.lineTo(-sz * 0.2, 0); ctx.lineTo(-sz * 0.6, sz); ctx.closePath(); ctx.fill(); ctx.stroke();
  } else {
    ctx.rotate(e.ang);
    const body = e.kind === 'speed' ? '#ef4444' : e.kind === 'corv' ? '#7f1d1d' : e.kind === 'sub' ? '#1e3a8a' : e.kind === 'dest' ? '#6b7280' : e.kind === 'boss1' ? '#9a3412' : e.kind === 'boss2' ? '#0f172a' : e.kind === 'boss3' ? '#475569' : e.kind === 'boss4' ? '#374151' : '#7c2d12';
    ctx.fillStyle = body; ctx.strokeStyle = '#fca5a5'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(sz * 1.2, 0); ctx.lineTo(sz * 0.4, -sz * 0.55); ctx.lineTo(-sz, -sz * 0.55); ctx.lineTo(-sz, sz * 0.55); ctx.lineTo(sz * 0.4, sz * 0.55); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(-sz * 0.5, -sz * 0.2, sz * 0.8, sz * 0.4);
    if (e.kind === 'boss4') { ctx.fillStyle = '#9ca3af'; ctx.fillRect(-sz * 0.9, -sz * 0.45, sz * 1.8, sz * 0.2); }
  }
  ctx.rotate(-e.ang);
  if (e.kind.startsWith('boss')) { ctx.font = '16px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(def.icon, 0, -sz - 8); }
  if (e.shield > 0) { ctx.strokeStyle = 'rgba(56,189,248,0.8)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, sz + 4, 0, 7); ctx.stroke(); }
  if (e.stun > 0) { ctx.strokeStyle = '#c084fc'; ctx.lineWidth = 2; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.arc(0, 0, sz + 6, time * 3, time * 3 + 5); ctx.stroke(); ctx.setLineDash([]); }
  if (e.burn > 0) { ctx.fillStyle = 'rgba(249,115,22,0.6)'; ctx.beginPath(); ctx.arc(0, -3, 4 + Math.sin(time * 15) * 1.5, 0, 7); ctx.fill(); }
  if (e.hacked > 0) { ctx.font = '10px sans-serif'; ctx.fillText('👾', 0, -sz - 4); }
  if (e.armorBreak > 0) { ctx.font = '9px sans-serif'; ctx.fillText('💔', sz, -sz); }
  ctx.restore();
  if (!hid) hpBar(ctx, e, Math.max(16, sz * 1.6), sz + 8);
}

export function render(ctx: CanvasRenderingContext2D, s: G, d: Derived, cam: Cam, W: number, H: number, dpr: number, ui: UI, time: number) {
  const rt = s.rt;
  const z = cam.zoom;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#0b3a5c';
  ctx.fillRect(0, 0, W, H);
  let sx = 0, sy = 0;
  if (rt.shake > 0) { sx = (Math.random() - 0.5) * 8 * rt.shake; sy = (Math.random() - 0.5) * 8 * rt.shake; }
  ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (W / 2 - cam.x * z + sx), dpr * (H / 2 - cam.y * z + sy));
  const dark = darkness(s);
  const battle = rt.battle;

  // دریا
  const g = ctx.createLinearGradient(0, 0, 0, WORLD.h);
  g.addColorStop(0, '#0f766e'); g.addColorStop(0.35, '#0e7490'); g.addColorStop(1, '#0c4a6e');
  ctx.fillStyle = g;
  ctx.fillRect(-100, -100, WORLD.w + 200, WORLD.h + 200);
  ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 1.5;
  for (let i = 0; i < 40; i++) {
    const yy = (i * 37) % WORLD.h, xx = ((i * 197 + time * (10 + (i % 5) * 3)) % (WORLD.w + 200)) - 100;
    ctx.beginPath(); ctx.moveTo(xx, yy); ctx.quadraticCurveTo(xx + 15, yy - 5, xx + 30, yy); ctx.stroke();
  }

  // خشکی
  for (const l of LANDS) {
    const locked = l.lock && !s.islands[l.lock];
    ctx.save();
    if (locked) ctx.globalAlpha = 0.6;
    poly(ctx, blob(l, 1.18)); ctx.fillStyle = 'rgba(125,211,252,0.35)'; ctx.fill();
    poly(ctx, blob(l, 1.07)); ctx.fillStyle = '#fde68a'; ctx.fill();
    poly(ctx, blob(l, 0.92)); ctx.fillStyle = l.green && l.green > 0.4 ? '#65a30d' : l.green && l.green > 0.1 ? '#a3a948' : '#c9a56b'; ctx.fill();
    const lv = s.lv.town + s.lv.welfare;
    if (l.id === 'west' && lv > 0) { poly(ctx, blob(l, 0.8)); ctx.fillStyle = 'rgba(34,197,94,0.35)'; ctx.fill(); }
    ctx.restore();
    if (l.lock && locked) {
      ctx.font = '16px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('🔒', l.cx, l.cy + 5);
    }
  }
  // برچسب‌ها
  ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,0.8)';
  for (const l of LANDS) {
    if (l.id === 'top') ctx.fillText('بندرعباس — اسکله شهید رجایی', 330, 20);
    else if (l.id === 'west') ctx.fillText(l.name, 70, 280);
    else if (l.id === 'east') ctx.fillText(l.name, 770, 300);
    else if (l.id !== 'tonbk') ctx.fillText(l.name, l.cx, l.cy + l.ry + 14);
  }

  // مسیر تجاری
  ctx.save();
  ctx.setLineDash([10, 8]); ctx.lineDashOffset = -time * 10;
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 3;
  ctx.beginPath(); LANE.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = 'rgba(74,222,128,0.7)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(CUSTOMS_X, 530); ctx.lineTo(CUSTOMS_X, 600); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.font = '9px sans-serif';
  ctx.fillText('گمرک', CUSTOMS_X, 525);
  ctx.restore();
  // خلیج دزدان
  for (const [bx, by] of BAYS) { ctx.font = '12px sans-serif'; ctx.globalAlpha = 0.6; ctx.fillText('🏴‍☠️', bx, by); ctx.globalAlpha = 1; }

  // مسیر دشمن
  ctx.save();
  const hot = !!battle && !battle.over;
  ctx.setLineDash([12, 10]); ctx.lineDashOffset = -time * (hot ? 50 : 15);
  ctx.strokeStyle = hot ? 'rgba(239,68,68,0.85)' : 'rgba(239,68,68,0.25)'; ctx.lineWidth = hot ? 4 : 3;
  ctx.beginPath(); PATH.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
  ctx.restore();
  // خط پایان و ورودی
  ctx.font = '22px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('💀', 760, 1318);
  ctx.fillText('🛡️', 440, 100);
  if (battle && !battle.over && battle.queue.length === 0) {
    ctx.fillStyle = '#fecaca'; ctx.font = 'bold 12px sans-serif';
    ctx.fillText(`موج بعد: ${Math.ceil(battle.timer)}s`, 740, 1352);
  }

  // سازه‌ها
  for (const id of STRUCT_ORDER) {
    const def = STRUCTS[id];
    drawStructure(ctx, id, s.lv[id], def.x, def.y, time, dark);
  }
  if (rt.blocked && s.lv.oil > 0) {
    ctx.fillStyle = '#ef4444'; ctx.font = 'bold 14px sans-serif'; ctx.fillText('⚠️ مخزن پر است!', STRUCTS.oil.x - 20, STRUCTS.oil.y - 34);
  }
  // لکه نفت
  if (rt.ev?.type === 'spill') {
    const ev = rt.ev;
    ctx.fillStyle = 'rgba(15,15,15,0.7)'; ctx.beginPath(); ctx.ellipse(ev.x, ev.y, 38, 24, 0.3, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 12px sans-serif';
    ctx.fillText(ev.handled > 0 ? `🚒 ${Math.ceil(ev.handled)}s` : `🛢️ نشت! ${Math.ceil(ev.t)}s`, ev.x, ev.y + 4);
  }

  // جایگاه‌ها
  for (const sl of SLOTS) {
    const t = s.towers[sl.id];
    const locked = sl.group !== 'free' && !s.islands[sl.group];
    if (t) continue;
    ctx.save();
    ctx.translate(sl.x, sl.y);
    ctx.globalAlpha = locked ? 0.35 : 0.95;
    const pulse = ui.sel === sl.id ? 1.2 : 1 + Math.sin(time * 3 + sl.x) * 0.05;
    ctx.scale(pulse, pulse);
    ctx.fillStyle = sl.kind === 'sea' ? '#475569' : '#78716c';
    ctx.strokeStyle = locked ? '#94a3b8' : '#fbbf24';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, 13, 0, 7); ctx.fill(); ctx.stroke();
    ctx.font = '12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.fillText(locked ? '🔒' : '🔨', 0, 1);
    ctx.restore();
  }

  // دایره برد
  if (ui.sel) {
    const sl = SLOTS.find((x) => x.id === ui.sel)!;
    const t = s.towers[ui.sel];
    if (t) {
      const cur = towerStats(s, t, d);
      ring(ctx, sl.x, sl.y, cur.range, 'rgba(74,222,128,0.18)', '#4ade80');
      if (t.tier < 3) {
        const nxt = towerStats(s, { ...t, tier: t.tier + 1 }, d);
        ring(ctx, sl.x, sl.y, nxt.range, 'rgba(56,189,248,0.06)', '#38bdf8', true);
      }
    } else if (ui.prevKind) {
      const fake = { kind: ui.prevKind, tier: 1, sp: 0 as const, prio: 0, cd: 0, ang: 0, dis: 0, inv: { usd: 0, steel: 0 }, laserT: 0, laserId: 0, mineCd: 0, icd: 0, aura: 0, jam: 0, flash: 0 };
      ring(ctx, sl.x, sl.y, towerStats(s, fake, d).range, 'rgba(74,222,128,0.18)', '#4ade80');
    }
  }
  // برجک‌ها
  for (const id in s.towers) {
    const t = s.towers[id], sl = SLOTS.find((x) => x.id === id)!;
    drawTower(ctx, t.kind, t.tier, t.sp, t.ang, sl.x, sl.y, t.flash, t.dis > 0, z, time);
    if (t.aura > 0) { ctx.strokeStyle = 'rgba(103,232,249,0.6)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(sl.x, sl.y, 18, 0, 7); ctx.stroke(); }
  }

  // مین‌ها
  for (const m of rt.mines) { ctx.fillStyle = '#facc15'; ctx.strokeStyle = '#111'; ctx.beginPath(); ctx.arc(m.x, m.y, 4, 0, 7); ctx.fill(); ctx.stroke(); }
  // کشتی‌های تجاری
  for (const sh of rt.trade) {
    const c = SHIPS[sh.cls];
    ctx.save(); ctx.translate(sh.x, sh.y); ctx.rotate(sh.ang);
    if (sh.smug) { ctx.shadowColor = '#fb923c'; ctx.shadowBlur = 14; ctx.fillStyle = 'rgba(251,146,60,0.45)'; ctx.beginPath(); ctx.arc(0, 0, c.size + 6, 0, 7); ctx.fill(); }
    ctx.fillStyle = c.color; ctx.strokeStyle = '#1f2937'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(c.size * 1.3, 0); ctx.lineTo(c.size * 0.6, -c.size * 0.5); ctx.lineTo(-c.size, -c.size * 0.5); ctx.lineTo(-c.size, c.size * 0.5); ctx.lineTo(c.size * 0.6, c.size * 0.5); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  // قایق‌ها
  for (const b of rt.boats) {
    if (b.hp <= 0) continue;
    ctx.save(); ctx.translate(b.x, b.y);
    ctx.fillStyle = b.sub ? '#0f172a' : '#34d399'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(0, 0, b.sub ? 9 : 6, 3.5, 0, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ef4444'; ctx.fillRect(-7, -9, 14, 2); ctx.fillStyle = '#22c55e'; ctx.fillRect(-7, -9, 14 * Math.max(0, b.hp / b.maxHp), 2);
    ctx.restore();
  }
  // نفتکش VIP
  if (rt.ev?.type === 'escort') {
    const q = pathPos(rt.ev.p);
    ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.ang);
    ctx.shadowColor = '#facc15'; ctx.shadowBlur = 16; ctx.fillStyle = '#facc15'; ctx.strokeStyle = '#78350f'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(22, 0); ctx.lineTo(12, -7); ctx.lineTo(-18, -7); ctx.lineTo(-18, 7); ctx.lineTo(12, 7); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(q.x - 20, q.y - 20, 40, 4); ctx.fillStyle = '#facc15'; ctx.fillRect(q.x - 20, q.y - 20, 40 * Math.max(0, rt.ev.hp / rt.ev.maxHp), 4);
  }
  // دشمنان (زیرین، سپس هوایی)
  for (const e of rt.enemies) if (!e.air) drawEnemy(ctx, e, time);
  // قهرمانان
  for (const id of s.heroDep) {
    const h = rt.hero[id]; if (!h) continue;
    ctx.save(); ctx.translate(h.x, h.y);
    const aura = id === 'cat' ? 175 : id === 'sub' ? 170 : 0;
    if (aura) { ctx.strokeStyle = 'rgba(103,232,249,0.35)'; ctx.setLineDash([5, 5]); ctx.beginPath(); ctx.arc(0, 0, aura, 0, 7); ctx.stroke(); ctx.setLineDash([]); }
    ctx.fillStyle = ui.heroSel === id ? '#fde047' : '#0ea5e9'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, 13, 0, 7); ctx.fill(); ctx.stroke();
    ctx.font = '15px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff';
    ctx.fillText(HEROES[id].icon, 0, 1);
    ctx.restore();
    if (Math.hypot(h.tx - h.x, h.ty - h.y) > 6) { ctx.strokeStyle = 'rgba(253,224,71,0.6)'; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(h.x, h.y); ctx.lineTo(h.tx, h.ty); ctx.stroke(); ctx.setLineDash([]); }
  }
  for (const e of rt.enemies) if (e.air) drawEnemy(ctx, e, time);

  // موشک‌ها
  for (const p of rt.projs) {
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.ang);
    ctx.fillStyle = p.color;
    if (p.kind === 'shell' || p.kind === 'rocket') { ctx.beginPath(); ctx.arc(0, 0, p.kind === 'shell' ? 3.5 : 2.2, 0, 7); ctx.fill(); }
    else { ctx.fillRect(-6, -1.5, 10, 3); ctx.fillStyle = '#fff'; ctx.fillRect(-9, -1, 4, 2); }
    ctx.restore();
  }
  for (const p of rt.eprojs) { ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, 7); ctx.fill(); }

  // افکت‌ها
  for (const f of rt.fx) {
    const k = f.t / f.life;
    ctx.save(); ctx.globalAlpha = 1 - k;
    if (f.type === 'boom') {
      const gr = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r * (0.4 + k));
      gr.addColorStop(0, '#fff'); gr.addColorStop(0.4, f.color); gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.4 + k), 0, 7); ctx.fill();
    } else if (f.type === 'line') {
      ctx.strokeStyle = f.color; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.x2, f.y2); ctx.stroke();
    } else if (f.type === 'ring') {
      ctx.strokeStyle = f.color; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.3 + 0.7 * k), 0, 7); ctx.stroke();
    } else {
      ctx.fillStyle = f.color; ctx.beginPath(); ctx.arc(f.x, f.y, 3 * (1 - k), 0, 7); ctx.fill();
    }
    ctx.restore();
  }
  for (const k of rt.strikes) { ctx.strokeStyle = 'rgba(239,68,68,0.6)'; ctx.beginPath(); ctx.arc(k.x, k.y, 12, 0, 7); ctx.stroke(); }
  // نشانگر نشانه‌گیری
  if (ui.aim) { ring(ctx, ui.aimX, ui.aimY, 90, 'rgba(239,68,68,0.15)', '#ef4444'); }

  // شب
  if (dark > 0.02) {
    ctx.fillStyle = `rgba(4,8,32,${dark * 0.62})`;
    ctx.fillRect(-100, -100, WORLD.w + 200, WORLD.h + 200);
    ctx.globalCompositeOperation = 'lighter';
    const glow = (x: number, y: number, r: number, c: string) => {
      const gr = ctx.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, c); gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    };
    const a = Math.min(1, dark * 1.3);
    for (const id of STRUCT_ORDER) if (s.lv[id] > 0) glow(STRUCTS[id].x, STRUCTS[id].y, 34 + tierOf(s.lv[id]) * 6, `rgba(253,224,71,${0.35 * a})`);
    for (const id in s.towers) { const sl = SLOTS.find((x) => x.id === id)!; glow(sl.x, sl.y, 36, `rgba(125,211,252,${0.35 * a})`); }
    for (const sh of rt.trade) glow(sh.x, sh.y, 18, `rgba(255,255,255,${0.3 * a})`);
    for (const l of LANDS) if (l.id === 'west' && s.lv.town > 0) glow(100, 240, 70, `rgba(253,224,71,${0.25 * a})`);
    ctx.globalCompositeOperation = 'source-over';
  }
  // بارش
  if (stormActive(s)) {
    ctx.strokeStyle = 'rgba(200,220,255,0.35)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < 120; i++) {
      const x = ((i * 97 + time * 120) % (WORLD.w + 100)) - 50, y = ((i * 211 + time * 500) % (WORLD.h + 100)) - 50;
      ctx.moveTo(x, y); ctx.lineTo(x - 5, y + 14);
    }
    ctx.stroke();
    ctx.fillStyle = 'rgba(30,41,59,0.25)'; ctx.fillRect(-100, -100, WORLD.w + 200, WORLD.h + 200);
  }
  // اعداد شناور
  for (const f of rt.floaters) {
    ctx.globalAlpha = 1 - f.t / f.life;
    ctx.font = `bold ${f.size}px sans-serif`; ctx.textAlign = 'center';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.strokeText(f.text, f.x, f.y);
    ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y);
    ctx.globalAlpha = 1;
  }
  void PLEN;
}

function ring(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string, stroke: string, dashed = false) {
  ctx.save();
  ctx.fillStyle = fill; ctx.strokeStyle = stroke; ctx.lineWidth = 2;
  if (dashed) ctx.setLineDash([6, 5]);
  ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); ctx.stroke();
  ctx.restore();
}
