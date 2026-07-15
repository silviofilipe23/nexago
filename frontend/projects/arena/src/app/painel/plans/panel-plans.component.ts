import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { ArenaContextService } from '../data/arena-context.service';
import {
  ARENA_PLAN_CATALOG,
  ARENA_PLAN_TIER_ORDER,
  arenaPlanPriceCents,
  maxCourtsFor,
  type ArenaBillingCycle,
  type ArenaPlanTier,
} from '../data/arena-plan.model';
import { arenaFirestore } from '../data/firestore';
import { arenaFunctions } from '../data/functions';
import { formatCentsBRL } from '../stock/product.model';
import { IconComponent } from '../ui/icon.component';
import { ModalComponent } from '../ui/modal.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent } from '../ui/pill.component';
import {
  cancelArenaSubscription,
  createArenaSubscription,
  fetchArenaSubscriptionBilling,
  type ArenaAsaasBillingType,
  type ArenaSubscriptionBilling,
  type CreateArenaSubscriptionResult,
} from './subscription-repository';

const SALES_EMAIL = 'contato@nexago.com.br';

const BILLING_TYPE_LABEL: Record<ArenaAsaasBillingType, string> = {
  PIX: 'Pix',
  CREDIT_CARD: 'Cartão de crédito',
  UNDEFINED: 'A definir no checkout',
};

const CYCLE_LABEL: Record<ArenaBillingCycle, string> = { monthly: 'Mensal', yearly: 'Anual' };

