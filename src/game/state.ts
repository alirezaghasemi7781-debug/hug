import { PATH, LANE, STRUCTS, TKINDS, HEROES, type StructId, type TKind, type HeroId, type EKind, type Weather } from './data';

// ---------- هندسه ----------
const segLens: number[] = [];
export let PLEN = 0;
for (let i = 0; i < PATH.length - 1; i++) {
  const l = Math.hypot(PATH[i + 1][0] - PATH[i][0], PATH[i + 1][1] - PATH[i][1]);
  segLens.push(l);
  PLEN += l;
}
const laneLens: number[] = [];
export let LLEN = 0;
for (let i = 0; i < LANE.length - 1; i++) {
  const l = Math.hypot(LANE[i + 1][0] - LANE[i][0], LANE[i + 1][1] - LANE[i][1]);
  laneLens.push(l);
  LLEN += l;
}
function along(pts: [number, number][], lens: number[], d: number, off = 0) {
  let i = 0;
  d = Math.max(0, d);
  while (i < lens.length - 1 && d > lens[i]) { d -= lens[i]; i++; }
  const t = Math.min(1, d / lens[i]);
  const ax = pts[i][0], ay = pts[i][1], bx = pts[i + 1][0], by = pts[i + 1][1];
  const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1;
  return { x: ax + dx * t - (dy / L) * off, y: ay + dy * t + (dx / L) * off, ang: Math.atan2(dy, dx) };
}
export const pathPos = (p: number, off = 0) => along(PATH, segLens, p, off);
export const lanePos = (d: number) => along(LANE, laneLens, d);
export function nearestP(x: number, y: number): number {
  let best = 0, bd = 1e9, acc = 0;
  for (let i = 0; i < PATH.length - 1; i++) {
    const ax = PATH[i][0], ay = PATH[i][1], dx = PATH[i + 1][0] - ax, dy = PATH[i + 1][1] - ay;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
    const d = Math.hypot(ax + dx * t - x, ay + dy * t - y);
    if (d < bd) { bd = d; best = acc + t * segLens[i]; }
    acc += segLens[i];
  }
  return best;
}
export const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);

// ---------- انواع ----------
export type Tower = { kind: TKind; tier: number; sp: 0 | 1 | 2; prio: number; cd: number; ang: number; dis: number; inv: { usd: number; steel: number }; laserT: number; laserId: number; mineCd: number; icd: number; aura: number; jam: number; flash: number };
export type Enemy = {
  id: number; kind: EKind; hp: number; maxHp: number; shield: number; shieldMax: number; p: number; lane: number; x: number; y: number; ang: number;
  slow: number; stun: number; burn: number; hidden: boolean; revealed: boolean; air: boolean; blockedBy: number; cdA: number; cdB: number;
  armorBreak: number; hunt: boolean; hacked: number; bountyMul: number; E: number; dead: boolean; battle: boolean; disabled: number;
  tgt: number; loot: number; fx: number; fy: number; hit: number; pirate: boolean;
};
export type Proj = { x: number; y: number; tx: number; ty: number; tid: number; speed: number; dmg: number; splash: number; ap: boolean; missile: boolean; ign: boolean; stun: number; burn: number; color: string; crit: boolean; ang: number; show: boolean; kind: 'shell' | 'missile' | 'rocket' | 'drone'; life: number };
export type EProj = { x: number; y: number; slot: string; speed: number };
export type Boat = { id: number; slot: string; i: number; p: number; hp: number; maxHp: number; respawn: number; eng: number; x: number; y: number; sub: boolean; off: number };
export type Mine = { p: number; x: number; y: number; dmg: number; owner: string };
export type TradeShip = { id: number; cls: number; d: number; x: number; y: number; ang: number; paid: boolean; smug: boolean; dead: boolean; plunder: number; claimed: boolean };
export type Floater = { x: number; y: number; text: string; color: string; t: number; life: number; size: number };
export type Fx = { type: 'boom' | 'line' | 'ring' | 'flash' | 'spark'; x: number; y: number; x2: number; y2: number; t: number; life: number; color: string; r: number };
export type Queued = { t: number; kind: EKind; lane: number; boss: boolean; bm: number };
export type BattleMode = 'campaign' | 'infinite' | 'challenge';
export type Battle = { mode: BattleMode; op: number; chId: number; wave: number; total: number; hearts: number; queue: Queued[]; timer: number; clock: number; kills: number; earned: number; early: boolean; weather: Weather; over: '' | 'win' | 'lose'; E: number; rangeMul: number; ban: TKind[]; lastBossKilled: boolean; reward: string };
export type Hero = { x: number; y: number; tx: number; ty: number; cd: number; cd2: number; ang: number };
export type Ev = { type: 'spill' | 'escort' | 'storm'; t: number; x: number; y: number; handled: number; hp: number; maxHp: number; p: number; spawnT: number; raiders: number };

