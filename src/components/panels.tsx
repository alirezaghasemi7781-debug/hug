'use client';
import { useState } from 'react';
import {
  STRUCTS, STRUCT_ORDER, TDEF, SPEC, TKINDS, HEROES, TECH, BRANCH_NAMES, ISLAND_UNLOCK, CHALLENGES, CAMPAIGN_OPS, opWaves, opWeather, WEATHER_NAMES,
  tierOf, TIER_NAMES, lvlMul, cardLevel, fmt, MAX_LEVEL, type StructId, type TKind, type HeroId,
} from '@/game/data';
import { type G } from '@/game/state';
import { type Derived, tollEstimate, canPrestige, prestigeNeed, prestigeGain, doPrestige, threatLevel, heroPower, towerStats } from '@/game/econ';
import { buyStruct, structCost, buyTech, techState, unlockIsland, buyHero, toggleHero, openChest, startBattle } from '@/game/engine';

type PP = { s: G; d: Derived; force: () => void };
const btn = 'rounded-lg px-2 py-1 text-[11px] font-bold transition active:scale-95 disabled:opacity-40';

function outputText(id: StructId, L: number, d: Derived): string {
  const m = lvlMul(L);
  switch (id) {
    case 'oil': return `${fmt(d.oilOut)} بشکه/ث`;
    case 'tank': return `ظرفیت ${fmt(d.oilCap)}`;
    case 'pier': return `${fmt(d.pierCap)} بشکه/ث`;
    case 'refinery': return `${fmt(d.refCap)} بشکه/ث`;
    case 'steel': return `${fmt(d.steelRate)} فولاد/ث`;
    case 'ord': return `${fmt(d.ordRate)} مهمات/ث`;
    case 'power': return `${fmt(40 * m)} MW`;
    case 'desal': return `${fmt(20 * m)} آب`;
    case 'town': return `${fmt(d.tax)} $/ث`;
    case 'welfare': return `رفاه ${Math.min(100, L * 10)}٪`;
    case 'optical': return `عوارض +${L * 5}٪`;
  }
}

function StructRow({ s, d, id, force }: PP & { id: StructId }) {
  const def = STRUCTS[id];
  const L = s.lv[id];
  const [mode, setMode] = useState<1 | 10 | 'max'>(1);
  const c = structCost(s, id, mode);
  const t = tierOf(Math.max(1, L));
  const maxed = L >= MAX_LEVEL;
  return (
    <div className="flex items-center gap-2 rounded-xl bg-slate-800/80 p-2">
      <div className="text-2xl w-9 text-center">{def.icon}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1 text-[12px] font-bold text-white truncate">{def.name}</div>
        <div className="text-[10px] text-slate-400 truncate">{def.desc}</div>
        <div className="text-[10px] text-amber-300">
          {L > 0 ? `سطح ${L} • ${TIER_NAMES[t]} • ${outputText(id, L, d)}` : 'ساخته نشده'}
          {def.power > 0 && <span className="text-sky-300"> • ⚡{def.power * Math.max(1, L)}MW</span>}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1">
        <div className="flex gap-1">
          {([1, 10, 'max'] as const).map((m) => (
            <button key={String(m)} onClick={() => setMode(m)} className={`${btn} ${mode === m ? 'bg-sky-500 text-white' : 'bg-slate-700 text-slate-300'}`}>
              {m === 'max' ? 'حداکثر' : '×' + m}
            </button>
          ))}
        </div>
        <button disabled={maxed || s.usd < c.cost} onClick={() => { buyStruct(s, id, mode); force(); }} className={`${btn} bg-emerald-600 text-white w-full`}>
          {maxed ? 'سطح نهایی' : `${L === 0 ? 'ساخت' : 'ارتقا'} ${c.n > 1 ? '×' + c.n : ''} • 💵${fmt(c.cost)}`}
        </button>
      </div>
    </div>
  );
}

