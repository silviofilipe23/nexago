import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { RevealDirective } from '../../shared/reveal.directive';

export interface Qa {
  q: string;
  a: string;
}

/**
 * Porta de `FaqAccordion` (site Next.js). O original usava `AnimatePresence`
 * (Framer Motion) pra altura animada; aqui a expansão é CSS puro via o truque
 * `grid-template-rows: 0fr → 1fr` (sem medir altura em JS).
 */
@Component({
  selector: 'app-faq-accordion',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RevealDirective],
  host: { class: 'block space-y-3' },
  templateUrl: './faq-accordion.html',
})
export class FaqAccordion {
  readonly items = input.required<Qa[]>();

  protected readonly openIndex = signal<number | null>(0);

  protected toggle(index: number): void {
    this.openIndex.update((current) => (current === index ? null : index));
  }

  protected panelClasses(index: number): string {
    const base = 'rounded-4 border bg-surface-1 px-6 transition-colors duration-200';
    return this.openIndex() === index ? `${base} border-brand/30` : `${base} border-line hover:border-line-strong`;
  }
}