function formatPlanDate(date: Date | null | undefined): string {
  if (!date) return '—';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

interface PlanCardAction {
  label: string;
  disabled: boolean;
  kind: 'current' | 'subscribe' | 'downgrade' | 'blocked';
}

/** Tela Planos & assinatura: lê `arenas/{arenaId}` (planTier/planStatus/planActiveUntil/courtsCount)
 *  e `arenas/{arenaId}/billing/subscription`, e assina/cancela via as únicas duas Cloud Functions
 *  reais de billing (`createArenaSubscription`/`cancelArenaSubscription`, Asaas).
 *
 *  Fora do escopo desta v1 (não existe backend pra isso hoje, ver conversa/memória do projeto):
 *  número de cartão salvo (Asaas nunca nos entrega isso), "trocar cartão", histórico de
 *  faturas, uso de "equipe"/"torneios" (sem schema), e o conceito de múltiplas unidades no
 *  mesmo painel (sem infra de grupo/franquia). Troca direta entre dois planos pagos (Pro↔Parceiro)
 *  também não é segura hoje — a function só sabe "criar assinatura nova", não substituir a atual. */
@Component({
  selector: 'ar-panel-plans',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelShellComponent, PageHeaderComponent, PanelCardComponent, PillComponent, IconComponent, ModalComponent],
  template: `
    <ar-panel-shell>
      <ar-page-header title="Planos &amp; assinatura" [subtitle]="headerSubtitle()">
        <a class="ar-mini-btn" [href]="'mailto:' + salesEmail">
          <ar-icon name="mail" [size]="14" />
          Falar com vendas
        </a>
      </ar-page-header>

      <div class="body">
        @if (arenaNotFound()) {
          <ar-panel-card pad="lg">
            <p class="state-text">Nenhuma arena vinculada à sua conta ainda. Fale com o suporte para concluir o cadastro.</p>
          </ar-panel-card>
        } @else if (arenaLoading()) {
          <ar-panel-card pad="lg">
            <p class="state-text">Carregando plano…</p>
          </ar-panel-card>
        } @else {
          <div class="top-row">
            <ar-panel-card kicker="Assinatura" title="Plano atual" class="sub-card">
              <div class="plan-badge" card-actions>{{ planName() }}{{ billingCycleSuffix() }}</div>

              <div class="price-row">
                <span class="price">{{ priceLabel() }}</span>
              </div>

              @if (statusMessage(); as msg) {
                <p class="status-msg" [class.warn]="isWarnStatus()">{{ msg }}</p>
              }
              @if (billing(); as b) {
                <p class="billing-type-line">Forma de pagamento: {{ billingTypeLabel[b.billingType] }}</p>
              }

              @if (cancelError(); as cerr) {
                <div class="error-banner">{{ cerr }}</div>
              }

              <div class="usage-block">
                <div class="usage-row">
                  <span>Quadras cadastradas</span>
                  <span class="usage-value">{{ courtsCount() }} quadras · {{ courtsMax() == null ? 'ilimitado' : courtsMax() }}</span>
                </div>
                <div class="bar-track">
                  <div class="bar-fill" [class.tone-warn]="courtsBarWarn()" [style.width.%]="courtsPercent()"></div>
                </div>
              </div>

              @if (canCancel()) {
                <button type="button" class="ar-ghost-btn cancel-btn" [disabled]="canceling()" (click)="showCancelConfirm.set(true)">
                  Cancelar assinatura
                </button>
              }
            </ar-panel-card>

            <ar-panel-card title="Precisa de ajuda?" class="help-card">
              <p class="help-text">
                Dúvidas sobre qual plano faz mais sentido pra sua arena? Fale com o time comercial da NexaGO.
              </p>
              <a class="ar-mini-btn ar-mini-btn-primary help-btn" [href]="'mailto:' + salesEmail + '?subject=Planos%20NexaGO%20Arena'">
                <ar-icon name="mail" [size]="14" />
                Agendar conversa
              </a>
            </ar-panel-card>
          </div>

          <ar-panel-card kicker="Comparativo" title="Todos os planos" class="compare-card">
            <div class="plans-row">
              @for (tier of tierOrder; track tier) {
                <div class="plan-col" [class.current]="tier === currentTier()">
                  <div class="plan-col-head">
                    <span class="plan-col-name">{{ catalog[tier].name }}</span>
                    @if (tier === currentTier()) {
                      <ar-pill tone="orange">Plano atual</ar-pill>
                    }
                  </div>
                  <div class="plan-col-price">
                    @if (catalog[tier].free) {
                      Grátis
                    } @else {
                      {{ formatBRL(catalog[tier].monthlyCents) }}<span class="per">/mês</span>
                    }
                  </div>
                  <p class="plan-col-tagline">{{ catalog[tier].tagline }}</p>
                  <ul class="plan-features">
                    @for (f of catalog[tier].features; track f) {
                      <li>
                        <ar-icon name="check" [size]="13" style="color: var(--nx-win); flex: none;" />
                        <span>{{ f }}</span>
                      </li>
                    }
                  </ul>
                  <button
                    type="button"
                    class="ar-mini-btn plan-cta"
                    [class.ar-mini-btn-primary]="planCardAction(tier).kind === 'subscribe'"
                    [disabled]="planCardAction(tier).disabled"
                    (click)="onPlanCardClick(tier)"
                  >
                    {{ planCardAction(tier).label }}
                  </button>
                </div>
              }
            </div>
          </ar-panel-card>
        }
      </div>

      @if (showSubscribe(); as tier) {
        <ar-modal (close)="closeSubscribe()">
          <h2 class="modal-title">Assinar {{ catalog[tier].name }}</h2>

          @if (subscribeResult(); as result) {
            <p class="modal-subtitle">Quase lá — conclua o pagamento pra ativar o plano.</p>

            @if (result.billingType === 'PIX' && result.qrCodeBase64) {
              <img class="pix-qr" [src]="'data:image/png;base64,' + result.qrCodeBase64" alt="QR code Pix" />
              @if (result.qrCode) {
                <div class="pix-copy-row">
                  <code class="pix-copy-code">{{ result.qrCode }}</code>
                  <button type="button" class="ar-mini-btn" (click)="copyPixCode(result.qrCode)">Copiar</button>
                </div>
              }
            } @else if (result.invoiceUrl) {
              <a class="ar-mini-btn ar-mini-btn-primary confirm-btn" [href]="result.invoiceUrl" target="_blank" rel="noopener">
                Ir para pagamento seguro (Asaas)
              </a>
            }

            <div class="actions">
              <button type="button" class="ar-ghost-btn" (click)="closeSubscribe()">Fechar</button>
            </div>
          } @else {
            @if (subscribeError(); as serr) {
              <div class="error-banner">{{ serr }}</div>
            }

            <div class="field-label">Ciclo de cobrança</div>
            <div class="ar-filter-bar filter-block">
              <button type="button" class="ar-chip" [class.active]="subscribeCycle() === 'monthly'" (click)="subscribeCycle.set('monthly')">Mensal</button>
              <button type="button" class="ar-chip" [class.active]="subscribeCycle() === 'yearly'" (click)="subscribeCycle.set('yearly')">
                Anual · 2 meses grátis
              </button>
            </div>

            <div class="field-label">Forma de pagamento</div>
            <div class="ar-filter-bar filter-block">
              <button type="button" class="ar-chip" [class.active]="subscribeBillingType() === 'PIX'" (click)="subscribeBillingType.set('PIX')">Pix</button>
              <button type="button" class="ar-chip" [class.active]="subscribeBillingType() === 'CREDIT_CARD'" (click)="subscribeBillingType.set('CREDIT_CARD')">
                Cartão de crédito
              </button>
            </div>

            <div class="field-label">CNPJ/CPF da arena</div>
            <input
              type="text"
              class="input-box cpf-input"
              placeholder="Só necessário na primeira assinatura"
              [value]="subscribeCpfCnpj()"
              (input)="subscribeCpfCnpj.set($any($event.target).value)"
            />

            <div class="subscribe-price">{{ formatBRL(previewPriceCents(tier)) }} · {{ cycleLabel[subscribeCycle()] }}</div>

            <div class="actions">
              <button type="button" class="ar-ghost-btn" [disabled]="subscribing()" (click)="closeSubscribe()">Cancelar</button>
              <button type="button" class="ar-mini-btn ar-mini-btn-primary confirm-btn" [disabled]="subscribing()" (click)="confirmSubscribe(tier)">
                {{ subscribing() ? 'Gerando cobrança…' : 'Continuar' }}
              </button>
            </div>
          }
        </ar-modal>
      }

      @if (showCancelConfirm()) {
        <ar-modal (close)="showCancelConfirm.set(false)">
          <h2 class="modal-title">Cancelar assinatura?</h2>
          <p class="modal-subtitle">
            Você mantém o acesso {{ planName() }} até {{ formatPlanDate(activeUntil()) }} (fim do período já pago). Depois disso a
            arena volta pro Essencial automaticamente.
          </p>
          @if (cancelError(); as cerr) {
            <div class="error-banner">{{ cerr }}</div>
          }
          <div class="actions">
            <button type="button" class="ar-ghost-btn" [disabled]="canceling()" (click)="showCancelConfirm.set(false)">Voltar</button>
            <button type="button" class="ar-mini-btn danger-btn" [disabled]="canceling()" (click)="confirmCancel()">
              {{ canceling() ? 'Cancelando…' : 'Confirmar cancelamento' }}
            </button>
          </div>
        </ar-modal>
      }
    </ar-panel-shell>
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

    .state-text {
      font-size: 13.5px;
      color: var(--nx-text-mute);
      margin: 0;
    }

    .top-row {
      display: grid;
      grid-template-columns: 1fr 373px;
      gap: 16px;
      align-items: start;
    }

    .plan-badge {
      background: var(--nx-orange-tint);
      border: 1px solid rgba(255, 106, 26, 0.3);
      color: var(--nx-orange-500);
      font-family: var(--nx-font-mono);
      font-size: 10.5px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      padding: 4px 10px;
      border-radius: 999px;
    }

    .price-row {
      margin-top: 14px;
    }

    .price {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 34px;
      letter-spacing: -0.02em;
      color: var(--nx-text);
    }

    .status-msg {
      font-size: 12.5px;
      color: var(--nx-text-dim);
      margin: 10px 0 0;
    }

    .status-msg.warn {
      color: var(--nx-pending);
    }

    .billing-type-line {
      font-size: 12.5px;
      color: var(--nx-text-dim);
      margin: 4px 0 0;
    }

    .error-banner {
      border-radius: var(--nx-r-2);
      border: 1px solid var(--nx-live);
      background: rgba(255, 59, 48, 0.08);
      color: var(--nx-live);
      padding: 10px 14px;
      font-size: 12.5px;
      margin-top: 14px;
    }

    .usage-block {
      margin-top: 22px;
    }

    .usage-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 13px;
      color: var(--nx-text-mute);
      margin-bottom: 8px;
    }

    .usage-value {
      font-family: var(--nx-font-mono);
      color: var(--nx-text-dim);
    }

    .bar-track {
      height: 8px;
      border-radius: 4px;
      background: var(--nx-surface-1);
      overflow: hidden;
    }

    .bar-fill {
      height: 100%;
      border-radius: 4px;
      background: var(--nx-win);
    }

    .bar-fill.tone-warn {
      background: var(--nx-pending);
    }

    .cancel-btn {
      margin-top: 20px;
      width: 100%;
      justify-content: center;
      height: 42px;
    }

    .help-card {
      display: flex;
      flex-direction: column;
    }

    .help-text {
      font-size: 13px;
      line-height: 1.55;
      color: var(--nx-text-mute);
      margin: 0 0 18px;
    }

    .help-btn {
      justify-content: center;
      height: 44px;
    }

    .compare-card {
      flex: none;
    }

    .plans-row {
      display: flex;
      gap: 16px;
      align-items: stretch;
    }

    .plan-col {
      flex: 1;
      min-width: 0;
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-3);
      padding: 20px;
      display: flex;
      flex-direction: column;
    }

    .plan-col.current {
      border-color: var(--nx-orange-500);
      background: rgba(255, 106, 26, 0.04);
    }

    .plan-col-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }

    .plan-col-name {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 17px;
      color: var(--nx-text);
    }

    .plan-col-price {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 26px;
      letter-spacing: -0.02em;
      color: var(--nx-text);
      margin-top: 10px;
    }

    .plan-col-price .per {
      font-size: 13px;
      font-weight: 500;
      color: var(--nx-text-dim);
    }

    .plan-col-tagline {
      font-size: 12.5px;
      color: var(--nx-text-dim);
      margin: 8px 0 16px;
      min-height: 32px;
    }

    .plan-features {
      list-style: none;
      margin: 0 0 20px;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 10px;
      flex: 1;
    }

    .plan-features li {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      font-size: 13px;
      color: var(--nx-text-mute);
    }

    .plan-cta {
      width: 100%;
      justify-content: center;
      height: 44px;
    }

    .modal-title {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 20px;
      letter-spacing: -0.02em;
      color: var(--nx-text);
      margin: 0;
    }

    .modal-subtitle {
      font-size: 13px;
      line-height: 1.55;
      color: var(--nx-text-dim);
      margin: 6px 0 20px;
    }

    .field-label {
      font-family: var(--nx-font-mono);
      font-size: 9px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
      margin-bottom: 10px;
    }

    .filter-block {
      margin-bottom: 18px;
    }

    .input-box {
      width: 100%;
      height: 46px;
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      color: var(--nx-text);
      font-family: var(--nx-font-ui);
      font-size: 14px;
      padding: 0 14px;
      box-sizing: border-box;
    }

    .input-box:focus {
      outline: none;
      border-color: var(--nx-orange-500);
    }

    .cpf-input {
      margin-bottom: 18px;
    }

    .subscribe-price {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 16px;
      color: var(--nx-text);
      margin-bottom: 20px;
    }

    .pix-qr {
      width: 220px;
      height: 220px;
      display: block;
      margin: 0 auto 16px;
      border-radius: var(--nx-r-2);
      border: 1px solid var(--nx-line);
    }

    .pix-copy-row {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 20px;
    }

    .pix-copy-code {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 11px;
      color: var(--nx-text-dim);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-2);
      padding: 10px 12px;
    }

    .actions {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 16px;
      margin-top: 4px;
    }

    .confirm-btn {
      height: 44px;
      padding: 0 20px;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }

    .danger-btn {
      height: 44px;
      padding: 0 20px;
      background: var(--nx-live);
      color: #fff;
      border: none;
    }

    .danger-btn:hover:not(:disabled) {
      background: #ff564c;
    }

    @media (max-width: 1180px) {
      .top-row,
      .plans-row {
        grid-template-columns: 1fr;
        flex-direction: column;
      }
    }
  `,
})
export class PanelPlansComponent {
  private readonly arenaContext = inject(ArenaContextService);

