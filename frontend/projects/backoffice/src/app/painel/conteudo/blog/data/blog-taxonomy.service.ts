import { Injectable, computed, inject, signal } from '@angular/core';
import {
  BLOG_DEFAULT_CATEGORIES,
  categoryMetaIn,
  effectiveCategories,
  type BlogAuthorDef,
  type BlogCategoryDef,
  type CategoryMeta,
} from './blog-taxonomy';
import { BlogTaxonomyRepository } from './blog-taxonomy.repository';

/**
 * Categorias (lista efetiva) e autores do blog para as telas do backoffice. Começa com as 6 de
 * origem, para os chips já terem rótulo e cor; `load` lê os docs uma vez por sessão e `refresh`
 * relê depois de salvar.
 */
@Injectable({ providedIn: 'root' })
export class BlogTaxonomyService {
  private readonly repository = inject(BlogTaxonomyRepository);

  readonly categories = signal<BlogCategoryDef[]>(effectiveCategories([]));
  readonly authors = signal<BlogAuthorDef[]>([]);
  /** `false` até a primeira leitura terminar (bem ou mal). */
  readonly loaded = signal(false);
  readonly error = signal('');

  readonly activeCategories = computed(() => this.categories().filter((c) => c.active));
  private loading: Promise<void> | null = null;

  load(): Promise<void> {
    this.loading ??= this.refresh();
    return this.loading;
  }

  async refresh(): Promise<void> {
    const [categories, authors] = await Promise.allSettled([this.repository.categoryDocs(), this.repository.authors()]);
    if (categories.status === 'fulfilled') {
      this.categories.set(effectiveCategories(categories.value));
    }
    if (authors.status === 'fulfilled') {
      this.authors.set(authors.value);
    }
    const failed = [categories, authors].find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined;
    this.error.set(failed ? String((failed.reason as { message?: unknown })?.message ?? 'erro') : '');
    this.loaded.set(true);
  }

  meta(id: string): CategoryMeta {
    return categoryMetaIn(this.categories(), id);
  }

  /** As 6 de origem, para quem precisa de um padrão sem ler nada. */
  readonly defaults = BLOG_DEFAULT_CATEGORIES;
}
