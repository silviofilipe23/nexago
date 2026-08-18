import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { Title } from '@angular/platform-browser';
import { matchSetWins } from '../painel/data/live-set-display';
import { resolveCourtNames } from '../painel/data/matches-repository';
import { spDayLabel, spTimeLabel } from '../painel/data/schedule-format';
import { PublicCourtCardComponent } from './public-court-card.component';
import {
  applyTeamLabels,
  categoryNameOf,
  publicCourtRows,
  publicUpcomingRows,
  recentResults,
} from './public-selectors';
import { PublicTournamentStore } from './public-tournament.store';

const STATUS_LABEL: Record<string, string> = {
  inscricoes: 'Inscrições abertas',
  andamento: 'Acontecendo agora',
  concluido: 'Torneio encerrado',
  cancelado: 'Torneio cancelado',
};

/** `/t/:tournamentId` — página pública de acompanhamento. Sem login: só lê as coleções
 *  abertas pelas rules. Nada de financeiro entra aqui (o doc do torneio traz `collected` e
 *  `paymentMode`, que ficam de fora de propósito). */
@Component({
  selector: 'pub-tournament-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [PublicTournamentStore],
  imports: [PublicCourtCardComponent],
  template: `
    <main class="pub-page">
      @if (store.notFound()) {
        <section class="pub-empty">
          <h1>Torneio não encontrado</h1>
          <p>Confira o link com quem organiza o evento.</p>
        </section>
      } @else if (store.tournament(); as t) {
        <header class="pub-head">
          <span class="pub-status">{{ statusLabel() }}</span>
          <h1 class="pub-title">{{ t.name }}</h1>
          <p class="pub-sub">{{ subtitle() }}</p>
        </header>

        <section class="pub-section">
          <h2 class="pub-h2">Agora nas quadras</h2>
          <div class="pub-courts">
            @for (row of courtRows(); track row.id) {
              <pub-court-card
                [courtName]="row.name"
                [kind]="row.kind"
                [match]="row.match"
                [categoryLabel]="row.categoryLabel"
              />
            } @empty {
              <p class="pub-note">Nenhuma quadra cadastrada neste torneio.</p>
            }
          </div>
        </section>

        @if (upcoming().length > 0) {
          <section class="pub-section">
            <h2 class="pub-h2">Próximos jogos</h2>
            <ul class="pub-list">
              @for (row of upcoming(); track row.id) {
                <li class="pub-row">
                  <span class="pub-row-when">
                    <strong>{{ row.time }}</strong>
                    <span>{{ row.court }}</span>
                  </span>
                  <span class="pub-row-body">
                    <span class="pub-row-teams">{{ row.teams }}</span>
                    <span class="pub-row-meta">{{ row.meta }}</span>
                  </span>
                </li>
              }
            </ul>
          </section>
        }

        @if (results().length > 0) {
          <section class="pub-section">
            <h2 class="pub-h2">Resultados</h2>
            <ul class="pub-list">
              @for (row of results(); track row.id) {
                <li class="pub-row">
                  <span class="pub-row-body">
                    <span class="pub-row-teams">{{ row.teams }}</span>
                    <span class="pub-row-meta">{{ row.meta }}</span>
                  </span>
                  <span class="pub-row-score">{{ row.score }}</span>
                </li>
              }
            </ul>
          </section>
        }

        @if (matchCount() === 0) {
          <p class="pub-note">Os jogos aparecem aqui assim que a organização começar a lançar.</p>
        }

        <footer class="pub-foot">
          <span class="pub-foot-live" [class.off]="store.error()">
            {{ store.error() ? 'Reconectando…' : 'Atualizado em tempo real' }}
          </span>
          <span class="pub-foot-brand">nexaGO</span>
        </footer>
      } @else if (store.error()) {
        <section class="pub-empty">
          <h1>Não foi possível carregar agora</h1>
          <p>Confira sua conexão — a página se atualiza sozinha quando voltar.</p>
        </section>
      } @else {
        <p class="pub-note">Carregando torneio…</p>
      }
    </main>
  `,
  styles: `
    :host {
      display: block;
      min-height: 100dvh;
      background: var(--nx-bg);
      color: var(--nx-text);
    }
    .pub-page {
      width: min(760px, 100%);
      margin: 0 auto;
      padding: 20px 16px 40px;
      display: flex;
      flex-direction: column;
      gap: 24px;
    }
    .pub-head {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .pub-status {
      align-self: flex-start;
      padding: 4px 10px;
      border-radius: var(--nx-r-pill);
      background: var(--nx-orange-tint);
      color: var(--nx-orange-400);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    .pub-title {
      margin: 0;
      font-family: var(--nx-font-display);
      font-size: 26px;
      line-height: 1.15;
    }
    .pub-sub,
    .pub-note {
      margin: 0;
      color: var(--nx-text-dim);
      font-size: 13px;
    }
    .pub-section {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .pub-h2 {
      margin: 0;
      font-family: var(--nx-font-display);
      font-size: 15px;
      letter-spacing: 0.02em;
    }
    .pub-courts {
      display: grid;
      gap: 10px;
      grid-template-columns: 1fr;
    }
    @media (min-width: 640px) {
      .pub-courts {
        grid-template-columns: 1fr 1fr;
      }
    }
    .pub-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .pub-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 10px 12px;
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-0);
    }
    .pub-row-when {
      display: flex;
      flex-direction: column;
      min-width: 74px;
      font-size: 12px;
      color: var(--nx-text-dim);
    }
    .pub-row-when strong {
      font-family: var(--nx-font-mono);
      font-size: 15px;
      color: var(--nx-text);
    }
    .pub-row-body {
      display: flex;
      flex-direction: column;
      flex: 1;
      gap: 2px;
      min-width: 0;
    }
    .pub-row-teams {
      font-size: 14px;
      font-weight: 600;
      overflow-wrap: anywhere;
    }
    .pub-row-meta {
      font-size: 12px;
      color: var(--nx-text-dim);
    }
    .pub-row-score {
      font-family: var(--nx-font-mono);
      font-size: 15px;
      white-space: nowrap;
    }
    .pub-empty {
      padding: 48px 0;
      text-align: center;
    }
    .pub-foot {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-top: 12px;
      border-top: 1px solid var(--nx-line);
      font-size: 12px;
      color: var(--nx-text-dim);
    }
    .pub-foot-live.off {
      color: var(--nx-live);
    }
    .pub-foot-brand {
      font-family: var(--nx-font-display);
      font-weight: 700;
      color: var(--nx-orange-500);
    }
  `,
})
export class PublicTournamentPageComponent {
  /** Preenchido pelo router (`withComponentInputBinding`). */
  readonly tournamentId = input.required<string>();