  protected readonly salesEmail = SALES_EMAIL;
  protected readonly catalog = ARENA_PLAN_CATALOG;
  protected readonly tierOrder = ARENA_PLAN_TIER_ORDER;
  protected readonly billingTypeLabel = BILLING_TYPE_LABEL;
  protected readonly cycleLabel = CYCLE_LABEL;
  protected readonly formatBRL = formatCentsBRL;
  protected readonly formatPlanDate = formatPlanDate;

  protected readonly arenaLoading = computed(() => this.arenaContext.loading());
  protected readonly arenaNotFound = computed(() => this.arenaContext.notFound());

  protected readonly billing = signal<ArenaSubscriptionBilling | null>(null);
  protected readonly billingLoading = signal(true);

  protected readonly currentTier = computed<ArenaPlanTier>(() => this.arenaContext.planStatus().tier ?? 'essencial');
  protected readonly rawStatus = computed(() => this.arenaContext.planStatus().status);
  protected readonly activeUntil = computed(() => this.arenaContext.planStatus().activeUntil);
  protected readonly entitled = computed(() => this.arenaContext.entitled());

  protected readonly planName = computed(() => this.catalog[this.currentTier()].name);
  protected readonly billingCycleSuffix = computed(() => {
    const b = this.billing();
    return b && b.tier === this.currentTier() ? ` · ${this.cycleLabel[b.cycle]}` : '';
  });

