'use client';

import { Fragment } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import type { Testimonial } from '@/components/ui/testimonial-card';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const second = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + second).toUpperCase();
}

function MarqueeCard({ t }: { t: Testimonial }) {
  return (
    <figure className="w-full max-w-xs rounded-4 border border-line bg-surface-1 p-6 shadow-elev-1">
      <blockquote className="text-sm leading-relaxed text-fg">“{t.quote}”</blockquote>
      <figcaption className="mt-5 flex items-center gap-3">
        <span
          aria-hidden="true"
          className="grid size-10 shrink-0 place-content-center rounded-full border border-brand/20 bg-brand-tint font-display text-sm font-700 text-brand"
        >
          {initials(t.name)}
        </span>
        <span className="flex flex-col">
          <span className="font-display text-sm font-700 leading-tight tracking-tight text-fg">{t.name}</span>
          <span className="text-xs leading-tight text-text-mute">{t.role}</span>
        </span>
      </figcaption>
    </figure>
  );
}

function MarqueeColumn({ items, duration, className }: { items: Testimonial[]; duration: number; className?: string }) {
  return (
    <div className={className}>
      <motion.div
        animate={{ translateY: '-50%' }}
        transition={{ duration, repeat: Infinity, ease: 'linear', repeatType: 'loop' }}
        className="flex flex-col gap-5 pb-5"
      >
        {[0, 1].map((dup) => (
          <Fragment key={dup}>
            {items.map((t, i) => (
              <MarqueeCard key={`${dup}-${i}`} t={t} />
            ))}
          </Fragment>
        ))}
      </motion.div>
    </div>
  );
}

/**
 * Prova social em colunas que rolam infinitamente (marquee) com fade nas bordas.
 * Adaptado aos tokens do nexaGO; avatares são monogramas (sem fotos externas).
 * Sob prefers-reduced-motion, vira um grid estático — nada se move.
 */
export function TestimonialsMarquee({ testimonials }: { testimonials: Testimonial[] }) {
  const reduce = useReducedMotion();

  if (reduce) {
    return (
      <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {testimonials.map((t, i) => (
          <MarqueeCard key={i} t={t} />
        ))}
      </div>
    );
  }

  const third = Math.ceil(testimonials.length / 3);
  const columns = [
    { items: testimonials.slice(0, third), duration: 26 },
    { items: testimonials.slice(third, third * 2), duration: 32, className: 'hidden md:block' },
    { items: testimonials.slice(third * 2), duration: 29, className: 'hidden lg:block' },
  ].filter((c) => c.items.length > 0);

  return (
    <div className="mt-14 flex max-h-[34rem] justify-center gap-5 overflow-hidden [mask-image:linear-gradient(to_bottom,transparent,black_18%,black_82%,transparent)]">
      {columns.map((col, i) => (
        <MarqueeColumn key={i} items={col.items} duration={col.duration} className={col.className} />
      ))}
    </div>
  );
}
