import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal, viewChild } from '@angular/core';
import { AuthService } from '../../../auth/auth.service';
import { callableErrorMessage } from '../../data/callable-error';
import { SquadKpiComponent } from '../../squad/ui/squad-kpi.component';
import { NumFieldComponent } from '../../squad/niveis-regras/ui/num-field.component';
import { isVersionConflict, saveErrorText } from '../../torneios/planos/data/save-errors';
import { ConfirmDialogComponent } from '../../ui/confirm-dialog.component';
import { IconComponent } from '../../ui/icon.component';
import { PanelCardComponent } from '../../ui/panel-card.component';
import { PanelShellComponent } from '../../ui/panel-shell.component';
import { PillComponent } from '../../ui/pill.component';
import {
  DEFAULT_BILLING_MODEL,
  bookingsLabel,
  brlCents,
  cloneModel,
  computeMonthBilling,
  monthKeyOf,
  monthLabel,
  monthLongLabel,
  pctLabel,
  shiftMonth,
  type MonthBilling,
} from './data/billing-model';
import {
  BillingModelRepository,
  type BillingOverview,
  type BillingVersion,
  type PreviewArena,
} from './data/billing-model.repository';
import { BillingModelCardComponent, type ModelSaveRequest } from './ui/model-card.component';

interface PreviewRow {
  arena: PreviewArena;
  billing: MonthBilling;
}

const PLAN_LABEL: Record<string, string> = { starter: 'Starter', pro: 'Pro', elite: 'Elite', parceiro: 'Elite' };

/**
 * Arenas › Modelo comercial: as regras de cobrança das arenas para depois do período gratuito de
 * implantação — faixas de reservas pagas no mês com mensalidade e comissão, vigência e meses
 * grátis da arena nova —, um simulador e a prévia por arena com as reservas pagas reais do mês.
 * Nada aqui cobra: a cobrança de hoje (taxa 8/6/5% por plano) segue igual.
 */
