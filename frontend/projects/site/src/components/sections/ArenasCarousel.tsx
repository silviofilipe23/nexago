'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { useReducedMotion } from 'motion/react';
import { Reveal } from '@/components/motion/Reveal';
import { ButtonLink } from '@/components/ui/Button';
import { ArenaCard } from '@/components/hub/ArenaCard';
import type { ArenaSummary } from '@/lib/firestore/types';

type ArenasCarouselProps = {
  arenas: ArenaSummary[];
  /** Copy do cabeçalho — sobrescrita por contexto (ex.: home vs. página de arenas). */
  eyebrow?: string;
  title?: string;
  description?: string;
};

/**
 * Vitrine horizontal das arenas cadastradas. Scroll-snap nativo (toque/trackpad)
 * + botões prev/next no desktop. Recebe a lista pronta da page; se vier vazia,
 * a seção não renderiza para não exibir bloco vazio. A copy do cabeçalho é
 * parametrizável para reaproveitar a seção em contextos diferentes.
 */
export function ArenasCarousel({
  arenas,
  eyebrow = 'Arenas parceiras',
  title = 'Arenas que evoluíram',
  description = 'Arenas que já fazem parte da comunidade da areia. A sua pode ser a próxima.',
}: ArenasCarouselProps) {
  const reduce = useReducedMotion();
  const trackRef = useRef<HTMLUListElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  const updateEdges = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setAtStart(el.scrollLeft <= 4);
    setAtEnd(el.scrollLeft >= max - 4);
  }, []);

  useEffect(() => {
    updateEdges();
    const el = trackRef.current;
    if (!el) return;
    el.addEventListener('scroll', updateEdges, { passive: true });
    window.addEventListener('resize', updateEdges);
    return () => {
      el.removeEventListener('scroll', updateEdges);
      window.removeEventListener('resize', updateEdges);
    };
  }, [updateEdges]);

  const scrollByPage = (dir: -1 | 1) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: reduce ? 'auto' : 'smooth' });
  };

  if (arenas.length === 0) return null;

  return (
    <section className="relative py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-5 sm:px-6">
        <Reveal className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <p className="mb-3 font-mono text-sm font-600 uppercase tracking-[0.2em] text-brand">
              {eyebrow}
            </p>
            <h2 className="font-display text-[clamp(1.9rem,5vw,3rem)] font-700 leading-tight tracking-tight text-fg">
              {title}
            </h2>
            <p className="mt-4 text-balance text-base text-text-mute sm:text-lg">
              {description}
            </p>
          </div>

          <div className="hidden shrink-0 gap-2 sm:flex">
            <button
              type="button"
              onClick={() => scrollByPage(-1)}
              disabled={atStart}
              aria-label="Ver arenas anteriores"
              className="inline-flex size-11 items-center justify-center rounded-full border border-line bg-surface-1 text-fg transition-colors duration-200 ease-out hover:border-brand/40 hover:text-brand disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand motion-reduce:transition-none"
            >
              <ChevronLeft className="size-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => scrollByPage(1)}
              disabled={atEnd}
              aria-label="Ver mais arenas"
              className="inline-flex size-11 items-center justify-center rounded-full border border-line bg-surface-1 text-fg transition-colors duration-200 ease-out hover:border-brand/40 hover:text-brand disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand motion-reduce:transition-none"
            >
              <ChevronRight className="size-5" aria-hidden="true" />
            </button>
          </div>
        </Reveal>
      </div>

      <ul
        ref={trackRef}
        className="mt-10 flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 [-ms-overflow-style:none] [padding-inline:max(1.25rem,calc((100vw-72rem)/2))] [scrollbar-width:none] sm:mt-12 sm:[padding-inline:max(1.5rem,calc((100vw-72rem)/2))] [&::-webkit-scrollbar]:hidden"
      >
        {arenas.map((arena) => (
          <li
            key={arena.id}
            className="w-[260px] shrink-0 snap-start sm:w-[280px]"
          >
            <ArenaCard arena={arena} />
          </li>
        ))}
        {/* Card final: CTA para cadastrar a própria arena */}
        <li className="w-[260px] shrink-0 snap-start sm:w-[280px]">
          <div className="flex h-full flex-col items-start justify-center gap-4 rounded-4 border border-dashed border-brand/30 bg-brand-tint/40 p-6">
            <p className="font-display text-lg font-700 leading-tight tracking-tight text-fg">
              Sua arena aqui
            </p>
            <p className="text-sm leading-relaxed text-text-mute">
              Cadastre sua quadra e apareça para a comunidade da areia.
            </p>
            <ButtonLink href="#contato" className="mt-auto">
              Cadastrar
              <ArrowRight className="size-4" aria-hidden="true" />
            </ButtonLink>
          </div>
        </li>
      </ul>
    </section>
  );
}
