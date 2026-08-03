import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import {
  LEAGUE_COUNTING_MODE_LABEL,
  leagueCategoriesForGender,
  leagueGendersOf,
  rankLeagueRows,
  type LeagueGenderCat,
  type LeagueRankingScope,
} from '@nexago/leagues';
import { listLeagueRanking, type LeagueRankingNamedEntry } from '../data/leagues-repository';
import { OgCardComponent } from '../ui/card.component';
import { OgChartTabsComponent } from '../ui/chart-tabs.component';
import { OgPageHeaderComponent } from '../ui/page-header.component';
import { LigaStore } from './liga.store';

const SCOPE_TABS = ['Duplas', 'Atletas'] as const;
type ScopeTab = (typeof SCOPE_TABS)[number];

const SCOPE_BY_TAB: Record<ScopeTab, LeagueRankingScope> = { Duplas: 'teams', Atletas: 'athletes' };

const GENDER_LABEL: Record<LeagueGenderCat, string> = { M: 'Masculino', F: 'Feminino', Mix: 'Misto' };

/** Ranking da liga — mesma leitura do app (`leagueTeamRankings`/`leagueAthleteRankings`), com
 *  o mesmo recorte: escopo duplas/atletas, gênero e categoria. Pontos efetivos já vêm
 *  calculados pela Cloud Function; a coluna por etapa vem de `stageResults`. */
@Component({
  selector: 'og-liga-ranking',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OgPageHeaderComponent, OgCardComponent, OgChartTabsComponent],
  template: `
    <og-page-header title="Ranking" [subtitle]="countingLabel()" />

    <div class="og-content">
      <div class="og-liga-filters">
        <og-chart-tabs [tabs]="scopeTabs" [active]="scopeTab()" (changed)="scopeTab.set($any($event))" />

        @if (genders().length > 1) {
          <div class="og-liga-chips">
            @for (g of genders(); track g) {
              <button type="button" class="og-chip" [class.active]="g === gender()" (click)="setGender(g)">
                {{ genderLabel[g] }}
              </button>
            }
          </div>
        }

        @if (categoriesForGender().length > 0) {
          <select class="og-select-el og-liga-cat" [value]="categoryId() ?? ''" (change)="setCategory($any($event.target).value)">
            @for (c of categoriesForGender(); track c.id) {
              <option [value]="c.id">{{ c.categoryName }}</option>
            }
          </select>
        }
      </div>

      <og-card pad="0">
        <div class="og-table-head og-liga-rank-head">
          <span style="width:52px">Pos.</span>
          <span style="flex:1.4">{{ scopeTab() === 'Duplas' ? 'Dupla' : 'Atleta' }}</span>
          @for (s of stageColumns(); track s.tournamentId) {
            <span style="width:62px" [title]="s.name">{{ s.shortName }}</span>
          }
          <span style="width:74px">Etapas</span>
          <span style="width:80px">Pontos</span>
        </div>
        <div class="og-table-body">
          @if (loading()) {
            @for (i of [1, 2, 3, 4]; track i) {
              <div class="og-row"><div class="og-skeleton-line" style="width:100%"></div></div>
            }
          } @else if (error(); as msg) {
            <p class="og-empty">{{ msg }}</p>
          } @else {
            @for (row of rows(); track row.id) {
              <div class="og-row">
                <span style="width:52px" class="og-liga-pos" [class.top]="row.rank <= 3">{{ row.rank }}º</span>
                <span style="flex:1.4" class="og-liga-name">{{ row.displayName }}</span>
                @for (s of stageColumns(); track s.tournamentId) {
                  <span style="width:62px" class="og-liga-stage-pts">{{ pointsAt(row, s.tournamentId) }}</span>
                }
                <span style="width:74px" class="og-liga-stage-pts">{{ row.stagesPlayed }}</span>
                <span style="width:80px" class="og-liga-total">{{ row.effectivePoints }}</span>
              </div>
            } @empty {
              <p class="og-empty">{{ emptyMessage() }}</p>
            }
          }
        </div>
      </og-card>

      @if (!loading() && rows().length > 0) {
        <p class="og-liga-foot">
          Pontuação por {{ countingLabel().toLowerCase() }}. As colunas por etapa mostram os pontos brutos —
          o total já aplica o corte.
        </p>
      }
    </div>
  `,
  styles: `
    .og-liga-filters {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }
    .og-liga-chips {
      display: flex;
      gap: 6px;
    }
    .og-liga-cat {
      width: auto;
      min-width: 190px;
    }
    .og-liga-rank-head span {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .og-liga-pos {
      font-family: var(--nx-font-mono);
      font-size: 12px;
      color: var(--nx-text-dim);
    }
    .og-liga-pos.top {
      color: var(--nx-orange-500);
    }
    .og-liga-name {
      font-family: var(--nx-font-ui);
      font-size: 13px;
      color: var(--nx-text);
    }
    .og-liga-stage-pts {
      font-family: var(--nx-font-mono);
      font-size: 12px;
      color: var(--nx-text-mute);
    }
    .og-liga-total {
      font-family: var(--nx-font-mono);
      font-size: 13px;
      font-weight: 600;
      color: var(--nx-text);
    }
    .og-liga-foot {
      font-family: var(--nx-font-ui);
      font-size: 12px;
      color: var(--nx-text-dim);
      margin: 0;
    }
    .og-empty {
      font-family: var(--nx-font-ui);
      font-size: 13px;
      color: var(--nx-text-mute);
      padding: 14px 0;
      margin: 0;
    }
    .og-skeleton-line {
      height: 12px;
      border-radius: 4px;
      background: var(--nx-surface-1);
    }
  `,
})
export class LigaRankingComponent {
  protected readonly store = inject(LigaStore);

