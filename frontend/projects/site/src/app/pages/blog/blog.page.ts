import { ChangeDetectionStrategy, Component, DestroyRef, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { RevealDirective } from '../../shared/reveal.directive';
import { SpotlightCard } from '../../shared/ui/spotlight-card';
import { getAllPosts } from '../../../lib/blog/posts';
import { formatDate } from '../../../lib/format';

const BASE = 'https://nexago.com.br';

/**
 * Porta de `BlogPage` (site Next.js, `app/blog/page.tsx`) — listagem do blog. Dados são
 * síncronos e locais (`getAllPosts()`, sem CMS/Firestore), então não há loading/skeleton, só
 * um campo de classe fixo. O JSON-LD (`ItemList`) é montado e anexado a `document.head` só se
 * houver posts, replicando o `{posts.length > 0 && <script>}` condicional da fonte — mesmo
 * padrão de `ligas.page.ts`/`torneios.page.ts`.
 */
@Component({
  selector: 'app-blog-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RevealDirective, SpotlightCard],
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

      @if (posts.length === 0) {
        <div class="mt-16 rounded-5 border border-line bg-surface-1 p-12 text-center">
          <p class="font-display text-lg font-700 text-fg">Nada por aqui ainda</p>
          <p class="mx-auto mt-2 max-w-sm text-sm text-text-mute">Os primeiros conteúdos chegam em breve.</p>
        </div>
      } @else {
        <ul class="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          @for (p of posts; track p.slug; let i = $index) {
            <li>
              <div nxReveal [nxRevealDelay]="i * 60" class="h-full">
                <app-spotlight-card className="h-full">
                  <a
                    [routerLink]="['/blog', p.slug]"
                    class="flex h-full flex-col p-7 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
                  >
                    @if (p.tags && p.tags.length > 0) {
                      <span class="font-mono text-xs font-600 uppercase tracking-wider text-text-dim">{{ p.tags[0] }}</span>
                    }
                    <h2 class="mt-2 font-display text-lg font-700 leading-snug tracking-tight text-fg transition-colors group-hover/spot:text-brand">
                      {{ p.title }}
                    </h2>
                    <p class="mt-2.5 flex-1 text-sm leading-relaxed text-text-mute">{{ p.excerpt }}</p>
                    <div class="mt-6 flex items-center justify-between border-t border-line pt-4">
                      <time [attr.datetime]="p.date" class="text-xs text-text-dim">{{ formattedDate(p.date) }}</time>
                      <svg
                        class="size-4 text-brand transition-transform duration-200 ease-out group-hover/spot:translate-x-0.5 motion-reduce:transition-none"
                        viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
                      </svg>
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
  protected readonly posts = getAllPosts();

  protected formattedDate(dateIso: string): string {
    return formatDate(new Date(dateIso));
  }

  constructor() {
    inject(Title).setTitle('Blog · nexaGO');

    if (this.posts.length === 0) return;

    const destroyRef = inject(DestroyRef);
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.text = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: 'Blog nexaGO',
      itemListElement: this.posts.map((p, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        url: `${BASE}/blog/${p.slug}`,
        name: p.title,
      })),
    });
    document.head.appendChild(script);
    destroyRef.onDestroy(() => script.remove());
  }
}
