// شاشة «المزيد»: كل الأقسام كبطاقات كبيرة بأيقونة في المنتصف.
import React from 'react';
import { Gift, Link2, Moon, Package, Palette, Scissors, Store, Sun, Clock3, Bot, CreditCard, ShieldCheck } from 'lucide-react';
import { Section, Tile, useApp } from '../ui.jsx';
import { PAGES } from '../main.jsx';

export default function More() {
  const { go, can, theme, vocab, isManager } = useApp();
  const pages = ['messages', 'inventory', 'team', 'reports', 'checkout', 'settings', 'admin'].filter(can);
  const tones = { messages: 'purple', inventory: 'green', team: 'blue', reports: 'orange', checkout: 'green', settings: 'accent', admin: 'red' };
  return <div className="stack-lg">
    <div className="tiles tiles-3">{pages.map(id => <Tile key={id} icon={PAGES[id].icon} label={id === 'team' ? vocab.team : PAGES[id].label} tone={tones[id]} onClick={() => go(id)} />)}</div>
    {isManager && <Section title="إعدادات سريعة">
      <div className="tiles tiles-3">
        <Tile icon={Scissors} label="الخدمات والأسعار" tone="accent" onClick={() => go('settings', { open: 'services' })} />
        <Tile icon={Package} label="الباقات" tone="purple" onClick={() => go('settings', { open: 'packages' })} />
        <Tile icon={Gift} label="بطاقات الهدايا" tone="blue" onClick={() => go('settings', { open: 'gifts' })} />
        <Tile icon={Link2} label="رابط الحجز" tone="green" onClick={() => go('settings', { open: 'booking' })} />
        <Tile icon={Clock3} label="ساعات العمل" tone="orange" onClick={() => go('settings', { open: 'hours' })} />
        <Tile icon={Bot} label="واتساب الذكي" tone="purple" onClick={() => go('settings', { open: 'whatsapp' })} />
        <Tile icon={Store} label="بيانات الصالون" tone="accent" onClick={() => go('settings', { open: 'shop' })} />
        <Tile icon={ShieldCheck} label="سجل التعديلات" tone="red" onClick={() => go('settings', { open: 'audit' })} />
        <Tile icon={CreditCard} label="الاشتراك" tone="green" onClick={() => go('settings', { open: 'plan' })} />
      </div>
    </Section>}
    <div className="tiles tiles-2">
      <Tile icon={theme.theme === 'dark' ? Sun : Moon} label={theme.theme === 'dark' ? 'الوضع النهاري' : 'الوضع الليلي'} tone="accent" onClick={() => theme.setMode(theme.theme === 'dark' ? 'light' : 'dark')} />
      <Tile icon={Palette} label={theme.mode === 'system' ? 'المظهر: تلقائي' : 'اتبع مظهر الجهاز'} tone="blue" onClick={() => theme.setMode('system')} />
    </div>
  </div>;
}
