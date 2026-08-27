import { ChangeDetectionStrategy, Component, ElementRef, effect, input, viewChild } from '@angular/core';

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
 * Porta de `HighlightValue.tsx` (site Next.js). Lá o React renderiza o valor final uma
 * única vez e a contagem escreve direto no nó via `useRef` — um `setState` por quadro
 * re-renderizaria a árvore ~85 vezes para animar um texto. Aqui o mesmo raciocínio vale:
 * a interpolação `{{ value() }}` no template cobre o caso estático (não numérico ou
 * `prefers-reduced-motion`), e o `effect()` assume o nó via `viewChild` só quando vai animar,
 * escrevendo em `textContent` fora da change detection. O cleanup do `effect` (equivalente
 * ao cleanup do `useEffect`) devolve o valor final se a animação for interrompida no meio
 * (troca de página, novo `value`) — o pior caso é não animar, nunca um número parcial preso.
 */
@Component({
  selector: 'app-highlight-value',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  template: `<span #el>{{ value() }}</span>`,
})
export class HighlightValue {
  readonly value = input.required<string>();

  private readonly elRef = viewChild.required<ElementRef<HTMLSpanElement>>('el');

  constructor() {
    effect((onCleanup) => {
      const value = this.value();
      const el = this.elRef().nativeElement;

      const target = countTargetOf(value);
      if (target === null) return;
      if (typeof window === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

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
      onCleanup(() => {
        observer.disconnect();
        cancelAnimationFrame(frame);
        el.textContent = value;
      });
    });
  }
}
