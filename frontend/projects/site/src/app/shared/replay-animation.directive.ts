import { Directive, ElementRef, effect, inject, input } from '@angular/core';

/**
 * Toca de novo as animações CSS do elemento sempre que a chave muda — para um número de placar
 * ou uma chamada que troca de valor sem sair do DOM. `[nxReplay]="valor"`.
 *
 * É o substituto de recriar o nó só para a animação de entrada rodar (um `@for` de um item com
 * `track` no valor), que custa um nó novo por mudança e faz o Angular avisar (NG0956).
 * A primeira renderização não reinicia nada: a animação de entrada já está tocando.
 */
@Directive({ selector: '[nxReplay]' })
export class ReplayAnimationDirective {
  readonly key = input.required<unknown>({ alias: 'nxReplay' });

  constructor() {
    const element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    let first = true;

    effect(() => {
      this.key();
      if (first) {
        first = false;
        return;
      }
      for (const animation of element.getAnimations()) {
        animation.cancel();
        animation.play();
      }
    });
  }
}
