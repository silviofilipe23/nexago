'use client';

import { type MouseEvent } from 'react';
import Link from 'next/link';
import { MapPin, CalendarDays, Layers } from 'lucide-react';
import { StatusBadge } from './StatusBadge';
import { sportLabel } from '@/lib/format';
import type { TournamentSummary } from '@/lib/firestore/types';

function onSpotlightMove(e: MouseEvent<HTMLElement>) {
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  el.style.setProperty('--mx', `${e.clientX - r.left}px`);
  el.style.setProperty('--my', `${e.clientY - r.top}px`);
}

export function TournamentCard({ t }: { t: TournamentSummary }) {
  const place = [t.locationName, t.city].filter(Boolean).join(' · ') || t.city || 'Local a definir';

  return (
    <Link
      href={`/torneios/${t.id}`}
      onMouseMove={onSpotlightMove}
      className="group relative flex h-full flex-col overflow-hidden rounded-5 border border-line bg-surface-1 p-6 transition-[transform,border-color] duration-300 hover:-translate-y-1 hover:border-brand/40 motion-reduce:hover:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
    >
      {/* Spotlight que segue o cursor */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background:
            'radial-gradient(300px circle at var(--mx, 50%) var(--my, 50%), rgba(255,106,26,0.13), transparent 60%)',
        }}
      />
      <div className="mb-4 flex items-center justify-between gap-3">
        <span className="font-mono text-xs font-600 uppercase tracking-wider text-text-dim">
          {sportLabel(t.sport)}
        </span>
        <StatusBadge status={t.listingStatus} />
      </div>

      <h3 className="font-display text-lg font-700 leading-snug tracking-tight text-fg transition-colors group-hover:text-brand">
        {t.name}
      </h3>

      <dl className="mt-4 space-y-2 text-sm text-text-mute">
        <div className="flex items-center gap-2">
          <MapPin className="size-4 shrink-0 text-text-dim" aria-hidden="true" />
          <dd className="truncate">{place}</dd>
        </div>
        {t.dateLabel && (
          <div className="flex items-center gap-2">
            <CalendarDays className="size-4 shrink-0 text-text-dim" aria-hidden="true" />
            <dd>{t.dateLabel}</dd>
          </div>
        )}
        {t.categoriesCount > 0 && (
          <div className="flex items-center gap-2">
            <Layers className="size-4 shrink-0 text-text-dim" aria-hidden="true" />
            <dd>
              {t.categoriesCount} {t.categoriesCount === 1 ? 'categoria' : 'categorias'}
            </dd>
          </div>
        )}
      </dl>

      <div className="mt-6 flex items-center gap-4 border-t border-line pt-4 text-xs text-text-dim">
        {t.liveMatchesNow > 0 && (
          <span className="font-600 text-live">{t.liveMatchesNow} ao vivo</span>
        )}
        <span>{t.enrolledCount} inscritos</span>
        {t.leagueStageName && <span className="truncate">· {t.leagueStageName}</span>}
      </div>
    </Link>
  );
}
