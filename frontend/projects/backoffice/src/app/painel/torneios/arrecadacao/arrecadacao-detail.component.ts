import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TournamentReviewsAdminRepository } from '../../avaliacoes/data/tournament-reviews.repository';
import { callableErrorMessage } from '../../data/callable-error';
import { SquadKpiComponent } from '../../squad/ui/squad-kpi.component';
import { IconComponent } from '../../ui/icon.component';
import { PanelCardComponent } from '../../ui/panel-card.component';
import { PanelShellComponent } from '../../ui/panel-shell.component';
import { PillComponent } from '../../ui/pill.component';
import { CONTRACT_STATUS_VIEW, type PlanContract } from '../contratos/data/plan-contracts';
import { PlanContractsRepository } from '../contratos/data/plan-contracts.repository';
import { STATUS_LABEL, STATUS_TONE } from '../data/tournament-status-label';
import type { TournamentRow } from '../data/tournaments.repository';
import { buildFeeRow, rowMode, type FeeRow } from '../taxas/data/fee-rows';
import { TournamentFeesRepository } from '../taxas/data/tournament-fees.repository';
import { FEE_PAYER_LABEL, pctLabel, saoPauloToday } from '../taxas/data/tournament-fees';
import { TournamentRevenueRepository } from './data/tournament-revenue.repository';
import {
  EMPTY_TOTALS,
  contractReceivedCents,
  costMoney,
  costsCents,
  feeBadge,
  feeCents,
  money,
  netCents,
  paymentRows,
  rateLabel,
  signedMoney,
  takeRate,
  totalsOf,
  type PaymentRow,
  type RevenueTotals,
} from './data/tournament-revenue';
import { RevenueBreakdownComponent } from './ui/revenue-breakdown.component';
import { RevenuePaymentsComponent } from './ui/revenue-payments.component';

const DATE = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' });

function share(part: number, whole: number): number {
  return whole > 0 ? Math.max(0, Math.min(100, (part / whole) * 100)) : 0;
}

function pctText(v: number): string {
  return `${v.toFixed(1).replace('.', ',')}%`;
}