  protected readonly store = inject(PublicTournamentStore);
  private readonly title = inject(Title);

  /** Relógio de baixa frequência: decide o que é "agora" na quadra e o que entra na fila. */
  private readonly now = signal(Date.now());

  private readonly matchesWithCourtNames = computed(() =>
    applyTeamLabels(
      resolveCourtNames(this.store.matches(), this.store.tournament()?.courts ?? []),
      this.store.teamLabels(),
    ),
  );

  protected readonly matchCount = computed(() => this.store.matches().length);

  protected readonly statusLabel = computed(
    () => STATUS_LABEL[this.store.tournament()?.status ?? ''] ?? 'Torneio',
  );

  protected readonly subtitle = computed(() => {
    const t = this.store.tournament();
    if (!t) return '';
    const parts = [t.location, t.city].filter((p): p is string => !!p && p.length > 0);
    if (t.startAt) parts.push(`${spDayLabel(t.startAt)} · ${spTimeLabel(t.startAt)}`);
    return parts.join(' · ');
  });

  protected readonly courtRows = computed(() => {
    const t = this.store.tournament();
    if (!t) return [];
    return publicCourtRows(this.matchesWithCourtNames(), t.courts, t.categories, this.now());
  });

  protected readonly upcoming = computed(() => {
    const t = this.store.tournament();
    if (!t) return [];
    return publicUpcomingRows(this.matchesWithCourtNames(), t.courts, t.categories, this.now());
  });

  protected readonly results = computed(() => {
    const t = this.store.tournament();
    if (!t) return [];
    return recentResults(this.matchesWithCourtNames()).map((m) => {
      const [a, b] = matchSetWins(m);
      return {
        id: m.id,
        teams: `${m.team1Label} vs ${m.team2Label}`,
        meta: [categoryNameOf(t.categories, m.categoryId), m.round ?? '']
          .filter((part) => part.length > 0)
          .join(' · '),
        score: m.score ?? `${a} × ${b}`,
      };
    });
  });

  constructor() {
    effect(() => this.store.tournamentId.set(this.tournamentId()));

    // Só o NOME entra no título — nada de status, que mudaria o título a cada snapshot.
    effect(() => {
      const name = this.store.tournament()?.name;
      this.title.setTitle(name ? `${name} — ao vivo · NexaGO` : 'Acompanhe ao vivo — NexaGO');
    });

    const clock = setInterval(() => this.now.set(Date.now()), 15_000);
    inject(DestroyRef).onDestroy(() => clearInterval(clock));
  }
}
