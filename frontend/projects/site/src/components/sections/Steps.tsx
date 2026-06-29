import { Reveal } from '@/components/motion/Reveal';

export type Step = { title: string; description: string };

type StepsProps = {
  eyebrow?: string;
  title: string;
  steps: Step[];
};

/** Seção "como funciona": passos numerados (1→N) com reveal em stagger. */
export function Steps({ eyebrow, title, steps }: StepsProps) {
  return (
    <section className="relative mx-auto max-w-6xl px-5 py-24 sm:px-6 sm:py-32">
      <Reveal className="mx-auto max-w-2xl text-center">
        {eyebrow && (
          <p className="mb-3 font-mono text-sm font-600 uppercase tracking-[0.2em] text-brand">
            {eyebrow}
          </p>
        )}
        <h2 className="font-display text-[clamp(1.9rem,5vw,3.25rem)] font-700 leading-tight tracking-tight text-fg">
          {title}
        </h2>
      </Reveal>

      <ol className="mt-16 grid gap-5 md:grid-cols-3">
        {steps.map((s, i) => (
          <Reveal key={s.title} delay={i * 0.08} className="h-full">
            <li className="h-full rounded-5 border border-line bg-surface-1 p-7">
              <span
                className="inline-flex size-11 items-center justify-center rounded-3 border border-brand/20 bg-brand-tint font-display text-lg font-800 text-brand"
                aria-hidden="true"
              >
                {i + 1}
              </span>
              <h3 className="mt-5 font-display text-lg font-700 tracking-tight text-fg">{s.title}</h3>
              <p className="mt-2.5 text-sm leading-relaxed text-text-mute">{s.description}</p>
            </li>
          </Reveal>
        ))}
      </ol>
    </section>
  );
}
