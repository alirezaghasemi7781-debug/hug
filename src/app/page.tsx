'use client';
import dynamic from 'next/dynamic';

const Game = dynamic(() => import('@/components/Game'), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 flex items-center justify-center bg-slate-950 text-white" dir="rtl">
      <div className="text-center">
        <div className="text-5xl">🌊</div>
        <div className="mt-2 text-lg font-extrabold">تنگه هرمز: فرمانروایی آب‌های آزاد</div>
        <div className="text-xs text-slate-400">در حال بارگذاری…</div>
      </div>
    </div>
  ),
});

export default function Page() {
  return <Game />;
}
