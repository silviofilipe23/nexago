import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../../auth/auth.service';
import { callableErrorMessage } from '../../data/callable-error';
import { downloadText } from '../../loja/pedidos/data/order';
import { IconComponent } from '../../ui/icon.component';
import { PanelCardComponent } from '../../ui/panel-card.component';
import { PanelShellComponent } from '../../ui/panel-shell.component';
import { ORIGIN_LABEL, brl, dayMonthOfKey, type CommissionOrigin } from '../comissoes/data/commission';
import { DEFAULT_SQUAD_RULES } from '../niveis-regras/data/squad-rules';
import { freeSeats } from '../data/squad-program';
import { SquadProgramRepository, type CountedCommission, type SendInviteInput } from '../data/squad-program.repository';
import { cycleProgress, funnelOf, isConversion, originSplit, plural } from '../data/squad-metrics';
import { buildRows, roiLabel } from '../embaixadores/data/ambassador';
import { InviteDialogComponent } from '../ui/invite-dialog.component';
import { SquadFunnelComponent } from '../ui/squad-funnel.component';
import { SquadKpiComponent } from '../ui/squad-kpi.component';
import {
  attentionItems,
  costLines,
  overviewCsv,
  overviewKpis,
  scoreLeaders,
  tierMixLabel,
  tierSummaries,
} from './data/overview';
import { OverviewRepository, type OverviewState } from './data/overview.repository';
import { AttentionCardComponent } from './ui/attention-card.component';
import { CostCardComponent } from '../ui/cost-card.component';
import { CycleStripComponent } from './ui/cycle-strip.component';
import { ScoreLeadersCardComponent } from './ui/score-leaders-card.component';
import { TierRoiCardComponent } from './ui/tier-roi-card.component';

const ORIGINS: CommissionOrigin[] = ['code', 'link', 'qr'];

/** `not-found` cru ("NOT FOUND") é callable que ainda não foi publicada. */
function errorText(error: unknown): string {
  const code = String((error as { code?: unknown })?.code ?? '');
  const message = String((error as { message?: unknown })?.message ?? '');
  if (code.includes('not-found')) {
    return message && message !== 'NOT FOUND' ? message : 'Função ainda não publicada no servidor.';
  }
  return callableErrorMessage(error);
}

/**
 * Squad › Visão geral (tela 01). Só leitura: os números saem das mesmas linhas da tela 02 e cada
 * alerta leva à tela que resolve. A única ação é o convite direto (o mesmo modal da tela 02).
 */
