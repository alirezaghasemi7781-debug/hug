// داده‌های ثابت بازی: نقشه، سازه‌ها، برجک‌ها، دشمنان، فناوری، قهرمانان
export const WORLD = { w: 800, h: 1400 };

export const PATH: [number, number][] = [
  [820, 1330], [640, 1300], [470, 1240], [300, 1180], [200, 1060], [260, 920], [450, 860],
  [600, 780], [640, 640], [520, 520], [360, 470], [330, 340], [400, 220], [440, 112],
];
export const LANE: [number, number][] = [
  [-30, 540], [250, 560], [450, 585], [620, 610], [700, 660], [790, 770],
];
export const CUSTOMS_X = 300;
export const BAYS: [number, number][] = [[120, 470], [300, 700], [610, 470]];

export type Land = { id: string; name: string; cx: number; cy: number; rx: number; ry: number; rot?: number; lock?: string; green?: number };
export const LANDS: Land[] = [
  { id: 'top', name: 'ساحل بندرعباس', cx: 400, cy: -100, rx: 620, ry: 195, green: 0 },
  { id: 'west', name: 'ساحل غربی', cx: -130, cy: 290, rx: 360, ry: 190, green: 0.5 },
  { id: 'east', name: 'ساحل شرقی', cx: 900, cy: 420, rx: 220, ry: 330, green: 0.2 },
  { id: 'cape', name: 'دماغه', cx: 560, cy: 230, rx: 70, ry: 55, green: 0.3 },
  { id: 'hormuz', name: 'جزیره هرمز', cx: 560, cy: 1090, rx: 85, ry: 70, green: 0.2 },
  { id: 'larak', name: 'لارک', cx: 370, cy: 1010, rx: 45, ry: 35, green: 0.3 },
  { id: 'qeshm', name: 'جزیره قشم', cx: 470, cy: 680, rx: 95, ry: 55, rot: -0.3, green: 0.6 },
  { id: 'tonb', name: 'تنب بزرگ', cx: 90, cy: 1120, rx: 50, ry: 40, lock: 'tonb', green: 0.3 },
  { id: 'tonbk', name: 'تنب کوچک', cx: 70, cy: 960, rx: 25, ry: 20, lock: 'tonb', green: 0.2 },
  { id: 'abumusa', name: 'ابوموسی', cx: 130, cy: 760, rx: 55, ry: 40, lock: 'abumusa', green: 0.3 },
  { id: 'kish', name: 'جزیره کیش', cx: 160, cy: 1300, rx: 80, ry: 55, lock: 'kish', green: 0.7 },
];

export function isLand(x: number, y: number): boolean {
  for (const l of LANDS) {
    const r = l.rot ?? 0;
    const dx = x - l.cx, dy = y - l.cy;
    const c = Math.cos(-r), s = Math.sin(-r);
    const ux = dx * c - dy * s, uy = dx * s + dy * c;
    if ((ux / l.rx) ** 2 + (uy / l.ry) ** 2 < 1) return true;
  }
  return false;
}

export type Slot = { id: string; x: number; y: number; group: string; kind: 'coast' | 'sea' };
const S = (id: string, x: number, y: number, group: string, kind: 'coast' | 'sea' = 'coast'): Slot => ({ id, x, y, group, kind });
export const SLOTS: Slot[] = [
  S('h1', 490, 1135, 'free'), S('h2', 555, 1168, 'free'), S('h3', 632, 1140, 'free'),
  S('h4', 500, 1040, 'free'), S('h5', 572, 1015, 'free'), S('h6', 636, 1062, 'free'),
  S('l1', 325, 1032, 'free'), S('l2', 412, 985, 'free'),
  S('q1', 385, 692, 'free'), S('q2', 440, 628, 'free'), S('q3', 522, 640, 'free'), S('q4', 545, 702, 'free'), S('q5', 470, 735, 'free'),
  S('b1', 350, 118, 'free'), S('b2', 535, 128, 'free'),
  S('w1', 235, 332, 'free'), S('w2', 200, 430, 'free'),
  S('e1', 710, 560, 'free'), S('e2', 742, 690, 'free'),
  S('p1', 500, 215, 'free'), S('p2', 522, 292, 'free'),
  S('s1', 600, 1235, 'free', 'sea'), S('s2', 340, 1110, 'free', 'sea'), S('s3', 340, 820, 'free', 'sea'), S('s4', 470, 430, 'free', 'sea'),
  S('t1', 130, 1100, 'tonb'), S('t2', 150, 1010, 'tonb'),
  S('a1', 185, 790, 'abumusa'), S('a2', 232, 860, 'abumusa'),
  S('k1', 210, 1250, 'kish'), S('k2', 330, 1290, 'kish'), S('k3', 395, 1312, 'kish'),
];