@Component({
  selector: 'bo-panel-modelo-comercial',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(window:beforeunload)': 'onBeforeUnload($event)' },
  imports: [
    PanelShellComponent,
    PanelCardComponent,
    PillComponent,
    IconComponent,
    SquadKpiComponent,
    NumFieldComponent,
    ConfirmDialogComponent,
    BillingModelCardComponent,
  ],
  template: `
    <bo-panel-shell>
      <header class="head">
        <div class="titles">
          <div class="crumb">Arenas · depois da implantação</div>
          <h1>Modelo comercial</h1>
          @if (overview(); as o) {
            <span class="sub">
              {{ o.saved ? 'v' + o.version + ' · cobra a partir de ' + monthLabel(o.model.effectiveFrom) : 'Ainda não definido' }}
            </span>
          }
        </div>
        <div class="spacer"></div>
        <button type="button" class="bo-mini-btn" [disabled]="state() === 'loading'" (click)="load()"><bo-icon name="swap" [size]="13" /> Atualizar</button>
      </header>

      <div class="body">
        @switch (state()) {
          @case ('loading') {
            <div class="kpis" aria-busy="true" aria-label="Carregando modelo comercial">
              @for (s of [0, 1, 2, 3]; track s) { <div class="skel kpi"></div> }
            </div>
            <div class="skel card"></div>
            <div class="skel table"></div>
          }
          @case ('error') {
            <div class="bo-alert" role="alert">
              <bo-icon name="alert" [size]="16" />
              <span>{{ loadError() }}</span>
              <button type="button" class="bo-mini-btn push" (click)="load()">Tentar de novo</button>
            </div>
          }
          @default {
            @if (overview(); as o) {
              @if (!o.saved) {
                <div class="example" role="note">
                  <bo-icon name="alert" [size]="16" />
                  <span>
                    <b>Valores de exemplo.</b> Quantidades, mensalidades e percentuais ainda não foram definidos: os números
                    abaixo partem da tabela de hoje (Starter R$ 99, taxa 8/6/5%) só para a tela ter o que mostrar.
                  </span>
                </div>
              }

              <bo-billing-model-card
                [model]="o.model"
                [saved]="o.saved"
                [version]="o.version"
                [updatedAt]="o.updatedAt"
                [updatedBy]="o.updatedBy"
                [canEdit]="canEdit()"
                [saving]="saving()"
                [error]="saveError()"
                (save)="save($event)"
              />

              <bo-panel-card [kicker]="usingDraft() ? 'Com o rascunho em edição' : o.saved ? 'Com o modelo salvo' : 'Com os valores de exemplo'" title="Simulador">
                <div class="sim">
                  <div class="f">
                    <span class="lbl">Reservas pagas no mês</span>
                    <bo-num-field label="Reservas pagas no mês" [value]="simBookings()" (valueChange)="simBookings.set(asCount($event))" />
                  </div>
                  <div class="f">
                    <span class="lbl">Valor médio da reserva</span>
                    <bo-num-field label="Valor médio da reserva" prefix="R$" [value]="simTicket()" (valueChange)="simTicket.set(asMoney($event))" />
                  </div>
                  <div class="sim-out">
                    <div class="sim-total">{{ brl(sim().totalCents) }}<span>/mês para a NexaGO</span></div>
                    <div class="sim-line">
                      Faixa {{ sim().tierIndex + 1 }} · {{ sim().monthlyFeeCents ? 'mensalidade ' + brl(sim().monthlyFeeCents) + ' + ' : '' }}{{ pct(sim().tier.commissionPercent) }} de {{ brl(sim().commissionBaseCents) }}
                    </div>
                    @if (sim().next; as n) {
                      <div class="sim-next">
                        Faltam {{ bookings(n.bookingsMissing) }} para a faixa {{ n.tierIndex + 1 }}
                        ({{ n.monthlyFeeCents ? brl(n.monthlyFeeCents) + ' + ' : 'sem mensalidade, ' }}{{ pct(n.commissionPercent) }}).
                      </div>
                    }
                  </div>
                </div>
              </bo-panel-card>

              <div class="kpis">
                <bo-squad-kpi label="Arenas com conta" [value]="String(o.arenas.length)" [hint]="activeCount() + ' com reserva paga em ' + monthLabel(month())" />
                <bo-squad-kpi label="Reservas pagas" [value]="String(totals().bookings)" [hint]="'Avulsas pagas pela NexaGO · ' + monthLabel(month())" />
                <bo-squad-kpi label="Pelo modelo" [value]="brl(totals().model)" [hint]="totals().billable ? 'Seria cobrado no mês' : 'Simulação: mês de implantação'" />
                <bo-squad-kpi label="Cobrado hoje" [value]="brl(totals().current)" hint="Taxa por reserva atual (8/6/5%)" />
              </div>

              <bo-panel-card pad="sm" title="Prévia por arena">
                <div card-actions class="month-nav">
                  <button type="button" class="bo-ghost-btn" aria-label="Mês anterior" [disabled]="monthLoading()" (click)="goMonth(-1)"><bo-icon name="chevron-left" [size]="14" /></button>
                  <span class="month-label">{{ monthLong(month()) }}</span>
                  <button type="button" class="bo-ghost-btn" aria-label="Próximo mês" [disabled]="monthLoading() || month() >= thisMonth" (click)="goMonth(1)"><bo-icon name="chevron-right" [size]="14" /></button>
                </div>

                <div class="t-head">
                  <span>Arena</span><span class="r">Reservas</span><span class="r">Pago online</span><span>Faixa</span><span class="r">Mensalidade</span><span class="r">Comissão</span><span class="r">Pelo modelo</span><span class="r">Cobrado hoje</span>
                </div>
                <div class="t-body" [class.busy]="monthLoading()">
                  @for (r of rows(); track r.arena.id) {
                    <div class="t-row">
                      <span class="main">
                        <span class="name">{{ r.arena.name }}</span>
                        <span class="meta">
                          {{ r.arena.city || 'Sem cidade' }}{{ planLabel(r.arena) }}
                          @if (!r.billing.billable) {
                            · <bo-pill [tone]="r.billing.freeReason === 'new_arena' ? 'green' : 'dim'">{{ freeLabel(r.billing) }}</bo-pill>
                          }
                        </span>
                      </span>
                      <span class="mono r">{{ r.arena.activity.paidBookings }}</span>
                      <span class="mono r" [class.dim]="!r.billing.commissionBaseCents">{{ brl(r.billing.commissionBaseCents) }}</span>
                      <span class="tier">
                        <bo-pill [tone]="r.billing.tierIndex === 0 ? 'yellow' : 'orange'">Faixa {{ r.billing.tierIndex + 1 }} · {{ pct(r.billing.tier.commissionPercent) }}</bo-pill>
                        @if (r.billing.next; as n) { <span class="until">faltam {{ n.bookingsMissing }} p/ faixa {{ n.tierIndex + 1 }}</span> }
                      </span>
                      <span class="mono r" [class.dim]="!r.billing.monthlyFeeCents">{{ r.billing.monthlyFeeCents ? brl(r.billing.monthlyFeeCents) : '—' }}</span>
                      <span class="mono r" [class.dim]="!r.billing.commissionCents">{{ brl(r.billing.commissionCents) }}</span>
                      <span class="mono r strong"><span class="tag">pelo modelo </span>{{ brl(r.billing.totalCents) }}</span>
                      <span class="cur r">
                        <span class="mono"><span class="tag">hoje </span>{{ brl(r.arena.activity.currentFeeCents) }}</span>
                        <span class="delta" [class.up]="r.billing.deltaVsCurrentCents > 0" [class.down]="r.billing.deltaVsCurrentCents < 0">{{ deltaLabel(r.billing.deltaVsCurrentCents) }}</span>
                      </span>
                    </div>
                  } @empty {
                    <p class="status">Nenhuma arena com conta neste projeto.</p>
                  }
                </div>
                @if (monthError(); as e) {
                  <div class="bo-alert" role="alert"><bo-icon name="alert" [size]="16" /><span>{{ e }}</span></div>
                }
                <p class="legend">
                  Reservas = aluguéis avulsos pagos pela NexaGO (app ou site) creditados na carteira da arena no mês; rateio
                  entre jogadores conta uma reserva. O valor pago inclui os planos de horário, que entram na comissão mas não na
                  contagem. Aulas e clubinho ficam fora (têm taxa própria). Pré-cadastros não aparecem: não têm carteira.
                  “Cobrado hoje” é a taxa por reserva do modelo atual nas mesmas linhas.
                </p>
              </bo-panel-card>

              <bo-panel-card pad="sm" title="Histórico de versões">
                @if (versions(); as list) {
                  @for (v of list; track v.version) {
                    <div class="v-row">
                      <span class="v-num">v{{ v.version }}</span>
                      <span class="v-main">
                        <span class="v-title">{{ v.changes.length ? v.changes.join(' · ') : (v.note || 'Sem alterações registradas') }}</span>
                        <span class="v-meta">
                          {{ v.createdAt ? v.createdAt.toLocaleDateString('pt-BR') : '—' }}{{ v.createdBy ? ' · ' + v.createdBy : '' }}{{ v.note && v.changes.length ? ' · ' + v.note : '' }}{{ v.restoredFrom ? ' · restaurada da v' + v.restoredFrom : '' }}
                          · {{ summary(v) }}
                        </span>
                      </span>
                      @if (canEdit() && v.version !== o.version) {
                        <button type="button" class="bo-mini-btn" (click)="restore(v)"><bo-icon name="history" [size]="13" /> Restaurar</button>
                      } @else if (v.version === o.version) {
                        <bo-pill tone="green">Vigente</bo-pill>
                      }
                    </div>
                  } @empty {
                    <p class="status">Nenhuma versão salva ainda. A primeira gravação registra os valores de exemplo como v1.</p>
                  }
                } @else if (versionsError(); as e) {
                  <p class="status">{{ e }}</p>
                } @else {
                  <p class="status">Carregando histórico…</p>
                }
              </bo-panel-card>
            }
          }
        }
      </div>

      @if (toast(); as t) {
        <div class="toast" role="status"><bo-icon name="check" [size]="15" /> {{ t }}</div>
      }

      <bo-confirm-dialog [open]="leaveOpen()" title="Sair sem salvar?" description="As alterações no modelo serão descartadas." confirmLabel="Sair sem salvar" tone="danger" (confirmed)="resolveLeave(true)" (dismissed)="resolveLeave(false)" />
    </bo-panel-shell>
  `,
  styles: `
    .head { display: flex; align-items: center; gap: 10px; padding: 18px 32px; border-bottom: 1px solid var(--nx-line); flex-wrap: wrap; }
    .titles { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
    .crumb { font-family: var(--nx-font-mono); font-size: 10px; font-weight: 500; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); }
    h1 { margin: 0; font-family: var(--nx-font-display); font-weight: 800; font-size: 21px; letter-spacing: -0.02em; }
    .sub { font-family: var(--nx-font-mono); font-size: 12px; color: var(--nx-text-dim); }
    .spacer { flex: 1; }
    .body { flex: 1; padding: 24px 32px 40px; display: flex; flex-direction: column; gap: 16px; min-width: 0; }
    .push { margin-left: auto; flex: none; }
    .example { display: flex; align-items: flex-start; gap: 10px; padding: 12px 14px; border-radius: var(--nx-r-3); border: 1px solid rgba(255, 193, 7, 0.35); background: rgba(255, 193, 7, 0.07); font-size: 12.5px; line-height: 1.5; color: var(--nx-text-mute); }
    .example bo-icon { flex: none; color: var(--nx-pending); margin-top: 1px; }
    .example b { color: var(--nx-text); }
    .kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
    .sim { display: grid; grid-template-columns: 180px 180px minmax(0, 1fr); gap: 16px; align-items: end; }
    .f { display: flex; flex-direction: column; gap: 7px; min-width: 0; }
    .lbl { font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); }
    .sim-out { padding: 10px 14px; border-radius: var(--nx-r-2); background: var(--nx-surface-1); display: flex; flex-direction: column; gap: 3px; min-width: 0; }
    .sim-total { font-family: var(--nx-font-display); font-weight: 800; font-size: 22px; letter-spacing: -0.02em; }
    .sim-total span { margin-left: 6px; font-family: var(--nx-font-ui); font-weight: 500; font-size: 12px; color: var(--nx-text-dim); letter-spacing: 0; }
    .sim-line { font-size: 12px; color: var(--nx-text-mute); }
    .sim-next { font-size: 11.5px; color: var(--nx-text-dim); }
    .month-nav { display: flex; align-items: center; gap: 6px; }
    .month-label { min-width: 150px; text-align: center; font-family: var(--nx-font-display); font-weight: 600; font-size: 13px; }
    .t-head, .t-row { display: grid; grid-template-columns: minmax(0, 1.6fr) 74px 110px 170px 100px 100px 110px 120px; gap: 12px; align-items: center; }
    .t-head { padding: 4px 10px 10px; border-bottom: 1px solid var(--nx-line); }
    .t-head span { font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: var(--nx-text-dim); }
    .t-body.busy { opacity: 0.5; }
    .t-row { padding: 12px 10px; border-bottom: 1px solid var(--nx-line); }
    .t-row:last-child { border-bottom: none; }
    .r { text-align: right; }
    .main { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
    .name { font-family: var(--nx-font-display); font-weight: 600; font-size: 13.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .meta { font-size: 11.5px; color: var(--nx-text-dim); display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
    .mono { font-family: var(--nx-font-mono); font-size: 12.5px; }
    .strong { font-weight: 700; color: var(--nx-text); }
    .dim { color: var(--nx-text-dim); }
    .tier { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; min-width: 0; }
    .until { font-size: 10.5px; color: var(--nx-text-dim); }
    .cur { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
    .delta { font-family: var(--nx-font-mono); font-size: 10.5px; color: var(--nx-text-dim); }
    .delta.up { color: var(--nx-win); }
    .delta.down { color: var(--nx-live); }
    .tag { display: none; font-family: var(--nx-font-ui); font-weight: 400; font-size: 11px; color: var(--nx-text-dim); }
    .status { margin: 16px 10px 4px; font-size: 12.5px; color: var(--nx-text-dim); }
    .legend { margin: 14px 10px 0; font-size: 11.5px; line-height: 1.45; color: var(--nx-text-dim); }
    .bo-alert { margin-top: 12px; }
    .v-row { display: flex; align-items: center; gap: 14px; padding: 10px; border-bottom: 1px solid var(--nx-line); }
    .v-row:last-child { border-bottom: none; }
    .v-num { flex: none; width: 36px; font-family: var(--nx-font-mono); font-weight: 700; font-size: 12.5px; }
    .v-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .v-title { font-family: var(--nx-font-display); font-weight: 600; font-size: 13px; }
    .v-meta { font-size: 11.5px; color: var(--nx-text-dim); }
    .skel { border-radius: var(--nx-r-4); background: var(--nx-surface-0); border: 1px solid var(--nx-line); }
    .skel.kpi { height: 86px; border-radius: var(--nx-r-3); }
    .skel.card { height: 260px; }
    .skel.table { height: 320px; }
    .toast { position: fixed; left: 50%; top: 24px; transform: translateX(-50%); z-index: 50; display: flex; align-items: center; gap: 8px; padding: 12px 16px; border-radius: var(--nx-r-3); background: var(--nx-surface-1); border: 1px solid rgba(43, 209, 126, 0.4); font-family: var(--nx-font-display); font-weight: 600; font-size: 13px; box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5); }
    .toast bo-icon { color: var(--nx-win); }
    @media (max-width: 1280px) {
      .kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .t-head { display: none; }
      .t-row { grid-template-columns: minmax(0, 1fr) auto; row-gap: 8px; }
      .t-row > :nth-child(2), .t-row > :nth-child(3), .t-row > :nth-child(5), .t-row > :nth-child(6) { display: none; }
      .t-row > :nth-child(4) { grid-column: 1; }
      .t-row > :nth-child(7) { grid-column: 2; grid-row: 1; }
      .t-row > :nth-child(8) { grid-column: 2; grid-row: 2; }
      .tag { display: inline; }
      .sim { grid-template-columns: 1fr 1fr; }
      .sim-out { grid-column: 1 / -1; }
    }
    @media (max-width: 760px) {
      .head, .body { padding-left: 16px; padding-right: 16px; }
      .kpis, .sim { grid-template-columns: minmax(0, 1fr); }
    }
  `,
})
export class PanelModeloComercialComponent {
  private readonly repo = inject(BillingModelRepository);
  private readonly auth = inject(AuthService);
  private toastTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly card = viewChild(BillingModelCardComponent);

