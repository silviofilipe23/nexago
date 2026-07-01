'use client';

import { motion, useReducedMotion, type HTMLMotionProps } from 'motion/react';

type RevealProps = HTMLMotionProps<'div'> & {
  delay?: number;
};

/**
 * Reveal on scroll: sobe + fade com easing premium. Respeita prefers-reduced-motion
 * (sem deslocamento, apenas conteúdo estático). Anima só transform/opacity.
 */
export function Reveal({ delay = 0, children, ...props }: RevealProps) {
  const reduce = useReducedMotion();

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 24 }}
      whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1], delay }}
      {...props}
    >
      {children}
    </motion.div>
  );
}