  protected readonly priceLabel = computed(() => {
    const tier = this.currentTier();
    if (this.catalog[tier].free) return 'Grátis';
    const b = this.billing();
    if (b && b.tier === tier) {
      return `${formatCentsBRL(b.valueCents)}${b.cycle === 'yearly' ? '/ano' : '/mês'}`;
    }
    return `${formatCentsBRL(arenaPlanPriceCents(tier, 'monthly'))}/mês`;
  });

  protected readonly isWarnStatus = computed(() => this.rawStatus() === 'overdue' || this.rawStatus() === 'canceling');

  protected readonly statusMessage = computed<string | null>(() => {
    const status = this.rawStatus();
    const until = this.activeUntil();
    switch (status) {
      case 'overdue': {
        const graceEnd = until ? new Date(until.getTime() + 7 * 24 * 60 * 60 * 1000) : null;
        return `Pagamento atrasado — regularize até ${formatPlanDate(graceEnd)} pra não perder o acesso.`;
      }
      case 'canceling':
        return `Assinatura cancelada — acesso mantido até ${formatPlanDate(until)}.`;
      case 'pending':
        return 'Pagamento em processamento. Se você fechou a página de pagamento, assine de novo pra gerar um novo link.';
      case 'active':
        return until ? `Renovação em ${formatPlanDate(until)}.` : null;
      default:
        return null;
    }
  });

