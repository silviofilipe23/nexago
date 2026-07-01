'use client';

import { useMemo, useState } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import { TournamentCard } from './TournamentCard';
import { Chip, FilterGroup, SearchInput } from './filter-controls';
import { sportLabel, STATUS_META } from '@/lib/format';
import type { TournamentListingStatus, TournamentSummary } from '@/lib/firestore/types';

const STATUS_ORDER: TournamentListingStatus[] = ['open', 'live', 'almost_full', 'ended'];

function unique(values: (string | null)[]): string[] {
  return [...new Set(values.filter((v): v is string => Boolean(v)))];
}

/**
 * Listagem de torneios com filtros client-side sobre a lista já carregada
 * (somente leitura, sem novas consultas). Opções derivadas do próprio dataset
 * para não exibir filtros vazios. Busca por nome/local; filtros por esporte,
 * status e estado. Contagem de resultados é anunciada via aria-live.
 */
export function TournamentBrowser({ tournaments }: { tournaments: TournamentSummary[] }) {
  const [query, setQuery] = useState('');
  const [sport, setSport] = useState<string | null>(null);
  const [status, setStatus] = useState<TournamentListingStatus | null>(null);
  const [state, setState] = useState<string | null>(null);

  const sports = useMemo(() => unique(tournaments.map((t) => t.sport)), [tournaments]);
  const statuses = useMemo(() => {
    const present = new Set(tournaments.map((t) => t.listingStatus));
    return STATUS_ORDER.filter((s) => present.has(s));
  }, [tournaments]);
  const states = useMemo(() => unique(tournaments.map((t) => t.state)).sort(), [tournaments]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tournaments.filter((t) => {
      if (sport && t.sport !== sport) return false;
      if (status && t.listingStatus !== status) return false;
      if (state && t.state !== state) return false;
      if (q) {
        const haystack = [t.name, t.city, t.locationName, t.state]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [tournaments, query, sport, status, state]);

  const hasActiveFilters = Boolean(query || sport || status || state);

  function clearAll() {
    setQuery('');
    setSport(null);
    setStatus(null);
    setState(null);
  }

  return (
    <div className="mt-12">
      {/* Barra de filtros */}
      <div className="rounded-4 border border-line bg-surface-1 p-4 sm:p-5">
        {/* Busca */}
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Buscar por nome, arena ou cidade"
          label="Buscar torneios"
        />

        {/* Grupos de filtro */}
        <div className="mt-4 flex flex-col gap-4">
          {sports.length > 1 && (
            <FilterGroup label="Esporte">
              <Chip active={sport === null} onClick={() => setSport(null)}>
                Todos
              </Chip>
              {sports.map((s) => (
                <Chip key={s} active={sport === s} onClick={() => setSport(s)}>
                  {sportLabel(s)}
                </Chip>
              ))}
            </FilterGroup>
          )}

          {statuses.length > 1 && (
            <FilterGroup label="Status">
              <Chip active={status === null} onClick={() => setStatus(null)}>
                Todos
              </Chip>
              {statuses.map((s) => (
                <Chip key={s} active={status === s} onClick={() => setStatus(s)}>
                  {STATUS_META[s].label}
                </Chip>
              ))}
            </FilterGroup>
          )}

          {states.length > 1 && (
            <FilterGroup label="Estado">
              <label className="sr-only" htmlFor="filter-state">
                Filtrar por estado
              </label>
              <select
                id="filter-state"
                value={state ?? ''}
                onChange={(e) => setState(e.target.value || null)}
                className="h-9 cursor-pointer rounded-pill border border-line bg-surface-0 px-4 text-sm font-600 text-fg focus-visible:border-brand/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
              >
                <option value="">Todos os estados</option>
                {states.map((uf) => (
                  <option key={uf} value={uf}>
                    {uf}
                  </option>
                ))}
              </select>
            </FilterGroup>
          )}
        </div>
      </div>

      {/* Contagem + limpar */}
      <div className="mt-6 flex items-center justify-between gap-4">
        <p className="text-sm text-text-mute" aria-live="polite">
          {filtered.length === tournaments.length
            ? `${tournaments.length} ${tournaments.length === 1 ? 'torneio' : 'torneios'}`
            : `${filtered.length} de ${tournaments.length} ${tournaments.length === 1 ? 'torneio' : 'torneios'}`}
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

      {/* Resultados */}
      {filtered.length > 0 ? (
        <ul className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((t) => (
            <li key={t.id}>
              <TournamentCard t={t} />
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-6 rounded-5 border border-line bg-surface-1 p-12 text-center">
          <div className="mx-auto mb-4 inline-flex size-12 items-center justify-center rounded-full border border-line bg-surface-2 text-text-dim">
            <SlidersHorizontal className="size-5" aria-hidden="true" />
          </div>
          <p className="font-display text-lg font-700 text-fg">Nenhum torneio encontrado</p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-text-mute">
            Tente ajustar a busca ou os filtros para ver mais resultados.
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
