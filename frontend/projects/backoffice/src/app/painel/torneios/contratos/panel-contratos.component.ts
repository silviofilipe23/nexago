import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';
import { TournamentBadgesService } from '../../data/tournament-badges.service';
import { SquadKpiComponent } from '../../squad/ui/squad-kpi.component';
import { IconComponent } from '../../ui/icon.component';
import { PanelShellComponent } from '../../ui/panel-shell.component';
import { brl, saoPauloDate } from '../planos/data/tournament-plans';
import { saveErrorText } from '../planos/data/save-errors';
import {
  CONTRACT_TABS,
  STATUS_DONE,
  dayLabel,
  inTab,
  isOpen,
  matchesSearch,
  nextStep,
  sortByEvent,
  tabCounts,
  tabOf,
  type ContractStatus,
  type ContractTab,
  type PlanContract,
} from './data/plan-contracts';
import { CONTRACTS_CAP, PlanContractsRepository } from './data/plan-contracts.repository';
import { ContractStatusDialogComponent } from './ui/contract-status-dialog.component';
import { ContractsTableComponent, type ContractRowAction } from './ui/contracts-table.component';

type LoadState = 'loading' | 'ok' | 'error';

/**
 * Torneios › Contratos: a fila dos planos pedidos pelos organizadores (portal › Planos &
 * Sponsors). Sem cobrança online: quem atende marca sinal e saldo à mão quando o Pix cai.
 */
