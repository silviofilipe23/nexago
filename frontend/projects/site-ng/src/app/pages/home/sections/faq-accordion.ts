import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { RevealDirective } from '../../../shared/reveal.directive';

export interface QA {
  q: string;
  a: string;
}

/**
 * Porta de `FaqAccordion` (site Next.js). O original usava `AnimatePresence`/Framer Motion
 * pra animar altura; aqui é CSS puro via o truque `grid-template-rows: 0fr -> 1fr`
 * (transição suave sem medir altura em JS) e respeita `prefers-reduced-motion` via
 * `motion-reduce:transition-none`.
 */
@Component({
  selector: 'app-faq-accordion',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RevealDirective],
  template: `
    <div [class]="className() + ' space-y-3'">
      @for (item of items(); track item.q; let i = $index) {
        <div
          nxReveal
          [nxRevealDelay]="i * 40"
          class="rounded-4 border bg-surface-1 px-6 transition-colors duration-200"
          [class.border-brand]="isOpen(i)"
          [class.border-line]="!isOpen(i)"
        >
          <h3>
            <button
              [id]="buttonId(i)"
              type="button"
              [attr.aria-expanded]="isOpen(i)"
              [attr.aria-controls]="panelId(i)"
              (click)="toggle(i)"
              class="flex w-full cursor-pointer items-center justify-between gap-4 py-5 text-left font-display text-base font-700 tracking-tight text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
            >
              {{ item.q }}
              <svg
                class="size-5 shrink-0 text-brand transition-transform duration-300 ease-out motion-reduce:transition-none"
                [class.rotate-45]="isOpen(i)"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M5 12h14" />
                <path d="M12 5v14" />
              </svg>
            </button>
          </h3>
          <div
            [id]="panelId(i)"
            role="region"
            [attr.aria-labelledby]="buttonId(i)"
            class="grid overflow-hidden transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none"
            [style.grid-template-rows]="isOpen(i) ? '1fr' : '0fr'"
          >
            <div class="overflow-hidden">
              <p class="pb-5 text-sm leading-relaxed text-text-mute">{{ item.a }}</p>
            </div>
          </div>
        </div>
      }
    </div>
  `,
})
export class FaqAccordionComponent {
  readonly items = input.required<QA[]>();
  readonly className = input('mt-14');

  private readonly open = signal<number | null>(0);

  protected isOpen(i: number): boolean {
    return this.open() === i;
  }

  protected buttonId(i: number): string {
    return `faq-button-${i}`;
  }

  protected panelId(i: number): string {
    return `faq-panel-${i}`;
  }

  protected toggle(i: number): void {
    this.open.update((current) => (current === i ? null : i));
  }
}
