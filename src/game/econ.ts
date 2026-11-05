import { STRUCTS, TDEF, SPEC, lvlMul, cardLevel, SHIPS, HEROES, type StructId, type TMode } from './data';
import { type G, type Tower, freshPersist, newRuntime, initHeroes } from './state';

export type Derived = {
  grid: number; powerEff: number; waterEff: number; powerProd: number; powerCons: number; waterProd: number; waterCons: number;
  stab: number; mStab: number; cmd: number; mProd: number; oilOut: number; oilCap: number; pierCap: number; refCap: number;
  steelRate: number; ordRate: number; oilPrice: number; tax: number; tollMul: number; towerPower: number;
};

export function towerPower(s: G, t: Tower): number {
  let p = TDEF[t.kind].power;
  if (t.sp) {
    const sp = SPEC[t.kind][t.sp - 1];
    if (sp.power !== undefined) p = sp.power;
    if (s.tech.t4) p *= 0.65;
  }
  return p;
}

export const stormActive = (s: G) => s.rt.storm > 0 || s.rt.battle?.weather === 'storm';

export function derive(s: G): Derived {
  const L = s.lv, T = s.tech, rt = s.rt;
  const cmd = 1 + 0.25 * s.badges;
  const techAll = T.c10 ? 1.15 : 1;
  let towerP = 0;
  for (const id in s.towers) towerP += towerPower(s, s.towers[id]);
  let powerCons = towerP;
  let waterCons = 0;
  (Object.keys(STRUCTS) as StructId[]).forEach((k) => {
    if (L[k] > 0) { powerCons += STRUCTS[k].power * L[k]; waterCons += STRUCTS[k].water * L[k]; }
  });
  let powerProd = 20 + (L.power > 0 ? STRUCTS.power.out * lvlMul(L.power) * (rt.plantOK ? 1 : 0.3) : 0);
  powerProd *= (T.e10 ? 1.3 : 1) * (T.c6 ? 1.25 : 1) * (stormActive(s) ? 1.25 : 1);
  const waterProd = 15 + (L.desal > 0 ? STRUCTS.desal.out * lvlMul(L.desal) * (T.c2 ? 2 : 1) : 0);
  const powerEff = powerCons > 0 ? Math.min(1, powerProd / powerCons) : 1;
  const waterEff = waterCons > 0 ? Math.min(1, waterProd / waterCons) : 1;
  const grid = Math.max(0.2, powerEff * (0.6 + 0.4 * waterEff));
  const townOK = Math.min(powerEff, waterEff);
  let stab = 0.4 * townOK * (L.town > 0 ? 1 : 0.5);
  stab += 0.3 * Math.min(1, L.welfare / 10 + (L.town > 0 ? 0.2 : 0));
  stab += 0.3 * (s.security / 100) + (T.c9 ? 0.1 : 0);
  stab = Math.max(0, Math.min(1, stab));
  const mStab = 0.5 + stab;
  const mProd = grid * mStab * cmd * techAll;
  const spillMul = rt.ev?.type === 'spill' && !rt.ev.handled ? 0.6 : 1;
  const oilOut = 10 * lvlMul(L.oil) * (T.e1 ? 1.25 : 1) * (T.e8 ? 1.25 : 1) * mProd * spillMul;
  const oilCap = (300 + (L.tank > 0 ? 500 * lvlMul(L.tank) : 0)) * (T.e7 ? 1.5 : 1);
  const pierCap = L.pier > 0 ? 15 * lvlMul(L.pier) * (T.e2 ? 1.5 : 1) * (T.e5 ? 2 : 1) * grid : 0;
  const refCap = L.refinery > 0 ? 10 * lvlMul(L.refinery) * (T.e2 ? 1.5 : 1) * grid : 0;
  const steelRate = L.steel > 0 ? 3 * lvlMul(L.steel) * (T.e6 ? 1.3 : 1) * mProd : 0;
  const ordRate = L.ord > 0 ? 5 * lvlMul(L.ord) * (T.e4 ? 1.4 : 1) * mProd : 0;
  const oilPrice = 2 * (T.c5 ? 1.5 : 1) * cmd;
  const tax = L.town > 0 ? 5 * lvlMul(L.town) * (T.c7 ? 1.5 : 1) * mProd : 0;
  const tollMul = (T.c3 ? 1.25 : 1) * (1 + 0.05 * L.optical) * cmd;
  rt.stab = stab; rt.grid = grid; rt.powerEff = powerEff; rt.waterEff = waterEff;
  return { grid, powerEff, waterEff, powerProd, powerCons, waterProd, waterCons, stab, mStab, cmd, mProd, oilOut, oilCap, pierCap, refCap, steelRate, ordRate, oilPrice, tax, tollMul, towerPower: towerP };
}

