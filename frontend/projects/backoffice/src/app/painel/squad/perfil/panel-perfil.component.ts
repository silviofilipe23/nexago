import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../auth/auth.service';
import { callableErrorMessage } from '../../data/callable-error';
import { IconComponent } from '../../ui/icon.component';
import { PanelCardComponent } from '../../ui/panel-card.component';
import { PanelShellComponent } from '../../ui/panel-shell.component';
import { TIER_LABELS, type SquadTier } from '../niveis-regras/data/squad-rules';
import { TierPillComponent } from '../niveis-regras/ui/tier-pill.component';
import { brl, dayMonthOfKey, spDateKey } from '../comissoes/data/commission';
import { SquadProgramRepository, type ContractActionInput, type CountedCommission } from '../data/squad-program.repository';
import { funnelOf, isConversion, weekOf } from '../data/squad-metrics';
import { buildRows, roiLabel, statusLabel } from '../embaixadores/data/ambassador';
import { STATUS_TONE } from '../embaixadores/ui/ambassadors-table.component';
import { ContractActionDialogComponent, type ContractDialogMode } from '../embaixadores/ui/contract-action-dialog.component';
import { CostCardComponent } from '../ui/cost-card.component';
import { SquadFunnelComponent } from '../ui/squad-funnel.component';
import { SquadKpiComponent } from '../ui/squad-kpi.component';
import {
  amendmentLines,
  benefitsOf,
  contractLines,
  conversionLines,
  costParts,
  factsFromApplication,
  identityLine,
  promotionView,
  roiGoalHint,
  scoreParts,
  scoreRank,
} from './data/profile';
import { ProfileRepository, type ProfileState } from './data/profile.repository';
import { BenefitsCardComponent } from './ui/benefits-card.component';
import { ContractCardComponent } from './ui/contract-card.component';
import { ConversionsCardComponent } from './ui/conversions-card.component';
import { ProfileIdentityComponent } from './ui/profile-identity.component';
import { PromotionProgressCardComponent } from './ui/promotion-progress-card.component';
import { ScorePartsCardComponent } from './ui/score-parts-card.component';

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
 * Squad › Embaixadores › Perfil (tela 03). Os números vêm da mesma linha da tela 02; as ações do
 * cabeçalho (pausar, mudar nível, promover, encerrar) usam o mesmo modal e a mesma callable.
 */