export function EcoPanel(p: PP) {
  const { s, d } = p;
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-1 text-[10px] text-center">
        <div className="rounded-lg bg-slate-800 p-1">🛢️ تولید<br /><b className="text-white">{fmt(d.oilOut)}/s</b></div>
        <div className="rounded-lg bg-slate-800 p-1">💵 صادرات<br /><b className="text-white">{fmt(Math.min(d.pierCap, d.oilOut * s.alpha) * d.oilPrice)}/s</b></div>
        <div className="rounded-lg bg-slate-800 p-1">⚙️ ضریب شبکه<br /><b className={d.grid < 0.8 ? 'text-red-400' : 'text-emerald-400'}>{(d.grid * 100).toFixed(0)}٪</b></div>
      </div>
      {s.rt.blocked && <div className="rounded-lg bg-red-900/70 p-2 text-center text-[11px] font-bold text-red-200">⚠️ مخزن نفت پر است؛ استخراج سکوها متوقف شد! مخزن بسازید یا ظرفیت صادرات/پالایش را بالا ببرید.</div>}
      {STRUCT_ORDER.filter((i) => STRUCTS[i].tab === 'eco').map((id) => <StructRow key={id} {...p} id={id} />)}
      <div className="text-[10px] text-slate-400 leading-5">هزینه ارتقا: Base×1.15^(L−1) • تولید ×۲ در هر ۱۰ سطح • سطح ۱۰/۲۵/۵۰/۱۰۰ ظاهر سازه تغییر می‌کند.</div>
    </div>
  );
}

export function CityPanel(p: PP) {
  const { s, d, force } = p;
  const bar = (label: string, v: number, txt: string, col: string) => (
    <div>
      <div className="flex justify-between text-[10px] text-slate-300"><span>{label}</span><span>{txt}</span></div>
      <div className="h-2 rounded bg-slate-700 overflow-hidden"><div className={`h-full ${col}`} style={{ width: `${Math.max(0, Math.min(1, v)) * 100}%` }} /></div>
    </div>
  );
  return (
    <div className="space-y-2">
      <div className="rounded-xl bg-slate-800/80 p-2 space-y-1.5">
        {bar(`⚡ برق: ${fmt(d.powerProd)} / ${fmt(d.powerCons)} MW (برجک‌ها: ${fmt(d.towerPower)})`, d.powerEff, `${(d.powerEff * 100).toFixed(0)}٪`, d.powerEff < 1 ? 'bg-red-500' : 'bg-yellow-400')}
        {bar(`💧 آب: ${fmt(d.waterProd)} / ${fmt(d.waterCons)}`, d.waterEff, `${(d.waterEff * 100).toFixed(0)}٪`, d.waterEff < 1 ? 'bg-red-500' : 'bg-sky-400')}
        {bar('😊 پایداری ملی', d.stab, `${(d.stab * 100).toFixed(0)}٪ (×${d.mStab.toFixed(2)})`, 'bg-emerald-500')}
        {bar('🛡️ امنیت تنگه', s.security / 100, `${s.security.toFixed(0)} / 100`, 'bg-indigo-400')}
        <div className="text-[10px] text-slate-400">M_Grid = {d.grid.toFixed(2)} روی پالایشگاه‌ها و سرعت شلیک برجک‌های برقی اثر می‌گذارد. کشتی تجاری هر {(15 - 0.1 * s.security).toFixed(1)} ثانیه • عوارض تقریبی {fmt(tollEstimate(s, d))}/ث</div>
        {!s.rt.plantOK && <div className="text-[11px] text-red-300">⛽ سوخت نیروگاه تمام شده؛ تولید برق ۷۰٪ افت کرده است!</div>}
      </div>
      {STRUCT_ORDER.filter((i) => STRUCTS[i].tab === 'city').map((id) => <StructRow key={id} {...p} id={id} />)}
      <div className="text-xs font-bold text-white pt-1">🏝️ آزادسازی جزایر</div>
      {Object.entries(ISLAND_UNLOCK).map(([k, u]) => (
        <div key={k} className="flex items-center justify-between rounded-xl bg-slate-800/80 p-2">
          <div className="text-[12px] text-white">{u.name}<div className="text-[10px] text-slate-400">نیازمند عملیات {u.ops} • جایگاه‌های برجک جدید</div></div>
          {s.islands[k] ? <span className="text-emerald-400 text-xs font-bold">آزاد ✓</span> : (
            <button className={`${btn} bg-amber-500 text-black`} onClick={() => { unlockIsland(s, k); force(); }}>آزادسازی • 💵{fmt(u.cost)}</button>
          )}
        </div>
      ))}
    </div>
  );
}