  protected readonly String = String;
  protected readonly brl = brlCents;
  protected readonly pct = pctLabel;
  protected readonly bookings = bookingsLabel;
  protected readonly monthLabel = monthLabel;
  protected readonly monthLong = monthLongLabel;
  protected readonly thisMonth = monthKeyOf(new Date());

  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly loadError = signal('');
  protected readonly overview = signal<BillingOverview | null>(null);
  protected readonly month = signal(this.thisMonth);
  protected readonly monthLoading = signal(false);
  protected readonly monthError = signal<string | null>(null);
  protected readonly versions = signal<BillingVersion[] | null>(null);
  protected readonly versionsError = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly saveError = signal<string | null>(null);
  protected readonly toast = signal<string | null>(null);
  protected readonly leaveOpen = signal(false);
  private leaveResolver: ((ok: boolean) => void) | null = null;

  protected readonly simBookings = signal(40);
  protected readonly simTicket = signal(120);

  protected readonly canEdit = computed(() => this.auth.isSuperAdmin() || this.auth.roles().includes('admin'));

  /** O rascunho válido em edição manda no simulador e na prévia; fora da edição, o salvo. */
  private readonly working = computed(() => this.card()?.working() ?? this.overview()?.model ?? DEFAULT_BILLING_MODEL);
  protected readonly usingDraft = computed(() => !!this.card()?.editing());

