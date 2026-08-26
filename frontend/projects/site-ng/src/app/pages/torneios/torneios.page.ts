import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { TournamentBrowser } from './tournament-browser';
import { getPublicTournaments } from '../../../lib/firestore/tournaments';
import { toSlugId } from '../../../lib/slug';
import type { TournamentSummary } from '../../../lib/firestore/types';

/**
 * Porta de `TorneiosPage` (site Next.js) — listagem pública de torneios. Diferente do source
 * (Server Component com ISR `revalidate = 300`), este app é CSR-only: busca `getPublicTournaments`
 * no `constructor`, sempre no navegador do visitante — mesmo padrão de `TorneiosDestaqueSection`
 * (home). O JSON-LD `ItemList` do source vira um `<script>` montado imperativamente e anexado a
 * `document.head` (Angular não permite `<script>` estático no template), removido no destroy.
 */
@Component({
  selector: 'app-torneios-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TournamentBrowser],
  template: `
    <main class="mx-auto max-w-6xl px-5 pb-24 pt-28 sm:px-6 sm:pt-32">
      <header class="max-w-2xl">
        <p class="mb-3 font-mono text-sm font-600 uppercase tracking-[0.2em] text-brand">Hub público</p>
        <h1 class="font-display text-[clamp(2rem,6vw,3.5rem)] font-800 leading-tight tracking-tight text-fg">
          Torneios na areia
        </h1>
        <p class="mt-4 text-balance text-base text-text-mute sm:text-lg">
          Etapas de beach tennis e vôlei de praia abertas para inscrição. Acompanhe chaves,
          resultados e ranking em tempo real.
        </p>
      </header>

      @if (loading()) {
        <div class="mt-12 rounded-4 border border-line bg-surface-1 p-4 sm:p-5">
          <div class="h-11 w-full animate-pulse rounded-pill bg-surface-2"></div>
        </div>
        <ul class="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          @for (i of skeletonSlots; track i) {
            <li class="h-[360px] animate-pulse rounded-5 bg-surface-1"></li>
          }
        </ul>
      } @else if (tournaments().length === 0) {
        <div class="mt-16 rounded-5 border border-line bg-surface-1 p-12 text-center">
          <p class="font-display text-lg font-700 text-fg">Nenhum torneio público no momento</p>
          <p class="mx-auto mt-2 max-w-sm text-sm text-text-mute">
            Assim que novas etapas forem publicadas, elas aparecem aqui. Baixe o app para ser
            avisado.
          </p>
        </div>
      } @else {
        <app-tournament-browser [tournaments]="tournaments()" />
      }
    </main>
  `,
})
export class TorneiosPage {
  protected readonly tournaments = signal<TournamentSummary[]>([]);
  protected readonly loading = signal(true);
  protected readonly skeletonSlots = [0, 1, 2, 3, 4, 5];

  private readonly itemListJsonLd = computed(() => ({
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Torneios nexaGO',
    itemListElement: this.tournaments().map((t, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `https://nexago.com.br/torneios/${toSlugId(t.name, t.id)}`,
      name: t.name,
    })),
  }));

  constructor() {
    inject(Title).setTitle('Torneios de beach tennis e vôlei de praia · nexaGO');
    const destroyRef = inject(DestroyRef);

    getPublicTournaments().then((tournaments) => {
      this.tournaments.set(tournaments);
      this.loading.set(false);

      if (tournaments.length > 0) {
        const script = document.createElement('script');
        script.type = 'application/ld+json';
        script.text = JSON.stringify(this.itemListJsonLd());
        document.head.appendChild(script);
        destroyRef.onDestroy(() => script.remove());
      }
    });
  }
}
