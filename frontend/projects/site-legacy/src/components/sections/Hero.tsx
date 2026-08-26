'use client';

import { motion, useReducedMotion, type Variants } from 'motion/react';
import { ButtonLink } from '@/components/ui/Button';

const STATS = [
  { value: '12k+', label: 'atletas' },
  { value: '480+', label: 'torneios' },
  { value: '90+', label: 'arenas' },
];

export function Hero() {
  const reduce = useReducedMotion();

  const container: Variants = {
    hidden: {},
    show: { transition: { staggerChildren: reduce ? 0 : 0.08, delayChildren: 0.05 } },
  };
  const item: Variants = {
    hidden: reduce ? { opacity: 0 } : { opacity: 0, y: 22 },
    show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } },
  };

  return (
    <section className="relative isolate flex min-h-dvh flex-col items-center justify-center overflow-hidden px-5 pt-24 pb-16 sm:px-6">
      {/* Glow laranja */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[14%] -z-10 size-[min(100vw,720px)] -translate-x-1/2 rounded-full"
        style={{
          background:
            'radial-gradient(closest-side, rgba(255,106,26,0.28), rgba(255,106,26,0.06) 55%, transparent 75%)',
        }}
        initial={reduce ? false : { opacity: 0.5, scale: 0.9 }}
        animate={reduce ? undefined : { opacity: [0.5, 0.85, 0.5], scale: [0.9, 1, 0.9] }}
        transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Linhas diagonais (eco do logo) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.07]"
        style={{
          backgroundImage:
            'repeating-linear-gradient(135deg, #fff 0 1px, transparent 1px 96px)',
          maskImage: 'radial-gradient(closest-side, #000 30%, transparent 80%)',
        }}
      />
      {/* Vinheta inferior */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-48"
        style={{ background: 'linear-gradient(to top, #050505, transparent)' }}
      />

      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="mx-auto flex w-full min-w-0 max-w-3xl flex-col items-center text-center"
      >
        {/* Eyebrow */}
        <motion.div
          variants={item}
          className="mb-6 inline-flex items-center gap-2 rounded-pill border border-line-strong bg-glass px-4 py-1.5 backdrop-blur-md"
        >
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand opacity-60" />
            <span className="relative inline-flex size-2 rounded-full bg-brand" />
          </span>
          <span className="text-xs font-600 tracking-wide text-text-mute">
            Liga nexaGO · 1ª etapa em 24/out
          </span>
        </motion.div>

        {/* Headline */}
        <motion.h1
          variants={item}
          className="font-display text-[clamp(1.7rem,7.5vw,5.25rem)] font-800 leading-[0.98] tracking-[-0.03em] text-balance text-fg"
        >
          Domine a areia.
          <br />
          <span className="text-brand">Do saque ao título.</span>
        </motion.h1>

        {/* Subcopy */}
        <motion.p
          variants={item}
          className="mt-6 max-w-xl text-balance text-base leading-relaxed text-text-mute sm:text-lg"
        >
          A plataforma dos esportes de areia. Inscrições, chaves ao vivo, ranking e a Liga
          nexaGO num só app — conectando atletas, organizadores e arenas.
        </motion.p>

        {/* CTAs */}
        <motion.div
          variants={item}
          className="mt-9 flex w-full flex-col items-center gap-3 sm:w-auto sm:flex-row"
        >
          <ButtonLink href="https://linktr.ee/nexago" className="w-full sm:w-auto">
            Baixar o app
          </ButtonLink>
          <ButtonLink href="#liga" variant="secondary" className="w-full sm:w-auto">
            Conhecer a Liga
          </ButtonLink>
        </motion.div>

        {/* Stats */}
        <motion.dl
          variants={item}
          className="mt-14 grid w-full max-w-md grid-cols-3 gap-px overflow-hidden rounded-4 border border-line bg-line"
        >
          {STATS.map((s) => (
            <div key={s.label} className="bg-surface-0 px-3 py-5">
              <dt className="sr-only">{s.label}</dt>
              <dd className="font-mono text-2xl font-700 tracking-tight text-fg sm:text-3xl">
                {s.value}
              </dd>
              <dd className="mt-1 font-mono text-xs font-500 uppercase tracking-wider text-text-dim">
                {s.label}
              </dd>
            </div>
          ))}
        </motion.dl>
      </motion.div>
    </section>
  );
}
