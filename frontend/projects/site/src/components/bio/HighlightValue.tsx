'use client';

import { useEffect, useRef } from 'react';

const DURATION_MS = 1400;

/** Só conta o que é um inteiro puro. O gestor digita o destaque como texto livre
 *  ("4.8", "R$ 50", "1.2k"), e animar isso exigiria adivinhar o formato. */
function countTargetOf(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d{1,9}$/.test(trimmed)) return null;
  return Number(trimmed);
}

/**
 * Valor de um destaque, com contagem de 0 até o número quando ele é inteiro.
 *
 * O React renderiza o valor final uma única vez — a contagem escreve direto no nó. Um
 * `setState` por quadro re-renderizaria a árvore ~85 vezes para animar um texto, e
 * qualquer desmontagem no meio (StrictMode, Fast Refresh) congelava um número parcial
 * na tela. Aqui o cleanup devolve o valor certo, então o pior caso é não animar.
 */
export function HighlightValue({ value }: { value: string }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const target = countTargetOf(value);
    const el = ref.current;
    if (target === null || !el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let frame = 0;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();

      const start = performance.now();
      const tick = (now: number) => {
        const progress = Math.min((now - start) / DURATION_MS, 1);
        if (progress >= 1) {
          el.textContent = value;
          return;
        }
        // ease-out cúbico: começa rápido e assenta no valor final.
        el.textContent = String(Math.round(target * (1 - Math.pow(1 - progress, 3))));
        frame = requestAnimationFrame(tick);
      };

      el.textContent = '0';
      frame = requestAnimationFrame(tick);
    });

    observer.observe(el);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      el.textContent = value;
    };
  }, [value]);

  return <span ref={ref}>{value}</span>;
}