export type Runtime = {
  enemies: Enemy[]; projs: Proj[]; eprojs: EProj[]; boats: Boat[]; mines: Mine[]; trade: TradeShip[]; floaters: Floater[]; fx: Fx[];
  strikes: { t: number; x: number; y: number; dmg: number }[];
  battle: Battle | null; spellCd: number[]; over: number; nextId: number;
  ev: Ev | null; evT: number; storm: number; tradeT: number; pirateT: number; guardT: number; plantOK: boolean; blocked: boolean;
  incAcc: number; incWin: number; incRate: number; toasts: { id: number; text: string; t: number }[];
  hero: Partial<Record<HeroId, Hero>>; shake: number; stab: number; grid: number; powerEff: number; waterEff: number;
  speedMul: number; saveT: number; alertT: number; result: string; offlineMsg: string;
};

export type Persist = {
  v: number; usd: number; oil: number; fuel: number; steel: number; ord: number;
  lv: Record<StructId, number>; alpha: number; towers: Record<string, Tower>; islands: Record<string, boolean>; tech: Record<string, boolean>;
  cards: Record<TKind, number>; chests: number; heroOwned: Record<HeroId, boolean>; heroDep: HeroId[]; security: number;
  done: number; chDone: number[]; bestWave: number; badges: number; presCount: number; runEarned: number; totalEarned: number;
  lastSeen: number; name: string; sound: boolean; haptics: boolean; speed: number; clock: number; tutorial: boolean;
};
export type G = Persist & { rt: Runtime };

export function newRuntime(): Runtime {
  return {
    enemies: [], projs: [], eprojs: [], boats: [], mines: [], trade: [], floaters: [], fx: [], strikes: [], battle: null,
    spellCd: [0, 0, 0], over: 0, nextId: 1, ev: null, evT: 150, storm: 0, tradeT: 3, pirateT: 25, guardT: 6, plantOK: true, blocked: false,
    incAcc: 0, incWin: 0, incRate: 0, toasts: [], hero: {}, shake: 0, stab: 0.5, grid: 1, powerEff: 1, waterEff: 1,
    speedMul: 1, saveT: 0, alertT: 0, result: '', offlineMsg: '',
  };
}

const emptyLv = (): Record<StructId, number> => {
  const o = {} as Record<StructId, number>;
  (Object.keys(STRUCTS) as StructId[]).forEach((k) => (o[k] = 0));
  return o;
};

export function freshPersist(keep?: Partial<Persist>): Persist {
  const cards = {} as Record<TKind, number>;
  TKINDS.forEach((k) => (cards[k] = 1));
  const lv = emptyLv();
  lv.oil = 1; lv.pier = 1;
  return {
    v: 1, usd: 450, oil: 0, fuel: 0, steel: 40, ord: 80, lv, alpha: 0.8, towers: {}, islands: {}, tech: {}, cards, chests: 0,
    heroOwned: { cat: false, drone: false, sub: false }, heroDep: [], security: 15, done: 0, chDone: [], bestWave: 0, badges: 0,
    presCount: 0, runEarned: 0, totalEarned: 0, lastSeen: Date.now(), name: 'فرمانده', sound: true, haptics: true, speed: 1, clock: 60, tutorial: false,
    ...keep,
  };
}

export function newGame(): G {
  return { ...freshPersist(), rt: newRuntime() };
}

const KEY = 'hormuz-sovereign-v1';
export function saveGame(s: G) {
  try {
    s.lastSeen = Date.now();
    localStorage.setItem(KEY, JSON.stringify(s, (k, v) => (k === 'rt' ? undefined : v)));
  } catch {}
}
export function loadGame(): G | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Persist;
    const base = freshPersist();
    const g: G = { ...base, ...p, lv: { ...base.lv, ...p.lv }, cards: { ...base.cards, ...p.cards }, heroOwned: { ...base.heroOwned, ...p.heroOwned }, rt: newRuntime() };
    return g;
  } catch {
    return null;
  }
}
export function wipeSave() { try { localStorage.removeItem(KEY); } catch {} }

export function initHeroes(s: G) {
  for (const id of s.heroDep) {
    if (!s.rt.hero[id]) {
      const h = HEROES[id];
      s.rt.hero[id] = { x: h.sx, y: h.sy, tx: h.sx, ty: h.sy, cd: 2, cd2: 5, ang: -Math.PI / 2 };
    }
  }
}