@Component({
  selector: 'bo-panel-contratos',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ContractStatusDialogComponent, ContractsTableComponent, IconComponent, PanelShellComponent, SquadKpiComponent],
  template: `
    <bo-panel-shell>
      <header class="head">
        <div class="titles">
          <div class="crumb">Torneios · planos pedidos pelos organizadores</div>
          <div class="title-row">
            <h1>Contratos de plano</h1>
            @if (state() === 'ok') { <span class="count-pill">{{ openCount() }} em aberto</span> }
          </div>
        </div>
        <div class="spacer"></div>
        <label class="search">
          <bo-icon name="search" [size]="14" />
          <input type="search" placeholder="Evento, organizador, cidade ou plano" aria-label="Buscar contratos"
            [value]="q()" (input)="setQuery($event)" />
        </label>
        <button type="button" class="bo-mini-btn" [disabled]="state() === 'loading'" (click)="load()">
          <bo-icon name="history" [size]="13" /> Atualizar
        </button>
      </header>

      <div class="tabs" role="tablist">
        @for (t of tabs; track t.id) {
          <button type="button" role="tab" [class.active]="tab() === t.id" [attr.aria-selected]="tab() === t.id" (click)="setTab(t.id)">
            {{ t.label }} <span class="tab-count">{{ counts()[t.id] }}</span>
          </button>
        }
      </div>

      <div class="body">
        @if (toast(); as t) { <div class="bo-feedback" role="status"><bo-icon name="check" [size]="15" /><span>{{ t }}</span></div> }
        @if (state() === 'error') {
          <div class="bo-alert" role="alert"><bo-icon name="alert" [size]="16" /><span>{{ loadError() }}</span>
            <button type="button" class="bo-mini-btn push" (click)="load()">Tentar de novo</button></div>
        }

        @if (state() === 'ok') {
          <div class="kpis">
            <bo-squad-kpi label="Aguardando sinal" [value]="String(requested().length)" [hint]="requestedHint()" />
            <bo-squad-kpi label="Saldo a receber" [value]="brl(balanceDue())" [hint]="balanceHint()" />
            <bo-squad-kpi label="Logos em análise" [value]="String(logosTotal())" [hint]="logosHint()" />
            <bo-squad-kpi label="Próximo evento" [value]="nextEvent() ? day(nextEvent()!.startDate) : '—'" [hint]="nextEvent() ? nextEvent()!.tournamentName : 'Nenhum contrato em aberto'" />
          </div>
          <p class="notice">
            <bo-icon name="cash" [size]="14" />
            Sem cobrança online por enquanto: combine o Pix com o organizador e marque o sinal e o saldo aqui quando o valor cair.
          </p>
        }
        @if (capped()) { <p class="notice">Mostrando os {{ cap }} contratos com evento mais próximo.</p> }

        <bo-contracts-table [rows]="rows()" [today]="today" [logos]="logos()" [loading]="state() === 'loading'"
          [emptyLabel]="emptyLabel()" (action)="onRow($event.contract, $event.action)" />
      </div>
    </bo-panel-shell>

    <bo-contract-status-dialog [contract]="target()" [kind]="targetKind()" [today]="today" [busy]="busy()" [error]="dialogError()"
      (confirmed)="confirm($event)" (dismissed)="closeDialog()" />
  `,
  styles: `
    :host { display: block; }
    .head { display: flex; align-items: center; gap: 10px; padding: 18px 32px; border-bottom: 1px solid var(--nx-line); flex-wrap: wrap; }
    .titles { display: flex; flex-direction: column; gap: 4px; }
    .crumb { font-family: var(--nx-font-mono); font-size: 10px; font-weight: 500; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); }
    .title-row { display: flex; align-items: center; gap: 10px; }
    h1 { margin: 0; font-family: var(--nx-font-display); font-weight: 800; font-size: 21px; letter-spacing: -0.02em; }
    .count-pill { height: 22px; padding: 0 9px; display: inline-flex; align-items: center; border: 1px solid var(--nx-line-strong); border-radius: var(--nx-r-pill); font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: var(--nx-text-mute); }
    .spacer { flex: 1; }
    .search { display: flex; align-items: center; gap: 8px; height: 34px; width: 300px; max-width: 100%; padding: 0 12px; border: 1px solid var(--nx-line-strong); border-radius: var(--nx-r-2); background: var(--nx-surface-1); color: var(--nx-text-dim); }
    .search:focus-within { border-color: var(--nx-orange-500); }
    .search input { flex: 1; min-width: 0; border: none; background: none; color: var(--nx-text); font: inherit; font-size: 12.5px; outline: none; }
    .tabs { display: flex; gap: 6px; padding: 10px 32px 0; overflow-x: auto; }
    .tabs button { display: inline-flex; align-items: center; gap: 7px; height: 40px; padding: 0 12px; background: none; border: none; border-bottom: 2px solid transparent; color: var(--nx-text-mute); font-family: var(--nx-font-display); font-weight: 600; font-size: 13.5px; cursor: pointer; white-space: nowrap; }
    .tabs button.active { color: var(--nx-text); border-bottom-color: var(--nx-orange-500); font-weight: 700; }
    .tab-count { font-family: var(--nx-font-mono); font-size: 10px; color: var(--nx-text-dim); }
    .tabs button.active .tab-count { color: var(--nx-orange-500); }
    .body { padding: 16px 32px 40px; display: flex; flex-direction: column; gap: 14px; border-top: 1px solid var(--nx-line); }
    .push { margin-left: auto; flex: none; }
    .kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; }
    .notice { margin: 0; display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--nx-text-dim); }
    @media (max-width: 1100px) { .kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  `,
})
export class PanelContratosComponent {
  private readonly repo = inject(PlanContractsRepository);
  private readonly badges = inject(TournamentBadgesService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly String = String;
  protected readonly brl = brl;
  protected readonly tabs = CONTRACT_TABS;
  protected readonly cap = CONTRACTS_CAP;
  protected readonly today = saoPauloDate(new Date());

  protected readonly state = signal<LoadState>('loading');
  protected readonly loadError = signal('');
  protected readonly all = signal<PlanContract[]>([]);
  protected readonly logos = signal<ReadonlyMap<string, number>>(new Map());
  protected readonly toast = signal<string | null>(
    (this.router.getCurrentNavigation()?.extras.state?.['toast'] as string | undefined) ?? null,
  );

  protected readonly target = signal<PlanContract | null>(null);
  protected readonly targetKind = signal<'next' | 'cancel'>('next');
  protected readonly busy = signal(false);
  protected readonly dialogError = signal<string | null>(null);

  private readonly params = toSignal(this.route.queryParamMap.pipe(map((p) => ({ status: p.get('status'), q: p.get('q') }))), {
    initialValue: { status: null, q: null },
  });
  protected readonly tab = computed<ContractTab>(() => tabOf(this.params().status));
  protected readonly q = computed(() => this.params().q ?? '');

  private readonly searched = computed(() => this.all().filter((c) => matchesSearch(c, this.q())));
  protected readonly counts = computed(() => tabCounts(this.searched()));
  protected readonly rows = computed(() => sortByEvent(this.searched().filter((c) => inTab(c, this.tab()))));
  protected readonly capped = computed(() => this.all().length >= CONTRACTS_CAP);
  protected readonly openCount = computed(() => this.all().filter((c) => isOpen(c.status)).length);
  protected readonly emptyLabel = computed(() =>
    this.q().trim() ? 'Nenhum contrato encontrado com essa busca' : this.tab() === 'abertos' ? 'Nenhum contrato em aberto' : 'Nenhum contrato aqui',
  );

  protected readonly requested = computed(() => this.all().filter((c) => c.status === 'requested'));
  protected readonly requestedHint = computed(() => {
    const sum = this.requested().reduce((s, c) => s + c.depositCents, 0);
    return this.requested().length ? `${brl(sum)} de sinal a confirmar` : 'Nenhum pedido novo';
  });
  private readonly depositPaid = computed(() => this.all().filter((c) => c.status === 'deposit_paid'));
  protected readonly balanceDue = computed(() => this.depositPaid().reduce((s, c) => s + c.balanceCents, 0));
  protected readonly balanceHint = computed(() => {
    const late = this.depositPaid().filter((c) => c.balanceCents > 0 && c.balanceDueDate < this.today).length;
    const n = this.depositPaid().length;
    if (n === 0) return 'Nenhum saldo pendente';
    return `${n} ${n === 1 ? 'contrato' : 'contratos'}${late ? ` · ${late} ${late === 1 ? 'vencido' : 'vencidos'}` : ''}`;
  });
  protected readonly logosTotal = computed(() => [...this.logos().values()].reduce((s, n) => s + n, 0));
  protected readonly logosHint = computed(() => {
    const n = this.logos().size;
    return n ? `Em ${n} ${n === 1 ? 'evento' : 'eventos'}` : 'Nada para aprovar';
  });
  protected readonly nextEvent = computed(() =>
    sortByEvent(this.all().filter((c) => isOpen(c.status) && c.endDate >= this.today))[0] ?? null,
  );

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.state.set('loading');
    try {
      const list = await this.repo.list();
      this.all.set(list);
      this.state.set('ok');
      this.badges.setRequestedContracts(list.filter((c) => c.status === 'requested').length);
      try {
        this.logos.set(await this.repo.logosInReview(list));
      } catch {
        // A contagem de logos é um extra da fila: sem ela, o detalhe de cada contrato ainda mostra tudo.
        this.logos.set(new Map());
      }
    } catch (error) {
      this.loadError.set(saveErrorText(error) || 'Não foi possível carregar os contratos.');
      this.state.set('error');
    }
  }