export const ISLAND_UNLOCK: Record<string, { name: string; cost: number; ops: number }> = {
  tonb: { name: 'تنب بزرگ و کوچک', cost: 60000, ops: 3 },
  abumusa: { name: 'ابوموسی', cost: 250000, ops: 8 },
  kish: { name: 'کیش (مرکز فرماندهی)', cost: 1200000, ops: 14 },
};

// ---------- سازه‌های اقتصادی ----------
export type StructId = 'oil' | 'tank' | 'pier' | 'refinery' | 'steel' | 'ord' | 'power' | 'desal' | 'town' | 'welfare' | 'optical';
export type StructDef = { name: string; icon: string; cost: number; out: number; power: number; water: number; x: number; y: number; unit: string; desc: string; tab: 'eco' | 'city' };
export const STRUCTS: Record<StructId, StructDef> = {
  oil: { name: 'سکوی نفتی دریایی', icon: '🛢️', cost: 100, out: 10, power: 5, water: 0, x: 705, y: 1150, unit: 'بشکه/ث', desc: 'استخراج نفت خام', tab: 'eco' },
  tank: { name: 'مخزن ذخیره نفت', icon: '🏺', cost: 80, out: 500, power: 1, water: 0, x: 560, y: 1090, unit: 'ظرفیت', desc: 'ظرفیت انبار نفت/سوخت/فولاد', tab: 'eco' },
  pier: { name: 'اسکله صادرات نفت', icon: '🚢', cost: 150, out: 15, power: 3, water: 0, x: 330, y: 92, unit: 'بشکه/ث', desc: 'بارگیری و فروش (هر بشکه ۲ دلار)', tab: 'eco' },
  refinery: { name: 'پالایشگاه میعانات', icon: '🏭', cost: 300, out: 10, power: 15, water: 2, x: 455, y: 55, unit: 'بشکه/ث', desc: '۱۰ نفت ← ۵ سوخت', tab: 'eco' },
  steel: { name: 'مجتمع فولاد ساحلی', icon: '🏗️', cost: 500, out: 3, power: 25, water: 0, x: 585, y: 72, unit: 'فولاد/ث', desc: '۱۰ نفت + ۲ سوخت ← ۳ فولاد', tab: 'eco' },
  ord: { name: 'کارخانه صنایع دفاعی', icon: '🚀', cost: 1000, out: 5, power: 30, water: 0, x: 215, y: 62, unit: 'مهمات/ث', desc: '۵ سوخت + ۵ فولاد ← ۱۰ مهمات', tab: 'eco' },
  power: { name: 'نیروگاه برق', icon: '⚡', cost: 250, out: 40, power: 0, water: 0, x: 60, y: 330, unit: 'MW', desc: 'تامین برق کشور (مصرف سوخت)', tab: 'city' },
  desal: { name: 'آب‌شیرین‌کن', icon: '💧', cost: 200, out: 20, power: 4, water: 0, x: 105, y: 425, unit: 'آب', desc: 'تامین آب شهرها و پالایشگاه', tab: 'city' },
  town: { name: 'شهرک مسکونی', icon: '🏙️', cost: 400, out: 5, power: 6, water: 10, x: 105, y: 235, unit: 'دلار/ث مالیات', desc: 'مالیات و پایداری ملی', tab: 'city' },
  welfare: { name: 'بیمارستان و دانشگاه', icon: '🏥', cost: 900, out: 0, power: 8, water: 4, x: 470, y: 682, unit: 'رفاه', desc: '+۳۰٪ پایداری ملی در سطح ۱۰', tab: 'city' },
  optical: { name: 'پست بازرسی اپتیکی', icon: '🔭', cost: 600, out: 0, power: 3, water: 0, x: 300, y: 515, unit: 'گمرک', desc: 'آشکار کردن قاچاق + عوارض بیشتر', tab: 'city' },
};
export const STRUCT_ORDER: StructId[] = ['oil', 'tank', 'pier', 'refinery', 'steel', 'ord', 'power', 'desal', 'town', 'welfare', 'optical'];
export const MAX_LEVEL = 100;
export const lvlMul = (L: number) => L * Math.pow(2, Math.floor(L / 10));
export const costOf = (base: number, L: number) => base * Math.pow(1.15, L - 1); // هزینه خرید سطح L
export function tierOf(L: number) { return L >= 100 ? 5 : L >= 50 ? 4 : L >= 25 ? 3 : L >= 10 ? 2 : 1; }
export const TIER_NAMES = ['', 'سنتی', 'صنعتی', 'مدرن', 'ابرسازه', 'آینده‌نگر'];

