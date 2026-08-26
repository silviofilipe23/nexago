import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { ArenaHero } from './arena-hero';
import { RevealDirective } from '../../shared/reveal.directive';
import { ButtonDirective } from '../../shared/ui/button.directive';
import { getArenaById } from '../../../lib/firestore/arenas';
import { sportLabel } from '../../../lib/format';
import { extractId, toSlugId } from '../../../lib/slug';
import type { ArenaDetail } from '../../../lib/firestore/types';

/**
 * Porta de `app/arena/[id]/page.tsx` (site Next.js) — perfil público de uma arena. Diferente do
 * source (Server Component com `generateStaticParams`/`generateMetadata`/redirect canônico
 * server-side), este app é CSR-only: busca `getArenaById` no `constructor` a partir do `id` de
 * rota (já vinculado via `withComponentInputBinding`), sem redirect de slug — a URL "slug-id" e
 * a URL "id puro" simplesmente renderizam o mesmo conteúdo (`extractId` aceita as duas). Não
 * encontrada cai num estado de erro simples, sem 404 em nível de rota (não há SSR pra emitir
 * status HTTP mesmo). O JSON-LD `SportsActivityLocation` do source vira um `<script>` montado
 * imperativamente (mesmo padrão de `torneio-detail.page.ts`).
 */
@Component({
  selector: 'app-arena-detail-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, ArenaHero, RevealDirective, ButtonDirective],
  template: `
    <main class="pb-24">
      @if (loading()) {
        <div class="h-[clamp(26rem,62vh,36rem)] animate-pulse bg-surface-1"></div>
      } @else if (arena(); as a) {
        <app-arena-hero [arena]="a" />

        <div class="mx-auto max-w-5xl px-5 sm:px-6">
          <!-- Galeria -->
          @if (galleryPhotos().length > 0) {
            <div nxReveal>
              <div class="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                @for (url of galleryPhotos(); track url; let i = $index) {
                  <div class="relative aspect-[4/3] overflow-hidden rounded-4 border border-line bg-surface-1">
                    <img [src]="url" [alt]="a.name + ' — foto ' + (i + 2)" loading="lazy" class="size-full object-cover" />
                  </div>
                }
              </div>
            </div>
          }

          <!-- Sobre -->
          @if (a.description; as description) {
            <div nxReveal>
              <section class="mt-12">
                <h2 class="font-display text-xl font-700 tracking-tight text-fg">Sobre a arena</h2>
                <p class="mt-3 max-w-2xl text-balance text-base leading-relaxed text-text-mute">
                  {{ description }}
                </p>
              </section>
            </div>
          }

          <!-- Comodidades -->
          @if (a.amenities.length > 0) {
            <div nxReveal>
              <section class="mt-12">
                <h2 class="font-display text-xl font-700 tracking-tight text-fg">Comodidades</h2>
                <ul class="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  @for (amenity of a.amenities; track amenity) {
                    <li class="flex items-center gap-2.5 text-sm text-fg">
                      <span class="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-tint text-brand">
                        <svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                      </span>
                      {{ amenity }}
                    </li>
                  }
                </ul>
              </section>
            </div>
          }

          <!-- Quadras -->
          @if (a.courts.length > 0) {
            <div nxReveal>
              <section class="mt-12">
                <h2 class="font-display text-xl font-700 tracking-tight text-fg">Quadras</h2>
                <div class="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  @for (c of a.courts; track c.id; let i = $index) {
                    <div class="rounded-4 border border-line bg-surface-1 p-5">
                      <p class="font-display text-base font-700 tracking-tight text-fg">
                        {{ c.name ?? 'Quadra ' + (i + 1) }}
                      </p>
                      <p class="mt-1 text-sm text-text-mute">
                        {{ courtLabel(c) }}
                      </p>
                    </div>
                  }
                </div>
              </section>
            </div>
          }

          <!-- CTA -->
          <div nxReveal>
            <div class="mt-16 rounded-5 border border-brand/20 bg-surface-1 p-8 text-center">
              <h2 class="font-display text-xl font-700 tracking-tight text-fg">Jogue nesta arena</h2>
              <p class="mx-auto mt-2 max-w-md text-sm text-text-mute">
                Baixe o nexaGO para encontrar torneios e etapas nesta e em outras arenas da areia.
              </p>
              <div class="mt-6 flex justify-center">
                <a nxButton="primary" href="https://linktr.ee/nexago" target="_blank" rel="noopener noreferrer">Baixar o app</a>
              </div>
            </div>
          </div>
        </div>
      } @else {
        <div class="mx-auto max-w-2xl px-5 pb-24 pt-32 text-center sm:px-6">
          <p class="font-display text-2xl font-700 text-fg">Arena não encontrada</p>
          <p class="mx-auto mt-3 max-w-sm text-sm text-text-mute">
            Essa arena não existe, foi removida ou ainda não está publicada.
          </p>
          <a nxButton="primary" routerLink="/arenas" class="mt-7 inline-flex">Ver arenas parceiras</a>
        </div>
      }
    </main>
  `,
})
export class ArenaDetailPage {
  readonly id = input.required<string>();

  protected readonly arena = signal<ArenaDetail | null>(null);
  protected readonly loading = signal(true);

  protected readonly galleryPhotos = computed(() => this.arena()?.photoUrls.slice(1, 7) ?? []);

  private readonly titleService = inject(Title);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    effect((onCleanup) => {
      const id = this.id();
      this.loading.set(true);
      this.arena.set(null);

      let cancelled = false;
      onCleanup(() => {
        cancelled = true;
      });

      getArenaById(extractId(id)).then((a) => {
        if (cancelled) return;
        this.arena.set(a);
        this.loading.set(false);

        if (a) {
          this.titleService.setTitle(`${a.name} · nexaGO`);
          this.appendJsonLd(a);
        } else {
          this.titleService.setTitle('Arena não encontrada · nexaGO');
        }
      });
    });
  }

  /** `sport · surface`, com "Areia" como fallback quando nenhum dos dois vem preenchido. */
  protected courtLabel(c: ArenaDetail['courts'][number]): string {
    return [c.sport && sportLabel(c.sport), c.surface].filter(Boolean).join(' · ') || 'Areia';
  }

  private appendJsonLd(a: ArenaDetail): void {
    const slug = toSlugId(a.name, a.id);
    const place = [a.city, a.state].filter(Boolean).join(', ');

    const jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'SportsActivityLocation',
      name: a.name,
      url: `https://nexago.com.br/arena/${slug}`,
      ...(place && { address: place }),
      ...(a.photoUrls[0] && { image: a.photoUrls[0] }),
    };

    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.text = JSON.stringify(jsonLd);
    document.head.appendChild(script);
    this.destroyRef.onDestroy(() => script.remove());
  }
}
