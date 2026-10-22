import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { callableErrorMessage } from '../data/callable-error';
import { IconComponent } from '../ui/icon.component';
import { KpiMiniComponent } from '../ui/kpi-mini.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent } from '../ui/pill.component';
import { FILTERS, formatDate, matchesFilter, matchesSearch, statusPill, type CenterFilter, type CenterRow } from './data/training-centers';
import { TrainingCentersRepository } from './data/training-centers.repository';

/** Centros de Treinamento cadastrados: quem pediu ativação aparece primeiro. */
@Component({
  selector: 'bo-panel-centros',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, PanelShellComponent, PageHeaderComponent, PanelCardComponent, PillComponent, IconComponent, KpiMiniComponent],
  template: `
    <bo-panel-shell>
      <bo-page-header title="Centros de treinamento" [subtitle]="subtitle()">
        <button type="button" class="bo-mini-btn" [disabled]="loading()" (click)="reload()">
          <bo-icon name="swap" [size]="13" />
          Atualizar
        </button>
      </bo-page-header>

      <div class="body">
        <div class="kpis">
          <bo-kpi-mini label="Pediram ativação" [value]="'' + count('requested')" [tone]="count('requested') ? 'yellow' : 'neutral'" />
          <bo-kpi-mini label="Pendentes" [value]="'' + count('pending')" />
          <bo-kpi-mini label="Ativos" [value]="'' + count('active')" tone="green" />
          <bo-kpi-mini label="Suspensos" [value]="'' + count('suspended')" [tone]="count('suspended') ? 'red' : 'neutral'" />
        </div>

        <div class="bo-filter-bar">
          @for (f of filters; track f.id) {
            <button type="button" class="bo-chip" [class.active]="filter() === f.id" [attr.aria-pressed]="filter() === f.id" (click)="filter.set(f.id)">
              {{ f.label }}
            </button>
          }
          <input class="bo-input search" type="search" placeholder="Buscar por nome, CNPJ, owner, cidade" [value]="term()" (input)="term.set($any($event.target).value)" aria-label="Buscar centro" />
        </div>

        <bo-panel-card pad="sm" kicker="coleção trainingCenters" title="Centros">
          @if (error()) {
            <div class="bo-alert"><bo-icon name="alert" [size]="16" /><span>{{ error() }}</span></div>
          } @else {
            <div class="table-head">
              <span>Centro</span><span>Owner</span><span class="right">Equipe</span><span class="right">Alunos</span>
              <span class="right">Turmas</span><span>Recebimento</span><span>Situação</span>
            </div>
            @for (c of visible(); track c.id) {
              <a class="table-row" [routerLink]="['/painel/centros', c.id]">
                <div class="cell-main">
                  <div class="cell-name">{{ c.name }}</div>
                  <div class="cell-sub">{{ c.city }}{{ c.state ? '/' + c.state : '' }} · criado {{ date(c.createdAtMs) }}</div>
                </div>
                <div class="cell-main"><div class="cell-sub strong">{{ c.ownerName || '—' }}</div><div class="cell-sub">{{ c.contactEmail }}</div></div>
                <div class="right cell-num">{{ c.counts.members }}</div>
                <div class="right cell-num">{{ c.counts.students }}</div>
                <div class="right cell-num">{{ c.counts.activeClasses }}</div>
                <div><bo-pill [tone]="c.receivingConnected ? 'green' : 'dim'">{{ c.receivingConnected ? 'Conectado' : 'Pendente' }}</bo-pill></div>
                <div><bo-pill [tone]="pill(c).tone">{{ pill(c).label }}</bo-pill></div>
              </a>
            } @empty {
              <p class="status">{{ loading() ? 'Carregando centros…' : 'Nenhum centro neste filtro.' }}</p>
            }
          }
        </bo-panel-card>
      </div>
    </bo-panel-shell>
  `,
  styles: `
    .body { flex: 1; padding: 22px 32px 28px; display: flex; flex-direction: column; gap: 16px; overflow: auto; }
    .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; }
    .search { max-width: 320px; margin-left: auto; height: 34px; }
    .status { margin: 14px 0 0; font-size: 12px; color: var(--nx-text-dim); }
    .table-head, .table-row { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1.4fr) 60px 60px 60px 110px 130px; gap: 8px; align-items: center; }
    .table-head { padding: 0 4px 10px; border-bottom: 1px solid var(--nx-line-strong); }
    .table-head span { font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: var(--nx-text-dim); }
    .right { text-align: right; }
    .table-row { padding: 11px 4px; border-bottom: 1px solid var(--nx-line); color: inherit; text-decoration: none; }
    .table-row:hover { background: var(--nx-surface-1); }
    .cell-main { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .cell-name { font-family: var(--nx-font-display); font-weight: 600; font-size: 13px; color: var(--nx-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .cell-sub { font-size: 11.5px; color: var(--nx-text-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .cell-sub.strong { color: var(--nx-text); }
    .cell-num { font-family: var(--nx-font-mono); font-size: 12px; color: var(--nx-text); }
  `,
})
export class PanelCentrosComponent {
  private readonly repo = inject(TrainingCentersRepository);
  private token = 0;

  protected readonly filters = FILTERS;
  protected readonly centers = signal<CenterRow[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly filter = signal<CenterFilter>('all');
  protected readonly term = signal('');

  protected readonly visible = computed(() =>
    this.centers().filter((c) => matchesFilter(c, this.filter()) && matchesSearch(c, this.term())),
  );
  protected readonly subtitle = computed(() => {
    if (this.loading()) return 'Carregando…';
    const n = this.centers().length;
    return n === 1 ? '1 centro cadastrado' : `${n} centros cadastrados`;
  });

  constructor() {
    void this.reload();
  }

  protected count(f: CenterFilter): number {
    return this.centers().filter((c) => matchesFilter(c, f)).length;
  }

  protected pill(c: CenterRow) {
    return statusPill(c);
  }

  protected date(ms: number | null): string {
    return formatDate(ms);
  }

  protected async reload(): Promise<void> {
    const t = ++this.token;
    this.loading.set(true);
    this.error.set('');
    try {
      const list = await this.repo.list();
      if (t === this.token) this.centers.set(list);
    } catch (err) {
      if (t === this.token) this.error.set(callableErrorMessage(err));
    } finally {
      if (t === this.token) this.loading.set(false);
    }
  }
}