  protected readonly courtsCount = computed(() => this.arenaContext.courtsCount());
  protected readonly courtsMax = computed(() => maxCourtsFor(this.arenaContext.planStatus().tier, this.entitled()));
  protected readonly courtsPercent = computed(() => {
    const max = this.courtsMax();
    if (max == null) return 100;
    if (max <= 0) return 0;
    return Math.min(100, Math.round((this.courtsCount() / max) * 100));
  });
  protected readonly courtsBarWarn = computed(() => {
    const max = this.courtsMax();
    return max != null && this.courtsCount() >= max;
  });

  protected readonly canCancel = computed(() => {
    const tier = this.arenaContext.planStatus().tier;
    const status = this.rawStatus();
    return tier != null && tier !== 'essencial' && (status === 'active' || status === 'overdue' || status === 'pending');
  });

  protected readonly headerSubtitle = computed(() => `Gerencie o plano da ${this.arenaContext.arenaName() ?? 'sua arena'} na plataforma`);

  protected readonly showSubscribe = signal<ArenaPlanTier | null>(null);
  protected readonly subscribeCycle = signal<ArenaBillingCycle>('monthly');
  protected readonly subscribeBillingType = signal<'PIX' | 'CREDIT_CARD'>('PIX');
  protected readonly subscribeCpfCnpj = signal('');
  protected readonly subscribing = signal(false);
  protected readonly subscribeError = signal<string | null>(null);
  protected readonly subscribeResult = signal<CreateArenaSubscriptionResult | null>(null);