@Component({
  selector: 'bo-panel-visao-geral',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PanelShellComponent,
    PanelCardComponent,
    IconComponent,
    SquadKpiComponent,
    SquadFunnelComponent,
    CycleStripComponent,
    TierRoiCardComponent,
    AttentionCardComponent,
    CostCardComponent,
    ScoreLeadersCardComponent,
    InviteDialogComponent,
  ],
  template: `
    <bo-panel-shell>
      <header class="head">
        <div class="titles">
          <div class="crumb">Squad</div>
          <h1>NexaGO Squad
            @if (progress(); as p) {
              <span class="pill">{{ p.pill }}</span>
            }
          </h1>
        </div>
        <div class="spacer"></div>
        <button type="button" class="bo-mini-btn big" [disabled]="state() !== 'ready'" (click)="exportCsv()">Exportar</button>
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
            <div class="skel" aria-busy="true" aria-label="Carregando a visão geral"></div>
          }
          @case ('error') {
            <div class="bo-alert" role="alert">
              <bo-icon name="alert" [size]="16" />
              <span>{{ loadError() }}</span>
              <button type="button" class="bo-mini-btn push" (click)="reload()">Tentar de novo</button>
            </div>
          }
          @default {
            @if (progress(); as p) {
              <bo-cycle-strip [progress]="p" />
            }

            <div class="kpis">
              <bo-squad-kpi label="Embaixadores ativos" [value]="'' + kpis().live" [hint]="tierMix()" />
              <bo-squad-kpi label="Conversões pagas" [value]="kpis().conversions.toLocaleString('pt-BR')" [delta]="conversionsWeek()" />
              <bo-squad-kpi label="Receita gerada" [value]="money(kpis().revenueCents)" [delta]="revenueWeek()" />
              <bo-squad-kpi label="Custo do programa" [value]="money(kpis().costCents)" hint="comissões + kits" />
              <bo-squad-kpi label="ROI médio" [value]="roi()" hint="receita ÷ custo" />
            </div>

            <div class="grid two">
              <bo-tier-roi-card [summaries]="summaries()" />
              <bo-panel-card title="Funil de atribuição">
                <span card-actions class="hint">{{ funnelWindow() }}</span>
                <bo-squad-funnel [funnel]="funnel()" />
                <div class="origins">
                  @for (o of origins; track o) {
                    <div class="origin">
                      <span>{{ originLabel[o] }}</span>
                      <strong>{{ split()[o] }}%</strong>
                    </div>
                  }
                </div>
                <p class="note">Cadastros = contas que chegaram por link ou QR; código digitado entra direto na inscrição. Cliques ainda não são medidos.</p>
              </bo-panel-card>
            </div>

            <div class="grid three">
              <bo-score-leaders-card [leaders]="leaders()" />
              <bo-attention-card [items]="attention()" />
              <bo-cost-card [title]="costTitle()" [lines]="costs()" [totalCents]="kpis().costCents" />
            </div>
          }
        }
      </div>

      @if (toast(); as t) {
        <div class="toast" role="status"><bo-icon name="check" [size]="15" /> {{ t }}</div>
      }

      @if (data(); as d) {
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
    h1 { margin: 0; display: flex; align-items: center; gap: 12px; flex-wrap: wrap; font-family: var(--nx-font-display); font-weight: 800; font-size: 26px; letter-spacing: -0.02em; }
    .pill { display: inline-flex; align-items: center; height: 26px; padding: 0 11px; border-radius: var(--nx-r-pill); border: 1px solid rgba(255, 106, 26, 0.45); background: var(--nx-orange-tint); color: var(--nx-orange-500); font-family: var(--nx-font-mono); font-size: 10px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; white-space: nowrap; }
    .spacer { flex: 1; }
    .big { height: 42px; padding: 0 18px; font-size: 14px; }
    .body { flex: 1; padding: 22px 32px 32px; display: flex; flex-direction: column; gap: 16px; min-width: 0; }
    .push { margin-left: auto; flex: none; }
    .skel { height: 640px; border-radius: var(--nx-r-4); background: var(--nx-surface-0); border: 1px solid var(--nx-line); }
    .kpis { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; }
    .grid { display: grid; gap: 16px; align-items: stretch; }
    .grid.two { grid-template-columns: minmax(0, 1.45fr) minmax(0, 1fr); }
    .grid.three { grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr) minmax(0, 0.85fr); }
    .hint { font-size: 12.5px; font-weight: 600; color: var(--nx-orange-500); }
    .origins { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin-top: auto; padding-top: 18px; }
    .origin { display: flex; flex-direction: column; gap: 4px; padding: 10px 12px; border-radius: var(--nx-r-3); background: var(--nx-surface-1); }
    .origin span { font-family: var(--nx-font-mono); font-size: 9px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); }
    .origin strong { font-family: var(--nx-font-display); font-weight: 800; font-size: 18px; }
    .note { margin: 12px 0 0; font-size: 11.5px; line-height: 1.45; color: var(--nx-text-dim); }
    .toast { position: fixed; right: 24px; bottom: 24px; z-index: 50; display: flex; align-items: center; gap: 8px; padding: 12px 16px; border-radius: var(--nx-r-3); background: var(--nx-surface-1); border: 1px solid rgba(43, 209, 126, 0.4); font-family: var(--nx-font-display); font-weight: 600; font-size: 13px; box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5); }
    @media (max-width: 1280px) {
      .kpis { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .grid.three { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
      .grid.three bo-cost-card { grid-column: 1 / -1; }
    }
    @media (max-width: 1100px) {
      .grid.two, .grid.three { grid-template-columns: minmax(0, 1fr); }
    }
    @media (max-width: 760px) {
      .head, .body { padding-left: 16px; padding-right: 16px; }
      .kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
  `,
})
export class PanelVisaoGeralComponent {
  private readonly repo = inject(OverviewRepository);
  private readonly program = inject(SquadProgramRepository);
  private readonly auth = inject(AuthService);
  private toastTimer: ReturnType<typeof setTimeout> | undefined;

  protected readonly now = new Date();
  protected readonly origins = ORIGINS;
  protected readonly originLabel: Record<CommissionOrigin, string> = { ...ORIGIN_LABEL, qr: 'QR Code' };

  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly loadError = signal('');
  protected readonly data = signal<OverviewState | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly dialogError = signal<string | null>(null);
  protected readonly toast = signal<string | null>(null);
  protected readonly inviteOpen = signal(false);

  private readonly roles = computed(() => new Set(this.auth.roles()));
  /** Admin e Growth convidam; Financeiro (e o resto) só lê. */
  protected readonly canEdit = computed(() => this.auth.isSuperAdmin() || ['admin', 'growth'].some((r) => this.roles().has(r)));