// ---------- برجک‌ها ----------
export type TKind = 'auto' | 'how' | 'cruise' | 'aa' | 'ew' | 'boat';
export type TMode = 'bullet' | 'shell' | 'missile' | 'beam' | 'ew' | 'boats' | 'rail' | 'rockets' | 'swarm' | 'hel';
export type TDefn = { name: string; icon: string; sea: boolean; air: boolean; sub: boolean; dmg: number; rate: number; range: number; ammo: number; power: number; splash: number; usd: number; steel: number; mode: TMode; desc: string; color: string };
export const TKINDS: TKind[] = ['auto', 'how', 'cruise', 'aa', 'ew', 'boat'];
export const TDEF: Record<TKind, TDefn> = {
  auto: { name: 'توپخانه سریع', icon: '🔫', sea: true, air: true, sub: false, dmg: 6, rate: 4, range: 150, ammo: 0.04, power: 0, splash: 0, usd: 60, steel: 5, mode: 'bullet', color: '#facc15', desc: 'رگبار سریع؛ عالی علیه قایق‌های تندرو و پهپادها' },
  how: { name: 'توپخانه سنگین', icon: '💣', sea: true, air: false, sub: false, dmg: 45, rate: 0.6, range: 190, ammo: 0.8, power: 0, splash: 55, usd: 120, steel: 15, mode: 'shell', color: '#fb923c', desc: 'آسیب محیطی؛ عالی برای دسته‌های فشرده در تنگناها' },
  cruise: { name: 'سیلوی موشک کروز', icon: '🚀', sea: true, air: false, sub: false, dmg: 140, rate: 0.3, range: 340, ammo: 2, power: 0, splash: 0, usd: 200, steel: 25, mode: 'missile', color: '#f87171', desc: 'برد بلند و تخریب سنگین علیه ناوها و غول‌آخرها' },
  aa: { name: 'پدافند و لیزر', icon: '📡', sea: true, air: true, sub: false, dmg: 9, rate: 4, range: 210, ammo: 0.01, power: 6, splash: 0, usd: 150, steel: 20, mode: 'beam', color: '#22d3ee', desc: 'ضدهوایی تخصصی + اشعه روی ناوها (وابسته به برق)' },
  ew: { name: 'جنگ الکترونیک', icon: '📶', sea: true, air: true, sub: true, dmg: 1, rate: 1, range: 170, ammo: 0, power: 8, splash: 0, usd: 130, steel: 15, mode: 'ew', color: '#a78bfa', desc: 'کندکننده + آشکارساز زیردریایی‌ها (وابسته به برق)' },
  boat: { name: 'آشیانه قایق‌های رهگیر', icon: '⚓', sea: true, air: false, sub: true, dmg: 8, rate: 1, range: 150, ammo: 0, power: 0, splash: 0, usd: 140, steel: 15, mode: 'boats', color: '#34d399', desc: '۳ قایق تندرو مسیر دشمن را سد می‌کنند' },
};
export type TSpec = { name: string; icon: string; desc: string; dmg?: number; rate?: number; range?: number; power?: number; mode?: TMode; splash?: number; air?: boolean; sea?: boolean; sub?: boolean };
export const SPEC: Record<TKind, [TSpec, TSpec]> = {
  auto: [
    { name: 'فالانکس گاتلینگ (CIWS)', icon: '🌀', desc: '۳۰۰۰ گلوله در دقیقه؛ موشک‌های دشمن را در هوا نابود می‌کند', dmg: 0.45, rate: 4.5 },
    { name: 'توپ ریلی', icon: '⚡', desc: 'عبور از بدنه ۵ کشتی و شکافتن زره', dmg: 7, rate: 0.35, range: 1.35, mode: 'rail', power: 10 },
  ],
  how: [
    { name: 'آتش‌بار راکتی فجر (MLRS)', icon: '🎆', desc: '۱۲ راکت خوشه‌ای + سوزش مداوم', dmg: 0.5, rate: 0.9, mode: 'rockets', splash: 1.1 },
    { name: 'توپ گرمافشاری', icon: '🔥', desc: 'انفجار وسیع + گیج‌کردن ۲ ثانیه‌ای', dmg: 1.5, rate: 0.9, splash: 1.7 },
  ],
  cruise: [
    { name: 'سیلوی هایپرسونیک فتاح', icon: '☄️', desc: 'غیرقابل رهگیری؛ ۲ برابر آسیب بحرانی', dmg: 1.3, rate: 1.1, range: 1.15 },
    { name: 'لانچر موشک‌های چندگانه', icon: '🎯', desc: '۴ موشک هوشمند روی ۴ هدف جداگانه', dmg: 0.6, rate: 1, mode: 'swarm' },
  ],
  aa: [
    { name: 'پدافند برد بلند S-400/باور', icon: '🛰️', desc: 'برد فوق‌العاده؛ شکار دسته‌های هوایی (فقط هوایی)', dmg: 10, rate: 0.45, range: 2.4, sea: false, air: true, power: 6, mode: 'missile', splash: 45 },
    { name: 'لیزر حرارتی پرانرژی', icon: '🔆', desc: 'آسیب تصاعدی ۱۰۰٪ ← ۵۰۰٪ روی یک هدف', dmg: 1.2, rate: 1, mode: 'hel', power: 14 },
  ],
  ew: [
    { name: 'دکل پالس EMP', icon: '💥', desc: 'کندی ۶۰٪ + از کار انداختن سلاح و رادار دشمن', range: 1.15, power: 8 },
    { name: 'مرکز جنگ سایبری و سونار', icon: '🕸️', desc: 'آشکارسازی زیردریایی‌ها + هک پهپادها', range: 1.3, power: 8 },
  ],
  boat: [
    { name: 'اسکادران قایق‌های عاشورا', icon: '🛥️', desc: '۵ قایق فوق‌سریع اژدرانداز', dmg: 2.5, rate: 1 },
    { name: 'پایگاه زیردریایی غدیر + مین‌ریز', icon: '🧨', desc: 'مین‌ریزی مغناطیسی + زیردریایی شکارچی', dmg: 1.4, rate: 1 },
  ],
};
export const PRIO_NAMES = ['اولین', 'قوی‌ترین', 'ضعیف‌ترین', 'هوایی'];

