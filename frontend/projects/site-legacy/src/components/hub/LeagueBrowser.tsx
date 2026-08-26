'use client';

import { useMemo, useState } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import { Reveal } from '@/components/motion/Reveal';
import { LeagueCard } from './LeagueCard';
import { Chip, FilterGroup, SearchInput } from './filter-controls';
import type { LeagueSummary } from '@/lib/firestore/types';

function unique(values: (string | null)[]): string[] {
  return [...new Set(values.filter((v): v is string => Boolean(v)))];
}

/**
 * Listagem de ligas com filtros client-side sobre a lista já carregada
 * (somente leitura, sem novas consultas). Busca por nome; filtro por temporada,
 * com opções derivadas do próprio dataset. Contagem anunciada via aria-live.
 */
export function LeagueBrowser({ leagues }: { leagues: LeagueSummary[] }) {
  const [query, setQuery] = useState('');
  const [season, setSeason] = useState<string | null>(null);

  const seasons = useMemo(() => unique(leagues.map((l) => l.seasonLabel)).sort(), [leagues]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return leagues.filter((l) => {
      if (season && l.seasonLabel !== season) return false;
      if (q && !l.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [leagues, query, season]);

  const hasActiveFilters = Boolean(query || season);

  function clearAll() {
    setQuery('');
    setSeason(null);
  }

  // Sem dimensões úteis pra filtrar (poucas ligas, uma única temporada): grid puro.
  const showControls = leagues.length > 3 || seasons.length > 1;

  return (
    <div className="mt-12">
      {showControls && (
        <>
          <div className="rounded-4 border border-line bg-surface-1 p-4 sm:p-5">
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder="Buscar liga pelo nome"
              label="Buscar ligas"
            />
            {seasons.length > 1 && (
              <div className="mt-4">
                <FilterGroup label="Temporada">
                  <Chip active={season === null} onClick={() => setSeason(null)}>
                    Todas
                  </Chip>
                  {seasons.map((s) => (
                    <Chip key={s} active={season === s} onClick={() => setSeason(s)}>
                      {s}
                    </Chip>
                  ))}
                </FilterGroup>
              </div>
            )}
          </div>

          <div className="mt-6 flex items-center justify-between gap-4">
            <p className="text-sm text-text-mute" aria-live="polite">
              {filtered.length === leagues.length
                ? `${leagues.length} ${leagues.length === 1 ? 'liga' : 'ligas'}`
                : `${filtered.length} de ${leagues.length} ${leagues.length === 1 ? 'liga' : 'ligas'}`}
            </p>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearAll}
                className="inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-sm font-600 text-text-mute transition-colors hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
              >
                <X className="size-4" aria-hidden="true" />
                Limpar filtros
              </button>
            )}
          </div>
        </>
      )}

      {filtered.length > 0 ? (
        <div className={`${showControls ? 'mt-6' : ''} grid gap-5 sm:grid-cols-2 lg:grid-cols-3`}>
          {filtered.map((l, i) => (
            <Reveal key={l.id} delay={i * 0.05} className="h-full">
              <LeagueCard league={l} />
            </Reveal>
          ))}
        </div>
      ) : (
        <div className="mt-6 rounded-5 border border-line bg-surface-1 p-12 text-center">
          <div className="mx-auto mb-4 inline-flex size-12 items-center justify-center rounded-full border border-line bg-surface-2 text-text-dim">
            <SlidersHorizontal className="size-5" aria-hidden="true" />
          </div>
          <p className="font-display text-lg font-700 text-fg">Nenhuma liga encontrada</p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-text-mute">
            Tente ajustar a busca ou o filtro de temporada.
          </p>
          <button
            type="button"
            onClick={clearAll}
            className="mt-5 inline-flex items-center gap-1.5 rounded-pill border border-line-strong bg-surface-0 px-4 py-2 text-sm font-600 text-fg transition-colors hover:border-brand/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
          >
            Limpar filtros
          </button>
        </div>
      )}
    </div>
  );
}
