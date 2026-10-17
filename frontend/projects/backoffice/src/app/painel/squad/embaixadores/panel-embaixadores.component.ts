import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../../auth/auth.service';
import { callableErrorMessage } from '../../data/callable-error';
import { SquadBadgesService } from '../../data/squad-badges.service';
import { downloadText } from '../../loja/pedidos/data/order';
import { IconComponent } from '../../ui/icon.component';
import { PanelShellComponent } from '../../ui/panel-shell.component';
import { dayMonthOfKey, spDateKey } from '../comissoes/data/commission';
import { freeSeats } from '../data/squad-program';
import {
  SquadProgramRepository,
  type ContractActionInput,
  type ProgramState,
  type SendInviteInput,
} from '../data/squad-program.repository';
import { InviteDialogComponent } from '../ui/invite-dialog.component';
import {
  DEFAULT_STATUS_FILTER,
  ambassadorsCsv,
  applyFilters,
  buildRows,
  citiesOf,
  scoreRecalculating,
  sortRows,
  tabCounts,
  type AmbPeriod,
  type AmbassadorRow,
  type Filters,
} from './data/ambassador';
import { AmbassadorFiltersComponent } from './ui/ambassador-filters.component';
import { AmbassadorsTableComponent, type RowAction } from './ui/ambassadors-table.component';
import { ContractActionDialogComponent, type ContractDialogMode } from './ui/contract-action-dialog.component';

export const PAGE_SIZE = 25;

/** `not-found` cru ("NOT FOUND") é callable que ainda não foi publicada, não registro sumido. */
function errorText(error: unknown): string {
  const code = String((error as { code?: unknown })?.code ?? '');
  const message = String((error as { message?: unknown })?.message ?? '');
  if (code.includes('not-found')) {
    return message && message !== 'NOT FOUND' ? message : 'Função ainda não publicada no servidor.';
  }
  return callableErrorMessage(error);
}

/**
 * Squad › Embaixadores (tela 02). Contratos de `squadAmbassadors`, números das comissões liberadas
 * e pagas, status derivado pelas regras da tela 06. Escrita só pelas callables do Squad.
 */
