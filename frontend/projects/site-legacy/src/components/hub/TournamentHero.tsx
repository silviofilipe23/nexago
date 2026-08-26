'use client';

import { useEffect, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { MapPin, CalendarDays, ArrowLeft, Users } from 'lucide-react';
import { StatusBadge } from './StatusBadge';
import { sportLabel, formatDate } from '@/lib/format';
import type { TournamentDetail } from '@/lib/firestore/types';

if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);
}

/**
 * Cabeçalho cinematográfico do torneio: capa full-bleed sob o header flutuante,
 * com parallax no scroll (GSAP scrub, só transform) e scrims que dissolvem a
 * imagem no fundo da página para garantir contraste do texto sobreposto.
 * Sem capa, cai num fundo de marca. Respeita prefers-reduced-motion e mantém
 * o conteúdo legível e indexável (h1 renderizado no SSR).
 */
export function TournamentHero({ t }: { t: TournamentDetail }) {
  const rootRef = useRef<HTMLElement>(null);
  const imageRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const place = [t.locationName, t.city, t.state].filter(Boolean).join(', ');

  useEffect(() => {
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;

    const ctx = gsap.context(() => {
      // Parallax: a capa "atrasa" o scroll (move pra baixo) com leve zoom.
      // O scale base de 1.15 dá folga pra não revelar bordas no deslocamento.
      gsap.fromTo(
        imageRef.current,
        { yPercent: -4, scale: 1.15 },
        {
          yPercent: 10,
          scale: 1.22,
          ease: 'none',
          scrollTrigger: {
            trigger: rootRef.current,
            start: 'top top',
            end: 'bottom top',
            scrub: true,
          },
        },
      );

      // Texto sobe e desvanece suavemente conforme o hero sai de cena.
      gsap.to(overlayRef.current, {
        yPercent: -18,
        opacity: 0.35,
        ease: 'none',
        scrollTrigger: {
          trigger: rootRef.current,
          start: 'top top',
          end: 'bottom top',
          scrub: true,
        },
      });
    }, rootRef);

    return () => ctx.revert();
  }, []);

  return (
    <header
      ref={rootRef}
      className="relative w-full overflow-hidden h-[clamp(26rem,62vh,36rem)]"
    >
      {/* Camada da imagem (parallax). scale-[1.08] base mantém preenchido sem JS. */}
      <div ref={imageRef} className="absolute inset-0 scale-[1.08] will-change-transform">
        {t.coverUrl ? (
          <Image
            src={t.coverUrl}
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
        ) : (
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-br from-surface-2 via-surface-1 to-bg"
          >
            <div
              className="absolute inset-0"
              style={{
                background:
                  'radial-gradient(60rem 32rem at 70% 18%, rgba(255,106,26,0.18), transparent 60%)',
              }}
            />
          </div>
        )}
      </div>

      {/* Scrims: dissolve no fundo da página (base) + leve direcional pra legibilidade. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-t from-bg via-bg/55 to-bg/10"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-b from-bg/70 via-transparent to-transparent"
      />

      {/* Link de volta — topo, com folga pro header flutuante. */}
      <div className="absolute inset-x-0 top-0">
        <div className="mx-auto max-w-4xl px-5 pt-24 sm:px-6 sm:pt-28">
          <Link
            href="/torneios"
            className="inline-flex items-center gap-1.5 rounded-pill bg-glass px-3 py-1.5 text-sm text-fg backdrop-blur-md backdrop-saturate-150 transition-colors hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Todos os torneios
          </Link>
        </div>
      </div>

      {/* Conteúdo sobreposto — base do hero, alinhado à largura do conteúdo. */}
      <div ref={overlayRef} className="absolute inset-x-0 bottom-0 will-change-transform">
        <div className="mx-auto max-w-4xl px-5 pb-8 sm:px-6 sm:pb-10">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-xs font-600 uppercase tracking-wider text-text-dim">
              {sportLabel(t.sport)}
            </span>
            <StatusBadge status={t.listingStatus} />
            {t.leagueStageName && (
              <span className="text-xs text-text-mute">· {t.leagueStageName}</span>
            )}
          </div>

          <h1 className="mt-4 font-display text-[clamp(2rem,6vw,3.25rem)] font-800 leading-tight tracking-tight text-fg">
            {t.name}
          </h1>

          <div className="mt-5 flex flex-col gap-3 text-text-mute sm:flex-row sm:flex-wrap sm:gap-6">
            {place && (
              <span className="flex items-center gap-2">
                <MapPin className="size-4 text-text-dim" aria-hidden="true" />
                {place}
              </span>
            )}
            {(t.dateLabel || t.startAt) && (
              <span className="flex items-center gap-2">
                <CalendarDays className="size-4 text-text-dim" aria-hidden="true" />
                {t.dateLabel ?? formatDate(t.startAt)}
              </span>
            )}
            <span className="flex items-center gap-2">
              <Users className="size-4 text-text-dim" aria-hidden="true" />
              {t.enrolledCount} inscritos
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
