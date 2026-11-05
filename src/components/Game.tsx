'use client';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { WORLD, SLOTS, STRUCTS, STRUCT_ORDER, TDEF, SPEC, TKINDS, SPELLS, HEROES, PRIO_NAMES, isLand, upgradeCost, fmt, type TKind, type HeroId } from '@/game/data';
import { type G, loadGame, newGame, saveGame, dist, initHeroes } from '@/game/state';
import { derive, applyOffline, towerStats, type OfflineReport } from '@/game/econ';
import {
  tick, buildTower, upgradeTower, evolveTower, sellTower, cyclePrio, slotUnlocked, castSpell, moveHero, tapSpill, tapSmuggler, callWaveEarly,
  abortBattle, closeBattle, toast,
} from '@/game/engine';
import { render, darkness, type Cam, type UI } from '@/game/render';
import { sfxCfg, play } from '@/game/sfx';
import { EcoPanel, CityPanel, TechPanel, TowersPanel, WarRoom, Settings } from './panels';

type Tab = 'eco' | 'towers' | 'city' | 'tech' | null;
const TABS: { id: Exclude<Tab, null>; label: string; icon: string }[] = [
  { id: 'eco', label: 'اقتصاد نفت', icon: '🏭' },
  { id: 'towers', label: 'برجک‌ها و کارت‌ها', icon: '🗼' },
  { id: 'city', label: 'شهرسازی', icon: '🏙️' },
  { id: 'tech', label: 'فناوری', icon: '🔬' },
];

