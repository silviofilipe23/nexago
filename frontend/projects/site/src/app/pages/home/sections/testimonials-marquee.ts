import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { Testimonial } from './testimonial-card';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const second = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + second).toUpperCase();
}

/** Card usado dentro do marquee — não é o `TestimonialCard` (sem spotlight), mesma distinção do original. */
@Component({
  selector: 'app-marquee-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  template: `
    <figure class="w-full max-w-xs rounded-4 border border-line bg-surface-1 p-6 shadow-elev-1">
      <blockquote class="text-sm leading-relaxed text-fg">&ldquo;{{ t().quote }}&rdquo;</blockquote>
      <figcaption class="mt-5 flex items-center gap-3">
        <span
          aria-hidden="true"
          class="grid size-10 shrink-0 place-content-center rounded-full border border-brand/20 bg-brand-tint font-display text-sm font-700 text-brand"
        >
          {{ initials() }}
        </span>
        <span class="flex flex-col">
          <span class="font-display text-sm font-700 leading-tight tracking-tight text-fg">{{ t().name }}</span>
          <span class="text-xs leading-tight text-text-mute">{{ t().role }}</span>
        </span>
      </figcaption>
    </figure>
  `,
})
export class MarqueeCardComponent {
  readonly t = input.required<Testimonial>();
  protected readonly initials = computed(() => initials(this.t().name));
}

/** Uma coluna do marquee: sobe o conteúdo (duplicado 2x) em loop infinito via CSS `animation`. */
@Component({
  selector: 'app-marquee-column',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MarqueeCardComponent],
  host: {
    '[class]': 'hostClasses()',
  },
  styles: `
    @keyframes nx-marquee-scroll {
      to {
        transform: translateY(-50%);
      }
    }
    .nx-marquee-track {
      animation-name: nx-marquee-scroll;
      animation-timing-function: linear;
      animation-iteration-count: infinite;
    }
    @media (prefers-reduced-motion: reduce) {
      .nx-marquee-track {
        animation: none;
      }
    }
  `,
  template: `
    <div class="nx-marquee-track flex flex-col gap-5 pb-5" [style.animation-duration.s]="duration()">
      @for (t of doubledItems(); track $index) {
        <app-marquee-card [t]="t" />
      }
    </div>
  `,
})
export class MarqueeColumnComponent {
  readonly items = input.required<Testimonial[]>();
  readonly duration = input.required<number>();
  readonly columnClass = input('');

  protected readonly doubledItems = computed(() => [...this.items(), ...this.items()]);
  protected readonly hostClasses = computed(() => this.columnClass());
}

/**
 * Porta de `TestimonialsMarquee` (site Next.js). O Framer Motion (`animate={{ translateY: '-50%' }}`,
 * `repeat: Infinity`) virou uma `@keyframes` CSS por coluna (`MarqueeColumnComponent`), com a mesma
 * duração por coluna do original (26s/32s/29s). Sob `prefers-reduced-motion`, cai pra um grid
 * estático — nada se move — igual ao original.
 */
@Component({
  selector: 'app-testimonials-marquee',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MarqueeCardComponent, MarqueeColumnComponent],
  template: `
    @if (reduceMotion) {
      <div class="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        @for (t of testimonials(); track $index) {
          <app-marquee-card [t]="t" />
        }
      </div>
    } @else {
      <div class="mt-14 flex max-h-[34rem] justify-center gap-5 overflow-hidden [mask-image:linear-gradient(to_bottom,transparent,black_18%,black_82%,transparent)]">
        @for (col of columns(); track $index) {
          <app-marquee-column [items]="col.items" [duration]="col.duration" [columnClass]="col.className" />
        }
      </div>
    }
  `,
})
export class TestimonialsMarqueeSection {
  readonly testimonials = input.required<Testimonial[]>();

  protected readonly reduceMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  protected readonly columns = computed(() => {
    const items = this.testimonials();
    const third = Math.ceil(items.length / 3);
    return [
      { items: items.slice(0, third), duration: 26, className: '' },
      { items: items.slice(third, third * 2), duration: 32, className: 'hidden md:block' },
      { items: items.slice(third * 2), duration: 29, className: 'hidden lg:block' },
    ].filter((c) => c.items.length > 0);
  });
}
