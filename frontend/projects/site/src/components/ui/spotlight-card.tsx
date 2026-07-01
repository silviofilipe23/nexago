'use client';

import { type ElementType, type MouseEvent, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

function onSpotlightMove(e: MouseEvent<HTMLElement>) {
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  el.style.setProperty('--mx', `${e.clientX - r.left}px`);
  el.style.setProperty('--my', `${e.clientY - r.top}px`);
}

type SpotlightCardProps = {
  children: ReactNode;
  className?: string;
  /** Elemento semântico do card (div por padrão; ex.: 'figure', 'article'). */
  as?: ElementType;
};

/**
 * Card com glow laranja que segue o cursor + leve elevação no hover. Mesma
 * linguagem do TournamentCard, reutilizável em qualquer seção. Só anima
 * transform/opacity e desliga o lift sob prefers-reduced-motion.
 */
export function SpotlightCard({ children, className, as: Tag = 'div' }: SpotlightCardProps) {
  return (
    <Tag
      onMouseMove={onSpotlightMove}
      className={cn(
        'group/spot relative overflow-hidden rounded-5 border border-line bg-surface-1 transition-[transform,border-color] duration-300 ease-out',
        'hover:-translate-y-1 hover:border-brand/40 motion-reduce:hover:translate-y-0 motion-reduce:transition-none',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 opacity-0 transition-opacity duration-300 group-hover/spot:opacity-100"
        style={{
          background:
            'radial-gradient(300px circle at var(--mx, 50%) var(--my, 50%), rgba(255,106,26,0.13), transparent 60%)',
        }}
      />
      {children}
    </Tag>
  );
}
