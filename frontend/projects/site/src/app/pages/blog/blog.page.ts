import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { RevealDirective } from '../../shared/reveal.directive';
import { SpotlightCard } from '../../shared/ui/spotlight-card';
import { Chip, FilterGroup } from '../../shared/hub/filter-controls';
import { BlogCover } from './blog-cover';
import { BlogCategoryChip } from './blog-category-chip';
import { BlogAuthorAvatar } from './blog-author-avatar';
import { getAllPosts } from '../../../lib/blog/posts';
import { filterCategories, isoDay, mergeBlogFeed, type BlogFeedItem } from '../../../lib/blog/feed';
import { getSiteBlogPosts } from '../../../lib/firestore/blog';
import { getBlogCategories } from '../../../lib/firestore/blog-categories';
import type { BlogCategoryView } from '../../../lib/blog/categories';
import { formatDate } from '../../../lib/format';

const BASE = 'https://nexago.com.br';

/**
 * Listagem do blog: posts publicados no site pelo backoffice (`blogPosts`, Firestore) + os
 * posts estáticos antigos de `lib/blog/posts.ts`, juntos por data (`mergeBlogFeed` — slug
 * repetido fica com o do Firestore). Se a leitura do Firestore falhar, a lista mostra só os
 * estáticos com um aviso e "Tentar de novo". O filtro de categoria só aparece quando há mais
 * de uma na lista. O JSON-LD (`ItemList`) vai pro `document.head` depois da carga e sai no destroy.
 */
@Component({
  selector: 'app-blog-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RevealDirective, SpotlightCard, Chip, FilterGroup, BlogCover, BlogCategoryChip, BlogAuthorAvatar],
  template: `
    <main class="mx-auto max-w-6xl px-5 pb-24 pt-28 sm:px-6 sm:pt-32">
      <div nxReveal class="max-w-2xl">
        <p class="mb-3 font-mono text-sm font-600 uppercase tracking-[0.2em] text-brand">Blog</p>
        <h1 class="font-display text-[clamp(2rem,6vw,3.5rem)] font-800 leading-tight tracking-tight text-fg">
          Histórias da areia
        </h1>
        <p class="mt-4 text-balance text-base text-text-mute sm:text-lg">
          Guias, novidades e recaps das etapas — tudo sobre o ecossistema nexaGO.
        </p>
      </div>

      @if (loading()) {
        <ul class="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label="Carregando posts">
          @for (i of skeletonSlots; track i) {
            <li class="h-[380px] animate-pulse rounded-5 bg-surface-1"></li>
          }
        </ul>
      } @else if (items().length === 0) {
        @if (failed()) {
          <div class="mt-16 rounded-5 border border-line bg-surface-1 p-12 text-center">
            <p class="font-display text-lg font-700 text-fg">Não foi possível carregar o blog</p>
            <p class="mx-auto mt-2 max-w-sm text-sm text-text-mute">Confira sua conexão e tente de novo.</p>
            <button
              type="button"
              (click)="load()"
              class="mt-5 inline-flex items-center gap-1.5 rounded-pill border border-line-strong bg-surface-0 px-4 py-2 text-sm font-600 text-fg transition-colors hover:border-brand/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
            >
              Tentar de novo
            </button>
          </div>
        } @else {
          <div class="mt-16 rounded-5 border border-line bg-surface-1 p-12 text-center">
            <p class="font-display text-lg font-700 text-fg">Nada por aqui ainda</p>
            <p class="mx-auto mt-2 max-w-sm text-sm text-text-mute">Os primeiros conteúdos chegam em breve.</p>
          </div>
        }
      } @else {
        @if (failed()) {
          <div class="mt-10 flex flex-col gap-3 rounded-4 border border-line bg-surface-1 px-5 py-4 sm:flex-row sm:items-center sm:justify-between" role="status">
            <p class="text-sm text-text-mute">Não conseguimos carregar os posts mais recentes agora.</p>
            <button
              type="button"
              (click)="load()"
              class="inline-flex shrink-0 items-center gap-1.5 self-start rounded-pill border border-line-strong bg-surface-0 px-4 py-2 text-sm font-600 text-fg transition-colors hover:border-brand/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 sm:self-auto"
            >
              Tentar de novo
            </button>
          </div>
        }

        @if (categories().length > 0) {
          <div class="mt-12">
            <app-filter-group label="Tema">
              <app-chip [active]="category() === null" (pressed)="category.set(null)">Todos</app-chip>
              @for (c of categories(); track c.id) {
                <app-chip [active]="category() === c.id" (pressed)="category.set(c.id)">{{ c.label }}</app-chip>
              }
            </app-filter-group>
          </div>
        }

        <ul class="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" [class]="categories().length > 0 ? 'mt-8' : 'mt-14'">
          @for (p of visible(); track p.slug; let i = $index) {
            <li>
              <div nxReveal [nxRevealDelay]="(i % 3) * 60" class="h-full">
                <app-spotlight-card className="block h-full">
                  <a
                    [routerLink]="['/blog', p.slug]"
                    class="flex h-full flex-col focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
                  >
                    <app-blog-cover
                      class="aspect-[16/9] border-b border-line"
                      [coverUrl]="p.coverUrl"
                      [category]="p.category"
                      [label]="p.label"
                    />
                    <div class="flex flex-1 flex-col p-6">
                      @if (p.label) {
                        <app-blog-category-chip class="self-start" [label]="p.label" [category]="p.category" />
                      }
                      <h2 class="mt-3 font-display text-lg font-700 leading-snug tracking-tight text-fg transition-colors group-hover/spot:text-brand">
                        {{ p.title }}
                      </h2>
                      @if (p.summary) {
                        <p class="mt-2 line-clamp-3 flex-1 text-sm leading-relaxed text-text-mute">{{ p.summary }}</p>
                      } @else {
                        <div class="flex-1"></div>
                      }
                      <div class="mt-5 border-t border-line pt-4 text-xs text-text-dim">
                        @if (p.authorName) {
                          <p class="flex items-center gap-2 font-600 text-text-mute">
                            <app-blog-author-avatar [name]="p.authorName" [photoUrl]="p.authorPhotoUrl" [size]="20" />
                            <span class="truncate">{{ p.authorName }}</span>
                          </p>
                        }
                        <p class="mt-1">
                          @if (p.date) {
                            <time [attr.datetime]="isoDay(p.date)">{{ formatDate(p.date) }}</time>
                          }
                          @if (p.date && p.readMinutes) {
                            <span aria-hidden="true"> · </span>
                          }
                          @if (p.readMinutes) {
                            <span>{{ p.readMinutes }} min de leitura</span>
                          }
                        </p>
                      </div>
                    </div>
                  </a>
                </app-spotlight-card>
              </div>
            </li>
          }
        </ul>
      }
    </main>
  `,
})
export class BlogPage {
  protected readonly items = signal<BlogFeedItem[]>([]);
  protected readonly loading = signal(true);
  /** A leitura do Firestore falhou — a lista (se houver) é só dos estáticos. */
  protected readonly failed = signal(false);
  /** Lista efetiva de categorias (padrões ⊕ `blogCategories`). */
  private readonly categoryList = signal<BlogCategoryView[]>([]);
  /** Id da categoria escolhida no filtro. */
  protected readonly category = signal<string | null>(null);

