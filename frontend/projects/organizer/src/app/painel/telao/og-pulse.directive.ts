import { Directive, effect, ElementRef, inject, input } from '@angular/core';

/** Reinicia uma animação CSS no elemento sempre que o valor de `ogPulse` muda (ignora o valor
 *  inicial). O host define o efeito em `.og-pulse-run` — pop do placar, deslize da chamada,
 *  crossfade da grade na rotação. Truque clássico de restart: remove a classe, força reflow,
 *  adiciona de novo. */
@Directive({ selector: '[ogPulse]' })
export class OgPulseDirective {
  readonly ogPulse = input.required<unknown>();

  constructor() {
    const el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    let first = true;
    effect(() => {
      this.ogPulse();
      if (first) {
        first = false;
        return;
      }
      el.classList.remove('og-pulse-run');
      void el.offsetWidth;
      el.classList.add('og-pulse-run');
    });
  }
}
