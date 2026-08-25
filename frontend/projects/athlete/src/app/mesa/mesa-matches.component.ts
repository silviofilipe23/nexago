import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { athleteFirestore, athleteProjectId } from '../data/firestore';
import { watchMatchesForTournament, type TournamentMatch } from '../data/matches-repository';
import { fetchTournament, type TournamentSummary } from '../data/tournaments-repository';
import { AtPanelShellComponent } from '../painel/at-panel-shell.component';
import { NxPageLoadingComponent } from '../shared/loading/nx-page-loading.component';
import { EMPTY_TEAM_NAMES, fetchTeamNamesFor, teamLabelOf, type MesaTeamNames } from './mesa-team-names';
import { buildMesaRows, categoryFilterOptions, rowsOfSection, type MesaMatchRow } from './mesa-matches.selectors';

/** Partidas do torneio pro mesário — ao vivo, a seguir e encerradas, filtráveis por categoria.
 *  Assina o mesmo listener em tempo real das telas de torneio do atleta
 *  (`watchMatchesForTournament`), então o que outra mesa lança aparece aqui na hora. */
@Component({
  selector: 'app-mesa-matches',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, AtPanelShellComponent, NxPageLoadingComponent],
  template: `
    <app-at-panel-shell [userName]="accountLabel()">
      <div class="mm-body">
        <header class="mm-head">
          <a class="mm-back" routerLink="/mesa">‹ Meus torneios</a>
          <h1 class="mm-title">{{ tournamentName() }}</h1>
          <p class="mm-sub">Toque na partida para abrir a mesa e lançar o placar.</p>
        </header>

        @if (loading()) {
          <app-nx-page-loading title="Carregando as partidas…" subtitle="Conectando ao torneio" />
        } @else if (rows().length === 0) {
          <div class="mm-card mm-empty">
            <p class="mm-empty-title">Nenhuma partida gerada ainda.</p>
            <p class="mm-empty-sub">Assim que o organizador gerar as chaves, os jogos aparecem aqui.</p>
          </div>
        } @else {
          @if (categories().length > 1) {
            <div class="mm-chips" role="group" aria-label="Filtrar por categoria">
              <button type="button" class="mm-chip" [class.mm-chip--on]="category() === null" (click)="category.set(null)">Todas</button>
              @for (c of categories(); track c.id) {
                <button type="button" class="mm-chip" [class.mm-chip--on]="category() === c.id" (click)="category.set(c.id)">{{ c.label }}</button>
              }
            </div>
          }

          @for (section of sections; track section.key) {
            @if (rowsOf(section.key).length > 0) {
              <section class="mm-section">
                <h2 class="mm-section-title">
                  {{ section.title }}
                  <span class="mm-section-count">{{ rowsOf(section.key).length }}</span>
                </h2>
                <div class="mm-list">
                  @for (row of rowsOf(section.key); track row.id) {
                    <a class="mm-card mm-row" [routerLink]="['/mesa', tournamentId(), 'partida', row.id]" [class.mm-row--off]="!row.ready">
                      <span class="mm-row-main">
                        <span class="mm-teams">
                          <span class="mm-team">{{ row.teamALabel }}</span>
                          <span class="mm-vs">×</span>
                          <span class="mm-team">{{ row.teamBLabel }}</span>
                        </span>
                        <span class="mm-meta">
                          {{ row.categoryLabel }}@if (row.metaLabel) { · {{ row.metaLabel }} }
                          @if (!row.ready) { · aguardando as duas duplas }
                        </span>
                      </span>
                      @if (row.canceled) {
                        <span class="mm-pill mm-pill--dim">Cancelada</span>
                      } @else if (row.scoreLabel) {
                        <span class="mm-score" [class.mm-score--live]="row.section === 'live'">{{ row.scoreLabel }}</span>
                      } @else {
                        <span class="mm-pill">Abrir mesa</span>
                      }
                    </a>
                  }
                </div>
              </section>
            }
          }
        }
      </div>
    </app-at-panel-shell>
  `,
  styles: `
    .mm-body {
      padding: 24px 32px 40px;
      display: flex;
      flex-direction: column;
      gap: 18px;
    }
    .mm-back {
      display: inline-block;
      font-size: 12.5px;
      color: var(--nx-text-mute);
      text-decoration: none;
      margin-bottom: 8px;
    }
    .mm-back:hover {
      color: var(--nx-orange-500);
    }
    .mm-title {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 24px;
      letter-spacing: -0.02em;
      color: var(--nx-text);
      margin: 0 0 4px;
    }
    .mm-sub {
      font-size: 13.5px;
      color: var(--nx-text-mute);
      margin: 0;
    }
    .mm-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .mm-chip {
      height: 30px;
      padding: 0 14px;
      border-radius: var(--nx-r-pill);
      border: 1px solid var(--nx-line);
      background: var(--nx-surface-1);
      color: var(--nx-text-mute);
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 12.5px;
      cursor: pointer;
    }
    .mm-chip--on {
      border-color: var(--nx-orange-500);
      color: var(--nx-orange-500);
    }
    .mm-section {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .mm-section-title {
      display: flex;
      align-items: center;
      gap: 8px;
      font-family: var(--nx-font-mono);
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
      margin: 0;
    }
    .mm-section-count {
      color: var(--nx-text-mute);
    }
    .mm-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .mm-card {
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-3);
      padding: 14px 16px;
    }
    .mm-row {
      display: flex;
      align-items: center;
      gap: 12px;
      text-decoration: none;
      transition: border-color var(--nx-d-fast) var(--nx-ease-out);
    }
    .mm-row:hover {
      border-color: var(--nx-orange-500);
    }
    .mm-row--off {
      opacity: 0.6;
    }
    .mm-row-main {
      display: flex;
      flex-direction: column;
      gap: 3px;
      min-width: 0;
      flex: 1;
    }
    .mm-teams {
      display: flex;
      align-items: baseline;
      gap: 7px;
      min-width: 0;
    }
    .mm-team {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 14.5px;
      color: var(--nx-text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 42%;
    }
    .mm-vs {
      font-size: 12px;
      color: var(--nx-text-dim);
      flex: none;
    }
    .mm-meta {
      font-size: 12px;
      color: var(--nx-text-mute);
    }
    .mm-score {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 14px;
      color: var(--nx-text);
      white-space: nowrap;
    }
    .mm-score--live {
      color: var(--nx-live);
    }
    .mm-pill {
      font-family: var(--nx-font-mono);
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--nx-orange-500);
      border: 1px solid var(--nx-orange-500);
      border-radius: var(--nx-r-pill);
      padding: 4px 10px;
      white-space: nowrap;
    }
    .mm-pill--dim {
      color: var(--nx-text-dim);
      border-color: var(--nx-line);
    }
    .mm-empty-title {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 15px;
      color: var(--nx-text);
      margin: 0 0 6px;
    }
    .mm-empty-sub {
      font-size: 13px;
      color: var(--nx-text-mute);
      margin: 0;
    }
    @media (max-width: 720px) {
      .mm-body {
        padding: 20px 16px 32px;
      }
      .mm-team {
        max-width: 40%;
        font-size: 14px;
      }
    }
  `,
})
export class MesaMatchesComponent {
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly db = athleteFirestore();
  private readonly projectId = athleteProjectId();

