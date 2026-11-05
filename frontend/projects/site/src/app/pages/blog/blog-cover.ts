import { ChangeDetectionStrategy, Component, computed, input, linkedSignal } from '@angular/core';
import { BLOG_NEUTRAL_ART, type BlogCategoryView } from '../../../lib/blog/categories';

/**
 * Capa do post: a foto, ou — sem foto (ou se ela não carregar) — a arte padrão em gradiente da
 * cor da categoria, como no app. A arte é sempre escura (nos dois temas), por isso o rótulo
 * d'água usa branco fixo. Decorativa: o título do post já está no texto ao lado.
 */
@Component({
  selector: 'app-blog-cover',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block overflow-hidden' },
  template: `
    @if (coverUrl() && !failed()) {
      <img
        [src]="coverUrl()"
        alt=""
        [attr.loading]="eager() ? 'eager' : 'lazy'"
        (error)="failed.set(true)"
        class="size-full object-cover"
      />
    } @else {
      <div class="relative size-full" [style.background-image]="art()" aria-hidden="true">
        @if (label(); as l) {
          <span
            class="absolute bottom-3 left-4 right-4 truncate font-display text-[clamp(1.5rem,6vw,2.75rem)] font-800 leading-none tracking-tight text-white/15"
          >{{ l }}</span>
        }
      </div>
    }
  `,
})
export class BlogCover {
  readonly coverUrl = input<string | null>(null);
  readonly category = input<BlogCategoryView | null>(null);
  readonly label = input<string | null>(null);
  /** Capa acima da dobra (página do post): carrega sem esperar o scroll. */
  readonly eager = input(false);

  /** Volta a false quando a URL muda (o Router reaproveita a página entre dois posts). */
  protected readonly failed = linkedSignal({ source: this.coverUrl, computation: () => false });

  protected readonly art = computed(() => {
    // Hex validado no mapeamento (`#RRGGBB`): o tom escuro da categoria, de origem ou do doc.
    const color = this.category()?.art ?? BLOG_NEUTRAL_ART;
    return (
      'repeating-linear-gradient(135deg, rgba(255,255,255,0.03) 0 10px, transparent 10px 20px), ' +
      `linear-gradient(135deg, #0b0b0c 0%, ${color} 140%)`
    );
  });
}