@Component({
  selector: 'bo-panel-perfil',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PanelShellComponent,
    PanelCardComponent,
    IconComponent,
    RouterLink,
    TierPillComponent,
    SquadKpiComponent,
    SquadFunnelComponent,
    CostCardComponent,
    ProfileIdentityComponent,
    PromotionProgressCardComponent,
    ScorePartsCardComponent,
    BenefitsCardComponent,
    ContractCardComponent,
    ConversionsCardComponent,
    ContractActionDialogComponent,
  ],
  template: `
    <bo-panel-shell>
      <header class="head">
        <div class="titles">
          <nav class="crumb" aria-label="Caminho">
            <a routerLink="/painel/squad/visao-geral">Squad</a>
            <bo-icon name="chevron-right" [size]="10" />
            <a routerLink="/painel/squad/embaixadores">Embaixadores</a>
          </nav>
          <h1>
            {{ contract()?.name ?? 'Embaixador' }}
            @if (contract(); as c) {
              <bo-tier-pill [tier]="c.tier" />
              @if (row()) {
                <span class="status" [class]="'status ' + tone()">{{ status() }}</span>
              }
              @if (c.pendingTier) {
                <span class="pending" title="Aditivo enviado: o nível muda quando o atleta aceitar no app">
                  → {{ tierLabels[c.pendingTier] }} · aceite pendente
                </span>
              }
            }
          </h1>
        </div>
        <div class="spacer"></div>
        @if (canEdit() && contract(); as c) {
          @if (c.state !== 'ended') {
            @if (c.state === 'paused') {
              <button type="button" class="bo-mini-btn big" [disabled]="busy()" (click)="resume()">Retomar</button>
            } @else {
              <button type="button" class="bo-mini-btn big" [disabled]="busy()" (click)="openDialog('pause')">Pausar</button>
            }
            <button type="button" class="bo-mini-btn big" [disabled]="busy()" (click)="openDialog('changeTier')">Mudar nível</button>
            <button type="button" class="bo-mini-btn big danger" [disabled]="busy()" (click)="openDialog('end')">Encerrar</button>
            @if (promoteTo(); as to) {
              <button type="button" class="bo-mini-btn bo-mini-btn-primary big" [disabled]="busy()" (click)="openDialog('changeTier', to)">
                <bo-icon name="star" [size]="14" /> Promover a {{ tierShort(to) }}
              </button>
            }
          }
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
            <div class="skel" aria-busy="true" aria-label="Carregando o perfil"></div>
          }
          @case ('error') {
            <div class="bo-alert" role="alert">
              <bo-icon name="alert" [size]="16" />
              <span>{{ loadError() }}</span>
              <button type="button" class="bo-mini-btn push" (click)="reload()">Tentar de novo</button>
            </div>
          }
          @case ('missing') {
            <div class="empty">
              <bo-icon name="users" [size]="22" />
              <p>Nenhum contrato de embaixador para este atleta</p>
              <a class="bo-mini-btn" routerLink="/painel/squad/embaixadores">Voltar para Embaixadores</a>
            </div>
          }
          @default {
            @if (data(); as d) {
              @if (row(); as r) {
                <div class="cols">
                  <div class="col">
                    <bo-profile-identity
                      [uid]="d.contract.uid"
                      [name]="d.contract.name"
                      [line]="identity()"
                      [code]="d.contract.code"
                      [score]="d.contract.score"
                      [rank]="rank()"
                      (copied)="copy($event)"
                    />
                    <div class="kpis">
                      <bo-squad-kpi label="Conversões pagas" [value]="'' + r.conversions" [delta]="weekDelta()" />
                      <bo-squad-kpi label="Receita gerada" [value]="money(r.revenueCents)" />
                      <bo-squad-kpi label="Custo total" [value]="money(r.costCents)" [hint]="costHint()" />
                      <bo-squad-kpi label="Ambassador ROI" [value]="roi()" [hint]="roiHint()" />
                    </div>
                    <div class="pair">
                      <bo-panel-card [title]="'Funil ' + funnelOwner()">
                        <bo-squad-funnel class="dense" [funnel]="funnel()" />
                      </bo-panel-card>
                      <bo-cost-card title="Composição do custo" [lines]="costs()" [totalCents]="r.costCents" [bars]="false" />
                    </div>
                    <bo-conversions-card [lines]="conversions()" />
                  </div>
                  <div class="col">
                    <bo-promotion-progress-card [view]="promotion()" />
                    <bo-score-parts-card [parts]="parts()" />
                    <bo-benefits-card [benefits]="benefits()" [kicker]="benefitsKicker()" />
                    <bo-contract-card [lines]="lines()" [amendments]="amendments()" />
                  </div>
                </div>
              }
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
          [contract]="d.contract"
          [rules]="d.rules"
          [rulesVersion]="d.rulesVersion"
          [initialTier]="dialogTier()"
          [busy]="busy()"
          [error]="dialogError()"
          [now]="now"
          (submitted)="runAction($event)"
          (dismissed)="dialog.set(null)"
        />
      }
    </bo-panel-shell>
  `,
  styles: `
    .head { display: flex; align-items: center; gap: 10px; padding: 18px 32px; border-bottom: 1px solid var(--nx-line); flex-wrap: wrap; }
    .titles { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
    .crumb { display: flex; align-items: center; gap: 6px; font-family: var(--nx-font-mono); font-size: 10px; font-weight: 500; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); }
    .crumb a { color: inherit; text-decoration: none; }
    .crumb a:hover { color: var(--nx-text); }
    h1 { margin: 0; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-family: var(--nx-font-display); font-weight: 800; font-size: 24px; letter-spacing: -0.02em; }
    .status { display: inline-flex; align-items: center; height: 26px; padding: 0 11px; border-radius: var(--nx-r-pill); border: 1px solid currentColor; font-family: var(--nx-font-mono); font-size: 10px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; white-space: nowrap; }
    .status.green { color: var(--nx-win); background: rgba(43, 209, 126, 0.08); border-color: rgba(43, 209, 126, 0.35); }
    .status.orange { color: var(--nx-orange-500); background: var(--nx-orange-tint); border-color: rgba(255, 106, 26, 0.45); }
    .status.yellow { color: var(--nx-pending); background: rgba(244, 197, 67, 0.08); border-color: rgba(244, 197, 67, 0.4); }
    .status.red { color: var(--nx-live); background: rgba(255, 59, 48, 0.08); border-color: rgba(255, 59, 48, 0.4); }
    .status.neutral { color: var(--nx-text-mute); border-color: var(--nx-line-strong); }
    .pending { font-family: var(--nx-font-ui); font-size: 12px; font-weight: 500; letter-spacing: 0; color: var(--nx-text-dim); }
    .spacer { flex: 1; }
    .big { height: 42px; padding: 0 18px; font-size: 14px; }
    .danger { color: var(--nx-live); }
    .body { flex: 1; padding: 22px 32px 32px; display: flex; flex-direction: column; gap: 16px; min-width: 0; }
    .push { margin-left: auto; flex: none; }
    .skel { height: 720px; border-radius: var(--nx-r-4); background: var(--nx-surface-0); border: 1px solid var(--nx-line); }
    .empty { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 56px 16px; border-radius: var(--nx-r-4); border: 1px dashed var(--nx-line-strong); color: var(--nx-text-dim); text-align: center; }
    .empty p { margin: 6px 0 8px; font-family: var(--nx-font-display); font-weight: 600; font-size: 15px; color: var(--nx-text); }
    .cols { display: grid; grid-template-columns: minmax(0, 1.55fr) minmax(0, 1fr); gap: 16px; align-items: start; }
    .col { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
    .kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
    .pair { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 16px; }
    .toast { position: fixed; right: 24px; bottom: 24px; z-index: 50; display: flex; align-items: center; gap: 8px; padding: 12px 16px; border-radius: var(--nx-r-3); background: var(--nx-surface-1); border: 1px solid rgba(43, 209, 126, 0.4); font-family: var(--nx-font-display); font-weight: 600; font-size: 13px; box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5); }
    @media (max-width: 1280px) {
      .kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
    @media (max-width: 1100px) {
      .cols, .pair { grid-template-columns: minmax(0, 1fr); }
    }
    @media (max-width: 760px) {
      .head, .body { padding-left: 16px; padding-right: 16px; }
    }
  `,
})
export class PanelPerfilComponent {
  /** `:uid` da rota (`withComponentInputBinding`). */
  readonly uid = input.required<string>();