@Component({
  selector: 'bo-panel-embaixadores',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PanelShellComponent,
    IconComponent,
    AmbassadorFiltersComponent,
    AmbassadorsTableComponent,
    ContractActionDialogComponent,
    InviteDialogComponent,
  ],
  template: `
    <bo-panel-shell>
      <header class="head">
        <div class="titles">
          <div class="crumb">Squad</div>
          <h1>Embaixadores
            @if (data(); as d) {
              <span class="seats">{{ live() }} de {{ d.cycle.seats }} vagas do piloto</span>
            }
          </h1>
        </div>
        <div class="spacer"></div>
        <button type="button" class="bo-mini-btn big" [disabled]="state() !== 'ready' || filtered().length === 0" (click)="exportCsv()">
          Exportar CSV
        </button>
        @if (canEdit()) {
          <button type="button" class="bo-mini-btn bo-mini-btn-primary big" [disabled]="!data()" (click)="openInvite()">
            <bo-icon name="plus" [size]="14" /> Convidar atleta
          </button>
        }
      </header>

      <div class="body">
        @if (error(); as e) {
          <div class="bo-alert" role="alert">
            <bo-icon name="alert" [size]="16" />
            <span>{{ e }}</span>
            <button type="button" class="bo-mini-btn push" (click)="error.set(null)">Fechar</button>
          </div>
        }

        @switch (state()) {
          @case ('loading') {
            <div class="skel" aria-busy="true" aria-label="Carregando embaixadores"></div>
          }
          @case ('error') {
            <div class="bo-alert" role="alert">
              <bo-icon name="alert" [size]="16" />
              <span>{{ loadError() }}</span>
              <button type="button" class="bo-mini-btn push" (click)="reload()">Tentar de novo</button>
            </div>
          }
          @default {
            @if (rows().length === 0) {
              <div class="empty">
                <bo-icon name="users" [size]="22" />
                <p>Nenhum embaixador ainda</p>
                <span>O contrato nasce quando o atleta aceita o convite no app.</span>
                @if (canEdit()) {
                  <button type="button" class="bo-mini-btn bo-mini-btn-primary" (click)="openInvite()">
                    <bo-icon name="plus" [size]="14" /> Convidar atleta
                  </button>
                }
              </div>
            } @else {
              <bo-ambassador-filters
                [filters]="filters()"
                [counts]="counts()"
                [cities]="cities()"
                [period]="period()"
                (filtersChange)="setFilters($event)"
                (periodChange)="setPeriod($event)"
              />

              @if (filtered().length === 0) {
                <div class="empty">
                  <bo-icon name="search" [size]="22" />
                  @if (filters().search) {
                    <p>Nada encontrado para "{{ filters().search.trim() }}"</p>
                  } @else {
                    <p>Nenhum embaixador com esses filtros</p>
                  }
                </div>
              } @else {
                <bo-ambassadors-table
                  [rows]="pageRows()"
                  [canEdit]="canEdit()"
                  [recalculating]="recalculating"
                  (action)="onAction($event.kind, $event.row)"
                />
              }

              <footer class="foot">
                <div class="pager">
                  <span>Mostrando {{ pageRows().length }} de {{ filtered().length }}</span>
                  @if (filtered().length > pageSize) {
                    <button type="button" class="bo-mini-btn" [disabled]="page() === 0" (click)="page.set(page() - 1)">Anterior</button>
                    <button type="button" class="bo-mini-btn" [disabled]="(page() + 1) * pageSize >= filtered().length" (click)="page.set(page() + 1)">Próxima</button>
                  }
                </div>
                <span>Score é interno — o atleta vê só pontos e nível</span>
              </footer>
            }
          }
        }
      </div>

      @if (toast(); as t) {
        <div class="toast" role="status"><bo-icon name="check" [size]="15" /> {{ t }}</div>
      }

      @if (data(); as d) {
        <bo-contract-action-dialog
          [open]="dialog() !== null"
          [mode]="dialog() ?? 'pause'"
          [contract]="target()?.contract ?? null"
          [rules]="d.rules"
          [rulesVersion]="d.rulesVersion"
          [busy]="busy()"
          [error]="dialogError()"
          [now]="now"
          (submitted)="runContractAction($event)"
          (dismissed)="dialog.set(null)"
        />

        <bo-invite-dialog
          [open]="inviteOpen()"
          [rules]="d.rules"
          [rulesVersion]="d.rulesVersion"
          [cycle]="d.cycle"
          [pilotFull]="pilotFull()"
          [contracts]="d.contracts"
          [busy]="busy()"
          [error]="dialogError()"
          [now]="now"
          (submitted)="sendInvite($event)"
          (dismissed)="inviteOpen.set(false)"
        />
      }
    </bo-panel-shell>
  `,
  styles: `
    .head { display: flex; align-items: center; gap: 10px; padding: 18px 32px; border-bottom: 1px solid var(--nx-line); flex-wrap: wrap; }
    .titles { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
    .crumb { font-family: var(--nx-font-mono); font-size: 10px; font-weight: 500; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); }
    h1 { margin: 0; display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; font-family: var(--nx-font-display); font-weight: 800; font-size: 26px; letter-spacing: -0.02em; }
    .seats { font-family: var(--nx-font-mono); font-size: 13px; font-weight: 500; letter-spacing: 0; color: var(--nx-text-mute); }
    .spacer { flex: 1; }
    .big { height: 42px; padding: 0 18px; font-size: 14px; }
    .body { flex: 1; padding: 22px 32px 32px; display: flex; flex-direction: column; gap: 18px; min-width: 0; }
    .push { margin-left: auto; flex: none; }
    .skel { height: 520px; border-radius: var(--nx-r-4); background: var(--nx-surface-0); border: 1px solid var(--nx-line); }
    .empty { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 56px 16px; border-radius: var(--nx-r-4); border: 1px dashed var(--nx-line-strong); color: var(--nx-text-dim); text-align: center; }
    .empty p { margin: 6px 0 0; font-family: var(--nx-font-display); font-weight: 600; font-size: 15px; color: var(--nx-text); }
    .empty span { font-size: 12.5px; max-width: 420px; }
    .empty .bo-mini-btn { margin-top: 8px; }
    .foot { display: flex; justify-content: space-between; align-items: center; gap: 16px; flex-wrap: wrap; font-size: 13px; color: var(--nx-text-dim); }
    .pager { display: flex; align-items: center; gap: 8px; }
    .toast { position: fixed; right: 24px; bottom: 24px; z-index: 50; display: flex; align-items: center; gap: 8px; padding: 12px 16px; border-radius: var(--nx-r-3); background: var(--nx-surface-1); border: 1px solid rgba(43, 209, 126, 0.4); font-family: var(--nx-font-display); font-weight: 600; font-size: 13px; box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5); }
    @media (max-width: 760px) {
      .head, .body { padding-left: 16px; padding-right: 16px; }
    }
  `,
})
export class PanelEmbaixadoresComponent {
  private readonly repo = inject(SquadProgramRepository);
  private readonly auth = inject(AuthService);
  private readonly badges = inject(SquadBadgesService);
  private toastTimer: ReturnType<typeof setTimeout> | undefined;

  protected readonly now = new Date();
  protected readonly recalculating = scoreRecalculating(this.now);
  protected readonly pageSize = PAGE_SIZE;

  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly loadError = signal('');
  protected readonly data = signal<ProgramState | null>(null);
  protected readonly period = signal<AmbPeriod>('pilot');
  protected readonly filters = signal<Filters>({
    tab: 'all',
    search: '',
    cities: [],
    statuses: [...DEFAULT_STATUS_FILTER],
    sort: 'roi',
  });
  protected readonly page = signal(0);

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly dialogError = signal<string | null>(null);
  protected readonly toast = signal<string | null>(null);
  protected readonly dialog = signal<ContractDialogMode | null>(null);
  protected readonly target = signal<AmbassadorRow | null>(null);
  protected readonly inviteOpen = signal(false);