  /** Conversões (liberadas e pagas) no formato das linhas da tela 02. */
  private readonly counted = computed<CountedCommission[]>(() =>
    (this.data()?.commissions ?? []).filter(isConversion).map((c) => ({
      ambassadorId: c.ambassadorId,
      netCents: c.netCents,
      amountCents: c.amountCents,
      registeredAt: c.registeredAt,
    })),
  );
  protected readonly rows = computed(() => {
    const d = this.data();
    return d ? buildRows({ contracts: d.contracts, commissions: this.counted(), rules: d.rules, period: 'pilot', now: this.now }) : [];
  });
  protected readonly progress = computed(() => {
    const d = this.data();
    return d ? cycleProgress(d.cycle, this.now) : null;
  });
  protected readonly kpis = computed(() =>
    overviewKpis({ rows: this.rows(), commissions: this.data()?.commissions ?? [], rules: this.data()?.rules ?? DEFAULT_SQUAD_RULES, now: this.now }),
  );
  protected readonly tierMix = computed(() => tierMixLabel(this.kpis().liveByTier));
  protected readonly conversionsWeek = computed(() => {
    const n = this.kpis().conversionsWeek;
    return n > 0 ? `${n.toLocaleString('pt-BR')} na semana` : null;
  });
  protected readonly revenueWeek = computed(() => {
    const c = this.kpis().revenueWeekCents;
    return c > 0 ? `${brl(c, false)} na semana` : null;
  });
  protected readonly roi = computed(() => roiLabel(this.kpis().roi));
  protected readonly summaries = computed(() => tierSummaries(this.rows()));
  protected readonly funnel = computed(() => funnelOf(this.data()?.commissions ?? [], this.data()?.signups ?? 0));
  protected readonly split = computed(() => originSplit(this.data()?.commissions ?? []));
  protected readonly funnelWindow = computed(() => {
    const p = this.progress();
    if (!p || p.state === 'before') return 'Ciclo ainda não começou';
    return p.state === 'done' ? 'Ciclo inteiro' : `Últimos ${plural(p.day, 'dia', 'dias')}`;
  });
  protected readonly leaders = computed(() => scoreLeaders(this.rows()));
  protected readonly costs = computed(() => costLines(this.kpis()));
  protected readonly costTitle = computed(() => (this.data()?.cycle.id === 'piloto' ? 'Custo no piloto' : 'Custo no ciclo'));
  private readonly seats = computed(() => {
    const d = this.data();
    return d ? freeSeats(d.cycle, this.kpis().live, d.outstandingInvites) : 0;
  });
  protected readonly pilotFull = computed(() => this.data() !== null && this.seats() <= 0);
  protected readonly attention = computed(() => {
    const d = this.data();
    if (!d) return [];
    const released = d.commissions.filter((c) => c.status === 'released');
    return attentionItems({
      rows: this.rows(),
      released: {
        cents: released.reduce((n, c) => n + c.amountCents, 0),
        ambassadors: new Set(released.map((c) => c.ambassadorId)).size,
      },
      payoutDate: d.payoutDate,
      newApplications: d.newApplications,
      pilotFull: this.pilotFull(),
      freeSeats: this.seats(),
      rules: d.rules,
      now: this.now,
    });
  });

  constructor() {
    void this.reload();
    inject(DestroyRef).onDestroy(() => clearTimeout(this.toastTimer));
  }

  async reload(): Promise<void> {
    try {
      this.data.set(await this.repo.load(this.now));
      this.state.set('ready');
    } catch (error) {
      this.loadError.set(callableErrorMessage(error));
      this.state.set('error');
    }
  }

  protected money(cents: number): string {
    return brl(cents, false);
  }

  protected exportCsv(): void {
    downloadText(`squad-visao-geral-${this.data()?.cycle.id ?? 'ciclo'}.csv`, overviewCsv(this.summaries(), this.kpis()));
  }

  protected openInvite(): void {
    this.dialogError.set(null);
    this.inviteOpen.set(true);
  }

  protected async sendInvite(input: SendInviteInput): Promise<void> {
    this.busy.set(true);
    this.dialogError.set(null);
    try {
      const out = await this.program.sendInvite(input);
      this.inviteOpen.set(false);
      this.showToast(
        out.status === 'scheduled' && out.scheduledFor
          ? `Convite agendado para ${dayMonthOfKey(out.scheduledFor)}`
          : 'Convite enviado · acompanhe em Candidaturas',
      );
      await this.reload();
    } catch (error) {
      this.dialogError.set(errorText(error));
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
