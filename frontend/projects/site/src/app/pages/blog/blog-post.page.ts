import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Meta, Title } from '@angular/platform-browser';
import { RevealDirective } from '../../shared/reveal.directive';
import { ButtonDirective } from '../../shared/ui/button.directive';
import { StoreButtons } from '../../shared/ui/store-buttons';
import { BlogCover } from './blog-cover';
import { BlogTournamentBlock } from './blocks/blog-tournament-block';
import { BlogProductBlock } from './blocks/blog-product-block';
import { BlogVideoBlock } from './blocks/blog-video-block';
import { getPostBySlug, STATIC_POST_AUTHOR, staticPostDate, staticReadMinutes, type BlogPost } from '../../../lib/blog/posts';
import { getSiteBlogPostBySlug, type BlogCategory, type SiteBlogPost } from '../../../lib/firestore/blog';
import { BLOG_CATEGORY_META, BLOG_NEUTRAL_CHIP } from '../../../lib/blog/categories';
import { isoDay } from '../../../lib/blog/feed';
import { formatDate } from '../../../lib/format';

const BASE = 'https://nexago.com.br';

type PostView = { kind: 'remote'; post: SiteBlogPost } | { kind: 'static'; post: BlogPost };

/** Cabeçalho comum aos dois tipos de post. */
interface PostHeader {
  title: string;
  subtitle: string | null;
  description: string;
  category: BlogCategory | null;
  labels: string[];
  authorName: string | null;
  authorRole: string | null;
  date: Date | null;
  readMinutes: number | null;
  coverUrl: string | null;
}

/**
 * Post individual (`/blog/:slug`). Busca primeiro no Firestore (post publicado no site pelo
 * backoffice); sem resultado, cai nos posts estáticos de `lib/blog/posts.ts`, que seguem
 * renderizando o `bodyHtml` autoral via `[innerHTML]` como antes. Sem nenhum dos dois, "Post não
 * encontrado". Se a leitura do Firestore falhar e não houver estático com o slug, mostra o erro
 * com "Tentar de novo" em vez de afirmar que o post não existe.
 *
 * O corpo do Firestore é texto puro renderizado por binding normal (escapado) — nada de dado do
 * Firestore passa por `[innerHTML]`.
 *
 * O fetch roda num `effect()` sobre `slug()` porque o Router reaproveita a instância entre dois
 * posts; o `onCleanup` marca a resposta antiga como obsoleta e desfaz título/descrição/JSON-LD
 * (mesmo padrão de `torneio-detail.page.ts`).
 */