  protected readonly sim = computed(() => {
    const n = this.simBookings();
    return computeMonthBilling(this.working(), this.working().effectiveFrom, {
      paidBookings: n,
      bookingVolumeCents: Math.round(n * this.simTicket() * 100),
      schedulePlanVolumeCents: 0,
      currentFeeCents: 0,
    });
  });

  protected readonly rows = computed<PreviewRow[]>(() => {
    const model = this.working();
    const month = this.month();
    return (this.overview()?.arenas ?? []).map((arena) => ({
      arena,
      billing: computeMonthBilling(model, month, arena.activity, arena.startMonth),
    }));
  });

  protected readonly activeCount = computed(() => this.rows().filter((r) => r.arena.activity.paidBookings > 0).length);

  protected readonly totals = computed(() =>
    this.rows().reduce(
      (acc, r) => ({
        bookings: acc.bookings + r.arena.activity.paidBookings,
        model: acc.model + r.billing.totalCents,
        current: acc.current + r.arena.activity.currentFeeCents,
        billable: acc.billable || r.billing.billable,
      }),
      { bookings: 0, model: 0, current: 0, billable: false },
    ),
  );

  constructor() {
    void this.load();
    inject(DestroyRef).onDestroy(() => clearTimeout(this.toastTimer));
  }

