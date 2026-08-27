import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { TournamentHero } from './tournament-hero';
import { RevealDirective } from '../../shared/reveal.directive';
import { ButtonDirective } from '../../shared/ui/button.directive';
import { SpotlightCard } from '../../shared/ui/spotlight-card';
import { FollowButtonComponent } from './follow-button';
import { liveUrlFor } from '../../../lib/tournament-live-link';
import { getTournamentById } from '../../../lib/firestore/tournaments';
import { sportLabel, genderLabel, formatCents } from '../../../lib/format';
import { extractId, toSlugId } from '../../../lib/slug';
import type { TournamentDetail, TournamentListingStatus } from '../../../lib/firestore/types';

/** O bloco de ação no pé da página fala a verdade do status — nada de "Inscreva-se" em torneio
 *  cancelado ou que já aconteceu. */
const CTA_COPY: Record<TournamentListingStatus, { title: string; description: string }> = {
  open: {
    title: 'Quer jogar essa etapa?',
    description: 'Inscreva-se pelo site ou pelo app e acompanhe ao vivo.',
  },
  almost_full: {
    title: 'Últimas vagas nessa etapa',
    description: 'As vagas estão acabando — garanta a sua pelo site ou pelo app.',
  },
  closed: {
    title: 'Inscrições encerradas',
    description: 'As chaves já estão fechadas. Acompanhe os jogos ao vivo pelo app.',
  },
  live: {
    title: 'Acontecendo agora',
    description: 'Acompanhe as chaves e os resultados ao vivo pelo app.',
  },
  ended: {
    title: 'Esse torneio já aconteceu',
    description: 'Veja as etapas com inscrições abertas e não perca a próxima.',
  },
  cancelled: {
    title: 'Esse torneio foi cancelado',
    description: 'O organizador cancelou essa etapa. Veja outros torneios abertos na areia.',
  },
};

/**
 * Porta de `TorneioDetailPage` (site Next.js) — página do torneio individual. Diferente do
 * source (Server Component com `generateStaticParams`/`generateMetadata`/redirect canônico
 * server-side), este app é CSR-only: busca `getTournamentById` no `constructor` a partir do
 * `id` de rota (já vinculado via `withComponentInputBinding`), sem redirect de slug — a URL
 * "slug-id" e a URL "id puro" simplesmente renderizam o mesmo conteúdo (`extractId` aceita
 * as duas). Não encontrado / rascunho / não público cai num estado de erro simples, sem
 * 404 em nível de rota (não há SSR pra emitir status HTTP mesmo). O JSON-LD `SportsEvent`
 * do source vira um `<script>` montado imperativamente (mesmo padrão de `torneios.page.ts`).
 */
