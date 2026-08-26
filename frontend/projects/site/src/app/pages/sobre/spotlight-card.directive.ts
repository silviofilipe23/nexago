import { Directive, ElementRef, inject } from '@angular/core';

/**
 * Porta de `SpotlightCard` (site Next.js) como directive de atributo em vez de wrapper
 * component: aplica no próprio elemento semântico do card (ex.: `<article>`), evitando
 * um `<div>` extra. O glow que segue o cursor é um `<span>` estático no template do
 * consumidor (estilo via CSS var `--mx`/`--my`), esta directive só cuida das classes
 * base e de atualizar as vars no `mousemove`.
 */
@Directive({
  selector: '[appSpotlightCard]',
  host: {
    class:
      'group/spot relative overflow-hidden rounded-5 border border-line bg-surface-1 transition-[transform,border-color] duration-300 ease-out hover:-translate-y-1 hover:border-brand/40 motion-reduce:hover:translate-y-0 motion-reduce:transition-none',
    '(mousemove)': 'onMouseMove($event)',
  },
})
export class SpotlightCardDirective {
  private readonly elementRef = inject(ElementRef<HTMLElement>);

  protected onMouseMove(event: MouseEvent): void {
    const el = this.elementRef.nativeElement;
    const rect = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${event.clientX - rect.left}px`);
    el.style.setProperty('--my', `${event.clientY - rect.top}px`);
  }
}