  private readonly repo = inject(ProfileRepository);
  private readonly program = inject(SquadProgramRepository);
  private readonly auth = inject(AuthService);
  private toastTimer: ReturnType<typeof setTimeout> | undefined;

  protected readonly now = new Date();
  protected readonly tierLabels = TIER_LABELS;

  protected readonly state = signal<'loading' | 'ready' | 'missing' | 'error'>('loading');
  protected readonly loadError = signal('');
  protected readonly data = signal<ProfileState | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly dialogError = signal<string | null>(null);
  protected readonly toast = signal<string | null>(null);
  protected readonly dialog = signal<ContractDialogMode | null>(null);
  protected readonly dialogTier = signal<SquadTier | null>(null);

  private readonly roles = computed(() => new Set(this.auth.roles()));
  /** Admin e Growth editam; Financeiro (e o resto) só lê. */
  protected readonly canEdit = computed(() => this.auth.isSuperAdmin() || ['admin', 'growth'].some((r) => this.roles().has(r)));

  protected readonly contract = computed(() => this.data()?.contract ?? null);
  /** A linha da tela 02 deste embaixador (piloto inteiro): números e status batem com a lista. */
  protected readonly row = computed(() => {
    const d = this.data();
    if (!d) return null;
    const counted: CountedCommission[] = d.commissions.filter(isConversion).map((c) => ({
      ambassadorId: c.ambassadorId,
      netCents: c.netCents,
      amountCents: c.amountCents,
      registeredAt: c.registeredAt,
    }));
    return buildRows({ contracts: [d.contract], commissions: counted, rules: d.rules, period: 'pilot', now: this.now })[0] ?? null;
  });
  protected readonly status = computed(() => {
    const r = this.row();
    return r ? statusLabel(r.status) : '';
  });
  protected readonly tone = computed(() => {
    const r = this.row();
    return r ? STATUS_TONE[r.status] : 'neutral';
  });
  /** "Promover a Pro" só aparece para quem já bate o critério (status Elegível). */
  protected readonly promoteTo = computed<SquadTier | null>(() => {
    const r = this.row();
    const d = this.data();
    if (!r || !d || r.status !== 'eligible' || r.contract.pendingTier) return null;
    return d.rules.promotion.find((p) => p.from === r.contract.tier)?.to ?? null;
  });

