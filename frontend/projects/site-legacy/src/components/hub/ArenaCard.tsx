import Image from 'next/image';
import Link from 'next/link';
import { MapPin, Building2 } from 'lucide-react';
import { sportLabel } from '@/lib/format';
import { toSlugId } from '@/lib/slug';
import type { ArenaSummary } from '@/lib/firestore/types';

/**
 * Card de arena para a vitrine pública. Capa (foto/logo) com fallback gráfico,
 * nome, localização e até 2 esportes. O card inteiro é o link para o perfil.
 */
export function ArenaCard({ arena }: { arena: ArenaSummary }) {
  const place = [arena.city, arena.state].filter(Boolean).join(' · ');
  const cover = arena.photoUrls[0] ?? arena.logoUrl ?? null;
  // Deduplica pelo rótulo exibido: courtTypes diferentes podem cair no mesmo
  // label genérico ("Esporte de areia") e gerariam badges repetidos.
  const sportLabels = [...new Set(arena.sports.map(sportLabel))].slice(0, 2);

  return (
    <Link
      href={`/arena/${toSlugId(arena.name, arena.id)}`}
      className="group/arena flex h-full flex-col overflow-hidden rounded-4 border border-line bg-surface-1 transition-colors duration-200 ease-out hover:border-brand/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-bg motion-reduce:transition-none"
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-surface-2">
        {cover ? (
          <Image
            src={cover}
            alt={`Arena ${arena.name}`}
            fill
            sizes="280px"
            className="object-cover transition-transform duration-300 ease-out group-hover/arena:scale-[1.04] motion-reduce:transition-none"
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-gradient-to-br from-surface-2 to-surface-1">
            <Building2 className="size-9 text-text-dim" aria-hidden="true" />
          </div>
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-surface-1/90 to-transparent" />
      </div>

      <div className="flex flex-1 flex-col p-4">
        <h3 className="font-display text-base font-700 leading-tight tracking-tight text-fg">
          {arena.name}
        </h3>
        {place && (
          <p className="mt-1.5 inline-flex items-center gap-1.5 text-sm text-text-mute">
            <MapPin className="size-3.5 shrink-0 text-text-dim" aria-hidden="true" />
            <span className="truncate">{place}</span>
          </p>
        )}
        {sportLabels.length > 0 && (
          <div className="mt-auto flex flex-wrap gap-1.5 pt-4">
            {sportLabels.map((label) => (
              <span
                key={label}
                className="rounded-pill border border-brand/20 bg-brand-tint px-2.5 py-1 text-xs font-600 text-brand"
              >
                {label}
              </span>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}