export function addUsd(s: G, v: number) {
  s.usd += v;
  if (v > 0) { s.runEarned += v; s.totalEarned += v; s.rt.incAcc += v; }
}

export function econTick(s: G, dt: number, d: Derived) {
  const rt = s.rt, T = s.tech;
  const capF = d.oilCap, capFuel = d.oilCap, capSteel = d.oilCap * 0.6, capOrd = d.oilCap * 0.6;
  // تولید نفت
  const room = capF - s.oil;
  const prod = Math.min(d.oilOut * dt, Math.max(0, room));
  rt.blocked = d.oilOut > 0 && room < d.oilOut * dt * 1.01;
  s.oil += prod;
  // ذخیره پایه
  s.steel = Math.min(capSteel, s.steel + 0.1 * dt);
  s.ord = Math.min(capOrd, s.ord + 0.3 * dt);
  // شیر تقسیم
  const avail = s.oil;
  const ex = Math.min(avail * s.alpha, d.pierCap * dt);
  addUsd(s, ex * d.oilPrice);
  s.oil -= ex;
  let rf = Math.min(avail * (1 - s.alpha), d.refCap * dt);
  const fuelGainPer = 0.5 * (T.e3 ? 1.2 : 1);
  rf = Math.min(rf, Math.max(0, (capFuel - s.fuel) / fuelGainPer), s.oil);
  s.oil -= rf;
  s.fuel += rf * fuelGainPer;
  // فولاد
  if (d.steelRate > 0) {
    let out = Math.min(d.steelRate * dt, Math.max(0, capSteel - s.steel));
    const needOil = (out / 3) * 10 * (T.e9 ? 0.7 : 1), needFuel = (out / 3) * 2;
    const sc = needOil > 0 ? Math.min(1, s.oil / needOil, s.fuel / needFuel) : 0;
    out *= sc;
    s.oil -= needOil * sc; s.fuel -= needFuel * sc; s.steel += out;
  }
  // مهمات
  if (d.ordRate > 0) {
    let out = Math.min(d.ordRate * dt, Math.max(0, capOrd - s.ord));
    const need = out * 0.5;
    const sc = need > 0 ? Math.min(1, s.fuel / need, s.steel / need) : 0;
    out *= sc;
    s.fuel -= out * 0.5; s.steel -= out * 0.5; s.ord += out;
  }
  // نیروگاه
  if (s.lv.power > 0) {
    const burn = 0.05 * s.lv.power * (T.c1 ? 0.7 : 1) * dt;
    if (s.fuel >= burn) { s.fuel -= burn; rt.plantOK = true; } else { s.fuel = 0; rt.plantOK = false; }
  } else rt.plantOK = true;
  if (d.tax > 0) addUsd(s, d.tax * dt);
  s.oil = Math.max(0, s.oil); s.fuel = Math.max(0, s.fuel); s.steel = Math.max(0, s.steel); s.ord = Math.max(0, s.ord);
}

export function tollEstimate(s: G, d: Derived): number {
  const sec = s.security;
  const ships = SHIPS.filter((x) => sec >= x.minS);
  const tw = ships.reduce((a, b) => a + b.w, 0);
  const avg = ships.reduce((a, b) => a + b.toll * b.w, 0) / tw;
  return (avg / (15 - 0.1 * sec)) * d.tollMul * 0.85;
}

