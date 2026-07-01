import { Reveal } from '@/components/motion/Reveal';
import { StoreButtons } from '@/components/ui/StoreButtons';

export function Download() {
  return (
    <section id="download" className="relative scroll-mt-24 overflow-hidden px-5 py-16 sm:px-6 sm:py-36">
      {/* Glow central */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 -z-10 size-[min(90vw,640px)] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ background: 'radial-gradient(closest-side, rgba(255,106,26,0.16), transparent 70%)' }}
      />

      <Reveal className="mx-auto max-w-2xl text-center">
        <h2 className="font-display text-[clamp(2rem,6vw,3.75rem)] font-800 leading-tight tracking-tight text-fg">
          Sua temporada começa no app.
        </h2>
        <p className="mx-auto mt-5 max-w-lg text-balance text-base text-text-mute sm:text-lg">
          Baixe o nexaGO, crie seu perfil e entre na próxima etapa da Liga. Grátis para atletas.
        </p>

        <StoreButtons
          size="md"
          className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row"
          itemClassName="w-full sm:w-auto"
        />
      </Reveal>
    </section>
  );
}