export function TechPanel({ s, force }: PP) {
  const [br, setBr] = useState(0);
  return (
    <div className="space-y-2">
      <div className="flex gap-1">
        {BRANCH_NAMES.map((n, i) => (
          <button key={i} onClick={() => setBr(i)} className={`flex-1 rounded-lg py-1.5 text-[10px] font-bold ${br === i ? 'bg-sky-500 text-white' : 'bg-slate-700 text-slate-300'}`}>{n}</button>
        ))}
      </div>
      <div className="text-[10px] text-slate-400">پژوهشگاه ملی دفاعی و انرژی — گره‌ها به ترتیب باز می‌شوند ({TECH.filter((t) => t.branch === br && s.tech[t.id]).length}/10)</div>
      {TECH.filter((t) => t.branch === br).map((n) => {
        const st = techState(s, n.id);
        return (
          <div key={n.id} className={`flex items-center gap-2 rounded-xl p-2 ${st === 'done' ? 'bg-emerald-900/50' : 'bg-slate-800/80'} ${st === 'locked' ? 'opacity-50' : ''}`}>
            <div className="w-6 text-center text-lg">{st === 'done' ? '✅' : st === 'locked' ? '🔒' : '🔬'}</div>
            <div className="flex-1 min-w-0">
              <div className="text-[12px] font-bold text-white">{n.idx + 1}. {n.name}</div>
              <div className="text-[10px] text-slate-300">{n.desc}</div>
            </div>
            {st === 'open' && <button disabled={s.usd < n.cost} onClick={() => { buyTech(s, n.id); force(); }} className={`${btn} bg-sky-600 text-white`}>💵{fmt(n.cost)}</button>}
          </div>
        );
      })}
    </div>
  );
}