/** Arrecadação de um torneio: o resumo, para onde foi o dinheiro e cada pagamento creditado. */
@Component({
  selector: 'bo-arrecadacao-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    PanelShellComponent,
    PanelCardComponent,
    PillComponent,
    IconComponent,
    SquadKpiComponent,
    RevenueBreakdownComponent,
    RevenuePaymentsComponent,
  ],
  template: `
    <bo-panel-shell>
      <header class="head">
        <div class="titles">
          <nav class="crumb" aria-label="Trilha"><a routerLink="/painel/torneios">Torneios</a> › <a routerLink="/painel/torneios/arrecadacao">Arrecadação</a></nav>
          <h1>{{ tournament()?.name ?? 'Torneio' }}</h1>
          @if (tournament(); as t) {
            <div class="meta">
              <span>{{ organizerName() || 'Organizador sem nome' }}</span>
              @if (t.place) { <span aria-hidden="true">·</span><span>{{ t.place }}</span> }
              @if (t.startAt) { <span aria-hidden="true">·</span><span class="mono">{{ date(t.startAt) }}</span> }
              <bo-pill [tone]="statusTone[t.status]">{{ statusLabel[t.status] }}</bo-pill>
              @if (fee()) { <bo-pill [tone]="feeTone()">{{ feeText() }}</bo-pill> }
            </div>
          }
        </div>
        <div class="spacer"></div>
        <a class="bo-mini-btn" routerLink="/painel/torneios/taxas"><bo-icon name="percent" [size]="13" /> Taxas</a>
        <button type="button" class="bo-mini-btn" [disabled]="state() === 'loading'" (click)="load()"><bo-icon name="swap" [size]="13" /> Atualizar</button>
      </header>

      <div class="body">
        @switch (state()) {
          @case ('loading') {
            <div class="kpis" aria-busy="true" aria-label="Carregando arrecadação do torneio">
              @for (s of [0, 1, 2, 3]; track s) { <div class="skel kpi"></div> }
            </div>
            <div class="skel card"></div>
            <div class="skel table"></div>
          }
          @case ('missing') {
            <div class="bo-alert" role="alert">
              <bo-icon name="alert" [size]="16" />
              <span>Torneio não encontrado. Ele pode ter sido excluído.</span>
              <a class="bo-mini-btn push" routerLink="/painel/torneios/arrecadacao">Voltar</a>
            </div>
          }
          @case ('error') {
            <div class="bo-alert" role="alert">
              <bo-icon name="alert" [size]="16" />
              <span>{{ loadError() }}</span>
              <button type="button" class="bo-mini-btn push" (click)="load()">Tentar de novo</button>
            </div>
          }
          @default {
            @if (awaitingCents() > 0) {
              <div class="awaiting" role="status">
                <bo-icon name="clock" [size]="16" />
                <span><strong>{{ money(awaitingCents()) }} em cartões a liberar</strong> a caminho do caixa do organizador. A taxa desses pagamentos entra na receita quando o Asaas liquidar.</span>
              </div>
            }

            <div class="kpis">
              <bo-squad-kpi class="hl" label="Receita líquida NexaGO" [value]="signedMoney(net())" [hint]="rateLabel(rate()) + ' do pago na plataforma'" />
              <bo-squad-kpi label="Taxas cobradas" [value]="money(feeTotal())" [hint]="totals().payments + (totals().payments === 1 ? ' pagamento' : ' pagamentos')" />
              <bo-squad-kpi label="Custos bancados" [value]="costMoney(costs())" hint="Cashback e NexaSquad" />
              <bo-squad-kpi label="Organizador recebeu" [value]="money(totals().organizerNetCents)" hint="Líquido no caixa do torneio" />
            </div>

            <div class="cards">
              <bo-panel-card title="Divisão do pago na plataforma" [kicker]="money(totals().grossCents) + ' em inscrições'">
                @if (totals().grossCents > 0) {
                  <div class="stack" role="img" [attr.aria-label]="splitAria()">
                    <span class="seg org" [style.width.%]="split().organizer"></span>
                    <span class="seg fee" [style.width.%]="split().fee"></span>
                    <span class="seg gw" [style.width.%]="split().gateway"></span>
                  </div>
                  <dl class="lines">
                    <div class="line"><dt><i class="dot org"></i>Organizador</dt><dd>{{ money(totals().organizerNetCents) }}</dd></div>
                    <div class="line"><dt><i class="dot fee"></i>Taxa NexaGO (do organizador)</dt><dd>{{ money(totals().organizerFeeCents) }}</dd></div>
                    <div class="line last"><dt><i class="dot gw"></i>Tarifa do cartão (paga pelo organizador)</dt><dd>{{ money(totals().gatewayCents) }}</dd></div>
                  </dl>
                  @if (totals().athleteFeeCents > 0) {
                    <p class="note">Os atletas pagaram mais {{ money(totals().athleteFeeCents) }} de taxa por cima do preço.</p>
                  }
                } @else {
                  <p class="note">Nenhum pagamento pela plataforma creditado ainda.</p>
                }
              </bo-panel-card>

              <bo-revenue-breakdown [totals]="totals()" />

              <bo-panel-card title="Canal de recebimento">
                <div class="stack" role="img" [attr.aria-label]="channelAria()">
                  <span class="seg fee" [style.width.%]="channel().platform"></span>
                  <span class="seg off" [style.width.%]="channel().off"></span>
                </div>
                <dl class="lines">
                  <div class="line"><dt><i class="dot fee"></i>Pela plataforma</dt><dd>{{ money(totals().grossCents) }}</dd></div>
                  <div class="line last"><dt><i class="dot off"></i>Por fora (sem taxa)</dt><dd>{{ money(offPlatformCents()) }}</dd></div>
                </dl>
                @if (missedFeeCents() > 0) {
                  <p class="note">Se os {{ money(offPlatformCents()) }} tivessem passado pela plataforma, seriam cerca de {{ money(missedFeeCents()) }} a mais de taxa ({{ pct(fee()!.rule.percent) }}).</p>
                }
              </bo-panel-card>
            </div>

            @if (contract(); as c) {
              <bo-panel-card pad="sm">
                <div class="plan">
                  <span class="plan-title">Plano NexaGO · {{ c.plan.name }}</span>
                  <bo-pill [tone]="contractView(c).tone">{{ contractView(c).label }}</bo-pill>
                  <span class="mono">{{ money(contractReceived(c)) }} recebido de {{ money(c.priceCents) }}</span>
                  <span class="dim">Cobrança à mão, fora do caixa — não entra na receita de inscrições acima.</span>
                  <a class="bo-mini-btn push" [routerLink]="['/painel/torneios/contratos', c.id]">Ver contrato</a>
                </div>
              </bo-panel-card>
            }

            <bo-revenue-payments [payments]="payments()" [names]="names()" [fileName]="'arrecadacao-' + id" />
          }
        }
      </div>
    </bo-panel-shell>
  `,
  styles: `
    .head { display: flex; align-items: flex-end; gap: 10px; padding: 18px 32px; border-bottom: 1px solid var(--nx-line); flex-wrap: wrap; }
    .titles { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
    .crumb { font-family: var(--nx-font-mono); font-size: 10px; font-weight: 500; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); }
    .crumb a { color: inherit; text-decoration: none; }
    .crumb a:hover { color: var(--nx-text); }
    h1 { margin: 0; font-family: var(--nx-font-display); font-weight: 800; font-size: 21px; letter-spacing: -0.02em; }
    .meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 12.5px; color: var(--nx-text-mute); }
    .mono { font-family: var(--nx-font-mono); font-size: 12px; }
    .spacer { flex: 1; }
    a.bo-mini-btn { text-decoration: none; }
    .body { flex: 1; padding: 24px 32px 40px; display: flex; flex-direction: column; gap: 16px; min-width: 0; }
    .push { margin-left: auto; flex: none; }
    .awaiting { display: flex; align-items: center; gap: 10px; padding: 12px 16px; border-radius: var(--nx-r-3); background: rgba(244, 197, 67, 0.07); border: 1px solid rgba(244, 197, 67, 0.28); font-size: 13px; line-height: 1.45; }
    .awaiting bo-icon { color: var(--nx-pending); flex: none; }
    .awaiting strong { font-family: var(--nx-font-display); }
    .kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
    .kpis .hl { background: rgba(255, 106, 26, 0.08); border-color: rgba(255, 106, 26, 0.35); }
    .cards { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
    .stack { display: flex; height: 14px; margin-top: 6px; border-radius: var(--nx-r-pill); overflow: hidden; background: var(--nx-surface-1); }
    .seg { display: block; height: 100%; }
    .org { background: #3a3a42; }
    .fee { background: var(--nx-orange-500); }
    .gw { background: #7db4ff; }
    .off { background: var(--nx-pending); }
    .lines { margin: 8px 0 0; display: flex; flex-direction: column; }
    .line { display: flex; justify-content: space-between; gap: 12px; padding: 9px 0; border-bottom: 1px solid var(--nx-line); font-size: 13px; }
    .line.last { border-bottom: none; }
    dt { margin: 0; display: flex; align-items: center; gap: 8px; }
    dd { margin: 0; font-family: var(--nx-font-mono); font-size: 12.5px; white-space: nowrap; }
    .dot { width: 9px; height: 9px; border-radius: 3px; flex: none; }
    .note { margin: 6px 0 0; font-size: 12px; line-height: 1.5; color: var(--nx-text-mute); }
    .plan { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; font-size: 12.5px; }
    .plan-title { font-family: var(--nx-font-display); font-weight: 700; font-size: 14px; }
    .dim { color: var(--nx-text-dim); }
    .skel { border-radius: var(--nx-r-4); background: var(--nx-surface-0); border: 1px solid var(--nx-line); }
    .skel.kpi { height: 86px; border-radius: var(--nx-r-3); }
    .skel.card { height: 260px; }
    .skel.table { height: 420px; }
    @media (max-width: 1280px) {
      .kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .cards { grid-template-columns: minmax(0, 1fr); }
    }
    @media (max-width: 760px) {
      .head, .body { padding-left: 16px; padding-right: 16px; }
      .kpis { grid-template-columns: minmax(0, 1fr); }
    }
  `,
})
export class ArrecadacaoDetailComponent {
  private readonly repo = inject(TournamentRevenueRepository);
  private readonly fees = inject(TournamentFeesRepository);
  private readonly contracts = inject(PlanContractsRepository);
  private readonly reviews = inject(TournamentReviewsAdminRepository);
  protected readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id') ?? '';
  private readonly today = saoPauloToday();