  protected readonly scopeTabs = [...SCOPE_TABS];
  protected readonly genderLabel = GENDER_LABEL;

  protected readonly scopeTab = signal<ScopeTab>('Duplas');
  /** Nulos = "ainda não escolhido"; o efeito abaixo aplica o primeiro válido da liga. */
  private readonly genderOverride = signal<LeagueGenderCat | null>(null);
  private readonly categoryOverride = signal<string | null>(null);

  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  /** Pontuações da liga inteira no escopo atual; o recorte por categoria é local. */
  private readonly allRows = signal<LeagueRankingNamedEntry[]>([]);

  protected readonly rows = computed(() => rankLeagueRows(this.allRows(), this.categoryId()));

  private loadedKey: string | null = null;

  protected readonly genders = computed(() => leagueGendersOf(this.store.league()?.categories ?? []));

  protected readonly gender = computed<LeagueGenderCat | null>(() => {
    const override = this.genderOverride();
    const available = this.genders();
    if (override && available.includes(override)) return override;
    return available[0] ?? null;
  });

  protected readonly categoriesForGender = computed(() =>
    leagueCategoriesForGender(this.store.league()?.categories ?? [], this.gender()),
  );

  protected readonly categoryId = computed<string | null>(() => {
    const options = this.categoriesForGender();
    const override = this.categoryOverride();
    if (override && options.some((c) => c.id === override)) return override;
    return options[0]?.id ?? null;
  });

  /** Colunas de etapa: só as publicadas, na ordem do plano da temporada. */
  protected readonly stageColumns = computed(() =>
    this.store
      .rows()
      .filter((r) => r.tournamentId != null)
      .map((r) => ({ tournamentId: r.tournamentId!, name: r.name, shortName: `E${r.order}` })),
  );

  protected readonly countingLabel = computed(() => {
    const l = this.store.league();
    return l ? LEAGUE_COUNTING_MODE_LABEL[l.countingStagesMode] : '';
  });

  protected readonly emptyMessage = computed(() =>
    this.categoryId() == null
      ? 'A liga ainda não tem categorias — o ranking é publicado por categoria.'
      : 'Sem pontuação nesta categoria ainda. O ranking é atualizado quando as partidas das etapas são encerradas.',
  );

  constructor() {
    // Uma busca por (liga, escopo); trocar de gênero/categoria só refiltra o que já está aqui.
    effect(() => {
      const league = this.store.league();
      const scope = SCOPE_BY_TAB[this.scopeTab()];
      if (!league) return;

      const key = `${league.id}|${scope}`;
      if (this.loadedKey === key) return;
      this.loadedKey = key;

      this.loading.set(true);
      this.error.set(null);
      void listLeagueRanking({ leagueId: league.id, scope, mode: league.countingStagesMode })
        .then((rows) => this.allRows.set(rows))
        .catch((e) => {
          this.allRows.set([]);
          this.error.set((e as Error).message || 'Não foi possível carregar o ranking.');
        })
        .finally(() => this.loading.set(false));
    });
  }

  protected setGender(g: LeagueGenderCat): void {
    this.genderOverride.set(g);
    this.categoryOverride.set(null);
  }

  protected setCategory(id: string): void {
    this.categoryOverride.set(id || null);
  }

  protected pointsAt(row: LeagueRankingNamedEntry, tournamentId: string): string {
    const result = row.stageResults.find((s) => s.tournamentId === tournamentId);
    return result ? `${result.points}` : '—';
  }
}
