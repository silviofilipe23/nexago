import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { PillComponent, type PillTone } from '../../../ui/pill.component';
import { BLOG_STATUS_LABELS, type BlogStatus } from '../data/blog-post';
import { BlogTaxonomyService } from '../data/blog-taxonomy.service';

const STATUS_TONES: Record<BlogStatus, PillTone> = {
  published: 'green',
  scheduled: 'yellow',
  review: 'orange',
  draft: 'dim',
};

/** Chip de status do post (Publicado / Agendado / Em revisão / Rascunho). */
@Component({
  selector: 'bo-blog-status-pill',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PillComponent],
  template: `<bo-pill [tone]="tone()">{{ label() }}</bo-pill>`,
})
export class BlogStatusPillComponent {
  readonly status = input.required<BlogStatus>();
  protected readonly tone = computed(() => STATUS_TONES[this.status()]);
  protected readonly label = computed(() => BLOG_STATUS_LABELS[this.status()]);
}

/** Chip da categoria na cor dela. */
@Component({
  selector: 'bo-blog-category-chip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="chip" [style.color]="meta().color" [style.border-color]="meta().color + '59'" [style.background]="meta().color + '1a'">
      {{ meta().label }}
    </span>
  `,
  styles: `
    .chip { display: inline-flex; align-items: center; height: 22px; padding: 0 9px; border-radius: var(--nx-r-pill); border: 1px solid; font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; white-space: nowrap; }
  `,
})
export class BlogCategoryChipComponent {
  readonly category = input.required<string>();
  private readonly taxonomy = inject(BlogTaxonomyService);
  /** Cor e rótulo da lista efetiva (doc vence o padrão); id sumido = "Blog" neutro. */
  protected readonly meta = computed(() => this.taxonomy.meta(this.category()));
}

/** Miniatura da capa; sem capa, um bloco na cor da categoria com o rótulo dela. */
@Component({
  selector: 'bo-blog-cover-thumb',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (coverUrl(); as src) {
      <img class="thumb" [src]="src" alt="" loading="lazy" />
    } @else {
      <div class="thumb placeholder" role="img" [attr.aria-label]="'Sem capa · ' + meta().label" [style.background]="gradient()">
        <span>{{ meta().label }}</span>
      </div>
    }
  `,
  styles: `
    :host { display: block; flex: none; }
    .thumb { display: block; width: 84px; height: 56px; border-radius: var(--nx-r-2); object-fit: cover; background: var(--nx-surface-1); }
    .placeholder { position: relative; overflow: hidden; }
    .placeholder span { position: absolute; left: 8px; bottom: 6px; right: 6px; font-family: var(--nx-font-display); font-weight: 800; font-size: 9.5px; letter-spacing: -0.01em; text-transform: uppercase; color: rgba(255, 255, 255, 0.4); overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  `,
})
export class BlogCoverThumbComponent {
  readonly coverUrl = input<string | null>(null);
  readonly category = input.required<string>();
  private readonly taxonomy = inject(BlogTaxonomyService);
  /** Cor e rótulo da lista efetiva (doc vence o padrão); id sumido = "Blog" neutro. */
  protected readonly meta = computed(() => this.taxonomy.meta(this.category()));
  protected readonly gradient = computed(() => `linear-gradient(135deg, #111114 0%, ${this.meta().color}66 140%)`);
}
