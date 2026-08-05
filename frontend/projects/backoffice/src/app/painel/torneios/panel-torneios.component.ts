import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';
import { IconComponent } from '../ui/icon.component';
import { KpiMiniComponent } from '../ui/kpi-mini.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent, type PillTone } from '../ui/pill.component';
import {
  TournamentsRepository,
  type TournamentRow,
  type TournamentStatus,
} from './data/tournaments.repository';
import { TorneiosDemoComponent } from './ui/torneios-demo.component';

/** Filtros sobre campos que o doc do torneio realmente tem. */
const FILTERS = [
  'Todos',
  'Inscrições',
  'Em andamento',
  'Concluídos',
  'Cancelados',
  'Somente por link',
] as const;

type TournamentFilter = (typeof FILTERS)[number];

type LoadState = 'loading' | 'ok' | 'error';

const STATUS_LABEL: Record<TournamentStatus, string> = {
  inscricoes: 'Inscrições',
  andamento: 'Em andamento',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
};

const STATUS_TONE: Record<TournamentStatus, PillTone> = {
  inscricoes: 'yellow',
  andamento: 'orange',
  concluido: 'green',
  cancelado: 'red',
};

const DATE = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });

/** Tela de Torneios: tabela real do Firestore + painéis de apoio ainda demonstrativos. */
@Component({
  selector: 'bo-panel-torneios',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PanelShellComponent,
    PageHeaderComponent,
    PanelCardComponent,
    KpiMiniComponent,
    PillComponent,
    IconComponent,
    TorneiosDemoComponent,
  ],
  template: `
    <bo-panel-shell>
      <bo-page-header title="Torneios" [subtitle]="subtitle()">
        <div class="header-actions">
          <div class="search">
            <bo-icon name="search" [size]="15" />
            <input
              type="search"
              class="search-input"
              placeholder="Nome do torneio — Enter para buscar"
              aria-label="Buscar torneio"
              [value]="term()"
              (input)="term.set(value($event))"
              (keydown.enter)="reload()"
            />
            @if (term()) {
              <button type="button" class="clear" aria-label="Limpar busca" (click)="clearSearch()">✕</button>
            }
          </div>
          <button type="button" class="bo-mini-btn" [disabled]="state() === 'loading'" (click)="reload()">
            <bo-icon name="swap" [size]="13" />
            Atualizar
          </button>
        </div>
      </bo-page-header>

      <div class="bo-filter-bar">
        <bo-icon name="filter" [size]="14" style="color: var(--nx-text-dim); flex: none" />
        @for (f of filters; track f) {
          <button
            type="button"
            class="bo-chip"
            [class.active]="activeFilter() === f"
            (click)="activeFilter.set(f)"
          >
            {{ f }}
          </button>
        }
      </div>

      <div class="body">
        <div class="demo-notice">
          <bo-icon name="alert" [size]="15" />
          <span>
            A tabela lê os torneios reais deste projeto. Inscritos, receita, alertas e os painéis
            abaixo são exemplos — essas métricas não são calculadas no backend hoje.
          </span>
        </div>

        <div class="kpi-grid">
          <bo-kpi-mini label="Torneios carregados" [value]="loadedCount()" />
          <bo-kpi-mini label="Inscrições abertas" [value]="byStatus('inscricoes')" tone="yellow" />
          <bo-kpi-mini label="Em andamento" [value]="byStatus('andamento')" />
          <bo-kpi-mini label="Concluídos" [value]="byStatus('concluido')" tone="green" />
        </div>

        <bo-panel-card
          pad="sm"
          [kicker]="term() ? 'busca: ' + term() : 'coleção tournaments'"
          title="Todos os torneios"
        >
          @if (state() === 'error') {
            <div class="bo-alert">
              <bo-icon name="alert" [size]="16" />
              <span>{{ errorMessage() }}</span>
            </div>
            <button type="button" class="bo-mini-btn retry" (click)="reload()">Tentar de novo</button>
          } @else {
            @if (activeFilter() !== 'Todos') {
              <div class="bo-results-hint">
                <span class="bo-filter-badge">
                  {{ activeFilter() }}
                  <button type="button" aria-label="Limpar filtro" (click)="activeFilter.set('Todos')">
                    ✕
                  </button>
                </span>
                Mostrando {{ filtered().length }} de {{ rows().length }} torneios carregados
              </div>
            }

            <div class="table-head">
              <span>Torneio</span>
              <span>Esporte</span>
              <span>Status</span>
              <span class="right">Início</span>
              <span class="right">Categorias</span>
              <span class="right">Vagas</span>
              <span>Visibilidade</span>
            </div>

            <div>
              @for (t of filtered(); track t.id) {
                <div class="table-row">
                  <div class="cell-main">
                    <div class="cell-name">{{ t.name }}</div>
                    <div class="cell-place">{{ t.place || '—' }}</div>
                  </div>
                  <div class="cell-sport">{{ t.sport || '—' }}</div>
                  <div><bo-pill [tone]="statusTone[t.status]">{{ statusLabel[t.status] }}</bo-pill></div>
                  <div class="right cell-date">{{ dateOf(t) }}</div>
                  <div class="right cell-num">{{ t.categoriesCount || '—' }}</div>
                  <div class="right cell-num">{{ t.capacity || '—' }}</div>
                  <div>
                    @if (t.visibility === 'linkOnly') {
                      <bo-pill tone="dim">Só por link</bo-pill>
                    } @else {
                      <span class="cell-dim">pública</span>
                    }
                  </div>
                </div>
              } @empty {
                @if (state() === 'loading') {
                  <p class="status">Carregando torneios…</p>
                } @else {
                  <p class="status">
                    @if (term()) {
                      Nenhum torneio cujo nome comece com “{{ term() }}”.
                    } @else {
                      Nenhum torneio com data de início cadastrada neste projeto.
                    }
                  </p>
                }
              }
            </div>

            @if (!term()) {
              <p class="legend">
                Ordenado por data de início (mais recentes primeiro). Torneios sem data cadastrada não
                entram nesta ordenação — use a busca por nome para chegar neles.
              </p>
            }

            @if (hasMore()) {
              <button
                type="button"
                class="bo-mini-btn more"
                [disabled]="state() === 'loading'"
                (click)="loadMore()"
              >
                {{ state() === 'loading' ? 'Carregando…' : 'Carregar mais' }}
              </button>
            }
          }
        </bo-panel-card>

        <bo-torneios-demo />
      </div>
    </bo-panel-shell>
  `,
  styles: `
    .header-actions {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .search {
      width: 300px;
      height: 34px;
      padding: 0 12px;
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-2);
      display: flex;
      align-items: center;
      gap: 9px;
      color: var(--nx-text-dim);
    }

    .search:focus-within {
      border-color: rgba(255, 106, 26, 0.5);
    }

    .search-input {
      flex: 1;
      min-width: 0;
      background: transparent;
      border: none;
      outline: none;
      color: var(--nx-text);
      font-family: var(--nx-font-ui);
      font-size: 13px;
    }

    .clear {
      background: transparent;
      border: none;
      cursor: pointer;
      color: var(--nx-text-dim);
      font: inherit;
      padding: 0 2px;
    }

    .body {
      flex: 1;
      padding: 22px 32px 28px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      overflow: auto;
    }

    .demo-notice {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 11px 14px;
      border-radius: var(--nx-r-3);
      background: rgba(244, 197, 67, 0.08);
      border: 1px solid rgba(244, 197, 67, 0.28);
      color: var(--nx-pending);
      font-size: 12.5px;
      line-height: 1.5;
    }

    .demo-notice bo-icon {
      flex: none;
      margin-top: 1px;
    }

    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
    }

    .status {
      margin: 16px 0 4px;
      font-size: 12.5px;
      color: var(--nx-text-dim);
    }

    .legend {
      margin: 14px 0 0;
      font-size: 11.5px;
      line-height: 1.45;
      color: var(--nx-text-dim);
    }

    .retry,
    .more {
      align-self: flex-start;
      margin-top: 14px;
    }

    .table-head,
    .table-row {
      display: grid;
      grid-template-columns: 2.2fr 1.1fr 130px 84px 96px 74px 120px;
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

    .table-head span.right {
      text-align: right;
    }

    .table-row {
      padding: 11px 4px;
      border-bottom: 1px solid var(--nx-line);
    }

    .table-row:last-child {
      border-bottom: none;
    }

    .table-row .right {
      text-align: right;
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

    .cell-place {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      color: var(--nx-text-dim);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .cell-sport {
      font-size: 12.5px;
      color: var(--nx-text-mute);
    }

    .cell-date,
    .cell-num {
      font-family: var(--nx-font-mono);
      font-size: 12px;
      color: var(--nx-text);
    }

    .cell-dim {
      font-family: var(--nx-font-mono);
      font-size: 11.5px;
      color: var(--nx-text-dim);
    }

    @media (max-width: 720px) {
      .kpi-grid {
        grid-template-columns: 1fr 1fr;
      }
    }
  `,
})
export class PanelTorneiosComponent {
  private readonly repository = inject(TournamentsRepository);

