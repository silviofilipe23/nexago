import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { RevealDirective } from '../../shared/reveal.directive';
import { ButtonDirective } from '../../shared/ui/button.directive';
import { getPostBySlug } from '../../../lib/blog/posts';
import { formatDate } from '../../../lib/format';

const BASE = 'https://nexago.com.br';

/**
 * Porta de `BlogPostPage` (site Next.js, `app/blog/[slug]/page.tsx`) — post individual.
 * `slug` chega via `withComponentInputBinding()` (rota `blog/:slug`). Dados são síncronos e
 * locais (`getPostBySlug`, sem CMS/Firestore), então o post é um `computed()` direto do slug —
 * sem loading. O `effect()` cuida de título + JSON-LD reagindo a mudanças de `slug()`, porque
 * o Router reaproveita a mesma instância do componente ao navegar entre dois posts (mesmo
 * padrão de `liga-detail.page.ts`/`torneio-detail.page.ts`).
 *
 * `Body: ComponentType` do source virou `bodyHtml: string` em `lib/blog/posts.ts` — sem
 * equivalente Angular para um componente guardado como campo de dado. Renderizado aqui via
 * `[innerHTML]`, seguro porque o conteúdo é autoral/hardcoded, não input de usuário. O
 * `prose` (classes utilitárias `[&_h2]:...` etc. no source) virou `.prose-content` em
 * `blog-post.page.scss`, usando os mesmos tokens de `styles/tokens.scss`.
 */
@Component({
  selector: 'app-blog-post-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RevealDirective, ButtonDirective],
  styleUrl: './blog-post.page.scss',
  template: `
    <main class="mx-auto max-w-3xl px-5 pb-24 pt-28 sm:px-6 sm:pt-32">
      @if (post(); as p) {
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

          <div class="mt-8 flex flex-wrap items-center gap-3">
            @for (t of p.tags ?? []; track t) {
              <span class="font-mono text-xs font-600 uppercase tracking-wider text-brand">{{ t }}</span>
            }
            <time [attr.datetime]="p.date" class="text-xs text-text-dim">{{ formattedDate(p.date) }}</time>
          </div>

          <h1 class="mt-4 font-display text-[clamp(2rem,5.5vw,3.25rem)] font-800 leading-tight tracking-tight text-fg">
            {{ p.title }}
          </h1>
        </div>

        <article class="prose-content mt-10" [innerHTML]="p.bodyHtml"></article>
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

  protected readonly post = computed(() => getPostBySlug(this.slug()));

  protected formattedDate(dateIso: string): string {
    return formatDate(new Date(dateIso));
  }

  constructor() {
    const titleService = inject(Title);

    effect((onCleanup) => {
      const p = this.post();

      if (!p) {
        titleService.setTitle('Post não encontrado · nexaGO');
        return;
      }

      titleService.setTitle(`${p.title} · nexaGO`);

      const script = document.createElement('script');
      script.type = 'application/ld+json';
      script.text = JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'BlogPosting',
        headline: p.title,
        description: p.excerpt,
        datePublished: p.date,
        url: `${BASE}/blog/${p.slug}`,
        author: { '@type': 'Organization', name: 'nexaGO' },
        publisher: { '@type': 'Organization', name: 'nexaGO' },
      });
      document.head.appendChild(script);
      onCleanup(() => script.remove());
    });
  }
}
