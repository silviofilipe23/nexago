import { StoreButtons } from '@/components/ui/StoreButtons';
import { ShowcasePhones } from '@/components/sections/ShowcasePhones';

export function ComoFunciona() {
  return (
    <section id="como-funciona" className="relative mx-auto max-w-6xl scroll-mt-24 px-5 py-24 sm:px-6 sm:py-32">
      {/* Cabeçalho: título + badges de loja */}
      <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-xl">
          <p className="mb-3 font-mono text-sm font-600 uppercase tracking-[0.2em] text-brand">Como funciona</p>
          <h2 className="font-display text-[clamp(2rem,5.5vw,3.0rem)] font-bold leading-tight tracking-tight text-fg text-balance">
            Eleve sua experiência
          </h2>
          <p className="mt-4 text-balance text-base text-text-mute sm:text-lg">
            A experiência de quem joga, organiza e recebe na areia — num só app.
          </p>
        </div>

        <div className="shrink-0">
          <p className="mb-3 font-mono text-xs font-600 uppercase tracking-[0.18em] text-text-dim">
            Disponível no iOS e Android
          </p>
          <StoreButtons size="sm" className="flex flex-wrap gap-3" />
        </div>
      </div>

      {/* Showcase 3-up interativo */}
      <ShowcasePhones />
    </section>
  );
}
