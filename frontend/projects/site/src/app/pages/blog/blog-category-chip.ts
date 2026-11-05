import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { BlogCategoryView } from '../../../lib/blog/categories';

/**
 * Chip de categoria do blog. A cor vem da categoria (token `--color-cat-*` nas 6 de origem, hex do
 * doc nas criadas no backoffice) e entra só como custom property no host: `--cat-dark`/`--cat-light`,
 * e o tema escolhe qual vira `--cat`. Sem categoria (post estático com rótulo de tag), usa a marca.
 */
@Component({
  selector: 'app-blog-category-chip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'inline-flex',
    '[style.--cat-dark]': 'category()?.dark ?? null',
    '[style.--cat-light]': 'category()?.light ?? null',
  },
  styles: `
    :host {
      --cat: var(--cat-dark, var(--color-brand));
    }
    :host-context([data-theme='light']) {
      --cat: var(--cat-light, var(--color-brand));
    }
  `,
  template: `
    <span
      class="rounded-pill border border-(--cat)/25 bg-(--cat)/10 px-2.5 py-1 font-mono text-[11px] font-600 uppercase tracking-wider text-(--cat)"
    >{{ label() }}</span>
  `,
})
export class BlogCategoryChip {
  readonly label = input.required<string>();
  readonly category = input<BlogCategoryView | null>(null);
}