export function upgradeCost(kind: TKind, tier: number) {
  const d = TDEF[kind];
  const m = tier === 1 ? 1.8 : tier === 2 ? 3.2 : 9;
  return { usd: Math.round(d.usd * m), steel: Math.round(d.steel * m) };
}
export function cardLevel(count: number) {
  const th = [1, 3, 7, 15, 30, 60, 100];
  return th.filter((t) => count >= t).length;
}

// ---------- دشمنان ----------
export type EKind = 'speed' | 'corv' | 'air' | 'sub' | 'dest' | 'boss1' | 'boss2' | 'boss3' | 'boss4' | 'boss5' | 'pirate';
export type EDef = { name: string; icon: string; hp: number; spd: number; leak: number; bounty: number; armor: number; air: boolean; sub: boolean; cost: number; size: number };
export const EDEF: Record<EKind, EDef> = {
  speed: { name: 'قایق تندرو انتحاری', icon: '🛥️', hp: 30, spd: 100, leak: 1, bounty: 6, armor: 0, air: false, sub: false, cost: 1, size: 7 },
  corv: { name: 'ناوچه زرهی', icon: '🚤', hp: 160, spd: 48, leak: 2, bounty: 16, armor: 0.5, air: false, sub: false, cost: 2.6, size: 9 },
  air: { name: 'پهپاد/جنگنده', icon: '✈️', hp: 36, spd: 85, leak: 1, bounty: 7, armor: 0, air: true, sub: false, cost: 1.2, size: 7 },
  sub: { name: 'زیردریایی رادارگریز', icon: '🦈', hp: 120, spd: 52, leak: 2, bounty: 18, armor: 0, air: false, sub: true, cost: 3, size: 9 },
  dest: { name: 'ناوشکن ایجیس', icon: '🚢', hp: 520, spd: 34, leak: 3, bounty: 45, armor: 0, air: false, sub: false, cost: 6, size: 12 },
  boss1: { name: 'ناو هلیکوپتربر متجاوز', icon: '🛳️', hp: 3200, spd: 22, leak: 20, bounty: 400, armor: 0, air: false, sub: false, cost: 0, size: 20 },
  boss2: { name: 'زیردریایی اتمی لویاتان', icon: '🐋', hp: 6000, spd: 24, leak: 20, bounty: 700, armor: 0, air: false, sub: true, cost: 0, size: 20 },
  boss3: { name: 'رزم‌ناو تایتان', icon: '⚔️', hp: 9000, spd: 21, leak: 20, bounty: 1000, armor: 0.3, air: false, sub: false, cost: 0, size: 22 },
  boss4: { name: 'ناو هواپیمابر اتمی', icon: '🛩️', hp: 20000, spd: 18, leak: 20, bounty: 1800, armor: 0, air: false, sub: false, cost: 0, size: 26 },
  boss5: { name: 'ناو پرچمدار ابرناوگان', icon: '👑', hp: 42000, spd: 17, leak: 20, bounty: 4000, armor: 0.2, air: false, sub: false, cost: 0, size: 28 },
  pirate: { name: 'دزد دریایی', icon: '🏴‍☠️', hp: 25, spd: 75, leak: 0, bounty: 50, armor: 0, air: false, sub: false, cost: 0, size: 6 },
};
export const BOSS_KINDS: EKind[] = ['boss1', 'boss2', 'boss3', 'boss4', 'boss5'];
export const ENEMY_HP = (base: number, E: number) => base * Math.pow(1.22, E);
export const ENEMY_BOUNTY = (base: number, E: number) => base * Math.pow(1.1, E);