  protected readonly statusLabel = STATUS_LABEL;
  protected readonly statusTone = STATUS_TONE;
  protected readonly money = money;
  protected readonly signedMoney = signedMoney;
  protected readonly costMoney = costMoney;
  protected readonly rateLabel = rateLabel;
  protected readonly pct = pctLabel;
  protected readonly contractReceived = contractReceivedCents;
  protected readonly contractView = (c: PlanContract) => CONTRACT_STATUS_VIEW[c.status];

  protected readonly state = signal<'loading' | 'ready' | 'missing' | 'error'>('loading');
  protected readonly loadError = signal('');
  protected readonly tournament = signal<TournamentRow | null>(null);
  protected readonly organizerName = signal<string | null>(null);
  protected readonly fee = signal<FeeRow | null>(null);
  protected readonly totals = signal<RevenueTotals>(EMPTY_TOTALS);
  protected readonly payments = signal<readonly PaymentRow[]>([]);
  protected readonly offPlatformCents = signal(0);
  protected readonly awaitingCents = signal(0);
  protected readonly contract = signal<PlanContract | null>(null);
  /** `null` = nomes ainda carregando. */
  protected readonly names = signal<ReadonlyMap<string, string> | null>(null);

  protected readonly net = computed(() => netCents(this.totals()));
  protected readonly feeTotal = computed(() => feeCents(this.totals()));
  protected readonly costs = computed(() => costsCents(this.totals()));
  protected readonly rate = computed(() => takeRate(this.totals()));