  protected setTab(id: ContractTab): void {
    this.navigate({ status: id === 'abertos' ? null : id });
  }

  protected setQuery(e: Event): void {
    this.navigate({ q: (e.target as HTMLInputElement).value || null });
  }

  private navigate(patch: { status?: string | null; q?: string | null }): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: patch, queryParamsHandling: 'merge', replaceUrl: true });
  }

  protected onRow(c: PlanContract, action: ContractRowAction): void {
    if (action === 'ver') {
      void this.router.navigate(['/painel/torneios/contratos', c.id]);
      return;
    }
    this.dialogError.set(null);
    this.targetKind.set(action === 'cancelar' ? 'cancel' : 'next');
    this.target.set(c);
  }

  protected closeDialog(): void {
    if (!this.busy()) this.target.set(null);
  }

  protected async confirm(note: string | null): Promise<void> {
    const c = this.target();
    if (!c) return;
    const cancel = this.targetKind() === 'cancel';
    const to: ContractStatus | undefined = cancel ? 'cancelled' : nextStep(c, this.today)?.to;
    if (!to) return;
    this.busy.set(true);
    this.dialogError.set(null);
    try {
      await this.repo.setStatus({ tournamentId: c.id, from: c.status, to, note });
      this.target.set(null);
      this.toast.set(`${c.tournamentName}: ${STATUS_DONE[to]}`);
      await this.load();
    } catch (error) {
      this.dialogError.set(saveErrorText(error));
    } finally {
      this.busy.set(false);
    }
  }

  protected day(d: string): string {
    return dayLabel(d);
  }
}