  private readonly roles = computed(() => new Set(this.auth.roles()));
  /** Admin e Growth editam; Financeiro (e o resto) só lê. */
  protected readonly canEdit = computed(() => this.auth.isSuperAdmin() || ['admin', 'growth'].some((r) => this.roles().has(r)));

  protected readonly rows = computed(() => {
    const d = this.data();
    return d ? buildRows({ ...d, period: this.period(), now: this.now }) : [];
  });
  protected readonly counts = computed(() => tabCounts(this.rows()));
  protected readonly live = computed(() => this.counts().all);
  protected readonly cities = computed(() => citiesOf(this.rows()));
  protected readonly filtered = computed(() => sortRows(applyFilters(this.rows(), this.filters()), this.filters().sort));
  protected readonly pageRows = computed(() => this.filtered().slice(this.page() * PAGE_SIZE, (this.page() + 1) * PAGE_SIZE));
  protected readonly pilotFull = computed(() => {
    const d = this.data();
    return d ? freeSeats(d.cycle, this.live(), d.outstandingInvites) <= 0 : false;
  });

  constructor() {
    void this.reload();
    inject(DestroyRef).onDestroy(() => clearTimeout(this.toastTimer));
  }

  async reload(silent = false): Promise<void> {
    try {
      const d = await this.repo.load();
      this.data.set(d);
      this.state.set('ready');
      this.badges.setActiveContracts(d.contracts.filter((c) => c.state !== 'ended').length);
    } catch (error) {
      this.loadError.set(callableErrorMessage(error));
      this.state.set('error');
    }
  }

  protected setFilters(f: Filters): void {
    this.filters.set(f);
    this.page.set(0);
  }

  protected setPeriod(p: AmbPeriod): void {
    this.period.set(p);
    this.page.set(0);
  }

  protected exportCsv(): void {
    downloadText(`embaixadores-squad-${this.period()}.csv`, ambassadorsCsv(this.filtered()));
  }

  protected openInvite(): void {
    this.dialogError.set(null);
    this.inviteOpen.set(true);
  }

  protected onAction(kind: RowAction, row: AmbassadorRow): void {
    if (kind === 'copy') {
      void navigator.clipboard
        ?.writeText(row.contract.code)
        .then(() => this.showToast(`Código ${row.contract.code} copiado`))
        .catch(() => this.error.set('Não deu para copiar o código.'));
      return;
    }
    if (kind === 'resume') {
      void this.run(row, { action: 'resume' }, `${row.contract.name} voltou a ativo`);
      return;
    }
    this.dialogError.set(null);
    this.target.set(row);
    this.dialog.set(kind);
  }

  protected async runContractAction(input: ContractActionInput): Promise<void> {
    const row = this.target();
    if (!row) return;
    const name = row.contract.name;
    const done =
      input.action === 'changeTier'
        ? `Aditivo enviado a ${name} · aguardando aceite no app`
        : input.action === 'pause'
          ? `${name} pausado${input.until ? ` até ${dayMonthOfKey(input.until)}` : ''}`
          : input.action === 'end'
            ? input.effectiveDate === spDateKey(this.now)
              ? `Contrato de ${name} encerrado`
              : `Contrato de ${name} encerra em ${dayMonthOfKey(input.effectiveDate)}`
            : '';
    if (await this.run(row, input, done)) this.dialog.set(null);
  }

  protected async sendInvite(input: SendInviteInput): Promise<void> {
    this.busy.set(true);
    this.dialogError.set(null);
    try {
      const out = await this.repo.sendInvite(input);
      this.inviteOpen.set(false);
      this.showToast(
        out.status === 'scheduled' && out.scheduledFor
          ? `Convite agendado para ${dayMonthOfKey(out.scheduledFor)}`
          : 'Convite enviado · acompanhe em Candidaturas',
      );
      await this.reload(true);
    } catch (error) {
      this.dialogError.set(errorText(error));
    } finally {
      this.busy.set(false);
    }
  }

  private async run(row: AmbassadorRow, input: ContractActionInput, done: string): Promise<boolean> {
    this.busy.set(true);
    this.dialogError.set(null);
    try {
      await this.repo.updateContract(row.contract.uid, input);
      this.showToast(done);
      await this.reload(true);
      return true;
    } catch (error) {
      if (this.dialog()) this.dialogError.set(errorText(error));
      else this.error.set(errorText(error));
      return false;
    } finally {
      this.busy.set(false);
    }
  }

  private showToast(text: string): void {
    clearTimeout(this.toastTimer);
    this.toast.set(text);
    this.toastTimer = setTimeout(() => this.toast.set(null), 4000);
  }
}
