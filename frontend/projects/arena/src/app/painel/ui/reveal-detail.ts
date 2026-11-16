import { afterNextRender, type ElementRef, type Injector } from '@angular/core';

/** Fração da tela abaixo da qual o topo do detalhe conta como "fora de vista". */
const REVEAL_THRESHOLD = 0.6;

/** O detalhe começa abaixo da faixa visível útil? Só para baixo: no desktop, lado a lado com a
 *  lista, o topo do detalhe nunca fica abaixo da lista, então nada rola. */
export function detailNeedsReveal(detailTop: number, viewportHeight: number): boolean {
  return viewportHeight > 0 && detailTop > viewportHeight * REVEAL_THRESHOLD;
}

/** Telas mestre–detalhe empilhadas no celular: o detalhe do item tocado fica embaixo da lista
 *  inteira e o toque parece não fazer nada. Depois do próximo render (o detalhe já trocou), rola
 *  até ele se estiver fora de vista. */
export function revealDetailAfterRender(injector: Injector, detail: () => ElementRef<HTMLElement> | undefined): void {
  afterNextRender(
    {
      read: () => {
        const el = detail()?.nativeElement;
        const view = el?.ownerDocument.defaultView;
        if (!el || !view) return;
        if (!detailNeedsReveal(el.getBoundingClientRect().top, view.innerHeight)) return;
        const reduceMotion = view.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
        el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
      },
    },
    { injector },
  );
}