// ---------- قهرمانان ----------
export type HeroId = 'cat' | 'drone' | 'sub';
export const HEROES: Record<HeroId, { name: string; icon: string; cost: number; desc: string; sx: number; sy: number }> = {
  cat: { name: 'ناخدا یکم تکاور — ناوچه کاتاماران', icon: '🚤', cost: 150000, desc: 'موشک عمودپرتاب؛ +۲۰٪ سرعت شلیک برجک‌های اطراف', sx: 560, sy: 1190 },
  drone: { name: 'دریادار مهندس — ناو پهپادبر', icon: '🛩️', cost: 400000, desc: 'هر ۱۵ ثانیه موج پهپاد انتحاری روی قوی‌ترین دشمن', sx: 380, sy: 1215 },
  sub: { name: 'فرمانده زیردریایی فاتح', icon: '🌊', cost: 900000, desc: 'شکار غول‌آخرها و تضعیف زره آن‌ها (+۳۰٪ آسیب دریافتی)', sx: 290, sy: 1000 },
};

// ---------- مودهای نبرد ----------
export type Weather = 'clear' | 'night' | 'storm';
export const WEATHER_NAMES: Record<Weather, string> = { clear: 'صاف', night: 'شب', storm: 'طوفانی' };
export const CAMPAIGN_OPS = 25;
export const opWaves = (i: number) => 4 + Math.ceil(i / 5);
export const opWeather = (i: number): Weather => (i % 5 === 0 ? 'clear' : (['clear', 'night', 'storm', 'clear', 'night'] as Weather[])[i % 5]);
export type Challenge = { id: number; name: string; desc: string; waves: number; weather: Weather; ban: TKind[]; only?: TKind[]; rangeMul: number; E0: number };
export const CHALLENGES: Challenge[] = [
  { id: 1, name: 'فقط موشک', desc: 'دفاع از تنگه فقط با برجک‌های موشکی و پدافند؛ بدون توپخانه', waves: 10, weather: 'clear', ban: ['auto', 'how'], rangeMul: 1, E0: 4 },
  { id: 2, name: 'شب طوفانی', desc: 'دفاع در شب طوفانی با ۵۰٪ برد کمتر', waves: 10, weather: 'storm', ban: [], rangeMul: 0.5, E0: 6 },
  { id: 3, name: 'بدون فولاد سنگین', desc: 'بدون سیلوی کروز و توپخانه سنگین', waves: 12, weather: 'night', ban: ['cruise', 'how'], rangeMul: 1, E0: 8 },
];