  private readonly facts = computed(() => factsFromApplication(this.data()?.application ?? null));
  protected readonly identity = computed(() => {
    const c = this.contract();
    return c ? identityLine(c, this.facts()) : '';
  });
  protected readonly rank = computed(() => {
    const d = this.data();
    return d ? scoreRank(d.contract.uid, d.contracts) : null;
  });
  protected readonly weekDelta = computed(() => {
    const n = weekOf(this.data()?.commissions ?? [], this.now).conversions;
    return n > 0 ? `${n} na semana` : null;
  });
  protected readonly costs = computed(() => {
    const r = this.row();
    const d = this.data();
    return r && d ? costParts(r, d.rules).map((p) => ({ ...p, pct: 0 })) : [];
  });
  protected readonly costHint = computed(() => {
    const [commission, kit] = this.costs();
    // Sem "R$" para caber na dica, como no desenho ("324 comissão + 120 kit").
    const n = (cents: number | null) => Math.round((cents ?? 0) / 100).toLocaleString('pt-BR');
    return commission && kit ? `${n(commission.cents)} comissão + ${n(kit.cents)} kit` : null;
  });
  protected readonly roi = computed(() => roiLabel(this.row()?.roi ?? null));
  protected readonly roiHint = computed(() => {
    const d = this.data();
    return d ? roiGoalHint(d.contract.tier, d.rules) : null;
  });
  protected readonly funnelOwner = computed(() => {
    const name = this.contract()?.name.trim().split(/\s+/)[0] ?? '';
    return name ? `de ${name}` : 'do embaixador';
  });
  protected readonly funnel = computed(() => funnelOf(this.data()?.commissions ?? [], this.data()?.signups ?? 0));
  protected readonly conversions = computed(() => conversionLines(this.data()?.commissions ?? [], this.now));
  protected readonly promotion = computed(() => {
    const r = this.row();
    const d = this.data();
    return r && d ? promotionView(r, d.rules) : { kind: 'stay' as const, tier: 'ath' as const, criteria: [], watch: [] };
  });
  protected readonly parts = computed(() => {
    const d = this.data();
    return d ? scoreParts(d.rules) : [];
  });
  protected readonly benefits = computed(() => {
    const d = this.data();
    if (!d) return [];
    return benefitsOf(d.frozenPackage ?? d.rules.tiers[d.contract.tier], d.contract);
  });
  protected readonly benefitsKicker = computed(() => {
    const d = this.data();
    if (!d) return '';
    return d.frozenPackage && d.contract.rulesVersion !== null
      ? `Regras v${d.contract.rulesVersion}.0 · ${TIER_LABELS[d.contract.tier]}`
      : `Pacote vigente · ${TIER_LABELS[d.contract.tier]}`;
  });
  protected readonly lines = computed(() => {
    const c = this.contract();
    return c ? contractLines(c, this.now) : [];
  });
  protected readonly amendments = computed(() => {
    const c = this.contract();
    return c ? amendmentLines(c) : [];
  });

  constructor() {
    // Trocar de perfil (link do Score, voltar/avançar) reaproveita o componente: recarrega pelo uid.
    effect(() => {
      const uid = this.uid();
      untracked(() => {
        this.state.set('loading');
        void this.reload(uid);
      });
    });
    inject(DestroyRef).onDestroy(() => clearTimeout(this.toastTimer));
  }

  async reload(uid = this.uid()): Promise<void> {
    try {
      const d = await this.repo.load(uid);
      if (uid !== this.uid()) return;
      this.data.set(d);
      this.state.set(d ? 'ready' : 'missing');
    } catch (error) {
      this.loadError.set(callableErrorMessage(error));
      this.state.set('error');
    }
  }

  protected money(cents: number): string {
    return brl(cents, false);
  }

  /** "Pro Ambassador" vira "Pro" no botão, como no desenho. */
  protected tierShort(tier: SquadTier): string {
    return tier === 'pro' ? 'Pro' : TIER_LABELS[tier];
  }

  protected copy(text: string): void {
    void navigator.clipboard
      ?.writeText(text)
      .then(() => this.showToast(text.startsWith('http') ? 'Link copiado' : `Código ${text} copiado`))
      .catch(() => this.error.set('Não deu para copiar.'));
  }

  protected openDialog(mode: ContractDialogMode, tier: SquadTier | null = null): void {
    this.dialogError.set(null);
    this.dialogTier.set(tier);
    this.dialog.set(mode);
  }

  protected resume(): void {
    const c = this.contract();
    if (c) void this.run({ action: 'resume' }, `${c.name} voltou a ativo`);
  }

  protected async runAction(input: ContractActionInput): Promise<void> {
    const c = this.contract();
    if (!c) return;
    const done =
      input.action === 'changeTier'
        ? `Aditivo enviado a ${c.name} · aguardando aceite no app`
        : input.action === 'pause'
          ? `${c.name} pausado${input.until ? ` até ${dayMonthOfKey(input.until)}` : ''}`
          : input.action === 'end'
            ? input.effectiveDate === spDateKey(this.now)
              ? `Contrato de ${c.name} encerrado`
              : `Contrato de ${c.name} encerra em ${dayMonthOfKey(input.effectiveDate)}`
            : '';
    if (await this.run(input, done)) this.dialog.set(null);
  }

  private async run(input: ContractActionInput, done: string): Promise<boolean> {
    const c = this.contract();
    if (!c) return false;
    this.busy.set(true);
    this.dialogError.set(null);
    try {
      await this.program.updateContract(c.uid, input);
      this.showToast(done);
      await this.reload();
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