export function TowersPanel({ s, d, force }: PP) {
  const [got, setGot] = useState<TKind[]>([]);
  const [cat, setCat] = useState(false);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between rounded-xl bg-gradient-to-r from-amber-700 to-amber-500 p-2">
        <div className="text-[12px] font-bold text-white">🎁 صندوقچه غنائم نظامی: {s.chests}</div>
        <button disabled={s.chests <= 0} onClick={() => { setGot(openChest(s)); force(); }} className={`${btn} bg-white text-amber-800`}>باز کردن</button>
      </div>
      {got.length > 0 && (
        <div className="flex justify-center gap-2">{got.map((k, i) => <div key={i} className="animate-bounce rounded-lg bg-slate-700 px-2 py-1 text-center text-[11px] text-white" style={{ animationDelay: `${i * 0.1}s` }}>{TDEF[k].icon}<br />{TDEF[k].name}</div>)}</div>
      )}
      <div className="text-xs font-bold text-white">🃏 کارت‌های نقشه ساخت (قدرت دائمی)</div>
      <div className="grid grid-cols-2 gap-1.5">
        {TKINDS.map((k) => {
          const c = s.cards[k], lv = cardLevel(c);
          const th = [1, 3, 7, 15, 30, 60, 100];
          const next = th[lv] ?? c;
          return (
            <div key={k} className="rounded-xl bg-slate-800/80 p-2 text-[11px] text-white">
              <div className="font-bold">{TDEF[k].icon} {TDEF[k].name}</div>
              <div className="text-amber-300">سطح کارت {lv} • +{lv * 12}٪ آسیب</div>
              <div className="mt-1 h-1.5 rounded bg-slate-700"><div className="h-full rounded bg-amber-400" style={{ width: `${Math.min(100, (c / next) * 100)}%` }} /></div>
              <div className="text-[10px] text-slate-400">{c} / {next}</div>
            </div>
          );
        })}
      </div>
      <div className="text-xs font-bold text-white pt-1">⚓ فرماندهان قهرمان (حداکثر ۲ اعزام)</div>
      {(Object.keys(HEROES) as HeroId[]).map((id) => {
        const h = HEROES[id];
        return (
          <div key={id} className="flex items-center gap-2 rounded-xl bg-slate-800/80 p-2">
            <div className="text-2xl">{h.icon}</div>
            <div className="flex-1 min-w-0"><div className="text-[12px] font-bold text-white">{h.name}</div><div className="text-[10px] text-slate-300">{h.desc}</div></div>
            {!s.heroOwned[id] ? (
              <button disabled={s.usd < h.cost} onClick={() => { buyHero(s, id); force(); }} className={`${btn} bg-amber-500 text-black`}>💵{fmt(h.cost)}</button>
            ) : (
              <button onClick={() => { toggleHero(s, id); force(); }} className={`${btn} ${s.heroDep.includes(id) ? 'bg-emerald-600 text-white' : 'bg-slate-600 text-white'}`}>{s.heroDep.includes(id) ? 'مستقر ✓' : 'اعزام'}</button>
            )}
          </div>
        );
      })}
      <div className="text-[10px] text-slate-400">برای هدایت قهرمان: روی چیپ قهرمان (نوار پایین نقشه) بزنید، سپس نقطه‌ای روی آب را لمس کنید.</div>
      <button onClick={() => setCat(!cat)} className={`${btn} w-full bg-slate-700 text-white`}>{cat ? 'بستن' : 'نمایش'} کاتالوگ ۶ برجک پایه و ۱۲ برجک ویژه</button>
      {cat && TKINDS.map((k) => (
        <div key={k} className="rounded-xl bg-slate-800/80 p-2 text-[11px] text-white">
          <div className="font-bold">{TDEF[k].icon} {TDEF[k].name} <span className="text-slate-400">{TDEF[k].sea ? '🚢' : ''}{TDEF[k].air ? '✈️' : ''}{TDEF[k].sub ? '⚓' : ''}</span></div>
          <div className="text-slate-300">{TDEF[k].desc}</div>
          {SPEC[k].map((sp, i) => <div key={i} className="text-amber-300">★ {sp.icon} {sp.name}: <span className="text-slate-300">{sp.desc}</span></div>)}
        </div>
      ))}
      <div className="text-[10px] text-slate-500">مصرف برق برجک‌ها: {fmt(d.towerPower)} MW</div>
    </div>
  );
}

