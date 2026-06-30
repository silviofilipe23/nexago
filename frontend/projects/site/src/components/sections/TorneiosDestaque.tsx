import { ArrowRight } from 'lucide-react';
import { Reveal } from '@/components/motion/Reveal';
import { ButtonLink } from '@/components/ui/Button';
import { TournamentCard } from '@/components/hub/TournamentCard';
import type { TournamentSummary } from '@/lib/firestore/types';

/**
 * Vitrine de torneios públicos na home. Recebe a lista pronta da page (Server
 * Component) — se vier vazia, a seção não renderiza para não exibir bloco vazio.
 */
export function TorneiosDestaque({ tournaments }: { tournaments: TournamentSummary[] }) {
  if (tournaments.length === 0) return null;

  return (
    <section
      id="torneios-destaque"
      className="relative mx-auto max-w-6xl scroll-mt-24 px-5 py-16 sm:px-6 sm:py-32"
    >
      <Reveal className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <p className="mb-3 font-mono text-sm font-600 uppercase tracking-[0.2em] text-brand">
            Hub público
          </p>
          <h2 className="font-display text-[clamp(1.9rem,5vw,3.25rem)] font-700 leading-tight tracking-tight text-fg">
            Torneios abertos na areia
          </h2>
          <p className="mt-4 text-balance text-base text-text-mute sm:text-lg">
            Etapas de beach tennis e vôlei de praia com inscrições abertas. Acompanhe chaves e
            resultados em tempo real.
          </p>
        </div>
        <ButtonLink href="/torneios" variant="secondary" className="shrink-0">
          Ver todos os torneios
          <ArrowRight className="size-4" aria-hidden="true" />
        </ButtonLink>
      </Reveal>

      <ul className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {tournaments.map((t, i) => (
          <li key={t.id}>
            <Reveal delay={i * 0.06} className="h-full">
              <TournamentCard t={t} />
            </Reveal>
          </li>
        ))}
      </ul>
    </section>
  );
}
