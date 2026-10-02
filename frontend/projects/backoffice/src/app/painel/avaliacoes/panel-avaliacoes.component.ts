import { ChangeDetectionStrategy, Component, Injectable, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../ui/icon.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent } from '../ui/pill.component';
import { reviewsErrorMessage, sortSummaries, summaryRows, type ReviewSummary, type SummarySort } from './data/tournament-reviews';
import { TournamentReviewsAdminRepository } from './data/tournament-reviews.repository';

type LoadState = 'loading' | 'ok' | 'error';

const SORTS: readonly { id: SummarySort; label: string }[] = [
  { id: 'recent', label: 'Mais recentes' },
  { id: 'worst', label: 'Pior média' },
];

/** A ordenação mora fora da tela: abrir um torneio e voltar recria o componente. */
@Injectable({ providedIn: 'root' })
export class AvaliacoesSortState {
  readonly sort = signal<SummarySort>('recent');
}

/** Avaliações de torneios (spec §4 "Backoffice"): um resumo por torneio, ordenável, com link para
 *  as avaliações de cada um. Só leitura. */
@Component({
  selector: 'bo-panel-avaliacoes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, PanelShellComponent, PageHeaderComponent, PanelCardComponent, PillComponent, IconComponent],
  template: `
    <bo-panel-shell>
      <bo-page-header title="Avaliações de torneios" [subtitle]="subtitle()">
        <button type="button" class="bo-mini-btn" [disabled]="state() === 'loading'" (click)="reload()">
          <bo-icon name="swap" [size]="13" />
          Atualizar
        </button>
      </bo-page-header>

      <div class="bo-filter-bar">
        @for (s of sorts; track s.id) {
          <button
            type="button"
            class="bo-chip"
            [class.active]="sort() === s.id"
            [attr.aria-pressed]="sort() === s.id"
            (click)="sort.set(s.id)"
          >
            {{ s.label }}
          </button>
        }
      </div>

      <div class="body">
        <bo-panel-card pad="sm" kicker="coleção tournamentReviewSummaries" title="Torneios avaliados">
          @if (state() === 'error') {
            <div class="bo-alert">
              <bo-icon name="alert" [size]="16" />
              <span>{{ errorMessage() }}</span>
            </div>
            <button type="button" class="bo-mini-btn retry" (click)="reload()">Tentar de novo</button>
          } @else {
            <div class="table-head">
              <span>Torneio</span>
              <span class="right">Data</span>
              <span class="right">Média</span>
              <span class="right">Avaliações</span>
              <span class="right">Resposta</span>
              <span>Janela</span>
            </div>
            <div>
              @for (row of rows(); track row.id) {
                <a class="table-row" [routerLink]="['/painel/avaliacoes', row.id]" [attr.aria-label]="row.label">
                  <div class="cell-main">
                    <div class="cell-name">{{ row.name }}</div>
                    <div class="cell-sub">{{ row.organizer }}</div>
                  </div>
                  <div class="right cell-num">{{ row.date }}</div>
                  <div class="right cell-num cell-avg">{{ row.average }}</div>
                  <div class="right cell-num">{{ row.reviews }}</div>
                  <div class="right cell-num cell-resp">{{ row.response }}</div>
                  <div>
                    <bo-pill [tone]="row.windowOpen ? 'green' : 'dim'">{{ row.windowLabel }}</bo-pill>
                  </div>
                </a>
              } @empty {
                @if (state() === 'loading') {
                  <p class="status">Carregando avaliações…</p>
                } @else {
                  <p class="status">Nenhum torneio passou pela avaliação dos atletas ainda.</p>
                }
              }
            </div>
            @if (sort() === 'worst') {
              <p class="legend">
                Pior média ordena só os torneios com 3 ou mais avaliações; os outros vêm depois, do mais recente ao mais
                antigo.
              </p>
            }
          }
        </bo-panel-card>
      </div>
    </bo-panel-shell>
  `,
  styles: `
    .body {
      flex: 1;
      padding: 22px 32px 28px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      overflow: auto;
    }
    .status,
    .legend {
      margin: 14px 0 0;
      font-size: 12px;
      color: var(--nx-text-dim);
    }
    .retry {
      align-self: flex-start;
      margin-top: 14px;
    }
    .table-head,
    .table-row {
      display: grid;
      grid-template-columns: minmax(0, 2.4fr) 92px 64px 92px 92px 150px;
      gap: 8px;
      align-items: center;
    }
    .table-head {
      padding: 0 4px 10px;
      border-bottom: 1px solid var(--nx-line-strong);
    }
    .table-head span {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      font-weight: 600;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }
    .right {
      text-align: right;
    }
    .table-row {
      padding: 11px 4px;
      border-bottom: 1px solid var(--nx-line);
      color: inherit;
      text-decoration: none;
    }
    .table-row:hover {
      background: var(--nx-surface-1);
    }
    .cell-main {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .cell-name {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 13px;
      color: var(--nx-text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .cell-sub {
      font-size: 11.5px;
      color: var(--nx-text-dim);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .cell-num {
      font-family: var(--nx-font-mono);
      font-size: 12px;
      color: var(--nx-text);
    }
  `,
})
export class PanelAvaliacoesComponent {
  private readonly repository = inject(TournamentReviewsAdminRepository);
  private loadToken = 0;

  protected readonly sorts = SORTS;
  protected readonly state = signal<LoadState>('loading');
  protected readonly errorMessage = signal('');
  protected readonly summaries = signal<readonly ReviewSummary[]>([]);
  /** `null` enquanto os nomes carregam. */
  protected readonly names = signal<ReadonlyMap<string, string> | null>(null);
  protected readonly sort = inject(AvaliacoesSortState).sort;
  protected readonly now = signal(new Date());

  protected readonly rows = computed(() => summaryRows(sortSummaries(this.summaries(), this.sort()), this.names(), this.now()));

  protected readonly subtitle = computed(() => {
    if (this.state() === 'loading') return 'Carregando…';
    if (this.state() === 'error') return 'Não foi possível carregar as avaliações';
    const n = this.summaries().length;
    return n === 1 ? '1 torneio com avaliação aberta ou encerrada' : `${n} torneios com avaliação aberta ou encerrada`;
  });

  constructor() {
    void this.reload();
  }

  /** O token descarta a resposta de um "Atualizar" anterior que chegar por último. */
  protected async reload(): Promise<void> {
    const token = ++this.loadToken;
    this.state.set('loading');
    this.errorMessage.set('');
    this.names.set(null);
    let summaries: ReviewSummary[];
    try {
      summaries = await this.repository.listSummaries();
    } catch (err) {
      if (token !== this.loadToken) return;
      this.errorMessage.set(reviewsErrorMessage(err));
      this.state.set('error');
      return;
    }
    if (token !== this.loadToken) return;
    this.now.set(new Date());
    this.summaries.set(summaries);
    this.state.set('ok');
    // Os nomes só enriquecem a tabela: se a leitura falhar, ficam os uids encurtados.
    const names = await this.repository
      .profileNames(summaries.map((s) => s.organizerId))
      .catch(() => new Map<string, string>());
    if (token !== this.loadToken) return;
    this.names.set(names);
  }
}
