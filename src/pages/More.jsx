// شاشة «المزيد»: الأقسام الأقل استخداماً فقط — الإعدادات من أيقونة الترس في الأعلى.
import React from 'react';
import { ShieldCheck } from 'lucide-react';
import { Button, Tile, openExternal, useApp } from '../ui.jsx';
import { privacyUrl } from '../lib/sync.js';
import { L } from '../i18n.js';
import { PAGES } from '../main.jsx';

const tones = { messages: 'purple', inventory: 'green', team: 'blue', reports: 'orange', admin: 'red' };

export default function More() {
  const { go, can, vocab } = useApp();
  const pages = ['messages', 'reports', 'inventory', 'team'].filter(can);
  return <div className="more-page">
    <div className="tiles tiles-2">{pages.map(id => <Tile key={id} icon={PAGES[id].icon} label={id === 'team' ? vocab.team : PAGES[id].label} tone={tones[id]} onClick={() => go(id)} />)}</div>
    <Button variant="ghost" icon={ShieldCheck} block onClick={() => openExternal(privacyUrl)}>{L('سياسة الخصوصية', 'Privacy policy')}</Button>
  </div>;
}
