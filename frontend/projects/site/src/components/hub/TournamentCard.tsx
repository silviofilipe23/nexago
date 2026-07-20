'use client';

import { type MouseEvent } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { MapPin, CalendarDays, Layers, Trophy } from 'lucide-react';
import { StatusBadge } from './StatusBadge';
import { sportLabel } from '@/lib/format';
import { toSlugId } from '@/lib/slug';
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
      href={`/torneios/${toSlugId(t.name, t.id)}`}
      onMouseMove={onSpotlightMove}
      className="group relative flex h-full flex-col overflow-hidden rounded-5 border border-line bg-surface-1 transition-[transform,border-color] duration-300 hover:-translate-y-1 hover:border-brand/40 motion-reduce:hover:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
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

      {/* Capa do torneio */}
      <div className="relative aspect-[16/10] overflow-hidden bg-surface-2">
        {t.coverUrl ? (
          <Image
            src={t.coverUrl}
            alt=""
            fill
            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            className="object-cover transition-transform duration-300 ease-out group-hover:scale-[1.04] motion-reduce:transition-none"
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-gradient-to-br from-surface-2 to-surface-1">
            <Trophy className="size-9 text-text-dim" aria-hidden="true" />
          </div>
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-surface-1/90 to-transparent" />
      </div>

      <div className="flex flex-1 flex-col p-6">
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
          <div>
            <dt className="sr-only">Local</dt>
            <dd className="flex items-center gap-2">
              <MapPin className="size-4 shrink-0 text-text-dim" aria-hidden="true" />
              <span className="truncate">{place}</span>
            </dd>
          </div>
          {t.dateLabel && (
            <div>
              <dt className="sr-only">Data</dt>
              <dd className="flex items-center gap-2">
                <CalendarDays className="size-4 shrink-0 text-text-dim" aria-hidden="true" />
                <span>{t.dateLabel}</span>
              </dd>
            </div>
          )}
          {t.categoriesCount > 0 && (
            <div>
              <dt className="sr-only">Categorias</dt>
              <dd className="flex items-center gap-2">
                <Layers className="size-4 shrink-0 text-text-dim" aria-hidden="true" />
                <span>
                  {t.categoriesCount} {t.categoriesCount === 1 ? 'categoria' : 'categorias'}
                </span>
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
      </div>
    </Link>
  );
}