  protected readonly sections = [
    { key: 'live' as const, title: 'Acontecendo agora' },
    { key: 'upcoming' as const, title: 'A seguir' },
    { key: 'finished' as const, title: 'Encerradas' },
  ];

  protected readonly tournamentId = toSignal(this.route.paramMap.pipe(map((p) => p.get('tournamentId')?.trim() ?? '')), {
    initialValue: this.route.snapshot.paramMap.get('tournamentId')?.trim() ?? '',
  });

  private readonly matches = signal<TournamentMatch[]>([]);
  private readonly names = signal<MesaTeamNames>(EMPTY_TEAM_NAMES);
  private readonly tournament = signal<TournamentSummary | null>(null);
  protected readonly loading = signal(true);
  protected readonly category = signal<string | null>(null);

  protected readonly accountLabel = computed(() => this.auth.user()?.displayName?.trim() || 'Atleta');
  protected readonly tournamentName = computed(() => this.tournament()?.name || 'Torneio');

  /** Ids já resolvidos, pra o join de nomes rodar uma vez por conjunto novo de duplas e não a
   *  cada ponto marcado (o listener reemite a cada escrita). */
  private resolvedTeamIds = '';

  constructor() {
    effect((onCleanup) => {
      const id = this.tournamentId();
      const db = this.db;
      this.matches.set([]);
      this.names.set(EMPTY_TEAM_NAMES);
      this.resolvedTeamIds = '';
      this.loading.set(true);
      if (!id || !db || !this.projectId) {
        this.loading.set(false);
        return;
      }

      void fetchTournament(db, id)
        .then((t) => this.tournament.set(t))
        .catch(() => this.tournament.set(null));

      const unsub = watchMatchesForTournament(
        db,
        this.projectId,
        id,
        (matches) => {
          this.matches.set(matches);
          this.loading.set(false);
          void this.hydrateNames(matches);
        },
        () => this.loading.set(false),
      );
      onCleanup(() => unsub());
    });
  }

  private async hydrateNames(matches: readonly TournamentMatch[]): Promise<void> {
    const db = this.db;
    if (!db || !this.projectId) return;
    const ids = [...new Set(matches.flatMap((m) => [m.teamAId, m.teamBId]).filter((v) => v.length > 0))].sort();
    const key = ids.join(',');
    if (key === this.resolvedTeamIds) return;
    this.resolvedTeamIds = key;
    try {
      this.names.set(await fetchTeamNamesFor(db, this.projectId, ids));
    } catch {
      // Sem os nomes, a linha cai na descrição do slot da chave — melhor que sumir.
      this.resolvedTeamIds = '';
    }
  }

  private readonly allRows = computed<MesaMatchRow[]>(() => {
    const names = this.names();
    const categoryNames = new Map((this.tournament()?.categories ?? []).map((c) => [c.id, c.categoryName]));
    return buildMesaRows(this.matches(), (m) => ({
      teamA: teamLabelOf(names, m.teamAId, m.teamADescription),
      teamB: teamLabelOf(names, m.teamBId, m.teamBDescription),
      category: categoryNames.get(m.categoryId) ?? 'Categoria',
    }));
  });

  protected readonly categories = computed(() => categoryFilterOptions(this.allRows()));

  protected readonly rows = computed(() => {
    const picked = this.category();
    return picked ? this.allRows().filter((r) => r.categoryId === picked) : this.allRows();
  });

  protected rowsOf(section: MesaMatchRow['section']): MesaMatchRow[] {
    return rowsOfSection(this.rows(), section);
  }
}