// ---------- فناوری ----------
export type TechNode = { id: string; branch: 0 | 1 | 2; idx: number; name: string; desc: string; cost: number };
const COSTS = [1500, 4000, 10000, 26000, 70000, 180000, 480000, 1200000, 3200000, 8000000];
const mk = (branch: 0 | 1 | 2, p: string, arr: [string, string][]): TechNode[] => arr.map(([name, desc], i) => ({ id: p + (i + 1), branch, idx: i, name, desc, cost: COSTS[i] * (branch === 1 ? 1.2 : 1) }));
export const TECH: TechNode[] = [
  ...mk(0, 'e', [
    ['حفاری جهت‌دار پیشرفته', '+۲۵٪ تولید پایه سکوهای نفتی'],
    ['لوله‌کشی فشار قوی زیرآبی', '+۵۰٪ سرعت انتقال نفت به اسکله/پالایشگاه'],
    ['پالایش کاتالیستی', '+۲۰٪ سوخت از همان نفت'],
    ['خط تولید اتوماتیک مهمات', '+۴۰٪ تولید مهمات'],
    ['اتوماسیون اسکله‌های صادراتی', 'ظرفیت بارگیری اسکله ×۲'],
    ['فولاد پیشرفته', '+۳۰٪ تولید فولاد'],
    ['مخازن اعماق', '+۵۰٪ ظرفیت انبارها'],
    ['مدیریت مخزن هوشمند', '+۲۵٪ تولید نفت'],
    ['همافزایی پتروشیمی', '-۳۰٪ نفت مصرفی فولاد'],
    ['شبکه برق ملی', '+۳۰٪ تولید برق'],
  ]),
  ...mk(1, 't', [
    ['لوله‌های آلیاژ تیتانیوم', '+۲۵٪ آسیب توپخانه‌ها'],
    ['رادارهای آرایه فازی', '+۲۰٪ برد همه برجک‌ها'],
    ['مهندسی معکوس و بازیافت', 'بازگشت ۸۰٪ هزینه فروش برجک'],
    ['خازن‌های فوق‌رسانا', '-۳۵٪ مصرف برق برجک‌های ویژه'],
    ['باز کردن انشعاب سطح ۴', 'امکان ارتقا به ۱۲ برجک ویژه'],
    ['مهمات کم‌مصرف', '-۳۰٪ مصرف مهمات'],
    ['هدف‌گیری هوشمند', '+۱۰٪ شانس بحرانی (×۲)'],
    ['عرشه تقویت‌شده', '+۵۰٪ جان قایق‌های رهگیر'],
    ['خودکارسازی بارگذاری', '+۱۵٪ سرعت شلیک'],
    ['کلاهک‌های پیشرفته', '+۳۰٪ آسیب موشکی (کروز/پدافند)'],
  ]),
  ...mk(2, 'c', [
    ['توربین‌های گازی سیکل ترکیبی', '-۳۰٪ مصرف سوخت نیروگاه'],
    ['اسمز معکوس پیشرفته', '×۲ آب شیرین'],
    ['گمرک هوشمند الکترونیکی', '+۲۵٪ عوارض ترانزیت'],
    ['پهپادهای مهندسی', 'ترمیم خودکار قایق‌ها و +۱ قلب پس از هر موج'],
    ['پیمان تجارت آزاد منطقه‌ای', '+۵۰٪ قیمت فروش نفت'],
    ['مزارع خورشیدی', '+۲۵٪ تولید برق'],
    ['شهرسازی نوین', '+۵۰٪ مالیات شهرک‌ها'],
    ['ناوگان گارد ساحلی', 'رهگیری دزدان ×۲ سریع‌تر'],
    ['رفاه عمومی', '+۱۰٪ پایداری ملی'],
    ['طرح توسعه ملی', '+۱۵٪ کل تولید'],
  ]),
];
export const BRANCH_NAMES = ['⚡ انرژی و پتروشیمی', '🗼 مهندسی برجک', '🏙️ شهرسازی و دیپلماسی'];