  async load(): Promise<void> {
    this.state.set('loading');
    this.saveError.set(null);
    this.monthError.set(null);
    try {
      this.overview.set(await this.repo.overview(this.month()));
      this.state.set('ready');
      void this.loadVersions();
    } catch (error) {
      this.loadError.set(saveErrorText(error));
      this.state.set('error');
    }
  }

  protected async goMonth(delta: number): Promise<void> {
    const next = shiftMonth(this.month(), delta);
    if (next > this.thisMonth) {
      return;
    }
    this.monthLoading.set(true);
    this.monthError.set(null);
    try {
      const o = await this.repo.overview(next);
      // O modelo salvo pode ter mudado; a edição em curso fica no card.
      this.overview.set(o);
      this.month.set(next);
    } catch (error) {
      this.monthError.set(callableErrorMessage(error));
    } finally {
      this.monthLoading.set(false);
    }
  }

  private async loadVersions(): Promise<void> {
    this.versionsError.set(null);
    try {
      this.versions.set(await this.repo.versions());
    } catch (error) {
      this.versions.set(null);
      this.versionsError.set(`Histórico indisponível: ${callableErrorMessage(error)}`);
    }
  }

  protected async save(req: ModelSaveRequest): Promise<void> {
    const o = this.overview();
    if (!o) {
      return;
    }
    this.saving.set(true);
    this.saveError.set(null);
    try {
      const out = await this.repo.save(req.model, o.version, req.note, req.restoredFrom);
      this.overview.set({ ...o, model: out.model, version: out.version, saved: true, updatedAt: new Date(), updatedBy: this.auth.displayName() });
      this.card()?.finishEdit();
      this.showToast(`Modelo salvo como v${out.version}${out.changes.length ? ' · ' + out.changes.join(', ') : ''}`);
      void this.loadVersions();
    } catch (error) {
      this.saveError.set(saveErrorText(error));
      if (isVersionConflict(error)) {
        const fresh = await this.repo.overview(this.month()).catch(() => null);
        if (fresh) {
          this.overview.set(fresh);
        }
      }
    } finally {
      this.saving.set(false);
    }
  }

