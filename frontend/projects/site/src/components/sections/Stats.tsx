import { Reveal } from '@/components/motion/Reveal';

// TODO: substituir por números reais quando consolidados.
const STATS = [
  { value: '12k+', label: 'atletas na areia' },
  { value: '480+', label: 'torneios realizados' },
  { value: '90+', label: 'arenas parceiras' },
  { value: '1ª', label: 'etapa da Liga em out' },
];

export function Stats() {
  return (
    <section className="relative mx-auto max-w-6xl px-5 py-16 sm:px-6 sm:py-20">
      <Reveal>
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-5 border border-line bg-line md:grid-cols-4">
          {STATS.map((s) => (
            <div key={s.label} className="flex flex-col items-center bg-surface-1 px-6 py-8 text-center">
              <dt className="order-2 mt-2 text-sm text-text-mute">{s.label}</dt>
              <dd className="order-1 font-display text-4xl font-800 tracking-tight text-brand sm:text-5xl [font-variant-numeric:tabular-nums]">
                {s.value}
              </dd>
            </div>
          ))}
        </dl>
      </Reveal>
    </section>
  );
}