  protected readonly showCancelConfirm = signal(false);
  protected readonly canceling = signal(false);
  protected readonly cancelError = signal<string | null>(null);

  constructor() {
    effect(() => {
      const arenaId = this.arenaContext.arenaId();
      if (!arenaId) return;
      void this.loadBilling(arenaId);
    });
  }

  private async loadBilling(arenaId: string): Promise<void> {
    this.billingLoading.set(true);
    try {
      this.billing.set(await fetchArenaSubscriptionBilling(arenaFirestore(), arenaId));
    } catch {
      this.billing.set(null);
    } finally {
      this.billingLoading.set(false);
    }
  }

  protected previewPriceCents(tier: ArenaPlanTier): number {
    return arenaPlanPriceCents(tier, this.subscribeCycle());
  }

  protected planCardAction(tier: ArenaPlanTier): PlanCardAction {
    const current = this.currentTier();
    if (tier === current) {
      return { label: 'Plano atual', disabled: true, kind: 'current' };
    }
    if (tier === 'essencial') {
      return { label: 'Fazer downgrade', disabled: false, kind: 'downgrade' };
    }
    if (current === 'essencial') {
      return { label: `Assinar ${this.catalog[tier].name}`, disabled: false, kind: 'subscribe' };
    }
    return { label: 'Fale com o suporte pra trocar', disabled: true, kind: 'blocked' };
  }

  protected onPlanCardClick(tier: ArenaPlanTier): void {
    const action = this.planCardAction(tier);
    if (action.kind === 'subscribe') {
      this.openSubscribe(tier);
    } else if (action.kind === 'downgrade') {
      this.cancelError.set(null);
      this.showCancelConfirm.set(true);
    }
  }

  protected openSubscribe(tier: ArenaPlanTier): void {
    this.showSubscribe.set(tier);
    this.subscribeCycle.set('monthly');
    this.subscribeBillingType.set('PIX');
    this.subscribeCpfCnpj.set('');
    this.subscribeError.set(null);
    this.subscribeResult.set(null);
  }

  protected closeSubscribe(): void {
    this.showSubscribe.set(null);
    this.subscribeResult.set(null);
  }

  protected async confirmSubscribe(tier: ArenaPlanTier): Promise<void> {
    const arenaId = this.arenaContext.arenaId();
    if (!arenaId) return;

    this.subscribing.set(true);
    this.subscribeError.set(null);
    try {
      const result = await createArenaSubscription(
        arenaFunctions(),
        arenaId,
        tier,
        this.subscribeCycle(),
        this.subscribeBillingType(),
        this.subscribeCpfCnpj().trim() || undefined,
      );
      this.subscribeResult.set(result);
      await this.loadBilling(arenaId);
    } catch (err) {
      this.subscribeError.set(err instanceof Error ? err.message : 'Não foi possível iniciar a assinatura.');
    } finally {
      this.subscribing.set(false);
    }
  }

  protected async copyPixCode(code: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      // clipboard indisponível (permissão/contexto não seguro) — sem fallback, código já fica visível pra copiar manualmente.
    }
  }

  protected async confirmCancel(): Promise<void> {
    const arenaId = this.arenaContext.arenaId();
    if (!arenaId) return;

    this.canceling.set(true);
    this.cancelError.set(null);
    try {
      await cancelArenaSubscription(arenaFunctions(), arenaId);
      await this.loadBilling(arenaId);
      this.showCancelConfirm.set(false);
    } catch (err) {
      this.cancelError.set(err instanceof Error ? err.message : 'Não foi possível cancelar a assinatura.');
    } finally {
      this.canceling.set(false);
    }
  }
}