@Component({
  selector: 'app-torneio-detail-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    TournamentHero,
    RevealDirective,
    ButtonDirective,
    SpotlightCard,
    FollowButtonComponent,
  ],
  template: `
    <main class="pb-24">
      @if (loading()) {
        <div class="h-[clamp(26rem,62vh,36rem)] animate-pulse bg-surface-1"></div>
      } @else if (tournament(); as t) {
        <app-tournament-hero [t]="t" />

        <div class="mx-auto max-w-4xl px-5 sm:px-6">
          <div nxReveal class="flex justify-end pt-8">
            <app-follow-button [id]="t.id" />
          </div>

          @if (t.description; as description) {
            <div nxReveal>
              <p
                class="mt-10 max-w-2xl whitespace-pre-line text-base leading-relaxed text-text-mute"
              >
                {{ description }}
              </p>
            </div>
          }

          @if (t.categories.length > 0) {
            <section class="mt-12">
              <div nxReveal>
                <h2 class="font-display text-xl font-700 tracking-tight text-fg">Categorias</h2>
              </div>
              <ul class="mt-5 grid gap-3 sm:grid-cols-2">
                @for (c of t.categories; track $index) {
                  <li class="h-full">
                    <div nxReveal [nxRevealDelay]="$index * 50" class="h-full">
                      <app-spotlight-card
                        [className]="'flex h-full items-center justify-between gap-4 px-5 py-4'"
                      >
                        <div>
                          <p class="font-600 text-fg">
                            {{
                              c.categoryName ??
                                (c.level ?? 'Categoria') + ' · ' + genderLabel(c.genderType)
                            }}
                          </p>
                          @if (c.spotsTotal !== undefined) {
                            <p class="mt-0.5 text-sm text-text-dim">{{ c.spotsTotal }} vagas</p>
                          }
                        </div>
                        @if (c.entryFeeCents !== undefined) {
                          <span class="shrink-0 font-mono font-700 text-brand">{{
                            formatCents(c.entryFeeCents)
                          }}</span>
                        }
                      </app-spotlight-card>
                    </div>
                  </li>
                }
              </ul>
            </section>
          }

          <div nxReveal>
            <section
              class="mt-14 flex flex-col items-start gap-4 rounded-5 border bg-surface-1 p-7 sm:flex-row sm:items-center sm:justify-between"
              [class]="acceptsRegistration(t.listingStatus) ? 'border-brand/20' : 'border-line'"
            >
              <div class="flex items-center gap-3">
                <svg
                  class="size-6"
                  [class]="acceptsRegistration(t.listingStatus) ? 'text-brand' : 'text-text-dim'"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
                  <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
                  <path d="M4 22h16" />
                  <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
                  <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
                  <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
                </svg>
                <div>
                  <p class="font-display font-700 text-fg">{{ ctaFor(t.listingStatus).title }}</p>
                  <p class="text-sm text-text-mute">{{ ctaFor(t.listingStatus).description }}</p>
                </div>
              </div>
              <div class="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
                @if (acceptsRegistration(t.listingStatus)) {
                  <a
                    nxButton="primary"
                    [href]="'https://atleta.nexago.com.br/torneios/' + t.id + '/inscricao'"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="w-full sm:w-auto"
                  >
                    Inscreva-se
                  </a>
                } @else if (liveUrlFor(t.listingStatus, t.id); as liveUrl) {
                  <a
                    nxButton="primary"
                    [href]="liveUrl"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="w-full sm:w-auto"
                  >
                    Acompanhar ao vivo
                  </a>
                } @else {
                  <a nxButton="primary" routerLink="/torneios" class="w-full sm:w-auto"
                    >Ver torneios abertos</a
                  >
                }
                <a
                  nxButton="secondary"
                  href="https://linktr.ee/nexago"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="w-full sm:w-auto"
                >
                  Baixar o app
                </a>
              </div>
            </section>
          </div>
        </div>
      } @else {
        <div class="mx-auto max-w-2xl px-5 pb-24 pt-32 text-center sm:px-6">
          <p class="font-display text-2xl font-700 text-fg">Torneio não encontrado</p>
          <p class="mx-auto mt-3 max-w-sm text-sm text-text-mute">
            Esse torneio não existe, foi removido ou ainda não está publicado.
          </p>
          <a nxButton="primary" routerLink="/torneios" class="mt-7 inline-flex"
            >Ver todos os torneios</a
          >
        </div>
      }
    </main>
  `,
})
export class TorneioDetailPage {
  readonly id = input.required<string>();

  protected readonly tournament = signal<TournamentDetail | null>(null);
  protected readonly loading = signal(true);

  protected readonly sportLabel = sportLabel;
  protected readonly genderLabel = genderLabel;
  protected readonly formatCents = formatCents;
  protected readonly liveUrlFor = liveUrlFor;

  protected acceptsRegistration(status: TournamentListingStatus): boolean {
    return status === 'open' || status === 'almost_full';
  }

  protected ctaFor(status: TournamentListingStatus): { title: string; description: string } {
    return CTA_COPY[status];
  }

  private readonly titleService = inject(Title);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    effect((onCleanup) => {
      const id = this.id();
      this.loading.set(true);
      this.tournament.set(null);

      let cancelled = false;
      onCleanup(() => {
        cancelled = true;
      });

      getTournamentById(extractId(id)).then((t) => {
        if (cancelled) return;
        this.tournament.set(t);
        this.loading.set(false);

        if (t) {
          this.titleService.setTitle(`${t.name} · nexaGO`);
          this.appendJsonLd(t);
        } else {
          this.titleService.setTitle('Torneio não encontrado · nexaGO');
        }
      });
    });
  }

  private appendJsonLd(t: TournamentDetail): void {
    const slug = toSlugId(t.name, t.id);
    const place = [t.locationName, t.city, t.state].filter(Boolean).join(', ');
    // O Google lê isto: torneio cancelado precisa sair como cancelado, não como agendado.
    const eventStatus =
      t.listingStatus === 'cancelled'
        ? 'https://schema.org/EventCancelled'
        : 'https://schema.org/EventScheduled';

    const jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'SportsEvent',
      name: t.name,
      description: t.description ?? undefined,
      sport: sportLabel(t.sport),
      startDate: t.startAt?.toISOString(),
      endDate: t.endAt?.toISOString(),
      eventStatus,
      url: `https://nexago.com.br/torneios/${slug}`,
      location: place
        ? {
            '@type': 'Place',
            name: t.locationName ?? t.city ?? place,
            address: [t.locationAddress, t.city, t.state].filter(Boolean).join(', ') || place,
          }
        : undefined,
      organizer: { '@type': 'Organization', name: 'nexaGO', url: 'https://nexago.com.br' },
    };

    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.text = JSON.stringify(jsonLd);
    document.head.appendChild(script);
    this.destroyRef.onDestroy(() => script.remove());
  }
}
