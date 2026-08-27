import { CalendarDays, ArrowRight } from 'lucide-react';
import { Reveal } from '@/components/motion/Reveal';
import { ButtonLink } from '@/components/ui/Button';

const STEPS = [
  { value: '1ª etapa', label: '24 de outubro' },
  { value: 'Esporte', label: 'Vôlei de praia' },
  { value: 'Todas as categorias', label: 'do iniciante ao Open' },
];

export function Liga() {
  return (
    <section id="liga" className="relative mx-auto max-w-6xl scroll-mt-24 px-5 py-16 sm:px-6 sm:py-32">
      <Reveal>
        <div className="relative overflow-hidden rounded-5 border border-brand/20 bg-surface-1 px-7 py-14 sm:px-14 sm:py-20">
          {/* Glow de fundo */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full"
            style={{
              background:
                'radial-gradient(closest-side, rgba(255,106,26,0.25), transparent 70%)',
            }}
          />

          <div className="relative">
            <div className="inline-flex items-center gap-2 rounded-pill border border-brand/30 bg-brand-tint px-4 py-1.5">
              <CalendarDays className="size-4 text-brand" aria-hidden="true" />
              <span className="text-xs font-600 tracking-wide text-brand">Liga nexaGO 2026</span>
            </div>

            <h2 className="mt-6 max-w-2xl font-display text-[clamp(2rem,5.5vw,3.75rem)] font-800 leading-[1.02] tracking-tight text-fg">
              A liga que move a areia do Brasil.
            </h2>
            <p className="mt-5 max-w-xl text-balance text-base leading-relaxed text-text-mute sm:text-lg">
              Etapas em arenas parceiras, ranking nacional e a emoção do circuito. A 1ª etapa abre
              a temporada — garanta sua vaga.
            </p>

            <div className="mt-10 grid max-w-2xl grid-cols-1 gap-px overflow-hidden rounded-4 border border-line bg-line sm:grid-cols-3">
              {STEPS.map((s) => (
                <div key={s.value} className="bg-surface-0 px-5 py-5">
                  <div className="font-display text-lg font-700 tracking-tight text-fg">{s.value}</div>
                  <div className="mt-1 text-sm text-text-mute">{s.label}</div>
                </div>
              ))}
            </div>

            <div className="mt-10">
              <ButtonLink href="/ligas">
                Conhecer as Ligas
                <ArrowRight className="size-4" aria-hidden="true" />
              </ButtonLink>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