  protected restore(v: BillingVersion): void {
    this.card()?.startEdit({ model: cloneModel(v.model), version: v.version });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  protected summary(v: BillingVersion): string {
    const t = v.model.tiers;
    return `${t.length} ${t.length === 1 ? 'faixa' : 'faixas'}, ${pctLabel(t[0].commissionPercent)} → ${pctLabel(t[t.length - 1].commissionPercent)}, início ${monthLabel(v.model.effectiveFrom)}`;
  }

  protected planLabel(a: PreviewArena): string {
    const label = a.planTier ? PLAN_LABEL[a.planTier] : null;
    return label ? ` · plano ${label}${a.planStatus && a.planStatus !== 'active' ? ' (' + a.planStatus + ')' : ''}` : ' · sem plano';
  }

  protected freeLabel(b: MonthBilling): string {
    return b.freeReason === 'new_arena' ? `grátis até ${monthLabel(shiftMonth(b.firstBilledMonth, -1))}` : 'implantação · simulação';
  }

  protected deltaLabel(cents: number): string {
    if (cents === 0) {
      return 'igual';
    }
    return `${cents > 0 ? '+' : '−'}${brlCents(Math.abs(cents))}`;
  }

  protected asCount(v: unknown): number {
    return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0;
  }

  protected asMoney(v: unknown): number {
    return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, v) : 0;
  }

  canLeave(): boolean | Promise<boolean> {
    if (!this.card()?.isDirty()) {
      return true;
    }
    this.leaveOpen.set(true);
    return new Promise<boolean>((resolve) => (this.leaveResolver = resolve));
  }

  protected resolveLeave(ok: boolean): void {
    this.leaveOpen.set(false);
    this.leaveResolver?.(ok);
    this.leaveResolver = null;
  }

  protected onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.card()?.isDirty()) {
      event.preventDefault();
    }
  }

  private showToast(text: string): void {
    clearTimeout(this.toastTimer);
    this.toast.set(text);
    this.toastTimer = setTimeout(() => this.toast.set(null), 4000);
  }
}
