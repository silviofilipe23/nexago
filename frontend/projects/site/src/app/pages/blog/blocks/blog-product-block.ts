import { ChangeDetectionStrategy, Component, computed, effect, input, signal } from '@angular/core';
import { StoreButtons } from '../../../shared/ui/store-buttons';
import { getShowcaseProduct, type ShowcaseProductSummary } from '../../../../lib/firestore/store-showcase';
import { formatCents } from '../../../../lib/format';

/**
 * Bloco "Produto da loja" do post: lê `storeShowcase/{id}` ao vivo e mostra foto, nome e preço.
 * O site não tem loja, então a chamada é baixar o app (botões de loja existentes). Se o produto
 * saiu da vitrine, o bloco some em silêncio.
 */
@Component({
  selector: 'app-blog-product-block',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [StoreButtons],
  host: { class: 'block', '[class.hidden]': 'gone()' },
  template: `
    @if (loading()) {
      <div class="h-40 animate-pulse rounded-4 bg-surface-1" aria-hidden="true"></div>
    } @else if (product(); as p) {
      <div class="rounded-4 border border-line bg-surface-1 p-3 sm:p-4">
        <div class="flex items-center gap-4">
          <div class="size-20 shrink-0 overflow-hidden rounded-3 bg-surface-2 sm:size-24">
            @if (p.coverUrl) {
              <img [src]="p.coverUrl" alt="" loading="lazy" class="size-full object-cover" />
            } @else {
              <div class="flex size-full items-center justify-center text-text-dim">
                <svg class="size-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" /><path d="M3 6h18" /><path d="M16 10a4 4 0 0 1-8 0" />
                </svg>
              </div>
            }
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <span class="font-mono text-[11px] font-600 uppercase tracking-wider text-text-dim">Loja nexaGO</span>
              @if (p.soldOut) {
                <span class="rounded-pill border border-line-strong bg-surface-2 px-2.5 py-1 text-xs font-600 text-text-mute">Esgotado</span>
              }
            </div>
            <p class="mt-1.5 line-clamp-2 font-display text-base font-700 leading-snug tracking-tight text-fg sm:text-lg">{{ p.name }}</p>
            <p class="mt-1 text-sm text-text-mute">{{ price() }}</p>
          </div>
        </div>
        <div class="mt-4 flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p class="text-sm text-text-mute">Compre pelo app nexaGO</p>
          <app-store-buttons size="sm" className="flex flex-wrap gap-2" />
        </div>
      </div>
    }
  `,
})
export class BlogProductBlock {
  readonly productId = input.required<string>();

  protected readonly product = signal<ShowcaseProductSummary | null>(null);
  protected readonly loading = signal(true);
  protected readonly gone = computed(() => !this.loading() && !this.product());

  /** "a partir de" só quando as variações têm preços diferentes. */
  protected readonly price = computed(() => {
    const p = this.product();
    if (!p) return '';
    const min = formatCents(p.minPriceCents);
    return p.maxPriceCents > p.minPriceCents ? `a partir de ${min}` : min;
  });

  constructor() {
    effect((onCleanup) => {
      const id = this.productId();
      this.loading.set(true);
      this.product.set(null);
      let cancelled = false;
      onCleanup(() => (cancelled = true));

      getShowcaseProduct(id).then((p) => {
        if (cancelled) return;
        this.product.set(p);
        this.loading.set(false);
      });
    });
  }
}