  protected readonly skeletonSlots = [0, 1, 2];
  protected readonly formatDate = formatDate;
  protected readonly isoDay = isoDay;

  /**
   * Chips do filtro: categorias ATIVAS com post, na ordem da lista efetiva. Vazio quando a lista
   * inteira cai numa categoria só (não há o que filtrar).
   */
  protected readonly categories = computed(() => {
    const distinct = new Set(this.items().map((p) => p.category?.id ?? null));
    return distinct.size < 2 ? [] : filterCategories(this.items(), this.categoryList());
  });

  protected readonly visible = computed(() => {
    const c = this.category();
    return c ? this.items().filter((p) => p.category?.id === c) : this.items();
  });

  private readonly destroyRef = inject(DestroyRef);
  private jsonLd: HTMLScriptElement | null = null;
  private request = 0;

  constructor() {
    inject(Title).setTitle('Blog · nexaGO');
    this.destroyRef.onDestroy(() => this.jsonLd?.remove());
    this.load();
  }

  protected load(): void {
    const request = ++this.request;
    this.loading.set(true);

    const posts = getSiteBlogPosts()
      .then((remote) => ({ remote, failed: false }))
      .catch((err: unknown) => {
        console.error('[blog] getSiteBlogPosts failed:', err);
        return { remote: [], failed: true };
      });

    // Categorias em paralelo; nunca falham (sem leitura = só as 6 de origem).
    Promise.all([posts, getBlogCategories()]).then(([{ remote, failed }, categories]) => {
      if (request !== this.request) return; // um "Tentar de novo" mais novo já está em curso
      const items = mergeBlogFeed(remote, getAllPosts(), categories);
      this.categoryList.set(categories);
      this.items.set(items);
      this.failed.set(failed);
      this.loading.set(false);
      this.renderJsonLd(items);
    });
  }

  private renderJsonLd(items: BlogFeedItem[]): void {
    this.jsonLd?.remove();
    this.jsonLd = null;
    if (items.length === 0) return;

    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.text = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: 'Blog nexaGO',
      itemListElement: items.map((p, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        url: `${BASE}/blog/${p.slug}`,
        name: p.title,
      })),
    });
    document.head.appendChild(script);
    this.jsonLd = script;
  }
}