// ---------- کشتی‌های تجاری ----------
export const SHIPS = [
  { name: 'لنج تجاری', minS: 0, speed: 70, toll: 25, risk: 0.05, w: 6, size: 6, color: '#d6b370' },
  { name: 'کشتی فله‌بر', minS: 20, speed: 46, toll: 120, risk: 0.12, w: 4, size: 9, color: '#9ca3af' },
  { name: 'کانتینربر غول‌پیکر', minS: 50, speed: 44, toll: 500, risk: 0.2, w: 3, size: 12, color: '#60a5fa' },
  { name: 'سوپرتانکر VLCC', minS: 80, speed: 28, toll: 2500, risk: 0.3, w: 2, size: 15, color: '#ef4444' },
];

export const SPELLS = [
  { id: 'meteor', name: 'ضربه بالستیک', icon: '🎯', cd: 60 },
  { id: 'emp', name: 'بمب EMP و مین', icon: '⚡', cd: 90 },
  { id: 'over', name: 'اورکلاک پدافند', icon: '🔥', cd: 120 },
] as const;

export function fmt(n: number): string {
  if (!isFinite(n)) return '∞';
  const a = Math.abs(n);
  if (a < 1000) return a < 10 && a % 1 !== 0 ? n.toFixed(1) : Math.floor(n).toString();
  const u = ['K', 'M', 'B', 'T', 'Qa', 'Qi'];
  let i = -1, v = a;
  while (v >= 1000 && i < u.length - 1) { v /= 1000; i++; }
  return (n < 0 ? '-' : '') + (v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2)) + u[i];
}