// ---------- آمار برجک ----------
export type TStats = { dmg: number; rate: number; range: number; mode: TMode; splash: number; air: boolean; sea: boolean; sub: boolean; power: number; ammo: number; dps: number };
export function towerStats(s: G, t: Tower, d: Derived): TStats {
  const def = TDEF[t.kind];
  const sp = t.sp ? SPEC[t.kind][t.sp - 1] : null;
  let dmg = def.dmg * Math.pow(1.8, t.tier - 1) * (sp?.dmg ?? 1) * (1 + 0.12 * cardLevel(s.cards[t.kind])) * (1 + 0.2 * s.badges);
  if (s.tech.t1 && (t.kind === 'auto' || t.kind === 'how')) dmg *= 1.25;
  if (s.tech.t10 && (t.kind === 'cruise' || t.kind === 'aa')) dmg *= 1.3;
  let rate = def.rate * (sp?.rate ?? 1) * (s.tech.t9 ? 1.15 : 1);
  let range = def.range * (1 + 0.1 * (Math.min(t.tier, 4) - 1)) * (sp?.range ?? 1) * (s.tech.t2 ? 1.2 : 1);
  const b = s.rt.battle;
  if (b) range *= b.rangeMul;
  if (stormActive(s) && (t.kind === 'auto' || t.kind === 'how' || t.kind === 'boat')) range *= 0.8;
  const power = towerPower(s, t);
  if (power > 0) rate *= d.grid;
  rate *= 1 + t.aura;
  if (t.jam > 0) rate *= 0.5;
  if (s.rt.over > 0) rate *= 2;
  const mode = sp?.mode ?? def.mode;
  const splash = def.splash > 0 ? def.splash * (sp?.splash ?? 1) : sp?.splash ?? 0;
  const sea = sp?.sea ?? def.sea, air = sp?.air ?? def.air, sub = sp?.sub ?? def.sub;
  let ammo = def.ammo * (s.tech.t6 ? 0.7 : 1);
  if (mode === 'rockets') ammo *= 4;
  if (mode === 'swarm') ammo *= 3;
  const mult = mode === 'rockets' ? 12 : mode === 'swarm' ? 4 : mode === 'rail' ? 2.5 : mode === 'hel' ? 3 : mode === 'boats' ? (t.sp === 1 ? 5 : t.sp === 2 ? 2 : 3) : mode === 'ew' ? 0 : 1;
  const dps = dmg * rate * mult * (splash > 0 ? 1.5 : 1);
  return { dmg, rate, range, mode, splash, air, sea, sub, power, ammo, dps };
}

// ---------- آفلاین ----------
export type OfflineReport = { T: number; usd: number; R: number; dps: number; threat: number };
export function threatLevel(s: G) { return 40 * Math.pow(1.22, 0.75 * (s.done + 1)); }
export function heroPower(s: G) { return s.heroDep.length * 30 * Math.pow(1.2, s.done); }
export function applyOffline(s: G): OfflineReport | null {
  const T = Math.min((Date.now() - s.lastSeen) / 1000, 43200);
  if (!(T >= 60)) return null;
  const d0 = derive(s);
  let dps = heroPower(s);
  for (const id in s.towers) dps += towerStats(s, s.towers[id], d0).dps;
  const threat = threatLevel(s);
  const R = Math.min(1, dps / threat);
  const before = { usd: s.usd, oil: s.oil, fuel: s.fuel, steel: s.steel, ord: s.ord, run: s.runEarned, tot: s.totalEarned };
  const n = Math.min(1500, Math.ceil(T / 10));
  for (let i = 0; i < n; i++) econTick(s, T / n, derive(s));
  const toll = tollEstimate(s, d0) * T;
  const f = 0.5 * R;
  const gain = (s.usd - before.usd + toll) * f;
  s.usd = before.usd + gain;
  s.runEarned = before.run + gain; s.totalEarned = before.tot + gain;
  s.oil = Math.max(0, before.oil + (s.oil - before.oil) * f);
  s.fuel = Math.max(0, before.fuel + (s.fuel - before.fuel) * f);
  s.steel = Math.max(0, before.steel + (s.steel - before.steel) * f);
  s.ord = Math.max(0, before.ord + (s.ord - before.ord) * f);
  s.rt.incAcc = 0;
  return { T, usd: gain, R, dps, threat };
}

// ---------- پرستیژ ----------
export const prestigeNeed = (s: G) => 2_500_000 * Math.pow(s.presCount + 1, 2);
export const prestigeGain = (s: G) => Math.floor(1 + Math.sqrt(s.runEarned / 1e6));
export const canPrestige = (s: G) => s.runEarned >= prestigeNeed(s) && s.done >= 3;
export function doPrestige(s: G) {
  const gain = prestigeGain(s);
  const keep = {
    cards: s.cards, chests: s.chests, heroOwned: s.heroOwned, heroDep: s.heroDep, islands: s.islands, done: s.done, chDone: s.chDone, bestWave: s.bestWave,
    badges: s.badges + gain, presCount: s.presCount + 1, totalEarned: s.totalEarned, name: s.name, sound: s.sound, haptics: s.haptics, tutorial: true,
  };
  const fresh = freshPersist(keep);
  Object.assign(s, fresh);
  s.rt = newRuntime();
  initHeroes(s);
  return gain;
}
export const heroNames = HEROES;