  protected readonly feeTone = computed(() => feeBadge(this.fee()).tone);
  protected readonly feeText = computed(() => {
    const f = this.fee();
    if (!f) return '';
    const badge = feeBadge(f).label;
    return rowMode(f) === 'isento' ? badge : `Taxa ${badge} · quem paga: ${FEE_PAYER_LABEL[f.rule.payer].toLowerCase()}`;
  });

  protected readonly split = computed(() => {
    const t = this.totals();
    return {
      organizer: share(t.organizerNetCents, t.grossCents),
      fee: share(t.organizerFeeCents, t.grossCents),
      gateway: share(t.gatewayCents, t.grossCents),
    };
  });
  protected readonly splitAria = computed(() => {
    const s = this.split();
    return `Organizador ${pctText(s.organizer)}, taxa NexaGO ${pctText(s.fee)}, tarifa do cartão ${pctText(s.gateway)}`;
  });

  protected readonly channel = computed(() => {
    const whole = this.totals().grossCents + this.offPlatformCents();
    return { platform: share(this.totals().grossCents, whole), off: share(this.offPlatformCents(), whole) };
  });
  protected readonly channelAria = computed(
    () => `Pela plataforma ${pctText(this.channel().platform)}, por fora ${pctText(this.channel().off)}`,
  );

  /** Estimativa pelo % vigente (sem o piso, que é por pagamento e não dá para saber por fora). */
  protected readonly missedFeeCents = computed(() => {
    const percent = this.fee()?.rule.percent ?? 0;
    return Math.round((this.offPlatformCents() * percent) / 100);
  });

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.state.set('loading');
    try {
      const [found, wallet, lines, commissions, defaults, overrides, contract] = await Promise.all([
        this.repo.tournament(this.id),
        this.repo.wallet(this.id),
        this.repo.ledger(this.id),
        this.repo.commissionsOf(this.id),
        this.fees.defaults(),
        this.fees.overrides(),
        // Contrato é extra: falhar aqui não pode esconder a arrecadação.
        this.contracts.get(this.id).catch(() => null),
      ]);
      if (!found) {
        this.state.set('missing');
        return;
      }
      const { row } = found;
      const organizer = row.managerId ? (await this.fees.organizers([row.managerId])).get(row.managerId) : undefined;
      const commissionCents = commissions.reduce((s, c) => s + c.amountCents, 0);

      this.tournament.set(row);
      this.organizerName.set(organizer?.name ?? null);
      this.fee.set(buildFeeRow(row, overrides.get(row.id), organizer, defaults.rule, this.today));
      this.totals.set(totalsOf(lines, commissionCents));
      this.payments.set(paymentRows(lines, commissions));
      this.offPlatformCents.set(found.offPlatformCents);
      this.awaitingCents.set(wallet?.awaitingCents ?? 0);
      this.contract.set(contract);
      this.state.set('ready');
      void this.loadNames(lines.map((l) => l.payerUid).filter((uid): uid is string => !!uid));
    } catch (error) {
      this.loadError.set(callableErrorMessage(error));
      this.state.set('error');
    }
  }

  /** Nomes depois da tela: falha deixa o uid encurtado, não derruba nada. */
  private async loadNames(uids: string[]): Promise<void> {
    this.names.set(null);
    try {
      this.names.set(await this.reviews.profileNames(uids));
    } catch {
      this.names.set(new Map());
    }
  }

  protected date(d: Date): string {
    return DATE.format(d);
  }
}