@Component({
  selector: 'app-blog-post-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    RevealDirective,
    ButtonDirective,
    StoreButtons,
    BlogCover,
    BlogTournamentBlock,
    BlogProductBlock,
    BlogVideoBlock,
  ],
  styleUrl: './blog-post.page.scss',
  template: `
    <main class="mx-auto max-w-3xl px-5 pb-24 pt-28 sm:px-6 sm:pt-32">
      @if (loading()) {
        <div aria-busy="true" aria-label="Carregando post">
          <div class="h-4 w-28 animate-pulse rounded-pill bg-surface-1"></div>
          <div class="mt-8 h-12 w-4/5 animate-pulse rounded-3 bg-surface-1"></div>
          <div class="mt-4 h-5 w-3/5 animate-pulse rounded-pill bg-surface-1"></div>
          <div class="mt-10 aspect-[16/9] animate-pulse rounded-5 bg-surface-1"></div>
        </div>
      } @else if (view(); as v) {
        @let h = header(v);
        <div nxReveal>
          <a
            routerLink="/blog"
            class="inline-flex items-center gap-1.5 text-sm font-500 text-text-mute transition-colors hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:rounded-2"
          >
            <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="m12 19-7-7 7-7" /><path d="M19 12H5" />
            </svg>
            Voltar ao blog
          </a>

          @if (h.labels.length > 0) {
            <div class="mt-8 flex flex-wrap items-center gap-2">
              @for (l of h.labels; track l) {
                <span
                  class="rounded-pill border px-2.5 py-1 font-mono text-[11px] font-600 uppercase tracking-wider"
                  [class]="chipClass(h.category)"
                >{{ l }}</span>
              }
            </div>
          }

          <h1
            class="font-display text-[clamp(2rem,5.5vw,3.25rem)] font-800 leading-tight tracking-tight text-fg"
            [class]="h.labels.length > 0 ? 'mt-4' : 'mt-8'"
          >
            {{ h.title }}
          </h1>

          @if (h.subtitle) {
            <p class="mt-4 text-balance text-lg leading-relaxed text-text-mute">{{ h.subtitle }}</p>
          }

          <div class="mt-6 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text-dim">
            @if (h.authorName) {
              <span>
                Por <span class="font-600 text-fg">{{ h.authorName }}</span>
                @if (h.authorRole) {
                  <span>, {{ h.authorRole }}</span>
                }
              </span>
              <span aria-hidden="true">·</span>
            }
            @if (h.date) {
              <time [attr.datetime]="isoDay(h.date)">{{ formatDate(h.date) }}</time>
            }
            @if (h.readMinutes) {
              <span aria-hidden="true">·</span>
              <span>{{ h.readMinutes }} min de leitura</span>
            }
          </div>
        </div>

        @if (v.kind === 'remote') {
          <app-blog-cover
            class="mt-10 aspect-[16/9] rounded-5 border border-line"
            [coverUrl]="v.post.coverUrl"
            [category]="v.post.category"
            [label]="h.labels.length > 0 ? h.labels[0] : null"
            [eager]="true"
          />

          <article class="prose-content mt-10">
            @for (b of v.post.body; track $index) {
              @if (b.type === 'paragraph') {
                @for (part of b.parts; track $index) {
                  <p class="whitespace-pre-line">{{ part }}</p>
                }
              } @else if (b.type === 'heading') {
                <h2>{{ b.text }}</h2>
              } @else if (b.type === 'list') {
                <ul>
                  @for (item of b.items; track $index) {
                    <li>{{ item }}</li>
                  }
                </ul>
              } @else if (b.type === 'quote') {
                <blockquote>{{ b.text }}</blockquote>
              } @else if (b.type === 'image') {
                <figure>
                  <img [src]="b.url" [alt]="b.caption" loading="lazy" />
                  @if (b.caption) {
                    <figcaption>{{ b.caption }}</figcaption>
                  }
                </figure>
              } @else if (b.type === 'tournament') {
                <app-blog-tournament-block [tournamentId]="b.tournamentId" />
              } @else if (b.type === 'product') {
                <app-blog-product-block [productId]="b.productId" />
              } @else if (b.type === 'video') {
                <app-blog-video-block [url]="b.url" [caption]="b.caption" [provider]="b.provider" [youtubeId]="b.youtubeId" />
              }
            }
          </article>

          @if (v.post.cta; as cta) {
            <aside class="mt-14 rounded-5 border border-line bg-surface-1 p-7 sm:p-8">
              @if (cta.url) {
                <p class="font-mono text-xs font-600 uppercase tracking-wider text-brand">Próximo passo</p>
                <a nxButton [href]="cta.url" target="_blank" rel="noopener noreferrer" class="mt-4">
                  {{ cta.label }}
                  <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  </svg>
                </a>
              } @else {
                <p class="font-mono text-xs font-600 uppercase tracking-wider text-brand">No app nexaGO</p>
                <p class="mt-2 font-display text-xl font-700 tracking-tight text-fg">{{ cta.label }}</p>
                <p class="mt-1.5 text-sm text-text-mute">Baixe o app nexaGO e continue por lá.</p>
                <app-store-buttons size="sm" className="mt-5 flex flex-wrap gap-3" />
              }
            </aside>
          }
        } @else {
          <article class="prose-content mt-10" [innerHTML]="v.post.bodyHtml"></article>
        }
      } @else if (failed()) {
        <div class="pt-4 text-center">
          <p class="font-display text-2xl font-700 text-fg">Não foi possível carregar o post</p>
          <p class="mx-auto mt-3 max-w-sm text-sm text-text-mute">Confira sua conexão e tente de novo.</p>
          <div class="mt-7 flex flex-wrap justify-center gap-3">
            <button nxButton type="button" (click)="retry()">Tentar de novo</button>
            <a nxButton="secondary" routerLink="/blog">Voltar ao blog</a>
          </div>
        </div>
      } @else {
        <div class="pt-4 text-center">
          <p class="font-display text-2xl font-700 text-fg">Post não encontrado</p>
          <p class="mx-auto mt-3 max-w-sm text-sm text-text-mute">Esse post não existe ou foi removido.</p>
          <a nxButton="primary" routerLink="/blog" class="mt-7 inline-flex">Voltar ao blog</a>
        </div>
      }
    </main>
  `,
})
export class BlogPostPage {
  readonly slug = input.required<string>();

