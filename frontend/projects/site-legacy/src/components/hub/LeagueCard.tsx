import Image from 'next/image';
import Link from 'next/link';
import { CalendarDays, Layers, Trophy } from 'lucide-react';
import { toSlugId } from '@/lib/slug';
import type { LeagueSummary } from '@/lib/firestore/types';

/**
 * Card de liga para a listagem pública. Capa (coverUrl) com fallback gráfico,
 * nome, temporada e nº de etapas. O card inteiro é o link para o perfil da liga.
 */
export function LeagueCard({ league }: { league: LeagueSummary }) {
  const stageCount = league.stages.length;

  return (
    <Link
      href={`/ligas/${toSlugId(league.name, league.id)}`}
      className="group/league flex h-full flex-col overflow-hidden rounded-4 border border-line bg-surface-1 transition-colors duration-200 ease-out hover:border-brand/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-bg motion-reduce:transition-none"
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-surface-2">
        {league.coverUrl ? (
          <Image
            src={league.coverUrl}
            alt={`Liga ${league.name}`}
            fill
            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            className="object-cover transition-transform duration-300 ease-out group-hover/league:scale-[1.04] motion-reduce:transition-none"
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-gradient-to-br from-surface-2 to-surface-1">
            <Trophy className="size-9 text-text-dim" aria-hidden="true" />
          </div>
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-surface-1/90 to-transparent" />
      </div>

      <div className="flex flex-1 flex-col p-5">
        <h3 className="font-display text-lg font-700 leading-tight tracking-tight text-fg transition-colors group-hover/league:text-brand">
          {league.name}
        </h3>

        <dl className="mt-3 space-y-2 text-sm text-text-mute">
          {league.seasonLabel && (
            <div>
              <dt className="sr-only">Temporada</dt>
              <dd className="flex items-center gap-2">
                <CalendarDays className="size-4 shrink-0 text-text-dim" aria-hidden="true" />
                <span className="truncate">{league.seasonLabel}</span>
              </dd>
            </div>
          )}
          {stageCount > 0 && (
            <div>
              <dt className="sr-only">Etapas</dt>
              <dd className="flex items-center gap-2">
                <Layers className="size-4 shrink-0 text-text-dim" aria-hidden="true" />
                <span>
                  {stageCount} {stageCount === 1 ? 'etapa' : 'etapas'}
                </span>
              </dd>
            </div>
          )}
        </dl>
      </div>
    </Link>
  );
}
