// شاشة «المزيد»: الأقسام الأقل استخداماً فقط — الإعدادات من أيقونة الترس في الأعلى.
import React from 'react';
import { Tile, useApp } from '../ui.jsx';
import { PAGES } from '../main.jsx';

const tones = { messages: 'purple', inventory: 'green', team: 'blue', reports: 'orange', admin: 'red' };

export default function More() {
  const { go, can, vocab } = useApp();
  const pages = ['messages', 'reports', 'inventory', 'team'].filter(can);
  return <div className="tiles tiles-2">{pages.map(id => <Tile key={id} icon={PAGES[id].icon} label={id === 'team' ? vocab.team : PAGES[id].label} tone={tones[id]} onClick={() => go(id)} />)}</div>;
}