export default function Game() {
  const [s] = useState<G>(() => loadGame() ?? newGame());
  const [, force] = useReducer((x: number) => x + 1, 0);
  const [tab, setTab] = useState<Tab>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [prevKind, setPrevKind] = useState<TKind | null>(null);
  const [aim, setAim] = useState(false);
  const [heroSel, setHeroSel] = useState<HeroId | null>(null);
  const [war, setWar] = useState(false);
  const [settings, setSettings] = useState(false);
  const [offline, setOffline] = useState<OfflineReport | null>(null);
  const [scores, setScores] = useState<{ name: string; wave: number }[]>([]);

  const wrap = useRef<HTMLDivElement>(null);
  const cvs = useRef<HTMLCanvasElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const size = useRef({ W: 400, H: 600, dpr: 1 });
  const cam = useRef<Cam>({ x: 400, y: 700, zoom: 0.6 });
  const uiRef = useRef<UI>({ sel: null, prevKind: null, aim: false, aimX: 0, aimY: 0, heroSel: null });
  uiRef.current.sel = sel; uiRef.current.prevKind = prevKind; uiRef.current.aim = aim; uiRef.current.heroSel = heroSel;
  const ptrs = useRef(new Map<number, { x: number; y: number }>());
  const gest = useRef({ moved: 0, pd: 0, pz: 1, t: 0 });

  const minZoom = () => Math.max(size.current.W / WORLD.w, size.current.H / WORLD.h);
  const clampCam = useCallback(() => {
    const c = cam.current, { W, H } = size.current;
    c.zoom = Math.max(minZoom(), Math.min(2.8, c.zoom));
    const hw = W / (2 * c.zoom), hh = H / (2 * c.zoom);
    c.x = hw * 2 >= WORLD.w ? WORLD.w / 2 : Math.max(hw, Math.min(WORLD.w - hw, c.x));
    c.y = hh * 2 >= WORLD.h ? WORLD.h / 2 : Math.max(hh, Math.min(WORLD.h - hh, c.y));
  }, []);

  // اندازه بوم
  useEffect(() => {
    const el = wrap.current, cv = cvs.current;
    if (!el || !cv) return;
    const fit = () => {
      const r = el.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      size.current = { W: r.width, H: r.height, dpr };
      cv.width = Math.floor(r.width * dpr); cv.height = Math.floor(r.height * dpr);
      clampCam();
    };
    fit();
    cam.current.zoom = minZoom();
    clampCam();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [clampCam]);

  // آفلاین + ذخیره
  useEffect(() => {
    sfxCfg.sound = s.sound; sfxCfg.haptics = s.haptics;
    const rep = applyOffline(s);
    s.lastSeen = Date.now();
    initHeroes(s);
    if (rep) setOffline(rep);
    const doSave = () => { if (!(window as unknown as { __noSave?: boolean }).__noSave) saveGame(s); };
    const vis = () => {
      if (document.visibilityState === 'hidden') doSave();
      else { const r = applyOffline(s); s.lastSeen = Date.now(); if (r) setOffline(r); }
    };
    document.addEventListener('visibilitychange', vis);
    window.addEventListener('pagehide', doSave);
    const iv = setInterval(doSave, 5000);
    const ui = setInterval(force, 250);
    return () => { document.removeEventListener('visibilitychange', vis); window.removeEventListener('pagehide', doSave); clearInterval(iv); clearInterval(ui); };
  }, [s]);

  useEffect(() => { sfxCfg.sound = s.sound; sfxCfg.haptics = s.haptics; });

  // حلقه اصلی
  useEffect(() => {
    let raf = 0, last = performance.now();
    const cv = cvs.current!;
    const ctx = cv.getContext('2d')!;
    const loop = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      tick(s, dt);
      const d = derive(s);
      const { W, H, dpr } = size.current;
      render(ctx, s, d, cam.current, W, H, dpr, uiRef.current, now / 1000);
      const m = menuRef.current;
      if (m && uiRef.current.sel) {
        const sl = SLOTS.find((x) => x.id === uiRef.current.sel)!;
        const c = cam.current;
        let px = (sl.x - c.x) * c.zoom + W / 2, py = (sl.y - c.y) * c.zoom + H / 2;
        px = Math.max(95, Math.min(W - 95, px)); py = Math.max(105, Math.min(H - 105, py));
        m.style.transform = `translate(${px}px, ${py}px)`;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [s]);

  useEffect(() => { fetch('/api/scores').then((r) => r.json()).then((j) => setScores(j.scores ?? [])).catch(() => {}); }, [war]);

  const toWorld = (px: number, py: number) => {
    const c = cam.current, { W, H } = size.current;
    return { x: (px - W / 2) / c.zoom + c.x, y: (py - H / 2) / c.zoom + c.y };
  };

  const onTap = (px: number, py: number) => {
    const { x, y } = toWorld(px, py);
    const z = cam.current.zoom;
    if (heroSel) {
      if (isLand(x, y)) toast(s, 'قهرمان را روی آب هدایت کنید'); else moveHero(s, heroSel, x, y);
      setHeroSel(null); return;
    }
    if (tapSpill(s, x, y) || tapSmuggler(s, x, y)) return;
    for (const id of s.heroDep) {
      const h = s.rt.hero[id];
      if (h && dist(h.x, h.y, x, y) < 26) { setHeroSel(id); toast(s, 'نقطه مقصد را روی آب لمس کنید'); return; }
    }
    let best: string | null = null, bd = Math.max(26, 30 / z);
    for (const sl of SLOTS) { const dd = dist(sl.x, sl.y, x, y); if (dd < bd) { bd = dd; best = sl.id; } }
    if (best) {
      if (!slotUnlocked(s, best)) { toast(s, 'این جزیره قفل است؛ از تب شهرسازی آزادش کنید'); return; }
      setSel(best); setPrevKind(null); setTab(null); play('build'); return;
    }
    for (const id of STRUCT_ORDER) {
      const st = STRUCTS[id];
      if (dist(st.x, st.y, x, y) < 28) { setTab(st.tab === 'eco' ? 'eco' : 'city'); setSel(null); return; }
    }
    setSel(null);
  };

  const rectPos = (e: React.PointerEvent) => { const r = cvs.current!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const onDown = (e: React.PointerEvent) => {
    cvs.current!.setPointerCapture(e.pointerId);
    const p = rectPos(e);
    ptrs.current.set(e.pointerId, p);
    if (ptrs.current.size === 1) {
      gest.current.moved = 0; gest.current.t = performance.now();
      if (aim) { const w = toWorld(p.x, p.y); uiRef.current.aimX = w.x; uiRef.current.aimY = w.y; }
    } else if (ptrs.current.size === 2) {
      const [a, b] = [...ptrs.current.values()];
      gest.current.pd = Math.hypot(a.x - b.x, a.y - b.y); gest.current.pz = cam.current.zoom; gest.current.moved = 999;
    }
  };
  const onMove = (e: React.PointerEvent) => {
    const prev = ptrs.current.get(e.pointerId);
    if (!prev) return;
    const p = rectPos(e);
    ptrs.current.set(e.pointerId, p);
    if (ptrs.current.size === 2) {
      const [a, b] = [...ptrs.current.values()];
      const dd = Math.hypot(a.x - b.x, a.y - b.y);
      if (gest.current.pd > 0) { cam.current.zoom = gest.current.pz * (dd / gest.current.pd); clampCam(); }
    } else if (aim) {
      const w = toWorld(p.x, p.y); uiRef.current.aimX = w.x; uiRef.current.aimY = w.y;
    } else {
      const dx = p.x - prev.x, dy = p.y - prev.y;
      gest.current.moved += Math.abs(dx) + Math.abs(dy);
      cam.current.x -= dx / cam.current.zoom; cam.current.y -= dy / cam.current.zoom; clampCam();
    }
  };
  const onUp = (e: React.PointerEvent) => {
    const had = ptrs.current.size;
    const p = ptrs.current.get(e.pointerId);
    ptrs.current.delete(e.pointerId);
    if (had !== 1 || !p) return;
    if (aim) {
      castSpell(s, 0, uiRef.current.aimX, uiRef.current.aimY);
      setAim(false); force(); return;
    }
    if (gest.current.moved < 10 && performance.now() - gest.current.t < 600) onTap(p.x, p.y);
  };
  const onWheel = (e: React.WheelEvent) => { cam.current.zoom *= e.deltaY < 0 ? 1.12 : 0.89; clampCam(); };
  const cycleZoom = () => {
    const mz = minZoom();
    const lv = [mz, Math.max(mz * 1.01, 1), 1.8];
    const nx = lv.find((l) => l > cam.current.zoom * 1.05) ?? lv[0];
    cam.current.zoom = nx; clampCam();
  };

  const d = derive(s);
  const rt = s.rt, b = rt.battle;
  const dark = darkness(s);
  const cycleSpeed = () => { s.speed = s.speed >= 3 ? 1 : s.speed + 1; force(); };
  const selTower = sel ? s.towers[sel] : undefined;
  const callable = !!b && !b.over && b.queue.length === 0 && (b.mode === 'infinite' || b.wave < b.total);

  const res: [string, number, string][] = [
    ['💵', s.usd, rt.incRate > 0 ? `+${fmt(rt.incRate)}/s` : ''], ['🛢️', s.oil, `/${fmt(d.oilCap)}`], ['⛽', s.fuel, ''], ['🏗️', s.steel, ''], ['🚀', s.ord, ''],
  ];
  const net = d.powerProd - d.powerCons;

  return (
    <div className="fixed inset-0 flex justify-center bg-black select-none" dir="rtl" style={{ fontFamily: 'Tahoma, Vazirmatn, system-ui, sans-serif' }}>
      <div className="relative flex h-full w-full max-w-[480px] flex-col bg-slate-900 text-white">
        {/* HUD */}
        <div className="z-10 bg-slate-950/95 px-1.5 pt-1 pb-1 shadow-lg">
          <div className="flex justify-between gap-1">
            {res.map(([ic, v, sub], i) => (
              <div key={i} className={`flex-1 rounded-lg bg-slate-800 px-1 py-0.5 text-center leading-tight ${i === 4 && v < 5 ? 'ring-1 ring-red-500' : ''} ${i === 1 && rt.blocked ? 'animate-pulse ring-1 ring-red-500' : ''}`}>
                <div className="text-[12px] font-bold">{ic} {fmt(v)}</div>
                <div className="text-[8px] text-slate-400 h-2.5">{sub}</div>
              </div>
            ))}
          </div>
          <div className="mt-1 flex items-center justify-between gap-1 text-[11px]">
            <span className={`rounded bg-slate-800 px-1.5 py-0.5 ${net < 0 ? 'text-red-400' : 'text-yellow-300'}`}>⚡ {net >= 0 ? '+' : ''}{fmt(net)}MW</span>
            <span className="rounded bg-slate-800 px-1.5 py-0.5">😊 {(d.stab * 100).toFixed(0)}%</span>
            <span className="rounded bg-slate-800 px-1.5 py-0.5">🛡️ {s.security.toFixed(0)}</span>
            {b ? (
              <>
                <span className={`rounded bg-slate-800 px-1.5 py-0.5 ${b.hearts <= 6 ? 'text-red-400 animate-pulse' : ''}`}>❤️ {b.hearts}/20</span>
                <span className="rounded bg-slate-800 px-1.5 py-0.5">🌊 {b.wave}{b.mode === 'infinite' ? '' : `/${b.total}`}</span>
              </>
            ) : <span className="rounded bg-slate-800 px-1.5 py-0.5">{dark > 0.4 ? '🌙' : '☀️'} {rt.storm > 0 ? '🌪️' : ''}</span>}
            <button onClick={cycleSpeed} className="rounded bg-amber-500 px-2 py-0.5 font-extrabold text-black">⏩ {s.speed}x</button>
          </div>
        </div>

        {/* نقشه */}
        <div ref={wrap} className="relative flex-1 overflow-hidden">
          <canvas ref={cvs} className="absolute inset-0 h-full w-full touch-none" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onWheel={onWheel} />

          {/* دکمه‌های کناری */}
          <div className="absolute left-2 top-[38%] flex flex-col gap-2">
            <button onClick={() => { setWar(true); setSel(null); }} className="h-11 w-11 rounded-full bg-red-600/90 text-xl shadow-lg ring-2 ring-white/30 active:scale-95">⚔️</button>
            <button onClick={cycleZoom} className="h-9 w-11 rounded-full bg-slate-800/90 text-lg shadow ring-1 ring-white/20">🔍</button>
            <button onClick={() => setSettings(true)} className="h-9 w-11 rounded-full bg-slate-800/90 text-lg shadow ring-1 ring-white/20">⚙️</button>
          </div>

          {/* رویداد */}
          {rt.ev && (
            <div className="pointer-events-none absolute left-1/2 top-1 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1 text-[11px] font-bold">
              {rt.ev.type === 'spill' ? `🛢️ نشت نفت — روی لکه بزنید (${Math.ceil(rt.ev.handled > 0 ? rt.ev.handled : rt.ev.t)}s)` : rt.ev.type === 'storm' ? `🌪️ طوفان مونسون ${Math.ceil(rt.ev.t)}s` : `🏆 اسکورت VIP: ${Math.round((rt.ev.hp / rt.ev.maxHp) * 100)}٪ سلامت`}
            </div>
          )}
          {aim && (
            <div className="absolute inset-x-0 top-8 flex justify-center">
              <div className="flex items-center gap-2 rounded-full bg-red-700 px-3 py-1 text-[11px] font-bold">🎯 روی نقشه بکشید و رها کنید <button className="rounded bg-black/40 px-2" onClick={() => setAim(false)}>لغو</button></div>
            </div>
          )}
          {!s.tutorial && (
            <div className="absolute inset-x-3 top-10 rounded-xl bg-slate-950/90 p-3 text-[11px] leading-5 ring-1 ring-sky-500">
              <b className="text-sky-300">🇮🇷 خوش آمدید فرمانده!</b> ۱) در تب «اقتصاد نفت» سازه‌ها را ارتقا دهید و شیر نفت را تنظیم کنید. ۲) روی جایگاه 🔨 لب ساحل بزنید و برجک بسازید. ۳) با ⚔️ نبرد را شروع کنید. نقشه را بکشید/زوم کنید.
              <button className="mt-1 block rounded bg-sky-600 px-3 py-1 font-bold" onClick={() => { s.tutorial = true; force(); }}>متوجه شدم</button>
            </div>
          )}

          {/* منوی دایره‌ای */}
          {sel && (
            <div ref={menuRef} className="absolute left-0 top-0 z-20 h-0 w-0">
              <RadialMenu s={s} slotId={sel} prevKind={prevKind} setPrevKind={setPrevKind} close={() => setSel(null)} force={force} />
            </div>
          )}
          {sel && <TowerCard s={s} slotId={sel} prevKind={prevKind} d={d} force={force} />}

          {/* پایین نقشه */}
          <div className="pointer-events-none absolute bottom-14 left-2 flex max-w-[55%] flex-col gap-1">
            {rt.toasts.map((t) => <div key={t.id} className="rounded-lg bg-black/70 px-2 py-1 text-[11px] leading-4">{t.text}</div>)}
          </div>
          {callable && (
            <button onClick={() => { callWaveEarly(s); force(); }} className="absolute bottom-14 right-2 rounded-xl bg-gradient-to-b from-red-500 to-red-800 px-3 py-2 text-[12px] font-extrabold shadow-lg ring-2 ring-white/30 active:scale-95">
              💀 موج بعد (+۲۵٪) <span className="text-yellow-200">{Math.ceil(b!.timer)}s</span>
            </button>
          )}
          {(b || s.heroDep.length > 0) && !b?.over && (
            <div className="absolute inset-x-1 bottom-1 flex items-center gap-1">
              {s.heroDep.map((id) => (
                <button key={id} onClick={() => { setHeroSel(heroSel === id ? null : id); setSel(null); }} className={`h-11 w-11 rounded-xl text-xl ring-2 ${heroSel === id ? 'bg-yellow-400 ring-yellow-200' : 'bg-sky-800/90 ring-sky-400/40'}`} title={HEROES[id].name}>{HEROES[id].icon}</button>
              ))}
              {b && SPELLS.map((sp, i) => {
                const cd = rt.spellCd[i];
                return (
                  <button key={sp.id} disabled={cd > 0} onClick={() => { if (i === 0) { setAim(true); setSel(null); uiRef.current.aimX = cam.current.x; uiRef.current.aimY = cam.current.y; } else castSpell(s, i); force(); }}
                    className={`relative h-11 flex-1 overflow-hidden rounded-xl text-[10px] font-bold ring-1 ${i === 2 && rt.over > 0 ? 'bg-orange-500 ring-yellow-300' : 'bg-slate-800/95 ring-white/20'}`}>
                    <div className="text-base leading-4">{sp.icon}</div>{sp.name}
                    {cd > 0 && <div className="absolute inset-0 flex items-center justify-center bg-black/70 text-sm">{Math.ceil(cd)}</div>}
                  </button>
                );
              })}
              {b && <button onClick={() => { if (window.confirm('عقب‌نشینی از نبرد؟')) { abortBattle(s); force(); } }} className="h-11 rounded-xl bg-slate-800/95 px-2 text-[10px] ring-1 ring-white/20">🏳️<br />عقب‌نشینی</button>}
            </div>
          )}

          {/* پنل‌ها */}
          {tab && (
            <div className="absolute inset-x-0 bottom-0 z-30 flex h-[58%] flex-col rounded-t-2xl bg-slate-900/97 shadow-2xl ring-1 ring-white/10">
              <div className="flex items-center justify-between px-3 py-1.5 text-sm font-bold">
                <span>{TABS.find((t) => t.id === tab)!.icon} {TABS.find((t) => t.id === tab)!.label}</span>
                <button onClick={() => setTab(null)} className="rounded-full bg-slate-700 px-2.5 text-xs">▼</button>
              </div>
              <div className="flex-1 overflow-y-auto px-2 pb-3">
                {tab === 'eco' && <EcoPanel s={s} d={d} force={force} />}
                {tab === 'towers' && <TowersPanel s={s} d={d} force={force} />}
                {tab === 'city' && <CityPanel s={s} d={d} force={force} />}
                {tab === 'tech' && <TechPanel s={s} d={d} force={force} />}
              </div>
            </div>
          )}

          {war && !b && <WarRoom s={s} scores={scores} onClose={() => setWar(false)} onStart={() => { setWar(false); setTab(null); cam.current.zoom = minZoom(); clampCam(); force(); }} />}
          {war && b && <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/80"><div className="rounded-xl bg-slate-800 p-4 text-center text-sm">نبرد در جریان است.<br /><button className="mt-2 rounded bg-slate-600 px-3 py-1" onClick={() => setWar(false)}>بستن</button></div></div>}
          {settings && <Settings s={s} d={d} onClose={() => setSettings(false)} force={force} />}

          {b?.over && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
              <div className={`w-full rounded-2xl p-5 text-center ring-2 ${b.over === 'win' ? 'bg-emerald-900 ring-emerald-400' : 'bg-red-950 ring-red-500'}`}>
                <div className="text-4xl">{b.over === 'win' ? '🏆' : '💥'}</div>
                <div className="mt-1 text-lg font-extrabold">{b.over === 'win' ? 'پیروزی! تنگه هرمز امن ماند' : 'شکست؛ خط دفاعی شکسته شد'}</div>
                <div className="mt-2 text-xs text-slate-200">موج‌ها: {b.wave} • ناوهای منهدم‌شده: {b.kills} • غنیمت نبرد: 💵{fmt(b.earned)}</div>
                {b.reward && <div className="mt-1 text-sm font-bold text-amber-300">{b.reward}</div>}
                <button onClick={() => { closeBattle(s); force(); }} className="mt-3 w-full rounded-xl bg-white py-2 font-extrabold text-black">بازگشت به فرماندهی</button>
              </div>
            </div>
          )}
          {offline && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
              <div className="w-full rounded-2xl bg-slate-800 p-5 text-center ring-2 ring-sky-400">
                <div className="text-3xl">🌅</div>
                <div className="text-base font-extrabold">گزارش غیبت فرمانده</div>
                <div className="mt-2 text-xs leading-6 text-slate-200">
                  مدت غیبت: {Math.floor(offline.T / 3600)} ساعت و {Math.floor((offline.T % 3600) / 60)} دقیقه<br />
                  قدرت دفاع برجی: {fmt(offline.dps)} در برابر تهدید {fmt(offline.threat)}<br />
                  <b className="text-amber-300">R_Def = {offline.R.toFixed(2)}</b> {offline.R >= 1 ? '— دفاع کامل؛ ۱۰۰٪ درآمد آفلاین دریافت شد' : '— برجک‌های بیشتر بسازید تا درآمد کامل شود'}<br />
                  <span className="text-lg font-extrabold text-emerald-300">+💵 {fmt(offline.usd)}</span>
                </div>
                <button onClick={() => setOffline(null)} className="mt-3 w-full rounded-xl bg-sky-500 py-2 font-extrabold">دریافت</button>
              </div>
            </div>
          )}
        </div>

        {/* شیر نفت */}
        <div className="bg-slate-950 px-3 py-1">
          <div className="flex items-center gap-2 text-[11px]">
            <span className="whitespace-nowrap font-bold">🛢️ شیر نفت</span>
            <span className="w-10 text-center text-emerald-300">{Math.round(s.alpha * 100)}٪ 💵</span>
            <input type="range" min={0} max={100} value={Math.round(s.alpha * 100)} onChange={(e) => { s.alpha = Number(e.target.value) / 100; force(); }} className="h-2 flex-1 accent-amber-400" style={{ direction: 'ltr' }} />
            <span className="w-10 text-center text-sky-300">{Math.round((1 - s.alpha) * 100)}٪ ⛽</span>
          </div>
        </div>
        {/* منوی اصلی */}
        <div className="grid grid-cols-4 bg-slate-950 pb-1 pt-0.5">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => { setTab(tab === t.id ? null : t.id); setSel(null); }} className={`flex flex-col items-center py-1 text-[10px] font-bold ${tab === t.id ? 'text-amber-300' : 'text-slate-300'}`}>
              <span className="text-lg leading-5">{t.icon}</span>{t.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------- منوی دایره‌ای ----------
function Btn({ x, y, children, onClick, active, gold, dim }: { x: number; y: number; children: React.ReactNode; onClick: () => void; active?: boolean; gold?: boolean; dim?: boolean }) {
  return (
    <button onPointerDown={(e) => e.stopPropagation()} onClick={onClick}
      className={`absolute flex h-11 w-11 flex-col items-center justify-center rounded-full text-[9px] font-bold leading-3 shadow-lg ring-2 ${gold ? 'bg-amber-500 text-black ring-yellow-200' : active ? 'bg-sky-500 ring-white' : 'bg-slate-800/95 ring-white/30'} ${dim ? 'opacity-50' : ''}`}
      style={{ left: x - 22, top: y - 22 }}>{children}</button>
  );
}

function RadialMenu({ s, slotId, prevKind, setPrevKind, close, force }: { s: G; slotId: string; prevKind: TKind | null; setPrevKind: (k: TKind) => void; close: () => void; force: () => void }) {
  const t = s.towers[slotId];
  const R = 66;
  if (!t) {
    return (
      <>
        <div className="absolute rounded-full border-2 border-dashed border-amber-300/60" style={{ left: -R - 24, top: -R - 24, width: (R + 24) * 2, height: (R + 24) * 2 }} />
        {TKINDS.map((k, i) => {
          const a = (-90 + i * 60) * (Math.PI / 180);
          const def = TDEF[k];
          const banned = s.rt.battle?.ban.includes(k);
          const ok = s.usd >= def.usd && s.steel >= def.steel && !banned;
          return (
            <Btn key={k} x={Math.cos(a) * R} y={Math.sin(a) * R} active={prevKind === k} dim={!ok} onClick={() => setPrevKind(k)}>
              <span className="text-base leading-4">{def.icon}</span>
              <span className="text-yellow-300">{def.usd}</span>
            </Btn>
          );
        })}
        <Btn x={0} y={0} onClick={close}>✕</Btn>
      </>
    );
  }
  const up = upgradeCost(t.kind, t.tier);
  const refund = Math.round(t.inv.usd * (s.tech.t3 ? 0.8 : 0.5));
  return (
    <>
      <div className="absolute rounded-full border-2 border-dashed border-emerald-300/50" style={{ left: -R - 24, top: -R - 24, width: (R + 24) * 2, height: (R + 24) * 2 }} />
      {t.tier < 3 && <Btn x={0} y={-R} dim={s.usd < up.usd || s.steel < up.steel} onClick={() => { upgradeTower(s, slotId); force(); }}>⬆️<span className="text-yellow-300">{fmt(up.usd)}</span></Btn>}
      {t.tier === 3 && (
        <>
          <Btn x={-30} y={-R} gold onClick={() => { evolveTower(s, slotId, 1); force(); }}><span className="text-base">{SPEC[t.kind][0].icon}</span>الف</Btn>
          <Btn x={30} y={-R} gold onClick={() => { evolveTower(s, slotId, 2); force(); }}><span className="text-base">{SPEC[t.kind][1].icon}</span>ب</Btn>
        </>
      )}
      {t.tier === 4 && <Btn x={0} y={-R} gold onClick={() => {}}>⭐<span>نهایی</span></Btn>}
      <Btn x={-R} y={0} onClick={() => { cyclePrio(s, slotId); force(); }}>🎯<span>{PRIO_NAMES[t.prio]}</span></Btn>
      <Btn x={0} y={R} onClick={() => { sellTower(s, slotId); close(); force(); }}>💰<span className="text-emerald-300">{fmt(refund)}</span></Btn>
      <Btn x={R} y={0} onClick={close}>✕</Btn>
    </>
  );
}

function TowerCard({ s, slotId, prevKind, d, force }: { s: G; slotId: string; prevKind: TKind | null; d: ReturnType<typeof derive>; force: () => void }) {
  const t = s.towers[slotId];
  const icons = (a: boolean, b: boolean, c: boolean) => `${b ? '🚢' : ''}${a ? '✈️' : ''}${c ? '⚓' : ''}`;
  if (!t) {
    if (!prevKind) return <div className="pointer-events-none absolute inset-x-6 top-2 rounded-xl bg-black/70 p-2 text-center text-[11px]">یک برجک را برای دیدن برد و جزئیات انتخاب کنید</div>;
    const def = TDEF[prevKind];
    const st = towerStats(s, { kind: prevKind, tier: 1, sp: 0, prio: 0, cd: 0, ang: 0, dis: 0, inv: { usd: 0, steel: 0 }, laserT: 0, laserId: 0, mineCd: 0, icd: 0, aura: 0, jam: 0, flash: 0 }, d);
    const ok = s.usd >= def.usd && s.steel >= def.steel && !s.rt.battle?.ban.includes(prevKind);
    return (
      <div className="absolute inset-x-2 top-2 z-20 flex items-center gap-2 rounded-xl bg-slate-950/90 p-2 ring-1 ring-white/20">
        <div className="flex-1 text-[11px] leading-4">
          <div className="font-extrabold text-amber-300">{def.icon} {def.name} <span>{icons(def.air, def.sea, def.sub)}</span></div>
          <div className="text-slate-300">{def.desc}</div>
          <div className="text-slate-400">آسیب {fmt(st.dmg)} • شلیک {st.rate.toFixed(1)}/s • برد {Math.round(st.range)} {st.power > 0 ? `• ⚡${st.power}MW` : ''} • 🚀{def.ammo}/شلیک</div>
        </div>
        <button disabled={!ok} onClick={() => { buildTower(s, slotId, prevKind); force(); }} className="rounded-lg bg-emerald-600 px-3 py-2 text-[11px] font-extrabold disabled:opacity-40">🔨 ساخت<br />💵{def.usd} 🏗️{def.steel}</button>
      </div>
    );
  }
  const st = towerStats(s, t, d);
  const def = TDEF[t.kind];
  const sp = t.sp ? SPEC[t.kind][t.sp - 1] : null;
  return (
    <div className="absolute inset-x-2 top-2 z-20 rounded-xl bg-slate-950/90 p-2 text-[11px] leading-4 ring-1 ring-white/20">
      <div className="font-extrabold text-amber-300">{sp ? sp.icon : def.icon} {sp ? sp.name : def.name} — سطح {t.tier} <span>{icons(st.air, st.sea, st.sub)}</span></div>
      <div className="text-slate-300">{sp ? sp.desc : def.desc}</div>
      <div className="text-slate-400">DPS≈{fmt(st.dps)} • برد {Math.round(st.range)} • شلیک {st.rate.toFixed(1)}/s • هدف: {PRIO_NAMES[t.prio]} {st.power > 0 ? `• ⚡${st.power}MW` : ''}</div>
      {t.tier === 3 && (
        <div className="mt-1 space-y-0.5 text-[10px]">
          {!s.tech.t5 && <div className="text-red-300">🔒 برای انشعاب سطح ۴ فناوری «باز کردن انشعاب سطح ۴» (شاخه مهندسی برجک، گره ۵) لازم است.</div>}
          {[0, 1].map((i) => <div key={i} className="text-amber-200">{i ? 'ب' : 'الف'}) {SPEC[t.kind][i].icon} {SPEC[t.kind][i].name}: {SPEC[t.kind][i].desc}</div>)}
          <div className="text-slate-300">هزینه: 💵{upgradeCost(t.kind, 3).usd} 🏗️{upgradeCost(t.kind, 3).steel}</div>
        </div>
      )}
      {t.tier < 3 && <div className="text-slate-400">ارتقا: 💵{upgradeCost(t.kind, t.tier).usd} 🏗️{upgradeCost(t.kind, t.tier).steel}</div>}
      {t.dis > 0 && <div className="text-red-300">⚠️ برجک موقتا از کار افتاده</div>}
    </div>
  );
}