// ---------- اتاق جنگ ----------
type Score = { name: string; wave: number };
export function WarRoom({ s, onStart, onClose, scores }: { s: G; onStart: () => void; onClose: () => void; scores: Score[] }) {
  const [tab, setTab] = useState(0);
  const go = (mode: 'campaign' | 'infinite' | 'challenge', arg: number) => { if (startBattle(s, mode, arg)) onStart(); };
  return (
    <div className="absolute inset-0 z-40 flex flex-col bg-slate-950/95 p-3" dir="rtl">
      <div className="flex items-center justify-between pb-2">
        <div className="text-base font-extrabold text-white">⚔️ اتاق جنگ</div>
        <button onClick={onClose} className="rounded-full bg-slate-700 px-3 py-1 text-white">✕</button>
      </div>
      <div className="flex gap-1 pb-2">
        {['🎖️ کمپین ۲۵ مرحله', '♾️ بی‌نهایت', '🧪 چالشی'].map((n, i) => (
          <button key={i} onClick={() => setTab(i)} className={`flex-1 rounded-lg py-2 text-[11px] font-bold ${tab === i ? 'bg-red-600 text-white' : 'bg-slate-700 text-slate-300'}`}>{n}</button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto space-y-2">
        {tab === 0 && (
          <>
            <div className="text-[11px] text-slate-300">پیشرفت: {s.done}/{CAMPAIGN_OPS} عملیات • در پایان هر ۵ مرحله یک غول‌آخر حضور دارد. هر عملیات {`۵ تا ۹`} موج دارد.</div>
            <div className="grid grid-cols-5 gap-1.5">
              {Array.from({ length: CAMPAIGN_OPS }, (_, i) => i + 1).map((op) => {
                const ok = op <= s.done + 1;
                const boss = op % 5 === 0;
                return (
                  <button key={op} disabled={!ok} onClick={() => go('campaign', op)}
                    className={`rounded-xl p-1.5 text-center text-[11px] font-bold ${op <= s.done ? 'bg-emerald-700 text-white' : ok ? 'bg-amber-500 text-black' : 'bg-slate-800 text-slate-500'}`}>
                    <div className="text-base">{boss ? '☠️' : op <= s.done ? '✅' : ok ? '⚔️' : '🔒'}</div>
                    {op}
                    <div className="text-[8px] font-normal">{opWaves(op)} موج • {WEATHER_NAMES[opWeather(op)]}</div>
                  </button>
                );
              })}
            </div>
          </>
        )}
        {tab === 1 && (
          <div className="space-y-2">
            <div className="rounded-xl bg-slate-800 p-3 text-[12px] text-slate-200 leading-6">موج‌های بی‌پایان با قدرت تصاعدی (HP ×1.22 در هر موج). هر ۵ موج یک غول‌آخر. رکورد شما: <b className="text-amber-300">موج {s.bestWave}</b></div>
            <button onClick={() => go('infinite', 0)} className="w-full rounded-xl bg-red-600 py-3 text-sm font-extrabold text-white">شروع نبرد بی‌نهایت</button>
            <div className="text-xs font-bold text-white">🏆 برترین‌ها</div>
            {scores.length === 0 && <div className="text-[11px] text-slate-400">هنوز رکوردی ثبت نشده.</div>}
            {scores.map((r, i) => <div key={i} className="flex justify-between rounded-lg bg-slate-800 px-3 py-1.5 text-[12px] text-white"><span>{i + 1}. {r.name}</span><b className="text-amber-300">موج {r.wave}</b></div>)}
          </div>
        )}
        {tab === 2 && CHALLENGES.map((c) => (
          <div key={c.id} className="rounded-xl bg-slate-800 p-3">
            <div className="flex justify-between text-sm font-bold text-white"><span>{c.name}</span><span>{s.chDone.includes(c.id) ? '✅' : ''}</span></div>
            <div className="text-[11px] text-slate-300 py-1">{c.desc} • {c.waves} موج • {WEATHER_NAMES[c.weather]}</div>
            <div className="text-[10px] text-amber-300">جایزه: ۲ صندوقچه (فناوری کمیاب) + دلار</div>
            <button onClick={() => go('challenge', c.id)} className="mt-2 w-full rounded-lg bg-purple-600 py-2 text-xs font-bold text-white">شروع چالش</button>
          </div>
        ))}
        <div className="rounded-xl bg-slate-900 p-2 text-[10px] text-slate-400 leading-5">نکته: برجک‌ها دائمی‌اند و در همه نبردها حضور دارند. مهمات هر شلیک از زرادخانه کسر می‌شود؛ با کمبود مهمات سرعت شلیک ⅓ می‌شود.</div>
      </div>
    </div>
  );
}

export function Settings({ s, d, onClose, force }: { s: G; d: Derived; onClose: () => void; force: () => void }) {
  const can = canPrestige(s);
  const [confirm, setConfirm] = useState(false);
  const [msg, setMsg] = useState('');
  return (
    <div className="absolute inset-0 z-40 flex flex-col bg-slate-950/95 p-3 overflow-y-auto" dir="rtl">
      <div className="flex items-center justify-between pb-2"><div className="text-base font-extrabold text-white">⚙️ تنظیمات و طرح جامع توسعه</div><button onClick={onClose} className="rounded-full bg-slate-700 px-3 py-1 text-white">✕</button></div>
      <div className="space-y-2 text-white text-[12px]">
        <label className="flex items-center justify-between rounded-xl bg-slate-800 p-2">نام فرمانده<input value={s.name} maxLength={20} onChange={(e) => { s.name = e.target.value; force(); }} className="rounded bg-slate-700 px-2 py-1 text-white w-32 text-left" /></label>
        <button className="w-full rounded-xl bg-slate-800 p-2 text-right" onClick={() => { s.sound = !s.sound; force(); }}>🔊 صدا: {s.sound ? 'روشن' : 'خاموش'}</button>
        <button className="w-full rounded-xl bg-slate-800 p-2 text-right" onClick={() => { s.haptics = !s.haptics; force(); }}>📳 لرزش: {s.haptics ? 'روشن' : 'خاموش'}</button>
        <div className="rounded-xl bg-gradient-to-br from-indigo-900 to-purple-900 p-3 space-y-1">
          <div className="font-extrabold">🏛️ امضای فرمان «طرح جامع توسعه ملی»</div>
          <div className="text-[11px] text-slate-200 leading-5">ریست: سطح سازه‌ها، برجک‌ها، فناوری و پول نقد. حفظ: کارت‌ها، قهرمانان، جزایر، پیشرفت کمپین. پاداش: «نشان اقتدار استراتژیک» که تولید ×(۱+۰٫۲۵) و آسیب برجک‌ها ×(۱+۰٫۲) را برای همیشه افزایش می‌دهد.</div>
          <div className="text-[11px]">نشان‌های فعلی: <b className="text-amber-300">{s.badges}</b> • دارایی این دوره: {fmt(s.runEarned)} / نیاز: {fmt(prestigeNeed(s))} • عملیات ≥ ۳: {s.done >= 3 ? '✓' : '✗'}</div>
          {!confirm ? (
            <button disabled={!can} onClick={() => setConfirm(true)} className="w-full rounded-lg bg-amber-500 py-2 text-xs font-extrabold text-black disabled:opacity-40">فاز جدید (+{prestigeGain(s)} نشان)</button>
          ) : (
            <div className="flex gap-2"><button onClick={() => { const g = doPrestige(s); setMsg(`+${g} نشان اقتدار دریافت شد!`); setConfirm(false); force(); }} className="flex-1 rounded-lg bg-red-600 py-2 text-xs font-bold">تایید نهایی</button><button onClick={() => setConfirm(false)} className="flex-1 rounded-lg bg-slate-600 py-2 text-xs">انصراف</button></div>
          )}
          {msg && <div className="text-emerald-300 text-xs">{msg}</div>}
        </div>
        <div className="rounded-xl bg-slate-800 p-2 text-[11px] text-slate-300 leading-5">
          شاخص دفاع در برابر تهدید (آفلاین): قدرت برجک‌ها+قهرمانان {fmt(heroPower(s) + Object.values(s.towers).reduce((a, t) => a + towerStats(s, t, d).dps, 0))} در برابر تهدید منطقه {fmt(threatLevel(s))}.<br />
          درآمد آفلاین = نرخ خالص × زمان × ۰٫۵ × R_Def (حداکثر ۱۲ ساعت).
        </div>
        <button className="w-full rounded-xl bg-red-900/70 p-2 text-red-200" onClick={() => { if (window.confirm('تمام پیشرفت پاک شود؟')) { (window as unknown as { __noSave?: boolean }).__noSave = true; localStorage.removeItem('hormuz-sovereign-v1'); window.location.reload(); } }}>🗑️ پاک کردن کامل ذخیره</button>
      </div>
    </div>
  );
}
