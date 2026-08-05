import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';
import { IconComponent } from '../ui/icon.component';
import { KpiMiniComponent } from '../ui/kpi-mini.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent, type PillTone } from '../ui/pill.component';
import { ArenasRepository, type ArenaPlanTier, type ArenaRow } from './data/arenas.repository';
import { ArenasDemoComponent } from './ui/arenas-demo.component';

/** Filtros com sinal real no doc da arena — não existe campo de aprovação/suspensão. */
const FILTERS = ['Todas', 'Com plano', 'Sem plano', 'Pagamento online', 'Sem quadras'] as const;

type ArenaFilter = (typeof FILTERS)[number];

type LoadState = 'loading' | 'ok' | 'error';

const PLAN_LABEL: Record<ArenaPlanTier, string> = {
  starter: 'Essencial',
  pro: 'Pro',
  elite: 'Parceiro',
};

const PLAN_TONE: Record<ArenaPlanTier, PillTone> = {
  starter: 'dim',
  pro: 'orange',
  elite: 'green',
};

/** Tela de Arenas: tabela real do Firestore + painéis de apoio ainda demonstrativos. */
@Component({
  selector: 'bo-panel-arenas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PanelShellComponent,
    PageHeaderComponent,
    PanelCardComponent,
    KpiMiniComponent,
    PillComponent,
    IconComponent,
    ArenasDemoComponent,
  ],
  template: `
    <bo-panel-shell>
      <bo-page-header title="Arenas" [subtitle]="subtitle()">
        <div class="header-actions">
          <div class="search">
            <bo-icon name="search" [size]="15" />
            <input
              type="search"
              class="search-input"
              placeholder="Nome da arena — Enter para buscar"
              aria-label="Buscar arena"
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
            A tabela lê as arenas reais deste projeto. Receita, risco, reservas e a fila de aprovação
            dos painéis abaixo são exemplos — não existem no backend hoje.
          </span>
        </div>

        <div class="kpi-grid">
          <bo-kpi-mini label="Arenas carregadas" [value]="loadedCount()" />
          <bo-kpi-mini label="Com plano" [value]="withPlanCount()" tone="green" />
          <bo-kpi-mini label="Pagamento online" [value]="onlinePaymentCount()" />
          <bo-kpi-mini label="Nota média" [value]="averageRating()" />
        </div>

        <bo-panel-card
          pad="sm"
          [kicker]="term() ? 'busca: ' + term() : 'coleção arenas'"
          title="Todas as arenas"
        >
          @if (state() === 'error') {
            <div class="bo-alert">
              <bo-icon name="alert" [size]="16" />
              <span>{{ errorMessage() }}</span>
            </div>
            <button type="button" class="bo-mini-btn retry" (click)="reload()">Tentar de novo</button>
          } @else {
            @if (activeFilter() !== 'Todas') {
              <div class="bo-results-hint">
                <span class="bo-filter-badge">
                  {{ activeFilter() }}
                  <button type="button" aria-label="Limpar filtro" (click)="activeFilter.set('Todas')">
                    ✕
                  </button>
                </span>
                Mostrando {{ filtered().length }} de {{ rows().length }} arenas carregadas
              </div>
            }

            <div class="table-head">
              <span>Arena</span>
              <span>Cidade</span>
              <span>Plano</span>
              <span class="right">Quadras</span>
              <span class="right">Nota</span>
              <span class="right">Avaliações</span>
              <span>Pagamento</span>
            </div>

            <div>
              @for (arena of filtered(); track arena.id) {
                <div class="table-row">
                  <div class="cell-name">{{ arena.name }}</div>
                  <div class="cell-city">{{ arena.city || '—' }}</div>
                  <div>
                    @if (arena.planTier) {
                      <bo-pill [tone]="planTone[arena.planTier]">{{ planLabel[arena.planTier] }}</bo-pill>
                    } @else {
                      <span class="cell-dim">sem plano</span>
                    }
                  </div>
                  <div class="right cell-num">{{ arena.courtsCount || '—' }}</div>
                  <div class="right cell-num">{{ rating(arena) }}</div>
                  <div class="right cell-dim">{{ arena.reviewsCount || '—' }}</div>
                  <div>
                    @if (arena.onlinePaymentEnabled) {
                      <bo-pill tone="green">Online</bo-pill>
                    } @else {
                      <span class="cell-dim">só presencial</span>
                    }
                  </div>
                </div>
              } @empty {
                @if (state() === 'loading') {
                  <p class="status">Carregando arenas…</p>
                } @else {
                  <p class="status">
                    @if (term()) {
                      Nenhuma arena cujo nome comece com “{{ term() }}”.
                    } @else {
                      Nenhuma arena cadastrada neste projeto.
                    }
                  </p>
                }
              }
            </div>

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

        <bo-arenas-demo />
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
      width: 280px;
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

    .retry,
    .more {
      align-self: flex-start;
      margin-top: 14px;
    }

    .table-head,
    .table-row {
      display: grid;
      grid-template-columns: 2fr 1.4fr 110px 84px 70px 96px 130px;
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

    .cell-name {
      min-width: 0;
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 13px;
      color: var(--nx-text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .cell-city {
      min-width: 0;
      font-size: 12.5px;
      color: var(--nx-text-mute);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .cell-num {
      font-family: var(--nx-font-mono);
      font-size: 12.5px;
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
export class PanelArenasComponent {
  private readonly repository = inject(ArenasRepository);

  protected readonly filters = FILTERS;
  protected readonly planLabel = PLAN_LABEL;
  protected readonly planTone = PLAN_TONE;

  protected readonly term = signal('');
  protected readonly activeFilter = signal<ArenaFilter>('Todas');
  protected readonly rows = signal<readonly ArenaRow[]>([]);
  protected readonly state = signal<LoadState>('loading');
  protected readonly errorMessage = signal('');
  protected readonly hasMore = signal(false);

  private cursor: QueryDocumentSnapshot<DocumentData> | null = null;

  constructor() {
    void this.reload();
  }

  protected readonly filtered = computed<readonly ArenaRow[]>(() => {
    const rows = this.rows();
    switch (this.activeFilter()) {
      case 'Com plano':
        return rows.filter((a) => a.planTier != null);
      case 'Sem plano':
        return rows.filter((a) => a.planTier == null);
      case 'Pagamento online':
        return rows.filter((a) => a.onlinePaymentEnabled);
      case 'Sem quadras':
        return rows.filter((a) => a.courtsCount === 0);
      default:
        return rows;
    }
  });

  protected readonly loadedCount = computed(() =>
    this.state() === 'error' ? '—' : `${this.rows().length}${this.hasMore() ? '+' : ''}`,
  );

  protected readonly withPlanCount = computed(() =>
    this.state() === 'error' ? '—' : String(this.rows().filter((a) => a.planTier != null).length),
  );

  protected readonly onlinePaymentCount = computed(() =>
    this.state() === 'error' ? '—' : String(this.rows().filter((a) => a.onlinePaymentEnabled).length),
  );

  /** Média só entre quem tem avaliação — senão as arenas sem nota puxariam para baixo. */
  protected readonly averageRating = computed(() => {
    const rated = this.rows().filter((a) => a.reviewsCount > 0 && a.ratingAverage > 0);
    if (this.state() === 'error' || rated.length === 0) {
      return '—';
    }
    const avg = rated.reduce((sum, a) => sum + a.ratingAverage, 0) / rated.length;
    return avg.toFixed(1).replace('.', ',');
  });

  protected readonly subtitle = computed(() => {
    if (this.state() === 'loading' && this.rows().length === 0) {
      return 'Carregando arenas…';
    }
    if (this.state() === 'error') {
      return 'Não foi possível carregar as arenas';
    }
    const total = this.rows().length;
    return `${total}${this.hasMore() ? '+' : ''} ${total === 1 ? 'arena carregada' : 'arenas carregadas'}`;
  });

  protected rating(arena: ArenaRow): string {
    return arena.reviewsCount > 0 ? arena.ratingAverage.toFixed(1).replace('.', ',') : '—';
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
      const page = await this.repository.listArenas(this.term(), null);
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
      const page = await this.repository.listArenas(this.term(), this.cursor);
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
      return 'Sem permissão para ler a coleção de arenas.';
    }
    return err instanceof Error ? err.message : 'Falha ao ler as arenas.';
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }
}
