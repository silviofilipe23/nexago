import { DestroyRef, Directive, ElementRef, afterRenderEffect, inject, input } from '@angular/core';

/** Encolhe a fonte até o texto caber numa linha — o `fitText` do protótipo.
 *
 *  No painel de LED o nome é lido do fundo do ginásio: reticências apagariam justo a parte que
 *  diferencia "Ana Paula" de "Ana Luiza". Então o nome longo DIMINUI, até um piso de 50% do
 *  tamanho do CSS; abaixo disso volta a valer o corte, porque letra pequena demais não se lê
 *  de longe. O elemento precisa de `white-space: nowrap` e `overflow: hidden`.
 *
 *  Reajusta quando a fonte da tela termina de carregar e quando a largura muda: medido só no
 *  primeiro render, o nome "cabia" na fonte de reserva e estourava quando a Sora chegava. */
@Directive({ selector: '[ledFitText]' })
export class LedFitTextDirective {
  /** O texto — mudar reavalia o tamanho. */
  readonly ledFitText = input.required<string>();

  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    afterRenderEffect(() => {
      this.ledFitText();
      this.fit();
    });

    const el = this.el.nativeElement;
    let largura = 0;
    const obs = new ResizeObserver(() => {
      if (el.clientWidth === largura) return;
      largura = el.clientWidth;
      this.fit();
    });
    obs.observe(el);
    void document.fonts?.ready.then(() => this.fit());
    inject(DestroyRef).onDestroy(() => obs.disconnect());
  }

  private fit(): void {
    const el = this.el.nativeElement;
    el.style.fontSize = '';
    const base = parseFloat(getComputedStyle(el).fontSize);
    if (!base || el.clientWidth === 0) return;
    let size = base;
    while (el.scrollWidth > el.clientWidth && size > base * 0.5) {
      size -= Math.max(1, base * 0.03);
      el.style.fontSize = `${size}px`;
    }
  }
}