  protected readonly filters = FILTERS;
  protected readonly statusLabel = STATUS_LABEL;
  protected readonly statusTone = STATUS_TONE;

  protected readonly term = signal('');
  protected readonly activeFilter = signal<TournamentFilter>('Todos');
  protected readonly rows = signal<readonly TournamentRow[]>([]);
  protected readonly state = signal<LoadState>('loading');
  protected readonly errorMessage = signal('');
  protected readonly hasMore = signal(false);

  private cursor: QueryDocumentSnapshot<DocumentData> | null = null;

  constructor() {
    void this.reload();
  }

  protected readonly filtered = computed<readonly TournamentRow[]>(() => {
    const rows = this.rows();
    switch (this.activeFilter()) {
      case 'Inscrições':
        return rows.filter((t) => t.status === 'inscricoes');
      case 'Em andamento':
        return rows.filter((t) => t.status === 'andamento');
      case 'Concluídos':
        return rows.filter((t) => t.status === 'concluido');
      case 'Cancelados':
        return rows.filter((t) => t.status === 'cancelado');
      case 'Somente por link':
        return rows.filter((t) => t.visibility === 'linkOnly');
      default:
        return rows;
    }
  });

  protected readonly loadedCount = computed(() =>
    this.state() === 'error' ? '—' : `${this.rows().length}${this.hasMore() ? '+' : ''}`,
  );

