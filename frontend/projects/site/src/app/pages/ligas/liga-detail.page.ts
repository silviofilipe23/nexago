import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { RevealDirective } from '../../shared/reveal.directive';
import { ButtonDirective } from '../../shared/ui/button.directive';
import { DownloadSection } from '../home/sections/download';
import { LeagueHero } from './league-hero';
import { getLeagueById } from '../../../lib/firestore/leagues';
import { formatDate } from '../../../lib/format';
import { extractId, toSlugId } from '../../../lib/slug';
import type { LeagueStage, LeagueSummary } from '../../../lib/firestore/types';

const BASE = 'https://nexago.com.br';

/**
 * Porta de `LigaDetailPage` (site Next.js, `app/ligas/[slug]/page.tsx`). O segmento `:slug`
 * aceita "slug-id" (ex.: `liga-nexago-2026-aBc123`) OU o id puro (link antigo) — igual ao padrão
 * de torneios/arenas: o id real é extraído do final via `extractId`, e `getLeagueById(id)`
 * resolve o perfil (retorna `null` se não existir ou for rascunho).
 *
 * Diferente da fonte (SSR + `notFound()`/`permanentRedirect`), aqui é CSR: o fetch roda dentro
 * de um `effect()` reagindo a `slug()` — necessário porque, com `withComponentInputBinding()`,
 * o Router reaproveita a MESMA instância do componente ao navegar entre duas ligas diferentes
 * (`/ligas/:slug` → `/ligas/:slug`), sem re-executar o `constructor`. O redirecionamento pra URL
 * canônica usa `Router.navigate(..., { replaceUrl: true })` no lugar do `permanentRedirect`.
 */
@Component({
  selector: 'app-liga-detail-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RevealDirective, ButtonDirective, RouterLink, LeagueHero, DownloadSection],
  host: { class: 'block pb-24' },
  template: `
    @if (loading()) {
      <div class="mx-auto max-w-4xl px-5 pt-28 sm:px-6 sm:pt-32">
        <div class="h-[26rem] animate-pulse rounded-5 bg-surface-1"></div>
      </div>
    } @else if (league(); as l) {
      <app-league-hero [league]="l" />

      <div class="mx-auto max-w-4xl px-5 sm:px-6">
        @if (l.description) {
          <div nxReveal>
            <p class="mt-10 max-w-2xl whitespace-pre-line text-base leading-relaxed text-text-mute">
              {{ l.description }}
            </p>
          </div>
        }

        <div nxReveal [nxRevealDelay]="50">
          <div class="mt-9 flex flex-col gap-3 sm:flex-row">
            <a nxButton="primary" routerLink="/torneios">
              Garantir minha vaga
              <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
              </svg>
            </a>
            <a nxButton="secondary" routerLink="/torneios">Ver torneios</a>
          </div>
        </div>

        <!-- Calendário de etapas -->
        <section id="calendario" class="mt-14 scroll-mt-24">
          <div nxReveal>
            <h2 class="font-display text-xl font-700 tracking-tight text-fg">Etapas da temporada</h2>
          </div>

          @if (l.stages.length > 0) {
            <ol class="mt-6 space-y-4">
              @for (s of l.stages; track $index; let i = $index) {
                <li>
                  <div nxReveal [nxRevealDelay]="i * 50" class="flex items-center gap-5 rounded-4 border border-line bg-surface-1 p-6">
                    <span class="inline-flex size-11 shrink-0 items-center justify-center rounded-3 border border-brand/20 bg-brand-tint font-display text-lg font-800 text-brand">
                      {{ i + 1 }}
                    </span>
                    <div class="min-w-0">
                      <h3 class="font-display text-lg font-700 tracking-tight text-fg">{{ stageLabel(s, i) }}</h3>
                      <p class="mt-0.5 text-sm text-text-mute">
                        {{ s.dateLabel || formatDate(s.startAt) || 'Data a definir' }}
                      </p>
                    </div>
                  </div>
                </li>
              }
            </ol>
          } @else {
            <div nxReveal>
              <div class="mt-6 rounded-5 border border-line bg-surface-1 p-10 text-center">
                <p class="font-display text-lg font-700 text-fg">Calendário em breve</p>
                <p class="mx-auto mt-2 max-w-sm text-sm text-text-mute">
                  As etapas da temporada serão divulgadas aqui. Baixe o app para ser avisado da abertura das
                  inscrições.
                </p>
              </div>
            </div>
          }
        </section>
      </div>

      <div class="mt-16">
        <app-download-section />
      </div>
    } @else {
      <div class="mx-auto max-w-2xl px-5 pt-32 text-center sm:px-6">
        <p class="font-display text-2xl font-700 text-fg">Liga não encontrada</p>
        <p class="mx-auto mt-3 max-w-md text-sm text-text-mute">
          Essa liga não existe ou não está mais disponível publicamente.
        </p>
        <a nxButton="secondary" routerLink="/ligas" class="mt-7 inline-flex">Voltar para ligas</a>
      </div>
    }
  `,
})
export class LigaDetailPage {
  readonly slug = input.required<string>();

  protected readonly league = signal<LeagueSummary | null>(null);
  protected readonly loading = signal(true);
  protected readonly formatDate = formatDate;

  private readonly router = inject(Router);

  constructor() {
    const title = inject(Title);
    const destroyRef = inject(DestroyRef);

    effect(() => {
      const slug = this.slug();
      this.loading.set(true);

      getLeagueById(extractId(slug)).then((league) => {
        if (this.slug() !== slug) return; // resposta de uma navegação anterior, já obsoleta

        this.league.set(league);
        this.loading.set(false);

        if (!league) {
          title.setTitle('Liga não encontrada · nexaGO');
          return;
        }

        const canonical = toSlugId(league.name, league.id);
        if (slug !== canonical) {
          this.router.navigate(['/ligas', canonical], { replaceUrl: true });
          return;
        }

        title.setTitle(league.name);

        const script = document.createElement('script');
        script.type = 'application/ld+json';
        script.text = JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'SportsOrganization',
          name: league.name,
          description: league.description ?? undefined,
          url: `${BASE}/ligas/${canonical}`,
        });
        document.head.appendChild(script);
        destroyRef.onDestroy(() => script.remove());
      });
    });
  }

  protected stageLabel(stage: LeagueStage, i: number): string {
    return stage.name ?? `Etapa ${i + 1}`;
  }
}
