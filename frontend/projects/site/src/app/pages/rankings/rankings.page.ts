import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { ButtonDirective } from '../../shared/ui/button.directive';

interface RankingHow {
  title: string;
  text: string;
}

const HOW: RankingHow[] = [
  { title: 'Pontos por torneio', text: 'Cada etapa distribui pontos conforme a colocação na sua categoria.' },
  { title: 'Por categoria', text: 'O ranking separa níveis e gêneros — você compete com quem está no seu nível.' },
  { title: 'Por temporada', text: 'A soma da temporada define sua posição e abre acesso às fases finais da Liga.' },
];

/**
 * Porta de `RankingsPage` (site Next.js) — conteúdo 100% estático. As coleções de ranking
 * (`athleteRankings`/`teamRankings`) estão vazias no Firestore até a 1ª etapa da Liga rodar,
 * então a fonte já trata isso como empty-state permanente por ora, não uma listagem real.
 */
@Component({
  selector: 'app-rankings-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonDirective],
  template: `
    <main class="mx-auto max-w-6xl px-5 pb-24 pt-28 sm:px-6 sm:pt-32">
      <header class="max-w-2xl">
        <p class="mb-3 font-mono text-sm font-600 uppercase tracking-[0.2em] text-brand">Hub público</p>
        <h1 class="font-display text-[clamp(2rem,6vw,3.5rem)] font-800 leading-tight tracking-tight text-fg">
          Ranking nexaGO
        </h1>
        <p class="mt-4 text-balance text-base text-text-mute sm:text-lg">
          A classificação dos atletas de beach tennis e vôlei de praia, atualizada a cada etapa da Liga nexaGO.
        </p>
      </header>

      <div class="mt-14 grid gap-5 md:grid-cols-3">
        @for (h of how; track h.title) {
          <div class="rounded-5 border border-line bg-surface-1 p-7">
            <div class="mb-5 inline-flex size-12 items-center justify-center rounded-3 border border-brand/20 bg-brand-tint text-brand">
              <svg class="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <circle cx="12" cy="8" r="6" />
                <path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11" />
              </svg>
            </div>
            <h2 class="font-display text-lg font-700 tracking-tight text-fg">{{ h.title }}</h2>
            <p class="mt-2 text-sm leading-relaxed text-text-mute">{{ h.text }}</p>
          </div>
        }
      </div>

      <section class="mt-12 rounded-5 border border-line bg-surface-1 p-12 text-center">
        <p class="font-display text-lg font-700 text-fg">O ranking abre com a 1ª etapa</p>
        <p class="mx-auto mt-2 max-w-md text-sm text-text-mute">
          A classificação ao vivo aparece aqui assim que a temporada começar. Baixe o app para competir e
          acompanhar sua posição.
        </p>
        <div class="mt-7 flex justify-center">
          <a nxButton="primary" href="https://linktr.ee/nexago" target="_blank" rel="noopener noreferrer">Baixar o app</a>
        </div>
      </section>
    </main>
  `,
})
export class RankingsPage {
  protected readonly how = HOW;

  constructor() {
    inject(Title).setTitle('Ranking de beach tennis e vôlei de praia · nexaGO');
  }
}