  protected readonly subtitle = computed(() => {
    if (this.state() === 'loading' && this.rows().length === 0) {
      return 'Carregando torneios…';
    }
    if (this.state() === 'error') {
      return 'Não foi possível carregar os torneios';
    }
    const total = this.rows().length;
    return `${total}${this.hasMore() ? '+' : ''} ${total === 1 ? 'torneio carregado' : 'torneios carregados'}`;
  });

  protected byStatus(status: TournamentStatus): string {
    return this.state() === 'error'
      ? '—'
      : String(this.rows().filter((t) => t.status === status).length);
  }

  protected dateOf(t: TournamentRow): string {
    return t.startAt ? DATE.format(t.startAt) : '—';
  }

  protected clearSearch(): void {
    this.term.set('');
    void this.reload();
  }

  protected async reload(): Promise<void> {
    this.state.set('loading');
    this.rows.set([]);
    this.cursor = null;
    try {
      const page = await this.repository.listTournaments(this.term(), null);
      this.rows.set(page.rows);
      this.cursor = page.cursor;
      this.hasMore.set(page.hasMore);
      this.state.set('ok');
    } catch (err) {
      this.errorMessage.set(this.messageOf(err));
      this.state.set('error');
    }
  }

  protected async loadMore(): Promise<void> {
    if (!this.hasMore() || this.state() === 'loading') {
      return;
    }
    this.state.set('loading');
    try {
      const page = await this.repository.listTournaments(this.term(), this.cursor);
      this.rows.update((current) => [...current, ...page.rows]);
      this.cursor = page.cursor;
      this.hasMore.set(page.hasMore);
      this.state.set('ok');
    } catch (err) {
      this.errorMessage.set(this.messageOf(err));
      this.state.set('error');
    }
  }

  private messageOf(err: unknown): string {
    const code = (err as { code?: string })?.code ?? '';
    if (code.includes('permission-denied')) {
      return 'Sem permissão para ler a coleção de torneios.';
    }
    return err instanceof Error ? err.message : 'Falha ao ler os torneios.';
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }
}