  protected readonly view = signal<PostView | null>(null);
  protected readonly loading = signal(true);
  /** A leitura do Firestore falhou e não havia post estático com o slug. */
  protected readonly failed = signal(false);
  private readonly attempt = signal(0);

  protected readonly formatDate = formatDate;
  protected readonly isoDay = isoDay;

  private readonly titleService = inject(Title);
  private readonly meta = inject(Meta);
  private readonly defaultDescription = this.meta.getTag('name="description"')?.content ?? '';

  constructor() {
    effect((onCleanup) => {
      const slug = this.slug();
      this.attempt();
      this.loading.set(true);
      this.failed.set(false);
      this.view.set(null);

      let cancelled = false;
      let undoHead: (() => void) | null = null;
      onCleanup(() => {
        cancelled = true;
        undoHead?.();
      });

      getSiteBlogPostBySlug(slug)
        .then((post) => ({ post, failed: false }))
        .catch((err: unknown) => {
          console.error('[blog] getSiteBlogPostBySlug failed:', err);
          return { post: null, failed: true };
        })
        .then(({ post, failed }) => {
          if (cancelled) return; // resposta de uma navegação anterior, já obsoleta

          const local = post ? null : getPostBySlug(slug);
          const view: PostView | null = post
            ? { kind: 'remote', post }
            : local
              ? { kind: 'static', post: local }
              : null;

          this.view.set(view);
          this.failed.set(!view && failed);
          this.loading.set(false);

          if (view) {
            undoHead = this.applyHead(view);
          } else {
            this.titleService.setTitle(failed ? 'Blog · nexaGO' : 'Post não encontrado · nexaGO');
          }
        });
    });
  }

  protected retry(): void {
    this.attempt.update((n) => n + 1);
  }

  protected header(v: PostView): PostHeader {
    if (v.kind === 'remote') {
      const p = v.post;
      return {
        title: p.title,
        subtitle: p.subtitle || null,
        description: p.description,
        category: p.category,
        labels: p.category ? [BLOG_CATEGORY_META[p.category].label] : p.tags.slice(0, 1),
        authorName: p.author?.name ?? null,
        authorRole: p.author?.role || null,
        date: p.publishAt,
        readMinutes: p.readMinutes,
        coverUrl: p.coverUrl,
      };
    }
    const p = v.post;
    return {
      title: p.title,
      subtitle: null,
      description: p.excerpt,
      category: null,
      labels: p.tags ?? [],
      authorName: STATIC_POST_AUTHOR,
      authorRole: null,
      date: staticPostDate(p),
      readMinutes: staticReadMinutes(p),
      coverUrl: null,
    };
  }

  protected chipClass(category: BlogCategory | null): string {
    return category ? BLOG_CATEGORY_META[category].chip : BLOG_NEUTRAL_CHIP;
  }

  /** Título, meta description e JSON-LD do post. Devolve o desfazer (troca de post ou saída). */
  private applyHead(v: PostView): () => void {
    const h = this.header(v);
    const slug = v.post.slug;

    this.titleService.setTitle(`${h.title} · nexaGO`);
    if (h.description) this.meta.updateTag({ name: 'description', content: h.description });

    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.text = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: h.title,
      description: h.description || undefined,
      datePublished: h.date ? h.date.toISOString() : undefined,
      image: h.coverUrl ?? undefined,
      url: `${BASE}/blog/${slug}`,
      author:
        h.authorName && h.authorName !== STATIC_POST_AUTHOR
          ? { '@type': 'Person', name: h.authorName }
          : { '@type': 'Organization', name: 'nexaGO' },
      publisher: { '@type': 'Organization', name: 'nexaGO' },
    });
    document.head.appendChild(script);

    return () => {
      script.remove();
      this.meta.updateTag({ name: 'description', content: this.defaultDescription });
    };
  }
}
